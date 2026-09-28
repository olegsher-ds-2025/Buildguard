import { Injectable } from "@nestjs/common";
import type { WorkCategorySummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class WorkCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WorkCategorySummary[]> {
    const categories = await this.prisma.workCategory.findMany({ orderBy: { name: "asc" } });
    return categories.map((c) => ({ id: c.id, name: c.name }));
  }
}
