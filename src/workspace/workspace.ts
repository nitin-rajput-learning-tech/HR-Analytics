import pako from "pako";
import { MemoryStore } from "../core/store/memoryStore";
import type { DataSource, Snapshot } from "../core/store/types";
import { DEFAULT_BRANDING, sanitizeBranding, type Branding } from "../branding/branding";
import type { Filters } from "../core/filters";

const FORMAT = "hr-analytics-workspace";
// Bump whenever the on-disk shape changes, and add a matching MIGRATIONS entry.
export const CURRENT_VERSION = 2;

export interface SavedView {
  id: string;
  name: string;
  page: string;
  filters: Filters;
}

// A single entry in the local, workspace-embedded activity log. Kept deliberately
// minimal (no PII) — it records that an action happened, not row-level data.
export interface AuditEntry {
  ts: string; // ISO-8601 timestamp
  action: string; // short verb phrase, e.g. "Saved workspace"
  detail?: string; // optional non-PII context, e.g. "150 employees"
}

interface WorkspaceFile {
  format: string;
  version: number;
  generatedAt: string;
  branding: Branding;
  snapshots: Snapshot[];
  savedViews?: SavedView[];
  auditLog?: AuditEntry[];
}

// Migration ladder: each entry upgrades a parsed file from version K to K+1.
// Append a new entry when CURRENT_VERSION is bumped; never edit shipped ones.
const MIGRATIONS: Record<number, (f: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 -> v2: introduce the local audit log.
  1: (f) => ({ ...f, version: 2, auditLog: Array.isArray(f.auditLog) ? f.auditLog : [] }),
};

// Validate the envelope and walk the ladder up to CURRENT_VERSION. Refuses files
// from a newer app (rather than silently mis-binding) and unknown formats.
function migrate(parsed: Record<string, unknown>): WorkspaceFile {
  if (!parsed || parsed.format !== FORMAT) {
    throw new Error("Not a valid HR Analytics workspace file.");
  }
  let v = typeof parsed.version === "number" ? parsed.version : 1;
  if (v > CURRENT_VERSION) {
    throw new Error(`This workspace was saved by a newer version of the app (format v${v}). Please update to open it.`);
  }
  let file = parsed;
  while (v < CURRENT_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`Cannot migrate this workspace from format v${v}.`);
    file = step(file);
    v = typeof file.version === "number" ? file.version : v + 1;
  }
  return file as unknown as WorkspaceFile;
}

export function saveWorkspace(
  store: DataSource,
  branding: Branding,
  now = "1970-01-01T00:00:00Z",
  savedViews: SavedView[] = [],
  auditLog: AuditEntry[] = [],
): Uint8Array {
  const payload: WorkspaceFile = {
    format: FORMAT,
    version: CURRENT_VERSION,
    generatedAt: now,
    branding,
    snapshots: store.allSnapshots(),
    savedViews,
    auditLog,
  };
  return pako.gzip(JSON.stringify(payload));
}

export function loadWorkspace(bytes: Uint8Array): {
  store: MemoryStore;
  branding: Branding;
  savedViews: SavedView[];
  auditLog: AuditEntry[];
} {
  const json = pako.ungzip(bytes, { to: "string" });
  const file = migrate(JSON.parse(json) as Record<string, unknown>);
  const store = new MemoryStore();
  for (const s of file.snapshots ?? []) store.add(s);
  return {
    store,
    branding: sanitizeBranding({ ...DEFAULT_BRANDING, ...(file.branding ?? {}) }),
    savedViews: file.savedViews ?? [],
    auditLog: file.auditLog ?? [],
  };
}
