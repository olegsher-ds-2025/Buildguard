import { BadRequestException, ConflictException } from "@nestjs/common";
import { ConcreteService } from "./concrete.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { NotificationsService } from "../notifications/notifications.service";

const castAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
const pour = (over: object = {}) => ({
  id: "pour1", projectId: "p1", phaseId: null, element: "תקרה", concreteGrade: "ב-30", requiredMpa28: 33, deliveryNote: null,
  slumpCm: null, spanMeters: 4, cantileverMeters: null, castAt, formworkRemovedAt: null, createdAt: new Date(), results: [], ...over,
});
const result = (ageDays: number, strengthMpa: number, createdAt = new Date()) => ({ id: `r${ageDays}${strengthMpa}`, ageDays, strengthMpa, testedAt: null, note: null, createdAt });

function makeService(found: object = pour()) {
  const prisma = {
    concretePour: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve(pour(data))), findFirst: jest.fn().mockResolvedValue(found), update: jest.fn(), findMany: jest.fn().mockResolvedValue([found]) },
    concreteResult: { create: jest.fn() },
    phase: { findFirst: jest.fn().mockResolvedValue({ id: "ph" }) },
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const notifications = { notifyProject: jest.fn() } as unknown as NotificationsService;
  return { service: new ConcreteService(prisma, audit, notifications), prisma, audit, notifications };
}

describe("ConcreteService", () => {
  it("won't guess the 28-day strength of a grade the checklist gives no figure for", async () => {
    const { service } = makeService();
    await expect(service.create("p1", { element: "x", concreteGrade: "ב-40", castAt: castAt.toISOString() }, "u1")).rejects.toThrow(BadRequestException);
    const ok = await service.create("p1", { element: "x", concreteGrade: "ב-30", castAt: castAt.toISOString() }, "u1");
    expect(ok.requiredMpa28).toBe(33);
  });

  it("alerts the reviewers when a result fails, and not when it passes", async () => {
    const failing = makeService();
    await failing.service.recordResult("p1", "pour1", { ageDays: 7, strengthMpa: 10 }, "u1");
    expect(failing.notifications.notifyProject).toHaveBeenCalledWith("p1", expect.arrayContaining(["inspector"]), "cube_failed", expect.any(Object), expect.any(String));

    const passing = makeService();
    await passing.service.recordResult("p1", "pour1", { ageDays: 7, strengthMpa: 25 }, "u1");
    expect(passing.notifications.notifyProject).not.toHaveBeenCalled();
  });

  it("blocks formwork removal on a failed cube, until a later passing retest clears it", async () => {
    const t0 = new Date(Date.now() - 3000);
    const failed = makeService(pour({ results: [result(7, 10, t0)] }));
    await expect(failed.service.removeFormwork("p1", "pour1", "u1")).rejects.toThrow(ConflictException);
    expect(failed.prisma.concretePour.update).not.toHaveBeenCalled();

    const retested = makeService(pour({ results: [result(7, 10, t0), result(7, 25, new Date())] }));
    await retested.service.removeFormwork("p1", "pour1", "u1");
    expect(retested.prisma.concretePour.update).toHaveBeenCalled();
    expect(retested.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "formwork_removed" }));
  });

  it("blocks removal before the wait has passed", async () => {
    const { service } = makeService(pour({ castAt: new Date() }));
    await expect(service.removeFormwork("p1", "pour1", "u1")).rejects.toThrow(ConflictException);
  });
});
