// Org Health — organisational design metrics beyond raw span of control: how
// many LAYERS deep the org is (delayering), the manager-to-IC ratio (top-heavy?),
// and low-span managers (each an extra layer adding little leverage). Builds the
// reporting tree from reporting_manager (a name) and walks each person to the
// root. Pure + testable; degrades when reporting data is absent.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";

const KIND = "people_org_health";
const LABEL = "Org Health";

const str = (v: unknown) => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";

export function buildOrgHealth(employeeRows: Row[]): DomainMetrics {
  const empty = (msg: string): DomainMetrics => ({ kind: KIND, label: LABEL, hasData: false, blurb: msg, kpis: [], charts: [], tables: [], watchouts: [] });
  const active = employeeRows.filter(isWorking);
  if (!active.length || !active.some((r) => "reporting_manager" in r)) {
    return empty("Org health needs reporting-manager data — add a Reporting Manager column to map the hierarchy.");
  }

  // Resolve managers by name. reporting_manager holds a manager's full name.
  const byName = new Map<string, Row>();
  for (const r of active) { const nm = str(r["full_name"]).toLowerCase(); if (nm) byName.set(nm, r); }
  const idOf = (r: Row) => str(r["employee_number"]) || str(r["full_name"]);

  // Depth from the top: root (no resolvable manager) = layer 1; reports = +1.
  // Memoised, with a cycle guard so malformed data can't loop forever.
  const depthCache = new Map<string, number>();
  function depth(r: Row, seen: Set<string>): number {
    const id = idOf(r);
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 1; // cycle — treat as a root
    const mgrName = str(r["reporting_manager"]).toLowerCase();
    const mgr = mgrName ? byName.get(mgrName) : undefined;
    const d = !mgr || idOf(mgr) === id ? 1 : 1 + depth(mgr, new Set(seen).add(id));
    depthCache.set(id, d);
    return d;
  }

  // Spans: direct reports per manager (by name).
  const spanByMgr = new Map<string, number>();
  for (const r of active) {
    const m = str(r["reporting_manager"]).toLowerCase();
    if (m && byName.has(m)) spanByMgr.set(m, (spanByMgr.get(m) ?? 0) + 1);
  }
  const managerNames = new Set(spanByMgr.keys());
  const managers = active.filter((r) => managerNames.has(str(r["full_name"]).toLowerCase()));
  const spans = [...spanByMgr.values()];
  const avgSpan = spans.length ? spans.reduce((s, x) => s + x, 0) / spans.length : 0;
  const maxSpan = spans.length ? Math.max(...spans) : 0;
  const lowSpan = managers.filter((m) => (spanByMgr.get(str(m["full_name"]).toLowerCase()) ?? 0) <= 2 && depth(m, new Set()) > 1);
  const managerRatio = N.pct(managers.length, active.length);

  const byLayer = new Map<number, number>();
  for (const r of active) { const d = depth(r, new Set()); byLayer.set(d, (byLayer.get(d) ?? 0) + 1); }
  const layers = byLayer.size ? Math.max(...byLayer.keys()) : 0;
  const layerLabels = Array.from({ length: layers }, (_, i) => `Layer ${i + 1}`);
  const layerCounts = Array.from({ length: layers }, (_, i) => byLayer.get(i + 1) ?? 0);

  const kpis: MetricKPI[] = [
    { label: "Org Layers", value: N.humanizeInt(layers), hint: "CEO/root → individual contributor" },
    { label: "People Managers", value: N.humanizeInt(managers.length), hint: `${N.formatPct(managerRatio)} of active` },
    { label: "Avg Span", value: spans.length ? avgSpan.toFixed(1) : "n/a", hint: `max ${N.humanizeInt(maxSpan)}` },
    { label: "Low-span Managers", value: N.humanizeInt(lowSpan.length), hint: "≤2 reports — possible extra layer" },
  ];

  const charts: ChartSpec[] = layers
    ? [{ title: "Headcount by layer", caption: "Org pyramid — people at each level below the top.", kind: "bar", labels: layerLabels, values: layerCounts }]
    : [];

  const tables: MetricTable[] = [
    {
      title: "Layers",
      caption: "Headcount at each reporting depth (Layer 1 = top of the org).",
      columns: ["Layer", "Headcount", "Share"],
      rows: layerLabels.map((l, i) => [l, layerCounts[i], N.formatPct(N.pct(layerCounts[i], active.length))] as (string | number)[]),
    },
  ];
  if (lowSpan.length) {
    tables.push({
      title: "Low-span managers (delayering candidates)",
      caption: "Managers with ≤2 direct reports — each is a layer that may add little leverage.",
      columns: ["Manager", "Department", "Direct reports"],
      rows: lowSpan.slice(0, 15).map((m) => [str(m["full_name"]), str(m["department"]) || "—", spanByMgr.get(str(m["full_name"]).toLowerCase()) ?? 0] as (string | number)[]),
    });
  }

  const watchouts: MetricWatchout[] = [];
  if (layers >= 7) {
    watchouts.push({ severity: layers >= 9 ? "high" : "medium", title: `Deep hierarchy — ${layers} layers`, detail: `${layers} reporting layers from top to individual contributor; deep structures slow decisions and dilute accountability.`, actionHint: "Review whether mid-level layers can be merged; target ≤6 layers for an org this size.", owner: "Org Design" });
  }
  if (managerRatio !== null && managerRatio > 20 && managers.length >= 5) {
    watchouts.push({ severity: managerRatio > 30 ? "high" : "medium", title: "Top-heavy management ratio", detail: `${N.formatPct(managerRatio)} of active staff are people-managers (${managers.length} of ${active.length}).`, actionHint: "Check for under-spanned managers and single-report reporting lines.", owner: "Org Design" });
  }
  if (lowSpan.length >= 3) {
    watchouts.push({ severity: "medium", title: `${lowSpan.length} low-span managers`, detail: `${lowSpan.length} managers have ≤2 direct reports — candidates for delayering or broadening spans.`, actionHint: "Consolidate small teams or widen spans to remove unnecessary layers.", owner: "Org Design" });
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `${layers} reporting layers; ${managers.length} managers (${N.formatPct(managerRatio)} of staff), average span ${avgSpan.toFixed(1)}.`,
    kpis,
    charts,
    tables,
    watchouts,
  };
}
