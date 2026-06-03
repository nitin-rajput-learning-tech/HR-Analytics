// Rich employee-master analytics — the depth the original tool had on people
// data alone. Pure functions over the latest employee snapshot returning a set
// of tabbed sections (each a DomainMetrics: KPIs, charts, tables, watch-outs).
//
// Single-snapshot scope: headcount/org, tenure, diversity, geography, span of
// control, attrition & pending exits, data quality. (Movement & forecast need
// multi-month event history — added separately once ≥2 snapshots exist.)

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricWatchout } from "./base";
import { median, quantile } from "./stats";

export interface PeopleSection {
  key: string;
  label: string;
  metrics: DomainMetrics;
}

export const EMPLOYEE_FIELDS: { name: string; label: string }[] = [
  { name: "employee_number", label: "Employee Number" },
  { name: "full_name", label: "Full Name" },
  { name: "legal_entity", label: "Legal Entity" },
  { name: "last_working_day", label: "Last Working Day" },
  { name: "current_city", label: "Current City" },
  { name: "work_phone", label: "Work Phone" },
  { name: "work_email", label: "Work Email" },
  { name: "exit_requested_on", label: "Exit Requested On" },
  { name: "sub_department", label: "Sub Department" },
  { name: "gender", label: "Gender" },
  { name: "date_joined", label: "Date Joined" },
  { name: "employment_status", label: "Employment Status" },
  { name: "job_title", label: "Job Title" },
  { name: "l2_manager", label: "L2 Manager" },
  { name: "reporting_manager", label: "Reporting Manager" },
  { name: "department", label: "Department" },
];

const str = (v: unknown): string => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";
const isRelieved = (r: Row) => str(r["employment_status"]) === "Relieved";
const dim = (r: Row, f: string) => str(r[f]) || "Unspecified";

function dayMs(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}
function daysBetween(laterMs: number, earlierMs: number): number {
  return Math.floor((laterMs - earlierMs) / 86_400_000);
}
function tenureBand(days: number | null): string {
  if (days === null || Number.isNaN(days)) return "Unknown";
  if (days < 180) return "<6 months";
  if (days < 365) return "6-12 months";
  if (days < 730) return "1-2 years";
  if (days < 1825) return "2-5 years";
  return "5+ years";
}
const TENURE_ORDER = ["<6 months", "6-12 months", "1-2 years", "2-5 years", "5+ years"];
const EARLY_BANDS = new Set(["<6 months", "6-12 months"]);
const SEV_RANK: Record<MetricWatchout["severity"], number> = { high: 3, medium: 2, low: 1 };

