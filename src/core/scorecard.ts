// Targets & Scorecard — the management-by-objective layer. Turns the suite's
// descriptive KPIs into a RAG (red/amber/green) scorecard against user-set
// targets (persisted with the workspace). Pure: it reuses the existing metric
// builders and reads their already-formatted KPI values (no new metric logic),
// so the scorecard can never drift from the dashboards it summarises.

import { parseKpiValue } from "./metrics/compare";
import { buildPeople } from "./metrics/people";
import { buildAll } from "./metrics";
import { buildPayEquity } from "./metrics/pay_equity";
import { overviewKpis } from "./metrics/overview";
import type { DataSource } from "./store/types";
import type { MetricKPI } from "./metrics/base";

export type Rag = "green" | "amber" | "red" | "none";

export interface ScorecardRow {
  id: string;
  label: string;
  group: string;
  value: number | null;
  display: string;
  unit: string; // "%", "yrs", ""
  target: number;
  higherIsBetter: boolean;
  rag: Rag;
  status: string;
}

interface Def {
  id: string;
  label: string;
  group: string;
  kind: string; // primary DomainMetrics.kind that carries the KPI
  kpiLabel: string; // KPI label within that domain
  unit: string;
  higherIsBetter: boolean;
  defaultTarget: number;
}

// Curated headline KPIs with universally-meaningful default targets. Only rate /
// tenure metrics (parseable + direction-clear); org-size counts are excluded
// because a sensible default target is organisation-specific.
const DEFS: Def[] = [
  { id: "offer_accept", label: "Offer-Accept Rate", group: "Talent Acquisition", kind: "ta_requisition", kpiLabel: "Offer-Accept Rate", unit: "%", higherIsBetter: true, defaultTarget: 80 },
  { id: "review_completion", label: "Review Completion", group: "Performance", kind: "pms_review", kpiLabel: "Review Completion", unit: "%", higherIsBetter: true, defaultTarget: 95 },
  { id: "statutory_ontime", label: "Statutory On-time", group: "Payroll", kind: "payroll_record", kpiLabel: "Statutory On-time", unit: "%", higherIsBetter: true, defaultTarget: 100 },
  { id: "ld_coverage", label: "L&D Coverage", group: "Learning & Development", kind: "ld_enrollment", kpiLabel: "Coverage", unit: "%", higherIsBetter: true, defaultTarget: 80 },
  { id: "pay_gap", label: "Gender Pay Gap", group: "Pay Equity", kind: "people_pay_equity", kpiLabel: "Gender Pay Gap", unit: "%", higherIsBetter: false, defaultTarget: 5 },
  { id: "first_year_exit", label: "First-Year Exit Share", group: "Retention", kind: "people_retention", kpiLabel: "First-Year Exit Share", unit: "%", higherIsBetter: false, defaultTarget: 15 },
  { id: "avg_tenure", label: "Avg Tenure (active)", group: "People & Org", kind: "people_overview", kpiLabel: "Avg Tenure (active)", unit: "yrs", higherIsBetter: true, defaultTarget: 3 },
];

export function ragFor(value: number | null, target: number, higherIsBetter: boolean): Rag {
  if (value === null) return "none";
  const meets = higherIsBetter ? value >= target : value <= target;
  if (meets) return "green";
  const tol = Math.abs(target) * 0.1 || 0.1; // within 10% of target on the wrong side ⇒ amber
  return Math.abs(value - target) <= tol ? "amber" : "red";
}

function statusText(rag: Rag, higherIsBetter: boolean): string {
  if (rag === "none") return "No data";
  if (rag === "green") return "On target";
  const dir = higherIsBetter ? "below" : "above";
  return rag === "amber" ? `Just ${dir} target` : `${dir[0].toUpperCase()}${dir.slice(1)} target`;
}

export function buildScorecard(store: DataSource, targets: Record<string, number> = {}): ScorecardRow[] {
  const empSnap = store.getLatest("employee_master");
  const empRows = empSnap?.rows ?? [];
  const asOf = empSnap?.asOf ?? "";
  const activeHeadcount = empRows.length ? overviewKpis(empRows).active : 0;

  const byKind = new Map<string, MetricKPI[]>();
  const allKpis: MetricKPI[] = [];
  const add = (kind: string, kpis: MetricKPI[]) => { byKind.set(kind, [...(byKind.get(kind) ?? []), ...kpis]); allKpis.push(...kpis); };
  if (empRows.length) for (const s of buildPeople(empRows, asOf)) add(s.metrics.kind, s.metrics.kpis);
  for (const d of buildAll(store, { activeHeadcount })) add(d.kind, d.kpis);
  const pe = buildPayEquity({ employeeRows: empRows, payrollRows: store.getLatest("payroll_record")?.rows ?? null });
  add(pe.kind, pe.kpis);

  return DEFS.map((def) => {
    // Primary lookup by (kind, label); fall back to any domain with that label so
    // a renamed/moved KPI never silently blanks the scorecard row.
    const kpi = (byKind.get(def.kind) ?? []).find((k) => k.label === def.kpiLabel) ?? allKpis.find((k) => k.label === def.kpiLabel);
    const parsed = kpi ? parseKpiValue(kpi.value) : null;
    const value = parsed ? parsed.n : null;
    const target = typeof targets[def.id] === "number" && Number.isFinite(targets[def.id]) ? targets[def.id] : def.defaultTarget;
    const rag = ragFor(value, target, def.higherIsBetter);
    return { id: def.id, label: def.label, group: def.group, value, display: kpi?.value ?? "—", unit: def.unit, target, higherIsBetter: def.higherIsBetter, rag, status: statusText(rag, def.higherIsBetter) };
  });
}

export function scorecardSummary(rows: ScorecardRow[]): { green: number; amber: number; red: number; tracked: number } {
  const green = rows.filter((r) => r.rag === "green").length;
  const amber = rows.filter((r) => r.rag === "amber").length;
  const red = rows.filter((r) => r.rag === "red").length;
  return { green, amber, red, tracked: green + amber + red };
}

export const DEFAULT_TARGETS: Record<string, number> = Object.fromEntries(DEFS.map((d) => [d.id, d.defaultTarget]));
