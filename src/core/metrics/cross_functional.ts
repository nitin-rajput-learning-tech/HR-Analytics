// Cross-functional intelligence — where the suite earns its keep.
//
// Single-domain dashboards each tell part of the story. This module joins them
// to the employee master to surface what no individual team sees:
//   * Compound risk — departments simultaneously high-attrition, under-trained
//     and behind on reviews. Any one signal is survivable; the overlap compounds.
//   * Attrition economics — exits translated into rupees via replacement cost.
//   * Regrettable attrition — high-performer / high-potential leavers.
//
// All joins key on employee_number against the employee master (which carries
// the department mapping). Everything degrades gracefully when a domain is
// absent: signals with no data are dropped and the remaining weights renormalise.
//
// NOTE: attrition + backfill in the Python suite are derived from the employee
// events model (joiner/leaver diffs). That analytics layer is not yet ported to
// TS, so attrition here is driven by optional `leaverEvents` input and backfill
// is held as a hook for the Phase-5 employee-events port.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout, emptyDomain } from "./base";

const KIND = "cross_functional";
const LABEL = "Cross-Functional Risk";

// Weighting of each normalised signal. Signals with no data are dropped and the
// remaining weights renormalised.
const WEIGHTS: Record<string, number> = { attrition: 0.35, coverage_gap: 0.2, review_gap: 0.2, backfill: 0.25 };
const MIN_DEPT_ACTIVE = 8;
const SIGNAL_KEYS = ["attrition", "coverage_gap", "review_gap", "backfill"] as const;
type SignalKey = (typeof SIGNAL_KEYS)[number];

export interface LeaverEvent {
  employee_number: string | number;
  event_date: string;
  department?: string | null;
}

export interface CrossFunctionalInput {
  employeeRows?: Row[] | null;
  pmsRows?: Row[] | null;
  ldEnrollmentRows?: Row[] | null;
  payrollAggregateRows?: Row[] | null;
  taRows?: Row[] | null;
  leaverEvents?: LeaverEvent[] | null;
  asOf?: string | null;
}

