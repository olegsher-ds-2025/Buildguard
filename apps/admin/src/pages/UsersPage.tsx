import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function UsersPage() {
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: api.adminListUsers });

  if (users.isLoading) return <div className="page-loading">Loading users…</div>;
  if (users.isError) return <div className="page-error">Could not load users.</div>;

  return (
    <div className="wrap">
      <h1>Users</h1>
      <p className="sub">Every account on the platform.</p>
      <section className="section">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Staff role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}</td>
                  <td>{u.email}</td>
                  <td>{u.userType}</td>
                  <td>{u.staffRole ?? "—"}</td>
                  <td>{u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
