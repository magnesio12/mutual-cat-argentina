/** Capa mínima sobre IndexedDB. Almacenes: kv (semilla, instantáneas, metadatos) y events. */
const DB_NAME = "mutual-cat";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        let result: T;
        if (r) r.onsuccess = () => (result = r.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const kvGet = <T>(key: string) => tx<T>("kv", "readonly", (s) => s.get(key) as IDBRequest<T>);
export const kvSet = (key: string, value: unknown) => tx("kv", "readwrite", (s) => s.put(value, key));
export const kvDelete = (key: string) => tx("kv", "readwrite", (s) => s.delete(key));
export const kvKeys = () => tx<IDBValidKey[]>("kv", "readonly", (s) => s.getAllKeys());
export const eventsAll = <T>() => tx<T[]>("events", "readonly", (s) => s.getAll() as IDBRequest<T[]>);
export const eventPut = (e: unknown) => tx("events", "readwrite", (s) => s.put(e));

export async function clearAll() {
  await tx("kv", "readwrite", (s) => s.clear());
  await tx("events", "readwrite", (s) => s.clear());
}
