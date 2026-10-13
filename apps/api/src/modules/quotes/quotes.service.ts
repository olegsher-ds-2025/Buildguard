import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, type Quote, type QuoteComparison } from "@prisma/client";
import type {
  CreateQuoteUploadResponse,
  ExtractedQuote,
  QuoteComparisonAnalysis,
  QuoteComparisonSummary,
  QuoteSummary,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../storage/storage.service";
import { ConfirmQuoteUploadDto, CreateQuoteComparisonDto, CreateQuoteUploadDto } from "./dto/quotes.dto";
import { QuoteAnalysisProvider } from "./quote-analysis.provider";
import { assessRisks } from "./quote-risks";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_REQUIREMENTS = 20;
const REQUIREMENT_MAX_CHARS = 300;
const EXTRACTION_CONCURRENCY = 3;

type ComparisonRow = QuoteComparison & { quotes: Quote[] };

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly provider: QuoteAnalysisProvider,
  ) {}

  async create(projectId: string, dto: CreateQuoteComparisonDto, userId: string): Promise<QuoteComparisonSummary> {
    const row = await this.prisma.quoteComparison.create({
      data: { projectId, title: dto.title, stageNo: dto.stageNo, createdByUserId: userId },
      include: { quotes: true },
    });
    return this.toSummary(row);
  }

  async list(projectId: string): Promise<QuoteComparisonSummary[]> {
    const rows = await this.prisma.quoteComparison.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { quotes: { orderBy: { createdAt: "asc" } } },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(projectId: string, comparisonId: string): Promise<QuoteComparisonSummary> {
    return this.toSummary(await this.findOwned(projectId, comparisonId));
  }

  async createUpload(projectId: string, comparisonId: string, dto: CreateQuoteUploadDto): Promise<CreateQuoteUploadResponse> {
    await this.findOwned(projectId, comparisonId);
    const quoteId = randomUUID();
    const uploadUrl = await this.storage.getUploadUrl(this.objectKey(projectId, comparisonId, quoteId), dto.contentType);
    return { quoteId, uploadUrl };
  }

  /** Persists the quote only once the file is really in storage. */
  async confirmUpload(
    projectId: string,
    comparisonId: string,
    quoteId: string,
    dto: ConfirmQuoteUploadDto,
  ): Promise<QuoteComparisonSummary> {
    await this.findOwned(projectId, comparisonId);
    const objectKey = this.objectKey(projectId, comparisonId, quoteId);
    if (!(await this.storage.objectExists(objectKey))) {
      throw new BadRequestException("No file was found at the expected storage location — upload it first.");
    }
    await this.prisma.quote.upsert({
      where: { id: quoteId },
      create: {
        id: quoteId,
        comparisonId,
        filename: dto.filename,
        contentType: dto.contentType,
        objectKey,
        supplierName: dto.supplierName,
      },
      update: {},
    });
    return this.get(projectId, comparisonId);
  }

  /**
   * Reads every quote that has not been read yet, then compares the readable ones.
   * One unreadable file fails that quote only; the rest still get compared.
   */
  async analyze(projectId: string, comparisonId: string, userId: string): Promise<QuoteComparisonSummary> {
    const comparison = await this.findOwned(projectId, comparisonId);
    if (comparison.quotes.length === 0) throw new BadRequestException("Upload at least one quote first");

    const pending = comparison.quotes.filter((q) => q.status !== "extracted");
    for (let i = 0; i < pending.length; i += EXTRACTION_CONCURRENCY) {
      await Promise.all(pending.slice(i, i + EXTRACTION_CONCURRENCY).map((q) => this.extractOne(q)));
    }

    const fresh = await this.findOwned(projectId, comparisonId);
    const readable = fresh.quotes.filter((q) => q.status === "extracted" && q.extraction);
    let analysis: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
    if (readable.length >= 2) {
      const { requirements, stageTitle } = await this.requirementsForStage(comparison.stageNo);
      const output = await this.provider.compare({
        quotes: readable.map((q) => ({ id: q.id, extraction: q.extraction as unknown as ExtractedQuote })),
        requirements,
        stageTitle,
      });
      const stored: QuoteComparisonAnalysis = { quoteIds: readable.map((q) => q.id), ...output };
      analysis = stored as unknown as Prisma.InputJsonValue;
    }

    await this.prisma.quoteComparison.update({
      where: { id: comparisonId },
      data: { analysis, analyzedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "quote_comparison_analyzed",
      entityType: "quote_comparison",
      entityId: comparisonId,
      projectId,
      metadata: { quotes: comparison.quotes.length, readable: readable.length },
    });
    return this.get(projectId, comparisonId);
  }

  private async extractOne(quote: Quote): Promise<void> {
    try {
      const buffer = await this.storage.getObjectBuffer(quote.objectKey);
      if (!buffer) throw new Error("The file could not be read from storage");
      if (buffer.length > MAX_FILE_BYTES) throw new Error("The file is larger than 20 MB");
      const extraction = await this.provider.extract({ buffer, contentType: quote.contentType, filename: quote.filename });
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: "extracted",
          extraction: extraction as unknown as Prisma.InputJsonValue,
          error: null,
          supplierName: quote.supplierName ?? extraction.supplierName,
        },
      });
    } catch (err) {
      this.logger.warn(`quote ${quote.id} could not be read: ${err instanceof Error ? err.message : String(err)}`);
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: { status: "failed", error: err instanceof Error ? err.message : "unknown error" },
      });
    }
  }

  /** The stage's professional requirements: the checks that need a lab, a written approval, or a document. */
  private async requirementsForStage(stageNo: number | null): Promise<{ requirements: string[]; stageTitle: string | null }> {
    if (!stageNo) return { requirements: [], stageTitle: null };
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { ownerUserId: null, stageNo },
      include: {
        items: { where: { itemType: { in: ["lab_test", "written_approval", "document"] } }, orderBy: { sortOrder: "asc" } },
        holdPoints: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!template) return { requirements: [], stageTitle: null };
    const texts = [...template.holdPoints.map((h) => h.text), ...template.items.map((i) => i.text)]
      .map((t) => t.slice(0, REQUIREMENT_MAX_CHARS))
      .slice(0, MAX_REQUIREMENTS);
    return { requirements: texts, stageTitle: template.title };
  }

  private async findOwned(projectId: string, comparisonId: string): Promise<ComparisonRow> {
    const row = await this.prisma.quoteComparison.findFirst({
      where: { id: comparisonId, projectId },
      include: { quotes: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  private objectKey(projectId: string, comparisonId: string, quoteId: string): string {
    return `projects/${projectId}/quotes/${comparisonId}/${quoteId}`;
  }

  private toSummary(row: ComparisonRow): QuoteComparisonSummary {
    const extractions = row.quotes.map((q) => q.extraction as unknown as ExtractedQuote | null).filter((e): e is ExtractedQuote => e !== null);
    const quotes: QuoteSummary[] = row.quotes.map((q) => {
      const extraction = q.extraction as unknown as ExtractedQuote | null;
      return {
        id: q.id,
        filename: q.filename,
        contentType: q.contentType,
        supplierName: q.supplierName,
        status: q.status,
        extraction,
        risks: extraction ? assessRisks(extraction, extractions) : [],
        error: q.error,
      };
    });
    return {
      id: row.id,
      title: row.title,
      stageNo: row.stageNo,
      quotes,
      analysis: row.analysis as unknown as QuoteComparisonAnalysis | null,
      analyzedAt: row.analyzedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
