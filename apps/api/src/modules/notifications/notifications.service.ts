import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ProjectRole } from "@prisma/client";
import type { NotificationSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Notifies every project member holding one of `roles`, at most once per
   * `dedupeKey` per user, so a recurring check can call this freely.
   * Returns how many notifications were created.
   */
  async notifyProject(
    projectId: string,
    roles: ProjectRole[],
    type: string,
    payload: Record<string, unknown>,
    dedupeKey: string,
  ): Promise<number> {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, role: { in: roles } },
      select: { userId: true },
    });
    let created = 0;
    for (const { userId } of members) {
      const already = await this.prisma.notification.findFirst({
        where: { userId, projectId, type, payload: { path: ["dedupeKey"], equals: dedupeKey } },
        select: { id: true },
      });
      if (already) continue;
      await this.prisma.notification.create({
        data: { userId, projectId, type, payload: { ...payload, dedupeKey } as Prisma.InputJsonValue },
      });
      created++;
    }
    return created;
  }

  async list(userId: string, unreadOnly: boolean): Promise<NotificationSummary[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((n) => ({
      id: n.id,
      projectId: n.projectId,
      type: n.type,
      payload: n.payload as Record<string, unknown>,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true } });
      if (!exists) throw new NotFoundException();
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}
