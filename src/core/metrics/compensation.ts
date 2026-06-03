// Compensation analytics — pay distribution, pay-by-department, pay progression
// over tenure, dispersion and cost concentration. Joins per-employee pay
// (payroll_record gross) to the employee master (department + tenure). Pure +
// testable; degrades to a clear "awaiting payroll detail" state when no
// per-employee payroll is loaded (an aggregate can't show a distribution).

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";
import { median } from "./stats";

const KIND = "people_compensation";
const LABEL = "Compensation";

const str = (v: unknown) => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";
const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const dayMs = (v: unknown): number | null => {
  const t = Date.parse(str(v));
  return Number.isNaN(t) ? null : t;
};
const TENURE_ORDER = ["<6 months", "6-12 months", "1-2 years", "2-5 years", "5+ years"];
function tenureBand(days: number | null): string | null {
  if (days === null || days < 0) return null;
  if (days < 180) return "<6 months";
  if (days < 365) return "6-12 months";
  if (days < 730) return "1-2 years";
  if (days < 1825) return "2-5 years";
  return "5+ years";
}
// Nearest-rank percentile over an ascending-sorted array.
function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((sortedAsc.length - 1) * p)));
  return sortedAsc[i];
}

export interface CompensationInput {
  employeeRows: Row[];
  payrollRows?: Row[] | null;
  asOf?: string | null;
}

export function buildCompensation(input: CompensationInput): DomainMetrics {
  const empty = (msg: string): DomainMetrics => ({ kind: KIND, label: LABEL, hasData: false, blurb: msg, kpis: [], charts: [], tables: [], watchouts: [] });

  const grossByEmp = new Map<string, number>();
  for (const r of input.payrollRows ?? []) {
    const id = str(r["employee_number"]);
    const g = toNum(r["gross_monthly"]) ?? (toNum(r["ctc_annual"]) !== null ? (toNum(r["ctc_annual"]) as number) / 12 : null);
    if (id && g !== null && g > 0) grossByEmp.set(id, g);
  }
  if (grossByEmp.size === 0) {
    return empty("Compensation analytics needs per-employee pay. Upload a Payroll — Per-Employee Detail (payroll_record) file; the department aggregate can't reveal a distribution.");
  }

  const refMs = dayMs(input.asOf ?? null);
  const people = input.employeeRows
    .filter(isWorking)
    .map((r) => {
      const gross = grossByEmp.get(str(r["employee_number"])) ?? null;
      const j = dayMs(r["date_joined"]);
      const tenureDays = refMs !== null && j !== null ? Math.floor((refMs - j) / 86_400_000) : null;
      return { dept: str(r["department"]) || "Unspecified", gross, tenureDays };
    })
    .filter((p): p is { dept: string; gross: number; tenureDays: number | null } => p.gross !== null);

  if (people.length === 0) return empty("No active employees with pay data to analyse.");

  const all = people.map((p) => p.gross).sort((a, b) => a - b);
  const med = median(all) ?? 0;
  const p10 = percentile(all, 0.1);
  const p90 = percentile(all, 0.9);
  const dispersion = p10 > 0 ? p90 / p10 : 0;
  const total = all.reduce((s, x) => s + x, 0);
  const top10n = Math.max(1, Math.round(all.length * 0.1));
  const top10share = total > 0 ? all.slice(-top10n).reduce((s, x) => s + x, 0) / total : 0;

  const money = (n: number) => N.humanizeMoneyInr(Math.round(n));
  const kpis: MetricKPI[] = [
    { label: "Median Pay", value: money(med), hint: `monthly gross · ${people.length} active` },
    { label: "Pay Range (P10–P90)", value: `${money(p10)} – ${money(p90)}` },
    { label: "Pay Dispersion", value: `${dispersion.toFixed(1)}×`, hint: "P90 / P10 spread" },
    { label: "Top-10% Pay Share", value: N.formatPct(top10share * 100), hint: "of total monthly payroll" },
  ];

  // Median pay by department (≥3 to be meaningful).
  const byDept = new Map<string, number[]>();
  for (const p of people) byDept.set(p.dept, [...(byDept.get(p.dept) ?? []), p.gross]);
  const deptMed = [...byDept.entries()]
    .filter(([, xs]) => xs.length >= 3)
    .map(([dept, xs]) => ({ dept, n: xs.length, med: median(xs) ?? 0, p10: percentile([...xs].sort((a, b) => a - b), 0.1), p90: percentile([...xs].sort((a, b) => a - b), 0.9) }))
    .sort((a, b) => b.med - a.med);

  // Median pay by tenure band (pay progression).
  const byBand = new Map<string, number[]>();
  for (const p of people) {
    const b = tenureBand(p.tenureDays);
    if (b) byBand.set(b, [...(byBand.get(b) ?? []), p.gross]);
  }
  const bandMed = TENURE_ORDER.map((b) => ({ band: b, med: byBand.has(b) ? median(byBand.get(b)!) ?? 0 : 0, n: byBand.get(b)?.length ?? 0 }));

  const charts: ChartSpec[] = [];
  if (deptMed.length) {
    const top = deptMed.slice(0, 12);
    charts.push({ title: "Median pay by department", caption: "Monthly gross median per team (≥3 staff).", kind: "barh", labels: top.map((d) => d.dept), values: top.map((d) => Math.round(d.med)), drill: "department" });
  }
  if (bandMed.some((b) => b.n > 0)) {
    charts.push({ title: "Pay progression by tenure", caption: "Median monthly gross by tenure band — flat bars signal pay compression.", kind: "bar", labels: TENURE_ORDER, values: bandMed.map((b) => Math.round(b.med)) });
  }

  const tables: MetricTable[] = deptMed.length
    ? [{ title: "Pay by department", caption: "Median + P10–P90 monthly gross (departments with ≥3 staff).", columns: ["Department", "Staff", "Median", "P10", "P90"], rows: deptMed.map((d) => [d.dept, d.n, money(d.med), money(d.p10), money(d.p90)] as (string | number)[]) }]
    : [];

  const watchouts: MetricWatchout[] = [];
  if (dispersion >= 4) {
    watchouts.push({
      severity: dispersion >= 6 ? "high" : "medium",
      title: "Wide pay dispersion",
      detail: `Top earners make ${dispersion.toFixed(1)}× the bottom decile (P90 ${money(p90)} vs P10 ${money(p10)}).`,
      actionHint: "Check for off-band salaries and ensure pay ranges are defined and applied consistently.",
      owner: "Compensation",
    });
  }
  const early = bandMed.find((b) => b.band === "<6 months" || b.band === "6-12 months");
  const senior = bandMed.find((b) => b.band === "5+ years");
  if (early && senior && early.n >= 3 && senior.n >= 3 && early.med > 0 && senior.med <= early.med * 1.1) {
    watchouts.push({
      severity: "medium",
      title: "Pay compression across tenure",
      detail: `5+ year staff earn a median ${money(senior.med)} vs ${money(early.med)} for the newest joiners — little progression for experience.`,
      actionHint: "Review pay-progression curves and merit budgets; compression drives regrettable attrition of tenured staff.",
      owner: "Compensation",
    });
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `Median monthly gross ${money(med)} across ${people.length} active employees; P10–P90 ${money(p10)}–${money(p90)} (${dispersion.toFixed(1)}× spread). Top 10% take ${N.formatPct(top10share * 100)} of payroll.`,
    kpis,
    charts,
    tables,
    watchouts: watchouts.sort((a, b) => Number(b.severity === "high") - Number(a.severity === "high")),
  };
}
