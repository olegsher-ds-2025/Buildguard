import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";

export function ProjectSwitcherPage() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  if (projects.isLoading) return <div className="page-loading">Loading your projects…</div>;
  if (projects.isError) return <div className="page-error">Could not load projects.</div>;

  const list = projects.data ?? [];
  if (list.length === 1) return <Navigate to={`/projects/${list[0].id}`} replace />;

  return (
    <div className="wrap">
      <h1>Your projects</h1>
      {list.length === 0 ? (
        <p>You're not a member of any project yet.</p>
      ) : (
        <ul className="project-list">
          {list.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`}>
                <strong>{p.name}</strong>
                <span>{p.address}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
