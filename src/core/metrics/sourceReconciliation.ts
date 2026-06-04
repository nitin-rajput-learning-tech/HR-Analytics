// Source Reconciliation — when two employee feeds are combined (e.g. an automated
// Keka export + an HR-maintained snapshot), this surfaces where they DISAGREE so
// the merge's assumptions are transparent:
//   * who is in an earlier/other source but ABSENT from the latest feed (a scope
//     gap, or a departure the latest feed reflects) — these stay "active" in the
//     combined roster only because no exit was recorded, so they need a human check;
//   * who is in the latest feed but MISSING attributes the richer source supplies
//     (typically new joiners with no gender yet).
// Pure + testable. hasData only when ≥2 heterogeneous sources were actually merged;
// a single source or same-schema periods produce a graceful empty state.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";
import { combineEmployeeSnapshots } from "./combineEmployees";

const KIND = "people_sources";
const LABEL = "Data Sources";
const str = (v: unknown) => String(v ?? "").trim();
const isRelieved = (r: Row) => str(r["employment_status"]) === "Relieved" || str(r["last_working_day"]) !== "";

interface SnapLike {
  asOf: string;
  rows: Row[];
  sourceFile?: string;
}

export function buildSourceReconciliation(snaps: SnapLike[]): DomainMetrics {
  const empty = (msg: string): DomainMetrics => ({ kind: KIND, label: LABEL, hasData: false, blurb: msg, kpis: [], charts: [], tables: [], watchouts: [] });

  const ordered = [...snaps].sort((a, b) => a.asOf.localeCompare(b.asOf));
  const res = combineEmployeeSnapshots(ordered);
  if (!res.combined) {
    return empty(
      ordered.length < 2
        ? "Reconciliation appears once a second employee source is loaded (e.g. an HR-maintained snapshot alongside the Keka export)."
        : "Your employee sources share the same columns, so they're treated as time periods (for trends) rather than merged — no cross-source reconciliation needed.",
    );
  }

  const latest = ordered[ordered.length - 1];
  const latestIds = new Set(latest.rows.map((r) => str(r["employee_number"])).filter(Boolean));
  // Union of everyone seen in the OTHER (non-latest) sources.
  const otherIds = new Set<string>();
  for (let i = 0; i < ordered.length - 1; i++) for (const r of ordered[i].rows) { const id = str(r["employee_number"]); if (id) otherIds.add(id); }

  const combined = res.rows;
  const active = combined.filter((r) => !isRelieved(r));
  const activeCount = active.length;

  // Active in the combined roster but absent from the latest feed → relying on an
  // older source; could be a scope gap between feeds or an unrecorded departure.
  const absentFromLatest = active.filter((r) => !latestIds.has(str(r["employee_number"])));
  // In the latest feed but unseen by the other sources → new joiners since.
  const newInLatest = latest.rows.filter((r) => { const id = str(r["employee_number"]); return id && !otherIds.has(id); });
  // Active records still missing gender (diversity excludes them).
  const activeMissingGender = active.filter((r) => str(r["gender"]) === "").length;

  const kpis: MetricKPI[] = [
    { label: "Data Sources", value: N.humanizeInt(res.sources), hint: "combined into one roster" },
    { label: "Combined Active", value: N.humanizeInt(activeCount), hint: `${N.humanizeInt(combined.length)} incl. leavers` },
    { label: "In Latest Feed", value: N.humanizeInt(latestIds.size), hint: `as of ${latest.asOf}` },
    { label: "Active Only in Other Source", value: N.humanizeInt(absentFromLatest.length), hint: "not in the latest feed" },
    { label: "New in Latest Feed", value: N.humanizeInt(newInLatest.length), hint: "not yet in the other source" },
  ];

  const charts: ChartSpec[] = [
    {
      title: "Active coverage by source",
      caption: "How the combined active roster splits across your feeds.",
      kind: "bar",
      labels: ["In latest feed", "Only in other source"],
      values: [activeCount - absentFromLatest.length, absentFromLatest.length],
    },
  ];

  const tables: MetricTable[] = [];
  if (absentFromLatest.length) {
    tables.push({
      title: "Active in another source, not in the latest feed",
      caption: `Present and active in an earlier snapshot but missing from the latest feed (${latest.asOf}). Verify whether they departed or fall outside the latest feed's scope.`,
      columns: ["Employee", "Department", "Status", "Joined"],
      rows: absentFromLatest.slice(0, 20).map((r) => [str(r["full_name"]) || str(r["employee_number"]), str(r["department"]) || "—", str(r["employment_status"]) || "—", str(r["date_joined"]) || "—"] as (string | number)[]),
    });
  }

  const watchouts: MetricWatchout[] = [];
  if (absentFromLatest.length) {
    const share = activeCount ? absentFromLatest.length / activeCount : 0;
    watchouts.push({
      severity: share >= 0.2 ? "high" : "medium",
      title: `${absentFromLatest.length} active staff not in the latest feed`,
      detail: `${absentFromLatest.length} of ${activeCount} active employees (${N.formatPct(share * 100)}) appear only in an earlier source, not the latest feed (${latest.asOf}). They remain counted as active because no exit was recorded — this is usually a scope difference between feeds, or unrecorded departures.`,
      actionHint: "Reconcile the two feeds: confirm the latest export covers all entities, and capture exits for anyone who has truly left.",
      owner: "HR Operations",
    });
  }
  if (activeMissingGender > 0) {
    watchouts.push({
      severity: "medium",
      title: `${activeMissingGender} active staff missing gender`,
      detail: `${activeMissingGender} active employees have no gender on record (typically recent joiners not yet in the HR-maintained snapshot). Diversity and representation metrics exclude them.`,
      actionHint: "Add the latest joiners to the HR snapshot so diversity analytics cover the full active roster.",
      owner: "HR Operations",
    });
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `Combined ${res.sources} sources → ${activeCount} active across ${combined.length} total. ${absentFromLatest.length} active appear only in an earlier source; ${newInLatest.length} new joiners aren't in the other source yet.`,
    kpis,
    charts,
    tables,
    watchouts,
  };
}
