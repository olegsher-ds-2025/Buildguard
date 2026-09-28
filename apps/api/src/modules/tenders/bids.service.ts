import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { BidSummary, SubmitBidRequest } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toBidSummary } from "./bid-summary";

@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A contractor may only bid once they're both (a) invited onto this
   * specific tender by the matching engine and (b) currently verified —
   * checked here, not just by the route guard, because "invited + verified"
   * is a business rule about this tender, not a generic role check.
   */
  async submit(
    projectId: string,
    tenderId: string,
    dto: SubmitBidRequest,
    contractorUserId: string,
  ): Promise<BidSummary> {
    const tender = await this.prisma.tender.findFirst({ where: { id: tenderId, projectId } });
    if (!tender) throw new NotFoundException();
    if (tender.status !== "invited_bidding") {
      throw new BadRequestException(`Tender is not open for bids (status: ${tender.status})`);
    }

    const contractorProfile = await this.prisma.contractorProfile.findUnique({ where: { userId: contractorUserId } });
    if (!contractorProfile || contractorProfile.verificationStatus !== "verified") {
      throw new ForbiddenException("Only a verified contractor profile can submit a bid");
    }

    const invitation = await this.prisma.tenderInvitation.findUnique({
      where: { tenderId_contractorProfileId: { tenderId, contractorProfileId: contractorProfile.id } },
    });
    if (!invitation) {
      throw new ForbiddenException("Not invited to bid on this tender");
    }

    // A revision is a new append-only row referencing the one it replaces
    // (Bid.supersedesBidId) — never a mutation of the prior offer.
    const priorBid = await this.findCurrentOwnBid(tenderId, contractorProfile.id);

    const bid = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bid.create({
        data: {
          tenderId,
          contractorProfileId: contractorProfile.id,
          totalAmountMinor: BigInt(dto.totalAmountMinor),
          currency: dto.currency,
          proposedStartDate: dto.proposedStartDate ? new Date(dto.proposedStartDate) : undefined,
          proposedEndDate: dto.proposedEndDate ? new Date(dto.proposedEndDate) : undefined,
          paymentTermsDescription: dto.paymentTermsDescription,
          supersedesBidId: priorBid?.status === "submitted" ? priorBid.id : undefined,
          lineItems: dto.lineItems
            ? {
                create: dto.lineItems.map((li) => ({
                  description: li.description,
                  quantity: li.quantity,
                  unitAmountMinor: BigInt(li.unitAmountMinor),
                  currency: li.currency,
                })),
              }
            : undefined,
        },
        include: { lineItems: true, contractorProfile: true },
      });

      await tx.tenderInvitation.update({
        where: { tenderId_contractorProfileId: { tenderId, contractorProfileId: contractorProfile.id } },
        data: { status: "bid_submitted", respondedAt: new Date() },
      });

      return created;
    });

    await this.audit.record({
      actorUserId: contractorUserId,
      actorType: "customer",
      action: "bid_submitted",
      entityType: "bid",
      entityId: bid.id,
      projectId,
      metadata: { tenderId },
    });

    return toBidSummary(bid);
  }

  async withdraw(
    projectId: string,
    tenderId: string,
    bidId: string,
    contractorUserId: string,
  ): Promise<BidSummary> {
    const contractorProfile = await this.prisma.contractorProfile.findUnique({ where: { userId: contractorUserId } });
    if (!contractorProfile) throw new NotFoundException();

    const bid = await this.prisma.bid.findFirst({
      where: { id: bidId, tenderId, tender: { projectId } },
      include: { lineItems: true, contractorProfile: true },
    });
    if (!bid) throw new NotFoundException();
    if (bid.contractorProfileId !== contractorProfile.id) throw new ForbiddenException();
    if (bid.status !== "submitted") {
      throw new BadRequestException(`Bid is already ${bid.status}`);
    }

    const updated = await this.prisma.bid.update({
      where: { id: bidId },
      data: { status: "withdrawn", withdrawnAt: new Date() },
      include: { lineItems: true, contractorProfile: true },
    });

    await this.audit.record({
      actorUserId: contractorUserId,
      actorType: "customer",
      action: "bid_withdrawn",
      entityType: "bid",
      entityId: bidId,
      projectId,
    });

    return toBidSummary(updated);
  }

  /** Owner/PM-only comparison table — current (non-superseded) bid per contractor. Enforced by the route guard, not here. */
  async listForComparison(projectId: string, tenderId: string): Promise<BidSummary[]> {
    const tender = await this.prisma.tender.findFirst({ where: { id: tenderId, projectId } });
    if (!tender) throw new NotFoundException();

    const bids = await this.prisma.bid.findMany({
      where: { tenderId },
      include: { lineItems: true, contractorProfile: true },
      orderBy: { submittedAt: "desc" },
    });
    const supersededIds = new Set(bids.filter((b) => b.supersedesBidId).map((b) => b.supersedesBidId));
    return bids.filter((b) => !supersededIds.has(b.id)).map(toBidSummary);
  }

  async findCurrentOwnBid(tenderId: string, contractorProfileId: string) {
    const bids = await this.prisma.bid.findMany({
      where: { tenderId, contractorProfileId },
      orderBy: { submittedAt: "desc" },
    });
    const supersededIds = new Set(bids.filter((b) => b.supersedesBidId).map((b) => b.supersedesBidId));
    return bids.find((b) => !supersededIds.has(b.id)) ?? null;
  }
}
