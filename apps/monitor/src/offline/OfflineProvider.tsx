import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConfirmPhotoUploadRequest, RecordInspectionResultRequest } from "@buildguard/shared-types";
import { api } from "../api";
import { useAuth } from "../auth";
import { clearPersistedQueries, hydrateQueries, startPersisting } from "./persist";
import { enqueue, listOps, removeOp, retryOp, subscribeToQueue, type QueuedOp } from "./queue";
import { processQueue, putFileWithFetch } from "./sync";

const SYNC_INTERVAL_MS = 20_000;
const REFRESH_AFTER_SYNC = ["inspection", "inspections", "photos", "defects", "hold-points", "dashboard"];

interface OfflineState {
  online: boolean;
  syncing: boolean;
  /** Waiting to be sent, plus ones the server refused. */
  ops: QueuedOp[];
  pendingCount: number;
  failedCount: number;
  authNeeded: boolean;
  queueResult(projectId: string, inspectionId: string, body: RecordInspectionResultRequest): Promise<void>;
  queuePhoto(input: { projectId: string; blob: Blob; contentType: string; meta: ConfirmPhotoUploadRequest }): Promise<void>;
  syncNow(): Promise<void>;
  retry(id: string): Promise<void>;
  discard(id: string): Promise<void>;
}

const OfflineContext = createContext<OfflineState | null>(null);

/** A request that never got an HTTP answer — no connection, DNS, timeout — as opposed to a server refusal. */
export function isNetworkError(err: unknown): boolean {
  return typeof (err as { status?: unknown } | null)?.status !== "number";
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  // The browser can claim to be online while requests fail (weak signal, captive portal), so a failed sync counts too.
  const [reachable, setReachable] = useState(true);
  const online = browserOnline && reachable;
  const [syncing, setSyncing] = useState(false);
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [authNeeded, setAuthNeeded] = useState(false);
  const userId = user?.id ?? null;
  const hadUser = useRef(false);

  const refreshOps = useCallback(async () => {
    setOps(userId ? await listOps(userId) : []);
  }, [userId]);

  const syncNow = useCallback(async () => {
    setBrowserOnline(navigator.onLine);
    if (!userId || !navigator.onLine) return;
    setSyncing(true);
    try {
      const report = await processQueue({ api, userId, putFile: putFileWithFetch });
      setAuthNeeded(report.stopped === "auth");
      setReachable(report.stopped !== "offline");
      if (report.synced > 0) {
        REFRESH_AFTER_SYNC.forEach((root) => void queryClient.invalidateQueries({ queryKey: [root] }));
      }
    } finally {
      setSyncing(false);
      await refreshOps();
    }
  }, [userId, queryClient, refreshOps]);

  // Saved reads: restore them for the signed-in user, keep saving, and drop them on sign-out.
  useEffect(() => {
    if (!userId) {
      if (hadUser.current) void clearPersistedQueries();
      hadUser.current = false;
      return;
    }
    hadUser.current = true;
    void hydrateQueries(queryClient, userId);
    return startPersisting(queryClient, userId);
  }, [userId, queryClient]);

  useEffect(() => {
    void refreshOps();
    return subscribeToQueue(() => void refreshOps());
  }, [refreshOps]);

  useEffect(() => {
    const goOnline = () => {
      setBrowserOnline(true);
      setReachable(true);
      void syncNow();
    };
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void syncNow();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [syncNow]);

  const pendingCount = ops.filter((o) => o.status === "pending").length;
  useEffect(() => {
    if (pendingCount === 0) return;
    // Not gated on the browser's online flag: some browsers miss the "online" event, and syncNow checks it live anyway.
    const timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pendingCount, syncNow]);

  // Coming back to the app is the likeliest moment the connection returned.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncNow]);

  const value = useMemo<OfflineState>(
    () => ({
      online,
      syncing,
      ops,
      pendingCount,
      failedCount: ops.filter((o) => o.status === "failed").length,
      authNeeded,
      queueResult: async (projectId, inspectionId, body) => {
        if (!userId) return;
        await enqueue({ kind: "inspection_result", userId, projectId, inspectionId, body });
        void syncNow();
      },
      queuePhoto: async ({ projectId, blob, contentType, meta }) => {
        if (!userId) return;
        await enqueue({ kind: "photo", userId, projectId, blob, contentType, meta });
        void syncNow();
      },
      syncNow,
      retry: async (id) => {
        await retryOp(id);
        void syncNow();
      },
      discard: (id) => removeOp(id),
    }),
    [online, syncing, ops, pendingCount, authNeeded, userId, syncNow],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineState {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used within OfflineProvider");
  return ctx;
}

/** Results and photos queued for one inspection, so screens can show them before the server has them. */
export function usePendingForInspection(inspectionId: string | undefined) {
  const { ops } = useOffline();
  return useMemo(() => {
    const results = new Map<string, RecordInspectionResultRequest>();
    const photosByItem = new Map<string, number>();
    for (const op of ops) {
      if (op.status !== "pending") continue;
      if (op.kind === "inspection_result" && op.inspectionId === inspectionId) {
        results.set(op.body.checklistItemId, op.body);
      } else if (op.kind === "photo" && op.meta.inspectionId === inspectionId && op.meta.tag === "before_cover" && op.meta.checklistItemId) {
        photosByItem.set(op.meta.checklistItemId, (photosByItem.get(op.meta.checklistItemId) ?? 0) + 1);
      }
    }
    return { results, beforeCoverPhotos: photosByItem };
  }, [ops, inspectionId]);
}
