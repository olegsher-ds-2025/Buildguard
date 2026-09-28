import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { GeoScoringProvider } from "./geo-scoring.interface";
import { TrustScoreProvider } from "./trust-score.interface";
import { MatchingCandidate, MatchingEngine, MatchingInput } from "./matching.interface";

// Weights from design doc §6.2. Each term is computed by a dedicated,
// independently swappable provider — see build plan §1 for what's real vs
// stubbed today.
const WEIGHTS = {
  geo: 0.3,
  trust: 0.25,
  category: 0.2,
  availability: 0.15,
  experience: 0.1,
};

const EXPERIENCE_CAP = 5;

@Injectable()
export class DefaultMatchingEngine extends MatchingEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geoScoring: GeoScoringProvider,
    private readonly trustScore: TrustScoreProvider,
  ) {
    super();
  }

  async rankCandidates(input: MatchingInput, topN: number): Promise<MatchingCandidate[]> {
    // Hard prefilter: only verified, category-matching contractors are
    // candidates at all — unverified/rejected contractors never appear
    // regardless of score (same defense-in-depth spirit as ProjectRoleGuard
    // 404-before-403: don't even rank contractors who can't legally bid).
    const candidates = await this.prisma.contractorProfile.findMany({
      where: {
        verificationStatus: "verified",
        categories: { some: { workCategoryId: input.workCategoryId } },
      },
    });

    const budgetMid = (input.budgetMinMinor + input.budgetMaxMinor) / 2n;
    const budgetLow = (budgetMid * 5n) / 10n;
    const budgetHigh = (budgetMid * 15n) / 10n;

    const scored = await Promise.all(
      candidates.map(async (contractor): Promise<MatchingCandidate> => {
        const [geo, trust, experienceCount] = await Promise.all([
          this.geoScoring.scoreFor(contractor.id, input.projectId),
          this.trustScore.scoreFor(contractor.id, contractor.verificationStatus),
          this.prisma.contract.count({
            where: {
              contractorProfileId: contractor.id,
              totalAmountMinor: { gte: budgetLow, lte: budgetHigh },
            },
          }),
        ]);

        const category = 1.0; // prefiltered to an exact category match above
        const availability = contractor.currentlyAvailable ? 1.0 : 0.2;
        const experience = Math.min(experienceCount, EXPERIENCE_CAP) / EXPERIENCE_CAP;

        const matchScore =
          WEIGHTS.geo * geo +
          WEIGHTS.trust * trust +
          WEIGHTS.category * category +
          WEIGHTS.availability * availability +
          WEIGHTS.experience * experience;

        return { contractorProfileId: contractor.id, matchScore };
      }),
    );

    return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, topN);
  }
}
