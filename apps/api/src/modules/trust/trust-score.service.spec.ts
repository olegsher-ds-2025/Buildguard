import { NotFoundException } from "@nestjs/common";
import { TrustScoreService } from "./trust-score.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ScheduleAdherenceProvider } from "./scoring/schedule-adherence.interface";
import type { ExecutionQualityProvider } from "./scoring/execution-quality.interface";
import type { FinancialTransparencyProvider } from "./scoring/financial-transparency.interface";

describe("TrustScoreService", () => {
  const contractor = { id: "c1", createdAt: new Date("2020-01-01T00:00:00Z") };

  function makeService(overrides: {
    contractor?: Partial<typeof contractor> | null;
    contracts?: unknown[];
    reviews?: unknown[];
    invitations?: unknown[];
  } = {}) {
    const prisma = {
      contractorProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue(overrides.contractor === null ? null : { ...contractor, ...overrides.contractor }),
      },
      contract: { findMany: jest.fn().mockResolvedValue(overrides.contracts ?? []) },
      review: { findMany: jest.fn().mockResolvedValue(overrides.reviews ?? []) },
      tenderInvitation: { findMany: jest.fn().mockResolvedValue(overrides.invitations ?? []) },
    } as unknown as PrismaService;

    const schedule = { scoreFor: jest.fn().mockResolvedValue(0.6) } as unknown as ScheduleAdherenceProvider;
    const quality = { scoreFor: jest.fn().mockResolvedValue(0.6) } as unknown as ExecutionQualityProvider;
    const financial = { scoreFor: jest.fn().mockResolvedValue(0.6) } as unknown as FinancialTransparencyProvider;

    return { service: new TrustScoreService(prisma, schedule, quality, financial), prisma };
  }

  it("404s for an unknown contractor", async () => {
    const { service } = makeService({ contractor: null });
    await expect(service.computeScore("c1")).rejects.toThrow(NotFoundException);
  });

  it("scores 0 for a contractor with zero contracts (confidence(0) = 0, per Bayesian shrinkage)", async () => {
    const { service } = makeService({ contracts: [] });
    const result = await service.computeScore("c1");
    expect(result.confidence).toBe(0);
    expect(result.score).toBe(0);
    expect(result.sampleSize).toBe(0);
  });

  it("marks the three stubbed components as not real, and the other three as real", async () => {
    const { service } = makeService({ contracts: [{ id: "ct1" }] });
    const result = await service.computeScore("c1");
    const byKey = Object.fromEntries(result.components.map((c) => [c.key, c]));
    expect(byKey.schedule_adherence.isReal).toBe(false);
    expect(byKey.execution_quality.isReal).toBe(false);
    expect(byKey.financial_transparency.isReal).toBe(false);
    expect(byKey.disputes.isReal).toBe(true);
    expect(byKey.service.isReal).toBe(true);
    expect(byKey.tenure_experience.isReal).toBe(true);
  });

  it("a contractor with only 5-star reviews scores a disputes component of 1.0 (no low ratings)", async () => {
    const { service } = makeService({
      contracts: [{ id: "ct1" }],
      reviews: [{ rating: 5, createdAt: new Date() }],
    });
    const result = await service.computeScore("c1");
    const disputes = result.components.find((c) => c.key === "disputes")!;
    expect(disputes.value).toBe(1);
  });

  it("a contractor with a 1-star review scores a lower disputes component than one with none", async () => {
    const withBadReview = await makeService({
      contracts: [{ id: "ct1" }],
      reviews: [{ rating: 1, createdAt: new Date() }],
    }).service.computeScore("c1");
    const withoutReviews = await makeService({ contracts: [{ id: "ct1" }], reviews: [] }).service.computeScore("c1");

    const badDisputes = withBadReview.components.find((c) => c.key === "disputes")!.value;
    const neutralDisputes = withoutReviews.components.find((c) => c.key === "disputes")!.value;
    expect(badDisputes).toBeLessThan(neutralDisputes);
  });

  it("faster invitation responses raise the service component", async () => {
    const fast = await makeService({
      contracts: [{ id: "ct1" }],
      invitations: [
        { invitedAt: new Date("2026-01-01T00:00:00Z"), respondedAt: new Date("2026-01-01T12:00:00Z") },
      ],
    }).service.computeScore("c1");
    const slow = await makeService({
      contracts: [{ id: "ct1" }],
      invitations: [
        { invitedAt: new Date("2026-01-01T00:00:00Z"), respondedAt: new Date("2026-01-14T00:00:00Z") },
      ],
    }).service.computeScore("c1");

    const fastService = fast.components.find((c) => c.key === "service")!.value;
    const slowService = slow.components.find((c) => c.key === "service")!.value;
    expect(fastService).toBeGreaterThan(slowService);
  });

  it("more completed contracts raise the tenure/experience component, capped at 5", async () => {
    const one = await makeService({ contracts: [{ id: "ct1" }] }).service.computeScore("c1");
    const five = await makeService({
      contracts: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }],
    }).service.computeScore("c1");
    const ten = await makeService({
      contracts: Array.from({ length: 10 }, (_, i) => ({ id: String(i) })),
    }).service.computeScore("c1");

    const oneTenure = one.components.find((c) => c.key === "tenure_experience")!.value;
    const fiveTenure = five.components.find((c) => c.key === "tenure_experience")!.value;
    const tenTenure = ten.components.find((c) => c.key === "tenure_experience")!.value;
    expect(fiveTenure).toBeGreaterThan(oneTenure);
    expect(tenTenure).toBe(fiveTenure); // capped
  });
});
