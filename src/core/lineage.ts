// UP-10 — data lineage. The full provenance trail: every snapshot in the store,
// the file it came from, its period, row count and compatibility — so a CHRO (or an
// auditor) can answer "where did this number come from?". Complements the activity
// log (what ACTIONS happened) with what DATA is loaded and from where. Pure.

import type { Snapshot } from "./store/types";

export interface LineageRow {
  kind: string;
  label: string;
  periodLabel: string;
  asOf: string;
  sourceFile: string;
  rows: number;
  compatibility: string;
}

export interface Lineage {
  rows: LineageRow[]; // every snapshot, by domain then period
  summary: { snapshots: number; kinds: number; totalRows: number; periodFrom: string | null; periodTo: string | null; full: number; partial: number };
}

export function buildLineage(snapshots: Snapshot[], labelOf: (kind: string) => string = (k) => k): Lineage {
  const rows: LineageRow[] = snapshots
    .map((s) => ({ kind: s.kind, label: labelOf(s.kind), periodLabel: s.periodLabel ?? s.asOf, asOf: s.asOf, sourceFile: s.sourceFile, rows: s.rows.length, compatibility: s.compatibility }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.asOf.localeCompare(b.asOf));
  const asOfs = snapshots.map((s) => s.asOf).filter(Boolean).sort();
  return {
    rows,
    summary: {
      snapshots: rows.length,
      kinds: new Set(rows.map((r) => r.kind)).size,
      totalRows: rows.reduce((s, r) => s + r.rows, 0),
      periodFrom: asOfs[0] ?? null,
      periodTo: asOfs.length ? asOfs[asOfs.length - 1] : null,
      full: rows.filter((r) => r.compatibility === "full").length,
      partial: rows.filter((r) => r.compatibility !== "full").length,
    },
  };
}
