import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import type { InspectionDetail, InspectionItemState, InspectionOutcome, RecordInspectionResultRequest } from "@buildguard/shared-types";
import { api } from "../api";
import { useDownload } from "../downloadBlob";
import { formatDate } from "../format";
import { t } from "../i18n/he";
import { CachedNotice } from "../offline/CachedNotice";
import { isNetworkError, useOffline, usePendingForInspection } from "../offline/OfflineProvider";
import { PhotoCapture } from "../photos/PhotoCapture";
import { PhotoStrip } from "../photos/PhotoStrip";
import { usePhotos } from "../photos/usePhotos";
import { useMyProjectRole } from "../useMyProjectRole";

interface Group {
  subStage: string | null;
  section: string | null;
  items: InspectionItemState[];
}

function groupItems(items: InspectionItemState[]): Group[] {
  const groups: Group[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.subStage === item.subStage && last.section === item.section) last.items.push(item);
    else groups.push({ subStage: item.subStage, section: item.section, items: [item] });
  }
  return groups;
}

const OUTCOMES: { outcome: InspectionOutcome; label: "inspections.ok" | "inspections.fail" | "inspections.na" }[] = [
  { outcome: "ok", label: "inspections.ok" },
  { outcome: "fail", label: "inspections.fail" },
  { outcome: "na", label: "inspections.na" },
];

interface ItemProps {
  item: InspectionItemState;
  projectId: string;
  inspectionId: string;
  phaseId: string;
  editable: boolean;
  pendingResult: RecordInspectionResultRequest | undefined;
  pendingBeforeCover: number;
}

