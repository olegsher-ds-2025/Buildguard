import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminDisputeSummary,
  DisputeSummary,
  RaiseDisputeRequest,
  ResolveDisputeRequest,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ReviewsService } from "./reviews.service";

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  /** Only the reviewed contractor's own linked user may dispute a review about them (design doc §6.3: "appeals go through the dispute process"). */
  async raise(reviewId: string, dto: RaiseDisputeRequest, contractorUserId: string): Promise<DisputeSummary> {
    const review = await this.reviews.findReviewOwnedByContractorUser(reviewId, contractorUserId);
    if (review.status !== "published") {
      throw new BadRequestException(`Review is already ${review.status}`);
    }

    const existing = await this.prisma.dispute.findUnique({ where: { reviewId } });
    if (existing) {
      throw new ConflictException("This review already has a dispute");
    }

    const dispute = await this.prisma.dispute.create({
      data: { reviewId, raisedByUserId: contractorUserId, reason: dto.reason },
    });

    await this.audit.record({
      actorUserId: contractorUserId,
      actorType: "customer",
      action: "dispute_raised",
      entityType: "dispute",
      entityId: dispute.id,
      metadata: { reviewId },
    });

    return this.toSummary(dispute);
  }

  async resolve(disputeId: string, dto: ResolveDisputeRequest, staffUserId: string): Promise<DisputeSummary> {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException();
    if (dispute.status !== "open") {
      throw new BadRequestException(`Dispute is already ${dispute.status}`);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: dto.upheld ? "upheld" : "dismissed",
          resolvedAt: new Date(),
          resolvedByStaffUserId: staffUserId,
          resolutionNote: dto.resolutionNote,
        },
      }),
      this.prisma.review.update({
        where: { id: dispute.reviewId },
        data: { status: dto.upheld ? "rejected" : "published" },
      }),
    ]);

    await this.audit.record({
      actorUserId: staffUserId,
      actorType: "staff",
      action: dto.upheld ? "dispute_upheld" : "dispute_dismissed",
      entityType: "dispute",
      entityId: disputeId,
      metadata: { reviewId: dispute.reviewId },
    });

    return this.toSummary(updated);
  }

  /** Cross-project oversight for staff — see admin-disputes.controller.ts. */
  async listOpenForAdmin(): Promise<AdminDisputeSummary[]> {
    const disputes = await this.prisma.dispute.findMany({
      where: { status: "open" },
      include: { review: { include: { contractorProfile: true } } },
      orderBy: { createdAt: "asc" },
    });
    return disputes.map((d) => ({
      id: d.id,
      reviewId: d.reviewId,
      companyName: d.review.contractorProfile.companyName,
      reviewRating: d.review.rating,
      reason: d.reason,
      status: d.status as AdminDisputeSummary["status"],
      createdAt: d.createdAt.toISOString(),
    }));
  }

  private toSummary(dispute: {
    id: string;
    reviewId: string;
    reason: string;
    status: string;
    resolvedAt: Date | null;
    resolutionNote: string | null;
    createdAt: Date;
  }): DisputeSummary {
    return {
      id: dispute.id,
      reviewId: dispute.reviewId,
      reason: dispute.reason,
      status: dispute.status as DisputeSummary["status"],
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      resolutionNote: dispute.resolutionNote,
      createdAt: dispute.createdAt.toISOString(),
    };
  }
}
