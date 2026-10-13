import type { ExtractedQuote } from "@buildguard/shared-types";
import { assessRisks } from "./quote-risks";

const quote = (over: Partial<ExtractedQuote> = {}): ExtractedQuote => ({
  supplierName: "x", totalAmountIls: 100_000, vatIncluded: true, scopeItems: ["a", "b", "c"], exclusions: [],
  payment: { advancePct: 10, schedule: null }, warranty: { years: 5, notes: null }, timelineDays: 30, notes: null, ...over,
});
const codes = (q: ExtractedQuote, all = [q]) => assessRisks(q, all).map((r) => r.code);

describe("assessRisks", () => {
  it("raises nothing for a complete, ordinary quote", () => {
    expect(codes(quote())).toEqual([]);
  });

  it("flags a high advance as a warning and a very high one as critical", () => {
    expect(assessRisks(quote({ payment: { advancePct: 30, schedule: null } }), [])[0]).toMatchObject({ code: "high_advance", severity: "warning" });
    expect(assessRisks(quote({ payment: { advancePct: 50, schedule: null } }), [])[0]).toMatchObject({ code: "high_advance", severity: "critical" });
    expect(codes(quote({ payment: { advancePct: 20, schedule: null } }))).toEqual([]);
  });

  it("flags a missing warranty and a vague scope, but not unknown advance terms", () => {
    expect(codes(quote({ warranty: { years: null, notes: null }, scopeItems: ["a"] }))).toEqual(["missing_warranty", "vague_scope"]);
    expect(codes(quote({ payment: { advancePct: null, schedule: null } }))).toEqual([]);
  });

  it("flags a quote with no total", () => {
    expect(codes(quote({ totalAmountIls: null }))).toEqual(["no_total"]);
  });

  it("flags a price far below the median, but only with enough quotes to compare", () => {
    const cheap = quote({ totalAmountIls: 50_000 });
    const peers = [cheap, quote({ totalAmountIls: 100_000 }), quote({ totalAmountIls: 110_000 })];
    expect(codes(cheap, peers)).toContain("price_unusually_low");
    expect(codes(peers[1], peers)).not.toContain("price_unusually_low");
    expect(codes(cheap, [cheap, quote()])).not.toContain("price_unusually_low");
  });
});
