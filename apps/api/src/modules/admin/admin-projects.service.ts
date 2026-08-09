import { Injectable } from "@nestjs/common";
import type { AdminProjectSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

/** Read-only cross-project oversight — staff can see every project, unlike ProjectsService which scopes to the caller's memberships. */
@Injectable()
export class AdminProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      include: { owner: true },
      orderBy: { createdAt: "desc" },
    });
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      status: p.status,
      ownerEmail: p.owner.email,
      createdAt: p.createdAt.toISOString(),
    }));
  }
}
