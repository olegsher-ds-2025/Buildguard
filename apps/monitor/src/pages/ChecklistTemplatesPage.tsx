import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { t } from "../i18n/he";
import { CachedNotice } from "../offline/CachedNotice";

export function ChecklistTemplatesPage() {
  const templates = useQuery({ queryKey: ["checklist-templates"], queryFn: () => api.listChecklistTemplates() });

  if (templates.isLoading) return <div className="page-loading">{t("checklists.loading")}</div>;
  if (!templates.data) return <div className="page-error">{t("checklists.error")}</div>;

  return (
    <div className="wrap">
      <CachedNotice show={templates.isError} />
      <h1>{t("checklists.title")}</h1>
      <p className="sub">{t("checklists.subtitle")}</p>
      <p className="disclaimer">{t("checklists.disclaimer")}</p>

      <ul className="project-list">
        {templates.data.map((tpl) => (
          <li key={tpl.id}>
            <Link to={`/checklists/${tpl.id}`}>
              <strong>
                {t("checklists.stage")} {tpl.stageNo} · {tpl.title}
              </strong>
              <span>
                {tpl.isSystem ? t("checklists.system") : `${t("checklists.mine")} (${t("checklists.version")} ${tpl.version})`}
                {" · "}
                {tpl.itemCount} {t("checklists.items")} · {tpl.holdPointCount} {t("checklists.holdPoints")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
