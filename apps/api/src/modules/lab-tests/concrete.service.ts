import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ConcretePour, ConcreteResult } from "@prisma/client";
import type { ConcretePourSummary, ConcreteResultSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { addDays, evaluateResult, formworkState, knownRequiredMpa28 } from "./concrete-rules";
import { CreateConcretePourDto, RecordConcreteResultDto } from "./dto/lab-tests.dto";

type PourRow = ConcretePour & { results: ConcreteResult[] };

const REVIEWERS = ["owner", "project_manager", "inspector"] as const;

@Injectable()
export class ConcreteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(projectId: string, dto: CreateConcretePourDto, userId: string): Promise<ConcretePourSummary> {
    const requiredMpa28 = dto.requiredMpa28 ?? knownRequiredMpa28(dto.concreteGrade);
    if (requiredMpa28 === undefined) {
      throw new BadRequestException(`The 28-day strength for grade "${dto.concreteGrade}" is not known; send requiredMpa28`);
    }
    if (dto.phaseId && !(await this.prisma.phase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } }))) {
      throw new NotFoundException("Phase not found in this project");
    }
    const pour = await this.prisma.concretePour.create({
      data: {
        projectId,
        phaseId: dto.phaseId,
        element: dto.element,
        concreteGrade: dto.concreteGrade,
        requiredMpa28,
        deliveryNote: dto.deliveryNote,
        slumpCm: dto.slumpCm,
        spanMeters: dto.spanMeters,
        cantileverMeters: dto.cantileverMeters,
        castAt: new Date(dto.castAt),
        createdByUserId: userId,
      },
      include: { results: true },
    });
    return this.toSummary(pour, new Date());
  }

  async list(projectId: string): Promise<ConcretePourSummary[]> {
    const pours = await this.prisma.concretePour.findMany({
      where: { projectId },
      orderBy: { castAt: "desc" },
      include: { results: true },
    });
    const now = new Date();
    return pours.map((p) => this.toSummary(p, now));
  }

  /** Results are append-only; a failing one alerts the project's reviewers right away. */
  async recordResult(projectId: string, pourId: string, dto: RecordConcreteResultDto, userId: string): Promise<ConcretePourSummary> {
    const pour = await this.findOwned(projectId, pourId);
    const verdict = evaluateResult(dto.ageDays, dto.strengthMpa, Number(pour.requiredMpa28));

    await this.prisma.concreteResult.create({
      data: {
        pourId,
        ageDays: dto.ageDays,
        strengthMpa: dto.strengthMpa,
        testedAt: dto.testedAt ? new Date(dto.testedAt) : undefined,
        note: dto.note,
        recordedByUserId: userId,
      },
    });
    if (verdict === "fail") {
      await this.notifications.notifyProject(
        projectId,
        [...REVIEWERS],
        "cube_failed",
        { pourId, element: pour.element, ageDays: dto.ageDays, strengthMpa: dto.strengthMpa, requiredMpa28: Number(pour.requiredMpa28) },
        `cube_failed:${pourId}:${dto.ageDays}:${dto.strengthMpa}`,
      );
    }
    return this.toSummary(await this.findOwned(projectId, pourId), new Date());
  }

  /** The enforcement point: supports only come down when the pour is ready. */
  async removeFormwork(projectId: string, pourId: string, userId: string): Promise<ConcretePourSummary> {
    const pour = await this.findOwned(projectId, pourId);
    const summary = this.toSummary(pour, new Date());
    if (summary.formworkStatus === "removed") throw new BadRequestException("Formwork was already removed");
    if (summary.formworkStatus !== "ready") {
      throw new ConflictException({
        message: `Formwork cannot be removed: ${summary.formworkStatus}`,
        formworkStatus: summary.formworkStatus,
        earliestFormworkRemovalAt: summary.earliestFormworkRemovalAt,
      });
    }
    await this.prisma.concretePour.update({
      where: { id: pourId },
      data: { formworkRemovedAt: new Date(), formworkRemovedByUserId: userId },
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "formwork_removed",
      entityType: "concrete_pour",
      entityId: pourId,
      projectId,
    });
    return this.toSummary(await this.findOwned(projectId, pourId), new Date());
  }

  private async findOwned(projectId: string, pourId: string): Promise<PourRow> {
    const pour = await this.prisma.concretePour.findFirst({ where: { id: pourId, projectId }, include: { results: true } });
    if (!pour) throw new NotFoundException();
    return pour;
  }

  toSummary(pour: PourRow, now: Date): ConcretePourSummary {
    const required = Number(pour.requiredMpa28);
    const latestByAge = new Map<number, ConcreteResult>();
    for (const r of [...pour.results].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      latestByAge.set(r.ageDays, r);
    }
    const results: ConcreteResultSummary[] = [...latestByAge.values()]
      .sort((a, b) => a.ageDays - b.ageDays)
      .map((r) => ({
        id: r.id,
        ageDays: r.ageDays,
        strengthMpa: Number(r.strengthMpa),
        verdict: evaluateResult(r.ageDays, Number(r.strengthMpa), required),
        testedAt: r.testedAt?.toISOString() ?? null,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      }));
    const failedCubes = results.some((r) => r.verdict === "fail");
    const state = formworkState(
      {
        castAt: pour.castAt,
        spanMeters: pour.spanMeters === null ? null : Number(pour.spanMeters),
        cantileverMeters: pour.cantileverMeters === null ? null : Number(pour.cantileverMeters),
        formworkRemovedAt: pour.formworkRemovedAt,
      },
      failedCubes,
      now,
    );
    return {
      id: pour.id,
      phaseId: pour.phaseId,
      element: pour.element,
      concreteGrade: pour.concreteGrade,
      requiredMpa28: required,
      deliveryNote: pour.deliveryNote,
      slumpCm: pour.slumpCm === null ? null : Number(pour.slumpCm),
      spanMeters: pour.spanMeters === null ? null : Number(pour.spanMeters),
      cantileverMeters: pour.cantileverMeters === null ? null : Number(pour.cantileverMeters),
      castAt: pour.castAt.toISOString(),
      results,
      result7DueAt: addDays(pour.castAt, 7).toISOString(),
      result28DueAt: addDays(pour.castAt, 28).toISOString(),
      earliestFormworkRemovalAt: state.earliestRemovalAt?.toISOString() ?? null,
      formworkStatus: state.status,
      formworkRemovedAt: pour.formworkRemovedAt?.toISOString() ?? null,
    };
  }
}

