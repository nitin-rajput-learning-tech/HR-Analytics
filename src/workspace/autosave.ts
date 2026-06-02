// Session auto-persistence — keeps the loaded workspace across browser refreshes
// by storing the gzipped workspace bytes in IndexedDB (same-origin, on-device,
// never sent anywhere — consistent with the privacy model). IndexedDB rather
// than localStorage so the binary blob is stored natively (no base64 inflation)
// and isn't capped at ~5 MB. All operations no-op gracefully where IndexedDB is
// unavailable (e.g. the Node test runner, private-mode quirks).

const DB_NAME = "hr-analytics";
const STORE = "kv";
const KEY = "workspace";

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let settled = false;
    const done = (v: T | null) => { if (!settled) { settled = true; resolve(v); } };
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(DB_NAME, 1);
    } catch {
      return done(null);
    }
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE); };
    open.onerror = () => done(null);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => done(req.result as T);
        req.onerror = () => done(null);
        tx.oncomplete = () => db.close();
        tx.onerror = () => { done(null); db.close(); };
      } catch {
        done(null);
        db.close();
      }
    };
  });
}

export async function persistWorkspace(bytes: Uint8Array): Promise<void> {
  // Store a copy so a detached ArrayBuffer can't corrupt the saved value.
  await withStore("readwrite", (s) => s.put(bytes.slice(), KEY));
}

export async function loadPersisted(): Promise<Uint8Array | null> {
  const v = await withStore<ArrayBuffer | Uint8Array>("readonly", (s) => s.get(KEY));
  if (!v) return null;
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

export async function clearPersisted(): Promise<void> {
  await withStore("readwrite", (s) => s.delete(KEY));
}
