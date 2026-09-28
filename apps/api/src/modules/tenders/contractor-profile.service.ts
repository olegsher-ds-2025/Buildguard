import { Injectable, NotFoundException } from "@nestjs/common";
import type { ContractorProfileSelfSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import type { UpdateContractorProfileDto } from "./dto/update-contractor-profile.dto";

@Injectable()
export class ContractorProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string): Promise<ContractorProfileSelfSummary> {
    const profile = await this.findOwn(userId);
    return this.toSummary(profile);
  }

  async updateMine(userId: string, dto: UpdateContractorProfileDto): Promise<ContractorProfileSelfSummary> {
    const profile = await this.findOwn(userId);

    if (dto.categoryIds) {
      await this.prisma.$transaction([
        this.prisma.contractorCategory.deleteMany({ where: { contractorProfileId: profile.id } }),
        this.prisma.contractorCategory.createMany({
          data: dto.categoryIds.map((workCategoryId) => ({ contractorProfileId: profile.id, workCategoryId })),
        }),
      ]);
    }

    if (dto.currentlyAvailable !== undefined) {
      await this.prisma.contractorProfile.update({
        where: { id: profile.id },
        data: { currentlyAvailable: dto.currentlyAvailable },
      });
    }

    return this.getMine(userId);
  }

  private async findOwn(userId: string) {
    const profile = await this.prisma.contractorProfile.findUnique({
      where: { userId },
      include: { categories: { include: { workCategory: true } } },
    });
    if (!profile) throw new NotFoundException();
    return profile;
  }

  private toSummary(profile: {
    id: string;
    companyName: string;
    verificationStatus: string;
    currentlyAvailable: boolean;
    categories: { workCategory: { id: string; name: string } }[];
  }): ContractorProfileSelfSummary {
    return {
      id: profile.id,
      companyName: profile.companyName,
      verificationStatus: profile.verificationStatus as ContractorProfileSelfSummary["verificationStatus"],
      currentlyAvailable: profile.currentlyAvailable,
      categories: profile.categories.map((c) => ({ id: c.workCategory.id, name: c.workCategory.name })),
    };
  }
}
