import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface AuditRecordInput {
  actorUserId?: string;
  actorType: "customer" | "staff" | "system";
  action: string;
  entityType: string;
  entityId: string;
  projectId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only (design doc §8) — audit_entries has UPDATE/DELETE revoked
 * (M1 migration). This service only ever INSERTs.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditRecordInput): Promise<void> {
    await this.prisma.auditEntry.create({
      data: {
        actorUserId: entry.actorUserId,
        actorType: entry.actorType,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        projectId: entry.projectId,
        metadata: entry.metadata ?? {},
      },
    });
  }
}
