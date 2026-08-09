import { Injectable } from "@nestjs/common";
import type { AuditEntrySummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

const MAX_ENTRIES = 200;

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AuditEntrySummary[]> {
    const entries = await this.prisma.auditEntry.findMany({
      include: { actorUser: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ENTRIES,
    });
    return entries.map((e) => ({
      id: e.id,
      actorType: e.actorType,
      actorEmail: e.actorUser?.email ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      projectId: e.projectId,
      metadata: e.metadata as Record<string, unknown>,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
