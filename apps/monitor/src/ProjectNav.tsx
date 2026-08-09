import { NavLink, useParams } from "react-router-dom";

export function ProjectNav() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div className="wrap" style={{ paddingBottom: 0 }}>
      <nav className="nav-tabs">
        <NavLink to={`/projects/${projectId}`} end className={({ isActive }) => (isActive ? "active" : "")}>
          Dashboard
        </NavLink>
        <NavLink to={`/projects/${projectId}/documents`} className={({ isActive }) => (isActive ? "active" : "")}>
          Documents
        </NavLink>
        <NavLink to={`/projects/${projectId}/findings`} className={({ isActive }) => (isActive ? "active" : "")}>
          Findings
        </NavLink>
        <NavLink to={`/projects/${projectId}/team`} className={({ isActive }) => (isActive ? "active" : "")}>
          Team
        </NavLink>
      </nav>
    </div>
  );
}
