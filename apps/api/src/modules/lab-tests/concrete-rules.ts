/**
 * Concrete lab-result and formwork-removal rules, as written in the project's
 * supervision checklist (stage 3). These are safety rules: the numbers below
 * come from that checklist, not from the standard itself, and need a
 * structural engineer's sign-off before they are relied on.
 */

// "7 ימים ≥ ~62% מהחוזק"
export const SEVEN_DAY_MIN_RATIO = 0.62;

// Only grades the checklist states a figure for. Any other grade must be given its 28-day strength explicitly.
const KNOWN_GRADE_MPA_28: Record<string, number> = { "ב-30": 33 };

export function knownRequiredMpa28(grade: string): number | undefined {
  return KNOWN_GRADE_MPA_28[grade.trim()];
}

export type ResultVerdict = "pass" | "fail";

export function evaluateResult(ageDays: number, strengthMpa: number, requiredMpa28: number): ResultVerdict {
  const required = ageDays === 7 ? requiredMpa28 * SEVEN_DAY_MIN_RATIO : requiredMpa28;
  return strengthMpa >= required ? "pass" : "fail";
}

/** A cantilever counts double; the governing span is the longer of the two. */
export function effectiveSpanMeters(spanMeters: number | null, cantileverMeters: number | null): number | null {
  if (spanMeters === null && cantileverMeters === null) return null;
  return Math.max(spanMeters ?? 0, (cantileverMeters ?? 0) * 2);
}

/**
 * Days before supports may come down: up to 3 m "3–6 days", 3–6 m 7 days, over
 * 6 m 10 days. For the first bracket we take the upper end (6) — the safe side.
 */
export function formworkRemovalDays(effectiveSpan: number): number {
  if (effectiveSpan <= 3) return 6;
  if (effectiveSpan <= 6) return 7;
  return 10;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export type FormworkStatus = "removed" | "ready" | "too_early" | "span_unknown" | "blocked_failed_cubes";

export interface PourFacts {
  castAt: Date;
  spanMeters: number | null;
  cantileverMeters: number | null;
  formworkRemovedAt: Date | null;
}

export interface PourFormworkState {
  earliestRemovalAt: Date | null;
  status: FormworkStatus;
}

/** `failedCubes` = the latest result of some age failed (a passing retest clears it). */
export function formworkState(pour: PourFacts, failedCubes: boolean, now: Date): PourFormworkState {
  const span = effectiveSpanMeters(pour.spanMeters, pour.cantileverMeters);
  const earliestRemovalAt = span === null ? null : addDays(pour.castAt, formworkRemovalDays(span));
  if (pour.formworkRemovedAt) return { earliestRemovalAt, status: "removed" };
  if (failedCubes) return { earliestRemovalAt, status: "blocked_failed_cubes" };
  if (earliestRemovalAt === null) return { earliestRemovalAt, status: "span_unknown" };
  return { earliestRemovalAt, status: now >= earliestRemovalAt ? "ready" : "too_early" };
}
