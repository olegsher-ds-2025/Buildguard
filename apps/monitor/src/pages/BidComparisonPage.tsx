import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { formatAmount, formatDate } from "../format";
import { t, type MessageKey } from "../i18n/he";

const bidStatusKeys: Record<string, MessageKey> = {
  submitted: "bids.status.submitted",
  withdrawn: "bids.status.withdrawn",
  accepted: "bids.status.accepted",
  rejected: "bids.status.rejected",
};
const bidStatusLabel = (v: string) => (bidStatusKeys[v] ? t(bidStatusKeys[v]) : v);

function TrustScoreBadge({ contractorProfileId }: { contractorProfileId: string }) {
  const score = useQuery({
    queryKey: ["trust-score", contractorProfileId],
    queryFn: () => api.getTrustScore(contractorProfileId),
  });
  if (score.isLoading) return <span className="hint">…</span>;
  if (score.isError || !score.data) return <span className="hint">—</span>;
  return (
    <span title={`${t("bids.trustTooltipBasedOn")} ${score.data.sampleSize} ${t("bids.trustTooltipContracts")} ${(score.data.confidence * 100).toFixed(0)}%`}>
      {score.data.score.toFixed(0)}/100
    </span>
  );
}

export function BidComparisonPage() {
  const { projectId, tenderId } = useParams<{ projectId: string; tenderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const bids = useQuery({
    queryKey: ["bids", projectId, tenderId],
    queryFn: () => api.listBids(projectId!, tenderId!),
    enabled: !!projectId && !!tenderId,
  });

  const selectWinner = useMutation({
    mutationFn: (bidId: string) => api.selectWinner(projectId!, tenderId!, { bidId }),
    onSuccess: (contract) => {
      queryClient.invalidateQueries({ queryKey: ["tender", projectId, tenderId] });
      navigate(`/projects/${projectId}/contracts/${contract.id}`);
    },
  });

  if (bids.isLoading) return <div className="page-loading">{t("bids.loading")}</div>;
  if (bids.isError) return <div className="page-error">{t("bids.loadError")}</div>;

  return (
    <div className="wrap">
      <h1>{t("bids.title")}</h1>
      <p className="sub">{t("bids.subtitle")}</p>

      <section className="section">
        {bids.data?.length === 0 ? (
          <p className="hint">{t("bids.empty")}</p>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>{t("bids.col.contractor")}</th>
                  <th>{t("bids.col.trustScore")}</th>
                  <th>{t("bids.col.amount")}</th>
                  <th>{t("bids.col.schedule")}</th>
                  <th>{t("bids.col.paymentTerms")}</th>
                  <th>{t("bids.col.status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bids.data?.map((b) => (
                  <tr key={b.id}>
                    <td>{b.companyName}</td>
                    <td>
                      <TrustScoreBadge contractorProfileId={b.contractorProfileId} />
                    </td>
                    <td>
                      {formatAmount(b.totalAmountMinor)} {b.currency}
                    </td>
                    <td>
                      {b.proposedStartDate ? formatDate(b.proposedStartDate) : "—"} –{" "}
                      {b.proposedEndDate ? formatDate(b.proposedEndDate) : "—"}
                    </td>
                    <td>{b.paymentTermsDescription}</td>
                    <td>{bidStatusLabel(b.status)}</td>
                    <td>
                      {b.status === "submitted" && (
                        <button
                          className="primary"
                          onClick={() => selectWinner.mutate(b.id)}
                          disabled={selectWinner.isPending}
                        >
                          {t("bids.selectWinner")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
