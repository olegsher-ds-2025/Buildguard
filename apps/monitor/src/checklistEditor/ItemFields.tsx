import type { ChecklistItemType, ChecklistPhaseKind } from "@buildguard/shared-types";
import { t } from "../i18n/he";
import { ITEM_TYPES, PHASE_KINDS, phaseLabel, typeLabel } from "./shared";

export interface ItemFieldsValue {
  text: string;
  phaseKind: ChecklistPhaseKind;
  itemType: ChecklistItemType;
  subStage: string;
  section: string;
}

interface Props<T extends ItemFieldsValue> {
  value: T;
  onChange: (value: T) => void;
}

export function ItemFields<T extends ItemFieldsValue>({ value, onChange }: Props<T>) {
  const set = (patch: Partial<ItemFieldsValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <label className="editor-field">
        {t("checklistEditor.text")}
        <textarea rows={3} value={value.text} onChange={(e) => set({ text: e.target.value })} />
      </label>
      <div className="editor-row">
        <label className="editor-field">
          {t("checklistEditor.phase")}
          <select value={value.phaseKind} onChange={(e) => set({ phaseKind: e.target.value as ChecklistPhaseKind })}>
            {PHASE_KINDS.map((k) => (
              <option key={k} value={k}>
                {phaseLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="editor-field">
          {t("checklistEditor.itemType")}
          <select value={value.itemType} onChange={(e) => set({ itemType: e.target.value as ChecklistItemType })}>
            {ITEM_TYPES.map((k) => (
              <option key={k} value={k}>
                {typeLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="editor-row">
        <label className="editor-field">
          {t("checklistEditor.subStage")}
          <input type="text" value={value.subStage} onChange={(e) => set({ subStage: e.target.value })} />
        </label>
        <label className="editor-field">
          {t("checklistEditor.section")}
          <input type="text" value={value.section} onChange={(e) => set({ section: e.target.value })} />
        </label>
      </div>
    </>
  );
}