function countByDim(rows: Row[], field: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(dim(r, field), (m.get(dim(r, field)) ?? 0) + 1);
  return m;
}
function topEntries(m: Map<string, number>, limit: number): [string, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// ---------------------------------------------------------------- overview
function overviewSection(rows: Row[], refMs: number | null): DomainMetrics {
  const total = rows.length;
  const active = rows.filter(isWorking);
  const relieved = rows.filter(isRelieved).length;
  const pending = refMs
    ? active.filter((r) => { const l = dayMs(r["last_working_day"]); return l !== null && l >= refMs; }).length
    : 0;
  const tenures = refMs
    ? active.map((r) => { const j = dayMs(r["date_joined"]); return j !== null ? daysBetween(refMs, j) : null; }).filter((d): d is number => d !== null)
    : [];
  const avgTenureYrs = tenures.length ? tenures.reduce((s, d) => s + d, 0) / tenures.length / 365 : null;

  const kpis: MetricKPI[] = [
    { label: "Active Headcount", value: N.humanizeInt(active.length), hint: `${N.formatPct(N.pct(active.length, total))} of records` },
    { label: "Total Records", value: N.humanizeInt(total) },
    { label: "Relieved", value: N.humanizeInt(relieved), hint: N.formatPct(N.pct(relieved, total)) },
    { label: "Pending Exits", value: N.humanizeInt(pending), hint: "active with a future last-working-day" },
    { label: "Departments", value: N.humanizeInt(countByDim(active, "department").size) },
    { label: "Avg Tenure (active)", value: avgTenureYrs === null ? "n/a" : `${avgTenureYrs.toFixed(1)} yrs` },
  ];
  const charts: ChartSpec[] = [
    { title: "Workforce status", caption: "Active vs relieved across all records.", kind: "pie", labels: ["Active", "Relieved", "Other"], values: [active.length, relieved, Math.max(0, total - active.length - relieved)] },
  ];
  const byDept = topEntries(countByDim(active, "department"), 12);
  if (byDept.length) {
    charts.push({ title: "Active headcount by department", caption: "Top departments by active staff.", kind: "barh", labels: byDept.map((e) => e[0]), values: byDept.map((e) => e[1]), drill: "department" });
  }
  return {
    kind: "people_overview", label: "Overview", hasData: total > 0,
    blurb: `${N.humanizeInt(active.length)} active of ${N.humanizeInt(total)} (${N.formatPct(N.pct(active.length, total))})` + (pending ? `, ${pending} pending exit(s)` : "") + ".",
    kpis, charts, tables: [], watchouts: [],
  };
}

// ---------------------------------------------------------------- headcount & org
function headcountSection(rows: Row[]): DomainMetrics {
  const active = rows.filter(isWorking);
  const byDept = countByDim(active, "department");
  const byEntity = countByDim(active, "legal_entity");
  const bySub = countByDim(active, "sub_department");
  const byTitle = countByDim(active, "job_title");
  const largest = topEntries(byDept, 1)[0];

  const kpis: MetricKPI[] = [
    { label: "Departments", value: N.humanizeInt(byDept.size) },
    { label: "Sub-departments", value: N.humanizeInt(bySub.size) },
    { label: "Legal Entities", value: N.humanizeInt(byEntity.size) },
    { label: "Distinct Job Titles", value: N.humanizeInt(byTitle.size) },
    { label: "Largest Department", value: largest ? largest[0] : "n/a", hint: largest ? `${largest[1]} active` : undefined },
  ];
  const deptRows = topEntries(byDept, 20);
  const charts: ChartSpec[] = [
    { title: "Active headcount by department", caption: "Active staff per department.", kind: "barh", labels: deptRows.map((e) => e[0]), values: deptRows.map((e) => e[1]), drill: "department" },
    { title: "Headcount by legal entity", caption: "Active staff split by entity.", kind: "pie", labels: topEntries(byEntity, 8).map((e) => e[0]), values: topEntries(byEntity, 8).map((e) => e[1]), drill: "legal_entity" },
  ];
  const topTitles = topEntries(byTitle, 12);
  if (topTitles.length) charts.push({ title: "Top job titles", caption: "Most common active roles.", kind: "barh", labels: topTitles.map((e) => e[0]), values: topTitles.map((e) => e[1]) });

  // department × active/relieved/total table
  const deptAgg = new Map<string, { active: number; relieved: number; total: number }>();
  for (const r of rows) {
    const d = dim(r, "department");
    const a = deptAgg.get(d) ?? { active: 0, relieved: 0, total: 0 };
    a.total += 1; if (isWorking(r)) a.active += 1; else if (isRelieved(r)) a.relieved += 1;
    deptAgg.set(d, a);
  }
  const tableRows = [...deptAgg.entries()].sort((a, b) => b[1].active - a[1].active)
    .map(([d, a]) => [d, a.active, a.relieved, a.total, `${N.formatPct(N.pct(a.active, a.total))}`] as (string | number)[]);

  return {
    kind: "people_headcount", label: "Headcount & Org", hasData: active.length > 0,
    blurb: `${N.humanizeInt(active.length)} active staff across ${byDept.size} departments and ${byEntity.size} legal entit${byEntity.size === 1 ? "y" : "ies"}.`,
    kpis, charts,
    tables: [{ title: "Department breakdown", caption: "Active, relieved and total by department.", columns: ["Department", "Active", "Relieved", "Total", "Active %"], rows: tableRows }],
    watchouts: [],
  };
}

// ---------------------------------------------------------------- tenure
function tenureSection(rows: Row[], refMs: number | null): DomainMetrics {
  const active = rows.filter(isWorking);
  const activeTenure = refMs ? active.map((r) => { const j = dayMs(r["date_joined"]); return j !== null ? daysBetween(refMs, j) : null; }) : [];
  const valid = activeTenure.filter((d): d is number => d !== null);
  const bandCounts = new Map<string, number>(TENURE_ORDER.map((b) => [b, 0]));
  for (const d of activeTenure) { const b = tenureBand(d); if (bandCounts.has(b)) bandCounts.set(b, (bandCounts.get(b) ?? 0) + 1); }
  const avgYrs = valid.length ? valid.reduce((s, d) => s + d, 0) / valid.length / 365 : null;
  const earlyShare = valid.length ? valid.filter((d) => d < 365).length / valid.length : 0;
  const veteranShare = valid.length ? valid.filter((d) => d >= 1825).length / valid.length : 0;
  // Median + interquartile range describe the actual spread; a long-tenured tail
  // can pull the mean well above where most of the team sits.
  const medDays = median(valid);
  const p25Days = quantile(valid, 0.25);
  const p75Days = quantile(valid, 0.75);
  const yrs = (d: number | null): string => (d === null ? "n/a" : `${(d / 365).toFixed(1)} yrs`);

  // exit tenure for relieved
  const exitTenure = rows.filter(isRelieved).map((r) => { const j = dayMs(r["date_joined"]); const l = dayMs(r["last_working_day"]); return j !== null && l !== null ? daysBetween(l, j) : null; });
  const exitBands = new Map<string, number>(TENURE_ORDER.map((b) => [b, 0]));
  for (const d of exitTenure) { const b = tenureBand(d); if (exitBands.has(b)) exitBands.set(b, (exitBands.get(b) ?? 0) + 1); }

  const kpis: MetricKPI[] = [
    { label: "Avg Tenure (active)", value: avgYrs === null ? "n/a" : `${avgYrs.toFixed(1)} yrs` },
    { label: "Median Tenure", value: yrs(medDays), hint: medDays === null ? undefined : `IQR ${yrs(p25Days)}–${yrs(p75Days)}` },
    { label: "< 1 year", value: N.formatPct(earlyShare * 100), hint: `${valid.filter((d) => d < 365).length} people` },
    { label: "5+ years", value: N.formatPct(veteranShare * 100), hint: `${valid.filter((d) => d >= 1825).length} people` },
  ];
  const charts: ChartSpec[] = [
    { title: "Active tenure distribution", caption: "Active staff by tenure band.", kind: "bar", labels: TENURE_ORDER, values: TENURE_ORDER.map((b) => bandCounts.get(b) ?? 0) },
  ];
  if (exitTenure.some((d) => d !== null)) charts.push({ title: "Tenure at exit (relieved)", caption: "How long leavers stayed.", kind: "bar", labels: TENURE_ORDER, values: TENURE_ORDER.map((b) => exitBands.get(b) ?? 0) });

  // avg tenure by department
  const deptT = new Map<string, number[]>();
  active.forEach((r, i) => { const d = dim(r, "department"); const t = activeTenure[i]; if (t !== null && t !== undefined) { const arr = deptT.get(d) ?? []; arr.push(t); deptT.set(d, arr); } });
  const deptRows = [...deptT.entries()].map(([d, arr]) => [d, arr.length, (arr.reduce((s, x) => s + x, 0) / arr.length / 365).toFixed(1), `${Math.round((arr.filter((x) => x < 365).length / arr.length) * 100)}%`] as (string | number)[])
    .sort((a, b) => Number(b[2]) - Number(a[2]));

  const watchouts: MetricWatchout[] = [];
  // early-tenure concentration by department (ported: share >= 0.45)
  for (const [d, arr] of deptT) {
    if (arr.length < 12) continue;
    const share = arr.filter((x) => x < 365).length / arr.length;
    if (share >= 0.45) {
      watchouts.push({
        severity: share >= 0.6 ? "high" : "medium",
        title: `High concentration of newer employees in ${d}`,
        detail: `${N.formatPct(share * 100)} of ${d} (${arr.filter((x) => x < 365).length}/${arr.length}) have under a year of tenure.`,
        actionHint: "Coordinate onboarding support, shadowing and manager check-ins for this team.",
        owner: "Manager",
      });
    }
  }
  return {
    kind: "people_tenure", label: "Tenure", hasData: valid.length > 0,
    blurb: avgYrs === null ? "Tenure needs date-joined data." : `Average active tenure ${avgYrs.toFixed(1)} years${medDays === null ? "" : ` (median ${(medDays / 365).toFixed(1)})`}; ${N.formatPct(earlyShare * 100)} under a year.`,
    kpis, charts,
    tables: [{ title: "Tenure by department", caption: "Average tenure (years) and early-tenure share.", columns: ["Department", "Active", "Avg Tenure (yrs)", "% < 1yr"], rows: deptRows }],
    watchouts: watchouts.slice(0, 4),
  };
}

// ---------------------------------------------------------------- diversity
function diversitySection(rows: Row[]): DomainMetrics {
  const active = rows.filter(isWorking);
  if (!active.length || !active.some((r) => "gender" in r)) {
    return { kind: "people_diversity", label: "Diversity", hasData: false, blurb: "Gender data not available in this upload.", kpis: [], charts: [], tables: [], watchouts: [] };
  }
  const g = (r: Row) => { const v = str(r["gender"]).toLowerCase(); return v === "female" ? "Female" : v === "male" ? "Male" : v ? "Other" : "Unspecified"; };
  const counts = new Map<string, number>();
  for (const r of active) counts.set(g(r), (counts.get(g(r)) ?? 0) + 1);
  const female = counts.get("Female") ?? 0;
  const male = counts.get("Male") ?? 0;
  const femaleShare = N.pct(female, active.length);

  const kpis: MetricKPI[] = [
    { label: "Female", value: N.formatPct(femaleShare), hint: `${female} of ${active.length}` },
    { label: "Male", value: N.formatPct(N.pct(male, active.length)), hint: `${male}` },
    { label: "Other / Unspecified", value: N.humanizeInt(active.length - female - male) },
  ];
  const charts: ChartSpec[] = [
    { title: "Gender mix (active)", caption: "Overall gender distribution.", kind: "pie", labels: [...counts.keys()], values: [...counts.values()] },
  ];
  // female share by department
  const deptAgg = new Map<string, { f: number; n: number }>();
  for (const r of active) { const d = dim(r, "department"); const a = deptAgg.get(d) ?? { f: 0, n: 0 }; a.n += 1; if (g(r) === "Female") a.f += 1; deptAgg.set(d, a); }
  const deptRows = [...deptAgg.entries()].sort((a, b) => b[1].n - a[1].n)
    .map(([d, a]) => [d, a.n, a.f, `${N.formatPct(N.pct(a.f, a.n))}`] as (string | number)[]);
  const shareByDept = [...deptAgg.entries()].filter(([, a]) => a.n >= 5).sort((a, b) => (a[1].f / a[1].n) - (b[1].f / b[1].n));
  if (shareByDept.length) charts.push({ title: "Female share by department", caption: "Lowest representation first (≥5 staff).", kind: "barh", labels: shareByDept.slice(0, 12).map((e) => e[0]), values: shareByDept.slice(0, 12).map((e) => Math.round((e[1].f / e[1].n) * 1000) / 10), drill: "department" });

  const watchouts: MetricWatchout[] = [];
  for (const [d, a] of deptAgg) {
    if (a.n >= 20 && N.pct(a.f, a.n)! < 12) {
      watchouts.push({ severity: "medium", title: `Low representation in ${d}`, detail: `Female share in ${d} is ${N.formatPct(N.pct(a.f, a.n))} (${a.f}/${a.n}).`, actionHint: "Review hiring slate balance and retention for this team.", owner: "HR Leadership" });
    }
  }
  return {
    kind: "people_diversity", label: "Diversity", hasData: true,
    blurb: `Female representation ${N.formatPct(femaleShare)} of active staff.`,
    kpis, charts,
    tables: [{ title: "Gender by department", caption: "Active staff and female share by department.", columns: ["Department", "Active", "Female", "Female %"], rows: deptRows }],
    watchouts: watchouts.slice(0, 4),
  };
}

// ---------------------------------------------------------------- geography
function geographySection(rows: Row[]): DomainMetrics {
  const active = rows.filter(isWorking);
  if (!active.some((r) => "current_city" in r)) {
    return { kind: "people_geography", label: "Geography", hasData: false, blurb: "Location data not available in this upload.", kpis: [], charts: [], tables: [], watchouts: [] };
  }
  const byCity = countByDim(active, "current_city");
  const remote = [...byCity.entries()].filter(([c]) => /remote|wfh/i.test(c)).reduce((s, e) => s + e[1], 0);
  const top = topEntries(byCity, 1)[0];
  const kpis: MetricKPI[] = [
    { label: "Locations", value: N.humanizeInt(byCity.size) },
    { label: "Top Location", value: top ? top[0] : "n/a", hint: top ? `${top[1]} staff` : undefined },
    { label: "Remote", value: N.formatPct(N.pct(remote, active.length)), hint: `${remote} staff` },
  ];
  const cityRows = topEntries(byCity, 15);
  return {
    kind: "people_geography", label: "Geography", hasData: true,
    blurb: `Active staff spread across ${byCity.size} location(s).`,
    kpis,
    charts: [{ title: "Headcount by location", caption: "Active staff per city (top 15).", kind: "barh", labels: cityRows.map((e) => e[0]), values: cityRows.map((e) => e[1]), drill: "current_city" }],
    tables: [{ title: "Locations", caption: "Active staff by city.", columns: ["City", "Active"], rows: cityRows.map((e) => [e[0], e[1]] as (string | number)[]) }],
    watchouts: [],
  };
}

// ---------------------------------------------------------------- managers / span of control
function managersSection(rows: Row[], refMs: number | null): DomainMetrics {
  const active = rows.filter(isWorking);
  if (!active.some((r) => "reporting_manager" in r)) {
    return { kind: "people_managers", label: "Managers", hasData: false, blurb: "Reporting-manager data not available in this upload.", kpis: [], charts: [], tables: [], watchouts: [] };
  }
  const agg = new Map<string, { size: number; pending: number; early: number }>();
  for (const r of active) {
    const m = dim(r, "reporting_manager");
    const a = agg.get(m) ?? { size: 0, pending: 0, early: 0 };
    a.size += 1;
    const l = dayMs(r["last_working_day"]);
    if (refMs && l !== null && l >= refMs) a.pending += 1;
    const j = dayMs(r["date_joined"]);
    if (refMs && j !== null && EARLY_BANDS.has(tenureBand(daysBetween(refMs, j)))) a.early += 1;
    agg.set(m, a);
  }
  const managers = [...agg.entries()].filter(([m]) => m !== "Unspecified");
  const spans = managers.map(([, a]) => a.size);
  const avgSpan = spans.length ? spans.reduce((s, x) => s + x, 0) / spans.length : 0;
  const large = managers.filter(([, a]) => a.size >= 15);

  const kpis: MetricKPI[] = [
    { label: "People Managers", value: N.humanizeInt(managers.length) },
    { label: "Avg Span", value: avgSpan ? avgSpan.toFixed(1) : "n/a" },
    { label: "Max Span", value: N.humanizeInt(spans.length ? Math.max(...spans) : 0) },
    { label: "Large Spans (≥15)", value: N.humanizeInt(large.length) },
  ];
  const top = managers.sort((a, b) => b[1].size - a[1].size).slice(0, 15);
  const tableRows = top.map(([m, a]) => [m, a.size, a.pending, `${N.formatPct(N.pct(a.early, a.size))}`] as (string | number)[]);
  const charts: ChartSpec[] = [{ title: "Largest teams", caption: "Span of control (top 15 managers).", kind: "barh", labels: top.map((e) => e[0]), values: top.map((e) => e[1].size), drill: "reporting_manager" }];

  const watchouts: MetricWatchout[] = [];
  for (const [m, a] of large) {
    const earlyShare = a.size ? a.early / a.size : 0;
    if (a.pending >= 2 || earlyShare >= 0.35) {
      watchouts.push({
        severity: a.size >= 20 && (a.pending >= 3 || earlyShare >= 0.4) ? "high" : "medium",
        title: `Large span with elevated support load — ${m}`,
        detail: `Team ${a.size}; ${a.pending} pending exit(s); ${N.formatPct(earlyShare * 100)} early-tenure.`,
        actionHint: "Review manager support load, succession coverage and whether the team needs extra leadership capacity.",
        owner: "Business Leader",
      });
    }
  }
  return {
    kind: "people_managers", label: "Managers", hasData: managers.length > 0,
    blurb: `${managers.length} people managers; average span ${avgSpan.toFixed(1)}.`,
    kpis, charts,
    tables: [{ title: "Span of control", caption: "Team size, pending exits and early-tenure share (top 15).", columns: ["Reporting Manager", "Team", "Pending Exits", "% Early-tenure"], rows: tableRows }],
    watchouts: watchouts.slice(0, 5),
  };
}

// ---------------------------------------------------------------- attrition & pending exits
function attritionSection(rows: Row[], refMs: number | null): DomainMetrics {
  const active = rows.filter(isWorking);
  const relieved = rows.filter(isRelieved);
  const pending = refMs ? active.filter((r) => { const l = dayMs(r["last_working_day"]); return l !== null && l >= refMs; }) : [];
  const next30 = refMs ? pending.filter((r) => { const l = dayMs(r["last_working_day"])!; return l <= refMs + 30 * 86_400_000; }).length : 0;
  const next90 = refMs ? pending.filter((r) => { const l = dayMs(r["last_working_day"])!; return l <= refMs + 90 * 86_400_000; }).length : 0;

  const kpis: MetricKPI[] = [
    { label: "Pending Exits", value: N.humanizeInt(pending.length), hint: "active with a future LWD" },
    { label: "Next 30 days", value: N.humanizeInt(next30) },
    { label: "Next 90 days", value: N.humanizeInt(next90) },
    { label: "Relieved (in file)", value: N.humanizeInt(relieved.length) },
  ];
  const charts: ChartSpec[] = [];
  const watchouts: MetricWatchout[] = [];

  // pending exits by department + risk rate
  if (pending.length) {
    const pendByDept = countByDim(pending, "department");
    const activeByDept = countByDim(active, "department");
    const pr = topEntries(pendByDept, 12);
    charts.push({ title: "Pending exits by department", caption: "Upcoming exits (active, future LWD).", kind: "barh", labels: pr.map((e) => e[0]), values: pr.map((e) => e[1]), drill: "department" });
    for (const [d, p] of pendByDept) {
      const a = activeByDept.get(d) ?? 0;
      if (a < 8) continue;
      const risk = p / a;
      if (risk >= 0.1 || p >= 4) {
        watchouts.push({
          severity: risk >= 0.2 || p >= 6 ? "high" : "medium",
          title: `Elevated exit pressure in ${d}`,
          detail: `${p} pending exit(s) of ${a} active (${N.formatPct(risk * 100)} risk rate).`,
          actionHint: "Check succession coverage, recruiting backfill and manager-specific retention context.",
          owner: "HRBP",
        });
      }
    }
  }
  if (relieved.length) {
    const relByDept = topEntries(countByDim(relieved, "department"), 12);
    charts.push({ title: "Relieved by department (in file)", caption: "Historical exits present in this snapshot.", kind: "barh", labels: relByDept.map((e) => e[0]), values: relByDept.map((e) => e[1]), drill: "department" });
  }
  const pendTable = pending
    .map((r) => [str(r["employee_number"]), dim(r, "department"), str(r["job_title"]), str(r["last_working_day"])] as (string | number)[])
    .sort((a, b) => String(a[3]).localeCompare(String(b[3])))
    .slice(0, 20);

  return {
    kind: "people_attrition", label: "Attrition & Exits", hasData: active.length > 0,
    blurb: `${pending.length} pending exit(s); ${relieved.length} relieved in this file.`,
    kpis, charts,
    tables: pendTable.length ? [{ title: "Upcoming exits", caption: "Active employees with a future last-working-day.", columns: ["Employee", "Department", "Job Title", "Last Working Day"], rows: pendTable }] : [],
    watchouts: watchouts.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]).slice(0, 5),
  };
}

