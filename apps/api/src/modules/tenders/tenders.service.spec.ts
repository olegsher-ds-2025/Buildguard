import { BadRequestException } from "@nestjs/common";
import { TendersService } from "./tenders.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { MatchingEngine } from "./matching/matching.interface";

describe("TendersService", () => {
  const baseTender = {
    id: "tender-1",
    projectId: "proj-1",
    workCategoryId: "cat-1",
    workCategory: { id: "cat-1", name: "electrical" },
    title: "Rewire second floor",
    scopeDescription: "Full rewire",
    budgetMinMinor: 100_000n,
    budgetMaxMinor: 200_000n,
    currency: "ILS",
    plannedStartDate: null,
    plannedEndDate: null,
    status: "draft",
    publishedAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
  };

  function makeService(tender = baseTender) {
    const prisma = {
      tender: {
        create: jest.fn().mockResolvedValue(tender),
        findFirst: jest.fn().mockResolvedValue(tender),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...tender, status: "invited_bidding" }),
        update: jest.fn().mockImplementation(({ data }) => ({ ...tender, ...data })),
        findMany: jest.fn().mockResolvedValue([tender]),
      },
      tenderInvitation: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      contractorProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      bid: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const matching = {
      rankCandidates: jest.fn().mockResolvedValue([{ contractorProfileId: "c1", matchScore: 0.8 }]),
    } as unknown as MatchingEngine;
    return { service: new TendersService(prisma, matching, audit), prisma, audit, matching };
  }

  it("publish() runs the matching engine and persists a TenderInvitation per candidate", async () => {
    const { service, prisma, matching } = makeService();
    await service.publish("proj-1", "tender-1", "user-1");

    expect(matching.rankCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ tenderId: "tender-1", workCategoryId: "cat-1" }),
      expect.any(Number),
    );
    expect(prisma.tenderInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contractorProfileId: "c1", matchScore: 0.8 }) }),
    );
  });

  it("publish() rejects a tender that isn't in draft", async () => {
    const { service } = makeService({ ...baseTender, status: "invited_bidding" });
    await expect(service.publish("proj-1", "tender-1", "user-1")).rejects.toThrow(BadRequestException);
  });

  it("cancel() rejects a tender that's already awarded/cancelled/closed", async () => {
    const { service } = makeService({ ...baseTender, status: "awarded" });
    await expect(service.cancel("proj-1", "tender-1", "user-1")).rejects.toThrow(BadRequestException);
  });

  it("getDetail() redacts invitations from a contractor caller (only owner/PM see the invitation list)", async () => {
    const { service, prisma } = makeService();
    const result = await service.getDetail("proj-1", "tender-1", "user-1", "contractor");

    expect(prisma.tenderInvitation.findMany).not.toHaveBeenCalled();
    expect(result.invitations).toEqual([]);
  });

  it("getDetail() includes the invitation list for an owner caller", async () => {
    const { service, prisma } = makeService();
    (prisma.tenderInvitation.findMany as jest.Mock).mockResolvedValue([
      {
        contractorProfileId: "c1",
        contractorProfile: { companyName: "Amir Cohen Construction" },
        matchScore: 0.8 as unknown,
        status: "invited",
        invitedAt: new Date("2026-09-02T00:00:00Z"),
      },
    ]);
    const result = await service.getDetail("proj-1", "tender-1", "owner-1", "owner");

    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0].companyName).toBe("Amir Cohen Construction");
  });
});
