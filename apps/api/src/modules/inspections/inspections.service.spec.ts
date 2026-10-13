import { BadRequestException } from "@nestjs/common";
import { InspectionsService } from "./inspections.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { HoldPointsService } from "../hold-points/hold-points.service";

const th = (op: string, value: number) => ({ op, value, upperValue: null, unit: "מ\"מ", raw: `${op} ${value}` });

function item(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    sortOrder: 0,
    subStage: null,
    section: null,
    phaseKind: "during",
    text: `item ${id}`,
    standardRef: null,
    itemType: "visual",
    mandatory: true,
    thresholds: [],
    thresholdsReviewed: false,
    requiresBeforeCoverPhoto: false,
    ...over,
  };
}

function makeService(opts: {
  items: unknown[];
  previous?: unknown;
  status?: string;
  existingDefect?: unknown;
  coverPhotos?: number;
}) {
  const inspection = {
    id: "insp-1",
    projectId: "proj-1",
    phaseId: "phase-1",
    templateId: "tpl-1",
    inspectorUserId: "user-1",
    status: opts.status ?? "open",
    startedAt: new Date("2026-10-01T00:00:00Z"),
    completedAt: null,
    phase: { name: "Structure" },
    template: { stageNo: 3, title: "שלד", items: opts.items, holdPoints: [] },
  };
  const tx = {
    inspectionResult: {
      findFirst: jest.fn().mockResolvedValue(opts.previous ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
    defect: {
      findFirst: jest.fn().mockResolvedValue(opts.existingDefect ?? null),
      create: jest.fn().mockResolvedValue({ id: "defect-new" }),
    },
    defectEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    inspection: { findFirst: jest.fn().mockResolvedValue(inspection), update: jest.fn() },
    inspectionResult: { findMany: jest.fn().mockResolvedValue([]) },
    photo: { count: jest.fn().mockResolvedValue(opts.coverPhotos ?? 0), groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const holdPoints = { instantiateFromTemplate: jest.fn() } as unknown as HoldPointsService;
  return { service: new InspectionsService(prisma, audit, holdPoints), tx, prisma, audit };
}

describe("InspectionsService.recordResult", () => {
  it("opens a checklist defect when an item fails", async () => {
    const { service, tx } = makeService({ items: [item("i1")] });
    await service.recordResult("proj-1", "insp-1", { checklistItemId: "i1", outcome: "fail", severity: 4 }, "user-1");

    const data = tx.defect.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: "checklist", phaseId: "phase-1", severity: 4, projectId: "proj-1" });
    expect(tx.defectEvent.create).toHaveBeenCalled();
    expect(tx.inspectionResult.create.mock.calls[0][0].data).toMatchObject({ outcome: "fail", defectId: "defect-new" });
  });

  it("reuses the still-open defect when a failed item is re-marked failed", async () => {
    const { service, tx } = makeService({
      items: [item("i1")],
      previous: { id: "r0", defectId: "defect-old" },
      existingDefect: { id: "defect-old" },
    });
    await service.recordResult("proj-1", "insp-1", { checklistItemId: "i1", outcome: "fail" }, "user-1");

    expect(tx.defect.create).not.toHaveBeenCalled();
    expect(tx.inspectionResult.create.mock.calls[0][0].data).toMatchObject({
      defectId: "defect-old",
      supersedesResultId: "r0",
    });
  });

  it("records an out-of-threshold value as a failure when the threshold is reviewed", async () => {
    const { service, tx } = makeService({
      items: [item("i1", { itemType: "measurement", thresholds: [th("≤", 4)], thresholdsReviewed: true })],
    });
    await service.recordResult("proj-1", "insp-1", { checklistItemId: "i1", outcome: "ok", numericValue: 6 }, "user-1");

    expect(tx.inspectionResult.create.mock.calls[0][0].data).toMatchObject({ outcome: "fail", outOfThreshold: true });
    expect(tx.defect.create).toHaveBeenCalled();
  });

  it("leaves an out-of-range value alone while the threshold is unreviewed", async () => {
    const { service, tx } = makeService({
      items: [item("i1", { itemType: "measurement", thresholds: [th("≤", 4)], thresholdsReviewed: false })],
    });
    await service.recordResult("proj-1", "insp-1", { checklistItemId: "i1", outcome: "ok", numericValue: 6 }, "user-1");

    expect(tx.inspectionResult.create.mock.calls[0][0].data).toMatchObject({ outcome: "ok", outOfThreshold: false });
    expect(tx.defect.create).not.toHaveBeenCalled();
  });

  it("rejects results on a completed inspection or for a foreign item", async () => {
    await expect(
      makeService({ items: [item("i1")], status: "completed" }).service.recordResult(
        "proj-1", "insp-1", { checklistItemId: "i1", outcome: "ok" }, "user-1"),
    ).rejects.toThrow(BadRequestException);
    await expect(
      makeService({ items: [item("i1")] }).service.recordResult(
        "proj-1", "insp-1", { checklistItemId: "other", outcome: "ok" }, "user-1"),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("InspectionsService before-cover photos", () => {
  const needsPhoto = item("i1", { requiresBeforeCoverPhoto: true });

  it("refuses to mark an item ok without a before-cover photo", async () => {
    const { service, tx } = makeService({ items: [needsPhoto], coverPhotos: 0 });
    await expect(
      service.recordResult("proj-1", "insp-1", { checklistItemId: "i1", outcome: "ok" }, "user-1"),
    ).rejects.toThrow(/before-cover photo/);
    expect(tx.inspectionResult.create).not.toHaveBeenCalled();
  });

  it("allows ok once a photo exists, and always allows fail", async () => {
    const withPhoto = makeService({ items: [needsPhoto], coverPhotos: 1 });
    await withPhoto.service.recordResult("proj-1", "insp-1", { checklistItemId: "i1", outcome: "ok" }, "user-1");
    expect(withPhoto.tx.inspectionResult.create).toHaveBeenCalled();

    const failing = makeService({ items: [needsPhoto], coverPhotos: 0 });
    await failing.service.recordResult("proj-1", "insp-1", { checklistItemId: "i1", outcome: "fail" }, "user-1");
    expect(failing.tx.inspectionResult.create).toHaveBeenCalled();
  });
});

describe("InspectionsService.complete", () => {
  it("refuses while mandatory items have no result, then audits on success", async () => {
    const pending = makeService({ items: [item("i1"), item("i2", { mandatory: false })] });
    await expect(pending.service.complete("proj-1", "insp-1", "user-1")).rejects.toThrow(/1 mandatory/);

    const done = makeService({ items: [item("i1", { mandatory: false })] });
    await done.service.complete("proj-1", "insp-1", "user-1");
    expect(done.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "inspection_completed" }));
  });
});