// ---------------------------------------------------------------- data quality
function dataQualitySection(rows: Row[]): DomainMetrics {
  const total = rows.length;
  const recs = EMPLOYEE_FIELDS.map((f) => {
    const filled = rows.filter((r) => str(r[f.name]) !== "").length;
    return { ...f, filled, nulls: total - filled, completeness: total ? filled / total : 0 };
  });
  const avgCompleteness = recs.length ? recs.reduce((s, r) => s + r.completeness, 0) / recs.length : 0;
  const incomplete = recs.filter((r) => r.completeness < 0.9);

  const kpis: MetricKPI[] = [
    { label: "Fields", value: N.humanizeInt(recs.length) },
    { label: "Avg Completeness", value: N.formatPct(avgCompleteness * 100) },
    { label: "Fields < 90% complete", value: N.humanizeInt(incomplete.length) },
  ];
  const worst = recs.filter((r) => r.nulls > 0).sort((a, b) => a.completeness - b.completeness).slice(0, 12);
  const charts: ChartSpec[] = worst.length
    ? [{ title: "Field completeness", caption: "Lowest-completeness fields first.", kind: "barh", labels: worst.map((r) => r.label), values: worst.map((r) => Math.round(r.completeness * 1000) / 10) }]
    : [];
  const tableRows = recs.sort((a, b) => a.completeness - b.completeness)
    .map((r) => [r.label, r.filled, r.nulls, `${N.formatPct(r.completeness * 100)}`] as (string | number)[]);

  const watchouts: MetricWatchout[] = [];
  const KEY = new Set(["department", "date_joined", "employment_status", "reporting_manager", "employee_number"]);
  for (const r of recs) {
    if (KEY.has(r.name) && r.completeness < 0.95) {
      watchouts.push({ severity: r.completeness < 0.8 ? "high" : "medium", title: `Key field incomplete: ${r.label}`, detail: `${r.label} is ${N.formatPct(r.completeness * 100)} complete (${r.nulls} missing).`, actionHint: "Backfill this field at source — downstream analytics depend on it.", owner: "HR Operations" });
    }
  }
  return {
    kind: "people_quality", label: "Data Quality", hasData: total > 0,
    blurb: `Average field completeness ${N.formatPct(avgCompleteness * 100)} across ${recs.length} fields.`,
    kpis, charts,
    tables: [{ title: "Field completeness", caption: "Filled, missing and completeness per field.", columns: ["Field", "Filled", "Missing", "Complete %"], rows: tableRows }],
    watchouts: watchouts.slice(0, 5),
  };
}

