// Targets & Scorecard — the management-by-objective layer. Turns the suite's
// descriptive KPIs into a RAG (red/amber/green) scorecard against user-set
// targets (persisted with the workspace). Pure: it reuses the existing metric
// builders and reads their already-formatted KPI values (no new metric logic),
// so the scorecard can never drift from the dashboards it summarises.

import { parseKpiValue, deltaText } from "./metrics/compare";
import { DEFAULT_BENCHMARKS, benchmarkPosition, formatBand, type BenchPos } from "./benchmarks";
import { buildPeople } from "./metrics/people";
import { buildAll } from "./metrics";
import { buildPayEquity } from "./metrics/pay_equity";
import { buildOrgHealth } from "./metrics/orgHealth";
import { combinedEmployeeSnapshot } from "./metrics/combineEmployees";
import { overviewKpis } from "./metrics/overview";
import type { DataSource } from "./store/types";
import { MemoryStore } from "./store/memoryStore";
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
  prior: number | null; // value last period (null if no history)
  delta: number | null; // value − prior
  trend: string; // formatted change vs last period, e.g. "▲ +2.1pp"
  trendTone: "good" | "bad" | "neutral";
  benchmark: string; // typical industry range, e.g. "12–18%" ("—" if none)
  benchmarkPos: BenchPos; // where the value sits vs the typical band
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
  { id: "org_layers", label: "Org Layers", group: "Org Design", kind: "people_org_health", kpiLabel: "Org Layers", unit: "", higherIsBetter: false, defaultTarget: 6 },
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

// Collect every scorecard-relevant KPI from a store (People + functional + pay
// equity), keyed by domain kind, reusing the existing builders so the scorecard
// can never drift from the dashboards.
function collect(store: DataSource): Map<string, MetricKPI[]> {
  const empSnap = combinedEmployeeSnapshot(store);
  const empRows = empSnap?.rows ?? [];
  const asOf = empSnap?.asOf ?? "";
  const activeHeadcount = empRows.length ? overviewKpis(empRows).active : 0;
  const byKind = new Map<string, MetricKPI[]>();
  const add = (kind: string, kpis: MetricKPI[]) => byKind.set(kind, [...(byKind.get(kind) ?? []), ...kpis]);
  if (empRows.length) for (const s of buildPeople(empRows, asOf)) add(s.metrics.kind, s.metrics.kpis);
  for (const d of buildAll(store, { activeHeadcount })) add(d.kind, d.kpis);
  const pe = buildPayEquity({ employeeRows: empRows, payrollRows: store.getLatest("payroll_record")?.rows ?? null });
  add(pe.kind, pe.kpis);
  const oh = buildOrgHealth(empRows);
  add(oh.kind, oh.kpis);
  return byKind;
}

// Find a KPI's numeric value for a definition: primary lookup by (kind, label),
// falling back to any domain with that label so a moved KPI never blanks a row.
function findValue(byKind: Map<string, MetricKPI[]>, def: Def): { kpi?: MetricKPI; value: number | null } {
  const kpi = (byKind.get(def.kind) ?? []).find((k) => k.label === def.kpiLabel) ?? [...byKind.values()].flat().find((k) => k.label === def.kpiLabel);
  const parsed = kpi ? parseKpiValue(kpi.value) : null;
  return { kpi, value: parsed ? parsed.n : null };
}

// Prior-period view of the store: the second-latest snapshot of each kind, so the
// scorecard can show momentum vs last period. Null when there's no history.
function priorStoreOf(store: DataSource): DataSource | null {
  const prior = new MemoryStore();
  for (const kind of new Set(store.allSnapshots().map((s) => s.kind))) {
    const snaps = store.listByKind(kind); // ascending by asOf
    if (snaps.length >= 2) prior.add(snaps[snaps.length - 2]);
  }
  return prior.allSnapshots().length ? prior : null;
}

export function buildScorecard(store: DataSource, targets: Record<string, number> = {}): ScorecardRow[] {
  const cur = collect(store);
  const priorStore = priorStoreOf(store);
  const prior = priorStore ? collect(priorStore) : null;

  return DEFS.map((def) => {
    const { kpi, value } = findValue(cur, def);
    const priorValue = prior ? findValue(prior, def).value : null;
    const target = typeof targets[def.id] === "number" && Number.isFinite(targets[def.id]) ? targets[def.id] : def.defaultTarget;
    const rag = ragFor(value, target, def.higherIsBetter);

    const delta = value !== null && priorValue !== null ? value - priorValue : null;
    let trend = "";
    let trendTone: "good" | "bad" | "neutral" = "neutral";
    if (delta !== null) {
      const floor = def.unit === "yrs" ? 0.05 : 0.5; // ignore rounding-level noise
      if (Math.abs(delta) < floor) {
        trend = "no change";
      } else {
        trend = deltaText(delta, def.unit === "%" ? "pct" : def.unit === "yrs" ? "yrs" : "count");
        trendTone = (def.higherIsBetter ? delta > 0 : delta < 0) ? "good" : "bad";
      }
    }

    const band = DEFAULT_BENCHMARKS[def.id];
    return { id: def.id, label: def.label, group: def.group, value, display: kpi?.value ?? "—", unit: def.unit, target, higherIsBetter: def.higherIsBetter, rag, status: statusText(rag, def.higherIsBetter), prior: priorValue, delta, trend, trendTone, benchmark: formatBand(band, def.unit), benchmarkPos: benchmarkPosition(value, band, def.higherIsBetter) };
  });
}

export function scorecardSummary(rows: ScorecardRow[]): { green: number; amber: number; red: number; tracked: number } {
  const green = rows.filter((r) => r.rag === "green").length;
  const amber = rows.filter((r) => r.rag === "amber").length;
  const red = rows.filter((r) => r.rag === "red").length;
  return { green, amber, red, tracked: green + amber + red };
}

export const DEFAULT_TARGETS: Record<string, number> = Object.fromEntries(DEFS.map((d) => [d.id, d.defaultTarget]));
