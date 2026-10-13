import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { t } from "../i18n/he";
import { ConfirmButton, deleteErrorMessage, useInvalidateTemplate } from "./shared";

export function TemplateHeaderEditor({ templateId, title }: { templateId: string; title: string }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateTemplate(templateId);
  const [value, setValue] = useState(title);
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.updateChecklistTemplate(templateId, { title: value.trim() }),
    onSuccess: () => {
      setMessage(null);
      return invalidate();
    },
    onError: () => setMessage(t("checklistEditor.saveFailed")),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteChecklistTemplate(templateId),
    onSuccess: async () => {
      await invalidate();
      navigate("/checklists");
    },
    onError: (err) => setMessage(deleteErrorMessage(err, "checklistEditor.templateInUse")),
  });

  return (
    <div className="card item-editor">
      <label className="editor-field">
        {t("checklistEditor.title")}
        <input type="text" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      {message && <p className="form-error">{message}</p>}
      <div className="editor-actions">
        <button
          type="button"
          className="primary"
          disabled={save.isPending || remove.isPending || value.trim() === "" || value.trim() === title}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t("checklistEditor.saving") : t("checklistEditor.save")}
        </button>
        <ConfirmButton
          label={t("checklistEditor.deleteTemplate")}
          pending={remove.isPending}
          disabled={save.isPending}
          onConfirm={() => remove.mutate()}
        />
      </div>
    </div>
  );
}
