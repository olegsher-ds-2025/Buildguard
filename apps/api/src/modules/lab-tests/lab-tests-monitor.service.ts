import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { addDays } from "./concrete-rules";
import { dueAt } from "./timed-rules";

const REVIEWERS = ["owner", "project_manager", "inspector"] as const;
const POUR_LOOKAHEAD_DAYS = 3;

/**
 * Turns elapsed time into notifications: lab results coming due, timed tests
 * finishing, and a pour approaching that needs the trades to check their
 * preparations. Safe to run as often as you like — notifications are deduped.
 */
@Injectable()
export class LabTestsMonitorService {
  private readonly logger = new Logger(LabTestsMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledRun(): Promise<void> {
    try {
      const created = await this.run(new Date());
      if (created > 0) this.logger.log(`created ${created} notifications`);
    } catch (err) {
      this.logger.error("lab test monitor failed", err instanceof Error ? err.stack : String(err));
    }
  }

  async run(now: Date): Promise<number> {
    return (await this.resultsDue(now)) + (await this.timedTestsDue(now)) + (await this.upcomingPours(now));
  }

  private async resultsDue(now: Date): Promise<number> {
    const pours = await this.prisma.concretePour.findMany({ where: { castAt: { lte: now } }, include: { results: true } });
    let created = 0;
    for (const pour of pours) {
      for (const ageDays of [7, 28]) {
        if (addDays(pour.castAt, ageDays) > now) continue;
        if (pour.results.some((r) => r.ageDays === ageDays)) continue;
        created += await this.notifications.notifyProject(
          pour.projectId,
          [...REVIEWERS],
          "lab_result_due",
          { pourId: pour.id, element: pour.element, ageDays },
          `lab_result_due:${pour.id}:${ageDays}`,
        );
      }
    }
    return created;
  }

  private async timedTestsDue(now: Date): Promise<number> {
    const tests = await this.prisma.timedTest.findMany({ where: { completedAt: null } });
    let created = 0;
    for (const test of tests) {
      if (dueAt(test.startedAt, test.durationHours) > now) continue;
      created += await this.notifications.notifyProject(
        test.projectId,
        [...REVIEWERS],
        "timed_test_due",
        { testId: test.id, kind: test.kind, location: test.location },
        `timed_test_due:${test.id}`,
      );
    }
    return created;
  }

  /** Cross-trade alert: electrical, plumbing and HVAC must confirm their preparations before concrete closes them in. */
  private async upcomingPours(now: Date): Promise<number> {
    const horizon = addDays(now, POUR_LOOKAHEAD_DAYS);
    const pours = await this.prisma.concretePour.findMany({ where: { castAt: { gt: now, lte: horizon } } });
    let created = 0;
    for (const pour of pours) {
      created += await this.notifications.notifyProject(
        pour.projectId,
        [...REVIEWERS],
        "pour_coordination",
        { pourId: pour.id, element: pour.element, castAt: pour.castAt.toISOString(), trades: ["electrical", "plumbing", "hvac"] },
        `pour_coordination:${pour.id}`,
      );
    }
    return created;
  }
}
