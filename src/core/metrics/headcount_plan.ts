// BUILD-5 — Headcount planning. Compares ACTUAL active headcount (from the employee
// master) against the approved PLAN and BUDGET (headcount_plan dataset) per
// department: hiring-vs-plan (open roles / over-plan), fill rate, budget headroom,
// and — when a payroll aggregate is loaded — cost-vs-budget. A DomainMetrics, so it
// renders via DomainView and flows to the newsletter. Pure + deterministic.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";
import { activeByDept, costByDeptFromAggregate } from "./scenario";

const KIND = "headcount_plan";
const LABEL = "Headcount Plan";

const str = (v: unknown) => String(v ?? "").trim();
const toInt = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export interface HeadcountPlanInput {
  employeeRows: Row[];
  planRows?: Row[] | null;
  payrollAggregateRows?: Row[] | null;
}

interface PlanRow {
  dept: string;
  actual: number;
  planned: number;
  budget: number;
  vsPlan: number; // actual − planned (negative = under plan / open roles)
  fillPct: number | null; // actual / planned
  headroom: number; // budget − actual (room to hire within budget)
}

export function buildHeadcountPlan(input: HeadcountPlanInput): DomainMetrics {
  const empty = (msg: string): DomainMetrics => ({ kind: KIND, label: LABEL, hasData: false, blurb: msg, kpis: [], charts: [], tables: [], watchouts: [] });
  const planRows = input.planRows ?? [];
  if (!planRows.length || !planRows.some((r) => "planned_hc" in r || "budget_hc" in r)) {
    return empty("Upload an approved Headcount Plan (period · department · planned/budget headcount) to see hiring-vs-plan and cost-vs-budget variance.");
  }

  const actual = activeByDept(input.employeeRows);
  const planned = new Map<string, number>();
  const budget = new Map<string, number>();
  for (const r of planRows) {
    const d = str(r["department"]) || "Unspecified";
    planned.set(d, (planned.get(d) ?? 0) + toInt(r["planned_hc"]));
    budget.set(d, (budget.get(d) ?? 0) + toInt(r["budget_hc"]));
  }

  const depts = [...new Set([...actual.keys(), ...planned.keys(), ...budget.keys()])];
  const rows: PlanRow[] = depts
    .map((dept) => {
      const a = actual.get(dept) ?? 0;
      const p = planned.get(dept) ?? 0;
      const b = budget.get(dept) ?? 0;
      return { dept, actual: a, planned: p, budget: b, vsPlan: a - p, fillPct: p > 0 ? (a / p) * 100 : null, headroom: b - a };
    })
    .filter((r) => r.planned > 0 || r.budget > 0 || r.actual > 0)
    .sort((a, b) => a.vsPlan - b.vsPlan || a.dept.localeCompare(b.dept)); // most under-plan first

  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const openToPlan = rows.reduce((s, r) => s + Math.max(0, r.planned - r.actual), 0);
  const overPlan = rows.reduce((s, r) => s + Math.max(0, r.actual - r.planned), 0);
  const overallFill = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : null;

  const kpis: MetricKPI[] = [
    { label: "Actual vs Plan", value: `${N.humanizeInt(totalActual)} / ${N.humanizeInt(totalPlanned)}`, hint: overallFill === null ? "no plan set" : `${N.formatPct(overallFill)} filled` },
    { label: "Open to Plan", value: N.humanizeInt(openToPlan), hint: "roles to hire to reach plan" },
    { label: "Over Plan", value: N.humanizeInt(overPlan), hint: "headcount above plan" },
    { label: "Budget Headroom", value: N.humanizeInt(totalBudget - totalActual), hint: `${N.humanizeInt(totalBudget)} budget vs ${N.humanizeInt(totalActual)} actual` },
  ];

  // Cost-vs-budget when a payroll aggregate prices each department.
  const costByDept = costByDeptFromAggregate(input.payrollAggregateRows);
  if (costByDept.size > 0) {
    const globalAvg = [...costByDept.values()].reduce((s, v) => s + v, 0) / costByDept.size;
    const costOf = (d: string) => costByDept.get(d) ?? globalAvg;
    const actualCost = rows.reduce((s, r) => s + r.actual * costOf(r.dept), 0);
    const budgetCost = rows.reduce((s, r) => s + r.budget * costOf(r.dept), 0);
    const variance = actualCost - budgetCost; // negative = under budget
    kpis.push({ label: "Cost vs Budget", value: (variance >= 0 ? "+" : "−") + N.humanizeMoneyInr(Math.abs(variance)) + "/mo", hint: variance > 0 ? "over budget run-rate" : "within budget run-rate" });
  }

  const charts: ChartSpec[] = [
    {
      title: "Headcount vs plan by department",
      caption: "Actual minus planned headcount. Negative = open roles to fill; positive = over plan.",
      kind: "barh",
      labels: rows.slice(0, 14).map((r) => r.dept),
      values: rows.slice(0, 14).map((r) => r.vsPlan),
      drill: "department",
    },
  ];

  const tables: MetricTable[] = [
    {
      title: "Headcount plan vs actual",
      caption: "Active headcount against approved plan and budget, by department.",
      columns: ["Department", "Actual", "Planned", "Budget", "vs Plan", "Fill %", "Budget headroom"],
      rows: rows.map((r) => [r.dept, r.actual, r.planned, r.budget, r.vsPlan === 0 ? "—" : (r.vsPlan > 0 ? "+" : "−") + Math.abs(r.vsPlan), r.fillPct === null ? "—" : N.formatPct(r.fillPct), r.headroom] as (string | number)[]),
      drill: "department",
    },
  ];

  const watchouts: MetricWatchout[] = [];
  // Materially understaffed vs plan (open roles → delivery risk).
  for (const r of rows.filter((r) => r.planned >= 5 && r.actual < r.planned && (r.planned - r.actual) / r.planned >= 0.15).slice(0, 4)) {
    watchouts.push({
      severity: (r.planned - r.actual) / r.planned >= 0.3 ? "high" : "medium",
      title: `${r.dept} is under plan`,
      detail: `${r.dept} has ${r.actual} of a planned ${r.planned} (${N.formatPct((r.fillPct ?? 0))} filled) — ${r.planned - r.actual} open role(s).`,
      actionHint: "Confirm the hiring pipeline covers the gap, or re-plan if the roles are no longer needed.",
      owner: "Talent Acquisition",
    });
  }
  // Over budget headcount (actual above the approved ceiling).
  for (const r of rows.filter((r) => r.budget > 0 && r.actual > r.budget).slice(0, 3)) {
    watchouts.push({
      severity: "medium",
      title: `${r.dept} is over budget headcount`,
      detail: `${r.dept} has ${r.actual} active vs a budget of ${r.budget} (${r.actual - r.budget} over).`,
      actionHint: "Review against the approved budget; freeze backfills or seek a budget revision.",
      owner: "HR Leadership",
    });
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `${N.humanizeInt(totalActual)} active vs a planned ${N.humanizeInt(totalPlanned)} (${overallFill === null ? "n/a" : N.formatPct(overallFill)} filled); ${openToPlan} open to plan, ${totalBudget - totalActual} budget headroom.`,
    kpis,
    charts,
    tables,
    watchouts,
  };
}
