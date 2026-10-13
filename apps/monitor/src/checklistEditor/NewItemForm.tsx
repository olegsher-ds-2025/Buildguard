import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { t } from "../i18n/he";
import { ItemFields, type ItemFieldsValue } from "./ItemFields";
import { useInvalidateTemplate } from "./shared";

const EMPTY: ItemFieldsValue = { text: "", phaseKind: "during", itemType: "visual", subStage: "", section: "" };

interface Props {
  templateId: string;
  afterItemId?: string;
  onDone?: () => void;
}

export function NewItemForm({ templateId, afterItemId, onDone }: Props) {
  const invalidate = useInvalidateTemplate(templateId);
  const [draft, setDraft] = useState(EMPTY);
  const create = useMutation({
    mutationFn: () =>
      api.createChecklistItem(templateId, {
        text: draft.text.trim(),
        phaseKind: draft.phaseKind,
        itemType: draft.itemType,
        ...(draft.subStage.trim() && { subStage: draft.subStage.trim() }),
        ...(draft.section.trim() && { section: draft.section.trim() }),
        ...(afterItemId && { afterItemId }),
      }),
    onSuccess: async () => {
      setDraft(EMPTY);
      await invalidate();
      onDone?.();
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
      <ItemFields value={draft} onChange={setDraft} />
      {create.isError && <p className="form-error">{t("checklistEditor.addFailed")}</p>}
      <button type="submit" className="primary" disabled={create.isPending || draft.text.trim() === ""}>
        {create.isPending ? t("checklistEditor.adding") : t("checklistEditor.addItem")}
      </button>
    </form>
  );
}
