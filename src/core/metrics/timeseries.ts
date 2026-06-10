// Longitudinal trends (UP-1) — the data needed for "where is this heading", not just
// "where is it now". The store already holds time-stamped snapshots across periods;
// this reconstructs the workspace "as of" each period and lets any metric builder
// compute that period's value, producing a series. Pure + deterministic; no Date.now.

import { MemoryStore } from "../store/memoryStore";
import type { DataSource, Snapshot } from "../store/types";

export interface SeriesPoint {
  period: string; // the as-of date of the period
  value: number | null;
}

// Distinct snapshot periods (as-of dates), ascending. Optionally restrict to one
// kind (for a single-domain trend); otherwise every period across all kinds.
export function periodList(store: DataSource, kind?: string): string[] {
  const set = new Set<string>();
  for (const s of store.allSnapshots()) {
    if (kind && s.kind !== kind) continue;
    if (s.asOf) set.add(s.asOf);
  }
  return [...set].sort();
}

// A store representing the workspace "as of" a date: each kind's latest snapshot with
// asOf <= the date (so a domain's value carries forward between its uploads). This is
// what a metric builder would have seen at that point in time.
export function storeAsOf(store: DataSource, asOf: string): MemoryStore {
  const byKind = new Map<string, Snapshot>();
  for (const s of store.allSnapshots()) {
    if (!s.asOf || s.asOf > asOf) continue;
    const cur = byKind.get(s.kind);
    if (!cur || s.asOf > cur.asOf) byKind.set(s.kind, s);
  }
  const out = new MemoryStore();
  for (const s of byKind.values()) out.add(s);
  return out;
}

// Build a numeric series by computing a value from each period's reconstructed store.
// `valueAt` returns null when the metric is unavailable for that period.
export function buildSeries(
  store: DataSource,
  valueAt: (periodStore: MemoryStore, asOf: string) => number | null,
  kind?: string,
): SeriesPoint[] {
  return periodList(store, kind).map((asOf) => ({ period: asOf, value: valueAt(storeAsOf(store, asOf), asOf) }));
}

// Trim a series to the points that actually have a value (so a sparkline doesn't
// render leading/trailing gaps), preserving order. Returns [] if all null.
export function compactSeries(series: SeriesPoint[]): SeriesPoint[] {
  const withValue = series.filter((p) => p.value !== null);
  return withValue.length >= 2 ? withValue : [];
}
