import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import type { DefectAction, DefectStatus, DefectSummary } from "@buildguard/shared-types";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatDate } from "../format";
import { t, type MessageKey } from "../i18n/he";
import { PhotoCapture } from "../photos/PhotoCapture";
import { PhotoStrip } from "../photos/PhotoStrip";
import { usePhotos } from "../photos/usePhotos";
import { useMyProjectRole } from "../useMyProjectRole";
import { CachedNotice } from "../offline/CachedNotice";

const ASSIGNEE_ACTIONS: Partial<Record<DefectStatus, DefectAction>> = { open: "start", in_progress: "fix" };
const REVIEWER_ACTIONS: Partial<Record<DefectStatus, DefectAction>> = { resolved: "verify" };

function sevClass(sev: number) {
  return sev >= 4 ? "high" : sev === 3 ? "med" : "low";
}

function DefectRow({ defect, projectId, isReviewer }: { defect: DefectSummary; projectId: string; isReviewer: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [assigneeId, setAssigneeId] = useState("");
  const [capturing, setCapturing] = useState(false);
  const photoFilter = { defectId: defect.id };
  const photos = usePhotos(projectId, photoFilter);
  const hasAfterPhoto = !!photos.data?.some((p) => p.tag === "after");
  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.listMembers(projectId),
    enabled: isReviewer,
  });

  const done = () => queryClient.invalidateQueries({ queryKey: ["defects", projectId] });
  const act = useMutation({
    mutationFn: (action: DefectAction) => api.actOnDefect(projectId, defect.id, action),
    onSuccess: done,
  });
  const assign = useMutation({
    mutationFn: () => api.assignDefect(projectId, defect.id, { assigneeUserId: assigneeId }),
    onSuccess: () => {
      setAssigneeId("");
      return done();
    },
  });

  const canWork = isReviewer || defect.assignedToUserId === user?.id;
  const actions: DefectAction[] = [];
  const work = ASSIGNEE_ACTIONS[defect.status];
  if (work && canWork) actions.push(work);
  if (isReviewer) {
    const review = REVIEWER_ACTIONS[defect.status];
    if (review) actions.push(review);
    if (defect.status === "resolved") actions.push("reopen");
  }
  const canPhotograph = canWork && defect.status !== "closed";
  const canAssign = isReviewer && (defect.status === "open" || defect.status === "in_progress");

  return (
    <div className="finding">
      <div className="finding-title">
        <span className={`sev ${sevClass(defect.severity)}`}>{defect.severity}</span> {defect.title}
      </div>
      <div className="finding-meta">
        {t(`defects.status.${defect.status}` as MessageKey)} · {t(`defects.source.${defect.source}` as MessageKey)} ·{" "}
        {t("defects.assignee")}: {defect.assigneeName ?? t("defects.unassigned")}
        {defect.dueDate && ` · ${t("defects.due")}: ${formatDate(defect.dueDate)}`}
      </div>
      {(actions.length > 0 || canAssign) && (
        <div className="finding-actions">
          {actions.map((action) => (
            <button
              key={action}
              className={action === "verify" || action === "fix" || action === "start" ? "primary" : ""}
              onClick={() => act.mutate(action)}
              disabled={act.isPending || (action === "fix" && !hasAfterPhoto)}
            >
              {t(`defects.action.${action}` as MessageKey)}
            </button>
          ))}
          {canAssign && (
            <>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                aria-label={t("defects.assignTo")}
              >
                <option value="">{t("defects.assignTo")}</option>
                {members.data?.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              <button onClick={() => assign.mutate()} disabled={!assigneeId || assign.isPending}>
                {t("defects.assign")}
              </button>
            </>
          )}
        </div>
      )}
      {actions.includes("fix") && !hasAfterPhoto && <p className="item-meta">{t("photos.afterRequired")}</p>}
      {canPhotograph && (
        <div className="finding-actions">
          <button type="button" onClick={() => setCapturing(true)} disabled={capturing}>
            {t("photos.afterButton")}
          </button>
        </div>
      )}
      {capturing && (
        <PhotoCapture
          projectId={projectId}
          links={{ defectId: defect.id }}
          allowedTags={isReviewer ? ["after", "defect"] : ["after"]}
          defaultTag="after"
          onDone={() => setCapturing(false)}
          onCancel={() => setCapturing(false)}
        />
      )}
      <PhotoStrip projectId={projectId} filter={photoFilter} />
      {(act.isError || assign.isError) && (
        <p className="form-error">
          {act.variables === "fix" && act.error instanceof ApiError && act.error.status === 400
            ? t("photos.afterRequired")
            : t("defects.actionFailed")}
        </p>
      )}
    </div>
  );
}

export function DefectsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isReviewer } = useMyProjectRole(projectId);
  const defects = useQuery({
    queryKey: ["defects", projectId],
    queryFn: () => api.listDefects(projectId!),
    enabled: !!projectId,
  });

  if (defects.isLoading) return <div className="page-loading">{t("defects.loading")}</div>;
  if (!defects.data) return <div className="page-error">{t("defects.error")}</div>;

  return (
    <div className="wrap">
      <CachedNotice show={defects.isError} />
      <h1>{t("defects.title")}</h1>
      <p className="sub">{t("defects.subtitle")}</p>
      {defects.data.length === 0 ? (
        <p className="sub">{t("defects.empty")}</p>
      ) : (
        <div className="card">
          {defects.data.map((d) => (
            <DefectRow key={d.id} defect={d} projectId={projectId!} isReviewer={isReviewer} />
          ))}
        </div>
      )}
    </div>
  );
}
