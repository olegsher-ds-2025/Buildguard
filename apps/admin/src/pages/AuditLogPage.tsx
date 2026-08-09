import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function AuditLogPage() {
  const entries = useQuery({ queryKey: ["admin", "audit-log"], queryFn: api.adminListAuditLog });

  if (entries.isLoading) return <div className="page-loading">Loading audit log…</div>;
  if (entries.isError) return <div className="page-error">Could not load the audit log.</div>;

  return (
    <div className="wrap">
      <h1>Audit log</h1>
      <p className="sub">Every recorded staff and customer action, append-only, most recent first.</p>
      <section className="section">
        <div className="card">
          {entries.data?.length === 0 ? (
            <p className="hint">No entries yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                </tr>
              </thead>
              <tbody>
                {entries.data?.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleString()}</td>
                    <td>
                      <span className={`status-pill ${e.actorType}`}>{e.actorType}</span> {e.actorEmail ?? "system"}
                    </td>
                    <td>{e.action}</td>
                    <td>
                      {e.entityType} · {e.entityId.slice(0, 8)}
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
