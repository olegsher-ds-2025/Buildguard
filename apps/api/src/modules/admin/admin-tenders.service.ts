import { Injectable } from "@nestjs/common";
import type { AdminTenderSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

/** Read-only cross-project oversight — see admin-projects.service.ts for the same pattern. */
@Injectable()
export class AdminTendersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminTenderSummary[]> {
    const tenders = await this.prisma.tender.findMany({
      include: { project: true, _count: { select: { bids: true } } },
      orderBy: { createdAt: "desc" },
    });
    return tenders.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      title: t.title,
      status: t.status as AdminTenderSummary["status"],
      bidCount: t._count.bids,
      createdAt: t.createdAt.toISOString(),
    }));
  }
}
