import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_STORE, QUEUE_STORE, dbClear, dbGetAll } from "./db";
import { hydrateQueries, startPersisting } from "./persist";
import { enqueue, listOps, newId, retryOp, subscribeToQueue } from "./queue";
import { classify, processQueue, type SyncApi } from "./sync";

const USER = "user-1";
const resultOp = (itemId: string, outcome: "ok" | "fail" = "ok") =>
  ({ kind: "inspection_result", userId: USER, projectId: "p1", inspectionId: "i1", body: { checklistItemId: itemId, outcome } }) as const;
const photoOp = () =>
  ({
    kind: "photo",
    userId: USER,
    projectId: "p1",
    blob: new Blob(["jpeg-bytes"]),
    contentType: "image/jpeg",
    meta: { tag: "before_cover", inspectionId: "i1", checklistItemId: "c1" },
  }) as const;

const apiError = (status: number, message?: string) => Object.assign(new Error(`status ${status}`), { status, body: message ? { message } : undefined });

function makeApi(overrides: Partial<SyncApi> = {}): SyncApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    recordInspectionResult: vi.fn(async (_p, _i, body) => void calls.push(`result:${body.checklistItemId}`)),
    createPhotoUpload: vi.fn(async () => {
      calls.push("create");
      return { photoId: "photo-1", uploadUrl: "http://storage/put" };
    }),
    confirmPhotoUpload: vi.fn(async () => void calls.push("confirm")),
    ...overrides,
  };
}

beforeEach(async () => {
  await dbClear(QUEUE_STORE);
  await dbClear(CACHE_STORE);
});

