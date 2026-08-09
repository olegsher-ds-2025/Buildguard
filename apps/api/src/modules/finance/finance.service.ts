import { Injectable } from "@nestjs/common";
import type { BudgetLineSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

export interface BudgetTotals {
  currency: string;
  tolerancePct: number;
  totalPlannedMinor: bigint;
  totalActualMinor: bigint;
  lines: BudgetLineSummary[];
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getBudgetTotals(projectId: string): Promise<BudgetTotals | null> {
    const budget = await this.prisma.budget.findUnique({
      where: { projectId },
      include: { budgetLines: { include: { invoices: true } } },
    });
    if (!budget) return null;

    let totalPlanned = 0n;
    let totalActual = 0n;
    const lines: BudgetLineSummary[] = budget.budgetLines.map((line) => {
      // A superseded invoice (one another invoice's supersedesInvoiceId
      // points back at) is a corrected-away prior value — only the current
      // head of any correction chain counts toward actual spend.
      const supersededIds = new Set(
        line.invoices.filter((inv) => inv.supersedesInvoiceId).map((inv) => inv.supersedesInvoiceId),
      );
      const actual = line.invoices
        .filter((inv) => inv.status === "approved" && !supersededIds.has(inv.id))
        .reduce((sum, inv) => sum + inv.amountMinor, 0n);

      totalPlanned += line.plannedAmountMinor;
      totalActual += actual;

      return {
        category: line.category,
        currency: line.currency,
        plannedAmountMinor: line.plannedAmountMinor.toString(),
        actualAmountMinor: actual.toString(),
      };
    });

    return {
      currency: budget.currency,
      tolerancePct: Number(budget.tolerancePct),
      totalPlannedMinor: totalPlanned,
      totalActualMinor: totalActual,
      lines,
    };
  }
}
