import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FinanceService } from "../finance/finance.service";
import { RagAnswer, RagQuestionInput, RagService } from "./rag.interface";

const NO_INFO_ANSWER =
  "I don't have information about that in this project yet. Try asking about the budget, contingency, the next milestone, or open findings.";

/**
 * Deterministic, clearly-labeled placeholder standing in for the real
 * hybrid-retrieval + LLM pipeline (design doc §7.2 — phase 3). It answers
 * from real project data via simple keyword matching, not semantic
 * retrieval or generation — this keeps the "numbers come from the API, not
 * the LLM" principle (§7.2) honest even in mock form, and exists to prove
 * the ask -> grounded-answer -> citation lifecycle end to end before any
 * real retrieval/LLM exists.
 */
@Injectable()
export class MockRagService extends RagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {
    super();
  }

  async answer(input: RagQuestionInput): Promise<RagAnswer> {
    const q = input.question.toLowerCase();

    if (/budget|contingency|reserve|overrun|cost/.test(q)) {
      return this.answerBudget(input.projectId);
    }
    if (/milestone|schedule|deadline|due/.test(q)) {
      return this.answerMilestone(input.projectId);
    }
    if (/defect|finding|inspector|issue|safety/.test(q)) {
      return this.answerFindings(input.projectId);
    }

    return { content: NO_INFO_ANSWER, citations: [] };
  }

  private async answerBudget(projectId: string): Promise<RagAnswer> {
    const totals = await this.finance.getBudgetTotals(projectId);
    if (!totals) return { content: NO_INFO_ANSWER, citations: [] };

    const contingency = totals.lines.find((l) => l.category.toLowerCase().includes("contingency"));
    const remainingMinor = contingency
      ? BigInt(contingency.plannedAmountMinor) - BigInt(contingency.actualAmountMinor)
      : null;

    const content = contingency
      ? `The contingency line is planned at ${this.formatMinor(contingency.plannedAmountMinor, totals.currency)}, with ${this.formatMinor(contingency.actualAmountMinor, totals.currency)} spent so far — ${this.formatMinor(remainingMinor!.toString(), totals.currency)} remaining. Overall, the project has spent ${this.formatMinor(totals.totalActualMinor.toString(), totals.currency)} of a ${this.formatMinor(totals.totalPlannedMinor.toString(), totals.currency)} planned budget.`
      : `The project has spent ${this.formatMinor(totals.totalActualMinor.toString(), totals.currency)} of a ${this.formatMinor(totals.totalPlannedMinor.toString(), totals.currency)} planned budget. No contingency line is set up on this budget.`;

    return {
      content,
      citations: [
        {
          documentId: null,
          documentTitle: "Budget",
          snippet: contingency
            ? `${contingency.category}: planned ${contingency.plannedAmountMinor}, actual ${contingency.actualAmountMinor}`
            : `Total planned ${totals.totalPlannedMinor.toString()}, actual ${totals.totalActualMinor.toString()}`,
        },
      ],
    };
  }

  private async answerMilestone(projectId: string): Promise<RagAnswer> {
    const milestone = await this.prisma.milestone.findFirst({
      where: { status: "pending", phase: { projectId } },
      orderBy: { dueDate: "asc" },
      include: { phase: true },
    });
    if (!milestone) {
      return { content: "There are no pending milestones on this project right now.", citations: [] };
    }

    const dueText = milestone.dueDate ? ` due ${milestone.dueDate.toISOString().slice(0, 10)}` : "";
    return {
      content: `The next pending milestone is "${milestone.name}" in the ${milestone.phase.name} phase${dueText}.`,
      citations: [
        {
          documentId: null,
          documentTitle: `${milestone.phase.name} — Milestones`,
          snippet: `${milestone.name}: pending${dueText}`,
        },
      ],
    };
  }

  private async answerFindings(projectId: string): Promise<RagAnswer> {
    const [openCount, worst] = await Promise.all([
      this.prisma.detection.count({ where: { status: "suggested", siteCapture: { projectId } } }),
      this.prisma.detection.findFirst({
        where: { status: "suggested", siteCapture: { projectId } },
        orderBy: { severity: "desc" },
      }),
    ]);

    if (openCount === 0) {
      return { content: "There are no open AI Vision findings awaiting review on this project.", citations: [] };
    }

    return {
      content: `There ${openCount === 1 ? "is" : "are"} ${openCount} open AI Vision finding${openCount === 1 ? "" : "s"} awaiting review. The highest severity one is "${worst!.description}" (severity ${worst!.severity}/5).`,
      citations: [
        {
          documentId: null,
          documentTitle: "AI Vision Findings",
          snippet: `${worst!.description} — severity ${worst!.severity}, confidence ${worst!.confidence}`,
        },
      ],
    };
  }

  private formatMinor(amountMinor: string, currency: string): string {
    return `${(Number(amountMinor) / 100).toLocaleString()} ${currency}`;
  }
}
