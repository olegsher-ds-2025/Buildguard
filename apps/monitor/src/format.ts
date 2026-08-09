/**
 * Amounts arrive over the wire as decimal-string minor units (see
 * AmountMinorWire in shared-types) — e.g. "42000000" agorot for ₪420,000.
 * Every display of money must go through here rather than formatting the
 * raw minor-unit number directly.
 */
export function formatMoney(minor: string, currency: string): string {
  const major = Number(BigInt(minor)) / 100;
  return new Intl.NumberFormat("en-IL", { style: "currency", currency, maximumFractionDigits: 0 }).format(major);
}

export function formatPercent(pct: number): string {
  return `${Math.round(pct)}%`;
}
