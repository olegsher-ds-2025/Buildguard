import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

function TrustScoreBadge({ contractorProfileId }: { contractorProfileId: string }) {
  const score = useQuery({
    queryKey: ["trust-score", contractorProfileId],
    queryFn: () => api.getTrustScore(contractorProfileId),
  });
  if (score.isLoading) return <span className="hint">…</span>;
  if (score.isError || !score.data) return <span className="hint">—</span>;
  return (
    <span title={`Based on ${score.data.sampleSize} contract(s), confidence ${(score.data.confidence * 100).toFixed(0)}%`}>
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

  if (bids.isLoading) return <div className="page-loading">Loading bids…</div>;
  if (bids.isError) return <div className="page-error">Could not load bids.</div>;

  return (
    <div className="wrap">
      <h1>Compare bids</h1>
      <p className="sub">Current bid per contractor (a revised bid replaces an earlier one).</p>

      <section className="section">
        {bids.data?.length === 0 ? (
          <p className="hint">No bids submitted yet.</p>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Contractor</th>
                  <th>Trust score</th>
                  <th>Amount</th>
                  <th>Schedule</th>
                  <th>Payment terms</th>
                  <th>Status</th>
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
                      {(Number(b.totalAmountMinor) / 100).toLocaleString()} {b.currency}
                    </td>
                    <td>
                      {b.proposedStartDate ? new Date(b.proposedStartDate).toLocaleDateString() : "—"} –{" "}
                      {b.proposedEndDate ? new Date(b.proposedEndDate).toLocaleDateString() : "—"}
                    </td>
                    <td>{b.paymentTermsDescription}</td>
                    <td>{b.status}</td>
                    <td>
                      {b.status === "submitted" && (
                        <button
                          className="primary"
                          onClick={() => selectWinner.mutate(b.id)}
                          disabled={selectWinner.isPending}
                        >
                          Select winner
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
