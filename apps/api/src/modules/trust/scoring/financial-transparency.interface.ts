/**
 * Seam for the "financial transparency" component (20%, design doc §6.3):
 * invoices on time, deviation from quote, undocumented extras. Invoice in
 * this schema hangs off a BudgetLine, not a contractor — there is no
 * attributable-per-contractor invoice data yet. Swapping this binding (see
 * TrustModule) for a real implementation, once Invoice tracks which
 * contractor submitted it, is the entire integration point.
 */
export abstract class FinancialTransparencyProvider {
  abstract scoreFor(contractorProfileId: string): Promise<number>;
}
