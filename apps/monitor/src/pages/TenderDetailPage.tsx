import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import { api } from "../api";
import { useAuth } from "../auth";

export function TenderDetailPage() {
  const { projectId, tenderId } = useParams<{ projectId: string; tenderId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [totalAmountMinor, setTotalAmountMinor] = useState("");
  const [paymentTermsDescription, setPaymentTermsDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.listMembers(projectId!),
    enabled: !!projectId,
  });
  const myRole = members.data?.find((m) => m.userId === user?.id)?.role;
  const canManageTenders = myRole === "owner" || myRole === "project_manager";
  const isContractor = myRole === "contractor";

  const detail = useQuery({
    queryKey: ["tender", projectId, tenderId],
    queryFn: () => api.getTender(projectId!, tenderId!),
    enabled: !!projectId && !!tenderId,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["tender", projectId, tenderId] });
    queryClient.invalidateQueries({ queryKey: ["tenders", projectId] });
  }

  const publish = useMutation({
    mutationFn: () => api.publishTender(projectId!, tenderId!),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelTender(projectId!, tenderId!),
    onSuccess: invalidate,
  });

  const submitBid = useMutation({
    mutationFn: () =>
      api.submitBid(projectId!, tenderId!, {
        totalAmountMinor,
        currency: detail.data?.tender.currency ?? "ILS",
        paymentTermsDescription,
      }),
    onSuccess: () => {
      setTotalAmountMinor("");
      setPaymentTermsDescription("");
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? "Could not submit your bid (are you invited and verified?)."
          : "Could not reach the server.",
      );
    },
  });

  function onSubmitBid(e: FormEvent) {
    e.preventDefault();
    submitBid.mutate();
  }

  if (detail.isLoading) return <div className="page-loading">Loading tender…</div>;
  if (detail.isError || !detail.data) return <div className="page-error">Could not load this tender.</div>;

  const { tender, invitations, myBid } = detail.data;

  return (
    <div className="wrap">
      <h1>{tender.title}</h1>
      <p className="sub">
        {tender.workCategory.name} · {tender.status.replace("_", " ")} · budget{" "}
        {(Number(tender.budgetMinMinor) / 100).toLocaleString()}–{(Number(tender.budgetMaxMinor) / 100).toLocaleString()}{" "}
        {tender.currency}
      </p>

      <section className="section">
        <div className="card">
          <p>{tender.scopeDescription}</p>
        </div>
      </section>

      {canManageTenders && (
        <section className="section">
          <div className="card" style={{ display: "flex", gap: ".6rem" }}>
            {tender.status === "draft" && (
              <button className="primary" onClick={() => publish.mutate()} disabled={publish.isPending}>
                {publish.isPending ? "Publishing…" : "Publish (invite matched contractors)"}
              </button>
            )}
            {(tender.status === "draft" || tender.status === "invited_bidding") && (
              <button onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Cancel tender
              </button>
            )}
            {tender.status === "invited_bidding" && (
              <Link to={`/projects/${projectId}/tenders/${tenderId}/bids`}>Compare bids →</Link>
            )}
          </div>
        </section>
      )}

      {canManageTenders && invitations.length > 0 && (
        <section className="section">
          <h2>Invited contractors</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Match score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.contractorProfileId}>
                    <td>{inv.companyName}</td>
                    <td>{(inv.matchScore * 100).toFixed(0)}%</td>
                    <td>{inv.status.replace("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isContractor && (
        <section className="section">
          <h2>Your bid</h2>
          {myBid ? (
            <div className="card">
              <p>
                {(Number(myBid.totalAmountMinor) / 100).toLocaleString()} {myBid.currency} — {myBid.status}
              </p>
              <p className="hint">{myBid.paymentTermsDescription}</p>
            </div>
          ) : tender.status === "invited_bidding" ? (
            <div className="card upload-card">
              <form onSubmit={onSubmitBid} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                <input
                  type="number"
                  placeholder="Total bid amount"
                  value={totalAmountMinor ? Number(totalAmountMinor) / 100 : ""}
                  onChange={(e) => setTotalAmountMinor(String(Math.round(Number(e.target.value) * 100)))}
                  required
                  style={{ width: "10rem" }}
                />
                <input
                  type="text"
                  placeholder="Payment terms"
                  value={paymentTermsDescription}
                  onChange={(e) => setPaymentTermsDescription(e.target.value)}
                  required
                  style={{ flex: 1, minWidth: "12rem" }}
                />
                <button type="submit" className="primary" disabled={submitBid.isPending}>
                  {submitBid.isPending ? "Submitting…" : "Submit bid"}
                </button>
              </form>
              {error && <p className="form-error">{error}</p>}
            </div>
          ) : (
            <p className="hint">This tender is not currently open for bids.</p>
          )}
        </section>
      )}

      {tender.status === "awarded" && (
        <p className="hint">
          A winner was selected for this tender. See it from the{" "}
          <button onClick={() => navigate(`/projects/${projectId}/tenders/${tenderId}/bids`)}>bid comparison page</button>.
        </p>
      )}
    </div>
  );
}
