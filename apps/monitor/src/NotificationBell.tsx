import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { NotificationSummary } from "@buildguard/shared-types";
import { api } from "./api";
import { fillTemplate, formatDateTime } from "./format";
import { t } from "./i18n/he";

const REFETCH_MS = 60_000;
const DAY_MS = 86_400_000;

function describe(n: NotificationSummary): string {
  const p = n.payload as Record<string, string | number>;
  switch (n.type) {
    case "lab_result_due":
      return fillTemplate(t("notifications.lab_result_due"), p);
    case "cube_failed":
      return fillTemplate(t("notifications.cube_failed"), p);
    case "timed_test_due":
      return fillTemplate(t(p.kind === "flood" ? "notifications.timed_test_due.flood" : "notifications.timed_test_due.pressure"), p);
    case "pour_coordination": {
      const days = Math.ceil((new Date(String(p.castAt)).getTime() - Date.now()) / DAY_MS);
      return days > 0
        ? fillTemplate(t("notifications.pour_coordination"), { element: p.element, days })
        : fillTemplate(t("notifications.pour_coordination.today"), p);
    }
    default:
      return t("notifications.unknown");
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const unread = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api.listNotifications(true),
    refetchInterval: REFETCH_MS,
  });
  const recent = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => api.listNotifications(),
    enabled: open,
    refetchInterval: open ? REFETCH_MS : false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({ mutationFn: (id: string) => api.markNotificationRead(id), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.markAllNotificationsRead(), onSuccess: refresh });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openNotification(n: NotificationSummary) {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    if (n.projectId) navigate(`/projects/${n.projectId}/lab-tests`);
  }

  const count = unread.data?.length ?? 0;

  return (
    <>
      <button type="button" className="bell-btn" aria-label={t("notifications.bell")} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">🔔</span>
        {count > 0 && <span className="bell-count">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="notif-overlay" onClick={() => setOpen(false)}>
          <div className="notif-panel" role="dialog" aria-label={t("notifications.title")} onClick={(e) => e.stopPropagation()}>
            <div className="notif-head">
              <h2>{t("notifications.title")}</h2>
              <button type="button" onClick={() => setOpen(false)}>
                {t("notifications.close")}
              </button>
            </div>
            <button type="button" disabled={count === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
              {t("notifications.markAll")}
            </button>
            {recent.isLoading && <p className="hint">{t("labTests.loading")}</p>}
            {recent.isError && <p className="form-error">{t("notifications.error")}</p>}
            {recent.data?.length === 0 && <p className="hint">{t("notifications.empty")}</p>}
            <ul className="notif-list">
              {recent.data?.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notif-item${n.readAt ? "" : " unread"}`} onClick={() => openNotification(n)}>
                    <span>{describe(n)}</span>
                    <span className="item-meta">
                      {formatDateTime(n.createdAt)}
                      {!n.readAt && ` · ${t("notifications.unread")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
