// Movement & Attrition + Predictive — the original tool's multi-month pages.
// Joiner/leaver events are DERIVED by diffing consecutive employee-master
// snapshots (no events table needed). With <2 snapshots it degrades to a clear
// "upload another month" state. Pure + testable.

import type { Row } from "../ingest/types";
import type { Snapshot } from "../store/types";
import * as N from "../narrative";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";
import type { LeaverEvent } from "./cross_functional";

export interface EmployeeEvent {
  employee_number: string;
  event_type: "joiner" | "leaver";
  event_date: string; // ISO
  department: string;
  legal_entity: string;
}

const str = (v: unknown) => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";
const monthKey = (iso: string) => (iso && iso.length >= 7 ? iso.slice(0, 7) : "");
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return m >= 1 && m <= 12 ? `${names[m - 1]} ${y}` : ym;
};

export function employeeSnapshots(all: Snapshot[]): Snapshot[] {
  return all
    .filter((s) => s.kind === "employee_master" && !!s.asOf)
    .sort((a, b) => a.asOf.localeCompare(b.asOf));
}

export function deriveEmployeeEvents(snapshots: Snapshot[]): EmployeeEvent[] {
  const snaps = employeeSnapshots(snapshots);
  if (snaps.length < 2) return [];
  const events: EmployeeEvent[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1];
    const cur = snaps[i];
    const prevMap = new Map(prev.rows.map((r) => [str(r["employee_number"]), r] as const));
    const curMap = new Map(cur.rows.map((r) => [str(r["employee_number"]), r] as const));
    for (const [id, r] of curMap) {
      if (!id) continue;
      const prevR = prevMap.get(id);
      const wasActive = !!prevR && isWorking(prevR);
      if (isWorking(r) && !wasActive) {
        events.push({ employee_number: id, event_type: "joiner", event_date: cur.asOf, department: str(r["department"]) || "Unspecified", legal_entity: str(r["legal_entity"]) || "Unspecified" });
      }
    }
    for (const [id, r] of prevMap) {
      if (!id || !isWorking(r)) continue;
      const curR = curMap.get(id);
      if (!curR || !isWorking(curR)) {
        const date = curR && str(curR["last_working_day"]) ? str(curR["last_working_day"]) : cur.asOf;
        const src = curR ?? r;
        events.push({ employee_number: id, event_type: "leaver", event_date: date, department: str(src["department"]) || "Unspecified", legal_entity: str(src["legal_entity"]) || "Unspecified" });
      }
    }
  }
  return events;
}

export interface MonthMovement {
  month: string;
  label: string;
  joiners: number;
  leavers: number;
  net: number;
}

export function monthlyMovement(events: EmployeeEvent[]): MonthMovement[] {
  const m = new Map<string, { joiners: number; leavers: number }>();
  for (const e of events) {
    const ym = monthKey(e.event_date);
    if (!ym) continue;
    const a = m.get(ym) ?? { joiners: 0, leavers: 0 };
    if (e.event_type === "joiner") a.joiners += 1;
    else a.leavers += 1;
    m.set(ym, a);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, label: monthLabel(month), joiners: v.joiners, leavers: v.leavers, net: v.joiners - v.leavers }));
}

// Simple weighted projection (recency-weighted average + linear trend).
function weighted(values: number[]): number {
  if (!values.length) return 0;
  let num = 0, den = 0;
  values.forEach((v, i) => { num += v * (i + 1); den += i + 1; });
  return den ? num / den : 0;
}
function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  values.forEach((v, i) => { num += (i - xMean) * (v - yMean); den += (i - xMean) ** 2; });
  return den ? num / den : 0;
}

export interface Forecast {
  months: { label: string; net: number; projectedActive: number }[];
  projectedActive: number;
  projectedNet: number;
}

export function forecastWorkforce(currentActive: number, movement: MonthMovement[], horizon = 6): Forecast {
  const look = movement.slice(-6);
  const wj = weighted(look.map((m) => m.joiners));
  const wl = weighted(look.map((m) => m.leavers));
  const sj = slope(look.map((m) => m.joiners));
  const sl = slope(look.map((m) => m.leavers));
  const months: Forecast["months"] = [];
  let active = currentActive;
  for (let h = 1; h <= horizon; h++) {
    const j = Math.max(0, Math.round(wj + sj * h));
    const l = Math.max(0, Math.round(wl + sl * h));
    const net = j - l;
    active += net;
    months.push({ label: `+${h}m`, net, projectedActive: active });
  }
  return { months, projectedActive: active, projectedNet: active - currentActive };
}

