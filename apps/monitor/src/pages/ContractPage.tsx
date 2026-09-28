import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../api";

export function ContractPage() {
  const { projectId, contractId } = useParams<{ projectId: string; contractId: string }>();
  const queryClient = useQueryClient();

  const contract = useQuery({
    queryKey: ["contract", projectId, contractId],
    queryFn: () => api.getContract(projectId!, contractId!),
    enabled: !!projectId && !!contractId,
  });

  const sign = useMutation({
    mutationFn: () => api.signContract(projectId!, contractId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contract", projectId, contractId] }),
  });

  if (contract.isLoading) return <div className="page-loading">Loading contract…</div>;
  if (contract.isError || !contract.data) return <div className="page-error">Could not load this contract.</div>;

  const c = contract.data;

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
    </div>
  );
}
