import type {
  ConfirmPhotoUploadRequest,
  CreatePhotoUploadRequest,
  CreatePhotoUploadResponse,
  RecordInspectionResultRequest,
} from "@buildguard/shared-types";
import { listOps, removeOp, updateOp, type QueuedOp } from "./queue";

export interface SyncApi {
  recordInspectionResult(
    projectId: string,
    inspectionId: string,
    body: RecordInspectionResultRequest,
    opts: { idempotencyKey: string },
  ): Promise<unknown>;
  createPhotoUpload(projectId: string, body: CreatePhotoUploadRequest): Promise<CreatePhotoUploadResponse>;
  confirmPhotoUpload(
    projectId: string,
    photoId: string,
    body: ConfirmPhotoUploadRequest,
    opts: { idempotencyKey: string },
  ): Promise<unknown>;
}

export interface SyncDeps {
  api: SyncApi;
  userId: string;
  /** PUTs the bytes to a presigned URL; must throw an error with a numeric `status` on a non-2xx response. */
  putFile(url: string, blob: Blob, contentType: string): Promise<void>;
}

export interface SyncReport {
  synced: number;
  failed: number;
  /** Why processing stopped early; operations after the stopping point stay queued, in order. */
  stopped: "offline" | "auth" | null;
  remaining: number;
}

type Verdict = "retry" | "permanent" | "auth";

/**
 * Transient problems (no network, server trouble, an expired upload URL) retry later;
 * a 4xx means the server understood and refused, which a retry will not change.
 */
export function classify(err: unknown): Verdict {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return "retry";
  if (status === 401) return "auth";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  if (status === 403 && (err as { presigned?: boolean }).presigned) return "retry";
  return "permanent";
}

function describe(err: unknown): string {
  const body = (err as { body?: { message?: unknown } } | null)?.body;
  const message = body && typeof body.message === "string" ? body.message : (err as Error | null)?.message;
  return message ?? "unknown error";
}

let running: Promise<SyncReport> | null = null;

/** Replays the queue in order. Concurrent calls share one run. */
export function processQueue(deps: SyncDeps): Promise<SyncReport> {
  running ??= run(deps).finally(() => {
    running = null;
  });
  return running;
}

async function run(deps: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = { synced: 0, failed: 0, stopped: null, remaining: 0 };
  const ops = (await listOps(deps.userId)).filter((op) => op.status === "pending");

  for (const op of ops) {
    try {
      await send(op, deps);
      await removeOp(op.id);
      report.synced++;
    } catch (err) {
      const verdict = classify(err);
      if (verdict === "permanent") {
        await updateOp(op.id, { status: "failed", error: describe(err), attempts: op.attempts + 1 });
        report.failed++;
        continue;
      }
      await updateOp(op.id, { attempts: op.attempts + 1 });
      report.stopped = verdict === "auth" ? "auth" : "offline";
      break;
    }
  }
  report.remaining = (await listOps(deps.userId)).filter((op) => op.status === "pending").length;
  return report;
}

async function send(op: QueuedOp, deps: SyncDeps): Promise<void> {
  if (op.kind === "inspection_result") {
    await deps.api.recordInspectionResult(op.projectId, op.inspectionId, op.body, { idempotencyKey: op.id });
    return;
  }

  let photoId = op.photoId;
  if (!photoId) {
    // The upload URL lives five minutes, so it is requested now, never when the photo was taken.
    const created = await deps.api.createPhotoUpload(op.projectId, { contentType: op.contentType });
    await deps.putFile(created.uploadUrl, op.blob, op.contentType);
    photoId = created.photoId;
    await updateOp(op.id, { photoId });
  }
  await deps.api.confirmPhotoUpload(op.projectId, photoId, op.meta, { idempotencyKey: op.id });
}

/** Browser implementation of SyncDeps.putFile. */
export async function putFileWithFetch(url: string, blob: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!res.ok) throw Object.assign(new Error(`upload failed (${res.status})`), { status: res.status, presigned: true });
}
