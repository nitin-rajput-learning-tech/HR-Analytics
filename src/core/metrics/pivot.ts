// BUILD-9 — explore / pivot builder. A self-serve "group-by × measure" over the
// employee master, so a user can answer ad-hoc questions ("headcount by location",
// "avg tenure by job title") without a pre-built dashboard. Pure + deterministic;
// the UI renders the result as a table + chart.

import type { Row } from "../ingest/types";

export type Agg = "count" | "avg" | "min" | "max";
export const TENURE_MEASURE = "__tenure_years__";
export const COUNT_MEASURE = "__count__";

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const dayMs = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

export interface PivotDimension { field: string; label: string; }
export interface PivotMeasure { field: string; label: string; aggs: Agg[]; unit: string; }
export interface PivotRow { group: string; value: number; n: number; }
export interface PivotResult { rows: PivotRow[]; agg: Agg; measureLabel: string; unit: string; total: number | null; }

// Curated, meaningful employee dimensions (avoids high-cardinality ids / dates).
const DIM_FIELDS: [string, string][] = [
  ["department", "Department"],
  ["sub_department", "Sub-department"],
  ["gender", "Gender"],
  ["current_city", "Location"],
  ["legal_entity", "Legal entity"],
  ["employment_status", "Status"],
  ["job_title", "Job title"],
  ["reporting_manager", "Reporting manager"],
  ["l2_manager", "L2 manager"],
];

// Dimensions actually present (≥1 non-empty value) in the data.
export function pivotDimensions(rows: Row[]): PivotDimension[] {
  return DIM_FIELDS.filter(([f]) => rows.some((r) => str(r[f]) !== "")).map(([field, label]) => ({ field, label }));
}

// Measures: headcount always; average/min/max tenure when date-joined is present.
export function pivotMeasures(rows: Row[]): PivotMeasure[] {
  const out: PivotMeasure[] = [{ field: COUNT_MEASURE, label: "Headcount", aggs: ["count"], unit: "" }];
  if (rows.some((r) => str(r["date_joined"]) !== "")) out.push({ field: TENURE_MEASURE, label: "Tenure", aggs: ["avg", "min", "max"], unit: "yrs" });
  return out;
}

function aggregate(values: number[], agg: Agg): number {
  if (!values.length) return 0;
  if (agg === "min") return Math.min(...values);
  if (agg === "max") return Math.max(...values);
  const sum = values.reduce((s, v) => s + v, 0);
  return agg === "avg" ? sum / values.length : sum;
}

export interface PivotOptions {
  groupBy: string;
  measureField: string; // COUNT_MEASURE | TENURE_MEASURE
  agg: Agg;
  asOf?: string | null;
  topN?: number;
}

export function pivotTable(rows: Row[], opts: PivotOptions): PivotResult {
  const refMs = dayMs(opts.asOf ?? null);
  const groups = new Map<string, number[]>(); // group → measure values (for non-count)
  const counts = new Map<string, number>();
  const r1 = (x: number) => Math.round(x * 10) / 10;

  for (const r of rows) {
    const g = str(r[opts.groupBy]) || "Unspecified";
    counts.set(g, (counts.get(g) ?? 0) + 1);
    if (opts.measureField === TENURE_MEASURE) {
      const j = dayMs(r["date_joined"]);
      if (refMs !== null && j !== null) {
        const arr = groups.get(g) ?? [];
        arr.push((refMs - j) / 86_400_000 / 365);
        groups.set(g, arr);
      }
    }
  }

  const isCount = opts.measureField === COUNT_MEASURE || opts.agg === "count";
  const out: PivotRow[] = [...counts.entries()].map(([group, n]) => ({
    group,
    n,
    value: isCount ? n : r1(aggregate(groups.get(group) ?? [], opts.agg)),
  }));
  out.sort((a, b) => b.value - a.value || a.group.localeCompare(b.group));

  const unit = isCount ? "" : "yrs";
  const measureLabel = isCount ? "Headcount" : `${opts.agg === "avg" ? "Avg" : opts.agg === "min" ? "Min" : "Max"} tenure`;
  // Total: a meaningful grand figure — sum for counts, overall aggregate otherwise.
  let total: number | null = null;
  if (isCount) total = out.reduce((s, r) => s + r.value, 0);
  else if (opts.measureField === TENURE_MEASURE) {
    const all = [...groups.values()].flat();
    total = all.length ? r1(aggregate(all, opts.agg)) : null;
  }

  return { rows: out.slice(0, opts.topN ?? 50), agg: isCount ? "count" : opts.agg, measureLabel, unit, total };
}
