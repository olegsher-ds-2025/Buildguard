import { MockRagService } from "./mock-rag.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { FinanceService } from "../finance/finance.service";

describe("MockRagService", () => {
  function makeService(overrides: {
    budgetTotals?: unknown;
    milestone?: unknown;
    detectionCount?: number;
    worstDetection?: unknown;
  } = {}) {
    const prisma = {
      milestone: { findFirst: jest.fn().mockResolvedValue(overrides.milestone ?? null) },
      detection: {
        count: jest.fn().mockResolvedValue(overrides.detectionCount ?? 0),
        findFirst: jest.fn().mockResolvedValue(overrides.worstDetection ?? null),
      },
    } as unknown as PrismaService;
    const finance = {
      getBudgetTotals: jest.fn().mockResolvedValue(overrides.budgetTotals ?? null),
    } as unknown as FinanceService;
    return { service: new MockRagService(prisma, finance) };
  }

  it("falls back to the no-info answer with no citations for an off-topic question", async () => {
    const { service } = makeService();
    const result = await service.answer({ projectId: "proj-1", question: "what's the weather like" });
    expect(result.citations).toEqual([]);
    expect(result.content).toMatch(/don't have information/i);
  });

  it("answers a budget question grounded in the real contingency line, with a citation", async () => {
    const { service } = makeService({
      budgetTotals: {
        currency: "ILS",
        totalPlannedMinor: 1000000n,
        totalActualMinor: 500000n,
        lines: [{ category: "Contingency", plannedAmountMinor: "100000", actualAmountMinor: "54900" }],
      },
    });
    const result = await service.answer({ projectId: "proj-1", question: "how much contingency is left?" });
    expect(result.content).toContain("451"); // remaining = 100000-54900 = 45100 minor -> 451 ILS
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].documentTitle).toBe("Budget");
  });

  it("answers a milestone question from the next pending milestone", async () => {
    const { service } = makeService({
      milestone: { name: "Structure complete", dueDate: new Date("2026-09-15"), phase: { name: "Structure" } },
    });
    const result = await service.answer({ projectId: "proj-1", question: "when is the next milestone due?" });
    expect(result.content).toContain("Structure complete");
    expect(result.citations[0].documentTitle).toBe("Structure — Milestones");
  });

  it("reports no open findings when there are none", async () => {
    const { service } = makeService({ detectionCount: 0 });
    const result = await service.answer({ projectId: "proj-1", question: "any safety issues?" });
    expect(result.content).toMatch(/no open AI Vision findings/i);
    expect(result.citations).toEqual([]);
  });

  it("answers a findings question with the highest-severity open detection", async () => {
    const { service } = makeService({
      detectionCount: 2,
      worstDetection: { description: "Missing guardrail", severity: 5, confidence: 0.88 },
    });
    const result = await service.answer({ projectId: "proj-1", question: "any open findings?" });
    expect(result.content).toContain("Missing guardrail");
    expect(result.content).toContain("2");
  });
});
