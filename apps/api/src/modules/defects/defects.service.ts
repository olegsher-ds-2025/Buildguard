import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Defect, DefectStatus, ProjectRole, User } from "@prisma/client";
import type { DefectAction, DefectSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AssignDefectDto } from "./dto/defect.dto";

const REVIEWER_ROLES: ProjectRole[] = ["owner", "project_manager", "inspector"];

const TRANSITIONS: Record<DefectAction, { from: DefectStatus; to: DefectStatus; event: string; reviewerOnly: boolean }> = {
  start: { from: "open", to: "in_progress", event: "started", reviewerOnly: false },
  fix: { from: "in_progress", to: "resolved", event: "fixed", reviewerOnly: false },
  verify: { from: "resolved", to: "closed", event: "verified", reviewerOnly: true },
  reopen: { from: "resolved", to: "in_progress", event: "reopened", reviewerOnly: true },
};

type DefectRow = Defect & { assignedToUser: Pick<User, "displayName"> | null };

@Injectable()
export class DefectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Contractors see only the defects assigned to them. */
  async list(projectId: string, userId: string, role: ProjectRole): Promise<DefectSummary[]> {
    const defects = await this.prisma.defect.findMany({
      where: { projectId, ...(role === "contractor" ? { assignedToUserId: userId } : {}) },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
      include: { assignedToUser: { select: { displayName: true } } },
    });
    return defects.map(toSummary);
  }

  async assign(projectId: string, defectId: string, dto: AssignDefectDto, actorUserId: string): Promise<DefectSummary> {
    await this.findOwned(projectId, defectId);
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.assigneeUserId } },
    });
    if (!member) throw new BadRequestException("Assignee is not a member of this project");

    const [updated] = await this.prisma.$transaction([
      this.prisma.defect.update({
        where: { id: defectId },
        data: { assignedToUserId: dto.assigneeUserId, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
        include: { assignedToUser: { select: { displayName: true } } },
      }),
      this.prisma.defectEvent.create({
        data: {
          defectId,
          eventType: "assigned",
          payload: { assigneeUserId: dto.assigneeUserId, dueDate: dto.dueDate ?? null },
          actorUserId,
        },
      }),
    ]);
    return toSummary(updated);
  }

  async transition(
    projectId: string,
    defectId: string,
    action: DefectAction,
    note: string | undefined,
    actor: { userId: string; role: ProjectRole },
  ): Promise<DefectSummary> {
    const defect = await this.findOwned(projectId, defectId);
    const rule = TRANSITIONS[action];
    const isReviewer = REVIEWER_ROLES.includes(actor.role);
    if (rule.reviewerOnly && !isReviewer) throw new ForbiddenException();
    if (!isReviewer && defect.assignedToUserId !== actor.userId) throw new ForbiddenException();
    if (defect.status !== rule.from) {
      throw new BadRequestException(`Cannot ${action} a defect that is ${defect.status}`);
    }
    if (action === "fix") {
      const afterPhotos = await this.prisma.photo.count({ where: { defectId, tag: "after" } });
      if (afterPhotos === 0) throw new BadRequestException("An 'after' photo is required to mark a defect fixed");
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.defect.update({
        where: { id: defectId },
        data: { status: rule.to },
        include: { assignedToUser: { select: { displayName: true } } },
      }),
      this.prisma.defectEvent.create({
        data: { defectId, eventType: rule.event, payload: { note: note ?? null }, actorUserId: actor.userId },
      }),
    ]);
    if (action === "verify") {
      await this.audit.record({
        actorUserId: actor.userId,
        actorType: "customer",
        action: "defect_verified",
        entityType: "defect",
        entityId: defectId,
        projectId,
      });
    }
    return toSummary(updated);
  }

  private async findOwned(projectId: string, defectId: string): Promise<Defect> {
    const defect = await this.prisma.defect.findFirst({ where: { id: defectId, projectId } });
    if (!defect) throw new NotFoundException();
    return defect;
  }
}

function toSummary(d: DefectRow): DefectSummary {
  return {
    id: d.id,
    title: d.title,
    severity: d.severity,
    status: d.status,
    source: d.source,
    phaseId: d.phaseId,
    assignedToUserId: d.assignedToUserId,
    assigneeName: d.assignedToUser?.displayName ?? null,
    dueDate: d.dueDate?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}
