import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ChecklistItem, ChecklistTemplate, Prisma } from "@prisma/client";
import type { ChecklistHoldPointSummary, ChecklistItemSummary, ChecklistThreshold } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateItemDto, HoldPointDto, ThresholdDto, UpdateItemDto, UpdateTemplateDto } from "./dto/edit-checklist.dto";

/** Edits apply to a user's own (cloned) templates only; system templates are read-only. */
@Injectable()
export class ChecklistEditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async updateTemplate(templateId: string, dto: UpdateTemplateDto, userId: string): Promise<void> {
    await this.findEditable(templateId, userId);
    await this.prisma.checklistTemplate.update({ where: { id: templateId }, data: { title: dto.title } });
    await this.record(userId, "checklist_template_updated", templateId, { title: dto.title });
  }

  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    await this.findEditable(templateId, userId);
    if ((await this.prisma.inspection.count({ where: { templateId } })) > 0) {
      throw new ConflictException("Template is used by inspections and cannot be deleted");
    }
    await this.prisma.checklistTemplate.delete({ where: { id: templateId } });
    await this.record(userId, "checklist_template_deleted", templateId);
  }

  async createItem(templateId: string, dto: CreateItemDto, userId: string): Promise<ChecklistItemSummary> {
    await this.findEditable(templateId, userId);
    const { afterItemId, thresholds, subStage, section, standardRef, ...fields } = dto;

    const item = await this.prisma.$transaction(async (tx) => {
      let sortOrder: number;
      if (afterItemId) {
        const after = await tx.checklistItem.findFirst({ where: { id: afterItemId, templateId } });
        if (!after) throw new NotFoundException("afterItemId does not belong to this template");
        await tx.checklistItem.updateMany({
          where: { templateId, sortOrder: { gt: after.sortOrder } },
          data: { sortOrder: { increment: 1 } },
        });
        sortOrder = after.sortOrder + 1;
      } else {
        const last = await tx.checklistItem.aggregate({ where: { templateId }, _max: { sortOrder: true } });
        sortOrder = (last._max.sortOrder ?? -1) + 1;
      }
      return tx.checklistItem.create({
        data: {
          ...fields,
          subStage: subStage ? blankToNull(subStage) : null,
          section: section ? blankToNull(section) : null,
          standardRef: standardRef ? blankToNull(standardRef) : null,
          templateId,
          sortOrder,
          thresholds: toThresholdJson(thresholds ?? []),
        },
      });
    });
    await this.record(userId, "checklist_item_added", templateId, { itemId: item.id });
    return toItemSummary(item);
  }

  async updateItem(templateId: string, itemId: string, dto: UpdateItemDto, userId: string): Promise<ChecklistItemSummary> {
    await this.findEditable(templateId, userId);
    const existing = await this.findItem(templateId, itemId);
    const { thresholds, subStage, section, standardRef, ...fields } = dto;

    const item = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        ...fields,
        ...(subStage !== undefined && { subStage: blankToNull(subStage) }),
        ...(section !== undefined && { section: blankToNull(section) }),
        ...(standardRef !== undefined && { standardRef: blankToNull(standardRef) }),
        ...(thresholds ? { thresholds: toThresholdJson(thresholds) } : {}),
      },
    });
    if (dto.thresholdsReviewed !== undefined && dto.thresholdsReviewed !== existing.thresholdsReviewed) {
      await this.record(userId, "checklist_thresholds_reviewed", templateId, {
        itemId,
        reviewed: dto.thresholdsReviewed,
      });
    }
    return toItemSummary(item);
  }

  async deleteItem(templateId: string, itemId: string, userId: string): Promise<void> {
    await this.findEditable(templateId, userId);
    await this.findItem(templateId, itemId);
    const [results, photos] = await Promise.all([
      this.prisma.inspectionResult.count({ where: { checklistItemId: itemId } }),
      this.prisma.photo.count({ where: { checklistItemId: itemId } }),
    ]);
    if (results + photos > 0) throw new ConflictException("Item has inspection results or photos and cannot be deleted");
    await this.prisma.checklistItem.delete({ where: { id: itemId } });
    await this.record(userId, "checklist_item_removed", templateId, { itemId });
  }

  async moveItem(templateId: string, itemId: string, direction: "up" | "down", userId: string): Promise<void> {
    await this.findEditable(templateId, userId);
    const item = await this.findItem(templateId, itemId);
    const neighbour = await this.prisma.checklistItem.findFirst({
      where: { templateId, sortOrder: direction === "up" ? { lt: item.sortOrder } : { gt: item.sortOrder } },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return;
    await this.prisma.$transaction([
      this.prisma.checklistItem.update({ where: { id: item.id }, data: { sortOrder: neighbour.sortOrder } }),
      this.prisma.checklistItem.update({ where: { id: neighbour.id }, data: { sortOrder: item.sortOrder } }),
    ]);
  }

  async createHoldPoint(templateId: string, dto: HoldPointDto, userId: string): Promise<ChecklistHoldPointSummary> {
    await this.findEditable(templateId, userId);
    const last = await this.prisma.checklistHoldPoint.aggregate({ where: { templateId }, _max: { sortOrder: true } });
    const hp = await this.prisma.checklistHoldPoint.create({
      data: { templateId, text: dto.text, subStage: dto.subStage, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    await this.record(userId, "checklist_hold_point_added", templateId, { holdPointId: hp.id });
    return { id: hp.id, sortOrder: hp.sortOrder, subStage: hp.subStage, text: hp.text };
  }

  async updateHoldPoint(templateId: string, holdPointId: string, dto: HoldPointDto, userId: string): Promise<ChecklistHoldPointSummary> {
    await this.findEditable(templateId, userId);
    await this.findHoldPoint(templateId, holdPointId);
    const hp = await this.prisma.checklistHoldPoint.update({
      where: { id: holdPointId },
      data: { text: dto.text, subStage: dto.subStage ?? null },
    });
    return { id: hp.id, sortOrder: hp.sortOrder, subStage: hp.subStage, text: hp.text };
  }

  async deleteHoldPoint(templateId: string, holdPointId: string, userId: string): Promise<void> {
    await this.findEditable(templateId, userId);
    await this.findHoldPoint(templateId, holdPointId);
    await this.prisma.checklistHoldPoint.delete({ where: { id: holdPointId } });
    await this.record(userId, "checklist_hold_point_removed", templateId, { holdPointId });
  }

  // A system or someone else's template is visible-but-not-editable (403) or invisible (404).
  private async findEditable(templateId: string, userId: string): Promise<ChecklistTemplate> {
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, OR: [{ ownerUserId: null }, { ownerUserId: userId }] },
    });
    if (!template) throw new NotFoundException();
    if (template.ownerUserId !== userId) throw new ForbiddenException("System templates are read-only; clone one first");
    return template;
  }

  private async findItem(templateId: string, itemId: string): Promise<ChecklistItem> {
    const item = await this.prisma.checklistItem.findFirst({ where: { id: itemId, templateId } });
    if (!item) throw new NotFoundException();
    return item;
  }

  private async findHoldPoint(templateId: string, holdPointId: string) {
    const hp = await this.prisma.checklistHoldPoint.findFirst({ where: { id: holdPointId, templateId } });
    if (!hp) throw new NotFoundException();
    return hp;
  }

  private record(userId: string, action: string, templateId: string, metadata?: Prisma.InputJsonValue) {
    return this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action,
      entityType: "checklist_template",
      entityId: templateId,
      metadata,
    });
  }
}

// An emptied text field means "none", not an empty-string group of its own.
function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function toThresholdJson(thresholds: ThresholdDto[]): Prisma.InputJsonValue {
  return thresholds.map((t) => ({
    op: t.op,
    value: t.value,
    upperValue: t.upperValue ?? null,
    unit: t.unit ?? null,
    raw: t.raw ?? `${t.op} ${t.value}${t.unit ? ` ${t.unit}` : ""}`,
  }));
}

function toItemSummary(i: ChecklistItem): ChecklistItemSummary {
  return {
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
  };
}
