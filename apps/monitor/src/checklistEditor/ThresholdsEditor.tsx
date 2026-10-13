import type { ChecklistThreshold, ChecklistThresholdInput } from "@buildguard/shared-types";
import { t } from "../i18n/he";

export interface ThresholdDraft {
  op: ChecklistThreshold["op"];
  value: string;
  upperValue: string;
  unit: string;
}

const OPS: ChecklistThreshold["op"][] = ["≥", "≤", "<", ">"];

export const toDrafts = (thresholds: ChecklistThreshold[]): ThresholdDraft[] =>
  thresholds.map((th) => ({
    op: th.op,
    value: String(th.value),
    upperValue: th.upperValue === null ? "" : String(th.upperValue),
    unit: th.unit ?? "",
  }));

const parseNumber = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));

export function toThresholdInputs(drafts: ThresholdDraft[]): ChecklistThresholdInput[] | null {
  const inputs: ChecklistThresholdInput[] = [];
  for (const d of drafts) {
    const value = parseNumber(d.value);
    const upper = parseNumber(d.upperValue);
    if (Number.isNaN(value) || (d.upperValue.trim() !== "" && Number.isNaN(upper))) return null;
    inputs.push({
      op: d.op,
      value,
      ...(d.upperValue.trim() !== "" && { upperValue: upper }),
      ...(d.unit.trim() !== "" && { unit: d.unit.trim() }),
    });
  }
  return inputs;
}

interface Props {
  drafts: ThresholdDraft[];
  onChange: (drafts: ThresholdDraft[]) => void;
}

export function ThresholdsEditor({ drafts, onChange }: Props) {
  const update = (i: number, patch: Partial<ThresholdDraft>) =>
    onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <div className="threshold-editor">
      {drafts.map((d, i) => (
        <div className="threshold-row" key={i}>
          <select
            aria-label={t("checklistEditor.thresholdOp")}
            value={d.op}
            onChange={(e) => update(i, { op: e.target.value as ChecklistThreshold["op"] })}
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="decimal"
            aria-label={t("checklistEditor.thresholdValue")}
            placeholder={t("checklistEditor.thresholdValue")}
            value={d.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <input
            type="text"
            inputMode="decimal"
            aria-label={t("checklistEditor.thresholdUpper")}
            placeholder={t("checklistEditor.thresholdUpper")}
            value={d.upperValue}
            onChange={(e) => update(i, { upperValue: e.target.value })}
          />
          <input
            type="text"
            aria-label={t("checklistEditor.thresholdUnit")}
            placeholder={t("checklistEditor.thresholdUnit")}
            value={d.unit}
            onChange={(e) => update(i, { unit: e.target.value })}
          />
          <button
            type="button"
            aria-label={t("checklistEditor.removeThreshold")}
            title={t("checklistEditor.removeThreshold")}
            onClick={() => onChange(drafts.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...drafts, { op: "≤", value: "", upperValue: "", unit: "" }])}
      >
        + {t("checklistEditor.addThreshold")}
      </button>
    </div>
  );
}