const emp = (r: Row | LeaverEvent): string => String(r["employee_number"] ?? "");
const deptOf = (r: Row): string => String(r["department"] ?? "Unspecified") || "Unspecified";
const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function compute(input: CrossFunctionalInput): DomainMetrics {
  const { employeeRows, pmsRows, ldEnrollmentRows, payrollAggregateRows, taRows, leaverEvents, asOf } = input;
  if (!employeeRows || employeeRows.length === 0 || !employeeRows.some((r) => "department" in r)) {
    return emptyDomain(KIND, LABEL, "the workforce");
  }

  const active = employeeRows.filter((r) => String(r["employment_status"] ?? "") === "Working");
  if (active.length === 0) return emptyDomain(KIND, LABEL, "the workforce");

  const deptActive = new Map<string, number>();
  const empDept = new Map<string, string>();
  for (const r of active) {
    const d = deptOf(r);
    deptActive.set(d, (deptActive.get(d) ?? 0) + 1);
    empDept.set(emp(r), d);
  }
  const eligible = [...deptActive.entries()].filter(([, n]) => n >= MIN_DEPT_ACTIVE).map(([d]) => d);

  const signals = new Map<string, Partial<Record<SignalKey, number>>>();
  for (const d of eligible) signals.set(d, {});
  const have: Record<SignalKey, boolean> = { attrition: false, coverage_gap: false, review_gap: false, backfill: false };
  const setSig = (d: string, k: SignalKey, v: number) => {
    const s = signals.get(d);
    if (s) s[k] = v;
  };

  const ref = asOf ? new Date(Date.parse(asOf)) : new Date();
  const cutoff12 = new Date(ref.getTime());
  cutoff12.setMonth(cutoff12.getMonth() - 12);

  // 1) Attrition risk by department (from optional leaver events carrying dept).
  if (leaverEvents && leaverEvents.length) {
    const leavers12mByDept = new Map<string, number>();
    let anyDept = false;
    for (const e of leaverEvents) {
      const t = Date.parse(e.event_date);
      if (Number.isNaN(t)) continue;
      if (t > cutoff12.getTime() && t <= ref.getTime()) {
        const d = e.department != null ? String(e.department) : empDept.get(emp(e));
        if (d) {
          leavers12mByDept.set(d, (leavers12mByDept.get(d) ?? 0) + 1);
          anyDept = true;
        }
      }
    }
    if (anyDept) {
      for (const d of eligible) {
        const lv = leavers12mByDept.get(d) ?? 0;
        const base = (deptActive.get(d) ?? 0) + lv;
        setSig(d, "attrition", base ? lv / base : 0);
      }
      have.attrition = true;
    }
  }

  // 2) Training coverage gap by department (L&D ↔ master).
  if (ldEnrollmentRows && ldEnrollmentRows.length && ldEnrollmentRows.some((r) => "employee_number" in r)) {
    const trainedByDept = new Map<string, Set<string>>();
    let joined = false;
    for (const r of ldEnrollmentRows) {
      const d = empDept.get(emp(r));
      if (d === undefined) continue;
      joined = true;
      const set = trainedByDept.get(d) ?? new Set<string>();
      set.add(emp(r));
      trainedByDept.set(d, set);
    }
    if (joined) {
      for (const d of eligible) {
        const trained = trainedByDept.get(d)?.size ?? 0;
        const cov = deptActive.get(d) ? trained / (deptActive.get(d) as number) : 0;
        setSig(d, "coverage_gap", Math.max(0, 1 - cov));
      }
      have.coverage_gap = true;
    }
  }

  // 3) Review-completion gap by department (PMS ↔ master).
  if (
    pmsRows &&
    pmsRows.length &&
    pmsRows.some((r) => "employee_number" in r) &&
    pmsRows.some((r) => "manager_review_done" in r)
  ) {
    const agg = new Map<string, { done: number; total: number }>();
    let joined = false;
    for (const r of pmsRows) {
      const d = empDept.get(emp(r));
      if (d === undefined) continue;
      joined = true;
      const a = agg.get(d) ?? { done: 0, total: 0 };
      a.total += 1;
      if (r["manager_review_done"] === true) a.done += 1;
      agg.set(d, a);
    }
    if (joined) {
      for (const d of eligible) {
        const a = agg.get(d);
        const rate = a && a.total ? a.done / a.total : 0;
        setSig(d, "review_gap", Math.max(0, 1 - rate));
      }
      have.review_gap = true;
    }
  }

  // Compound score: normalise each present signal across departments, weight, sum.
  const activeWeights: Partial<Record<SignalKey, number>> = {};
  let weightTotal = 0;
  for (const k of SIGNAL_KEYS) {
    if (have[k]) {
      activeWeights[k] = WEIGHTS[k];
      weightTotal += WEIGHTS[k];
    }
  }
  if (weightTotal === 0) weightTotal = 1;

  interface ScoreRow {
    dept: string;
    active: number;
    attritionPct: number | null;
    trainedPct: number | null;
    reviewsPct: number | null;
    score: number;
  }
  const scoreRows: ScoreRow[] = eligible.map((dept) => {
    let score = 0;
    for (const k of SIGNAL_KEYS) {
      if (activeWeights[k] != null) score += ((activeWeights[k] as number) / weightTotal) * signalScore(signals, k, dept);
    }
    const s = signals.get(dept) ?? {};
    return {
      dept,
      active: deptActive.get(dept) ?? 0,
      attritionPct: have.attrition ? round1((s.attrition ?? 0) * 100) : null,
      trainedPct: have.coverage_gap ? round1((1 - (s.coverage_gap ?? 1)) * 100) : null,
      reviewsPct: have.review_gap ? round1((1 - (s.review_gap ?? 1)) * 100) : null,
      score: round1(score * 100),
    };
  });
  scoreRows.sort((a, b) => b.score - a.score);

  const kpis: MetricKPI[] = [];
  const charts: ChartSpec[] = [];
  const tables: MetricTable[] = [];
  const watchouts: MetricWatchout[] = [];

  const highRisk = scoreRows.filter((r) => r.score >= 50);
  kpis.push({
    label: "Compound-Risk Depts",
    value: N.humanizeInt(highRisk.length),
    hint: `score ≥ 50 of ${scoreRows.length} departments`,
  });

  if (scoreRows.length) {
    const columns = ["Department", "Active"];
    if (have.attrition) columns.push("Attrition %");
    if (have.coverage_gap) columns.push("Trained %");
    if (have.review_gap) columns.push("Reviews %");
    columns.push("Risk score");
    const tableRows = scoreRows.slice(0, 12).map((r) => {
      const row: (string | number)[] = [r.dept, r.active];
      if (have.attrition) row.push(r.attritionPct ?? 0);
      if (have.coverage_gap) row.push(r.trainedPct ?? 0);
      if (have.review_gap) row.push(r.reviewsPct ?? 0);
      row.push(r.score);
      return row;
    });
    tables.push({
      title: "Compound risk by department",
      caption:
        "Each department scored 0–100 on ABSOLUTE thresholds across attrition, training coverage and review completion (independent of other departments). Higher = more compounded people-risk.",
      columns,
      rows: tableRows,
    });
    charts.push({
      title: "Compound risk score",
      caption: "Top departments by combined people-risk.",
      kind: "barh",
      labels: scoreRows.slice(0, 10).map((r) => r.dept),
      values: scoreRows.slice(0, 10).map((r) => r.score),
      drill: "department",
    });
    for (const row of highRisk.slice(0, 3)) {
      const drivers: string[] = [];
      if (row.attritionPct != null && row.attritionPct >= 10) drivers.push(`${row.attritionPct}% attrition risk`);
      if (row.trainedPct != null && row.trainedPct < 40) drivers.push(`only ${row.trainedPct}% trained`);
      if (row.reviewsPct != null && row.reviewsPct < 70) drivers.push(`reviews at ${row.reviewsPct}%`);
      watchouts.push({
        severity: row.score >= 65 ? "high" : "medium",
        title: `Compounding risk in ${row.dept}`,
        detail: `Risk score ${row.score}/100 — ${N.joinClauses(drivers) || "multiple weak signals"}.`,
        actionHint: "Run a joint HRBP + manager review; sequence retention, hiring and training together.",
        owner: "HRBP",
      });
    }
  }

  // Attrition economics.
  const costPerHire = estimateReplacementCost(taRows, payrollAggregateRows);
  const leavers12m = recentLeavers(leaverEvents, ref, cutoff12);
  if (costPerHire && leavers12m) {
    const totalCost = costPerHire * leavers12m;
    kpis.push({
      label: "Est. Attrition Cost (12m)",
      value: N.humanizeMoneyInr(totalCost),
      hint: `${leavers12m} exits × ${N.humanizeMoneyInr(costPerHire)}/replacement`,
    });
    if (totalCost >= 1_00_00_000) {
      watchouts.push({
        severity: "medium",
        title: "Attrition is materially expensive",
        detail: `Trailing-12-month exits represent an estimated ${N.humanizeMoneyInr(totalCost)} in replacement cost.`,
        actionHint: "Quantify the ROI of targeted retention against this number when prioritising spend.",
        owner: "HR Leadership",
      });
    }
  }

  // Regrettable attrition.
  const regrettable = regrettableExits(pmsRows, leaverEvents, ref, cutoff12, empDept);
  if (regrettable !== null) {
    kpis.push({
      label: "Regrettable Exits",
      value: N.humanizeInt(regrettable.rows.length),
      hint: "High-performer / high-potential leavers (12m)",
    });
    if (regrettable.rows.length) {
      tables.push(regrettable);
      if (regrettable.rows.length >= 3) {
        watchouts.push({
          severity: "high",
          title: "Losing high performers",
          detail: `${regrettable.rows.length} high-performer/high-potential employees have exited in the last 12 months.`,
          actionHint: "Run stay-interviews for remaining top talent; review comp and growth paths in affected teams.",
          owner: "HR Leadership",
        });
      }
    }
  }

  const blurb =
    N.joinClauses([
      `${highRisk.length} departments show compounding people-risk`,
      costPerHire && leavers12m ? `an estimated ${N.humanizeMoneyInr(costPerHire * leavers12m)} in 12-month attrition cost` : "",
      regrettable && regrettable.rows.length ? `${regrettable.rows.length} regrettable exits` : "",
    ]) + ".";

  return { kind: KIND, label: LABEL, hasData: true, blurb, kpis, charts, tables, watchouts };
}

