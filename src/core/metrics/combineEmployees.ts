// Combine multiple employee_master snapshots into one "most complete" current
// roster. Real orgs feed us TWO sources for the same population: an automated
// HRMS export (Keka — fresh, system-of-record, but thin) and an HR-maintained
// snapshot (richer: gender, status, leavers — but updated by hand). Neither alone
// is complete, so we merge them.
//
// Merge rule: UNION of employees by employee_number; each field takes the value
// from the MOST RECENT snapshot (by as-of) that has a non-empty value for that
// employee. The freshest source wins per field; blanks are backfilled from
// whichever source has the data (e.g. gender from the HR snapshot onto the Keka
// roster; leavers + exit dates from whichever source tracks them).
//
// To stay a NO-OP for homogeneous data (the demo's monthly snapshots, or a single
// upload), the merge activates ONLY when an older snapshot supplies a field the
// latest snapshot is entirely missing — i.e. the sources have *different schemas*.
// Same-schema snapshots are left alone as separate periods for trend analysis.

import type { Row } from "../ingest/types";
import type { DataSource, Snapshot } from "../store/types";

const str = (v: unknown) => String(v ?? "").trim();

function fieldsWithData(rows: Row[]): Set<string> {
  const s = new Set<string>();
  for (const r of rows) for (const k in r) if (str(r[k]) !== "") s.add(k);
  return s;
}

export interface CombineResult {
  rows: Row[];
  combined: boolean; // true when ≥2 heterogeneous sources were actually merged
  sources: number; // snapshots considered
  addedFields: string[]; // fields the latest snapshot lacked, filled from older sources
}

export function combineEmployeeSnapshots(snaps: { asOf: string; rows: Row[] }[]): CombineResult {
  const ordered = [...snaps].sort((a, b) => a.asOf.localeCompare(b.asOf)); // ascending by as-of
  if (ordered.length === 0) return { rows: [], combined: false, sources: 0, addedFields: [] };
  const latest = ordered[ordered.length - 1];
  if (ordered.length === 1) return { rows: latest.rows, combined: false, sources: 1, addedFields: [] };

  const latestFields = fieldsWithData(latest.rows);
  const olderFields = new Set<string>();
  for (let i = 0; i < ordered.length - 1; i++) for (const f of fieldsWithData(ordered[i].rows)) olderFields.add(f);
  const addedFields = [...olderFields].filter((f) => !latestFields.has(f)).sort();
  if (addedFields.length === 0) {
    // Same schema across snapshots → keep them as separate periods (don't merge).
    return { rows: latest.rows, combined: false, sources: ordered.length, addedFields: [] };
  }

  // Merge: union by employee_number, freshest non-empty value per field. Walking
  // newest→oldest means the first writer of each (id, field) is the freshest, and
  // the current roster's employees lead the row order (leavers from older sources
  // follow).
  const byId = new Map<string, Row>();
  const order: string[] = [];
  for (let i = ordered.length - 1; i >= 0; i--) {
    for (const r of ordered[i].rows) {
      const id = str(r["employee_number"]) || str(r["full_name"]);
      if (!id) continue;
      let merged = byId.get(id);
      if (!merged) {
        merged = {};
        byId.set(id, merged);
        order.push(id);
      }
      for (const k in r) {
        if (str(r[k]) !== "" && (merged[k] === undefined || str(merged[k]) === "")) merged[k] = r[k];
      }
    }
  }
  return { rows: order.map((id) => byId.get(id)!), combined: true, sources: ordered.length, addedFields };
}

export type CombinedSnapshot = Snapshot & { combinedSources: number; addedFields: string[] };

// The combined "current" employee snapshot from the store (or null). When the
// merge is a no-op this is just the latest snapshot, so it's a safe drop-in for
// store.getLatest("employee_master").
export function combinedEmployeeSnapshot(store: DataSource): CombinedSnapshot | null {
  const snaps = store.listByKind("employee_master");
  if (!snaps.length) return null;
  const latest = snaps[snaps.length - 1];
  const res = combineEmployeeSnapshots(snaps);
  return { ...latest, rows: res.rows, combinedSources: res.combined ? res.sources : 1, addedFields: res.addedFields };
}

// Employee snapshots viewed as time periods. When two heterogeneous sources were
// merged, they describe ONE period (not a trend), so return a single combined
// period — this stops month-over-month/movement from comparing mismatched sources.
// Otherwise the raw snapshots are genuine periods for trend analysis.
export function employeePeriods(store: DataSource): Snapshot[] {
  const snaps = store.listByKind("employee_master");
  if (snaps.length < 2) return snaps;
  const res = combineEmployeeSnapshots(snaps);
  if (!res.combined) return snaps;
  const latest = snaps[snaps.length - 1];
  return [{ ...latest, rows: res.rows }];
}
