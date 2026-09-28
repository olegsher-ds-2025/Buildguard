import { Injectable, NotFoundException } from "@nestjs/common";
import type { TrustScoreSummary } from "@buildguard/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { ScheduleAdherenceProvider } from "./scoring/schedule-adherence.interface";
import { ExecutionQualityProvider } from "./scoring/execution-quality.interface";
import { FinancialTransparencyProvider } from "./scoring/financial-transparency.interface";

// Weights from design doc §6.3. Three terms (schedule/quality/financial)
// are computed behind seams — see the Trust Score section header in
// schema.prisma for why those specifically have no attributable-per-
// contractor data source yet.
const WEIGHTS = {
  schedule: 0.2,
  quality: 0.25,
  financial: 0.2,
  disputes: 0.15,
  service: 0.1,
  tenure: 0.1,
};

// Bayesian shrinkage (design doc §6.3): confidence(n) = n / (n + K).
const SHRINKAGE_K = 5;
const TENURE_CONTRACT_CAP = 5;
const TENURE_AGE_CAP_YEARS = 3;
// "older projects lose weight exponentially (half-life ≈ 18 months)".
const REVIEW_DECAY_HALF_LIFE_MONTHS = 18;
// Response-time-to-invitation is treated as fully unresponsive at this age.
const RESPONSE_SLOW_CAP_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

@Injectable()
export class TrustScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleAdherence: ScheduleAdherenceProvider,
    private readonly executionQuality: ExecutionQualityProvider,
    private readonly financialTransparency: FinancialTransparencyProvider,
  ) {}

  async computeScore(contractorProfileId: string): Promise<TrustScoreSummary> {
    const contractor = await this.prisma.contractorProfile.findUnique({ where: { id: contractorProfileId } });
    if (!contractor) throw new NotFoundException();

    const [contracts, reviews, respondedInvitations] = await Promise.all([
      this.prisma.contract.findMany({
        where: { contractorProfileId, status: { in: ["signed", "active", "completed"] } },
      }),
      this.prisma.review.findMany({ where: { contractorProfileId, status: "published" } }),
      this.prisma.tenderInvitation.findMany({
        where: { contractorProfileId, status: "bid_submitted", respondedAt: { not: null } },
      }),
    ]);

    const n = contracts.length;
    const confidence = n / (n + SHRINKAGE_K);

    const now = Date.now();

    // Time-decayed review aggregates feed both the disputes-rate proxy and
    // the service-rating half of the service component.
    let sumWeight = 0;
    let weightedRatingSum = 0;
    let weightedLowRatingSum = 0;
    for (const review of reviews) {
      const ageMonths = (now - review.createdAt.getTime()) / MS_PER_MONTH;
      const weight = Math.pow(0.5, ageMonths / REVIEW_DECAY_HALF_LIFE_MONTHS);
      sumWeight += weight;
      weightedRatingSum += weight * review.rating;
      if (review.rating <= 2) weightedLowRatingSum += weight;
    }
    const hasReviews = sumWeight > 0;
    const avgRating01 = hasReviews ? weightedRatingSum / sumWeight / 5 : null;
    const lowRatingRate = hasReviews ? weightedLowRatingSum / sumWeight : null;

    // Disputes (15%): no owner-initiated "performance complaint" entity
    // exists yet (see schema.prisma's Trust Score section), so this
    // approximates the component with the rate of seriously negative
    // (<=2 star) verified reviews — real signal, just a narrower one than
    // the design doc's dedicated dispute-tracking data source.
    const disputesScore = lowRatingRate !== null ? clamp01(1 - lowRatingRate) : 0.7;

    // Service (10%): blend of review sentiment and how quickly the
    // contractor responds to tender invitations — both real, computed
    // signals; averaged when both exist, otherwise whichever is available.
    const responseSpeeds = respondedInvitations
      .filter((inv) => inv.respondedAt)
      .map((inv) => {
        const days = (inv.respondedAt!.getTime() - inv.invitedAt.getTime()) / MS_PER_DAY;
        return clamp01(1 - days / RESPONSE_SLOW_CAP_DAYS);
      });
    const avgResponseSpeed01 =
      responseSpeeds.length > 0 ? responseSpeeds.reduce((a, b) => a + b, 0) / responseSpeeds.length : null;
    const servicePieces = [avgRating01, avgResponseSpeed01].filter((v): v is number => v !== null);
    const serviceScore = servicePieces.length > 0 ? servicePieces.reduce((a, b) => a + b, 0) / servicePieces.length : 0.6;

    // Tenure & experience (10%): count of signed contracts platform-wide,
    // blended with account age.
    const contractCountNorm = Math.min(n, TENURE_CONTRACT_CAP) / TENURE_CONTRACT_CAP;
    const ageYears = (now - contractor.createdAt.getTime()) / MS_PER_YEAR;
    const ageNorm = clamp01(ageYears / TENURE_AGE_CAP_YEARS);
    const tenureScore = 0.7 * contractCountNorm + 0.3 * ageNorm;

    const [scheduleScore, qualityScore, financialScore] = await Promise.all([
      this.scheduleAdherence.scoreFor(contractorProfileId),
      this.executionQuality.scoreFor(contractorProfileId),
      this.financialTransparency.scoreFor(contractorProfileId),
    ]);

    const components = [
      { key: "schedule_adherence" as const, weight: WEIGHTS.schedule, value: scheduleScore, real: false },
      { key: "execution_quality" as const, weight: WEIGHTS.quality, value: qualityScore, real: false },
      { key: "financial_transparency" as const, weight: WEIGHTS.financial, value: financialScore, real: false },
      { key: "disputes" as const, weight: WEIGHTS.disputes, value: disputesScore, real: true },
      { key: "service" as const, weight: WEIGHTS.service, value: serviceScore, real: true },
      { key: "tenure_experience" as const, weight: WEIGHTS.tenure, value: tenureScore, real: true },
    ];

    const raw = components.reduce((sum, c) => sum + c.weight * c.value, 0);
    const score = raw * confidence;

    return {
      contractorProfileId,
      score: Math.round(score * 1000) / 10, // 0..100, one decimal
      confidence: Math.round(confidence * 1000) / 1000,
      sampleSize: n,
      components: components.map((c) => ({
        key: c.key,
        weight: c.weight,
        value: Math.round(c.value * 1000) / 1000,
        isReal: c.real,
      })),
    };
  }
}
