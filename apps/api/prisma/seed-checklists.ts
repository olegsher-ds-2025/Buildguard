import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChecklistItemType, ChecklistPhaseKind, PrismaClient } from "@prisma/client";

interface SourceStage {
  stageNo: number;
  title: string;
  standards: unknown[];
  notes: unknown[];
  items: {
    sortOrder: number;
    subStage: string | null;
    section: string | null;
    phaseKind: ChecklistPhaseKind;
    text: string;
    standardRef: string | null;
    itemType: ChecklistItemType;
    thresholds: unknown[];
    requiresBeforeCoverPhoto: boolean;
  }[];
  holdPoints: { sortOrder: number; subStage: string | null; text: string }[];
  commonDefects: { subStage: string | null; text: string; costMinMinor: number | null; costMaxMinor: number | null }[];
}

/** Loads the 15 system templates once; an existing stage is left untouched so edits survive re-seeding. */
export async function seedChecklistTemplates(prisma: PrismaClient): Promise<number> {
  const stages: SourceStage[] = JSON.parse(readFileSync(join(__dirname, "seed-data", "checklist.he.json"), "utf-8"));
  let created = 0;
  for (const stage of stages) {
    const existing = await prisma.checklistTemplate.findFirst({
      where: { ownerUserId: null, stageNo: stage.stageNo },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.checklistTemplate.create({
      data: {
        stageNo: stage.stageNo,
        title: stage.title,
        standards: stage.standards as object[],
        notes: stage.notes as object[],
        items: {
          create: stage.items.map(({ thresholds, ...item }) => ({ ...item, thresholds: thresholds as object[] })),
        },
        holdPoints: { create: stage.holdPoints },
        commonDefects: {
          create: stage.commonDefects.map((d) => ({
            subStage: d.subStage,
            text: d.text,
            costMinMinor: d.costMinMinor === null ? null : BigInt(d.costMinMinor),
            costMaxMinor: d.costMaxMinor === null ? null : BigInt(d.costMaxMinor),
          })),
        },
      },
    });
    created++;
  }
  return created;
}
