import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ChecklistItemSummary } from "@buildguard/shared-types";
import { api } from "../api";
import { HoldPointsEditor } from "../checklistEditor/HoldPointsEditor";
import { ItemEditor } from "../checklistEditor/ItemEditor";
import { NewItemForm } from "../checklistEditor/NewItemForm";
import { TemplateHeaderEditor } from "../checklistEditor/TemplateHeaderEditor";
import { ItemBadges, phaseLabel, typeLabel } from "../checklistEditor/shared";
import { formatAmount } from "../format";
import { t } from "../i18n/he";
import { CachedNotice } from "../offline/CachedNotice";

interface Group {
  subStage: string | null;
  section: string | null;
  items: ChecklistItemSummary[];
}

function groupItems(items: ChecklistItemSummary[]): Group[] {
  const groups: Group[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.subStage === item.subStage && last.section === item.section) last.items.push(item);
    else groups.push({ subStage: item.subStage, section: item.section, items: [item] });
  }
  return groups;
}

export function ChecklistTemplateDetailPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const template = useQuery({
    queryKey: ["checklist-template", templateId],
    queryFn: () => api.getChecklistTemplate(templateId!),
    enabled: !!templateId,
  });
  const clone = useMutation({
    mutationFn: () => api.cloneChecklistTemplate(templateId!),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
      navigate(`/checklists/${copy.id}`);
    },
  });

  if (template.isLoading) return <div className="page-loading">{t("checklists.loading")}</div>;
  if (!template.data) return <div className="page-error">{t("checklists.error")}</div>;

  const tpl = template.data;
  const canEdit = !tpl.isSystem;
  const isEditing = canEdit && editing;
  const groups = groupItems(tpl.items);
  let lastSubStage: string | null | undefined;

  return (
    <div className="wrap">
      <CachedNotice show={template.isError} />
      <Link to="/checklists">{t("checklists.back")}</Link>
      <h1>
        {t("checklists.stage")} {tpl.stageNo} · {tpl.title}
      </h1>
      <p className="sub">
        {tpl.isSystem ? t("checklists.system") : `${t("checklists.mine")} (${t("checklists.version")} ${tpl.version})`}
      </p>
      <p className="disclaimer">{t("checklists.disclaimer")}</p>
      {tpl.isSystem && (
        <button className="primary" onClick={() => clone.mutate()} disabled={clone.isPending}>
          {clone.isPending ? t("checklists.cloning") : t("checklists.clone")}
        </button>
      )}
      {canEdit && (
        <button className={isEditing ? "primary" : undefined} onClick={() => setEditing(!editing)}>
          {isEditing ? t("checklistEditor.doneEditing") : t("checklistEditor.edit")}
        </button>
      )}
      {isEditing && <TemplateHeaderEditor templateId={tpl.id} title={tpl.title} />}
      {clone.isError && <p className="form-error">{t("checklists.cloneFailed")}</p>}

      {tpl.standards.length > 0 && (
        <section className="section">
          <h2>{t("checklists.standards")}</h2>
          <ul>
            {tpl.standards.map((s, i) => (
              <li key={i}>
                {s.subStage ? `${s.subStage}: ` : ""}
                {s.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tpl.notes.length > 0 && (
        <section className="section">
          <h2>{t("checklists.notes")}</h2>
          {tpl.notes.map((n, i) => (
            <p key={i}>{n.text}</p>
          ))}
        </section>
      )}

      <section className="section">
        {groups.map((g, gi) => {
          const showSubStage = g.subStage !== lastSubStage;
          lastSubStage = g.subStage;
          return (
            <Fragment key={gi}>
              {showSubStage && g.subStage && <h2 className="substage">{g.subStage}</h2>}
              <div className="card checklist-group">
                {g.section && <div className="group-title">{g.section}</div>}
                {g.items.map((item) =>
                  isEditing ? (
                    <ItemEditor
                      key={item.id}
                      templateId={tpl.id}
                      item={item}
                      isFirst={item.id === tpl.items[0]?.id}
                      isLast={item.id === tpl.items[tpl.items.length - 1]?.id}
                    />
                  ) : (
                    <div className="checklist-item" key={item.id}>
                      <div>{item.text}</div>
                      <div className="item-meta">
                        <span className={`phase-chip ${item.phaseKind}`}>{phaseLabel(item.phaseKind)}</span>
                        <span>{typeLabel(item.itemType)}</span>
                        {item.standardRef && <span>{item.standardRef}</span>}
                        <ItemBadges item={item} />
                        {item.thresholds.map((th, i) => (
                          <span
                            className="threshold"
                            key={i}
                            title={item.thresholdsReviewed ? undefined : t("checklists.unreviewedThreshold")}
                          >
                            {th.raw}
                          </span>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </Fragment>
          );
        })}
        {isEditing && <NewItemForm templateId={tpl.id} />}
      </section>

      {isEditing && (
        <section className="section">
          <h2>🛑 {t("checklists.holdPoints")}</h2>
          <HoldPointsEditor templateId={tpl.id} holdPoints={tpl.holdPoints} />
        </section>
      )}

      {!isEditing && tpl.holdPoints.length > 0 && (
        <section className="section">
          <h2>🛑 {t("checklists.holdPoints")}</h2>
          {tpl.holdPoints.map((h) => (
            <div className="alert warning" key={h.id}>
              <div>
                {h.subStage && <strong>{h.subStage}: </strong>}
                {h.text}
              </div>
            </div>
          ))}
        </section>
      )}

      {tpl.commonDefects.length > 0 && (
        <section className="section">
          <h2>{t("checklists.commonDefects")}</h2>
          <div className="card">
            <ul>
              {tpl.commonDefects.map((d) => (
                <li key={d.id}>
                  {d.text}
                  {d.costMinMinor && d.costMaxMinor && (
                    <em>
                      {" "}
                      — {t("checklists.repairCost")}: ₪{formatAmount(d.costMinMinor)}–{formatAmount(d.costMaxMinor)}
                    </em>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
