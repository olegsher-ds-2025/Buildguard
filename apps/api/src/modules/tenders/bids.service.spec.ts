import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { BidsService } from "./bids.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

describe("BidsService", () => {
  const tender = { id: "tender-1", projectId: "proj-1", status: "invited_bidding" };
  const contractorProfile = { id: "contractor-1", verificationStatus: "verified" };
  const invitation = { tenderId: "tender-1", contractorProfileId: "contractor-1" };
  const submitDto = {
    totalAmountMinor: "500000",
    currency: "ILS",
    paymentTermsDescription: "50/50",
  };

  function makeService(overrides: {
    tender?: Partial<typeof tender>;
    contractorProfile?: Partial<typeof contractorProfile> | null;
    invitation?: typeof invitation | null;
    existingBids?: unknown[];
  } = {}) {
    const createdBid = {
      id: "bid-1",
      contractorProfileId: "contractor-1",
      contractorProfile: { companyName: "Amir Cohen Construction" },
      totalAmountMinor: 500_000n,
      currency: "ILS",
      proposedStartDate: null,
      proposedEndDate: null,
      paymentTermsDescription: "50/50",
      status: "submitted",
      submittedAt: new Date("2026-09-05T00:00:00Z"),
      lineItems: [],
      supersedesBidId: null,
    };

    const prisma = {
      tender: { findFirst: jest.fn().mockResolvedValue({ ...tender, ...overrides.tender }) },
      contractorProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            overrides.contractorProfile === null ? null : { ...contractorProfile, ...overrides.contractorProfile },
          ),
      },
      tenderInvitation: {
        findUnique: jest.fn().mockResolvedValue(overrides.invitation === undefined ? invitation : overrides.invitation),
        update: jest.fn().mockResolvedValue({}),
      },
      bid: {
        findMany: jest.fn().mockResolvedValue(overrides.existingBids ?? []),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ data }) => ({ ...createdBid, ...data })),
      },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          bid: { create: jest.fn().mockResolvedValue(createdBid) },
          tenderInvitation: { update: jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as PrismaService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { service: new BidsService(prisma, audit), prisma, audit };
  }

  it("rejects a bid from a contractor who was never invited to this tender", async () => {
    const { service } = makeService({ invitation: null });
    await expect(service.submit("proj-1", "tender-1", submitDto, "user-1")).rejects.toThrow(ForbiddenException);
  });

  it("rejects a bid from an invited but unverified contractor", async () => {
    const { service } = makeService({ contractorProfile: { verificationStatus: "pending" } });
    await expect(service.submit("proj-1", "tender-1", submitDto, "user-1")).rejects.toThrow(ForbiddenException);
  });

  it("rejects a bid when the tender isn't open for bidding", async () => {
    const { service } = makeService({ tender: { status: "draft" } });
    await expect(service.submit("proj-1", "tender-1", submitDto, "user-1")).rejects.toThrow(BadRequestException);
  });

  it("accepts a bid from an invited, verified contractor and marks the invitation bid_submitted", async () => {
    const { service } = makeService();
    const result = await service.submit("proj-1", "tender-1", submitDto, "user-1");
    expect(result.id).toBe("bid-1");
    expect(result.companyName).toBe("Amir Cohen Construction");
  });

  it("withdraw() rejects withdrawing another contractor's bid", async () => {
    const { service, prisma } = makeService();
    (prisma.bid.findFirst as jest.Mock).mockResolvedValue({
      id: "bid-1",
      contractorProfileId: "someone-else",
      status: "submitted",
      lineItems: [],
      contractorProfile: { companyName: "X" },
    });
    await expect(service.withdraw("proj-1", "tender-1", "bid-1", "user-1")).rejects.toThrow(ForbiddenException);
  });

  it("withdraw() 404s for a bid that doesn't exist on this tender/project", async () => {
    const { service, prisma } = makeService();
    (prisma.bid.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.withdraw("proj-1", "tender-1", "bid-1", "user-1")).rejects.toThrow(NotFoundException);
  });

  it("findCurrentOwnBid() resolves the current head of the supersedes-chain, excluding superseded rows", async () => {
    const { service } = makeService({
      existingBids: [
        { id: "bid-2", supersedesBidId: "bid-1", status: "submitted", submittedAt: new Date("2026-09-06") },
        { id: "bid-1", supersedesBidId: null, status: "submitted", submittedAt: new Date("2026-09-05") },
      ],
    });
    const current = await service.findCurrentOwnBid("tender-1", "contractor-1");
    expect(current?.id).toBe("bid-2");
  });
});
