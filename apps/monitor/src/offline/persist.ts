import type { QueryClient } from "@tanstack/react-query";
import { CACHE_STORE, dbClear, dbGetAll, dbPut } from "./db";

/**
 * Reads worth keeping for use without a connection. Photo lists are left out:
 * they hold presigned URLs that expire within minutes.
 */
const PERSISTED_ROOTS = new Set([
  "projects",
  "dashboard",
  "members",
  "inspections",
  "inspection",
  "checklist-templates",
  "checklist-template",
  "hold-points",
  "defects",
]);

interface CacheEntry {
  key: string;
  userId: string;
  queryKey: readonly unknown[];
  data: unknown;
  updatedAt: number;
}

const WRITE_DELAY_MS = 300;

/** Loads this user's saved reads into the query cache so screens render before (or without) the network. */
export async function hydrateQueries(queryClient: QueryClient, userId: string): Promise<number> {
  const entries = (await dbGetAll<CacheEntry>(CACHE_STORE)).filter((e) => e.userId === userId);
  for (const entry of entries) {
    queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.updatedAt });
  }
  return entries.length;
}

/** Saves successful reads as they arrive. Returns a function that stops saving. */
export function startPersisting(queryClient: QueryClient, userId: string): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const { queryKey } = event.query;
    if (!PERSISTED_ROOTS.has(String(queryKey[0]))) return;

    const key = `${userId}:${JSON.stringify(queryKey)}`;
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        const { data, dataUpdatedAt } = event.query.state;
        void dbPut(CACHE_STORE, { key, userId, queryKey, data, updatedAt: dataUpdatedAt } satisfies CacheEntry).catch(() => undefined);
      }, WRITE_DELAY_MS),
    );
  });
  return () => {
    unsubscribe();
    timers.forEach(clearTimeout);
  };
}

/** Drops saved reads (on sign-out). The write queue is deliberately kept: it holds work not yet delivered. */
export function clearPersistedQueries(): Promise<unknown> {
  return dbClear(CACHE_STORE);
}
