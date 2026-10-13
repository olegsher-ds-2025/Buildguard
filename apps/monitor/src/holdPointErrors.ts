import { ApiError } from "@buildguard/api-client";

export function openHoldPointTexts(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.status !== 409) return [];
  const list = (error.body as { openHoldPoints?: { text: string }[] } | undefined)?.openHoldPoints;
  return Array.isArray(list) ? list.map((h) => h.text) : [];
}
