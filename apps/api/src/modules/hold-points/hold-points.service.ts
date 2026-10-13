import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { HoldPointEvent, Prisma } from "@prisma/client";
import type { HoldPointSignerCapacity, HoldPointState, HoldPointSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BypassHoldPointDto, ReopenHoldPointDto, SignHoldPointDto } from "./dto/hold-point.dto";

type Db = PrismaService | Prisma.TransactionClient;

const HOLD_POINT_INCLUDE = {
  phase: { select: { name: true } },
  events: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.HoldPointInclude;

type HoldPointRow = Prisma.HoldPointGetPayload<{ include: typeof HOLD_POINT_INCLUDE }>;

function stateOf(latest: HoldPointEvent | undefined): HoldPointState {
  if (!latest || latest.kind === "reopened") return "open";
  return latest.kind;
}

@Injectable()
export class HoldPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The gate. Throws 409 naming the open hold points; used by every action that
   * advances a phase or releases its money, inside the caller's transaction so
   * a hold point can't be reopened between the check and the write.
   */
  async assertNoOpenHoldPoints(db: Db, phaseId: string): Promise<void> {
    const holdPoints = await db.holdPoint.findMany({ where: { phaseId }, include: { events: { orderBy: { createdAt: "desc" }, take: 1 } } });
    const open = holdPoints.filter((h) => stateOf(h.events[0]) === "open");
    if (open.length > 0) {
      throw new ConflictException({
        message: `${open.length} open hold point(s) block this action`,
        openHoldPoints: open.map((h) => ({ id: h.id, text: h.text })),
      });
    }
  }

  async list(projectId: string, phaseId?: string): Promise<HoldPointSummary[]> {
    const rows = await this.prisma.holdPoint.findMany({
      where: { projectId, ...(phaseId ? { phaseId } : {}) },
      orderBy: [{ phase: { sequenceNo: "asc" } }, { createdAt: "asc" }],
      include: HOLD_POINT_INCLUDE,
    });
    return rows.map(toSummary);
  }

  /** Copies a template's hold points onto a phase; repeating it adds only the missing ones. */
  async instantiateFromTemplate(db: Db, projectId: string, phaseId: string, templateId: string): Promise<number> {
    const template = await db.checklistTemplate.findUnique({ where: { id: templateId }, include: { holdPoints: true } });
    if (!template) throw new NotFoundException("Checklist template not found");
    const existing = await db.holdPoint.findMany({ where: { phaseId }, select: { sourceHoldPointId: true } });
    const have = new Set(existing.map((e) => e.sourceHoldPointId));
    const missing = template.holdPoints.filter((h) => !have.has(h.id));
    if (missing.length > 0) {
      await db.holdPoint.createMany({
        data: missing.map((h) => ({ projectId, phaseId, sourceHoldPointId: h.id, text: h.text, subStage: h.subStage })),
      });
    }
    return missing.length;
  }

  async instantiateForPhase(projectId: string, phaseId: string, templateId: string, userId: string): Promise<HoldPointSummary[]> {
    const phase = await this.prisma.phase.findFirst({ where: { id: phaseId, projectId }, select: { id: true } });
    if (!phase) throw new NotFoundException("Phase not found in this project");
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, OR: [{ ownerUserId: null }, { ownerUserId: userId }] },
      select: { id: true },
    });
    if (!template) throw new NotFoundException("Checklist template not found");
    await this.instantiateFromTemplate(this.prisma, projectId, phaseId, templateId);
    return this.list(projectId, phaseId);
  }

  async sign(projectId: string, holdPointId: string, dto: SignHoldPointDto, userId: string): Promise<HoldPointSummary> {
    const holdPoint = await this.findOwned(projectId, holdPointId);
    if (stateOf(holdPoint.events[0]) !== "open") throw new BadRequestException("Hold point is already closed");
    if (!dto.photoId && !dto.documentId) {
      throw new BadRequestException("Closing a hold point needs an attached approval document or photo");
    }
    if (dto.photoId && !(await this.prisma.photo.findFirst({ where: { id: dto.photoId, projectId }, select: { id: true } }))) {
      throw new NotFoundException("Photo not found in this project");
    }
    if (dto.documentId && !(await this.prisma.document.findFirst({ where: { id: dto.documentId, projectId }, select: { id: true } }))) {
      throw new NotFoundException("Document not found in this project");
    }

    await this.prisma.holdPointEvent.create({
      data: {
        holdPointId,
        kind: "signed",
        actorUserId: userId,
        signerName: dto.signerName,
        signerCapacity: dto.signerCapacity,
        reason: dto.note,
        photoId: dto.photoId,
        documentId: dto.documentId,
      },
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "hold_point_signed",
      entityType: "hold_point",
      entityId: holdPointId,
      projectId,
      metadata: { signerName: dto.signerName, signerCapacity: dto.signerCapacity, phaseId: holdPoint.phaseId },
    });
    return this.get(projectId, holdPointId);
  }

  /** Owner-only override of a blocking hold point; the reason is mandatory and audited. */
  async bypass(projectId: string, holdPointId: string, dto: BypassHoldPointDto, userId: string): Promise<HoldPointSummary> {
    const holdPoint = await this.findOwned(projectId, holdPointId);
    if (stateOf(holdPoint.events[0]) !== "open") throw new BadRequestException("Hold point is already closed");

    await this.prisma.holdPointEvent.create({
      data: { holdPointId, kind: "bypassed", actorUserId: userId, reason: dto.reason },
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "hold_point_bypassed",
      entityType: "hold_point",
      entityId: holdPointId,
      projectId,
      metadata: { reason: dto.reason, phaseId: holdPoint.phaseId, text: holdPoint.text },
    });
    return this.get(projectId, holdPointId);
  }

  async reopen(projectId: string, holdPointId: string, dto: ReopenHoldPointDto, userId: string): Promise<HoldPointSummary> {
    const holdPoint = await this.findOwned(projectId, holdPointId);
    if (stateOf(holdPoint.events[0]) === "open") throw new BadRequestException("Hold point is already open");

    await this.prisma.holdPointEvent.create({
      data: { holdPointId, kind: "reopened", actorUserId: userId, reason: dto.note },
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "hold_point_reopened",
      entityType: "hold_point",
      entityId: holdPointId,
      projectId,
      metadata: { phaseId: holdPoint.phaseId },
    });
    return this.get(projectId, holdPointId);
  }

  /**
   * Stage gate: the supervisor approves a phase as complete. Blocked while any
   * hold point is open; on success the phase and its pending milestones are
   * marked verified, which is what lets the phase's payment be released.
   */
  async approvePhase(projectId: string, phaseId: string, userId: string): Promise<void> {
    const phase = await this.prisma.phase.findFirst({ where: { id: phaseId, projectId } });
    if (!phase) throw new NotFoundException();
    if (phase.status === "verified") throw new BadRequestException("Phase is already approved");

    await this.prisma.$transaction(async (tx) => {
      await this.assertNoOpenHoldPoints(tx, phaseId);
      await tx.phase.update({ where: { id: phaseId }, data: { status: "verified" } });
      await tx.milestone.updateMany({
        where: { phaseId, status: "pending" },
        data: { status: "verified", verifiedAt: new Date(), verifiedByUserId: userId },
      });
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "phase_approved",
      entityType: "phase",
      entityId: phaseId,
      projectId,
    });
  }

  private async get(projectId: string, holdPointId: string): Promise<HoldPointSummary> {
    return toSummary(await this.findOwned(projectId, holdPointId));
  }

  private async findOwned(projectId: string, holdPointId: string): Promise<HoldPointRow> {
    const row = await this.prisma.holdPoint.findFirst({ where: { id: holdPointId, projectId }, include: HOLD_POINT_INCLUDE });
    if (!row) throw new NotFoundException();
    return row;
  }
}

function toSummary(h: HoldPointRow): HoldPointSummary {
  const latest = h.events[0];
  const state = stateOf(latest);
  return {
    id: h.id,
    phaseId: h.phaseId,
    phaseName: h.phase.name,
    text: h.text,
    subStage: h.subStage,
    state,
    closedAt: state === "open" ? null : latest.createdAt.toISOString(),
    signerName: state === "signed" ? latest.signerName : null,
    signerCapacity: state === "signed" ? (latest.signerCapacity as HoldPointSignerCapacity | null) : null,
    reason: state === "bypassed" ? latest.reason : null,
    photoId: state === "signed" ? latest.photoId : null,
    documentId: state === "signed" ? latest.documentId : null,
  };
}
