import { BadRequestException, ConflictException } from "@nestjs/common";
import { TimedTestsService } from "./timed-tests.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
const test = (over: object = {}) => ({
  id: "t1", projectId: "p1", phaseId: null, kind: "pressure", location: "מטבח", startedAt: hoursAgo(25), durationHours: 24, unit: "atm",
  startReading: 10, endReading: null, startPhotoId: null, endPhotoId: null, outcome: null, note: null, completedAt: null, ...over,
});

function makeService(found: object = test()) {
  const prisma = {
    timedTest: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(test(data))),
      findFirst: jest.fn().mockResolvedValue(found),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(test({ ...found, ...data }))),
    },
    phase: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  return { service: new TimedTestsService(prisma, audit), prisma, audit };
}

describe("TimedTestsService", () => {
  it("applies the checklist durations and rejects out-of-range ones", async () => {
    const { service } = makeService();
    expect((await service.start("p1", { kind: "flood", location: "גג" }, "u1")).durationHours).toBe(72);
    await expect(service.start("p1", { kind: "pressure", location: "x", durationHours: 12, startReading: 10 }, "u1")).rejects.toThrow(BadRequestException);
    await expect(service.start("p1", { kind: "flood", location: "x", durationHours: 100 }, "u1")).rejects.toThrow(BadRequestException);
    await expect(service.start("p1", { kind: "pressure", location: "x" }, "u1")).rejects.toThrow(/starting gauge/);
  });

  it("can't be completed before its duration has elapsed", async () => {
    const { service } = makeService(test({ startedAt: hoursAgo(5) }));
    await expect(service.complete("p1", "t1", { outcome: "passed", endReading: 10 }, "u1")).rejects.toThrow(ConflictException);
  });

  it("fails a pressure test whose gauge dropped, even if the caller says passed", async () => {
    const { service } = makeService();
    const done = await service.complete("p1", "t1", { outcome: "passed", endReading: 9.5 }, "u1");
    expect(done.status).toBe("failed");
  });

  it("passes a pressure test that held, and audits the completion", async () => {
    const { service, audit } = makeService();
    const done = await service.complete("p1", "t1", { outcome: "passed", endReading: 10 }, "u1");
    expect(done.status).toBe("passed");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "timed_test_completed" }));
  });

  it("needs an ending reading for pressure tests and refuses a second completion", async () => {
    await expect(makeService().service.complete("p1", "t1", { outcome: "passed" }, "u1")).rejects.toThrow(/ending gauge/);
    await expect(makeService(test({ completedAt: new Date() })).service.complete("p1", "t1", { outcome: "passed", endReading: 10 }, "u1")).rejects.toThrow(BadRequestException);
  });
});
