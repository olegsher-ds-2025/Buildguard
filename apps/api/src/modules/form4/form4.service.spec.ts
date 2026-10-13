import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Form4Service } from "./form4.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { HoldPointsService } from "../hold-points/hold-points.service";

function makeService(opts: { rows?: object[]; doc?: object | null; holdPoints?: { state: string }[]; pours?: object[] } = {}) {
  const prisma = {
    form4Item: { findMany: jest.fn().mockResolvedValue(opts.rows ?? []), upsert: jest.fn() },
    document: { findFirst: jest.fn().mockResolvedValue(opts.doc === undefined ? { id: "d1" } : opts.doc) },
    phase: { count: jest.fn().mockResolvedValue(2) },
    concretePour: { findMany: jest.fn().mockResolvedValue(opts.pours ?? []) },
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const holdPoints = { list: jest.fn().mockResolvedValue(opts.holdPoints ?? []) } as unknown as HoldPointsService;
  return { service: new Form4Service(prisma, audit, holdPoints), prisma, audit };
}

describe("Form4Service", () => {
  it("reports readiness from the satisfied requirements and the open blockers", async () => {
    const { service } = makeService({
      rows: [{ key: "gas_tightness", satisfied: true, documentId: "d1", document: { title: "בדיקת גז" }, note: null, satisfiedAt: new Date() }],
      holdPoints: [{ state: "open" }, { state: "signed" }],
      pours: [{ requiredMpa28: 33, results: [{ ageDays: 7, strengthMpa: 5, createdAt: new Date() }] }],
    });
    const readiness = await service.get("p1");
    expect(readiness).toMatchObject({ satisfiedCount: 1, totalCount: 9, readinessPct: 11 });
    expect(readiness.items.find((i) => i.key === "gas_tightness")).toMatchObject({ satisfied: true, documentTitle: "בדיקת גז" });
    expect(readiness.blockers).toEqual({ openHoldPoints: 1, unapprovedPhases: 2, failedConcreteResults: 1 });
  });

  it("won't mark a requirement satisfied without its document, or accept an unknown requirement", async () => {
    const { service } = makeService();
    await expect(service.save("p1", "gas_tightness", { satisfied: true }, "u1")).rejects.toThrow(BadRequestException);
    await expect(service.save("p1", "made_up", { satisfied: false }, "u1")).rejects.toThrow(NotFoundException);
  });

  it("checks the document belongs to the project, then saves and audits", async () => {
    await expect(makeService({ doc: null }).service.save("p1", "gas_tightness", { satisfied: true, documentId: "d9" }, "u1")).rejects.toThrow(NotFoundException);

    const { service, prisma, audit } = makeService();
    await service.save("p1", "gas_tightness", { satisfied: true, documentId: "d1" }, "u1");
    expect((prisma.form4Item.upsert as jest.Mock).mock.calls[0][0].update).toMatchObject({ satisfied: true, documentId: "d1", satisfiedByUserId: "u1" });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "form4_item_updated" }));
  });
});