function ItemCard({ item, projectId, inspectionId, phaseId, editable, pendingResult, pendingBeforeCover }: ItemProps) {
  const queryClient = useQueryClient();
  const { queueResult } = useOffline();
  const [value, setValue] = useState(item.numericValue === null ? "" : String(item.numericValue));
  const [severity, setSeverity] = useState(3);
  const [note, setNote] = useState(item.note ?? "");
  const [failing, setFailing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const photoFilter = { inspectionId, checklistItemId: item.id };
  const photoCount = usePhotos(projectId, photoFilter).data?.length ?? 0;
  const queryKey = ["inspection", projectId, inspectionId];

  const save = useMutation({
    mutationFn: async (outcome: InspectionOutcome) => {
      const numeric = value.trim() === "" ? NaN : Number(value.replace(",", "."));
      const body: RecordInspectionResultRequest = {
        checklistItemId: item.id,
        outcome,
        ...(Number.isFinite(numeric) && { numericValue: numeric }),
        ...(outcome === "fail" && { severity, ...(note.trim() && { note: note.trim() }) }),
      };
      if (!navigator.onLine) {
        await queueResult(projectId, inspectionId, body);
        return undefined;
      }
      try {
        return await api.recordInspectionResult(projectId, inspectionId, body);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueResult(projectId, inspectionId, body);
        return undefined;
      }
    },
    onSuccess: (saved) => {
      setFailing(false);
      if (!saved) return;
      queryClient.setQueryData<InspectionDetail>(queryKey, (prev) =>
        prev && { ...prev, items: prev.items.map((i) => (i.id === saved.id ? saved : i)) },
      );
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const hasNumeric = item.itemType === "measurement" || item.thresholds.length > 0;
  const outcomeNow = pendingResult?.outcome ?? item.outcome;
  const noteNow = pendingResult ? (pendingResult.note ?? null) : item.note;
  const needsBeforeCover = item.requiresBeforeCoverPhoto && item.beforeCoverPhotoCount + pendingBeforeCover === 0;
  const showFailPanel = editable && (failing || outcomeNow === "fail");

  function onPick(outcome: InspectionOutcome) {
    if (outcome === "fail" && outcomeNow !== "fail") setFailing(true);
    else save.mutate(outcome);
  }

  return (
    <div className={`checklist-item inspect-item${item.outOfThreshold ? " breached" : ""}`}>
      <div>
        {item.text}
        {item.mandatory && <span className="req"> *</span>}
        {pendingResult && <span className="pending-badge">{t("offline.pendingBadge")}</span>}
      </div>
      <div className="item-meta">
        {item.standardRef && <span>{item.standardRef}</span>}
        {item.thresholds.map((th, i) => (
          <span className="threshold" key={i} title={item.thresholdsReviewed ? undefined : t("checklists.unreviewedThreshold")}>
            {th.raw}
            {!item.thresholdsReviewed && ` (${t("inspections.unreviewed")})`}
          </span>
        ))}
      </div>

      {hasNumeric && (
        <input
          className="value-input"
          type="text"
          inputMode="decimal"
          dir="ltr"
          placeholder={t("inspections.value")}
          aria-label={t("inspections.value")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!editable}
        />
      )}

      <div className="outcomes">
        {OUTCOMES.map(({ outcome, label }) => (
          <button
            key={outcome}
            className={`outcome ${outcome}${outcomeNow === outcome ? " active" : ""}`}
            onClick={() => onPick(outcome)}
            disabled={!editable || save.isPending || (outcome === "ok" && needsBeforeCover)}
            aria-pressed={outcomeNow === outcome}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {editable && needsBeforeCover && <p className="form-error">{t("photos.beforeCoverRequired")}</p>}

      <div className="item-photos">
        {editable && (
          <button type="button" onClick={() => setCapturing(true)} disabled={capturing}>
            {t("photos.capture")}
          </button>
        )}
        {photoCount > 0 && <span className="photo-count">📷 {photoCount}</span>}
      </div>
      {capturing && (
        <PhotoCapture
          projectId={projectId}
          links={{ inspectionId, checklistItemId: item.id, phaseId }}
          allowedTags={["before_cover", "inspection", "approval", "defect"]}
          defaultTag={item.requiresBeforeCoverPhoto ? "before_cover" : "inspection"}
          onDone={() => setCapturing(false)}
          onCancel={() => setCapturing(false)}
        />
      )}
      <PhotoStrip projectId={projectId} filter={photoFilter} />

      {item.outOfThreshold && <p className="form-error">{t("inspections.outOfThreshold")}</p>}

      {showFailPanel && (
        <div className="fail-panel">
          <label>
            {t("inspections.severity")}
            <select value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <textarea
            rows={2}
            placeholder={t("inspections.note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="primary" onClick={() => save.mutate("fail")} disabled={save.isPending}>
            {t("inspections.sendFail")}
          </button>
        </div>
      )}
      {!showFailPanel && noteNow && <p className="item-meta">{noteNow}</p>}
      {save.isError && <p className="form-error">{t("inspections.saveFailed")}</p>}
    </div>
  );
}

function completeErrorMessage(err: unknown): string {
  if (err instanceof ApiError && typeof err.body === "object" && err.body && "message" in err.body) {
    const match = /^(\d+) mandatory/.exec(String((err.body as { message: unknown }).message));
    if (match) return `${t("inspections.missingMandatory")} (${match[1]})`;
  }
  return t("inspections.completeFailed");
}

export function InspectionPage() {
  const { projectId, inspectionId } = useParams<{ projectId: string; inspectionId: string }>();
  const queryClient = useQueryClient();
  const { role, isReviewer } = useMyProjectRole(projectId);
  const report = useDownload(() => api.downloadInspectionReport(projectId!, inspectionId!), "inspection-report.pdf");
  const queryKey = ["inspection", projectId, inspectionId];
  const { online, ops } = useOffline();
  const pending = usePendingForInspection(inspectionId);
  const hasQueuedOps = ops.some(
    (o) => o.status === "pending" && (o.kind === "photo" ? o.meta.inspectionId : o.inspectionId) === inspectionId,
  );

  const inspection = useQuery({
    queryKey,
    queryFn: () => api.getInspection(projectId!, inspectionId!),
    enabled: !!projectId && !!inspectionId,
  });
  const complete = useMutation({
    mutationFn: () => api.completeInspection(projectId!, inspectionId!),
    onSuccess: (done) => {
      queryClient.setQueryData(queryKey, done);
      void queryClient.invalidateQueries({ queryKey: ["inspections", projectId] });
    },
  });

  if (inspection.isLoading) return <div className="page-loading">{t("inspections.itemLoading")}</div>;
  if (!inspection.data) return <div className="page-error">{t("inspections.itemError")}</div>;

  const insp = inspection.data;
  const open = insp.status === "open";
  const editable = open && isReviewer;
  const groups = groupItems(insp.items);
  const pct = insp.itemCount === 0 ? 0 : (insp.answeredCount / insp.itemCount) * 100;
  let lastSubStage: string | null | undefined;

  return (
    <div className="wrap">
      <CachedNotice show={inspection.isError} />
      <Link to={`/projects/${projectId}/inspections`}>{t("inspections.back")}</Link>
      <h1>
        {t("inspections.stage")} {insp.stageNo} · {insp.title}
      </h1>
      <p className="sub">
        {insp.phaseName} · {t(`inspections.status.${insp.status}`)} · {t("inspections.startedAt")}
        {formatDate(insp.startedAt)}
      </p>
      {role && role !== "contractor" && (
        <div className="editor-actions">
          <button type="button" onClick={report.start} disabled={report.pending}>
            {t("reports.downloadInspection")}
          </button>
          {report.failed && <span className="form-error">{t("reports.downloadFailed")}</span>}
        </div>
      )}

      <div className="card progress-head">
        <div>
          {t("inspections.progress")}: {insp.answeredCount}/{insp.itemCount}
        </div>
        <div className="bar">
          <i className={pct === 100 ? "ok" : ""} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!open && <p className="disclaimer">{t("inspections.completedNote")}</p>}
      {open && !isReviewer && <p className="disclaimer">{t("inspections.readOnly")}</p>}

      <section className="section">
        {groups.map((g, gi) => {
          const showSubStage = g.subStage !== lastSubStage;
          lastSubStage = g.subStage;
          return (
            <Fragment key={gi}>
              {showSubStage && g.subStage && <h2 className="substage">{g.subStage}</h2>}
              <div className="card checklist-group">
                {g.section && <div className="group-title">{g.section}</div>}
                {g.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    projectId={projectId!}
                    inspectionId={inspectionId!}
                    phaseId={insp.phaseId}
                    editable={editable}
                    pendingResult={pending.results.get(item.id)}
                    pendingBeforeCover={pending.beforeCoverPhotos.get(item.id) ?? 0}
                  />
                ))}
              </div>
            </Fragment>
          );
        })}
      </section>

      {insp.holdPoints.length > 0 && (
        <section className="section">
          <h2>🛑 {t("inspections.holdPoints")}</h2>
          {insp.holdPoints.map((h) => (
            <div className="alert warning" key={h.id}>
              <div>
                {h.subStage && <strong>{h.subStage}: </strong>}
                {h.text}
              </div>
            </div>
          ))}
        </section>
      )}

      {editable && (
        <section className="section">
          <button className="primary complete-btn" onClick={() => complete.mutate()} disabled={complete.isPending || !online || hasQueuedOps}>
            {complete.isPending ? t("inspections.completing") : t("inspections.complete")}
          </button>
          {(!online || hasQueuedOps) && <p className="item-meta">{t("offline.completeBlocked")}</p>}
          {complete.isError && <p className="form-error">{completeErrorMessage(complete.error)}</p>}
        </section>
      )}
    </div>
  );
}
