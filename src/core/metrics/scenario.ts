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
  cutCount: number; // people cut (clamped to each department's baseline) — moves don't count
  oneTimeExitCost: number | null; // severance: months × monthly cost of the cut roles; null without a cost basis or months
  year1CashImpact: number | null; // first-year cash: run-rate delta ×12 + one-time hiring + severance; null if no cost basis
  depts: DeptRow[]; // every touched or non-empty department, sorted by |delta| then name
}

const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dayMs = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
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
  severanceMonths: number = 0,
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

  // Severance: aggregate cuts per department, clamp to that department's baseline (you
  // can't sever more people than are there), and price at the dept's monthly cost ×
  // the assumed months of pay. Moves are internal and incur none.
  const cutByDept = new Map<string, number>();
  for (const op of ops) {
    if (op.kind !== "cut") continue;
    cutByDept.set(op.dept, (cutByDept.get(op.dept) ?? 0) + Math.max(0, Math.floor(op.count || 0)));
  }
  let cutCount = 0;
  let cutMonthlyCost = 0;
  for (const [d, requested] of cutByDept) {
    const actual = Math.min(requested, base.get(d) ?? 0);
    cutCount += actual;
    cutMonthlyCost += actual * costOf(d);
  }
  const oneTimeExitCost = costBasis === "none" || severanceMonths <= 0 ? null : cutMonthlyCost * severanceMonths;

  // First-year cash effect: 12 months of the incremental run-rate plus the upfront
  // one-time costs (hiring + severance) — the figure a proposal leads with. For a
  // restructuring this nets the run-rate saving against the severance paid out.
  const costDelta = baseCost !== null && scenarioCost !== null ? scenarioCost - baseCost : null;
  const year1CashImpact = costDelta == null ? null : costDelta * 12 + (oneTimeHiringCost ?? 0) + (oneTimeExitCost ?? 0);

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
    cutCount,
    oneTimeExitCost,
    year1CashImpact,
    depts,
  };
}

// --------------------------------------------------------- v2: forward projection

// Fallback when there's no data to derive an attrition rate from (~16.6% / year).
export const DEFAULT_MONTHLY_ATTRITION = 0.015;

// Data-driven default monthly attrition: trailing-12-month relieved over active,
// annualised, divided by 12. Clamped to a sane band; falls back to the default
// when the master can't support an estimate. Pure.
export function estimateMonthlyAttrition(rows: Row[] | null | undefined, asOf: string | null): number {
  if (!rows || !rows.length) return DEFAULT_MONTHLY_ATTRITION;
  const refMs = dayMs(asOf);
  const active = rows.filter((r) => str(r["employment_status"]) === "Working").length;
  if (active === 0) return DEFAULT_MONTHLY_ATTRITION;
  const recentRelieved = rows.filter((r) => {
    if (str(r["employment_status"]) !== "Relieved") return false;
    const lwd = dayMs(r["last_working_day"]);
    return refMs === null || lwd === null ? true : refMs - lwd <= 365 * 86_400_000 && lwd <= refMs;
  }).length;
  if (recentRelieved === 0) return DEFAULT_MONTHLY_ATTRITION;
  const annual = recentRelieved / active; // approximate annual attrition proportion
  return Math.min(0.2, Math.max(0.001, annual / 12));
}

export interface ProjectionPoint {
  month: number; // 0 = scenario start
  headcount: number; // rounded for display
  cost: number | null; // monthly run-rate at that headcount, INR
  cumulativeExits: number; // attrition since start (rounded)
  cumulativeBackfills: number; // backfill hires since start (rounded; 0 if not replacing)
}
export interface Projection {
  points: ProjectionPoint[];
  monthlyAttritionRate: number;
  replaceAttrition: boolean;
  endHeadcount: number;
  cumulativeExits: number;
  cumulativeBackfills: number;
  backfillCost: number | null; // cumulative recruitment cost of backfilling churn
}

// Project a scenario forward `months` under expected attrition. Two modes:
//   replaceAttrition = false → headcount declines as people leave (natural run-off)
//   replaceAttrition = true  → headcount held flat by backfilling; cost stays level
//     but recruitment spend (backfillCost) accrues — the recurring price of churn.
// Cost scales with headcount from the scenario's run-rate (so it honours whatever
// cost basis computeScenario used). Deterministic — fractional headcount internally,
// rounded only for display.
export function projectScenario(
  scenarioByDept: Map<string, number>,
  opts: { months: number; monthlyAttritionRate: number; replaceAttrition: boolean; scenarioMonthlyCost: number | null; costPerHire: number | null },
): Projection {
  const months = Math.max(0, Math.floor(opts.months || 0));
  const rate = Math.min(0.5, Math.max(0, opts.monthlyAttritionRate || 0));
  const h0 = [...scenarioByDept.values()].reduce((s, v) => s + v, 0);
  const baseCost = opts.scenarioMonthlyCost;
  const costOf = (h: number): number | null => (baseCost === null || h0 === 0 ? (baseCost === null ? null : 0) : baseCost * (h / h0));

  const points: ProjectionPoint[] = [{ month: 0, headcount: Math.round(h0), cost: costOf(h0), cumulativeExits: 0, cumulativeBackfills: 0 }];
  let h = h0;
  let cumExits = 0;
  let cumBackfills = 0;
  for (let m = 1; m <= months; m++) {
    const exits = h * rate;
    cumExits += exits;
    if (opts.replaceAttrition) cumBackfills += exits; // headcount held flat
    else h = Math.max(0, h - exits);
    points.push({ month: m, headcount: Math.round(h), cost: costOf(h), cumulativeExits: Math.round(cumExits), cumulativeBackfills: Math.round(cumBackfills) });
  }
  const backfillCost = opts.replaceAttrition && opts.costPerHire != null ? Math.round(cumBackfills) * opts.costPerHire : null;
  return {
    points,
    monthlyAttritionRate: rate,
    replaceAttrition: opts.replaceAttrition,
    endHeadcount: Math.round(h),
    cumulativeExits: Math.round(cumExits),
    cumulativeBackfills: Math.round(cumBackfills),
    backfillCost,
  };
}
