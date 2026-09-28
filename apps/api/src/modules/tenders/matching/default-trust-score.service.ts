import { Injectable } from "@nestjs/common";
import type { ContractorVerificationStatus } from "@buildguard/shared-types";
import { TrustScoreProvider } from "./trust-score.interface";

/**
 * Placeholder pending a real Trust Score module (design doc §6.3, phase 2):
 * a contractor's only quality signal today is their verification status.
 * This is deliberately coarse — not a faked score — and documented in
 * README's "Known simplifications".
 */
@Injectable()
export class DefaultTrustScoreProvider extends TrustScoreProvider {
  async scoreFor(_contractorProfileId: string, verificationStatus: ContractorVerificationStatus): Promise<number> {
    switch (verificationStatus) {
      case "verified":
        return 1.0;
      case "pending":
        return 0.5;
      default:
        return 0.0;
    }
  }
}