// Attrition economics as RAW numbers (compute() emits only a formatted KPI string).
// Reused by HR Brain to attach a value-at-stake to retention initiatives. Pure.
export function attritionEconomics(input: CrossFunctionalInput): { costPerHire: number | null; leavers12m: number; totalCost: number | null } {
  const ref = input.asOf ? new Date(Date.parse(input.asOf)) : new Date();
  const cutoff12 = new Date(ref.getTime());
  cutoff12.setMonth(cutoff12.getMonth() - 12);
  const costPerHire = estimateReplacementCost(input.taRows, input.payrollAggregateRows);
  const leavers12m = recentLeavers(input.leaverEvents, ref, cutoff12);
  return { costPerHire, leavers12m, totalCost: costPerHire && leavers12m ? costPerHire * leavers12m : null };
}

// --------------------------------------------------------------------------- helpers

const round1 = (x: number): number => Math.round(x * 10) / 10;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// A 12-month attrition proportion at/above this is treated as maximum risk.
const ATTRITION_REF = 0.3;

// Absolute 0..1 risk for one signal — independent of the OTHER departments, so a
// dept's score reflects its own health rather than its rank among peers.
// (The previous min-max scaling made every set produce a 0 and a 1 regardless
// of absolute severity, and a dept's score shifted whenever the set of
// departments changed — e.g. under a filter. coverage_gap and review_gap are
// already absolute risks in [0,1]; attrition is scaled against a fixed reference.)
function signalScore(
  signals: Map<string, Partial<Record<SignalKey, number>>>,
  key: SignalKey,
  dept: string,
): number {
  const v = signals.get(dept)?.[key] ?? 0;
  return key === "attrition" ? clamp01(v / ATTRITION_REF) : clamp01(v);
}

