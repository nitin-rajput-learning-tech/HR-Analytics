// Workforce what-if sandbox — forward, hypothetical headcount + cost modelling.
//
// Mirrors the snapshot-diff idea behind Movement & Forecast, but applied to
// user-authored operations instead of historical snapshots. Pure + testable:
// ops transform a Map<department, headcount>; cost is Σ headcount × per-dept
// monthly cost, where the per-dept cost comes from the payroll AGGREGATE
// (total_gross / headcount_paid) so it works without individual salaries, and
// falls back to a user-supplied assumption when no payroll is loaded.

import type { Row } from "../ingest/types";

export type ScenarioOpKind = "hire" | "cut" | "move";
export interface ScenarioOp {
  id: string;
  kind: ScenarioOpKind;
  dept: string; // hire/cut target, or the "from" dept for a move
  toDept?: string; // move destination
  count: number;
}

export interface DeptRow {
  dept: string;
  base: number;
  scenario: number;
  delta: number;
}
export interface ScenarioResult {
  baseHeadcount: number;
  scenarioHeadcount: number;
  headcountDelta: number;
  baseCost: number | null; // monthly, INR
  scenarioCost: number | null;
  costDelta: number | null;
  costBasis: "payroll" | "assumed" | "none";
  hiredCount: number; // gross external hires across the plan (moves are internal, so excluded)
  oneTimeHiringCost: number | null; // hiredCount × cost-per-hire — the upfront recruitment spend; null if no basis
  year1CashImpact: number | null; // first-year cash effect: monthly run-rate delta ×12 + one-time hiring; null if no cost basis
  depts: DeptRow[]; // every touched or non-empty department, sorted by |delta| then name
}

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Active headcount by department from an employee master.
export function activeByDept(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (str(r["employment_status"]) !== "Working") continue;
    const d = str(r["department"]) || "Unspecified";
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
}

// Per-department monthly cost from a payroll AGGREGATE sheet (total_gross /
// headcount_paid). Returns an empty map if the rows don't carry those fields.
export function costByDeptFromAggregate(rows: Row[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!rows || !rows.length) return m;
  for (const r of rows) {
    const d = str(r["department"]);
    const gross = num(r["total_gross"]);
    const heads = num(r["headcount_paid"]);
    if (d && gross > 0 && heads > 0) m.set(d, gross / heads);
  }
  return m;
}

// Apply ops to a baseline count map. Pure: clones the input, clamps so a cut or
// move can never drive a department below zero.
export function applyOps(base: Map<string, number>, ops: ScenarioOp[]): Map<string, number> {
  const out = new Map(base);
  const get = (d: string) => out.get(d) ?? 0;
  for (const op of ops) {
    const c = Math.max(0, Math.floor(op.count || 0));
    if (c === 0) continue;
    if (op.kind === "hire") {
      out.set(op.dept, get(op.dept) + c);
    } else if (op.kind === "cut") {
      out.set(op.dept, Math.max(0, get(op.dept) - c));
    } else if (op.kind === "move" && op.toDept) {
      const moved = Math.min(c, get(op.dept)); // can't move more than present
      out.set(op.dept, get(op.dept) - moved);
      out.set(op.toDept, get(op.toDept) + moved);
    }
  }
  return out;
}

export function computeScenario(
  base: Map<string, number>,
  ops: ScenarioOp[],
  costByDept: Map<string, number> | null,
  assumedCost: number | null,
  costPerHire: number | null = null,
): ScenarioResult {
  const scenario = applyOps(base, ops);

  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const baseHeadcount = sum(base);
  const scenarioHeadcount = sum(scenario);

  // Cost basis: prefer real per-dept payroll, else a flat assumption, else none.
  const hasPayroll = !!costByDept && costByDept.size > 0;
  const costBasis: ScenarioResult["costBasis"] = hasPayroll ? "payroll" : assumedCost && assumedCost > 0 ? "assumed" : "none";
  const globalAvg = hasPayroll ? [...costByDept!.values()].reduce((s, v) => s + v, 0) / costByDept!.size : assumedCost ?? 0;
  const costOf = (d: string): number => (hasPayroll ? costByDept!.get(d) ?? globalAvg : assumedCost ?? 0);
  const cost = (m: Map<string, number>): number | null => {
    if (costBasis === "none") return null;
    let total = 0;
    for (const [d, n] of m) total += n * costOf(d);
    return total;
  };
  const baseCost = cost(base);
  const scenarioCost = cost(scenario);

  // Upfront recruitment cost: only external hires incur it (moves are internal,
  // cuts none). Null when we have no cost-per-hire basis to price it.
  const hiredCount = ops.reduce((s, o) => s + (o.kind === "hire" ? Math.max(0, Math.floor(o.count || 0)) : 0), 0);
  const oneTimeHiringCost = costPerHire == null ? null : hiredCount * costPerHire;

  // First-year cash effect: 12 months of the incremental run-rate plus the upfront
  // hiring spend — the single figure a proposal leads with. Null without a cost basis.
  const costDelta = baseCost !== null && scenarioCost !== null ? scenarioCost - baseCost : null;
  const year1CashImpact = costDelta == null ? null : costDelta * 12 + (oneTimeHiringCost ?? 0);

  const allDepts = new Set<string>([...base.keys(), ...scenario.keys()]);
  const depts: DeptRow[] = [...allDepts]
    .map((dept) => ({ dept, base: base.get(dept) ?? 0, scenario: scenario.get(dept) ?? 0, delta: (scenario.get(dept) ?? 0) - (base.get(dept) ?? 0) }))
    .filter((r) => r.base > 0 || r.scenario > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.dept.localeCompare(b.dept));

  return {
    baseHeadcount,
    scenarioHeadcount,
    headcountDelta: scenarioHeadcount - baseHeadcount,
    baseCost,
    scenarioCost,
    costDelta,
    costBasis,
    hiredCount,
    oneTimeHiringCost,
    year1CashImpact,
    depts,
  };
}
