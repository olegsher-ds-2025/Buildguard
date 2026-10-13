import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { FORM4_REQUIREMENTS } from "@buildguard/shared-types";
import type { Form4ItemSummary } from "@buildguard/shared-types";
import { api } from "../api";
import { useDownload } from "../downloadBlob";
import { formatDate, formatPercent } from "../format";
import { t, type MessageKey } from "../i18n/he";
import { useMyProjectRole } from "../useMyProjectRole";

const BLOCKERS: { key: "openHoldPoints" | "unapprovedPhases" | "failedConcreteResults"; link?: string }[] = [
  { key: "openHoldPoints", link: "hold-points" },
  { key: "unapprovedPhases" },
  { key: "failedConcreteResults", link: "lab-tests" },
];

function RequirementCard({ projectId, requirement, item }: { projectId: string; requirement: { key: string; titleHe: string }; item?: Form4ItemSummary }) {
  const queryClient = useQueryClient();
  const { isReviewer } = useMyProjectRole(projectId);
  const [documentId, setDocumentId] = useState(item?.documentId ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const satisfied = item?.satisfied ?? false;

  const documents = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api.listDocuments(projectId),
    enabled: isReviewer,
  });

  const save = useMutation({
    mutationFn: (value: boolean) =>
      api.saveForm4Item(projectId, requirement.key, {
        satisfied: value,
        ...(value && { documentId }),
        ...(note.trim() && { note: note.trim() }),
      }),
    onSuccess: (readiness) => queryClient.setQueryData(["form4", projectId], readiness),
  });

  return (
    <div className="card hp-card">
      <div className="hp-head">
        <div className="hp-text">{requirement.titleHe}</div>
        <span className={`hp-chip ${satisfied ? "signed" : "open"}`}>
          {satisfied ? "✓ " : ""}
          {t(satisfied ? "form4.state.satisfied" : "form4.state.pending")}
        </span>
      </div>
      {satisfied && (
        <div className="item-meta">
          {item?.documentTitle && <span>📄 {item.documentTitle}</span>}
          {item?.satisfiedAt && (
            <span>
              {t("form4.satisfiedAt")}
              {formatDate(item.satisfiedAt)}
            </span>
          )}
        </div>
      )}
      {!isReviewer && item?.note && <div className="item-meta">{item.note}</div>}
      {isReviewer && (
        <div className="hp-form">
          <select aria-label={t("form4.document")} value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
            <option value="">{t("form4.documentSelect")}</option>
            {documents.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <input type="text" aria-label={t("form4.note")} placeholder={t("form4.note")} value={note} onChange={(e) => setNote(e.target.value)} />
          {save.isError && <p className="form-error">{t("form4.saveFailed")}</p>}
          <div className="editor-actions">
            <button type="button" className="primary" disabled={!documentId || save.isPending} onClick={() => save.mutate(true)}>
              {t("form4.markSatisfied")}
            </button>
            {satisfied && (
              <button type="button" disabled={save.isPending} onClick={() => save.mutate(false)}>
                {t("form4.unmark")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExportButton({ projectId }: { projectId: string }) {
  const zip = useDownload(() => api.downloadBuildingFile(projectId), "building-file.zip");
  return (
    <div className="card export-card">
      <button type="button" className="primary" disabled={zip.pending} onClick={zip.start}>
        {zip.pending ? t("form4.exporting") : t("form4.export")}
      </button>
      <p className="hint">{t("form4.exportHint")}</p>
      {zip.failed && <p className="form-error">{t("reports.downloadFailed")}</p>}
    </div>
  );
}

export function Form4Page() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isReviewer } = useMyProjectRole(projectId);

  const form4 = useQuery({
    queryKey: ["form4", projectId],
    queryFn: () => api.getForm4(projectId!),
    enabled: !!projectId,
  });

  if (form4.isLoading) return <div className="page-loading">{t("form4.loading")}</div>;
  if (form4.isError || !form4.data) return <div className="page-error">{t("form4.error")}</div>;

  const readiness = form4.data;
  const itemsByKey = new Map(readiness.items.map((i) => [i.key, i]));
  const activeBlockers = BLOCKERS.filter((b) => readiness.blockers[b.key] > 0);

  return (
    <div className="wrap">
      <h1>{t("form4.title")}</h1>
      <p className="sub">{t("form4.subtitle")}</p>

      <div className="card progress-head">
        <div>
          {readiness.satisfiedCount} {t("form4.progress")} {readiness.totalCount} · {formatPercent(readiness.readinessPct)}
        </div>
        <div className="bar">
          <i className={readiness.readinessPct >= 100 ? "ok" : ""} style={{ width: `${readiness.readinessPct}%` }} />
        </div>
      </div>

      <section className="section">
        <h2>{t("form4.blockers")}</h2>
        {activeBlockers.length === 0 ? (
          <p className="hp-chip signed">✓ {t("form4.noBlockers")}</p>
        ) : (
          activeBlockers.map((b) => (
            <div className="alert warning" key={b.key}>
              <div>
                {readiness.blockers[b.key]} {t(`form4.blocker.${b.key}` as MessageKey)}
                {b.link && (
                  <>
                    {" · "}
                    <Link to={`/projects/${projectId}/${b.link}`}>{t(b.link === "hold-points" ? "nav.holdPoints" : "nav.labTests")}</Link>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="section">
        <div className="grid">
          {FORM4_REQUIREMENTS.map((req) => (
            <RequirementCard key={req.key} projectId={projectId!} requirement={req} item={itemsByKey.get(req.key)} />
          ))}
        </div>
      </section>

      {isReviewer && <ExportButton projectId={projectId!} />}
    </div>
  );
}
