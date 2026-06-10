// Per-domain metrics dispatcher — one entry point for dashboard + newsletter.
// Each domain references its OWN latest snapshot's as-of date (so time-relative
// metrics like requisition aging don't go negative against the employee period).

import type { DataSource } from "../store/types";
import type { Row } from "../ingest/types";
import { MemoryStore } from "../store/memoryStore";
import { DomainMetrics } from "./base";
import { decorateDomainDeltas, prettyPeriod, attachKpiSparklines } from "./compare";
import { storeAsOf } from "./timeseries";
import * as ta from "./talent_acquisition";
import * as pms from "./pms";
import * as payroll from "./payroll";
import * as ld from "./ld";
import * as admin from "./admin";
import * as engagement from "./engagement";
import * as crossFunctional from "./cross_functional";
import type { LeaverEvent } from "./cross_functional";

export type DomainKey = "talent_acquisition" | "performance" | "learning" | "payroll" | "operations" | "engagement";

function rowsOf(store: DataSource, kind: string): Row[] | null {
  return store.getLatest(kind)?.rows ?? null;
}
function asOfOf(store: DataSource, kind: string): string | null {
  return store.getLatest(kind)?.asOf ?? null;
}

// Single source of truth for the functional domains. To add a domain: add a
// metrics module and one entry here — DOMAIN_ORDER, DOMAIN_LABELS and the
// dispatcher all derive from this, so they can't drift out of sync.
interface DomainDef {
  label: string;
  requiredKinds: string[]; // domain has data if ANY of these kinds is loaded
  build: (store: DataSource, opts: { activeHeadcount: number }) => DomainMetrics;
}

const DOMAIN_REGISTRY: Record<DomainKey, DomainDef> = {
  talent_acquisition: {
    label: "Talent Acquisition",
    requiredKinds: ["ta_requisition"],
    build: (s) => ta.compute(rowsOf(s, "ta_requisition"), asOfOf(s, "ta_requisition")),
  },
  performance: {
    label: "Performance (PMS)",
    requiredKinds: ["pms_review"],
    build: (s) => pms.compute(rowsOf(s, "pms_review"), asOfOf(s, "pms_review")),
  },
  learning: {
    label: "Learning & Development",
    requiredKinds: ["ld_enrollment", "ld_program"],
    build: (s, o) => ld.compute({ enrollmentRows: rowsOf(s, "ld_enrollment"), programRows: rowsOf(s, "ld_program"), activeHeadcount: o.activeHeadcount, asOf: asOfOf(s, "ld_enrollment") }),
  },
  payroll: {
    label: "Payroll & Cost",
    requiredKinds: ["payroll_aggregate", "payroll_record", "payroll_statutory"],
    build: (s) => payroll.compute({ recordRows: rowsOf(s, "payroll_record"), aggregateRows: rowsOf(s, "payroll_aggregate"), statutoryRows: rowsOf(s, "payroll_statutory"), asOf: asOfOf(s, "payroll_aggregate") }),
  },
  operations: {
    label: "HR Operations",
    requiredKinds: ["admin_asset", "admin_contract", "admin_lifecycle"],
    build: (s) => admin.compute({ assetRows: rowsOf(s, "admin_asset"), contractRows: rowsOf(s, "admin_contract"), lifecycleRows: rowsOf(s, "admin_lifecycle"), asOf: asOfOf(s, "admin_contract") }),
  },
  engagement: {
    label: "Engagement",
    requiredKinds: ["engagement_survey"],
    build: (s) => engagement.compute(rowsOf(s, "engagement_survey"), asOfOf(s, "engagement_survey")),
  },
};

export const DOMAIN_ORDER = Object.keys(DOMAIN_REGISTRY) as DomainKey[];
export const DOMAIN_LABELS = Object.fromEntries(
  (Object.entries(DOMAIN_REGISTRY) as [DomainKey, DomainDef][]).map(([k, d]) => [k, d.label]),
) as Record<DomainKey, string>;

export function buildDomain(store: DataSource, key: DomainKey, opts: { activeHeadcount?: number } = {}): DomainMetrics {
  return DOMAIN_REGISTRY[key].build(store, { activeHeadcount: opts.activeHeadcount ?? 0 });
}

export function buildAll(store: DataSource, opts: { activeHeadcount?: number } = {}): DomainMetrics[] {
  return DOMAIN_ORDER.map((k) => buildDomain(store, k, opts));
}

// Build a domain with month-over-month KPI deltas. The prior period is the
// second-latest snapshot of each of the domain's kinds (so a domain with only
// one upload shows no deltas — graceful). Mirrors the People delta pattern.
export function buildDomainCompared(store: DataSource, key: DomainKey, opts: { activeHeadcount?: number } = {}): DomainMetrics {
  const current = buildDomain(store, key, opts);
  const kinds = DOMAIN_REGISTRY[key].requiredKinds;
  // Prior-period deltas: the second-latest snapshot of each of the domain's kinds.
  const prior = new MemoryStore();
  let priorLabel = "";
  let hasPrior = false;
  for (const kind of kinds) {
    const snaps = store.listByKind(kind); // ascending by asOf
    if (snaps.length >= 2) {
      const priorSnap = snaps[snaps.length - 2];
      prior.add(priorSnap);
      hasPrior = true;
      if (!priorLabel) priorLabel = prettyPeriod(priorSnap.periodLabel ?? priorSnap.asOf);
    }
  }
  const compared = hasPrior ? decorateDomainDeltas(current, buildDomain(prior, key, opts), priorLabel) : current;
  // Sparklines: recompute the domain at every period it has data for (snapshots
  // carried forward via storeAsOf) and attach each KPI's history. No-op with <2 periods.
  const periods = new Set<string>();
  for (const kind of kinds) for (const s of store.listByKind(kind)) if (s.asOf) periods.add(s.asOf);
  const sorted = [...periods].sort();
  if (sorted.length < 2) return compared;
  const history = sorted.map((asOf) => buildDomain(storeAsOf(store, asOf), key, opts).kpis);
  return { ...compared, kpis: attachKpiSparklines(compared.kpis, history) };
}

// Domains with at least one of their dataset kinds loaded — lets callers skip
// domains that have no data yet rather than render empty shells.
export function availableDomains(store: DataSource): DomainKey[] {
  return DOMAIN_ORDER.filter((k) => DOMAIN_REGISTRY[k].requiredKinds.some((kind) => store.hasKind(kind)));
}

// Cross-functional risk is a cross-cut over the employee master + the functional
// domains. It is kept separate from DOMAIN_ORDER (which drives the per-team
// dashboards) and feeds the CHRO executive brief / newsletter. `leaverEvents`
// are optional until the employee-events analytics layer is ported.
export function buildCrossFunctional(
  store: DataSource,
  opts: { leaverEvents?: LeaverEvent[] | null } = {},
): DomainMetrics {
  return crossFunctional.compute({
    employeeRows: rowsOf(store, "employee_master"),
    pmsRows: rowsOf(store, "pms_review"),
    ldEnrollmentRows: rowsOf(store, "ld_enrollment"),
    payrollAggregateRows: rowsOf(store, "payroll_aggregate"),
    taRows: rowsOf(store, "ta_requisition"),
    leaverEvents: opts.leaverEvents ?? null,
    asOf: asOfOf(store, "employee_master"),
  });
}
