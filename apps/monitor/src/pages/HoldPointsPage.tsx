import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { HoldPointSignerCapacity, HoldPointSummary } from "@buildguard/shared-types";
import { api } from "../api";
import { formatDate } from "../format";
import { openHoldPointTexts } from "../holdPointErrors";
import { t, type MessageKey } from "../i18n/he";
import { PhotoCapture } from "../photos/PhotoCapture";
import { useMyProjectRole } from "../useMyProjectRole";
import { CachedNotice } from "../offline/CachedNotice";

const CAPACITIES: HoldPointSignerCapacity[] = ["engineer", "soil_consultant", "inspector", "lab", "other"];
const MIN_NAME = 2;
const MIN_REASON = 10;

function useInvalidateHoldPoints(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ["hold-points", "dashboard", "photos"].map((key) => queryClient.invalidateQueries({ queryKey: [key, projectId] })),
    );
}

function Attachment({ projectId, holdPoint }: { projectId: string; holdPoint: HoldPointSummary }) {
  const photos = useQuery({
    queryKey: ["photos", projectId, { holdPoints: true }],
    queryFn: () => api.listPhotos(projectId),
    enabled: !!holdPoint.photoId,
  });
  const photo = photos.data?.find((p) => p.id === holdPoint.photoId);
  return (
    <>
      {holdPoint.photoId &&
        (photo ? (
          <a href={photo.url} target="_blank" rel="noreferrer">
            {t("holdPoints.photoAttached")}
          </a>
        ) : (
          <span>{t("holdPoints.photoAttached")}</span>
        ))}
      {holdPoint.documentId && <span>{t("holdPoints.documentAttached")}</span>}
    </>
  );
}

