import { NavLink, useParams } from "react-router-dom";
import { t, type MessageKey } from "./i18n/he";
import type { ProjectRole } from "@buildguard/shared-types";
import { useMyProjectRole } from "./useMyProjectRole";

const TABS: { path: string; label: MessageKey; end?: boolean; contractor?: boolean; roles?: ProjectRole[] }[] = [
  { path: "", label: "nav.dashboard", end: true },
  { path: "/documents", label: "nav.documents" },
  { path: "/inspections", label: "nav.inspections" },
  { path: "/findings", label: "nav.findings" },
  { path: "/hold-points", label: "nav.holdPoints" },
  { path: "/lab-tests", label: "nav.labTests" },
  { path: "/daily-logs", label: "nav.dailyLogs" },
  { path: "/form4", label: "nav.form4" },
  { path: "/defects", label: "nav.defects", contractor: true },
  { path: "/team", label: "nav.team", contractor: true },
  { path: "/tenders", label: "nav.tenders", contractor: true },
  { path: "/quotes", label: "nav.quotes", roles: ["owner", "project_manager"] },
  { path: "/chat", label: "nav.chat" },
];

export function ProjectNav() {
  const { projectId } = useParams<{ projectId: string }>();
  const { role } = useMyProjectRole(projectId);
  const isContractor = role === "contractor";
  const tabs = isContractor
    ? [...TABS.filter((tab) => tab.contractor), { path: "/contractor-profile", label: "nav.contractorProfile" as const }]
    : TABS.filter((tab) => !tab.roles || (!!role && tab.roles.includes(role)));

  return (
    <nav className="nav-tabs">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={`/projects/${projectId}${tab.path}`}
          end={tab.end}
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          {t(tab.label)}
        </NavLink>
      ))}
    </nav>
  );
}
