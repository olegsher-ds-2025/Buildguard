import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import type {
  BurnTier,
  NextMilestoneSummary,
  PhaseSummary,
  ProjectDashboardResponse,
  ProjectSummary,
} from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { FinanceService } from "../finance/finance.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  async listForUser(userId: string): Promise<ProjectSummary[]> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: true },
      orderBy: { invitedAt: "asc" },
    });
    return memberships.map((m) => this.toProjectSummary(m.project));
  }

  async getDashboard(projectId: string): Promise<ProjectDashboardResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();

    const phases = await this.prisma.phase.findMany({
      where: { projectId },
      orderBy: { sequenceNo: "asc" },
      include: { tasks: true, milestones: true },
    });

    const phaseSummaries: PhaseSummary[] = [];
    let weightedProgressSum = 0;
    let totalBudgetNum = 0;

    for (const phase of phases) {
      const progressPct = this.computePhaseProgress(phase.tasks, phase.milestones);
      const budgetNum = Number(phase.budgetPlannedMinor);
      weightedProgressSum += progressPct * budgetNum;
      totalBudgetNum += budgetNum;

      phaseSummaries.push({
        id: phase.id,
        name: phase.name,
        sequenceNo: phase.sequenceNo,
        status: phase.status,
        currency: phase.currency,
        budgetPlannedMinor: phase.budgetPlannedMinor.toString(),
        progressPct: round2(progressPct),
      });
    }

    const overallProgressPct = totalBudgetNum > 0 ? round2(weightedProgressSum / totalBudgetNum) : 0;

    const budgetTotals = await this.finance.getBudgetTotals(projectId);
    if (!budgetTotals) {
      // Every project is created together with its Budget (see ProjectsModule
      // once project creation lands); a project without one is a data
      // integrity bug, not a normal empty state to render around.
      throw new InternalServerErrorException(`Project ${projectId} has no budget`);
    }
    const budget = {
      currency: budgetTotals.currency,
      tolerancePct: budgetTotals.tolerancePct,
      totalPlannedMinor: budgetTotals.totalPlannedMinor.toString(),
      totalActualMinor: budgetTotals.totalActualMinor.toString(),
      ...this.computeBurn(
        budgetTotals.totalActualMinor,
        budgetTotals.totalPlannedMinor,
        overallProgressPct,
        budgetTotals.tolerancePct,
      ),
      lines: budgetTotals.lines,
    };

    const nextMilestone = await this.getNextMilestone(projectId);
    const openFindingsCount = await this.prisma.detection.count({
      where: { status: "suggested", siteCapture: { projectId } },
    });

    return {
      project: this.toProjectSummary(project),
      overallProgressPct,
      phases: phaseSummaries,
      budget,
      nextMilestone,
      openFindingsCount,
    };
  }

  private toProjectSummary(project: { id: string; name: string; address: string; status: string }): ProjectSummary {
    return { id: project.id, name: project.name, address: project.address, status: project.status };
  }

  // §6.1's full formula (0.5 task + 0.3 milestone + 0.2 AI-visual) can't be
  // honored yet — there's no real Vision signal. Renormalized to the two
  // available sources per the build plan, ready to reactivate the AI term
  // at its original weight once M4's real detections exist.
  private computePhaseProgress(
    tasks: { weight: unknown; percentComplete: unknown }[],
    milestones: { status: string }[],
  ): number {
    const totalWeight = tasks.reduce((sum, t) => sum + Number(t.weight), 0);
    const taskCompletion =
      totalWeight > 0
        ? tasks.reduce((sum, t) => sum + Number(t.weight) * Number(t.percentComplete), 0) / totalWeight
        : 0;

    const verifiedCount = milestones.filter((m) => m.status === "verified").length;
    const milestoneRatio = milestones.length > 0 ? (verifiedCount / milestones.length) * 100 : taskCompletion;

    return 0.625 * taskCompletion + 0.375 * milestoneRatio;
  }

  // burn_rate = spend_pct / progress_pct (design doc §6.4, matching the
  // validated docs/demo/index.html implementation) — how much of the budget
  // is gone relative to how much of the work is done. Progress=0 with
  // spend>0 is a red flag with an undefined ratio, not "no signal."
  private computeBurn(
    totalActualMinor: bigint,
    totalPlannedMinor: bigint,
    overallProgressPct: number,
    tolerancePct: number,
  ): { burnRate: number | null; burnTier: BurnTier } {
    if (overallProgressPct === 0) {
      return totalActualMinor > 0n ? { burnRate: null, burnTier: "critical" } : { burnRate: 0, burnTier: "ok" };
    }
    const spentPct =
      totalPlannedMinor > 0n ? (Number(totalActualMinor) / Number(totalPlannedMinor)) * 100 : 0;
    const rate = spentPct / overallProgressPct;
    const burnTier: BurnTier = rate > 1 + 2 * tolerancePct ? "critical" : rate > 1 + tolerancePct ? "warning" : "ok";
    return { burnRate: round2(rate), burnTier };
  }

  private async getNextMilestone(projectId: string): Promise<NextMilestoneSummary | null> {
    const milestone = await this.prisma.milestone.findFirst({
      where: {
        status: "pending",
        dueDate: { not: null },
        phase: { projectId },
      },
      orderBy: { dueDate: "asc" },
    });
    if (!milestone || !milestone.dueDate) return null;

    const daysRemaining = Math.ceil((milestone.dueDate.getTime() - Date.now()) / MS_PER_DAY);
    return { id: milestone.id, name: milestone.name, dueDate: milestone.dueDate.toISOString(), daysRemaining };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
