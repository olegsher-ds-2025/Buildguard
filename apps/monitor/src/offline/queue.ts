import type { ConfirmPhotoUploadRequest, RecordInspectionResultRequest } from "@buildguard/shared-types";
import { QUEUE_STORE, dbDelete, dbGet, dbGetAll, dbPut } from "./db";

interface QueuedBase {
  /** Also the Idempotency-Key the server sees, so a retry can never apply twice. */
  id: string;
  userId: string;
  projectId: string;
  /** Orders the queue: operations are replayed in the order they were made. */
  seq: number;
  createdAt: number;
  status: "pending" | "failed";
  attempts: number;
  error?: string;
}

export interface QueuedResult extends QueuedBase {
  kind: "inspection_result";
  inspectionId: string;
  body: RecordInspectionResultRequest;
}

/** The photo bytes stay in the queue (IndexedDB stores Blobs) until the server confirms them. */
export interface QueuedPhoto extends QueuedBase {
  kind: "photo";
  blob: Blob;
  contentType: string;
  meta: ConfirmPhotoUploadRequest;
  /** Set once the file reached storage, so a retry only has to confirm. */
  photoId?: string;
}

export type QueuedOp = QueuedResult | QueuedPhoto;

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewQueuedOp = DistributiveOmit<QueuedOp, "id" | "seq" | "createdAt" | "status" | "attempts" | "error">;

const listeners = new Set<() => void>();
let lastSeq = 0;

/** Called after any change to the queue, in this tab. */
export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((l) => l());
}

export async function enqueue(op: NewQueuedOp): Promise<QueuedOp> {
  lastSeq = Math.max(lastSeq + 1, Date.now());
  const queued = {
    ...op,
    id: crypto.randomUUID(),
    seq: lastSeq,
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
  } as QueuedOp;
  await dbPut(QUEUE_STORE, queued);
  notify();
  return queued;
}

export async function listOps(userId: string): Promise<QueuedOp[]> {
  const all = await dbGetAll<QueuedOp>(QUEUE_STORE);
  return all.filter((op) => op.userId === userId).sort((a, b) => a.seq - b.seq);
}

export async function updateOp(id: string, patch: Partial<QueuedOp>): Promise<void> {
  const existing = await dbGet<QueuedOp>(QUEUE_STORE, id);
  if (!existing) return;
  await dbPut(QUEUE_STORE, { ...existing, ...patch });
  notify();
}

export async function removeOp(id: string): Promise<void> {
  await dbDelete(QUEUE_STORE, id);
  notify();
}

/** Puts a failed operation back in line, e.g. after the user fixed what the server rejected. */
export async function retryOp(id: string): Promise<void> {
  await updateOp(id, { status: "pending", error: undefined });
}