describe("queue", () => {
  it("keeps operations in the order they were made, per user", async () => {
    await enqueue(photoOp());
    await enqueue(resultOp("a"));
    await enqueue({ ...resultOp("other"), userId: "someone-else" });
    const ops = await listOps(USER);
    expect(ops.map((o) => o.kind)).toEqual(["photo", "inspection_result"]);
    expect(ops.every((o) => o.status === "pending" && o.attempts === 0)).toBe(true);
  });

  it("notifies subscribers when it changes", async () => {
    const listener = vi.fn();
    const stop = subscribeToQueue(listener);
    await enqueue(resultOp("a"));
    stop();
    await enqueue(resultOp("b"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("newId", () => {
  it("still produces a v4 UUID where crypto.randomUUID is unavailable (insecure context)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    const id = newId();
    vi.unstubAllGlobals();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(newId());
  });
});

describe("classify", () => {
  it("retries network failures and server trouble, refuses 4xx, and flags auth", () => {
    expect(classify(new TypeError("Failed to fetch"))).toBe("retry");
    expect(classify(apiError(503))).toBe("retry");
    expect(classify(apiError(429))).toBe("retry");
    expect(classify(apiError(400))).toBe("permanent");
    expect(classify(apiError(409))).toBe("permanent");
    expect(classify(apiError(401))).toBe("auth");
    expect(classify(Object.assign(new Error("x"), { status: 403, presigned: true }))).toBe("retry");
    expect(classify(apiError(403))).toBe("permanent");
  });
});

describe("processQueue", () => {
  it("delivers everything in order, using each operation's id as its idempotency key", async () => {
    const first = await enqueue(photoOp());
    const second = await enqueue(resultOp("c1"));
    const api = makeApi();
    const putFile = vi.fn().mockResolvedValue(undefined);

    const report = await processQueue({ api, userId: USER, putFile });

    expect(report).toEqual({ synced: 2, failed: 0, stopped: null, remaining: 0 });
    expect(api.calls).toEqual(["create", "confirm", "result:c1"]);
    expect(putFile).toHaveBeenCalledWith("http://storage/put", expect.any(Blob), "image/jpeg");
    expect((api.confirmPhotoUpload as ReturnType<typeof vi.fn>).mock.calls[0][3]).toEqual({ idempotencyKey: first.id });
    expect((api.recordInspectionResult as ReturnType<typeof vi.fn>).mock.calls[0][3]).toEqual({ idempotencyKey: second.id });
    expect(await dbGetAll(QUEUE_STORE)).toHaveLength(0);
  });

  it("stops at the first network failure and keeps the rest queued in order", async () => {
    await enqueue(resultOp("a"));
    await enqueue(resultOp("b"));
    await enqueue(resultOp("c"));
    const api = makeApi({
      recordInspectionResult: vi.fn(async (_p, _i, body) => {
        if (body.checklistItemId === "b") throw new TypeError("Failed to fetch");
      }),
    });

    const report = await processQueue({ api, userId: USER, putFile: vi.fn() });

    expect(report).toMatchObject({ synced: 1, stopped: "offline", remaining: 2 });
    const left = await listOps(USER);
    expect(left.map((o) => (o as { body: { checklistItemId: string } }).body.checklistItemId)).toEqual(["b", "c"]);
    expect(left[0].attempts).toBe(1);
  });

  it("marks a refused operation failed with the server's reason, and carries on with the rest", async () => {
    await enqueue(resultOp("a"));
    await enqueue(resultOp("b"));
    const api = makeApi({
      recordInspectionResult: vi.fn(async (_p, _i, body) => {
        if (body.checklistItemId === "a") throw apiError(400, "A before-cover photo is required");
      }),
    });

    const report = await processQueue({ api, userId: USER, putFile: vi.fn() });

    expect(report).toMatchObject({ synced: 1, failed: 1, stopped: null, remaining: 0 });
    const [failed] = await listOps(USER);
    expect(failed).toMatchObject({ status: "failed", error: "A before-cover photo is required" });

    await retryOp(failed.id);
    expect((await listOps(USER))[0].status).toBe("pending");
  });

  it("never loses a photo: a failed upload keeps its bytes, and a retry only confirms once the file is stored", async () => {
    await enqueue(photoOp());
    const api = makeApi({
      confirmPhotoUpload: vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({}),
    });
    const putFile = vi.fn().mockResolvedValue(undefined);

    const first = await processQueue({ api, userId: USER, putFile });
    expect(first.stopped).toBe("offline");
    const [kept] = await listOps(USER);
    expect(kept).toMatchObject({ kind: "photo", photoId: "photo-1" });
    expect((kept as { blob: Blob }).blob.size).toBeGreaterThan(0);

    const second = await processQueue({ api, userId: USER, putFile });
    expect(second).toMatchObject({ synced: 1, remaining: 0 });
    expect(putFile).toHaveBeenCalledTimes(1);
    expect(api.createPhotoUpload).toHaveBeenCalledTimes(1);
  });

  it("asks for a fresh upload URL when the earlier one expired before the file was stored", async () => {
    await enqueue(photoOp());
    const expired = Object.assign(new Error("expired"), { status: 403, presigned: true });
    const putFile = vi.fn().mockRejectedValueOnce(expired).mockResolvedValue(undefined);
    const api = makeApi();

    expect((await processQueue({ api, userId: USER, putFile })).stopped).toBe("offline");
    expect((await processQueue({ api, userId: USER, putFile })).synced).toBe(1);
    expect(api.createPhotoUpload).toHaveBeenCalledTimes(2);
  });

  it("stops on an expired login without discarding anything", async () => {
    await enqueue(resultOp("a"));
    const api = makeApi({ recordInspectionResult: vi.fn().mockRejectedValue(apiError(401)) });
    const report = await processQueue({ api, userId: USER, putFile: vi.fn() });
    expect(report).toMatchObject({ stopped: "auth", remaining: 1 });
    expect(await listOps(USER)).toHaveLength(1);
  });

  it("shares one run between concurrent callers, so nothing is sent twice", async () => {
    await enqueue(resultOp("a"));
    const api = makeApi();
    const [a, b] = await Promise.all([
      processQueue({ api, userId: USER, putFile: vi.fn() }),
      processQueue({ api, userId: USER, putFile: vi.fn() }),
    ]);
    expect(a).toBe(b);
    expect(api.recordInspectionResult).toHaveBeenCalledTimes(1);
  });

  it("only touches the signed-in user's operations", async () => {
    await enqueue({ ...resultOp("theirs"), userId: "someone-else" });
    const api = makeApi();
    const report = await processQueue({ api, userId: USER, putFile: vi.fn() });
    expect(report.synced).toBe(0);
    expect(api.recordInspectionResult).not.toHaveBeenCalled();
    expect(await dbGetAll(QUEUE_STORE)).toHaveLength(1);
  });
});

describe("query persistence", () => {
  it("restores saved reads for the same user only, and skips reads that should not be kept", async () => {
    const online = new QueryClient();
    const stop = startPersisting(online, USER);
    online.setQueryData(["inspection", "p1", "i1"], { id: "i1", items: [1, 2, 3] });
    online.setQueryData(["photos", "p1", {}], [{ url: "http://signed" }]);
    await new Promise((r) => setTimeout(r, 450));
    stop();

    const offline = new QueryClient();
    expect(await hydrateQueries(offline, USER)).toBe(1);
    expect(offline.getQueryData(["inspection", "p1", "i1"])).toEqual({ id: "i1", items: [1, 2, 3] });
    expect(offline.getQueryData(["photos", "p1", {}])).toBeUndefined();

    const other = new QueryClient();
    expect(await hydrateQueries(other, "someone-else")).toBe(0);
  });
});
