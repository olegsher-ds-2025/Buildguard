import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ChecklistHoldPointSummary } from "@buildguard/shared-types";
import { api } from "../api";
import { t } from "../i18n/he";
import { ConfirmButton, deleteErrorMessage, useInvalidateTemplate } from "./shared";

function HoldPointRow({ templateId, holdPoint }: { templateId: string; holdPoint: ChecklistHoldPointSummary }) {
  const invalidate = useInvalidateTemplate(templateId);
  const [text, setText] = useState(holdPoint.text);
  const [subStage, setSubStage] = useState(holdPoint.subStage ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.updateChecklistHoldPoint(templateId, holdPoint.id, {
        text: text.trim(),
        ...(subStage.trim() && { subStage: subStage.trim() }),
      }),
    onSuccess: () => {
      setMessage(null);
      return invalidate();
    },
    onError: () => setMessage(t("checklistEditor.saveFailed")),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteChecklistHoldPoint(templateId, holdPoint.id),
    onSuccess: () => invalidate(),
    onError: (err) => setMessage(deleteErrorMessage(err, "checklistEditor.itemInUse")),
  });
  const busy = save.isPending || remove.isPending;

  return (
    <div className="alert warning item-editor">
      <label className="editor-field">
        {t("checklistEditor.subStage")}
        <input type="text" value={subStage} onChange={(e) => setSubStage(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("checklistEditor.holdPointText")}
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {message && <p className="form-error">{message}</p>}
      <div className="editor-actions">
        <button type="button" className="primary" disabled={busy || text.trim() === ""} onClick={() => save.mutate()}>
          {save.isPending ? t("checklistEditor.saving") : t("checklistEditor.save")}
        </button>
        <ConfirmButton label={t("checklistEditor.delete")} pending={remove.isPending} disabled={busy} onConfirm={() => remove.mutate()} />
      </div>
    </div>
  );
}

function NewHoldPointForm({ templateId }: { templateId: string }) {
  const invalidate = useInvalidateTemplate(templateId);
  const [text, setText] = useState("");
  const [subStage, setSubStage] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api.createChecklistHoldPoint(templateId, {
        text: text.trim(),
        ...(subStage.trim() && { subStage: subStage.trim() }),
      }),
    onSuccess: async () => {
      setText("");
      setSubStage("");
      await invalidate();
    },
  });

  return (
    <form
      className="card new-item-form"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <label className="editor-field">
        {t("checklistEditor.subStage")}
        <input type="text" value={subStage} onChange={(e) => setSubStage(e.target.value)} />
      </label>
      <label className="editor-field">
        {t("checklistEditor.holdPointText")}
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {create.isError && <p className="form-error">{t("checklistEditor.addFailed")}</p>}
      <button type="submit" className="primary" disabled={create.isPending || text.trim() === ""}>
        {create.isPending ? t("checklistEditor.adding") : t("checklistEditor.addHoldPoint")}
      </button>
    </form>
  );
}

export function HoldPointsEditor({ templateId, holdPoints }: { templateId: string; holdPoints: ChecklistHoldPointSummary[] }) {
  return (
    <>
      {holdPoints.map((h) => (
        <HoldPointRow key={h.id} templateId={templateId} holdPoint={h} />
      ))}
      <NewHoldPointForm templateId={templateId} />
    </>
  );
}
