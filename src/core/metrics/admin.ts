// HR Admin / Operations metrics — assets, contract renewals, on/off-boarding.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout, emptyDomain, isTruthy } from "./base";

const LABEL = "HR Operations";
const TEAM = "HR Admin";

const nonEmpty = (rows?: Row[] | null): rows is Row[] => !!rows && rows.length > 0;

export interface AdminInput {
  assetRows?: Row[] | null;
  contractRows?: Row[] | null;
  lifecycleRows?: Row[] | null;
  asOf?: string | null;
}

export function compute(input: AdminInput): DomainMetrics {
  const { assetRows, contractRows, lifecycleRows, asOf } = input;
  const hasAsset = nonEmpty(assetRows);
  const hasContract = nonEmpty(contractRows);
  const hasLife = nonEmpty(lifecycleRows);
  if (!hasAsset && !hasContract && !hasLife) return emptyDomain("admin_asset", LABEL, TEAM);

  const kpis: MetricKPI[] = [];
  const charts: ChartSpec[] = [];
  const tables: MetricTable[] = [];
  const watchouts: MetricWatchout[] = [];
  const blurbParts: string[] = [];
  const ref = Date.parse(asOf ?? new Date().toISOString().slice(0, 10));

  if (hasAsset && assetRows!.some((r) => "status" in r)) {
    const lc = (r: Row) => String(r["status"] ?? "").toLowerCase();
    const allocated = assetRows!.filter((r) => lc(r) === "allocated").length;
    const lost = assetRows!.filter((r) => lc(r) === "lost").length;
    let valueAlloc = 0;
    for (const r of assetRows!) {
      if (lc(r) === "allocated") {
        const v = Number(r["value"]);
        if (Number.isFinite(v)) valueAlloc += v;
      }
    }
    kpis.push({ label: "Assets Allocated", value: N.humanizeInt(allocated) });
    if (valueAlloc) kpis.push({ label: "Allocated Asset Value", value: N.humanizeMoneyInr(valueAlloc) });
    if (lost) kpis.push({ label: "Assets Lost", value: N.humanizeInt(lost) });
    blurbParts.push(`${allocated.toLocaleString("en-US")} assets allocated`);
    if (lost) {
      watchouts.push({
        severity: lost >= 3 ? "medium" : "low",
        title: "Assets reported lost",
        detail: `${lost} asset(s) are marked lost.`,
        actionHint: "Investigate; recover or write off and update the register.",
        owner: "HR Admin",
      });
    }
  }

  if (hasContract && contractRows!.some((r) => "expiry_date" in r)) {
    let d30 = 0, d60 = 0, d90 = 0, expired = 0, annualCost = 0;
    for (const r of contractRows!) {
      const exp = Date.parse(String(r["expiry_date"]));
      if (!Number.isNaN(exp)) {
        const days = Math.floor((exp - ref) / 86_400_000);
        if (days < 0) expired += 1;
        else {
          if (days <= 30) d30 += 1;
          if (days <= 60) d60 += 1;
          if (days <= 90) d90 += 1;
        }
      }
      const c = Number(r["annual_cost"]);
      if (Number.isFinite(c)) annualCost += c;
    }
    kpis.push({ label: "Contracts ≤30d", value: N.humanizeInt(d30), hint: `${d60} ≤60d · ${d90} ≤90d` });
    if (annualCost) kpis.push({ label: "Annual Contract Value", value: N.humanizeMoneyInr(annualCost) });
    blurbParts.push(`${d30} contracts expire within 30 days`);
    charts.push({
      title: "Contract renewal pipeline",
      caption: "Contracts by time-to-expiry.",
      kind: "bar",
      labels: ["Expired", "≤30d", "31-60d", "61-90d"],
      values: [expired, d30, Math.max(0, d60 - d30), Math.max(0, d90 - d60)],
    });
    if (d30 || expired) {
      watchouts.push({
        severity: expired ? "high" : "medium",
        title: "Contract renewals due",
        detail: `${expired} expired and ${d30} expiring within 30 days.`,
        actionHint: "Start renewal/RFP now to avoid a lapse in coverage.",
        owner: "HR Admin",
      });
    }
  }

  if (hasLife && lifecycleRows!.some((r) => "checklist_complete" in r)) {
    const total = lifecycleRows!.length;
    const complete = lifecycleRows!.filter((r) => isTruthy(r["checklist_complete"])).length;
    kpis.push({ label: "Lifecycle Checklist", value: N.formatPct(N.pct(complete, total)), hint: `${complete}/${total} on/off-boarding` });
    const off = lifecycleRows!.filter((r) => String(r["type"] ?? "").toLowerCase() === "offboarding");
    if (off.length) {
      const notRecovered = off.filter((r) => r["asset_recovered"] !== true).length;
      if (notRecovered) {
        watchouts.push({
          severity: "medium",
          title: "Offboarding asset-recovery gap",
          detail: `${notRecovered} offboarded employee(s) without confirmed asset recovery.`,
          actionHint: "Reconcile with IT/asset register before final settlement.",
          owner: "HR Admin",
        });
      }
    }
  }

  if (!kpis.length) return emptyDomain("admin_asset", LABEL, TEAM);

  return {
    kind: "admin_asset",
    label: LABEL,
    hasData: true,
    blurb: N.joinClauses(blurbParts) + ".",
    kpis,
    charts,
    tables,
    watchouts,
  };
}
