import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateTenderRequest,
  TenderDetailResponse,
  TenderInvitationSummary,
  TenderSummary,
} from "@buildguard/shared-types";
import type { ProjectRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MatchingEngine } from "./matching/matching.interface";
import { toBidSummary } from "./bid-summary";

const INVITE_TOP_N = 5;

@Injectable()
export class TendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingEngine,
    private readonly audit: AuditService,
  ) {}

  async create(projectId: string, dto: CreateTenderRequest, createdByUserId: string): Promise<TenderSummary> {
    const tender = await this.prisma.tender.create({
      data: {
        projectId,
        workCategoryId: dto.workCategoryId,
        title: dto.title,
        scopeDescription: dto.scopeDescription,
        budgetMinMinor: BigInt(dto.budgetMinMinor),
        budgetMaxMinor: BigInt(dto.budgetMaxMinor),
        currency: dto.currency,
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : undefined,
        createdByUserId,
      },
      include: { workCategory: true },
    });

    await this.audit.record({
      actorUserId: createdByUserId,
      actorType: "customer",
      action: "tender_created",
      entityType: "tender",
      entityId: tender.id,
      projectId,
    });

    return this.toTenderSummary(tender, null);
  }

  /**
   * Runs the matching engine and invites the top-N ranked contractors.
   * This is the "TenderPublished"/matching step from design doc §6.2 —
   * implemented as a direct service call since there's no event bus in this
   * repo (build plan §0).
   */
  async publish(projectId: string, tenderId: string, publishedByUserId: string): Promise<TenderSummary> {
    const tender = await this.findOwnedTender(projectId, tenderId);
    if (tender.status !== "draft") {
      throw new BadRequestException(`Tender is already ${tender.status}`);
    }

    const candidates = await this.matching.rankCandidates(
      {
        tenderId,
        projectId,
        workCategoryId: tender.workCategoryId,
        budgetMinMinor: tender.budgetMinMinor,
        budgetMaxMinor: tender.budgetMaxMinor,
      },
      INVITE_TOP_N,
    );

    await this.prisma.$transaction([
      this.prisma.tender.update({
        where: { id: tenderId },
        data: { status: "invited_bidding", publishedAt: new Date() },
      }),
      ...candidates.map((c) =>
        this.prisma.tenderInvitation.create({
          data: { tenderId, contractorProfileId: c.contractorProfileId, matchScore: c.matchScore },
        }),
      ),
    ]);

    await this.audit.record({
      actorUserId: publishedByUserId,
      actorType: "customer",
      action: "tender_published",
      entityType: "tender",
      entityId: tenderId,
      projectId,
      metadata: { invitedCount: candidates.length },
    });

    const updated = await this.prisma.tender.findUniqueOrThrow({
      where: { id: tenderId },
      include: { workCategory: true },
    });
    return this.toTenderSummary(updated, null);
  }

  async cancel(projectId: string, tenderId: string, cancelledByUserId: string): Promise<TenderSummary> {
    const tender = await this.findOwnedTender(projectId, tenderId);
    if (tender.status === "awarded" || tender.status === "cancelled" || tender.status === "closed") {
      throw new BadRequestException(`Tender is already ${tender.status}`);
    }

    const updated = await this.prisma.tender.update({
      where: { id: tenderId },
      data: { status: "cancelled" },
      include: { workCategory: true },
    });

    await this.audit.record({
      actorUserId: cancelledByUserId,
      actorType: "customer",
      action: "tender_cancelled",
      entityType: "tender",
      entityId: tenderId,
      projectId,
    });

    return this.toTenderSummary(updated, null);
  }

  async list(projectId: string): Promise<TenderSummary[]> {
    const tenders = await this.prisma.tender.findMany({
      where: { projectId },
      include: { workCategory: true },
      orderBy: { createdAt: "desc" },
    });
    return tenders.map((t) => this.toTenderSummary(t, null));
  }

  async getDetail(
    projectId: string,
    tenderId: string,
    callerUserId: string,
    callerRole: ProjectRole,
  ): Promise<TenderDetailResponse> {
    const tender = await this.findOwnedTender(projectId, tenderId);

    const isOwnerOrPm = callerRole === "owner" || callerRole === "project_manager";

    let invitations: TenderInvitationSummary[] = [];
    if (isOwnerOrPm) {
      const rows = await this.prisma.tenderInvitation.findMany({
        where: { tenderId },
        include: { contractorProfile: true },
        orderBy: { matchScore: "desc" },
      });
      invitations = rows.map((r) => ({
        contractorProfileId: r.contractorProfileId,
        companyName: r.contractorProfile.companyName,
        matchScore: Number(r.matchScore),
        status: r.status,
        invitedAt: r.invitedAt.toISOString(),
      }));
    }

    // A contractor never sees another contractor's bid — only their own,
    // and only via the current head of their own supersedes-chain.
    let myBid = null;
    if (callerRole === "contractor") {
      const ownProfile = await this.prisma.contractorProfile.findUnique({ where: { userId: callerUserId } });
      if (ownProfile) {
        const bids = await this.prisma.bid.findMany({
          where: { tenderId, contractorProfileId: ownProfile.id },
          include: { lineItems: true, contractorProfile: true },
          orderBy: { submittedAt: "desc" },
        });
        const supersededIds = new Set(bids.filter((b) => b.supersedesBidId).map((b) => b.supersedesBidId));
        const current = bids.find((b) => !supersededIds.has(b.id)) ?? null;
        myBid = current ? toBidSummary(current) : null;
      }
    }

    return { tender: this.toTenderSummary(tender, null), invitations, myBid };
  }

  private async findOwnedTender(projectId: string, tenderId: string) {
    const tender = await this.prisma.tender.findFirst({
      where: { id: tenderId, projectId },
      include: { workCategory: true },
    });
    if (!tender) throw new NotFoundException();
    return tender;
  }

  private toTenderSummary(
    tender: {
      id: string;
      projectId: string;
      workCategory: { id: string; name: string };
      title: string;
      scopeDescription: unknown;
      budgetMinMinor: bigint;
      budgetMaxMinor: bigint;
      currency: string;
      plannedStartDate: Date | null;
      plannedEndDate: Date | null;
      status: string;
      publishedAt: Date | null;
      createdAt: Date;
    },
    myBidId: string | null,
  ): TenderSummary {
    return {
      id: tender.id,
      projectId: tender.projectId,
      workCategory: { id: tender.workCategory.id, name: tender.workCategory.name },
      title: tender.title,
      scopeDescription: String(tender.scopeDescription),
      budgetMinMinor: tender.budgetMinMinor.toString(),
      budgetMaxMinor: tender.budgetMaxMinor.toString(),
      currency: tender.currency,
      plannedStartDate: tender.plannedStartDate?.toISOString() ?? null,
      plannedEndDate: tender.plannedEndDate?.toISOString() ?? null,
      status: tender.status as TenderSummary["status"],
      publishedAt: tender.publishedAt?.toISOString() ?? null,
      createdAt: tender.createdAt.toISOString(),
      myBidId,
    };
  }
}