function estimateReplacementCost(taRows?: Row[] | null, payrollAgg?: Row[] | null): number | null {
  // Prefer real cost-per-hire from TA (total cost / joined, where both present).
  if (taRows && taRows.length && taRows.some((r) => "cost" in r) && taRows.some((r) => "joined" in r)) {
    let cost = 0;
    let joined = 0;
    for (const r of taRows) {
      cost += toNum(r["cost"]);
      joined += toNum(r["joined"]);
    }
    if (cost > 0 && joined > 0) return cost / joined;
  }
  // Fallback proxy: ~2 months of average monthly cost-per-head (hiring + ramp).
  if (payrollAgg && payrollAgg.length) {
    let gross = 0;
    let heads = 0;
    for (const r of payrollAgg) {
      gross += toNum(r["total_gross"]);
      heads += toNum(r["headcount_paid"]);
    }
    if (gross > 0 && heads > 0) return (gross / heads) * 2.0;
  }
  return null;
}

function recentLeavers(events: LeaverEvent[] | null | undefined, ref: Date, cutoff: Date): number {
  if (!events || !events.length) return 0;
  let n = 0;
  for (const e of events) {
    const t = Date.parse(e.event_date);
    if (!Number.isNaN(t) && t > cutoff.getTime() && t <= ref.getTime()) n += 1;
  }
  return n;
}

function inferScaleMax(rows: Row[]): number {
  const r = rows.find((x) => x["rating_scale"] != null);
  if (r) {
    const digits = String(r["rating_scale"])
      .replace(/-/g, " ")
      .split(/\s+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    if (digits.length) return Math.max(...digits);
  }
  return 5;
}

function regrettableExits(
  pmsRows: Row[] | null | undefined,
  events: LeaverEvent[] | null | undefined,
  ref: Date,
  cutoff: Date,
  empDept: Map<string, string>,
): MetricTable | null {
  if (!pmsRows || !pmsRows.length || !pmsRows.some((r) => "employee_number" in r)) return null;
  if (!events || !events.length) return null;

  const scaleMax = inferScaleMax(pmsRows);
  const isHigh = (r: Row): boolean => {
    const rating = Number(r["final_rating"]);
    const topRating = Number.isFinite(rating) && rating >= 0.8 * scaleMax;
    const hiPotential = String(r["potential_rating"] ?? "").toLowerCase() === "high";
    return topRating || hiPotential;
  };
  const highByEmp = new Map<string, Row>();
  for (const r of pmsRows) if (isHigh(r)) highByEmp.set(emp(r), r);
  if (highByEmp.size === 0) {
    return { title: "Regrettable attrition", caption: "High-performing or high-potential employees who have left.", columns: ["Employee", "Department", "Rating", "Potential"], rows: [] };
  }

  const recentLeaverIds = new Set<string>();
  for (const e of events) {
    const t = Date.parse(e.event_date);
    if (!Number.isNaN(t) && t > cutoff.getTime() && t <= ref.getTime()) recentLeaverIds.add(emp(e));
  }

  const rows: (string | number)[][] = [];
  for (const [id, r] of highByEmp) {
    if (!recentLeaverIds.has(id)) continue;
    rows.push([id, empDept.get(id) ?? "—", r["final_rating"] != null ? Number(r["final_rating"]) : "—", String(r["potential_rating"] ?? "—")]);
  }
  return {
    title: "Regrettable attrition",
    caption: "High-performing or high-potential employees who have left.",
    columns: ["Employee", "Department", "Rating", "Potential"],
    rows: rows.slice(0, 15),
  };
}
