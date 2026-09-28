import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { ReviewSummary, TrustScoreSummary } from "@buildguard/shared-types";
import { TrustScoreService } from "./trust-score.service";
import { ReviewsService } from "./reviews.service";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";

/** Not project-scoped — a contractor's trust score/reviews are platform-wide (shown in tender invitations, bid comparison, etc). */
@Controller("contractor-profiles/:contractorProfileId")
@UseGuards(JwtAuthGuard)
export class TrustScoreController {
  constructor(
    private readonly trustScore: TrustScoreService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get("trust-score")
  getScore(@Param("contractorProfileId") contractorProfileId: string): Promise<TrustScoreSummary> {
    return this.trustScore.computeScore(contractorProfileId);
  }

  @Get("reviews")
  listReviews(@Param("contractorProfileId") contractorProfileId: string): Promise<ReviewSummary[]> {
    return this.reviews.listForContractor(contractorProfileId);
  }
}
