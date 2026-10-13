import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatAmount } from "../format";
import { invitationStatusLabel, t, tenderStatusLabel, type MessageKey } from "../i18n/he";

const bidStatusKeys: Record<string, MessageKey> = {
  submitted: "bids.status.submitted",
  withdrawn: "bids.status.withdrawn",
  accepted: "bids.status.accepted",
  rejected: "bids.status.rejected",
};
const bidStatusLabel = (v: string) => (bidStatusKeys[v] ? t(bidStatusKeys[v]) : v);

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
          ? t("tenderDetail.submitError")
          : t("tenderDetail.unreachable"),
      );
    },
  });

  function onSubmitBid(e: FormEvent) {
    e.preventDefault();
    submitBid.mutate();
  }

  if (detail.isLoading) return <div className="page-loading">{t("tenderDetail.loading")}</div>;
  if (detail.isError || !detail.data) return <div className="page-error">{t("tenderDetail.loadError")}</div>;

  const { tender, invitations, myBid } = detail.data;

  return (
    <div className="wrap">
      <h1>{tender.title}</h1>
      <p className="sub">
        {tender.workCategory.name} · {tenderStatusLabel(tender.status)} · {t("tenderDetail.budget")}{" "}
        {formatAmount(tender.budgetMinMinor)}–{formatAmount(tender.budgetMaxMinor)}{" "}
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
                {publish.isPending ? t("tenderDetail.publishing") : t("tenderDetail.publish")}
              </button>
            )}
            {(tender.status === "draft" || tender.status === "invited_bidding") && (
              <button onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                {t("tenderDetail.cancel")}
              </button>
            )}
            {tender.status === "invited_bidding" && (
              <Link to={`/projects/${projectId}/tenders/${tenderId}/bids`}>{t("tenderDetail.compareBids")}</Link>
            )}
          </div>
        </section>
      )}

      {canManageTenders && invitations.length > 0 && (
        <section className="section">
          <h2>{t("tenderDetail.invited")}</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{t("tenderDetail.col.company")}</th>
                  <th>{t("tenderDetail.col.matchScore")}</th>
                  <th>{t("tenderDetail.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.contractorProfileId}>
                    <td>{inv.companyName}</td>
                    <td>{(inv.matchScore * 100).toFixed(0)}%</td>
                    <td>{invitationStatusLabel(inv.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isContractor && (
        <section className="section">
          <h2>{t("tenderDetail.yourBid")}</h2>
          {myBid ? (
            <div className="card">
              <p>
                {formatAmount(myBid.totalAmountMinor)} {myBid.currency} — {bidStatusLabel(myBid.status)}
              </p>
              <p className="hint">{myBid.paymentTermsDescription}</p>
            </div>
          ) : tender.status === "invited_bidding" ? (
            <div className="card upload-card">
              <form onSubmit={onSubmitBid} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                <input
                  type="number"
                  placeholder={t("tenderDetail.bidAmount")}
                  value={totalAmountMinor ? Number(totalAmountMinor) / 100 : ""}
                  onChange={(e) => setTotalAmountMinor(String(Math.round(Number(e.target.value) * 100)))}
                  required
                  style={{ width: "10rem" }}
                />
                <input
                  type="text"
                  placeholder={t("tenderDetail.paymentTerms")}
                  value={paymentTermsDescription}
                  onChange={(e) => setPaymentTermsDescription(e.target.value)}
                  required
                  style={{ flex: 1, minWidth: "12rem" }}
                />
                <button type="submit" className="primary" disabled={submitBid.isPending}>
                  {submitBid.isPending ? t("tenderDetail.submitting") : t("tenderDetail.submitBid")}
                </button>
              </form>
              {error && <p className="form-error">{error}</p>}
            </div>
          ) : (
            <p className="hint">{t("tenderDetail.notOpen")}</p>
          )}
        </section>
      )}

      {tender.status === "awarded" && (
        <p className="hint">
          {t("tenderDetail.awardedPrefix")}
          <button onClick={() => navigate(`/projects/${projectId}/tenders/${tenderId}/bids`)}>{t("tenderDetail.comparisonPage")}</button>.
        </p>
      )}
    </div>
  );
}
