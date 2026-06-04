// HR Brain — signal context. Gathers every analytic signal ONCE so the diagnostic
// rules can reason across domains. 100% local + deterministic: no network, no LLM,
// no Date.now. Reuses the existing metric builders, so the Brain can never drift
// from the dashboards it diagnoses.

import type { DataSource } from "../store/types";
import type { DomainMetrics, MetricWatchout } from "../metrics/base";
import type { Row } from "../ingest/types";
import { parseKpiValue } from "../metrics/compare";
import { combinedEmployeeSnapshot, employeePeriods } from "../metrics/combineEmployees";
import { buildPeople } from "../metrics/people";
import { buildAll, buildCrossFunctional } from "../metrics";
import { leaverEvents } from "../metrics/movement";
import { buildRisk } from "../metrics/risk";
import { buildCompensation } from "../metrics/compensation";
import { buildPayEquity } from "../metrics/pay_equity";
import { buildRepresentation } from "../metrics/representation";
import { buildOrgHealth } from "../metrics/orgHealth";
import { buildWorkforceCost } from "../metrics/workforceCost";
import { buildSourceReconciliation } from "../metrics/sourceReconciliation";
import { buildScorecard, type ScorecardRow } from "../scorecard";

export type TaggedWatchout = MetricWatchout & { kind: string };

export interface BrainContext {
  asOf: string;
  active: number;
  hasEmployees: boolean;
  domains: DomainMetrics[];
  watchouts: TaggedWatchout[];
  scorecard: ScorecardRow[];
  /** First parseable numeric value for a KPI label across all domains. */
  num(label: string): number | null;
  /** First display string for a KPI label across all domains. */
  display(label: string): string | null;
  /** Does any domain of this kind have data? */
  has(kind: string): boolean;
  /** Watchouts whose title or detail matches a pattern. */
  watchoutsMatching(re: RegExp): TaggedWatchout[];
}

export function gatherContext(store: DataSource, opts: { targets?: Record<string, number>; benchmarks?: Record<string, { low: number; high: number }> } = {}): BrainContext {
  const snap = combinedEmployeeSnapshot(store);
  const empRows: Row[] = snap?.rows ?? [];
  const asOf = snap?.asOf ?? "";
  const active = empRows.filter((r) => String(r["employment_status"]) === "Working").length;
  const payrollRows = store.getLatest("payroll_record")?.rows ?? null;
  const pmsRows = store.getLatest("pms_review")?.rows ?? null;

  const domains: DomainMetrics[] = [];
  if (empRows.length) domains.push(...buildPeople(empRows, asOf).map((s) => s.metrics));
  domains.push(...buildAll(store, { activeHeadcount: active }));
  if (empRows.length) {
    domains.push(buildRisk({ employeeRows: empRows, asOf, payrollRows, pmsRows }));
    domains.push(buildCompensation({ employeeRows: empRows, payrollRows, asOf }));
    domains.push(buildPayEquity({ employeeRows: empRows, payrollRows }));
    domains.push(buildRepresentation({ employeeRows: empRows, asOf }));
    domains.push(buildOrgHealth(empRows));
    domains.push(buildWorkforceCost({ payrollRows, employeeRows: empRows }));
    domains.push(buildSourceReconciliation(store.listByKind("employee_master")));
  }
  domains.push(buildCrossFunctional(store, { leaverEvents: leaverEvents(employeePeriods(store)) }));

  const scorecard = buildScorecard(store, opts.targets ?? {}, opts.benchmarks ?? {});

  const kpiByLabel = new Map<string, { value: string; n: number | null }>();
  for (const d of domains) {
    if (!d.hasData) continue;
    for (const k of d.kpis) {
      if (!kpiByLabel.has(k.label)) {
        const p = parseKpiValue(k.value);
        kpiByLabel.set(k.label, { value: k.value, n: p ? p.n : null });
      }
    }
  }
  const watchouts: TaggedWatchout[] = domains.flatMap((d) => d.watchouts.map((w) => ({ ...w, kind: d.kind })));
  const hasKind = new Set(domains.filter((d) => d.hasData).map((d) => d.kind));

  return {
    asOf,
    active,
    hasEmployees: empRows.length > 0,
    domains,
    watchouts,
    scorecard,
    num: (label) => kpiByLabel.get(label)?.n ?? null,
    display: (label) => kpiByLabel.get(label)?.value ?? null,
    has: (kind) => hasKind.has(kind),
    watchoutsMatching: (re) => watchouts.filter((w) => re.test(w.title) || re.test(w.detail)),
  };
}
