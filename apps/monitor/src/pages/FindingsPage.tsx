import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { FindingSummary } from "@buildguard/shared-types";
import { api } from "../api";
import { formatMoney } from "../format";

function sevClass(sev: number) {
  return sev >= 4 ? "high" : sev === 3 ? "med" : "low";
}

export function FindingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findings = useQuery({
    queryKey: ["findings", projectId],
    queryFn: () => api.listFindings(projectId!),
    enabled: !!projectId,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["findings", projectId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", projectId] });
  }

  const approve = useMutation({
    mutationFn: (detectionId: string) => api.approveFinding(projectId!, detectionId),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (detectionId: string) => api.dismissFinding(projectId!, detectionId),
    onSuccess: invalidate,
  });

  async function onAnalyze() {
    const file = fileInput.current?.files?.[0];
    if (!file || !projectId) return;
    setError(null);
    setAnalyzing(true);
    try {
      const created = await api.createSiteCaptureUpload(projectId, {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });
      const putRes = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`);
      await api.confirmSiteCaptureUpload(projectId, created.siteCaptureId);
      if (fileInput.current) fileInput.current.value = "";
      invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (findings.isLoading) return <div className="page-loading">Loading findings…</div>;
  if (findings.isError) return <div className="page-error">Could not load findings.</div>;

  const open = (findings.data ?? []).filter((f) => f.status === "suggested");
  const resolved = (findings.data ?? []).filter((f) => f.status !== "suggested");

  return (
    <div className="wrap">
      <h1>AI Vision Inspector</h1>
      <p className="sub">
        Findings are <strong>suggested</strong> only — nothing becomes a tracked defect without your approval.
      </p>

      <section className="section">
        <div className="card upload-card">
          <input ref={fileInput} type="file" accept="image/*" />
          {error && <p className="form-error">{error}</p>}
          <button className="primary" onClick={onAnalyze} disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Upload site photo"}
          </button>
        </div>
      </section>

      <section className="section">
        <div className="card">
          {findings.data?.length === 0 ? (
            <p className="hint">No findings yet.</p>
          ) : (
            <>
              {open.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  onApprove={() => approve.mutate(f.id)}
                  onDismiss={() => dismiss.mutate(f.id)}
                  busy={approve.isPending || dismiss.isPending}
                />
              ))}
              {resolved.map((f) => (
                <FindingRow key={f.id} finding={f} />
              ))}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function FindingRow({
  finding,
  onApprove,
  onDismiss,
  busy,
}: {
  finding: FindingSummary;
  onApprove?: () => void;
  onDismiss?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="finding">
      <div className="finding-body">
        <div className="finding-title">{finding.description}</div>
        <div className="finding-meta">
          <span className={`sev ${sevClass(finding.severity)}`}>severity {finding.severity}/5</span>{" "}
          confidence {Math.round(finding.confidence * 100)}%
          {finding.estimatedCostMinMinor && finding.estimatedCostMaxMinor && finding.currency && (
            <>
              {" · est. "}
              {formatMoney(finding.estimatedCostMinMinor, finding.currency)}–
              {formatMoney(finding.estimatedCostMaxMinor, finding.currency)}
            </>
          )}
        </div>
        {finding.status === "suggested" ? (
          <div className="finding-actions">
            <button className="primary" onClick={onApprove} disabled={busy}>
              Approve as defect
            </button>
            <button onClick={onDismiss} disabled={busy}>
              Dismiss
            </button>
          </div>
        ) : (
          <div className={`resolved ${finding.status}`}>
            {finding.status === "approved" ? "✓ Tracked as a defect" : "✕ Dismissed"}
          </div>
        )}
      </div>
    </div>
  );
}
