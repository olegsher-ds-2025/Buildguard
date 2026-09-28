import { Injectable } from "@nestjs/common";
import type { AdminContractSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

/** Read-only cross-project oversight — see admin-projects.service.ts for the same pattern. */
@Injectable()
export class AdminContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminContractSummary[]> {
    const contracts = await this.prisma.contract.findMany({
      include: { project: true, contractorProfile: true },
      orderBy: { createdAt: "desc" },
    });
    return contracts.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      projectName: c.project.name,
      companyName: c.contractorProfile.companyName,
      totalAmountMinor: c.totalAmountMinor.toString(),
      currency: c.currency,
      status: c.status as AdminContractSummary["status"],
      signedAt: c.signedAt?.toISOString() ?? null,
    }));
  }
}
