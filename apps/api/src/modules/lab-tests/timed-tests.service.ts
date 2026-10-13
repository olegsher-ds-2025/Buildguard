import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { TimedTest } from "@prisma/client";
import type { TimedTestStatus, TimedTestSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CompleteTimedTestDto, StartTimedTestDto } from "./dto/lab-tests.dto";
import { DEFAULT_DURATION_HOURS, dueAt, isValidDuration } from "./timed-rules";

const UNIT = { pressure: "atm", flood: "cm" } as const;

@Injectable()
export class TimedTestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async start(projectId: string, dto: StartTimedTestDto, userId: string): Promise<TimedTestSummary> {
    const durationHours = dto.durationHours ?? DEFAULT_DURATION_HOURS[dto.kind];
    if (!isValidDuration(dto.kind, durationHours)) {
      throw new BadRequestException(
        dto.kind === "pressure" ? "A pressure test runs at least 24 hours" : "A flood test runs between 24 and 72 hours",
      );
    }
    if (dto.kind === "pressure" && dto.startReading === undefined) {
      throw new BadRequestException("A pressure test needs the starting gauge reading");
    }
    if (dto.phaseId && !(await this.prisma.phase.findFirst({ where: { id: dto.phaseId, projectId }, select: { id: true } }))) {
      throw new NotFoundException("Phase not found in this project");
    }
    const test = await this.prisma.timedTest.create({
      data: {
        projectId,
        phaseId: dto.phaseId,
        kind: dto.kind,
        location: dto.location,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
        durationHours,
        unit: UNIT[dto.kind],
        startReading: dto.startReading,
        startPhotoId: dto.startPhotoId,
        startedByUserId: userId,
      },
    });
    return toSummary(test, new Date());
  }

  async list(projectId: string): Promise<TimedTestSummary[]> {
    const tests = await this.prisma.timedTest.findMany({ where: { projectId }, orderBy: { startedAt: "desc" } });
    const now = new Date();
    return tests.map((t) => toSummary(t, now));
  }

  /**
   * Can't be completed before the duration has elapsed. A pressure test that
   * ended below its starting reading failed, whatever the caller says.
   */
  async complete(projectId: string, testId: string, dto: CompleteTimedTestDto, userId: string): Promise<TimedTestSummary> {
    const test = await this.prisma.timedTest.findFirst({ where: { id: testId, projectId } });
    if (!test) throw new NotFoundException();
    if (test.completedAt) throw new BadRequestException("Test is already completed");

    const now = new Date();
    if (now < dueAt(test.startedAt, test.durationHours)) {
      throw new ConflictException({
        message: "The test duration has not elapsed yet",
        dueAt: dueAt(test.startedAt, test.durationHours).toISOString(),
      });
    }
    if (test.kind === "pressure" && dto.endReading === undefined) {
      throw new BadRequestException("A pressure test needs the ending gauge reading");
    }
    const pressureDropped = test.kind === "pressure" && Number(dto.endReading) < Number(test.startReading);
    const outcome = pressureDropped ? "failed" : dto.outcome;

    const updated = await this.prisma.timedTest.update({
      where: { id: testId },
      data: {
        outcome,
        endReading: dto.endReading,
        endPhotoId: dto.endPhotoId,
        note: dto.note,
        completedAt: now,
        completedByUserId: userId,
      },
    });
    await this.audit.record({
      actorUserId: userId,
      actorType: "customer",
      action: "timed_test_completed",
      entityType: "timed_test",
      entityId: testId,
      projectId,
      metadata: { kind: test.kind, outcome, location: test.location },
    });
    return toSummary(updated, now);
  }
}

function statusOf(t: TimedTest, now: Date): TimedTestStatus {
  if (t.outcome) return t.outcome;
  return now >= dueAt(t.startedAt, t.durationHours) ? "due" : "running";
}

export function toSummary(t: TimedTest, now: Date): TimedTestSummary {
  return {
    id: t.id,
    kind: t.kind,
    phaseId: t.phaseId,
    location: t.location,
    startedAt: t.startedAt.toISOString(),
    durationHours: t.durationHours,
    dueAt: dueAt(t.startedAt, t.durationHours).toISOString(),
    unit: t.unit,
    startReading: t.startReading === null ? null : Number(t.startReading),
    endReading: t.endReading === null ? null : Number(t.endReading),
    status: statusOf(t, now),
    outcome: t.outcome,
    note: t.note,
    completedAt: t.completedAt?.toISOString() ?? null,
  };
}
