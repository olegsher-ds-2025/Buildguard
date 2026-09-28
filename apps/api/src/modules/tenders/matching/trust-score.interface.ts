import type { ContractorVerificationStatus } from "@buildguard/shared-types";

/**
 * Seam for the `trust_score_normalized` term of the match-score formula
 * (design doc §6.2). There is no Trust Score module yet (see build plan
 * §1) — swapping this one binding (see TendersModule) for a real Trust
 * Score lookup is the entire integration point once that module exists;
 * DefaultMatchingEngine never needs to change.
 */
export abstract class TrustScoreProvider {
  abstract scoreFor(contractorProfileId: string, verificationStatus: ContractorVerificationStatus): Promise<number>;
}
