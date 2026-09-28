import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import { api } from "../api";

export function ContractPage() {
  const { projectId, contractId } = useParams<{ projectId: string; contractId: string }>();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);

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
          ? "You've already reviewed this contract."
          : "Could not submit the review.",
      );
    },
  });

  if (contract.isLoading) return <div className="page-loading">Loading contract…</div>;
  if (contract.isError || !contract.data) return <div className="page-error">Could not load this contract.</div>;

  const c = contract.data;
  const existingReview = reviews.data?.find((r) => r.contractId === contractId);

  return (
    <div className="wrap">
      <h1>Contract with {c.companyName}</h1>
      <p className="sub">
        {(Number(c.totalAmountMinor) / 100).toLocaleString()} {c.currency} · {c.status}
        {c.signedAt ? ` · signed ${new Date(c.signedAt).toLocaleDateString()}` : ""}
      </p>

      {c.status === "draft" && (
        <section className="section">
          <div className="card">
            <button className="primary" onClick={() => sign.mutate()} disabled={sign.isPending}>
              {sign.isPending ? "Signing…" : "Sign contract"}
            </button>
          </div>
        </section>
      )}

      <section className="section">
        <h2>Payment milestones</h2>
        <p className="hint">
          Structure only — funds do not move automatically yet (see the Marketplace/Payments roadmap phase).
        </p>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {c.paymentMilestones.map((m) => (
                <tr key={m.id}>
                  <td>{m.sequenceNo}</td>
                  <td>{m.description}</td>
                  <td>
                    {(Number(m.amountMinor) / 100).toLocaleString()} {m.currency}
                  </td>
                  <td>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {c.status !== "draft" && (
        <section className="section">
          <h2>Review</h2>
          {existingReview ? (
            <div className="card">
              <p>
                {existingReview.rating}/5 — {existingReview.status}
                {existingReview.disputeStatus ? ` · dispute ${existingReview.disputeStatus}` : ""}
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
                      {n} star{n === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Comment (optional)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  style={{ flex: 1, minWidth: "12rem" }}
                />
                <button type="submit" className="primary" disabled={submitReview.isPending}>
                  {submitReview.isPending ? "Submitting…" : "Leave a review"}
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
