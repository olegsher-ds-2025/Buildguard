import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { DisputesService } from "./disputes.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { ReviewsService } from "./reviews.service";

describe("DisputesService", () => {
  const review = { id: "review-1", status: "published" };
  const dispute = {
    id: "dispute-1",
    reviewId: "review-1",
    reason: "Unfair — client never paid the deposit",
    status: "open",
    resolvedAt: null,
    resolutionNote: null,
    createdAt: new Date("2026-09-02T00:00:00Z"),
  };

  function makeService(overrides: { review?: Partial<typeof review>; dispute?: Partial<typeof dispute> | null } = {}) {
    const prisma = {
      dispute: {
        findUnique: jest.fn().mockResolvedValue(overrides.dispute === undefined ? null : overrides.dispute),
        create: jest.fn().mockResolvedValue(dispute),
        update: jest.fn().mockImplementation(({ data }) => ({ ...dispute, ...data })),
      },
      review: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    const reviews = {
      findReviewOwnedByContractorUser: jest.fn().mockResolvedValue({ ...review, ...overrides.review }),
    } as unknown as ReviewsService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { service: new DisputesService(prisma, reviews, audit), prisma, audit };
  }

  it("rejects raising a dispute against a review that isn't published (already rejected)", async () => {
    const { service } = makeService({ review: { status: "rejected" } });
    await expect(service.raise("review-1", { reason: "x" }, "amir-user")).rejects.toThrow(BadRequestException);
  });

  it("rejects a second dispute on the same review", async () => {
    const { service } = makeService({ dispute });
    await expect(service.raise("review-1", { reason: "x" }, "amir-user")).rejects.toThrow(ConflictException);
  });

  it("raises a dispute and records an audit entry", async () => {
    const { service, prisma, audit } = makeService();
    const result = await service.raise("review-1", { reason: "Unfair" }, "amir-user");
    expect(prisma.dispute.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewId: "review-1", raisedByUserId: "amir-user" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "dispute_raised" }));
    expect(result.id).toBe("dispute-1");
  });

  it("resolve() 404s for an unknown dispute", async () => {
    const { service, prisma } = makeService();
    (prisma.dispute.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.resolve("dispute-1", { upheld: true }, "staff-1")).rejects.toThrow(NotFoundException);
  });

  it("resolve() rejects resolving an already-resolved dispute", async () => {
    const { service, prisma } = makeService();
    (prisma.dispute.findUnique as jest.Mock).mockResolvedValue({ ...dispute, status: "upheld" });
    await expect(service.resolve("dispute-1", { upheld: false }, "staff-1")).rejects.toThrow(BadRequestException);
  });

  it("upholding a dispute rejects the review", async () => {
    const { service, prisma } = makeService();
    (prisma.dispute.findUnique as jest.Mock).mockResolvedValue(dispute);
    await service.resolve("dispute-1", { upheld: true }, "staff-1");
    expect(prisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "review-1" }, data: expect.objectContaining({ status: "rejected" }) }),
    );
  });

  it("dismissing a dispute leaves the review published", async () => {
    const { service, prisma } = makeService();
    (prisma.dispute.findUnique as jest.Mock).mockResolvedValue(dispute);
    await service.resolve("dispute-1", { upheld: false }, "staff-1");
    expect(prisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "review-1" }, data: expect.objectContaining({ status: "published" }) }),
    );
  });
});
