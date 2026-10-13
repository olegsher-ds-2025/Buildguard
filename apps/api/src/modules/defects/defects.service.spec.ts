import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DefectsService } from "./defects.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

function makeService(defect: { status: string; assignedToUserId: string | null }, afterPhotos = 1) {
  const row = { id: "d1", projectId: "p1", title: "t", severity: 3, source: "checklist", phaseId: null, dueDate: null,
    createdAt: new Date(), updatedAt: new Date(), assignedToUser: null, ...defect };
  const prisma = {
    defect: { findFirst: jest.fn().mockResolvedValue(row), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockReturnValue(row) },
    photo: { count: jest.fn().mockResolvedValue(afterPhotos) },
    defectEvent: { create: jest.fn().mockReturnValue({}) },
    $transaction: jest.fn().mockResolvedValue([row]),
  } as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  return { service: new DefectsService(prisma, audit), prisma, audit };
}

describe("DefectsService", () => {
  it("lets the assigned contractor start and fix, but not verify", async () => {
    const actor = { userId: "c1", role: "contractor" as const };
    await expect(makeService({ status: "open", assignedToUserId: "c1" }).service.transition("p1", "d1", "start", undefined, actor)).resolves.toBeDefined();
    await expect(makeService({ status: "resolved", assignedToUserId: "c1" }).service.transition("p1", "d1", "verify", undefined, actor)).rejects.toThrow(ForbiddenException);
  });

  it("requires an 'after' photo before a defect can be marked fixed", async () => {
    const actor = { userId: "c1", role: "contractor" as const };
    await expect(
      makeService({ status: "in_progress", assignedToUserId: "c1" }, 0).service.transition("p1", "d1", "fix", undefined, actor),
    ).rejects.toThrow(/after/);
    await expect(
      makeService({ status: "in_progress", assignedToUserId: "c1" }, 1).service.transition("p1", "d1", "fix", undefined, actor),
    ).resolves.toBeDefined();
  });

  it("blocks a contractor who is not the assignee", async () => {
    const { service } = makeService({ status: "open", assignedToUserId: "someone-else" });
    await expect(service.transition("p1", "d1", "start", undefined, { userId: "c1", role: "contractor" })).rejects.toThrow(ForbiddenException);
  });

  it("rejects transitions from the wrong status", async () => {
    const { service } = makeService({ status: "open", assignedToUserId: null });
    await expect(service.transition("p1", "d1", "fix", undefined, { userId: "i1", role: "inspector" })).rejects.toThrow(BadRequestException);
  });

  it("audits verification by a reviewer", async () => {
    const { service, audit } = makeService({ status: "resolved", assignedToUserId: "c1" });
    await service.transition("p1", "d1", "verify", undefined, { userId: "i1", role: "inspector" });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "defect_verified" }));
  });

  it("scopes a contractor's list to their own assignments", async () => {
    const { service, prisma } = makeService({ status: "open", assignedToUserId: null });
    await service.list("p1", "c1", "contractor");
    expect((prisma.defect.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ projectId: "p1", assignedToUserId: "c1" });
    await service.list("p1", "o1", "owner");
    expect((prisma.defect.findMany as jest.Mock).mock.calls[1][0].where).toEqual({ projectId: "p1" });
  });
});
