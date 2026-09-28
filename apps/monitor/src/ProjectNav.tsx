import { useQuery } from "@tanstack/react-query";
import { NavLink, useParams } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";

export function ProjectNav() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.listMembers(projectId!),
    enabled: !!projectId,
  });
  const isContractor = members.data?.find((m) => m.userId === user?.id)?.role === "contractor";

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
        <NavLink to={`/projects/${projectId}/tenders`} className={({ isActive }) => (isActive ? "active" : "")}>
          Tenders
        </NavLink>
        <NavLink to={`/projects/${projectId}/chat`} className={({ isActive }) => (isActive ? "active" : "")}>
          Ask
        </NavLink>
        {isContractor && (
          <NavLink
            to={`/projects/${projectId}/contractor-profile`}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            My contractor profile
          </NavLink>
        )}
      </nav>
    </div>
  );
}