function SignForm({ projectId, holdPoint, onClose }: { projectId: string; holdPoint: HoldPointSummary; onClose: () => void }) {
  const invalidate = useInvalidateHoldPoints(projectId);
  const [signerName, setSignerName] = useState("");
  const [signerCapacity, setSignerCapacity] = useState<HoldPointSignerCapacity>("engineer");
  const [mode, setMode] = useState<"photo" | "document">("photo");
  const [capturing, setCapturing] = useState(false);
  const [photoId, setPhotoId] = useState("");
  const [documentId, setDocumentId] = useState("");

  const documents = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => api.listDocuments(projectId),
    enabled: mode === "document",
  });

  const sign = useMutation({
    mutationFn: () =>
      api.signHoldPoint(projectId, holdPoint.id, {
        signerName: signerName.trim(),
        signerCapacity,
        ...(mode === "photo" ? { photoId } : { documentId }),
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const attached = mode === "photo" ? !!photoId : !!documentId;
  const valid = signerName.trim().length >= MIN_NAME && attached;

  function submit(e: FormEvent) {
    e.preventDefault();
    sign.mutate();
  }

  return (
    <form className="hp-form" onSubmit={submit}>
      <label className="editor-field">
        {t("holdPoints.signerName")}
        <input type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("holdPoints.signerCapacity")}
        <select value={signerCapacity} onChange={(e) => setSignerCapacity(e.target.value as HoldPointSignerCapacity)}>
          {CAPACITIES.map((c) => (
            <option key={c} value={c}>
              {t(`holdPoints.capacity.${c}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <div className="group-title">{t("holdPoints.attachment")}</div>
      <div className="editor-actions">
        <button type="button" className={mode === "photo" ? "primary" : ""} onClick={() => setMode("photo")}>
          {t("holdPoints.attachPhoto")}
        </button>
        <button type="button" className={mode === "document" ? "primary" : ""} onClick={() => setMode("document")}>
          {t("holdPoints.attachDocument")}
        </button>
      </div>
      {mode === "photo" &&
        (photoId ? (
          <p className="hint">✓ {t("holdPoints.photoChosen")}</p>
        ) : capturing ? (
          <PhotoCapture
            projectId={projectId}
            links={{ phaseId: holdPoint.phaseId }}
            allowedTags={["approval"]}
            defaultTag="approval"
            onDone={(photo) => {
              if (photo) setPhotoId(photo.id);
              setCapturing(false);
            }}
            onCancel={() => setCapturing(false)}
          />
        ) : (
          <button type="button" onClick={() => setCapturing(true)}>
            {t("holdPoints.attachPhoto")}
          </button>
        ))}
      {mode === "document" && (
        <select aria-label={t("holdPoints.documentSelect")} value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
          <option value="">{t("holdPoints.documentSelect")}</option>
          {documents.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      )}
      {sign.isError && <p className="form-error">{t("holdPoints.actionFailed")}</p>}
      <div className="editor-actions">
        <button type="submit" className="primary" disabled={!valid || sign.isPending}>
          {t("holdPoints.confirmSign")}
        </button>
        <button type="button" onClick={onClose} disabled={sign.isPending}>
          {t("holdPoints.cancel")}
        </button>
      </div>
    </form>
  );
}

function BypassForm({ projectId, holdPoint, onClose }: { projectId: string; holdPoint: HoldPointSummary; onClose: () => void }) {
  const invalidate = useInvalidateHoldPoints(projectId);
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const length = reason.trim().length;

  const bypass = useMutation({
    mutationFn: () => api.bypassHoldPoint(projectId, holdPoint.id, { reason: reason.trim() }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  return (
    <div className="hp-form">
      <p className="hint">{t("holdPoints.bypassWarning")}</p>
      <label className="editor-field">
        {t("holdPoints.bypassReason")}
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setArmed(false);
          }}
        />
      </label>
      <p className="hint">
        {length}/{MIN_REASON}
      </p>
      {bypass.isError && <p className="form-error">{t("holdPoints.actionFailed")}</p>}
      <div className="editor-actions">
        <button
          type="button"
          className={`danger-btn${armed ? " armed" : ""}`}
          disabled={length < MIN_REASON || bypass.isPending}
          onClick={() => (armed ? bypass.mutate() : setArmed(true))}
        >
          {armed ? t("holdPoints.bypassConfirm") : t("holdPoints.bypassContinue")}
        </button>
        <button type="button" onClick={onClose} disabled={bypass.isPending}>
          {t("holdPoints.cancel")}
        </button>
      </div>
    </div>
  );
}

function HoldPointCard({ projectId, holdPoint }: { projectId: string; holdPoint: HoldPointSummary }) {
  const { role, isReviewer } = useMyProjectRole(projectId);
  const invalidate = useInvalidateHoldPoints(projectId);
  const [form, setForm] = useState<"sign" | "bypass" | null>(null);

  const reopen = useMutation({
    mutationFn: () => api.reopenHoldPoint(projectId, holdPoint.id),
    onSuccess: invalidate,
  });

  const isOpen = holdPoint.state === "open";

  return (
    <div className="card hp-card">
      <div className="hp-head">
        <div>
          <div className="hp-text">🛑 {holdPoint.text}</div>
          {holdPoint.subStage && <div className="item-meta">{holdPoint.subStage}</div>}
        </div>
        <span className={`hp-chip ${holdPoint.state}`}>{t(`holdPoints.state.${holdPoint.state}` as MessageKey)}</span>
      </div>
      {!isOpen && (
        <div className="item-meta">
          <span>
            {t(holdPoint.state === "bypassed" ? "holdPoints.bypassedBy" : "holdPoints.signedBy")} {holdPoint.signerName}
            {holdPoint.signerCapacity && ` (${t(`holdPoints.capacity.${holdPoint.signerCapacity}` as MessageKey)})`}
          </span>
          {holdPoint.closedAt && <span>{formatDate(holdPoint.closedAt)}</span>}
          <Attachment projectId={projectId} holdPoint={holdPoint} />
          {holdPoint.reason && (
            <span>
              {t("holdPoints.reason")}: {holdPoint.reason}
            </span>
          )}
        </div>
      )}
      {isReviewer && form === null && (
        <div className="editor-actions">
          {isOpen ? (
            <>
              <button type="button" className="primary" onClick={() => setForm("sign")}>
                {t("holdPoints.sign")}
              </button>
              {role === "owner" && (
                <button type="button" className="danger-btn" onClick={() => setForm("bypass")}>
                  {t("holdPoints.bypass")}
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => reopen.mutate()} disabled={reopen.isPending}>
              {t("holdPoints.reopen")}
            </button>
          )}
        </div>
      )}
      {form === "sign" && <SignForm projectId={projectId} holdPoint={holdPoint} onClose={() => setForm(null)} />}
      {form === "bypass" && <BypassForm projectId={projectId} holdPoint={holdPoint} onClose={() => setForm(null)} />}
      {reopen.isError && <p className="form-error">{t("holdPoints.actionFailed")}</p>}
    </div>
  );
}

function PhaseControls({
  projectId,
  phaseId,
  verified,
  openCount,
}: {
  projectId: string;
  phaseId: string;
  verified: boolean;
  openCount: number;
}) {
  const { isReviewer } = useMyProjectRole(projectId);
  const invalidate = useInvalidateHoldPoints(projectId);
  const [templateId, setTemplateId] = useState("");

  const templates = useQuery({
    queryKey: ["checklist-templates"],
    queryFn: () => api.listChecklistTemplates(),
    enabled: isReviewer,
  });

  const approve = useMutation({ mutationFn: () => api.approvePhase(projectId, phaseId), onSuccess: invalidate });
  const instantiate = useMutation({
    mutationFn: () => api.instantiateHoldPoints(projectId, phaseId, { templateId }),
    onSuccess: async () => {
      setTemplateId("");
      await invalidate();
    },
  });

  const blockedBy = openHoldPointTexts(approve.error);

  if (!isReviewer) return verified ? <span className="hp-chip signed">✓ {t("holdPoints.phaseApproved")}</span> : null;

  return (
    <div className="hp-phase-controls">
      {verified ? (
        <span className="hp-chip signed">✓ {t("holdPoints.phaseApproved")}</span>
      ) : (
        <>
          <button type="button" className="primary" disabled={openCount > 0 || approve.isPending} onClick={() => approve.mutate()}>
            {t("holdPoints.approvePhase")}
          </button>
          {openCount > 0 && <p className="hint">{t("holdPoints.approveBlockedHint")}</p>}
        </>
      )}
      {approve.isError && (
        <p className="form-error">
          {blockedBy.length > 0 ? `${t("holdPoints.approveBlocked")} ${blockedBy.join(", ")}` : t("holdPoints.actionFailed")}
        </p>
      )}
      <div className="start-form">
        <select aria-label={t("holdPoints.addFromTemplate")} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">{t("holdPoints.addFromTemplate")}</option>
          {templates.data?.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {t("holdPoints.templateOption")} {tpl.stageNo} · {tpl.title}
            </option>
          ))}
        </select>
        <button type="button" disabled={!templateId || instantiate.isPending} onClick={() => instantiate.mutate()}>
          {t("holdPoints.addTemplate")}
        </button>
        {instantiate.isError && <p className="form-error">{t("holdPoints.actionFailed")}</p>}
      </div>
    </div>
  );
}

export function HoldPointsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isReviewer } = useMyProjectRole(projectId);

  const holdPoints = useQuery({
    queryKey: ["hold-points", projectId],
    queryFn: () => api.listHoldPoints(projectId!),
    enabled: !!projectId,
  });
  const dashboard = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => api.getProjectDashboard(projectId!),
    enabled: !!projectId,
  });

  if (holdPoints.isLoading) return <div className="page-loading">{t("holdPoints.loading")}</div>;
  if (!holdPoints.data) return <div className="page-error">{t("holdPoints.error")}</div>;

  const phases = dashboard.data?.phases ?? [];
  const byPhase = new Map<string, HoldPointSummary[]>();
  for (const h of holdPoints.data) byPhase.set(h.phaseId, [...(byPhase.get(h.phaseId) ?? []), h]);
  const shownPhases = phases.filter((p) => byPhase.has(p.id) || isReviewer);

  return (
    <div className="wrap">
      <CachedNotice show={holdPoints.isError} />
      <h1>{t("holdPoints.title")}</h1>
      <p className="sub">{t("holdPoints.subtitle")}</p>
      {holdPoints.data.length === 0 && <p className="sub">{t("holdPoints.empty")}</p>}
      {shownPhases.map((phase) => {
        const items = byPhase.get(phase.id) ?? [];
        const openCount = items.filter((h) => h.state === "open").length;
        return (
          <section className="section" key={phase.id}>
            <div className="hp-phase-head">
              <h2>{phase.name}</h2>
              {openCount > 0 && (
                <span className="hp-chip open">
                  {openCount} {t("holdPoints.openCount")}
                </span>
              )}
            </div>
            <div className="grid">
              {items.map((h) => (
                <HoldPointCard key={h.id} projectId={projectId!} holdPoint={h} />
              ))}
            </div>
            <PhaseControls projectId={projectId!} phaseId={phase.id} verified={phase.status === "verified"} openCount={openCount} />
          </section>
        );
      })}
    </div>
  );
}
