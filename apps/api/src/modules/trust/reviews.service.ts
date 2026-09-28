import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateReviewRequest, ReviewSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

type ReviewWithRelations = {
  id: string;
  projectId: string;
  project: { name: string };
  contractorProfileId: string;
  contractorProfile: { companyName: string };
  reviewerUserId: string;
  reviewerUser: { displayName: string };
  contractId: string;
  rating: number;
  comment: string | null;
  status: string;
  createdAt: Date;
  dispute: { status: string } | null;
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The structural fraud barrier (design doc §6.3): a review requires a
   * real signed Contract between this reviewer's project and the
   * contractor — see the Trust Score section header in schema.prisma for
   * how this is scoped down from the design doc's "signed contract AND
   * completed verified milestone" ideal.
   */
  async create(projectId: string, dto: CreateReviewRequest, reviewerUserId: string): Promise<ReviewSummary> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: dto.contractId, projectId, status: { in: ["signed", "active", "completed"] } },
    });
    if (!contract) {
      throw new BadRequestException("No signed contract found for this project and contractor");
    }

    const existing = await this.prisma.review.findUnique({
      where: { contractId_reviewerUserId: { contractId: dto.contractId, reviewerUserId } },
    });
    if (existing) {
      throw new ConflictException("You have already reviewed this contract");
    }

    const review = await this.prisma.review.create({
      data: {
        projectId,
        contractorProfileId: contract.contractorProfileId,
        reviewerUserId,
        contractId: dto.contractId,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: { project: true, contractorProfile: true, reviewerUser: true, dispute: true },
    });

    await this.audit.record({
      actorUserId: reviewerUserId,
      actorType: "customer",
      action: "review_created",
      entityType: "review",
      entityId: review.id,
      projectId,
      metadata: { contractorProfileId: contract.contractorProfileId, rating: dto.rating },
    });

    return this.toSummary(review);
  }

  async listForProject(projectId: string): Promise<ReviewSummary[]> {
    const reviews = await this.prisma.review.findMany({
      where: { projectId },
      include: { project: true, contractorProfile: true, reviewerUser: true, dispute: true },
      orderBy: { createdAt: "desc" },
    });
    return reviews.map((r) => this.toSummary(r));
  }

  async listForContractor(contractorProfileId: string): Promise<ReviewSummary[]> {
    const reviews = await this.prisma.review.findMany({
      where: { contractorProfileId, status: "published" },
      include: { project: true, contractorProfile: true, reviewerUser: true, dispute: true },
      orderBy: { createdAt: "desc" },
    });
    return reviews.map((r) => this.toSummary(r));
  }

  /** Used by DisputesService to verify the caller is the reviewed contractor before letting them raise a dispute. */
  async findReviewOwnedByContractorUser(reviewId: string, contractorUserId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { contractorProfile: true },
    });
    if (!review) throw new NotFoundException();
    if (review.contractorProfile.userId !== contractorUserId) throw new ForbiddenException();
    return review;
  }

  private toSummary(review: ReviewWithRelations): ReviewSummary {
    return {
      id: review.id,
      projectId: review.projectId,
      projectName: review.project.name,
      contractorProfileId: review.contractorProfileId,
      companyName: review.contractorProfile.companyName,
      reviewerUserId: review.reviewerUserId,
      reviewerName: review.reviewerUser.displayName,
      contractId: review.contractId,
      rating: review.rating,
      comment: review.comment,
      status: review.status as ReviewSummary["status"],
      createdAt: review.createdAt.toISOString(),
      disputeStatus: (review.dispute?.status as ReviewSummary["disputeStatus"]) ?? null,
    };
  }
}
