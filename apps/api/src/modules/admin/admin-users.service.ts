import { Injectable } from "@nestjs/common";
import type { ClientSummary, UserDirectoryEntry } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(): Promise<UserDirectoryEntry[]> {
    const users = await this.prisma.user.findMany({
      include: { staffProfile: true },
      orderBy: { createdAt: "desc" },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      userType: u.userType,
      staffRole: u.staffProfile?.staffRole,
      status: u.status,
    }));
  }

  async listClients(): Promise<ClientSummary[]> {
    const owners = await this.prisma.user.findMany({
      where: { userType: "customer", ownedProjects: { some: {} } },
      include: { _count: { select: { ownedProjects: true } } },
      orderBy: { createdAt: "desc" },
    });
    return owners.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      projectCount: u._count.ownedProjects,
    }));
  }
}
