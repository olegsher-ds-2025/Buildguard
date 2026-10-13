import type Anthropic from "@anthropic-ai/sdk";
import { ClaudeQuoteAnalysisProvider } from "./claude-quote-analysis.provider";
import type { ExtractedQuote } from "@buildguard/shared-types";

const extraction = (over: Partial<ExtractedQuote> = {}): ExtractedQuote => ({
  supplierName: "אבי", totalAmountIls: 100_000, vatIncluded: true, scopeItems: ["a", "b", "c"], exclusions: [],
  payment: { advancePct: 10, schedule: null }, warranty: { years: 5, notes: null }, timelineDays: 30, notes: null, ...over,
});

function makeProvider(response: object) {
  const parse = jest.fn().mockResolvedValue(response);
  const client = { messages: { parse } } as unknown as Anthropic;
  return { provider: new ClaudeQuoteAnalysisProvider(client, "extract-model", "compare-model"), parse };
}

describe("ClaudeQuoteAnalysisProvider.extract", () => {
  it("sends a PDF as a base64 document block to the extraction model with a structured-output format", async () => {
    const { provider, parse } = makeProvider({ stop_reason: "end_turn", parsed_output: extraction() });
    const result = await provider.extract({ buffer: Buffer.from("%PDF-1.4"), contentType: "application/pdf", filename: "q.pdf" });

    expect(result.supplierName).toBe("אבי");
    const request = parse.mock.calls[0][0];
    expect(request.model).toBe("extract-model");
    expect(request.messages[0].content[0]).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: Buffer.from("%PDF-1.4").toString("base64") },
    });
    expect(request.output_config.format).toBeDefined();
    expect(request.output_config.effort).toBe("low");
    expect(request.system).toMatch(/never estimate/i);
  });

  it("sends a photo as an image block", async () => {
    const { provider, parse } = makeProvider({ stop_reason: "end_turn", parsed_output: extraction() });
    await provider.extract({ buffer: Buffer.from("jpg"), contentType: "image/jpeg", filename: "q.jpg" });
    expect(parse.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
  });

  it("fails clearly when the model refuses, is cut off, or returns nothing parseable", async () => {
    const doc = { buffer: Buffer.from("x"), contentType: "application/pdf", filename: "q.pdf" };
    await expect(makeProvider({ stop_reason: "refusal", parsed_output: null }).provider.extract(doc)).rejects.toThrow(/declined/);
    await expect(makeProvider({ stop_reason: "max_tokens", parsed_output: null }).provider.extract(doc)).rejects.toThrow(/cut off/);
    await expect(makeProvider({ stop_reason: "end_turn", parsed_output: null }).provider.extract(doc)).rejects.toThrow(/parsed/);
  });
});

describe("ClaudeQuoteAnalysisProvider.compare", () => {
  const input = {
    quotes: [{ id: "q-a", extraction: extraction() }, { id: "q-b", extraction: extraction({ supplierName: "בני" }) }],
    requirements: ["בדיקת מעבדה"],
    stageTitle: "ביסוס",
  };
  const answer = (over: object = {}) => ({
    stop_reason: "end_turn",
    parsed_output: {
      scopeMatrix: [{ item: "a", coverage: ["included", "missing"] }],
      requirementCoverage: [{ requirement: "בדיקת מעבדה", coverage: ["unclear", "covered"] }],
      recommendedQuoteNumber: 2,
      rationale: "טוב יותר",
      questions: ["?"],
      negotiationTips: ["!"],
      ...over,
    },
  });

  it("sends only the extracted terms, numbered from 1, and maps the recommendation back to a quote id", async () => {
    const { provider, parse } = makeProvider(answer());
    const out = await provider.compare(input);

    expect(out.recommendedQuoteId).toBe("q-b");
    const request = parse.mock.calls[0][0];
    expect(request.model).toBe("compare-model");
    const sent = JSON.parse(request.messages[0].content);
    expect(sent.quotes.map((q: { number: number }) => q.number)).toEqual([1, 2]);
    expect(sent.requirements).toEqual(["בדיקת מעבדה"]);
  });

  it("treats an out-of-range recommendation as no recommendation", async () => {
    expect((await makeProvider(answer({ recommendedQuoteNumber: 9 })).provider.compare(input)).recommendedQuoteId).toBeNull();
    expect((await makeProvider(answer({ recommendedQuoteNumber: null })).provider.compare(input)).recommendedQuoteId).toBeNull();
  });

  it("rejects an answer that does not cover every quote in every row", async () => {
    const bad = answer({ scopeMatrix: [{ item: "a", coverage: ["included"] }] });
    await expect(makeProvider(bad).provider.compare(input)).rejects.toThrow(/every quote/);
  });
});
