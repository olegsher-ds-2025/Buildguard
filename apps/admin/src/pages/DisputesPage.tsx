import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function DisputesPage() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const disputes = useQuery({ queryKey: ["admin", "disputes"], queryFn: api.adminListOpenDisputes });

  const resolve = useMutation({
    mutationFn: ({ disputeId, upheld }: { disputeId: string; upheld: boolean }) =>
      api.adminResolveDispute(disputeId, { upheld, resolutionNote: notes[disputeId] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "disputes"] }),
  });

  if (disputes.isLoading) return <div className="page-loading">Loading disputes…</div>;
  if (disputes.isError) return <div className="page-error">Could not load disputes.</div>;

  return (
    <div className="wrap">
      <h1>Disputes</h1>
      <p className="sub">
        A contractor's appeal against a review. Upholding a dispute rejects the review (excludes it from Trust
        Score); dismissing it leaves the review published.
      </p>

      <section className="section">
        <div className="card">
          {disputes.data?.length === 0 ? (
            <p className="hint">Nothing open.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Contractor</th>
                  <th>Review rating</th>
                  <th>Reason</th>
                  <th>Resolution note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {disputes.data?.map((d) => (
                  <tr key={d.id}>
                    <td>{d.companyName}</td>
                    <td>{d.reviewRating}/5</td>
                    <td>{d.reason}</td>
                    <td>
                      <input
                        type="text"
                        placeholder="Optional note"
                        value={notes[d.id] ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="primary"
                          onClick={() => resolve.mutate({ disputeId: d.id, upheld: true })}
                          disabled={resolve.isPending}
                        >
                          Uphold (reject review)
                        </button>
                        <button
                          onClick={() => resolve.mutate({ disputeId: d.id, upheld: false })}
                          disabled={resolve.isPending}
                        >
                          Dismiss (review stands)
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
