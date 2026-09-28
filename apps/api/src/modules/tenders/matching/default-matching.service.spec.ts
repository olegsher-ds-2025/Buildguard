import { DefaultMatchingEngine } from "./default-matching.service";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { GeoScoringProvider } from "./geo-scoring.interface";
import type { TrustScoreProvider } from "./trust-score.interface";

describe("DefaultMatchingEngine", () => {
  function makeEngine(contractors: Record<string, unknown>[], contractCountByContractor: Record<string, number> = {}) {
    const prisma = {
      contractorProfile: {
        findMany: jest.fn().mockResolvedValue(contractors),
      },
      contract: {
        count: jest.fn().mockImplementation(({ where }: { where: { contractorProfileId: string } }) =>
          Promise.resolve(contractCountByContractor[where.contractorProfileId] ?? 0),
        ),
      },
    } as unknown as PrismaService;
    const geoScoring = { scoreFor: jest.fn().mockResolvedValue(0.5) } as unknown as GeoScoringProvider;
    const trustScore = {
      scoreFor: jest.fn().mockImplementation((_id: string, status: string) =>
        Promise.resolve(status === "verified" ? 1.0 : status === "pending" ? 0.5 : 0.0),
      ),
    } as unknown as TrustScoreProvider;
    return { engine: new DefaultMatchingEngine(prisma, geoScoring, trustScore), prisma };
  }

  const input = {
    tenderId: "tender-1",
    projectId: "proj-1",
    workCategoryId: "cat-electrical",
    budgetMinMinor: 100_000n,
    budgetMaxMinor: 200_000n,
  };

  it("only queries verified, category-matching contractors — the prefilter", async () => {
    const { engine, prisma } = makeEngine([]);
    await engine.rankCandidates(input, 5);

    expect(prisma.contractorProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          verificationStatus: "verified",
          categories: { some: { workCategoryId: "cat-electrical" } },
        }),
      }),
    );
  });

  it("computes the weighted formula (geo 0.30 + trust 0.25 + category 0.20 + availability 0.15 + experience 0.10)", async () => {
    const { engine } = makeEngine([
      { id: "c1", verificationStatus: "verified", currentlyAvailable: true },
    ]);
    const result = await engine.rankCandidates(input, 5);

    // geo=0.5, trust=1.0 (verified), category=1.0 (prefiltered), availability=1.0, experience=0 (no prior contracts)
    const expected = 0.3 * 0.5 + 0.25 * 1.0 + 0.2 * 1.0 + 0.15 * 1.0 + 0.1 * 0;
    expect(result).toEqual([{ contractorProfileId: "c1", matchScore: expect.closeTo(expected, 6) }]);
  });

  it("scores an unavailable contractor lower than an available one, all else equal", async () => {
    const { engine } = makeEngine([
      { id: "available", verificationStatus: "verified", currentlyAvailable: true },
      { id: "unavailable", verificationStatus: "verified", currentlyAvailable: false },
    ]);
    const result = await engine.rankCandidates(input, 5);

    const available = result.find((r) => r.contractorProfileId === "available")!;
    const unavailable = result.find((r) => r.contractorProfileId === "unavailable")!;
    expect(available.matchScore).toBeGreaterThan(unavailable.matchScore);
  });

  it("truncates to topN, highest score first", async () => {
    const { engine } = makeEngine(
      [
        { id: "low", verificationStatus: "verified", currentlyAvailable: false },
        { id: "high", verificationStatus: "verified", currentlyAvailable: true },
      ],
      {},
    );
    const result = await engine.rankCandidates(input, 1);

    expect(result).toHaveLength(1);
    expect(result[0].contractorProfileId).toBe("high");
  });
});
