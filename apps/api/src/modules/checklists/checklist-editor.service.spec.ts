import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ChecklistEditorService } from "./checklist-editor.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

const item = { id: "i1", templateId: "t1", sortOrder: 0, subStage: null, section: null, phaseKind: "during", text: "x",
  standardRef: null, itemType: "visual", mandatory: true, thresholds: [], thresholdsReviewed: false, requiresBeforeCoverPhoto: false };

function makeService(opts: { template?: unknown; item?: unknown; usedBy?: { results?: number; photos?: number; inspections?: number } } = {}) {
  const tx = {
    checklistItem: {
      findFirst: jest.fn().mockResolvedValue(item),
      updateMany: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 4 } }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...item, ...data, id: "new" })),
    },
  };
  const prisma = {
    checklistTemplate: {
      findFirst: jest.fn().mockResolvedValue(opts.template === undefined ? { id: "t1", ownerUserId: "u1" } : opts.template),
      update: jest.fn(),
      delete: jest.fn(),
    },
    checklistItem: {
      findFirst: jest.fn().mockResolvedValue(opts.item === undefined ? item : opts.item),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...item, ...data })),
      delete: jest.fn(),
    },
    inspectionResult: { count: jest.fn().mockResolvedValue(opts.usedBy?.results ?? 0) },
    photo: { count: jest.fn().mockResolvedValue(opts.usedBy?.photos ?? 0) },
    inspection: { count: jest.fn().mockResolvedValue(opts.usedBy?.inspections ?? 0) },
    $transaction: jest.fn().mockImplementation((arg: unknown) => (typeof arg === "function" ? arg(tx) : Promise.all(arg as unknown[]))),
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  return { service: new ChecklistEditorService(prisma, audit), prisma, audit, tx };
}

describe("ChecklistEditorService", () => {
  it("refuses to edit a system template, and 404s on a template that is not visible", async () => {
    await expect(makeService({ template: { id: "t1", ownerUserId: null } }).service.updateTemplate("t1", { title: "x" }, "u1")).rejects.toThrow(ForbiddenException);
    await expect(makeService({ template: null }).service.updateTemplate("t1", { title: "x" }, "u1")).rejects.toThrow(NotFoundException);
  });

  it("appends a new item at the end and normalises thresholds", async () => {
    const { service, tx } = makeService();
    const created = await service.createItem("t1", { text: "בדיקה", phaseKind: "during", itemType: "measurement", thresholds: [{ op: "≤", value: 4, unit: 'מ"מ' }] }, "u1");

    const data = tx.checklistItem.create.mock.calls[0][0].data;
    expect(data.sortOrder).toBe(5);
    expect(data.thresholds).toEqual([{ op: "≤", value: 4, upperValue: null, unit: 'מ"מ', raw: '≤ 4 מ"מ' }]);
    expect(created.id).toBe("new");
  });

  it("inserts after a given item by shifting later items", async () => {
    const { service, tx } = makeService();
    await service.createItem("t1", { text: "x", phaseKind: "before", itemType: "visual", afterItemId: "i1" }, "u1");
    expect(tx.checklistItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { sortOrder: { increment: 1 } } }));
    expect(tx.checklistItem.create.mock.calls[0][0].data.sortOrder).toBe(1);
  });

  it("audits only real changes to the threshold review flag", async () => {
    const reviewed = makeService();
    await reviewed.service.updateItem("t1", "i1", { thresholdsReviewed: true }, "u1");
    expect(reviewed.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "checklist_thresholds_reviewed" }));

    const unchanged = makeService();
    await unchanged.service.updateItem("t1", "i1", { thresholdsReviewed: false, text: "y" }, "u1");
    expect(unchanged.audit.record).not.toHaveBeenCalled();
  });

  it("stores an emptied sub-stage, section or standard as null", async () => {
    const { service, prisma } = makeService();
    await service.updateItem("t1", "i1", { subStage: "", section: "  ", standardRef: "ת\"י 466" }, "u1");
    const data = (prisma.checklistItem.update as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ subStage: null, section: null, standardRef: 'ת"י 466' });
  });

  it("refuses to delete an item that inspections or photos reference, or a template in use", async () => {
    await expect(makeService({ usedBy: { results: 1 } }).service.deleteItem("t1", "i1", "u1")).rejects.toThrow(ConflictException);
    await expect(makeService({ usedBy: { photos: 2 } }).service.deleteItem("t1", "i1", "u1")).rejects.toThrow(ConflictException);
    await expect(makeService({ usedBy: { inspections: 1 } }).service.deleteTemplate("t1", "u1")).rejects.toThrow(ConflictException);
    const ok = makeService();
    await ok.service.deleteItem("t1", "i1", "u1");
    expect(ok.prisma.checklistItem.delete).toHaveBeenCalled();
  });
});
