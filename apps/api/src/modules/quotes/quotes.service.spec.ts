import { BadRequestException } from "@nestjs/common";
import { QuotesService } from "./quotes.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { StorageService } from "../storage/storage.service";
import { MockQuoteAnalysisProvider, type QuoteAnalysisProvider } from "./quote-analysis.provider";

const quote = (id: string, over: object = {}) => ({
  id, comparisonId: "c1", filename: `${id}.pdf`, contentType: "application/pdf", objectKey: `k/${id}`, supplierName: null,
  status: "uploaded", extraction: null, error: null, createdAt: new Date(), ...over,
});

function makeService(opts: { quotes: ReturnType<typeof quote>[]; buffers?: Record<string, Buffer | null>; provider?: QuoteAnalysisProvider; template?: object | null }) {
  const store = new Map(opts.quotes.map((q) => [q.id, { ...q }]));
  const comparison = { id: "c1", projectId: "p1", title: "t", stageNo: 1, analysis: null, analyzedAt: null, createdAt: new Date() };
  const prisma = {
    quoteComparison: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve({ ...comparison, quotes: [...store.values()] })),
      update: jest.fn().mockResolvedValue({}),
    },
    quote: {
      update: jest.fn().mockImplementation(({ where, data }) => {
        store.set(where.id, { ...store.get(where.id)!, ...data });
        return Promise.resolve({});
      }),
      upsert: jest.fn(),
    },
    checklistTemplate: { findFirst: jest.fn().mockResolvedValue(opts.template ?? null) },
  } as unknown as PrismaService;
  const storage = {
    getObjectBuffer: jest.fn().mockImplementation((key: string) => Promise.resolve(opts.buffers?.[key] === undefined ? Buffer.from(key) : opts.buffers[key])),
    objectExists: jest.fn().mockResolvedValue(true),
    getUploadUrl: jest.fn().mockResolvedValue("http://upload"),
  } as unknown as StorageService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const provider = opts.provider ?? new MockQuoteAnalysisProvider();
  return { service: new QuotesService(prisma, storage, audit, provider), prisma, audit, store, provider };
}

describe("QuotesService.analyze", () => {
  it("reads every quote, compares them, and audits", async () => {
    const { service, prisma, audit } = makeService({ quotes: [quote("a"), quote("b")] });
    await service.analyze("p1", "c1", "u1");

    const update = (prisma.quoteComparison.update as jest.Mock).mock.calls[0][0].data;
    expect(update.analysis.quoteIds).toEqual(["a", "b"]);
    expect(update.analysis.scopeMatrix.length).toBeGreaterThan(0);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "quote_comparison_analyzed", metadata: { quotes: 2, readable: 2 } }));
  });

  it("fails only the unreadable quote and still compares the rest", async () => {
    const { service, prisma, store } = makeService({ quotes: [quote("a"), quote("b"), quote("c")], buffers: { "k/b": null } });
    await service.analyze("p1", "c1", "u1");

    expect(store.get("b")).toMatchObject({ status: "failed", error: "The file could not be read from storage" });
    const update = (prisma.quoteComparison.update as jest.Mock).mock.calls[0][0].data;
    expect(update.analysis.quoteIds).toEqual(["a", "c"]);
  });

  it("skips the comparison when fewer than two quotes could be read, but still keeps the extraction", async () => {
    const { service, prisma, store } = makeService({ quotes: [quote("a")] });
    await service.analyze("p1", "c1", "u1");
    expect(store.get("a")?.status).toBe("extracted");
    const { Prisma } = jest.requireActual("@prisma/client");
    expect((prisma.quoteComparison.update as jest.Mock).mock.calls[0][0].data.analysis).toBe(Prisma.JsonNull);
  });

  it("does not re-read quotes that were already extracted", async () => {
    const extracted = quote("a", { status: "extracted", extraction: { supplierName: "x", scopeItems: [], exclusions: [], payment: {}, warranty: {} } });
    const provider = new MockQuoteAnalysisProvider();
    const spy = jest.spyOn(provider, "extract");
    const { service } = makeService({ quotes: [extracted, quote("b")], provider });
    await service.analyze("p1", "c1", "u1");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("refuses a comparison with no quotes", async () => {
    await expect(makeService({ quotes: [] }).service.analyze("p1", "c1", "u1")).rejects.toThrow(BadRequestException);
  });

  it("hands the stage's lab, written-approval and hold-point requirements to the comparison", async () => {
    const provider = new MockQuoteAnalysisProvider();
    const spy = jest.spyOn(provider, "compare");
    const template = { title: "ביסוס", holdPoints: [{ text: "אין יציקה ללא יועץ קרקע" }], items: [{ text: "בדיקת צפיפות במעבדה" }] };
    const { service } = makeService({ quotes: [quote("a"), quote("b")], provider, template });
    await service.analyze("p1", "c1", "u1");
    expect(spy.mock.calls[0][0]).toMatchObject({ stageTitle: "ביסוס", requirements: ["אין יציקה ללא יועץ קרקע", "בדיקת צפיפות במעבדה"] });
  });
});
