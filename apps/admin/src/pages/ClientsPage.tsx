import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function ClientsPage() {
  const clients = useQuery({ queryKey: ["admin", "clients"], queryFn: api.adminListClients });

  if (clients.isLoading) return <div className="page-loading">Loading clients…</div>;
  if (clients.isError) return <div className="page-error">Could not load clients.</div>;

  return (
    <div className="wrap">
      <h1>Clients</h1>
      <p className="sub">Homeowners with at least one active project.</p>
      <section className="section">
        <div className="card">
          {clients.data?.length === 0 ? (
            <p className="hint">No clients yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th className="num">Projects</th>
                </tr>
              </thead>
              <tbody>
                {clients.data?.map((c) => (
                  <tr key={c.id}>
                    <td>{c.displayName}</td>
                    <td>{c.email}</td>
                    <td className="num">{c.projectCount}</td>
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
