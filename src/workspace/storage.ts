// Storage durability + usage reporting for the on-device local database.
//
// The session auto-saves to IndexedDB, but by default a browser may EVICT that
// data under storage pressure (or when the user clears site data) — "best
// effort" storage. For an HR tool that's a real data-loss risk, so once a user
// has their own data we request *persistent* storage, which asks the browser to
// keep the data until the user explicitly clears it. We also surface usage so
// the UI can show how much is stored and nudge a backup when storage is only
// best-effort. Every call no-ops gracefully where the API is unavailable
// (older browsers, the Node test runner, some file:// contexts).

export interface StorageStatus {
  supported: boolean; // the Storage API is available at all
  persisted: boolean; // granted durable storage (won't be auto-evicted)
  usageBytes: number | null; // bytes used by this origin (all stores)
  quotaBytes: number | null; // bytes available to this origin
}

function storageManager(): StorageManager | null {
  try {
    return typeof navigator !== "undefined" && navigator.storage ? navigator.storage : null;
  } catch {
    return null;
  }
}

// Ask the browser to keep this origin's storage durable. Idempotent: if it is
// already persisted we short-circuit. Returns whether durable storage is in
// effect. Never throws.
export async function requestPersistentStorage(): Promise<boolean> {
  const sm = storageManager();
  if (!sm?.persist) return false;
  try {
    if (sm.persisted && (await sm.persisted())) return true;
    return await sm.persist();
  } catch {
    return false;
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const status: StorageStatus = { supported: false, persisted: false, usageBytes: null, quotaBytes: null };
  const sm = storageManager();
  if (!sm) return status;
  status.supported = true;
  try {
    if (sm.persisted) status.persisted = await sm.persisted();
  } catch {
    /* leave persisted false */
  }
  try {
    if (sm.estimate) {
      const est = await sm.estimate();
      status.usageBytes = typeof est.usage === "number" ? est.usage : null;
      status.quotaBytes = typeof est.quota === "number" ? est.quota : null;
    }
  } catch {
    /* leave usage/quota null */
  }
  return status;
}

// Human-friendly byte size. Pure (unit-tested). Uses 1 decimal under 10 of a
// unit, whole numbers above, so "6.1 KB" / "23 KB" / "1.4 MB" read cleanly.
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${Math.round(n)} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : String(Math.round(kb))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : String(Math.round(mb))} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : String(Math.round(gb))} GB`;
}
