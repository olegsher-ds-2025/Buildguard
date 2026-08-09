import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ContractorSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { RejectContractorDto } from "./dto/reject-contractor.dto";

@Injectable()
export class AdminContractorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ContractorSummary[]> {
    const contractors = await this.prisma.contractorProfile.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
    return contractors.map(this.toSummary);
  }

  async verify(contractorId: string, staffUserId: string): Promise<ContractorSummary> {
    const contractor = await this.findPending(contractorId);

    const updated = await this.prisma.contractorProfile.update({
      where: { id: contractorId },
      data: { verificationStatus: "verified", verifiedAt: new Date(), verifiedByStaffUserId: staffUserId },
      include: { user: true },
    });

    await this.audit.record({
      actorUserId: staffUserId,
      actorType: "staff",
      action: "contractor_verified",
      entityType: "contractor_profile",
      entityId: contractorId,
      metadata: { companyName: contractor.companyName },
    });

    return this.toSummary(updated);
  }

  async reject(contractorId: string, dto: RejectContractorDto, staffUserId: string): Promise<ContractorSummary> {
    const contractor = await this.findPending(contractorId);

    const updated = await this.prisma.contractorProfile.update({
      where: { id: contractorId },
      data: { verificationStatus: "rejected", verifiedAt: new Date(), verifiedByStaffUserId: staffUserId },
      include: { user: true },
    });

    await this.audit.record({
      actorUserId: staffUserId,
      actorType: "staff",
      action: "contractor_verification_rejected",
      entityType: "contractor_profile",
      entityId: contractorId,
      metadata: { companyName: contractor.companyName, reason: dto.reason },
    });

    return this.toSummary(updated);
  }

  private async findPending(contractorId: string) {
    const contractor = await this.prisma.contractorProfile.findUnique({ where: { id: contractorId } });
    if (!contractor) throw new NotFoundException();
    if (contractor.verificationStatus !== "pending" && contractor.verificationStatus !== "unverified") {
      throw new BadRequestException(`Contractor is already ${contractor.verificationStatus}`);
    }
    return contractor;
  }

  private toSummary(contractor: {
    id: string;
    companyName: string;
    licenseNumber: string | null;
    licenseExpiryDate: Date | null;
    insuranceExpiryDate: Date | null;
    verificationStatus: string;
    verifiedAt: Date | null;
    user: { email: string } | null;
  }): ContractorSummary {
    return {
      id: contractor.id,
      companyName: contractor.companyName,
      licenseNumber: contractor.licenseNumber,
      licenseExpiryDate: contractor.licenseExpiryDate?.toISOString() ?? null,
      insuranceExpiryDate: contractor.insuranceExpiryDate?.toISOString() ?? null,
      verificationStatus: contractor.verificationStatus as ContractorSummary["verificationStatus"],
      verifiedAt: contractor.verifiedAt?.toISOString() ?? null,
      userEmail: contractor.user?.email ?? null,
    };
  }
}
