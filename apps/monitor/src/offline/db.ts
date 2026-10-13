const DB_NAME = "buildguard-offline";
const DB_VERSION = 1;
export const QUEUE_STORE = "queue";
export const CACHE_STORE = "cache";

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      db.createObjectStore(CACHE_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
}

/** For tests: forget the cached connection so a fresh database can be opened. */
export function resetDbForTests(): void {
  opening = null;
}

function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export const dbGetAll = <T>(store: string) => run<T[]>(store, "readonly", (s) => s.getAll());
export const dbGet = <T>(store: string, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key));
export const dbPut = (store: string, value: unknown) => run(store, "readwrite", (s) => s.put(value));
export const dbDelete = (store: string, key: string) => run(store, "readwrite", (s) => s.delete(key));
export const dbClear = (store: string) => run(store, "readwrite", (s) => s.clear());
