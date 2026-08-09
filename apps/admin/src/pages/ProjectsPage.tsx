import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function ProjectsPage() {
  const projects = useQuery({ queryKey: ["admin", "projects"], queryFn: api.adminListProjects });

  if (projects.isLoading) return <div className="page-loading">Loading projects…</div>;
  if (projects.isError) return <div className="page-error">Could not load projects.</div>;

  return (
    <div className="wrap">
      <h1>Projects</h1>
      <p className="sub">Cross-project oversight — every project on the platform, regardless of staff membership.</p>
      <section className="section">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.data?.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.address}</td>
                  <td>{p.ownerEmail}</td>
                  <td>{p.status}</td>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
