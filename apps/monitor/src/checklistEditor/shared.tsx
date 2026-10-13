import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@buildguard/api-client";
import type { ChecklistItemSummary } from "@buildguard/shared-types";
import { t, type MessageKey } from "../i18n/he";

export const PHASE_KINDS = ["before", "during", "after", "general"] as const;
export const ITEM_TYPES = ["visual", "measurement", "lab_test", "document", "written_approval"] as const;

export const phaseLabel = (kind: string) => t(`checklists.phase.${kind}` as MessageKey);
export const typeLabel = (type: string) => t(`checklists.type.${type}` as MessageKey);

export function useInvalidateTemplate(templateId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["checklist-template", templateId] }),
      queryClient.invalidateQueries({ queryKey: ["checklist-templates"] }),
    ]);
}

export function deleteErrorMessage(err: unknown, inUseKey: MessageKey): string {
  return err instanceof ApiError && err.status === 409 ? t(inUseKey) : t("checklistEditor.deleteFailed");
}

interface ConfirmButtonProps {
  label: string;
  pending: boolean;
  pendingLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
}

export function ConfirmButton({ label, pending, pendingLabel, onConfirm, disabled }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={armed ? "danger-btn armed" : "danger-btn"}
      disabled={pending || disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {pending ? (pendingLabel ?? t("checklistEditor.deleting")) : armed ? t("checklistEditor.confirmDelete") : label}
    </button>
  );
}

export function ItemBadges({ item }: { item: ChecklistItemSummary }) {
  return (
    <>
      {item.thresholds.length > 0 && item.thresholdsReviewed && (
        <span className="badge reviewed">✔ {t("checklistEditor.badgeReviewed")}</span>
      )}
      {item.requiresBeforeCoverPhoto && (
        <span className="badge" title={t("checklistEditor.badgeBeforeCover")}>
          📷
        </span>
      )}
    </>
  );
}
