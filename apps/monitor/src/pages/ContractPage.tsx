import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import { api } from "../api";
import { formatAmount, formatDate } from "../format";
import { openHoldPointTexts } from "../holdPointErrors";
import { t, type MessageKey } from "../i18n/he";
import { useMyProjectRole } from "../useMyProjectRole";

const statusLabel = (prefix: string, value: string) => t(`${prefix}.${value}` as MessageKey) || value;

export function ContractPage() {
  const { projectId, contractId } = useParams<{ projectId: string; contractId: string }>();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const { role } = useMyProjectRole(projectId);
  const canSeeGate = !!role && role !== "contractor";

  const contract = useQuery({
    queryKey: ["contract", projectId, contractId],
    queryFn: () => api.getContract(projectId!, contractId!),
    enabled: !!projectId && !!contractId,
  });

  const reviews = useQuery({
    queryKey: ["reviews", projectId],
    queryFn: () => api.listProjectReviews(projectId!),
    enabled: !!projectId,
  });

  const holdPoints = useQuery({
    queryKey: ["hold-points", projectId],
    queryFn: () => api.listHoldPoints(projectId!),
    enabled: !!projectId && canSeeGate,
  });

  const dashboard = useQuery({
    queryKey: ["dashboard", projectId],
    queryFn: () => api.getProjectDashboard(projectId!),
    enabled: !!projectId && canSeeGate,
  });

  const release = useMutation({
    mutationFn: (milestoneId: string) => api.releasePaymentMilestone(projectId!, contractId!, milestoneId),
    onSuccess: async () => {
      setReleasingId(null);
      await Promise.all(
        [
          ["contract", projectId, contractId],
          ["hold-points", projectId],
          ["dashboard", projectId],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const sign = useMutation({
    mutationFn: () => api.signContract(projectId!, contractId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contract", projectId, contractId] }),
  });

  const submitReview = useMutation({
    mutationFn: () => api.createReview(projectId!, { contractId: contractId!, rating, comment: comment || undefined }),
    onSuccess: () => {
      setComment("");
      setReviewError(null);
      queryClient.invalidateQueries({ queryKey: ["reviews", projectId] });
    },
    onError: (err) => {
      setReviewError(
        err instanceof ApiError && err.status === 409
          ? t("contract.alreadyReviewed")
          : t("contract.reviewFailed"),
      );
    },
  });

  if (contract.isLoading) return <div className="page-loading">{t("contract.loading")}</div>;
  if (contract.isError || !contract.data) return <div className="page-error">{t("contract.error")}</div>;

  const c = contract.data;
  const releaseBlockedBy = openHoldPointTexts(release.error);

  function gateLabel(phaseId: string | null): string | null {
    if (!phaseId || !holdPoints.data || !dashboard.data) return null;
    const openCount = holdPoints.data.filter((h) => h.phaseId === phaseId && h.state === "open").length;
    if (openCount > 0) return `${openCount} ${t("holdPoints.gate.openHoldPoints")}`;
    const phase = dashboard.data.phases.find((p) => p.id === phaseId);
    return phase?.status === "verified" ? t("holdPoints.gate.ready") : t("holdPoints.gate.awaitingApproval");
  }

  const existingReview = reviews.data?.find((r) => r.contractId === contractId);

  return (
    <div className="wrap">
      <h1>
        {t("contract.titlePrefix")} {c.companyName}
      </h1>
      <p className="sub">
        {formatAmount(c.totalAmountMinor)} {c.currency} · {statusLabel("contract.status", c.status)}
        {c.signedAt ? ` · ${t("contract.signedOn")}${formatDate(c.signedAt)}` : ""}
      </p>

      {c.status === "draft" && (
        <section className="section">
          <div className="card">
            <button className="primary" onClick={() => sign.mutate()} disabled={sign.isPending}>
              {sign.isPending ? t("contract.signing") : t("contract.sign")}
            </button>
          </div>
        </section>
      )}

      <section className="section">
        <h2>{t("contract.milestones")}</h2>
        <p className="hint">
          {t("contract.milestonesHint")}
        </p>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t("contract.description")}</th>
                <th>{t("contract.amount")}</th>
                <th>{t("contract.status")}</th>
              </tr>
            </thead>
            <tbody>
              {c.paymentMilestones.map((m) => (
                <tr key={m.id}>
                  <td>{m.sequenceNo}</td>
                  <td>{m.description}</td>
                  <td>
                    {formatAmount(m.amountMinor)} {m.currency}
                  </td>
                  <td>
                    {statusLabel("contract.milestone", m.status)}
                    {m.status === "pending" && gateLabel(m.phaseId) && (
                      <div className="item-meta">{gateLabel(m.phaseId)}</div>
                    )}
                    {m.status === "pending" && role === "owner" && (
                      <button
                        type="button"
                        className={releasingId === m.id ? "primary" : ""}
                        disabled={release.isPending}
                        onClick={() => (releasingId === m.id ? release.mutate(m.id) : setReleasingId(m.id))}
                      >
                        {releasingId === m.id ? t("holdPoints.releaseConfirm") : t("holdPoints.releasePayment")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {release.isError && (
            <p className="form-error">
              {release.error instanceof ApiError && release.error.status === 409
                ? [t("holdPoints.releaseBlocked"), ...releaseBlockedBy].join(" · ")
                : t("holdPoints.releaseFailed")}
            </p>
          )}
        </div>
      </section>

      {c.status !== "draft" && (
        <section className="section">
          <h2>{t("contract.review")}</h2>
          {existingReview ? (
            <div className="card">
              <p>
                {existingReview.rating}/5 — {statusLabel("contract.review", existingReview.status)}
                {existingReview.disputeStatus
                  ? ` · ${t("contract.dispute")} ${statusLabel("contract.dispute", existingReview.disputeStatus)}`
                  : ""}
              </p>
              {existingReview.comment && <p className="hint">{existingReview.comment}</p>}
            </div>
          ) : (
            <div className="card upload-card">
              <form
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  submitReview.mutate();
                }}
                style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}
              >
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? t("contract.star") : t("contract.stars")}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={t("contract.commentPlaceholder")}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  style={{ flex: 1, minWidth: "12rem" }}
                />
                <button type="submit" className="primary" disabled={submitReview.isPending}>
                  {submitReview.isPending ? t("contract.submitting") : t("contract.leaveReview")}
                </button>
              </form>
              {reviewError && <p className="form-error">{reviewError}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
