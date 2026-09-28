/**
 * The matching seam (design doc §6.2, build plan §1): swapping the
 * MatchingEngine binding (see TendersModule) is the entire integration
 * point for a future, more sophisticated ranking algorithm — no controller,
 * schema, or frontend-contract change required, because the boundary is
 * this interface plus TenderInvitation, which the schema already defines.
 */
export interface MatchingInput {
  tenderId: string;
  projectId: string;
  workCategoryId: string;
  budgetMinMinor: bigint;
  budgetMaxMinor: bigint;
}

export interface MatchingCandidate {
  contractorProfileId: string;
  matchScore: number; // 0..1
}

export abstract class MatchingEngine {
  abstract rankCandidates(input: MatchingInput, topN: number): Promise<MatchingCandidate[]>;
}
