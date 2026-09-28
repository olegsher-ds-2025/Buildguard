import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ReviewsService } from "./reviews.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";

describe("ReviewsService", () => {
  const contract = { id: "contract-1", projectId: "proj-1", contractorProfileId: "contractor-1", status: "signed" };
  const createdReview = {
    id: "review-1",
    projectId: "proj-1",
    project: { name: "Villa Sharon" },
    contractorProfileId: "contractor-1",
    contractorProfile: { companyName: "Amir Cohen Construction" },
    reviewerUserId: "owner-1",
    reviewerUser: { displayName: "D. Mizrahi" },
    contractId: "contract-1",
    rating: 5,
    comment: "Great work",
    status: "published",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    dispute: null,
  };

  function makeService(overrides: { contract?: Partial<typeof contract> | null; existingReview?: unknown } = {}) {
    const prisma = {
      contract: {
        findFirst: jest.fn().mockResolvedValue(overrides.contract === null ? null : { ...contract, ...overrides.contract }),
      },
      review: {
        findUnique: jest.fn().mockResolvedValue(overrides.existingReview ?? null),
        create: jest.fn().mockResolvedValue(createdReview),
        findMany: jest.fn().mockResolvedValue([createdReview]),
      },
    } as unknown as PrismaService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { service: new ReviewsService(prisma, audit), prisma, audit };
  }

  it("rejects a review with no signed contract between this project and contractor", async () => {
    const { service } = makeService({ contract: null });
    await expect(
      service.create("proj-1", { contractId: "contract-1", rating: 5 }, "owner-1"),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a review against a contract that's still in draft (not yet signed)", async () => {
    const { service, prisma } = makeService();
    (prisma.contract.findFirst as jest.Mock).mockResolvedValue(null); // draft excluded by the query's status filter
    await expect(
      service.create("proj-1", { contractId: "contract-1", rating: 5 }, "owner-1"),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a second review on the same contract by the same reviewer", async () => {
    const { service } = makeService({ existingReview: createdReview });
    await expect(
      service.create("proj-1", { contractId: "contract-1", rating: 4 }, "owner-1"),
    ).rejects.toThrow(ConflictException);
  });

  it("creates a review tied to the contract's contractor and records an audit entry", async () => {
    const { service, prisma, audit } = makeService();
    const result = await service.create("proj-1", { contractId: "contract-1", rating: 5, comment: "Great work" }, "owner-1");

    expect(prisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contractorProfileId: "contractor-1", rating: 5 }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "review_created" }));
    expect(result.companyName).toBe("Amir Cohen Construction");
  });

  it("findReviewOwnedByContractorUser 404s for an unknown review", async () => {
    const { service, prisma } = makeService();
    (prisma.review as unknown as { findUnique: jest.Mock }).findUnique = jest.fn().mockResolvedValue(null);
    await expect(service.findReviewOwnedByContractorUser("review-1", "some-user")).rejects.toThrow(NotFoundException);
  });

  it("findReviewOwnedByContractorUser 403s when the caller isn't the reviewed contractor's linked user", async () => {
    const { service, prisma } = makeService();
    (prisma.review as unknown as { findUnique: jest.Mock }).findUnique = jest
      .fn()
      .mockResolvedValue({ ...createdReview, contractorProfile: { userId: "amir-user" } });
    await expect(service.findReviewOwnedByContractorUser("review-1", "someone-else")).rejects.toThrow(
      ForbiddenException,
    );
  });
});