// Adapter for cross-functional attrition (leaver events with dept).
export function leaverEvents(snapshots: Snapshot[]): LeaverEvent[] {
  return deriveEmployeeEvents(snapshots)
    .filter((e) => e.event_type === "leaver")
    .map((e) => ({ employee_number: e.employee_number, event_date: e.event_date, department: e.department }));
}

export function buildMovement(snapshots: Snapshot[], opts: { activeHeadcount?: number } = {}): DomainMetrics {
  const snaps = employeeSnapshots(snapshots);
  const base = { kind: "people_movement", label: "Movement & Forecast" };
  if (snaps.length < 2) {
    return {
      ...base,
      hasData: false,
      blurb:
        `Movement and forecast need at least two monthly employee snapshots (you have ${snaps.length}). ` +
        "Upload an earlier month on Data Intake and joiner/leaver trends + a headcount forecast appear here automatically.",
      kpis: [],
      charts: [],
      tables: [],
      watchouts: [],
    };
  }
  const events = deriveEmployeeEvents(snaps);
  const movement = monthlyMovement(events);
  const currentActive = opts.activeHeadcount ?? snaps[snaps.length - 1].rows.filter(isWorking).length;
  const last = movement[movement.length - 1];
  const totalLeavers = events.filter((e) => e.event_type === "leaver").length;
  const totalJoiners = events.filter((e) => e.event_type === "joiner").length;
  const months = movement.length;
  const annualisedAttrition = currentActive ? (totalLeavers / months) * 12 / currentActive : 0;
  const forecast = forecastWorkforce(currentActive, movement);

  const kpis: MetricKPI[] = [
    { label: "Joiners (last month)", value: N.humanizeInt(last?.joiners ?? 0) },
    { label: "Leavers (last month)", value: N.humanizeInt(last?.leavers ?? 0) },
    { label: "Net (last month)", value: (last && last.net >= 0 ? "+" : "") + N.humanizeInt(last?.net ?? 0) },
    { label: "Annualised Attrition", value: N.formatPct(annualisedAttrition * 100), hint: `${totalLeavers} exits over ${months} mo` },
    { label: "Projected Active (+6m)", value: N.humanizeInt(forecast.projectedActive), hint: `${forecast.projectedNet >= 0 ? "+" : ""}${forecast.projectedNet} vs now` },
  ];

  const charts: ChartSpec[] = [
    { title: "Net movement by month", caption: "Joiners minus leavers.", kind: "line", labels: movement.map((m) => m.label), values: movement.map((m) => m.net) },
    { title: "Leavers by month", caption: "Monthly exits.", kind: "bar", labels: movement.map((m) => m.label), values: movement.map((m) => m.leavers) },
    { title: "Projected active headcount", caption: "Recency-weighted projection, next 6 months.", kind: "line", labels: forecast.months.map((m) => m.label), values: forecast.months.map((m) => m.projectedActive) },
  ];

  const tables: MetricTable[] = [
    {
      title: "Monthly movement",
      caption: "Joiners, leavers and net change per month (derived from snapshot diffs).",
      columns: ["Month", "Joiners", "Leavers", "Net"],
      rows: movement.map((m) => [m.label, m.joiners, m.leavers, (m.net >= 0 ? "+" : "") + m.net] as (string | number)[]),
    },
  ];

  const watchouts: MetricWatchout[] = [];
  if (forecast.projectedNet < 0) {
    watchouts.push({
      severity: forecast.projectedNet <= -10 ? "high" : "medium",
      title: "Projected net outflow over the forecast window",
      detail: `Headcount is projected to fall by ${Math.abs(forecast.projectedNet)} over the next 6 months on recent movement.`,
      actionHint: "Review hiring pipeline coverage and confirm replacement plans for critical roles.",
      owner: "Talent Acquisition",
    });
  }
  if (annualisedAttrition >= 0.2) {
    watchouts.push({
      severity: annualisedAttrition >= 0.3 ? "high" : "medium",
      title: "Elevated annualised attrition",
      detail: `Run-rate attrition is ${N.formatPct(annualisedAttrition * 100)} of active headcount.`,
      actionHint: "Investigate drivers by department/manager; prioritise retention where concentrated.",
      owner: "HR Leadership",
    });
  }

  return {
    ...base,
    hasData: true,
    blurb: `${totalJoiners} joiners and ${totalLeavers} leavers across ${months} month(s); projected ${forecast.projectedNet >= 0 ? "+" : ""}${forecast.projectedNet} over the next 6 months.`,
    kpis,
    charts,
    tables,
    watchouts,
  };
}
