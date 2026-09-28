import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ContractPaymentMilestoneSummary, ContractSummary } from "@buildguard/shared-types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * "Select winner" from design doc §6.2's tender flow: closes the tender
   * (status -> awarded) and creates a Contract in `draft`. Signing is a
   * separate, explicit step (see sign() below).
   */
  async selectWinner(projectId: string, tenderId: string, bidId: string, ownerUserId: string): Promise<ContractSummary> {
    const tender = await this.prisma.tender.findFirst({ where: { id: tenderId, projectId } });
    if (!tender) throw new NotFoundException();
    if (tender.status !== "invited_bidding") {
      throw new BadRequestException(`Tender is not awaiting a winner (status: ${tender.status})`);
    }

    const bid = await this.prisma.bid.findFirst({ where: { id: bidId, tenderId } });
    if (!bid) throw new NotFoundException();
    if (bid.status !== "submitted") {
      throw new BadRequestException(`Bid is not eligible for award (status: ${bid.status})`);
    }

    const contract = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          tenderId,
          projectId,
          contractorProfileId: bid.contractorProfileId,
          winningBidId: bid.id,
          totalAmountMinor: bid.totalAmountMinor,
          currency: bid.currency,
        },
      });
      await tx.tender.update({ where: { id: tenderId }, data: { status: "awarded" } });
      await tx.bid.update({ where: { id: bidId }, data: { status: "accepted" } });
      return created;
    });

    await this.audit.record({
      actorUserId: ownerUserId,
      actorType: "customer",
      action: "tender_awarded",
      entityType: "contract",
      entityId: contract.id,
      projectId,
      metadata: { tenderId, winningBidId: bidId },
    });

    return this.getContract(projectId, contract.id);
  }

  /**
   * Sets signedAt/signedByOwnerUserId exactly once — guarded here the same
   * way Milestone verification is (a mutable row whose sensitive transition
   * happens at most once), not by DB-level append-only, since @@unique on
   * Contract.tenderId means there's nothing to supersede (build plan §2).
   */
  async sign(projectId: string, contractId: string, ownerUserId: string): Promise<ContractSummary> {
    const contract = await this.findOwnedContract(projectId, contractId);
    if (contract.status !== "draft") {
      throw new BadRequestException(`Contract is already ${contract.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: { status: "signed", signedAt: new Date(), signedByOwnerUserId: ownerUserId },
      });
      await this.generatePaymentMilestones(tx, contract);
    });

    await this.audit.record({
      actorUserId: ownerUserId,
      actorType: "customer",
      action: "contract_signed",
      entityType: "contract",
      entityId: contractId,
      projectId,
    });

    return this.getContract(projectId, contractId);
  }

  async getContract(projectId: string, contractId: string): Promise<ContractSummary> {
    const contract = await this.findOwnedContract(projectId, contractId);
    const milestones = await this.prisma.contractPaymentMilestone.findMany({
      where: { contractId },
      orderBy: { sequenceNo: "asc" },
    });
    return this.toSummary(contract, milestones);
  }

  async listPaymentMilestones(projectId: string, contractId: string): Promise<ContractPaymentMilestoneSummary[]> {
    await this.findOwnedContract(projectId, contractId);
    const milestones = await this.prisma.contractPaymentMilestone.findMany({
      where: { contractId },
      orderBy: { sequenceNo: "asc" },
    });
    return milestones.map(this.toMilestoneSummary);
  }

  /**
   * v1 simplification (build plan §9): the owner can't yet define a custom
   * payment schedule, so this defaults to one milestone per project phase,
   * proportioned by that phase's planned-budget share of the total. This is
   * the escrow *structure* only — no funds move (Phase 4's job).
   */
  private async generatePaymentMilestones(
    tx: Prisma.TransactionClient,
    contract: { id: string; projectId: string; totalAmountMinor: bigint; currency: string },
  ): Promise<void> {
    const phases = await tx.phase.findMany({
      where: { projectId: contract.projectId },
      orderBy: { sequenceNo: "asc" },
    });

    if (phases.length === 0) {
      await tx.contractPaymentMilestone.create({
        data: {
          contractId: contract.id,
          sequenceNo: 1,
          description: "Full contract amount on completion",
          amountMinor: contract.totalAmountMinor,
          currency: contract.currency,
        },
      });
      return;
    }

    const totalPlanned = phases.reduce((sum, p) => sum + p.budgetPlannedMinor, 0n);
    let allocated = 0n;
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const isLast = i === phases.length - 1;
      const amount = isLast
        ? contract.totalAmountMinor - allocated
        : totalPlanned > 0n
          ? (contract.totalAmountMinor * phase.budgetPlannedMinor) / totalPlanned
          : contract.totalAmountMinor / BigInt(phases.length);
      allocated += amount;

      await tx.contractPaymentMilestone.create({
        data: {
          contractId: contract.id,
          phaseId: phase.id,
          sequenceNo: i + 1,
          description: `Payment on completion of phase: ${phase.name}`,
          amountMinor: amount,
          currency: contract.currency,
        },
      });
    }
  }

  private async findOwnedContract(projectId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, projectId },
      include: { contractorProfile: true },
    });
    if (!contract) throw new NotFoundException();
    return contract;
  }

  private toMilestoneSummary(milestone: {
    id: string;
    sequenceNo: number;
    description: string;
    amountMinor: bigint;
    currency: string;
    status: string;
    releasedAt: Date | null;
  }): ContractPaymentMilestoneSummary {
    return {
      id: milestone.id,
      sequenceNo: milestone.sequenceNo,
      description: milestone.description,
      amountMinor: milestone.amountMinor.toString(),
      currency: milestone.currency,
      status: milestone.status as ContractPaymentMilestoneSummary["status"],
      releasedAt: milestone.releasedAt?.toISOString() ?? null,
    };
  }

  private toSummary(
    contract: {
      id: string;
      tenderId: string;
      projectId: string;
      contractorProfileId: string;
      contractorProfile: { companyName: string };
      totalAmountMinor: bigint;
      currency: string;
      status: string;
      signedAt: Date | null;
    },
    milestones: {
      id: string;
      sequenceNo: number;
      description: string;
      amountMinor: bigint;
      currency: string;
      status: string;
      releasedAt: Date | null;
    }[],
  ): ContractSummary {
    return {
      id: contract.id,
      tenderId: contract.tenderId,
      projectId: contract.projectId,
      contractorProfileId: contract.contractorProfileId,
      companyName: contract.contractorProfile.companyName,
      totalAmountMinor: contract.totalAmountMinor.toString(),
      currency: contract.currency,
      status: contract.status as ContractSummary["status"],
      signedAt: contract.signedAt?.toISOString() ?? null,
      paymentMilestones: milestones.map(this.toMilestoneSummary),
    };
  }
}
