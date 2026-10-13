import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ChecklistItemSummary, UpdateChecklistItemRequest } from "@buildguard/shared-types";
import { api } from "../api";
import { t } from "../i18n/he";
import { ItemFields, type ItemFieldsValue } from "./ItemFields";
import { NewItemForm } from "./NewItemForm";
import { ThresholdsEditor, toDrafts, toThresholdInputs, type ThresholdDraft } from "./ThresholdsEditor";
import { ConfirmButton, ItemBadges, deleteErrorMessage, useInvalidateTemplate } from "./shared";

interface Draft extends ItemFieldsValue {
  standardRef: string;
  mandatory: boolean;
  requiresBeforeCoverPhoto: boolean;
  thresholds: ThresholdDraft[];
  thresholdsReviewed: boolean;
}

const toDraft = (item: ChecklistItemSummary): Draft => ({
  text: item.text,
  phaseKind: item.phaseKind,
  itemType: item.itemType,
  subStage: item.subStage ?? "",
  section: item.section ?? "",
  standardRef: item.standardRef ?? "",
  mandatory: item.mandatory,
  requiresBeforeCoverPhoto: item.requiresBeforeCoverPhoto,
  thresholds: toDrafts(item.thresholds),
  thresholdsReviewed: item.thresholdsReviewed,
});

interface Props {
  templateId: string;
  item: ChecklistItemSummary;
  isFirst: boolean;
  isLast: boolean;
}

export function ItemEditor({ templateId, item, isFirst, isLast }: Props) {
  const invalidate = useInvalidateTemplate(templateId);
  const [draft, setDraft] = useState(() => toDraft(item));
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const thresholdsChanged =
    JSON.stringify(draft.thresholds) !== JSON.stringify(toDrafts(item.thresholds));
  const save = useMutation({
    mutationFn: () => {
      const thresholds = toThresholdInputs(draft.thresholds);
      if (!thresholds) throw new Error("invalid-number");
      const body: UpdateChecklistItemRequest = {
        text: draft.text.trim(),
        phaseKind: draft.phaseKind,
        itemType: draft.itemType,
        mandatory: draft.mandatory,
        requiresBeforeCoverPhoto: draft.requiresBeforeCoverPhoto,
      };
      const original = toDraft(item);
      for (const key of ["subStage", "section", "standardRef"] as const) {
        if (draft[key].trim() !== original[key]) body[key] = draft[key].trim();
      }
      if (thresholdsChanged || draft.thresholdsReviewed !== item.thresholdsReviewed) {
        body.thresholds = thresholds;
        body.thresholdsReviewed = thresholds.length > 0 && draft.thresholdsReviewed;
      }
      return api.updateChecklistItem(templateId, item.id, body);
    },
    onSuccess: async (saved) => {
      setDraft(toDraft(saved));
      setMessage(null);
      await invalidate();
    },
    onError: (err) =>
      setMessage(err instanceof Error && err.message === "invalid-number" ? t("checklistEditor.invalidNumber") : t("checklistEditor.saveFailed")),
  });

  const move = useMutation({
    mutationFn: (direction: "up" | "down") => api.moveChecklistItem(templateId, item.id, direction),
    onSuccess: () => invalidate(),
    onError: () => setMessage(t("checklistEditor.moveFailed")),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteChecklistItem(templateId, item.id),
    onSuccess: () => invalidate(),
    onError: (err) => setMessage(deleteErrorMessage(err, "checklistEditor.itemInUse")),
  });

  const busy = save.isPending || move.isPending || remove.isPending;
  const setThresholds = (thresholds: ThresholdDraft[]) =>
    setDraft({ ...draft, thresholds, thresholdsReviewed: false });

  return (
    <div className="checklist-item item-editor">
      <div className="item-meta">
        <ItemBadges item={item} />
      </div>
      <ItemFields value={draft} onChange={setDraft} />
      <label className="editor-field">
        {t("checklistEditor.standardRef")}
        <input type="text" value={draft.standardRef} onChange={(e) => setDraft({ ...draft, standardRef: e.target.value })} />
      </label>
      <label className="editor-check">
        <input type="checkbox" checked={draft.mandatory} onChange={(e) => setDraft({ ...draft, mandatory: e.target.checked })} />
        {t("checklistEditor.mandatory")}
      </label>
      <label className="editor-check">
        <input
          type="checkbox"
          checked={draft.requiresBeforeCoverPhoto}
          onChange={(e) => setDraft({ ...draft, requiresBeforeCoverPhoto: e.target.checked })}
        />
        {t("checklistEditor.requiresBeforeCoverPhoto")}
      </label>

      <div className="editor-field">
        <span>{t("checklistEditor.thresholds")}</span>
        {item.thresholds.length > 0 && (
          <div className="item-meta">
            {t("checklistEditor.sourceText")}:
            {item.thresholds.map((th, i) => (
              <span className="threshold" key={i}>
                {th.raw}
              </span>
            ))}
          </div>
        )}
        <ThresholdsEditor drafts={draft.thresholds} onChange={setThresholds} />
        {draft.thresholds.length > 1 && <p className="alert warning">{t("checklistEditor.multiThresholdWarning")}</p>}
        {draft.thresholds.length > 0 && (
          <>
            <label className="editor-check">
              <input
                type="checkbox"
                checked={draft.thresholdsReviewed}
                onChange={(e) => setDraft({ ...draft, thresholdsReviewed: e.target.checked })}
              />
              {t("checklistEditor.reviewed")}
            </label>
            <p className="hint">{t("checklistEditor.reviewedHint")}</p>
          </>
        )}
      </div>

      {message && <p className="form-error">{message}</p>}
      <div className="editor-actions">
        <button type="button" className="primary" disabled={busy || draft.text.trim() === ""} onClick={() => save.mutate()}>
          {save.isPending ? t("checklistEditor.saving") : t("checklistEditor.save")}
        </button>
        <button type="button" aria-label={t("checklistEditor.moveUp")} title={t("checklistEditor.moveUp")} disabled={busy || isFirst} onClick={() => move.mutate("up")}>
          ↑
        </button>
        <button type="button" aria-label={t("checklistEditor.moveDown")} title={t("checklistEditor.moveDown")} disabled={busy || isLast} onClick={() => move.mutate("down")}>
          ↓
        </button>
        <button type="button" disabled={busy} onClick={() => setAdding(!adding)}>
          {t("checklistEditor.addAfter")}
        </button>
        <ConfirmButton label={t("checklistEditor.delete")} pending={remove.isPending} disabled={busy} onConfirm={() => remove.mutate()} />
      </div>
      {adding && <NewItemForm templateId={templateId} afterItemId={item.id} onDone={() => setAdding(false)} />}
    </div>
  );
}
