import type { ExtractedQuote, QuoteRisk } from "@buildguard/shared-types";

// Defaults to adjust with the project's counsel: an advance above 20% is flagged, above 40% critical.
export const ADVANCE_WARN_PCT = 20;
export const ADVANCE_CRITICAL_PCT = 40;
export const MIN_SCOPE_ITEMS = 3;
/** A quote below 70% of the median of the quotes compared is treated as suspiciously low. */
export const LOW_PRICE_RATIO = 0.7;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Risk flags for one quote, judged against the others being compared. Rules are deterministic so they can be explained and tested. */
export function assessRisks(quote: ExtractedQuote, all: ExtractedQuote[]): QuoteRisk[] {
  const risks: QuoteRisk[] = [];

  const advance = quote.payment.advancePct;
  if (advance !== null && advance > ADVANCE_WARN_PCT) {
    risks.push({
      code: "high_advance",
      severity: advance > ADVANCE_CRITICAL_PCT ? "critical" : "warning",
      detail: `${advance}%`,
    });
  }
  if (quote.warranty.years === null) risks.push({ code: "missing_warranty", severity: "warning", detail: null });
  if (quote.scopeItems.length < MIN_SCOPE_ITEMS) {
    risks.push({ code: "vague_scope", severity: "warning", detail: String(quote.scopeItems.length) });
  }

  if (quote.totalAmountIls === null) {
    risks.push({ code: "no_total", severity: "warning", detail: null });
  } else {
    const totals = all.map((q) => q.totalAmountIls).filter((v): v is number => v !== null);
    if (totals.length >= 3 && quote.totalAmountIls < median(totals) * LOW_PRICE_RATIO) {
      risks.push({ code: "price_unusually_low", severity: "warning", detail: null });
    }
  }
  return risks;
}
