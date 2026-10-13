/**
 * Amounts arrive over the wire as decimal-string minor units (see
 * AmountMinorWire in shared-types) — e.g. "42000000" agorot for ₪420,000.
 * Every display of money must go through here rather than formatting the
 * raw minor-unit number directly.
 */
const LOCALE = "he-IL";
const TIME_ZONE = "Asia/Jerusalem";

export function formatMoney(minor: string, currency: string): string {
  const major = Number(BigInt(minor)) / 100;
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, maximumFractionDigits: 0 }).format(major);
}

export function formatAmount(minor: string): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(Number(BigInt(minor)) / 100);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export function formatPercent(pct: number): string {
  return `${Math.round(pct)}%`;
}

export function formatIls(shekels: number): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(shekels);
}
