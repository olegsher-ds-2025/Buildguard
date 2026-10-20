import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { plainToInstance } from "class-transformer";
import { validate, type ValidationError } from "class-validator";
import type { Lead, Prisma } from "@prisma/client";
import {
  LEAD_AUDIENCE_LABELS,
  LEAD_KIND_LABELS,
  LEAD_ROLE_LABELS,
  LEAD_TOPIC_LABELS,
  type LeadKind,
  type LeadSummary,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ContactLeadDto, RegisterLeadDto, type ListLeadsQueryDto, type UpdateLeadDto } from "./dto/lead.dto";

const MIN_FILL_MS = 3000;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_CAP = 200;
const WEBHOOK_TIMEOUT_MS = 3000;
const MAX_LIST = 500;

const CSV_COLUMNS: (keyof LeadSummary)[] = [
  "createdAt",
  "kind",
  "status",
  "name",
  "phone",
  "email",
  "role",
  "projectCount",
  "projectStage",
  "region",
  "company",
  "topic",
  "message",
  "marketingOptIn",
  "audience",
  "landingPath",
  "projectKind",
  "budgetRange",
  "needContractors",
  "trades",
  "teamSize",
  "referrer",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent",
  "staffNotes",
];

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  private readonly allowedOrigins: string[];
  private readonly dailyCap: number;
  private readonly webhookUrl: string | undefined;
  private capAlertSentOn: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.allowedOrigins = (config.get<string>("LEADS_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean);
    this.dailyCap = Number(config.get<string>("LEADS_DAILY_CAP")) || DEFAULT_DAILY_CAP;
    this.webhookUrl = config.get<string>("LEADS_WEBHOOK_URL") || undefined;
  }

  /** Resolves silently (no row stored) for bots and duplicates, so neither learns anything from the response. */
  async submit(kind: LeadKind, body: Record<string, unknown>, origin: string | undefined): Promise<void> {
    this.checkOrigin(origin);
    if (looksLikeBot(body)) return;

    const dto = await validateLead(kind, body);
    if (await this.isDuplicate(kind, dto)) return;
    await this.enforceDailyCap();

    await this.prisma.lead.create({ data: toLeadData(kind, dto) });
    this.notify(notificationText(kind, dto));
  }

  async list(query: ListLeadsQueryDto): Promise<LeadSummary[]> {
    const leads = await this.prisma.lead.findMany({
      where: { kind: query.kind, status: query.status, audience: query.audience },
      orderBy: { createdAt: "desc" },
      take: MAX_LIST,
    });
    return leads.map(toSummary);
  }

  async update(id: string, dto: UpdateLeadDto, staffUserId: string): Promise<LeadSummary> {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { status: dto.status, staffNotes: dto.staffNotes },
    });

    // audit_entries is append-only and outlives lead retention, so it must not hold the notes text or any contact details.
    await this.audit.record({
      actorUserId: staffUserId,
      actorType: "staff",
      action: "lead_updated",
      entityType: "lead",
      entityId: id,
      metadata: {
        fromStatus: existing.status,
        toStatus: updated.status,
        notesChanged: dto.staffNotes !== undefined && dto.staffNotes !== existing.staffNotes,
      },
    });

    return toSummary(updated);
  }

  async csv(query: ListLeadsQueryDto): Promise<Buffer> {
    const leads = await this.prisma.lead.findMany({
      where: { kind: query.kind, status: query.status, audience: query.audience },
      orderBy: { createdAt: "desc" },
    });
    const rows = [CSV_COLUMNS, ...leads.map(toSummary).map((l) => CSV_COLUMNS.map((c) => l[c]))];
    // The BOM makes Excel open the file as UTF-8 instead of mangling the Hebrew.
    return Buffer.from("﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", "utf8");
  }

  private checkOrigin(origin: string | undefined): void {
    // Browsers always send Origin on a cross-origin POST, so a missing header
    // means a non-browser client, which could forge any Origin anyway. The
    // check exists to stop other sites embedding the form, not to authenticate.
    if (!origin || this.allowedOrigins.length === 0) return;
    if (!this.allowedOrigins.includes(origin)) throw new ForbiddenException();
  }

  private async isDuplicate(kind: LeadKind, dto: RegisterLeadDto | ContactLeadDto): Promise<boolean> {
    const contact: Prisma.LeadWhereInput = dto.email ? { email: dto.email } : { phone: dto.phone };
    const existing = await this.prisma.lead.findFirst({
      where: { kind, ...contact, createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) } },
      select: { id: true },
    });
    return existing !== null;
  }

  private async enforceDailyCap(): Promise<void> {
    const count = await this.prisma.lead.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (count < this.dailyCap) return;

    const today = new Date().toISOString().slice(0, 10);
    if (this.capAlertSentOn !== today) {
      this.capAlertSentOn = today;
      this.notify(`מכסת הלידים היומית (${this.dailyCap}) מלאה — לידים חדשים נדחים`);
    }
    throw new ServiceUnavailableException();
  }

  private notify(text: string): void {
    if (!this.webhookUrl) return;
    fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: text,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    }).catch((err: Error) => this.logger.warn(`Lead webhook failed: ${err.message}`));
  }
}

