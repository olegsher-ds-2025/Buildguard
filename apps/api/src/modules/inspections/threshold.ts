import type { ChecklistThreshold } from "@buildguard/shared-types";

export interface ThresholdVerdict {
  evaluated: boolean;
  breached: boolean;
}

/**
 * Thresholds are extracted from free text, so they only gate anything once a
 * person has reviewed them. An item with several comparisons would need one
 * value per measure; with a single numeric field we only evaluate the
 * unambiguous one-threshold case.
 */
export function evaluateThreshold(
  thresholds: ChecklistThreshold[],
  reviewed: boolean,
  value: number | null | undefined,
): ThresholdVerdict {
  if (!reviewed || thresholds.length !== 1 || value === null || value === undefined) {
    return { evaluated: false, breached: false };
  }
  const { op, value: limit } = thresholds[0];
  const breached =
    op === "≥" ? value < limit : op === "≤" ? value > limit : op === ">" ? value <= limit : value >= limit;
  return { evaluated: true, breached };
}
