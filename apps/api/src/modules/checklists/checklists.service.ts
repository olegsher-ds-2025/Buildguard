import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  ChecklistTemplateDetail,
  ChecklistTemplateSummary,
  ChecklistTextBlock,
  ChecklistThreshold,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const DETAIL_INCLUDE = {
  items: { orderBy: { sortOrder: "asc" } },
  holdPoints: { orderBy: { sortOrder: "asc" } },
  commonDefects: true,
} satisfies Prisma.ChecklistTemplateInclude;

type TemplateWithDetail = Prisma.ChecklistTemplateGetPayload<{ include: typeof DETAIL_INCLUDE }>;

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<ChecklistTemplateSummary[]> {
    const templates = await this.prisma.checklistTemplate.findMany({
      where: { OR: [{ ownerUserId: null }, { ownerUserId: userId }] },
      orderBy: [{ stageNo: "asc" }, { ownerUserId: { sort: "asc", nulls: "first" } }, { version: "asc" }],
      include: { _count: { select: { items: true, holdPoints: true } } },
    });
    return templates.map((t) => ({
      id: t.id,
      stageNo: t.stageNo,
      title: t.title,
      version: t.version,
      isSystem: t.ownerUserId === null,
      basedOnTemplateId: t.basedOnTemplateId,
      itemCount: t._count.items,
      holdPointCount: t._count.holdPoints,
    }));
  }

  async get(templateId: string, userId: string): Promise<ChecklistTemplateDetail> {
    return this.toDetail(await this.findVisible(templateId, userId));
  }

  async clone(templateId: string, userId: string): Promise<ChecklistTemplateDetail> {
    const source = await this.findVisible(templateId, userId);
    const latest = await this.prisma.checklistTemplate.findFirst({
      where: { ownerUserId: userId, stageNo: source.stageNo },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const copy = await this.prisma.checklistTemplate.create({
      data: {
        stageNo: source.stageNo,
        title: source.title,
        version: (latest?.version ?? 0) + 1,
        ownerUserId: userId,
        basedOnTemplateId: source.id,
        standards: source.standards as Prisma.InputJsonValue,
        notes: source.notes as Prisma.InputJsonValue,
        items: {
          create: source.items.map(({ id: _id, templateId: _templateId, ...item }) => ({
            ...item,
            thresholds: item.thresholds as Prisma.InputJsonValue,
          })),
        },
        holdPoints: {
          create: source.holdPoints.map(({ id: _id, templateId: _templateId, ...hp }) => hp),
        },
        commonDefects: {
          create: source.commonDefects.map(({ id: _id, templateId: _templateId, ...d }) => d),
        },
      },
      include: DETAIL_INCLUDE,
    });

    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "checklist_template_cloned",
      entityType: "checklist_template",
      entityId: copy.id,
      metadata: { basedOnTemplateId: source.id, stageNo: source.stageNo },
    });
    return this.toDetail(copy);
  }

  // Another user's private template 404s, same as a missing one.
  private async findVisible(templateId: string, userId: string): Promise<TemplateWithDetail> {
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, OR: [{ ownerUserId: null }, { ownerUserId: userId }] },
      include: DETAIL_INCLUDE,
    });
    if (!template) throw new NotFoundException();
    return template;
  }

  private toDetail(t: TemplateWithDetail): ChecklistTemplateDetail {
    return {
      id: t.id,
      stageNo: t.stageNo,
      title: t.title,
      version: t.version,
      isSystem: t.ownerUserId === null,
      basedOnTemplateId: t.basedOnTemplateId,
      itemCount: t.items.length,
      holdPointCount: t.holdPoints.length,
      standards: t.standards as unknown as ChecklistTextBlock[],
      notes: t.notes as unknown as ChecklistTextBlock[],
      items: t.items.map((i) => ({
        id: i.id,
        sortOrder: i.sortOrder,
        subStage: i.subStage,
        section: i.section,
        phaseKind: i.phaseKind,
        text: i.text,
        standardRef: i.standardRef,
        itemType: i.itemType,
        mandatory: i.mandatory,
        thresholds: i.thresholds as unknown as ChecklistThreshold[],
        thresholdsReviewed: i.thresholdsReviewed,
        requiresBeforeCoverPhoto: i.requiresBeforeCoverPhoto,
      })),
      holdPoints: t.holdPoints.map((h) => ({ id: h.id, sortOrder: h.sortOrder, subStage: h.subStage, text: h.text })),
      commonDefects: t.commonDefects.map((d) => ({
        id: d.id,
        subStage: d.subStage,
        text: d.text,
        costMinMinor: d.costMinMinor?.toString() ?? null,
        costMaxMinor: d.costMaxMinor?.toString() ?? null,
      })),
    };
  }
}
