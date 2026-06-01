// Per-domain metrics dispatcher — one entry point for dashboard + newsletter.
// Each domain references its OWN latest snapshot's as-of date (so time-relative
// metrics like requisition aging don't go negative against the employee period).

import type { DataSource } from "../store/types";
import type { Row } from "../ingest/types";
import { DomainMetrics } from "./base";
import * as ta from "./talent_acquisition";
import * as pms from "./pms";
import * as payroll from "./payroll";
import * as ld from "./ld";
import * as admin from "./admin";
import * as crossFunctional from "./cross_functional";
import type { LeaverEvent } from "./cross_functional";

export const DOMAIN_ORDER = ["talent_acquisition", "performance", "learning", "payroll", "operations"] as const;
export type DomainKey = (typeof DOMAIN_ORDER)[number];

export const DOMAIN_LABELS: Record<DomainKey, string> = {
  talent_acquisition: "Talent Acquisition",
  performance: "Performance (PMS)",
  learning: "Learning & Development",
  payroll: "Payroll & Cost",
  operations: "HR Operations",
};

function rowsOf(store: DataSource, kind: string): Row[] | null {
  return store.getLatest(kind)?.rows ?? null;
}
function asOfOf(store: DataSource, kind: string): string | null {
  return store.getLatest(kind)?.asOf ?? null;
}

export function buildDomain(
  store: DataSource,
  key: DomainKey,
  opts: { activeHeadcount?: number } = {},
): DomainMetrics {
  const activeHeadcount = opts.activeHeadcount ?? 0;
  switch (key) {
    case "talent_acquisition":
      return ta.compute(rowsOf(store, "ta_requisition"), asOfOf(store, "ta_requisition"));
    case "performance":
      return pms.compute(rowsOf(store, "pms_review"), asOfOf(store, "pms_review"));
    case "learning":
      return ld.compute({
        enrollmentRows: rowsOf(store, "ld_enrollment"),
        programRows: rowsOf(store, "ld_program"),
        activeHeadcount,
        asOf: asOfOf(store, "ld_enrollment"),
      });
    case "payroll":
      return payroll.compute({
        recordRows: rowsOf(store, "payroll_record"),
        aggregateRows: rowsOf(store, "payroll_aggregate"),
        statutoryRows: rowsOf(store, "payroll_statutory"),
        asOf: asOfOf(store, "payroll_aggregate"),
      });
    case "operations":
      return admin.compute({
        assetRows: rowsOf(store, "admin_asset"),
        contractRows: rowsOf(store, "admin_contract"),
        lifecycleRows: rowsOf(store, "admin_lifecycle"),
        asOf: asOfOf(store, "admin_contract"),
      });
  }
}

export function buildAll(store: DataSource, opts: { activeHeadcount?: number } = {}): DomainMetrics[] {
  return DOMAIN_ORDER.map((k) => buildDomain(store, k, opts));
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
