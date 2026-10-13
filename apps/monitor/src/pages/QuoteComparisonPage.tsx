import { useState, type ChangeEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { QuoteComparisonAnalysis, QuoteRisk, QuoteSummary } from "@buildguard/shared-types";
import { api } from "../api";
import { formatIls, formatPercent } from "../format";
import { t, type MessageKey } from "../i18n/he";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

interface UploadState {
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

const COVERAGE_MARKS: Record<string, string> = {
  included: "✓",
  covered: "✓",
  missing: "✗",
  unclear: "?",
};

function NotStated() {
  return <span className="muted">{t("quotes.notStated")}</span>;
}

function orNotStated(value: ReactNode | null | undefined) {
  return value === null || value === undefined || value === "" ? <NotStated /> : value;
}

function listOrNotStated(items: string[]) {
  return items.length === 0 ? (
    <NotStated />
  ) : (
    <ul className="quote-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function riskDetail(risk: QuoteRisk): string {
  if (!risk.detail) return "";
  if (risk.code === "high_advance") return ` · ${risk.detail}%`;
  if (risk.code === "vague_scope") return ` · ${risk.detail} ${t("quotes.risk.scopeItems")}`;
  return "";
}

function RiskChips({ risks }: { risks: QuoteRisk[] }) {
  if (risks.length === 0) return <span className="muted">{t("quotes.risks.none")}</span>;
  return (
    <div className="quote-risks">
      {risks.map((risk) => (
        <span key={risk.code} className={`quote-risk ${risk.severity}`}>
          {t(`quotes.risk.${risk.severity}` as MessageKey)}: {t(`quotes.risk.${risk.code}` as MessageKey)}
          {riskDetail(risk)}
        </span>
      ))}
    </div>
  );
}

function supplierOf(quote: QuoteSummary): string {
  return quote.extraction?.supplierName ?? quote.supplierName ?? t("quotes.unknownSupplier");
}

function vatText(vatIncluded: boolean | null) {
  if (vatIncluded === null) return <NotStated />;
  return vatIncluded ? t("quotes.terms.vatIncluded") : t("quotes.terms.vatExcluded");
}

function TermsTable({ quotes }: { quotes: QuoteSummary[] }) {
  const rows: { label: MessageKey; cell: (q: QuoteSummary) => ReactNode }[] = [
    { label: "quotes.terms.supplier", cell: (q) => <strong>{supplierOf(q)}</strong> },
    { label: "quotes.terms.total", cell: (q) => orNotStated(q.extraction!.totalAmountIls === null ? null : formatIls(q.extraction!.totalAmountIls)) },
    { label: "quotes.terms.vat", cell: (q) => vatText(q.extraction!.vatIncluded) },
    {
      label: "quotes.terms.advance",
      cell: (q) => orNotStated(q.extraction!.payment.advancePct === null ? null : formatPercent(q.extraction!.payment.advancePct)),
    },
    { label: "quotes.terms.schedule", cell: (q) => orNotStated(q.extraction!.payment.schedule) },
    {
      label: "quotes.terms.warranty",
      cell: (q) => {
        const { years, notes } = q.extraction!.warranty;
        if (years === null && !notes) return <NotStated />;
        return [years !== null && `${years} ${t("quotes.terms.years")}`, notes].filter(Boolean).join(" · ");
      },
    },
    {
      label: "quotes.terms.timeline",
      cell: (q) => orNotStated(q.extraction!.timelineDays === null ? null : `${q.extraction!.timelineDays} ${t("quotes.terms.days")}`),
    },
    { label: "quotes.terms.exclusions", cell: (q) => listOrNotStated(q.extraction!.exclusions) },
    { label: "quotes.terms.notes", cell: (q) => orNotStated(q.extraction!.notes) },
    { label: "quotes.risks.title", cell: (q) => <RiskChips risks={q.risks} /> },
  ];

  return (
    <div className="table-scroll">
      <table className="quote-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{t(row.label)}</th>
              {quotes.map((q) => (
                <td key={q.id}>{row.cell(q)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageMatrix({
  heading,
  rows,
  quotes,
}: {
  heading: string;
  rows: { label: string; coverage: string[] }[];
  quotes: QuoteSummary[];
}) {
  return (
    <div className="table-scroll">
      <table className="quote-table">
        <thead>
          <tr>
            <th>{heading}</th>
            {quotes.map((q) => (
              <th key={q.id}>{supplierOf(q)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {quotes.map((q, i) => {
                const value = row.coverage[i] ?? "unclear";
                const label = t(`quotes.coverage.${value}` as MessageKey);
                return (
                  <td key={q.id} className={`cov ${value}`} title={label}>
                    <span aria-hidden="true">{COVERAGE_MARKS[value]}</span>
                    <span className="sr-only">{label}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Recommendation({ analysis, quotes }: { analysis: QuoteComparisonAnalysis; quotes: QuoteSummary[] }) {
  const recommended = quotes.find((q) => q.id === analysis.recommendedQuoteId);
  return (
    <div className="card quote-recommendation">
      <div className="group-title">{t("quotes.recommendation.title")}</div>
      {recommended ? (
        <p className="quote-recommended">
          {t("quotes.recommendation.recommended")}: <strong>{supplierOf(recommended)}</strong>
        </p>
      ) : (
        <p className="quote-recommended">{t("quotes.recommendation.none")}</p>
      )}
      <p>{analysis.rationale}</p>
      {analysis.questions.length > 0 && (
        <>
          <div className="group-title">{t("quotes.questions.title")}</div>
          <ul className="quote-list">
            {analysis.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </>
      )}
      {analysis.negotiationTips.length > 0 && (
        <>
          <div className="group-title">{t("quotes.tips.title")}</div>
          <ul className="quote-list">
            {analysis.negotiationTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function QuoteComparisonPage() {
  const { projectId, comparisonId } = useParams<{ projectId: string; comparisonId: string }>();
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [busy, setBusy] = useState(false);

  const comparison = useQuery({
    queryKey: ["quote-comparison", projectId, comparisonId],
    queryFn: () => api.getQuoteComparison(projectId!, comparisonId!),
    enabled: !!projectId && !!comparisonId,
  });

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["quote-comparison", projectId, comparisonId] }),
      queryClient.invalidateQueries({ queryKey: ["quote-comparisons", projectId] }),
    ]);
  }

  const analyze = useMutation({
    mutationFn: () => api.analyzeQuoteComparison(projectId!, comparisonId!),
    onSuccess: refresh,
  });

  async function uploadOne(file: File, index: number) {
    const patch = (state: Partial<UploadState>) =>
      setUploads((all) => all.map((u, i) => (i === index ? { ...u, ...state } : u)));
    try {
      const { quoteId, uploadUrl } = await api.createQuoteUpload(projectId!, comparisonId!, {
        filename: file.name,
        contentType: file.type,
      });
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(`storage upload failed (${put.status})`);
      await api.confirmQuoteUpload(projectId!, comparisonId!, quoteId, { filename: file.name, contentType: file.type });
      patch({ status: "done" });
    } catch {
      patch({ status: "error", error: t("quotes.upload.failed") });
    }
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploads(
      files.map((f) =>
        ALLOWED_TYPES.includes(f.type)
          ? { name: f.name, status: "uploading" }
          : { name: f.name, status: "error", error: t("quotes.upload.badType") },
      ),
    );
    setBusy(true);
    for (const [index, file] of files.entries()) {
      if (ALLOWED_TYPES.includes(file.type)) await uploadOne(file, index);
    }
    setBusy(false);
    await refresh();
  }

  if (comparison.isLoading) return <div className="page-loading">{t("quotes.loading")}</div>;
  if (comparison.isError || !comparison.data) return <div className="page-error">{t("quotes.detailLoadError")}</div>;

  const { title, stageNo, quotes, analysis } = comparison.data;
  const readable = quotes.filter((q) => q.extraction);
  const analyzedIds = analysis?.quoteIds ?? [];
  const ordered = [...readable].sort((a, b) => {
    const rank = (q: QuoteSummary) => {
      const i = analyzedIds.indexOf(q.id);
      return i === -1 ? analyzedIds.length : i;
    };
    return rank(a) - rank(b);
  });
  const matrixQuotes = analysis ? analysis.quoteIds.flatMap((id) => quotes.find((q) => q.id === id) ?? []) : [];
  const canAnalyze = quotes.length > 0 && !busy && !analyze.isPending;

  return (
    <div className="wrap">
      <Link to={`/projects/${projectId}/quotes`}>{t("quotes.back")}</Link>
      <h1>{title}</h1>
      {stageNo !== null && <p className="sub">{`${t("quotes.stage")} ${stageNo}`}</p>}

      <p className="disclaimer quote-disclaimer" role="note">
        {t("quotes.disclaimer")}
      </p>

      <section className="section">
        <h2>{t("quotes.upload.title")}</h2>
        <div className="card quote-upload">
          <p className="hint">{t("quotes.upload.hint")}</p>
          <label className={`quote-file-btn${busy ? " disabled" : ""}`}>
            {busy ? t("quotes.upload.uploading") : t("quotes.upload.choose")}
            <input type="file" multiple accept="application/pdf,image/*" disabled={busy} onChange={onFiles} />
          </label>
          {uploads.length > 0 && (
            <ul className="quote-list">
              {uploads.map((u, i) => (
                <li key={`${u.name}-${i}`}>
                  {u.name} ·{" "}
                  {u.status === "uploading" && t("quotes.upload.uploading")}
                  {u.status === "done" && `✓ ${t("quotes.upload.done")}`}
                  {u.status === "error" && <span className="form-error">{u.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="section">
        <h2>{t("quotes.list.title")}</h2>
        {quotes.length === 0 ? (
          <p className="hint">{t("quotes.list.empty")}</p>
        ) : (
          <div className="card">
            {quotes.map((q) => (
              <div key={q.id} className="quote-row">
                <span className="quote-file">{q.filename}</span>
                <span className={`hp-chip quote-status ${q.status}`}>{t(`quotes.status.${q.status}` as MessageKey)}</span>
                {q.status === "failed" && q.error && <span className="form-error quote-error">{q.error}</span>}
              </div>
            ))}
          </div>
        )}
        <div className="quote-analyze">
          <button type="button" className="primary" disabled={!canAnalyze} aria-busy={analyze.isPending} onClick={() => analyze.mutate()}>
            {analyze.isPending ? t("quotes.analyzing") : t("quotes.analyze")}
          </button>
          <p className="hint">{t("quotes.analyzeHint")}</p>
          {analyze.isPending && <div className="bar quote-progress" role="progressbar" aria-label={t("quotes.analyzing")}><i /></div>}
          {analyze.isError && <p className="form-error">{t("quotes.analyzeFailed")}</p>}
        </div>
      </section>

      {ordered.length > 0 && (
        <section className="section">
          <h2>{t("quotes.terms.title")}</h2>
          <TermsTable quotes={ordered} />
          <p className="hint quote-explain">{t("quotes.risks.explain")}</p>
        </section>
      )}

      {analysis && (
        <>
          {analysis.scopeMatrix.length > 0 && (
            <section className="section">
              <h2>{t("quotes.scope.title")}</h2>
              <CoverageMatrix
                heading={t("quotes.scope.item")}
                rows={analysis.scopeMatrix.map((r) => ({ label: r.item, coverage: r.coverage }))}
                quotes={matrixQuotes}
              />
            </section>
          )}
          {analysis.requirementCoverage.length > 0 && (
            <section className="section">
              <h2>{t("quotes.requirements.title")}</h2>
              <CoverageMatrix
                heading={t("quotes.requirements.item")}
                rows={analysis.requirementCoverage.map((r) => ({ label: r.requirement, coverage: r.coverage }))}
                quotes={matrixQuotes}
              />
            </section>
          )}
          <section className="section">
            <Recommendation analysis={analysis} quotes={quotes} />
          </section>
        </>
      )}
    </div>
  );
}
