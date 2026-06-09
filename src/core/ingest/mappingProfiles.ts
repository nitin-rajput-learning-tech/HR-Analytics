// Saved column-mapping profiles — remember how a given export shape was mapped so the
// next upload of the same shape auto-applies it (no re-mapping each month). Stored
// locally in localStorage, keyed by dataset kind + header shape. Offline + private;
// nothing leaves the device. The pure helpers are testable; the storage I/O is thin.

import { normalizeHeader } from "../datasets";

const KEY = "hra.mappingProfiles.v1";

export interface MappingProfile {
  kind: string;
  headers: string[]; // the file headers this mapping was built for
  mapping: Record<string, string | null>; // verbatim header → canonical field (null = ignore)
  savedAt: string;
}

// A profile applies to a new file when every header it was built for is present in the
// file (compared normalised), i.e. the same export shape — extra columns are fine.
export function profileApplies(profileHeaders: string[], fileHeaders: string[]): boolean {
  if (!profileHeaders.length) return false;
  const have = new Set(fileHeaders.map(normalizeHeader));
  return profileHeaders.every((h) => have.has(normalizeHeader(h)));
}

// Re-key a saved mapping onto a new file's *verbatim* headers (matching by normalised
// form), so the override still applies even if whitespace/case drifted since it was
// saved. Returns header(verbatim)→field for headers the profile recognises.
export function resolveProfileForFile(profile: MappingProfile, fileHeaders: string[]): Record<string, string | null> {
  const byNorm = new Map<string, string | null>();
  for (const [h, field] of Object.entries(profile.mapping)) byNorm.set(normalizeHeader(h), field ?? null);
  const out: Record<string, string | null> = {};
  for (const h of fileHeaders) {
    const f = byNorm.get(normalizeHeader(h));
    if (f !== undefined) out[h] = f;
  }
  return out;
}

function sameShape(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const na = a.map(normalizeHeader).sort();
  const nb = b.map(normalizeHeader).sort();
  return na.every((h, i) => h === nb[i]);
}

type Store = Record<string, MappingProfile[]>; // kind → profiles (most recent last)

function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

// Find the most recent saved profile for this kind whose shape matches the file.
export function findMappingProfile(kind: string, fileHeaders: string[]): MappingProfile | null {
  const list = readStore()[kind] ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (profileApplies(list[i].headers, fileHeaders)) return list[i];
  return null;
}

// Save (or replace the same-shape) mapping profile for this kind. Capped at 10 per kind.
export function saveMappingProfile(kind: string, headers: string[], mapping: Record<string, string | null>, nowIso: string): void {
  try {
    const s = readStore();
    const list = (s[kind] ?? []).filter((p) => !sameShape(p.headers, headers));
    list.push({ kind, headers, mapping, savedAt: nowIso });
    s[kind] = list.slice(-10);
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable / full — non-fatal, mapping just won't be remembered */
  }
}
