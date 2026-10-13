import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ExtractedQuote, RequirementCoverage, ScopeCoverage } from "@buildguard/shared-types";

export interface QuoteDocument {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface ComparisonInput {
  quotes: { id: string; extraction: ExtractedQuote }[];
  /** Professional requirements for the work, from the supervision checklist. */
  requirements: string[];
  stageTitle: string | null;
}

export interface ComparisonOutput {
  scopeMatrix: { item: string; coverage: ScopeCoverage[] }[];
  requirementCoverage: { requirement: string; coverage: RequirementCoverage[] }[];
  recommendedQuoteId: string | null;
  rationale: string;
  questions: string[];
  negotiationTips: string[];
}

/** Schemas the model's answers are validated against (structured outputs). */
export const extractedQuoteSchema = z.object({
  supplierName: z.string().nullable(),
  totalAmountIls: z.number().nullable(),
  vatIncluded: z.boolean().nullable(),
  scopeItems: z.array(z.string()),
  exclusions: z.array(z.string()),
  payment: z.object({ advancePct: z.number().nullable(), schedule: z.string().nullable() }),
  warranty: z.object({ years: z.number().nullable(), notes: z.string().nullable() }),
  timelineDays: z.number().nullable(),
  notes: z.string().nullable(),
});

export const comparisonSchema = z.object({
  scopeMatrix: z.array(z.object({ item: z.string(), coverage: z.array(z.enum(["included", "missing", "unclear"])) })),
  requirementCoverage: z.array(z.object({ requirement: z.string(), coverage: z.array(z.enum(["covered", "missing", "unclear"])) })),
  /** 1-based position of the recommended quote in the order given, or null if none can be recommended. */
  recommendedQuoteNumber: z.number().nullable(),
  rationale: z.string(),
  questions: z.array(z.string()),
  negotiationTips: z.array(z.string()),
});

/** The seam: swap this binding between the deterministic mock and the Claude implementation. */
export abstract class QuoteAnalysisProvider {
  abstract extract(doc: QuoteDocument): Promise<ExtractedQuote>;
  abstract compare(input: ComparisonInput): Promise<ComparisonOutput>;
}

/** Deterministic stand-in so the whole flow runs without an API key: figures come from a hash of the file, not its contents. */
@Injectable()
export class MockQuoteAnalysisProvider extends QuoteAnalysisProvider {
  async extract(doc: QuoteDocument): Promise<ExtractedQuote> {
    const seed = createHash("sha256").update(doc.buffer).update(doc.filename).digest();
    const base = doc.filename.replace(/\.[^.]+$/, "");
    const scope = ["חפירה והידוק", "יציקת יסודות", "זיון ברזל", "בדיקות מעבדה", "פינוי פסולת"];
    return {
      supplierName: base || "ספק",
      totalAmountIls: 80_000 + (seed[0] % 40) * 1_000,
      vatIncluded: seed[1] % 2 === 0,
      scopeItems: scope.slice(0, 2 + (seed[2] % 4)),
      exclusions: seed[3] % 2 === 0 ? ["היטלים ואגרות"] : [],
      payment: { advancePct: [10, 30, 50][seed[4] % 3], schedule: "לפי התקדמות" },
      warranty: { years: [null, 1, 2, 5][seed[5] % 4], notes: null },
      timelineDays: 20 + (seed[6] % 40),
      notes: "נתוני הדגמה — לא נקראו מהמסמך",
    };
  }

  async compare(input: ComparisonInput): Promise<ComparisonOutput> {
    const items = [...new Set(input.quotes.flatMap((q) => q.extraction.scopeItems))];
    const priced = input.quotes.filter((q) => q.extraction.totalAmountIls !== null && q.extraction.warranty.years !== null);
    const best = [...priced].sort((a, b) => a.extraction.totalAmountIls! - b.extraction.totalAmountIls!)[0];
    return {
      scopeMatrix: items.map((item) => ({ item, coverage: input.quotes.map((q) => (q.extraction.scopeItems.includes(item) ? "included" : "missing")) })),
      requirementCoverage: input.requirements.map((requirement) => ({ requirement, coverage: input.quotes.map(() => "unclear") })),
      recommendedQuoteId: best?.id ?? null,
      rationale: "ניתוח הדגמה: המחיר הנמוך ביותר מבין ההצעות שכוללות אחריות.",
      questions: ["האם המחיר כולל מע״מ?", "מה כלול באחריות ומה לא?"],
      negotiationTips: ["לבקש הקטנת מקדמה לטובת תשלום לפי התקדמות."],
    };
  }
}
