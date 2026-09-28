import { Injectable } from "@nestjs/common";
import type { ContractorVerificationStatus } from "@buildguard/shared-types";
import { TrustScoreProvider } from "./trust-score.interface";
import { TrustScoreService } from "../../trust/trust-score.service";

/**
 * Real implementation of the matching engine's TrustScoreProvider seam
 * (see trust-score.interface.ts), now that the Trust Score module (M9)
 * exists. TrustScoreService returns 0..100; the matching formula (design
 * doc §6.2) expects 0..1.
 */
@Injectable()
export class ComputedTrustScoreProvider extends TrustScoreProvider {
  constructor(private readonly trustScore: TrustScoreService) {
    super();
  }

  async scoreFor(contractorProfileId: string, _verificationStatus: ContractorVerificationStatus): Promise<number> {
    const { score } = await this.trustScore.computeScore(contractorProfileId);
    return score / 100;
  }
}