// ---------------------------------------------------------------- directory
const DIRECTORY_CAP = 1000;
const DIRECTORY_COLS: [string, string][] = [
  ["employee_number", "Employee #"],
  ["full_name", "Name"],
  ["department", "Department"],
  ["sub_department", "Sub-dept"],
  ["job_title", "Job Title"],
  ["current_city", "Location"],
  ["employment_status", "Status"],
  ["date_joined", "Date Joined"],
  ["reporting_manager", "Reporting Manager"],
];

export function directorySection(rows: Row[]): DomainMetrics {
  const active = rows.filter(isWorking).length;
  const shown = rows.slice(0, DIRECTORY_CAP);
  const tableRows = shown.map((r) => DIRECTORY_COLS.map(([k]) => str(r[k]) || "—")) as (string | number)[][];
  return {
    kind: "people_directory",
    label: "Directory",
    hasData: rows.length > 0,
    blurb: `${rows.length.toLocaleString("en-IN")} matching employee(s) — ${active.toLocaleString("en-IN")} active. Search, sort and export from the table below (or the filter bar's Export CSV).`,
    kpis: [
      { label: "Matching", value: N.humanizeInt(rows.length) },
      { label: "Active", value: N.humanizeInt(active) },
    ],
    charts: [],
    tables: [
      {
        title: "Employee directory",
        caption:
          rows.length > DIRECTORY_CAP
            ? `Showing the first ${DIRECTORY_CAP} of ${rows.length.toLocaleString("en-IN")} — narrow with the filters/search above, or use Export CSV for the full set.`
            : `${rows.length.toLocaleString("en-IN")} employee(s).`,
        columns: DIRECTORY_COLS.map((c) => c[1]),
        rows: tableRows,
      },
    ],
    watchouts: [],
  };
}

