import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { formatDate } from "../format";
import { t, type MessageKey } from "../i18n/he";
import { useMyProjectRole } from "../useMyProjectRole";
import { CachedNotice } from "../offline/CachedNotice";

export function InspectionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isReviewer } = useMyProjectRole(projectId);
  const [phaseId, setPhaseId] = useState("");
  const [templateId, setTemplateId] = useState("");

  const inspections = useQuery({
    queryKey: ["inspections", projectId],
    queryFn: () => api.listInspections(projectId!),
    enabled: !!projectId,
  });
  const dashboard = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => api.getProjectDashboard(projectId!),
    enabled: !!projectId && isReviewer,
  });
  const templates = useQuery({
    queryKey: ["checklist-templates"],
    queryFn: () => api.listChecklistTemplates(),
    enabled: isReviewer,
  });

  const create = useMutation({
    mutationFn: () => api.createInspection(projectId!, { phaseId, templateId }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["inspections", projectId] });
      navigate(`/projects/${projectId}/inspections/${created.id}`);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  if (inspections.isLoading) return <div className="page-loading">{t("inspections.loading")}</div>;
  if (!inspections.data) return <div className="page-error">{t("inspections.error")}</div>;

  return (
    <div className="wrap">
      <CachedNotice show={inspections.isError} />
      <h1>{t("inspections.title")}</h1>
      <p className="sub">{t("inspections.subtitle")}</p>

      {isReviewer && (
        <section className="section">
          <h2>{t("inspections.startTitle")}</h2>
          <form className="card start-form" onSubmit={onSubmit}>
            <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} aria-label={t("inspections.phase")}>
              <option value="">{t("inspections.choosePhase")}</option>
              {dashboard.data?.phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              aria-label={t("inspections.template")}
            >
              <option value="">{t("inspections.chooseTemplate")}</option>
              {templates.data?.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {t("inspections.stage")} {tpl.stageNo} · {tpl.title}
                  {tpl.isSystem ? "" : ` (${t("inspections.mine")})`}
                </option>
              ))}
            </select>
            <button className="primary" type="submit" disabled={!phaseId || !templateId || create.isPending}>
              {create.isPending ? t("inspections.starting") : t("inspections.start")}
            </button>
            {create.isError && <p className="form-error">{t("inspections.startFailed")}</p>}
          </form>
        </section>
      )}

      <section className="section">
        {inspections.data.length === 0 ? (
          <p className="sub">{t("inspections.empty")}</p>
        ) : (
          <ul className="project-list">
            {inspections.data.map((i) => (
              <li key={i.id}>
                <Link to={`/projects/${projectId}/inspections/${i.id}`}>
                  <strong>
                    {t("inspections.stage")} {i.stageNo} · {i.title}
                  </strong>
                  <span>
                    {i.phaseName} · {t(`inspections.status.${i.status}` as MessageKey)} · {t("inspections.answered")}{" "}
                    {i.answeredCount}/{i.itemCount} · {t("inspections.startedAt")}
                    {formatDate(i.startedAt)}
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
