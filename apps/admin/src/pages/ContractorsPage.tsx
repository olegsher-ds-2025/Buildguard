import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const STATUS_LABEL: Record<string, string> = {
  unverified: "Unverified",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
};

export function ContractorsPage() {
  const queryClient = useQueryClient();
  const contractors = useQuery({ queryKey: ["admin", "contractors"], queryFn: api.adminListContractors });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "contractors"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
  }

  const verify = useMutation({
    mutationFn: (id: string) => api.adminVerifyContractor(id),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.adminRejectContractor(id, "Rejected via admin console"),
    onSuccess: invalidate,
  });

  if (contractors.isLoading) return <div className="page-loading">Loading contractors…</div>;
  if (contractors.isError) return <div className="page-error">Could not load contractors.</div>;

  const pending = (contractors.data ?? []).filter(
    (c) => c.verificationStatus === "pending" || c.verificationStatus === "unverified",
  );
  const decided = (contractors.data ?? []).filter(
    (c) => c.verificationStatus === "verified" || c.verificationStatus === "rejected",
  );

  return (
    <div className="wrap">
      <h1>Contractors</h1>
      <p className="sub">Verification queue and directory.</p>

      <section className="section">
        <h2>Verification queue</h2>
        <div className="card">
          {pending.length === 0 ? (
            <p className="hint">Nothing pending.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>License</th>
                  <th>Linked account</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((c) => (
                  <tr key={c.id}>
                    <td>{c.companyName}</td>
                    <td>{c.licenseNumber ?? "—"}</td>
                    <td>{c.userEmail ?? "unclaimed"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="primary"
                          onClick={() => verify.mutate(c.id)}
                          disabled={verify.isPending || reject.isPending}
                        >
                          Verify
                        </button>
                        <button onClick={() => reject.mutate(c.id)} disabled={verify.isPending || reject.isPending}>
                          Reject
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

      <section className="section">
        <h2>All contractors</h2>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>License</th>
                <th>Status</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((c) => (
                <tr key={c.id}>
                  <td>{c.companyName}</td>
                  <td>{c.licenseNumber ?? "—"}</td>
                  <td>
                    <span className={`status-pill ${c.verificationStatus}`}>
                      {STATUS_LABEL[c.verificationStatus]}
                    </span>
                  </td>
                  <td>{c.verifiedAt ? new Date(c.verifiedAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
