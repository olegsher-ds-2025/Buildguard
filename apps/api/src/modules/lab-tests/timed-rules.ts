/** Durations from the checklist: pressure test at least 24 h; flood test 24–72 h, 72 recommended. */
import type { TimedTestKind } from "@prisma/client";

export const DEFAULT_DURATION_HOURS: Record<TimedTestKind, number> = { pressure: 24, flood: 72 };

export function isValidDuration(kind: TimedTestKind, hours: number): boolean {
  return kind === "pressure" ? hours >= 24 : hours >= 24 && hours <= 72;
}

export function dueAt(startedAt: Date, durationHours: number): Date {
  return new Date(startedAt.getTime() + durationHours * 60 * 60 * 1000);
}