// ---------------------------------------------------------------- retention & quality of hire
function retentionSection(rows: Row[]): DomainMetrics {
  const median = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // Tenure-at-exit for leavers present in the file (how long they stayed).
  const exitTenures = rows
    .filter(isRelieved)
    .map((r) => { const j = dayMs(r["date_joined"]); const l = dayMs(r["last_working_day"]); return j !== null && l !== null && l >= j ? daysBetween(l, j) : null; })
    .filter((d): d is number => d !== null);

  // Quality-of-hire signals — robust from a current snapshot, since recent
  // leavers (short tenure) are still present even if old leavers are purged.
  const early = exitTenures.filter((d) => d < 365).length;
  const earlyShare = exitTenures.length ? early / exitTenures.length : null;
  const exits90 = exitTenures.filter((d) => d < 90).length;
  const medExit = median(exitTenures);
  const yrs = (d: number | null) => (d === null ? "n/a" : `${(d / 365).toFixed(1)} yrs`);

  const kpis: MetricKPI[] = [
    { label: "Exits Analysed", value: N.humanizeInt(exitTenures.length), hint: "leavers with join + exit dates" },
    { label: "First-Year Exit Share", value: earlyShare === null ? "n/a" : N.formatPct(earlyShare * 100), hint: `${early} of ${exitTenures.length} leavers left < 12 months in` },
    { label: "90-Day Exits", value: N.humanizeInt(exits90), hint: "left within 3 months of joining" },
    { label: "Median Tenure at Exit", value: yrs(medExit) },
  ];

  const charts: ChartSpec[] = [];

  // Exit-timing curve: leavers bucketed by how long they stayed.
  if (exitTenures.length) {
    const bands = new Map<string, number>();
    for (const d of exitTenures) bands.set(tenureBand(d), (bands.get(tenureBand(d)) ?? 0) + 1);
    charts.push({
      title: "Exits by tenure at departure",
      caption: "When leavers left, by how long they had stayed. Heavy early bars point to quality-of-hire / onboarding gaps.",
      kind: "bar",
      labels: TENURE_ORDER,
      values: TENURE_ORDER.map((b) => bands.get(b) ?? 0),
    });
  }

  // Retention by joining cohort (year).
  const cohorts = new Map<string, { joined: number; active: number }>();
  for (const r of rows) {
    const j = dayMs(r["date_joined"]);
    if (j === null) continue;
    const year = String(new Date(j).getUTCFullYear());
    const c = cohorts.get(year) ?? { joined: 0, active: 0 };
    c.joined += 1;
    if (isWorking(r)) c.active += 1;
    cohorts.set(year, c);
  }
  const cohortRows = [...cohorts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (cohortRows.length) {
    charts.push({
      title: "Retention by joining cohort",
      caption: "Share of each joining year still active. Recent cohorts read most reliably — older ones can be inflated by past leavers no longer in the file.",
      kind: "bar",
      labels: cohortRows.map(([y]) => y),
      values: cohortRows.map(([, c]) => Math.round((c.joined ? c.active / c.joined : 0) * 1000) / 10),
    });
  }
  const cohortTable = cohortRows
    .map(([y, c]) => [y, c.joined, c.active, c.joined - c.active, N.formatPct(N.pct(c.active, c.joined))] as (string | number)[])
    .reverse()
    .slice(0, 10);

  const watchouts: MetricWatchout[] = [];
  if (earlyShare !== null && exitTenures.length >= 10 && earlyShare >= 0.3) {
    watchouts.push({
      severity: earlyShare >= 0.45 ? "high" : "medium",
      title: "High share of first-year exits (quality-of-hire risk)",
      detail: `${N.formatPct(earlyShare * 100)} of analysed exits left within their first year (${early}/${exitTenures.length}).`,
      actionHint: "Review sourcing channels, role-fit screening and the 90-day onboarding for the most-affected teams.",
      owner: "Talent Acquisition",
    });
  }
  if (exits90 >= 5) {
    watchouts.push({
      severity: exits90 >= 12 ? "high" : "medium",
      title: "Early (90-day) exits",
      detail: `${exits90} employee(s) left within 3 months of joining.`,
      actionHint: "Audit onboarding, manager readiness and offer-to-role expectation gaps.",
      owner: "HRBP",
    });
  }

  return {
    kind: "people_retention",
    label: "Retention",
    hasData: exitTenures.length > 0 || cohortRows.length > 0,
    blurb:
      earlyShare === null
        ? "Add join + exit dates (date_joined, last_working_day) to analyse retention and quality of hire."
        : `${N.formatPct(earlyShare * 100)} of ${exitTenures.length} analysed exits left within their first year; median stay ${yrs(medExit)}.`,
    kpis,
    charts,
    tables: cohortTable.length
      ? [{ title: "Joining cohorts", caption: "Retention by joining year (recent cohorts read most reliably).", columns: ["Cohort (year)", "Joined", "Still active", "Departed", "Retention"], rows: cohortTable }]
      : [],
    watchouts: watchouts.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]),
  };
}

export function buildPeople(rows: Row[] | null | undefined, asOf: string | null): PeopleSection[] {
  if (!rows || rows.length === 0) return [];
  const refMs = dayMs(asOf);
  return [
    { key: "overview", label: "Overview", metrics: overviewSection(rows, refMs) },
    { key: "headcount", label: "Headcount & Org", metrics: headcountSection(rows) },
    { key: "tenure", label: "Tenure", metrics: tenureSection(rows, refMs) },
    { key: "diversity", label: "Diversity", metrics: diversitySection(rows) },
    { key: "geography", label: "Geography", metrics: geographySection(rows) },
    { key: "managers", label: "Managers", metrics: managersSection(rows, refMs) },
    { key: "attrition", label: "Attrition & Exits", metrics: attritionSection(rows, refMs) },
    { key: "retention", label: "Retention", metrics: retentionSection(rows) },
    { key: "quality", label: "Data Quality", metrics: dataQualitySection(rows) },
  ];
}

// Roll all people watch-outs up for the newsletter / exec brief.
export function peopleWatchouts(rows: Row[] | null | undefined, asOf: string | null): MetricWatchout[] {
  return buildPeople(rows, asOf).flatMap((s) => s.metrics.watchouts);
}
