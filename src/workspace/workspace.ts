import pako from "pako";
import { MemoryStore } from "../core/store/memoryStore";
import type { DataSource, Snapshot } from "../core/store/types";
import { DEFAULT_BRANDING, type Branding } from "../branding/branding";

const FORMAT = "hr-analytics-workspace";

interface WorkspaceFile {
  format: string;
  version: 1;
  generatedAt: string;
  branding: Branding;
  snapshots: Snapshot[];
}

export function saveWorkspace(store: DataSource, branding: Branding, now = "1970-01-01T00:00:00Z"): Uint8Array {
  const payload: WorkspaceFile = {
    format: FORMAT,
    version: 1,
    generatedAt: now,
    branding,
    snapshots: store.allSnapshots(),
  };
  return pako.gzip(JSON.stringify(payload));
}

export function loadWorkspace(bytes: Uint8Array): { store: MemoryStore; branding: Branding } {
  const json = pako.ungzip(bytes, { to: "string" });
  const parsed = JSON.parse(json) as WorkspaceFile;
  if (parsed.format !== FORMAT) throw new Error("Not a valid HR Analytics workspace file.");
  const store = new MemoryStore();
  for (const s of parsed.snapshots ?? []) store.add(s);
  return { store, branding: { ...DEFAULT_BRANDING, ...(parsed.branding ?? {}) } };
}
