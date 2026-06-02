// Demo dataset access. The tool ships in "demo mode" — a fully populated sample
// workspace so a first-time user sees the product working before uploading any
// data. The bytes are embedded at build time (see scripts/embed-demo.mjs) and
// are the exact gzipped-workspace format loadWorkspace() consumes, so demo mode
// is just a normal workspace load from in-memory bytes (no network, no fetch).
//
// Crucially, demo data is NEVER persisted to IndexedDB — only the user's own
// data is. That keeps "is there a saved workspace?" a clean proxy for
// "demo vs live" with no extra flag to keep in sync.

import { DEMO_WORKSPACE_B64 } from "./demoWorkspace";

let cached: Uint8Array | null = null;

/** The embedded demo workspace as gzipped bytes (decoded once, then cached). */
export function demoWorkspaceBytes(): Uint8Array {
  if (cached) return cached;
  const bin = atob(DEMO_WORKSPACE_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  cached = out;
  return out;
}