function looksLikeBot(body: Record<string, unknown>): boolean {
  const honeypot = body.website;
  if (honeypot !== undefined && honeypot !== "") return true;
  // t0 is the client's Date.now() when the form rendered. A negative elapsed
  // time means the client clock runs ahead of ours; let that through rather
  // than drop a real person. A missing t0 (no JS) gives NaN and passes too.
  const elapsed = Date.now() - Number(body.t0);
  return elapsed >= 0 && elapsed < MIN_FILL_MS;
}

async function validateLead(kind: LeadKind, body: Record<string, unknown>): Promise<RegisterLeadDto | ContactLeadDto> {
  const dto: RegisterLeadDto | ContactLeadDto =
    kind === "register" ? plainToInstance(RegisterLeadDto, body) : plainToInstance(ContactLeadDto, body);
  const errors = await validate(dto);
  if (errors.length > 0) {
    throw new BadRequestException({ errors: Object.fromEntries(errors.map((e) => [e.property, errorCode(e)])) });
  }
  return dto;
}

function errorCode(error: ValidationError): string {
  const failed = error.constraints ?? {};
  if (failed.isNotEmpty || failed.equals) return "required";
  if (failed.minLength) return "too_short";
  if (failed.maxLength) return "too_long";
  return "invalid";
}

function toLeadData(kind: LeadKind, dto: RegisterLeadDto | ContactLeadDto): Prisma.LeadCreateInput {
  const common = {
    kind,
    name: dto.name,
    phone: dto.phone,
    email: dto.email,
    audience: dto.audience,
    landingPath: dto.landingPath,
    referrer: dto.referrer,
    utmSource: dto.utm?.source,
    utmMedium: dto.utm?.medium,
    utmCampaign: dto.utm?.campaign,
    utmTerm: dto.utm?.term,
    utmContent: dto.utm?.content,
  };
  if (dto instanceof RegisterLeadDto) {
    return {
      ...common,
      role: dto.role,
      projectCount: dto.projectCount,
      projectStage: dto.projectStage,
      region: dto.region,
      company: dto.company,
      message: dto.message,
      marketingOptIn: dto.marketingOptIn === true,
      projectKind: dto.projectKind,
      budgetRange: dto.budgetRange,
      needContractors: dto.needContractors,
      trades: dto.trades ?? [],
      teamSize: dto.teamSize,
    };
  }
  return { ...common, topic: dto.topic, message: dto.message };
}

/** Category labels only: the webhook target (e.g. ntfy) is a third party and gets no personal data. */
function notificationText(kind: LeadKind, dto: RegisterLeadDto | ContactLeadDto): string {
  const parts =
    dto instanceof RegisterLeadDto
      ? [
          dto.audience && LEAD_AUDIENCE_LABELS[dto.audience],
          LEAD_ROLE_LABELS[dto.role],
          dto.projectCount !== undefined && projectCountLabel(dto.projectCount),
        ]
      : [dto.topic && LEAD_TOPIC_LABELS[dto.topic]];
  return [`ליד חדש: ${LEAD_KIND_LABELS[kind]}`, ...parts.filter(Boolean)].join(" · ");
}

function projectCountLabel(count: number): string {
  return count === 1 ? "פרויקט אחד" : `${count} פרויקטים`;
}

function toSummary(lead: Lead): LeadSummary {
  return {
    id: lead.id,
    kind: lead.kind,
    status: lead.status,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    role: lead.role,
    projectCount: lead.projectCount,
    projectStage: lead.projectStage,
    region: lead.region,
    company: lead.company,
    topic: lead.topic,
    message: lead.message,
    marketingOptIn: lead.marketingOptIn,
    audience: lead.audience,
    landingPath: lead.landingPath,
    projectKind: lead.projectKind,
    budgetRange: lead.budgetRange,
    needContractors: lead.needContractors,
    trades: lead.trades,
    teamSize: lead.teamSize,
    referrer: lead.referrer,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    utmTerm: lead.utmTerm,
    utmContent: lead.utmContent,
    staffNotes: lead.staffNotes,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // A cell starting with = + - @ (or tab/CR) runs as a formula in Excel/Sheets.
  // Stored phones are E.164 ("+972..."), which is digits only and harmless, so
  // they are left readable.
  if (/^[=+\-@\t\r]/.test(text) && !/^\+\d+$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
