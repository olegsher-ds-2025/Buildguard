import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { formatDateTime } from "../format";
import { t } from "../i18n/he";

export function QuoteComparisonsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [stageNo, setStageNo] = useState("");

  const comparisons = useQuery({
    queryKey: ["quote-comparisons", projectId],
    queryFn: () => api.listQuoteComparisons(projectId!),
    enabled: !!projectId,
  });
  const templates = useQuery({ queryKey: ["checklist-templates"], queryFn: () => api.listChecklistTemplates() });
  const stages = templates.data?.filter((tpl) => tpl.isSystem).sort((a, b) => a.stageNo - b.stageNo) ?? [];

  const create = useMutation({
    mutationFn: () => api.createQuoteComparison(projectId!, { title: title.trim(), ...(stageNo && { stageNo: Number(stageNo) }) }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["quote-comparisons", projectId] });
      navigate(`/projects/${projectId}/quotes/${created.id}`);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  if (comparisons.isLoading) return <div className="page-loading">{t("quotes.loading")}</div>;
  if (comparisons.isError || !comparisons.data) return <div className="page-error">{t("quotes.loadError")}</div>;

  return (
    <div className="wrap">
      <h1>{t("quotes.title")}</h1>
      <p className="sub">{t("quotes.subtitle")}</p>

      <section className="section">
        <h2>{t("quotes.newTitle")}</h2>
        <form className="card hp-form" onSubmit={submit}>
          <label className="editor-field">
            {t("quotes.titleLabel")}
            <input type="text" value={title} placeholder={t("quotes.titlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="editor-field">
            {t("quotes.stageLabel")}
            <select value={stageNo} onChange={(e) => setStageNo(e.target.value)}>
              <option value="">{t("quotes.stageNone")}</option>
              {stages.map((tpl) => (
                <option key={tpl.id} value={tpl.stageNo}>
                  {t("quotes.stageOption")} {tpl.stageNo} · {tpl.title}
                </option>
              ))}
            </select>
          </label>
          {create.isError && <p className="form-error">{t("quotes.createFailed")}</p>}
          <div className="editor-actions">
            <button type="submit" className="primary" disabled={!title.trim() || create.isPending}>
              {create.isPending ? t("quotes.creating") : t("quotes.create")}
            </button>
          </div>
        </form>
      </section>

      <section className="section">
        {comparisons.data.length === 0 ? (
          <p className="hint">{t("quotes.empty")}</p>
        ) : (
          <ul className="project-list">
            {comparisons.data.map((c) => (
              <li key={c.id}>
                <Link to={`/projects/${projectId}/quotes/${c.id}`}>
                  <strong>{c.title}</strong>
                  <span>
                    {c.stageNo !== null && `${t("quotes.stage")} ${c.stageNo} · `}
                    {c.quotes.length} {t("quotes.quoteCount")} ·{" "}
                    {c.analyzedAt ? `${t("quotes.analyzedAt")} ${formatDateTime(c.analyzedAt)}` : t("quotes.notAnalyzed")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
