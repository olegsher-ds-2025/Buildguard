import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { t } from "../i18n/he";
import { CachedNotice } from "../offline/CachedNotice";

export function ProjectSwitcherPage() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  if (projects.isLoading) return <div className="page-loading">{t("projects.loading")}</div>;
  if (!projects.data) return <div className="page-error">{t("projects.error")}</div>;

  const list = projects.data ?? [];
  if (list.length === 1) return <Navigate to={`/projects/${list[0].id}`} replace />;

  return (
    <div className="wrap">
      <CachedNotice show={projects.isError} />
      <h1>{t("projects.title")}</h1>
      {list.length === 0 ? (
        <p>{t("projects.empty")}</p>
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
