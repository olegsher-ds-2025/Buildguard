import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

/** Read-only oversight — no write actions (dispute-flagging is out of scope for M8, see the build plan). */
export function TendersPage() {
  const tenders = useQuery({ queryKey: ["admin", "tenders"], queryFn: api.adminListTenders });
  const contracts = useQuery({ queryKey: ["admin", "contracts"], queryFn: api.adminListContracts });

  if (tenders.isLoading || contracts.isLoading) return <div className="page-loading">Loading tenders…</div>;
  if (tenders.isError || contracts.isError) return <div className="page-error">Could not load tenders.</div>;

  return (
    <div className="wrap">
      <h1>Tenders &amp; Contracts</h1>
      <p className="sub">Cross-project oversight, read-only.</p>

      <section className="section">
        <h2>Tenders</h2>
        <div className="card">
          {tenders.data?.length === 0 ? (
            <p className="hint">No tenders yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Bids</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tenders.data?.map((t) => (
                  <tr key={t.id}>
                    <td>{t.projectName}</td>
                    <td>{t.title}</td>
                    <td>{t.status.replace("_", " ")}</td>
                    <td>{t.bidCount}</td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="section">
        <h2>Contracts</h2>
        <div className="card">
          {contracts.data?.length === 0 ? (
            <p className="hint">No contracts yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Contractor</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Signed</th>
                </tr>
              </thead>
              <tbody>
                {contracts.data?.map((c) => (
                  <tr key={c.id}>
                    <td>{c.projectName}</td>
                    <td>{c.companyName}</td>
                    <td>
                      {(Number(c.totalAmountMinor) / 100).toLocaleString()} {c.currency}
                    </td>
                    <td>{c.status}</td>
                    <td>{c.signedAt ? new Date(c.signedAt).toLocaleDateString() : "—"}</td>
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
