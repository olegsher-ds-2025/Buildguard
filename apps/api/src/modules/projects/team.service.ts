import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ProjectMemberSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { InviteMemberDto } from "./dto/invite-member.dto";
import type { ChangeMemberRoleDto } from "./dto/change-member-role.dto";

/**
 * "Invite" here means adding an existing account to the project — there is
 * no self-serve signup or invite-email flow yet (a deliberate phase-1
 * simplification, see the build plan). Inviting an email with no account
 * fails clearly rather than silently doing nothing.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string): Promise<ProjectMemberSummary[]> {
    const [project, members] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
      this.prisma.projectMember.findMany({
        where: { projectId },
        include: { user: true },
        orderBy: { invitedAt: "asc" },
      }),
    ]);
    return members.map((m) => this.toSummary(m, project.ownerUserId));
  }

  async invite(projectId: string, dto: InviteMemberDto, invitedByUserId: string): Promise<ProjectMemberSummary> {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.userType !== "customer") {
      throw new NotFoundException(`No account exists for ${dto.email} yet — they need to sign up first.`);
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (existing) {
      throw new ConflictException(`${dto.email} is already a member of this project.`);
    }

    const member = await this.prisma.projectMember.create({
      data: { projectId, userId: user.id, role: dto.role, acceptedAt: new Date() },
      include: { user: true },
    });

    await this.audit.record({
      actorUserId: invitedByUserId,
      actorType: "customer",
      action: "project_member_invited",
      entityType: "project_member",
      entityId: user.id,
      projectId,
      metadata: { email: dto.email, role: dto.role },
    });

    return this.toSummary(member, project.ownerUserId);
  }

  async changeRole(
    projectId: string,
    targetUserId: string,
    dto: ChangeMemberRoleDto,
    actorUserId: string,
  ): Promise<ProjectMemberSummary> {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (targetUserId === project.ownerUserId && dto.role !== "owner") {
      throw new BadRequestException("Cannot change the project owner's role away from owner.");
    }

    const member = await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role: dto.role },
      include: { user: true },
    });

    await this.audit.record({
      actorUserId,
      actorType: "customer",
      action: "project_member_role_changed",
      entityType: "project_member",
      entityId: targetUserId,
      projectId,
      metadata: { newRole: dto.role },
    });

    return this.toSummary(member, project.ownerUserId);
  }

  async remove(projectId: string, targetUserId: string, actorUserId: string): Promise<void> {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (targetUserId === project.ownerUserId) {
      throw new BadRequestException("Cannot remove the project owner.");
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    await this.audit.record({
      actorUserId,
      actorType: "customer",
      action: "project_member_removed",
      entityType: "project_member",
      entityId: targetUserId,
      projectId,
    });
  }

  private toSummary(
    member: {
      userId: string;
      role: string;
      invitedAt: Date;
      acceptedAt: Date | null;
      user: { email: string; displayName: string };
    },
    ownerUserId: string,
  ): ProjectMemberSummary {
    return {
      userId: member.userId,
      email: member.user.email,
      displayName: member.user.displayName,
      role: member.role as ProjectMemberSummary["role"],
      invitedAt: member.invitedAt.toISOString(),
      acceptedAt: member.acceptedAt?.toISOString() ?? null,
      isOwner: member.userId === ownerUserId,
    };
  }
}
