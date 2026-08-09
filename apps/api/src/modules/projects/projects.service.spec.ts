import { ProjectsService } from "./projects.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { FinanceService } from "../finance/finance.service";

// Mirrors the seeded Villa Sharon fixture exactly, so these numbers are the
// same ones verified by hand and against the running API in the build plan's
// M2 milestone — locking in two bugs that were caught manually and would
// otherwise be easy to reintroduce: (1) burn rate is spend% / progress%, not
// raw spend / progress%, and (2) phase progress blends task completion with
// verified-milestone ratio rather than reporting task completion alone.
describe("ProjectsService.getDashboard", () => {
  const phases = [
    {
      id: "p1",
      name: "Foundations",
      sequenceNo: 1,
      status: "verified",
      currency: "ILS",
      budgetPlannedMinor: 42_000_000n,
      tasks: [{ weight: 1, percentComplete: 100 }],
      milestones: [{ status: "verified" }],
    },
    {
      id: "p2",
      name: "Structure",
      sequenceNo: 2,
      status: "in_progress",
      currency: "ILS",
      budgetPlannedMinor: 78_000_000n,
      tasks: [{ weight: 1, percentComplete: 78 }],
      milestones: [{ status: "pending" }],
    },
    {
      id: "p3",
      name: "Envelope",
      sequenceNo: 3,
      status: "in_progress",
      currency: "ILS",
      budgetPlannedMinor: 39_000_000n,
      tasks: [{ weight: 1, percentComplete: 12 }],
      milestones: [],
    },
    {
      id: "p4",
      name: "Systems",
      sequenceNo: 4,
      status: "not_started",
      currency: "ILS",
      budgetPlannedMinor: 46_000_000n,
      tasks: [{ weight: 1, percentComplete: 0 }],
      milestones: [],
    },
    {
      id: "p5",
      name: "Finishing",
      sequenceNo: 5,
      status: "not_started",
      currency: "ILS",
      budgetPlannedMinor: 30_000_000n,
      tasks: [{ weight: 1, percentComplete: 0 }],
      milestones: [],
    },
  ];

  function makeService(phaseFixture: typeof phases, totalActualMinor = 128_340_000n) {
    const prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: "proj-1", name: "Villa Sharon", address: "x", status: "active" }) },
      phase: { findMany: jest.fn().mockResolvedValue(phaseFixture) },
      milestone: { findFirst: jest.fn().mockResolvedValue(null) },
      detection: { count: jest.fn().mockResolvedValue(3) },
    } as unknown as PrismaService;

    const finance = {
      getBudgetTotals: jest.fn().mockResolvedValue({
        currency: "ILS",
        tolerancePct: 0.1,
        totalPlannedMinor: 245_000_000n,
        totalActualMinor,
        lines: [],
      }),
    } as unknown as FinanceService;

    return new ProjectsService(prisma, finance);
  }

  it("computes budget-weighted overall progress and per-phase blended progress", async () => {
    const result = await makeService(phases).getDashboard("proj-1");

    expect(result.phases.find((p) => p.name === "Foundations")?.progressPct).toBe(100);
    // 0.625*78 (task) + 0.375*0 (unverified milestone) = 48.75, not the raw 78% task figure.
    expect(result.phases.find((p) => p.name === "Structure")?.progressPct).toBe(48.75);
    // No milestones tracked for Envelope -> falls back to task completion alone.
    expect(result.phases.find((p) => p.name === "Envelope")?.progressPct).toBe(12);
    expect(result.overallProgressPct).toBe(36.04);
  });

  it("computes burn rate as spend% / progress%, not raw spend / progress%", async () => {
    const result = await makeService(phases).getDashboard("proj-1");
    // spentPct = 128,340,000/245,000,000*100 = 52.3836...; /36.04 progress = 1.4534... -> 1.45
    expect(result.budget.burnRate).toBe(1.45);
    expect(result.budget.burnTier).toBe("critical");
  });

  it("treats spend with zero progress as critical rather than dividing by zero", async () => {
    const zeroProgressPhases = phases.map((p) => ({ ...p, tasks: [{ weight: 1, percentComplete: 0 }], milestones: [] }));
    const result = await makeService(zeroProgressPhases).getDashboard("proj-1");

    expect(result.overallProgressPct).toBe(0);
    expect(result.budget.burnRate).toBeNull();
    expect(result.budget.burnTier).toBe("critical");
  });
});
