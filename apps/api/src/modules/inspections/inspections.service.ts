import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  ChecklistThreshold,
  InspectionDetail,
  InspectionItemState,
  InspectionSummary,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { HoldPointsService } from "../hold-points/hold-points.service";
import { CreateInspectionDto } from "./dto/create-inspection.dto";
import { RecordResultDto } from "./dto/record-result.dto";
import { evaluateThreshold } from "./threshold";

const DEFAULT_DEFECT_SEVERITY = 3;
const DEFECT_TITLE_MAX = 120;

const INSPECTION_INCLUDE = {
  phase: { select: { name: true } },
  template: { include: { items: { orderBy: { sortOrder: "asc" } }, holdPoints: { orderBy: { sortOrder: "asc" } } } },
} satisfies Prisma.InspectionInclude;

type InspectionRow = Prisma.InspectionGetPayload<{ include: typeof INSPECTION_INCLUDE }>;
type ResultRow = Prisma.InspectionResultGetPayload<Record<string, never>>;

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly holdPoints: HoldPointsService,
  ) {}

  async create(projectId: string, dto: CreateInspectionDto, inspectorUserId: string): Promise<InspectionDetail> {
    const phase = await this.prisma.phase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } });
    if (!phase) throw new NotFoundException("Phase not found in this project");
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: dto.templateId, OR: [{ ownerUserId: null }, { ownerUserId: inspectorUserId }] },
      select: { id: true },
    });
    if (!template) throw new NotFoundException("Checklist template not found");

    const created = await this.prisma.$transaction(async (tx) => {
      // Starting an inspection puts the stage's hold points on the phase, so they gate it from here on.
      await this.holdPoints.instantiateFromTemplate(tx, projectId, dto.phaseId, dto.templateId);
      return tx.inspection.create({
        data: { projectId, phaseId: dto.phaseId, templateId: dto.templateId, inspectorUserId },
        select: { id: true },
      });
    });
    return this.get(projectId, created.id);
  }

  async list(projectId: string): Promise<InspectionSummary[]> {
    const inspections = await this.prisma.inspection.findMany({
      where: { projectId },
      orderBy: { startedAt: "desc" },
      include: INSPECTION_INCLUDE,
    });
    const results = await this.prisma.inspectionResult.findMany({
      where: { inspectionId: { in: inspections.map((i) => i.id) } },
      select: { inspectionId: true, checklistItemId: true },
    });
    return inspections.map((i) => {
      const answered = new Set(results.filter((r) => r.inspectionId === i.id).map((r) => r.checklistItemId));
      return this.toSummary(i, answered.size);
    });
  }

  async get(projectId: string, inspectionId: string): Promise<InspectionDetail> {
    const inspection = await this.findOwned(projectId, inspectionId);
    const latest = await this.latestResults(inspectionId);
    const coverPhotos = await this.prisma.photo.groupBy({
      by: ["checklistItemId"],
      where: { inspectionId, tag: "before_cover" },
      _count: { _all: true },
    });
    const coverCounts = new Map(coverPhotos.map((g) => [g.checklistItemId, g._count._all]));
    const items = inspection.template.items.map((item): InspectionItemState => {
      const result = latest.get(item.id);
      return {
        id: item.id,
        sortOrder: item.sortOrder,
        subStage: item.subStage,
        section: item.section,
        phaseKind: item.phaseKind,
        text: item.text,
        standardRef: item.standardRef,
        itemType: item.itemType,
        mandatory: item.mandatory,
        thresholds: item.thresholds as unknown as ChecklistThreshold[],
        thresholdsReviewed: item.thresholdsReviewed,
        requiresBeforeCoverPhoto: item.requiresBeforeCoverPhoto,
        beforeCoverPhotoCount: coverCounts.get(item.id) ?? 0,
        outcome: result?.outcome ?? null,
        numericValue: result?.numericValue === null || result?.numericValue === undefined ? null : Number(result.numericValue),
        outOfThreshold: result?.outOfThreshold ?? false,
        note: result?.note ?? null,
        defectId: result?.defectId ?? null,
      };
    });
    return {
      ...this.toSummary(inspection, latest.size),
      items,
      holdPoints: inspection.template.holdPoints.map((h) => ({
        id: h.id,
        sortOrder: h.sortOrder,
        subStage: h.subStage,
        text: h.text,
      })),
    };
  }

  /**
   * A failed item, or a measurement that breaks a reviewed threshold, opens a
   * Defect. The server decides the stored outcome: an "ok" with an
   * out-of-threshold value is recorded as "fail".
   */
  async recordResult(
    projectId: string,
    inspectionId: string,
    dto: RecordResultDto,
    userId: string,
  ): Promise<InspectionItemState> {
    const inspection = await this.findOwned(projectId, inspectionId);
    if (inspection.status !== "open") throw new BadRequestException("Inspection is already completed");
    const item = inspection.template.items.find((i) => i.id === dto.checklistItemId);
    if (!item) throw new BadRequestException("Item does not belong to this inspection's checklist");

    const verdict = evaluateThreshold(
      item.thresholds as unknown as ChecklistThreshold[],
      item.thresholdsReviewed,
      dto.numericValue,
    );
    const outcome = verdict.breached ? "fail" : dto.outcome;
    if (outcome === "ok" && item.requiresBeforeCoverPhoto) {
      const photos = await this.prisma.photo.count({
        where: { inspectionId, checklistItemId: item.id, tag: "before_cover" },
      });
      if (photos === 0) throw new BadRequestException("A before-cover photo is required before marking this item OK");
    }
    const resultId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.inspectionResult.findFirst({
        where: { inspectionId, checklistItemId: item.id },
        orderBy: { createdAt: "desc" },
      });

      let defectId: string | null = null;
      if (outcome === "fail") {
        const existing = previous?.defectId
          ? await tx.defect.findFirst({ where: { id: previous.defectId, status: { not: "closed" } } })
          : null;
        if (existing) {
          defectId = existing.id;
        } else {
          const defect = await tx.defect.create({
            data: {
              projectId,
              phaseId: inspection.phaseId,
              source: "checklist",
              inspectionResultId: resultId,
              title: item.text.slice(0, DEFECT_TITLE_MAX),
              severity: dto.severity ?? DEFAULT_DEFECT_SEVERITY,
            },
          });
          await tx.defectEvent.create({
            data: {
              defectId: defect.id,
              eventType: "created",
              payload: { fromChecklistItemId: item.id, inspectionId, outOfThreshold: verdict.breached },
              actorUserId: userId,
            },
          });
          defectId = defect.id;
        }
      }

      await tx.inspectionResult.create({
        data: {
          id: resultId,
          inspectionId,
          checklistItemId: item.id,
          outcome,
          numericValue: dto.numericValue,
          outOfThreshold: verdict.breached,
          note: dto.note,
          defectId,
          supersedesResultId: previous?.id,
          recordedByUserId: userId,
        },
      });
    });

    const detail = await this.get(projectId, inspectionId);
    return detail.items.find((i) => i.id === item.id)!;
  }

  async complete(projectId: string, inspectionId: string, userId: string): Promise<InspectionDetail> {
    const detail = await this.get(projectId, inspectionId);
    if (detail.status === "completed") throw new BadRequestException("Inspection is already completed");
    const missing = detail.items.filter((i) => i.mandatory && i.outcome === null).length;
    if (missing > 0) throw new BadRequestException(`${missing} mandatory items have no result`);

    await this.prisma.inspection.update({
      where: { id: inspectionId },
      data: { status: "completed", completedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "inspection_completed",
      entityType: "inspection",
      entityId: inspectionId,
      projectId,
      metadata: { phaseId: detail.phaseId, templateId: detail.templateId },
    });
    return this.get(projectId, inspectionId);
  }

  private async findOwned(projectId: string, inspectionId: string): Promise<InspectionRow> {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id: inspectionId, projectId },
      include: INSPECTION_INCLUDE,
    });
    if (!inspection) throw new NotFoundException();
    return inspection;
  }

  private async latestResults(inspectionId: string): Promise<Map<string, ResultRow>> {
    const rows = await this.prisma.inspectionResult.findMany({
      where: { inspectionId },
      orderBy: { createdAt: "asc" },
    });
    return new Map(rows.map((r) => [r.checklistItemId, r]));
  }

  private toSummary(i: InspectionRow, answeredCount: number): InspectionSummary {
    return {
      id: i.id,
      phaseId: i.phaseId,
      phaseName: i.phase.name,
      templateId: i.templateId,
      stageNo: i.template.stageNo,
      title: i.template.title,
      inspectorUserId: i.inspectorUserId,
      status: i.status,
      startedAt: i.startedAt.toISOString(),
      completedAt: i.completedAt?.toISOString() ?? null,
      answeredCount,
      itemCount: i.template.items.length,
    };
  }
}
