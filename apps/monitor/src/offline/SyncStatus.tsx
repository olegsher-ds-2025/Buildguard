import { useState } from "react";
import { t } from "../i18n/he";
import { useOffline } from "./OfflineProvider";

/** Connection and sync state, below the top bar: a strip when offline or when something failed, and a list of queued work. */
export function SyncStatus() {
  const { online, syncing, ops, pendingCount, failedCount, authNeeded, syncNow, retry, discard } = useOffline();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (online && ops.length === 0 && !authNeeded) return null;

  return (
    <div className="sync-status" role="status">
      <div className={`sync-strip${online ? "" : " offline"}${failedCount > 0 ? " has-failed" : ""}`}>
        <span>{online ? (syncing ? t("offline.syncing") : authNeeded ? t("offline.authNeeded") : "") : t("offline.offline")}</span>
        {ops.length > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {pendingCount > 0 && `${pendingCount} ${t("offline.pending")}`}
            {pendingCount > 0 && failedCount > 0 && " · "}
            {failedCount > 0 && `${failedCount} ${t("offline.failed")}`}
          </button>
        )}
      </div>

      {open && ops.length > 0 && (
        <div className="card sync-panel">
          <div className="sync-panel-head">
            <h2>{t("offline.title")}</h2>
            <button type="button" onClick={() => setOpen(false)}>
              {t("offline.close")}
            </button>
          </div>
          {ops.map((op) => (
            <div className="sync-op" key={op.id}>
              <div>
                <strong>{t(`offline.kind.${op.kind}`)}</strong>{" "}
                <span className="muted">{op.status === "failed" ? t("offline.rejected") : t("offline.waiting")}</span>
                {op.error && <div className="form-error">{op.error}</div>}
              </div>
              <div className="sync-op-actions">
                {op.status === "failed" && (
                  <button type="button" onClick={() => void retry(op.id)}>
                    {t("offline.retry")}
                  </button>
                )}
                {confirming === op.id ? (
                  <button type="button" className="danger" onClick={() => void discard(op.id).then(() => setConfirming(null))}>
                    {t("offline.discardConfirm")}
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirming(op.id)}>
                    {t("offline.discard")}
                  </button>
                )}
              </div>
            </div>
          ))}
          {online && pendingCount > 0 && (
            <button type="button" className="primary" onClick={() => void syncNow()} disabled={syncing}>
              {t("offline.syncNow")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
