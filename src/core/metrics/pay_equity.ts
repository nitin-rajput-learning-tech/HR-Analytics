// Pay-equity analysis — gender pay gap by department + a remediation-cost
// simulator. Rides the EU Pay Transparency Directive, which requires employers
// to justify (and close) a gender pay gap above 5% within a category of workers.
//
// Joins per-employee pay (payroll_record gross) to gender from the employee
// master. Pure + testable; degrades to a clear "awaiting payroll detail" state
// when no per-employee payroll is loaded (the aggregate can't show gaps).

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";
import { median } from "./stats";

const KIND = "people_pay_equity";
const LABEL = "Pay Equity";
const GAP_THRESHOLD = 0.05; // EU Pay Transparency Directive: >5% needs justification
const MIN_PER_GENDER = 3; // need a few of each gender for a meaningful median

const str = (v: unknown) => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";
const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const genderOf = (r: Row): "Female" | "Male" | null => {
  const g = str(r["gender"]).toLowerCase();
  return g === "female" ? "Female" : g === "male" ? "Male" : null;
};

export interface PayEquityInput {
  employeeRows: Row[];
  payrollRows?: Row[] | null;
}

interface DeptGap {
  dept: string;
  female: number[];
  male: number[];
  femaleMed: number;
  maleMed: number;
  gap: number; // (maleMed - femaleMed) / maleMed; positive ⇒ women paid less
}

export function buildPayEquity(input: PayEquityInput): DomainMetrics {
  const empty = (msg: string): DomainMetrics => ({ kind: KIND, label: LABEL, hasData: false, blurb: msg, kpis: [], charts: [], tables: [], watchouts: [] });

  const grossByEmp = new Map<string, number>();
  for (const r of input.payrollRows ?? []) {
    const id = str(r["employee_number"]);
    const g = toNum(r["gross_monthly"]) ?? (toNum(r["ctc_annual"]) !== null ? (toNum(r["ctc_annual"]) as number) / 12 : null);
    if (id && g !== null && g > 0) grossByEmp.set(id, g);
  }
  if (grossByEmp.size === 0) {
    return empty("Pay equity needs per-employee pay. Upload a Payroll — Per-Employee Detail (payroll_record) file; the department aggregate can't reveal individual gaps.");
  }

  // Join pay + gender (+ role for like-for-like) for active employees.
  const people = input.employeeRows
    .filter(isWorking)
    .map((r) => ({ dept: str(r["department"]) || "Unspecified", role: str(r["job_title"]) || "Unspecified", gender: genderOf(r), gross: grossByEmp.get(str(r["employee_number"])) ?? null }))
    .filter((p): p is { dept: string; role: string; gender: "Female" | "Male"; gross: number } => p.gender !== null && p.gross !== null);

  if (people.length === 0 || !people.some((p) => p.gender === "Female") || !people.some((p) => p.gender === "Male")) {
    return empty("Pay equity needs both male and female employees with pay data to compare.");
  }

  const med = (xs: number[]) => median(xs) ?? 0;
  const femaleAll = people.filter((p) => p.gender === "Female").map((p) => p.gross);
  const maleAll = people.filter((p) => p.gender === "Male").map((p) => p.gross);
  const femMed = med(femaleAll);
  const maleMed = med(maleAll);
  const overallGap = maleMed > 0 ? (maleMed - femMed) / maleMed : 0;

  // Per-department gaps (where both genders are represented enough to compare).
  const byDept = new Map<string, DeptGap>();
  for (const p of people) {
    const d = byDept.get(p.dept) ?? { dept: p.dept, female: [], male: [], femaleMed: 0, maleMed: 0, gap: 0 };
    (p.gender === "Female" ? d.female : d.male).push(p.gross);
    byDept.set(p.dept, d);
  }
  const deptGaps: DeptGap[] = [];
  for (const d of byDept.values()) {
    if (d.female.length < MIN_PER_GENDER || d.male.length < MIN_PER_GENDER) continue;
    d.femaleMed = med(d.female);
    d.maleMed = med(d.male);
    d.gap = d.maleMed > 0 ? (d.maleMed - d.femaleMed) / d.maleMed : 0;
    deptGaps.push(d);
  }
  deptGaps.sort((a, b) => b.gap - a.gap);
  const flagged = deptGaps.filter((d) => Math.abs(d.gap) > GAP_THRESHOLD);

  // Remediation: within each comparable department, raise the lower-paid gender's
  // members up to the higher-paid gender's median. Monthly; annualised ×12.
  let remediationMonthly = 0;
  for (const d of deptGaps) {
    const target = Math.max(d.femaleMed, d.maleMed);
    const under = d.femaleMed <= d.maleMed ? d.female : d.male;
    for (const pay of under) remediationMonthly += Math.max(0, target - pay);
  }
  const remediationAnnual = remediationMonthly * 12;

  // Pay quartiles (UK gender-pay-gap-reporting style): rank everyone by pay, split
  // into four equal bands, and measure women's share in each. A top quartile far
  // below the overall female share is the "glass ceiling" — under-representation in
  // the best-paid roles, which raw medians can hide.
  const overallFemalePct = (femaleAll.length / people.length) * 100;
  const ranked = [...people].sort((a, b) => a.gross - b.gross);
  const quartiles = [0, 1, 2, 3].map((q) => {
    const slice = ranked.slice(Math.floor((q * ranked.length) / 4), Math.floor(((q + 1) * ranked.length) / 4));
    const female = slice.filter((p) => p.gender === "Female").length;
    return { q: q + 1, n: slice.length, female, femalePct: slice.length ? (female / slice.length) * 100 : 0 };
  });
  const topQuartileFemalePct = quartiles[3].femalePct;

  // Like-for-like: the gap WITHIN a job title (a "category of workers" the EU
  // directive cares about), which strips out role-mix. Often materially smaller
  // than the raw gap — and where it isn't, that's the indefensible part.
  const byRole = new Map<string, { female: number[]; male: number[] }>();
  for (const p of people) {
    const e = byRole.get(p.role) ?? { female: [], male: [] };
    (p.gender === "Female" ? e.female : e.male).push(p.gross);
    byRole.set(p.role, e);
  }
  const roleGaps = [...byRole.entries()]
    .filter(([, e]) => e.female.length >= MIN_PER_GENDER && e.male.length >= MIN_PER_GENDER)
    .map(([role, e]) => { const fm = med(e.female); const mm = med(e.male); return { role, female: e.female.length, male: e.male.length, femMed: fm, maleMed: mm, gap: mm > 0 ? (mm - fm) / mm : 0 }; })
    .sort((a, b) => b.gap - a.gap);
  const roleFlagged = roleGaps.filter((r) => Math.abs(r.gap) > GAP_THRESHOLD);

  const kpis: MetricKPI[] = [
    { label: "Gender Pay Gap", value: N.formatPct(overallGap * 100), hint: "women's vs men's median pay" },
    { label: "Women's Median", value: N.humanizeMoneyInr(femMed), hint: `men's ${N.humanizeMoneyInr(maleMed)}` },
    { label: "Depts > 5% Gap", value: N.humanizeInt(flagged.length), hint: `of ${deptGaps.length} comparable` },
    { label: "Top-Quartile Women", value: N.formatPct(topQuartileFemalePct), hint: `${N.formatPct(overallFemalePct)} of the workforce` },
    ...(roleGaps.length ? [{ label: "Roles > 5% Gap", value: N.humanizeInt(roleFlagged.length), hint: `of ${roleGaps.length} like-for-like` }] : []),
    { label: "Est. Remediation", value: N.humanizeMoneyInr(remediationAnnual), hint: "annual cost to reach parity" },
  ];

  const charts: ChartSpec[] = [
    { title: "Median pay by gender", caption: "Overall median monthly gross.", kind: "bar", labels: ["Female", "Male"], values: [Math.round(femMed), Math.round(maleMed)] },
    { title: "Women's share by pay quartile", caption: `Workforce ranked by pay, split into four bands. Overall women ${N.formatPct(overallFemalePct)}; a low top band is a glass ceiling.`, kind: "bar", labels: ["Q1 (lowest)", "Q2", "Q3", "Q4 (highest)"], values: quartiles.map((q) => Math.round(q.femalePct * 10) / 10) },
  ];
  if (deptGaps.length) {
    const top = deptGaps.slice(0, 12);
    charts.push({ title: "Gender pay gap by department", caption: "Positive = women paid less. Dashed line = 5% EU threshold.", kind: "barh", labels: top.map((d) => d.dept), values: top.map((d) => Math.round(d.gap * 1000) / 10), drill: "department" });
  }

  const tables: MetricTable[] = [
    {
      title: "Gender pay gap by department",
      caption: "Median monthly gross by gender (departments with ≥3 of each). Gaps over 5% warrant a documented justification under the EU directive.",
      columns: ["Department", "Women", "Women's median", "Men", "Men's median", "Gap %"],
      rows: deptGaps.map((d) => [d.dept, d.female.length, N.humanizeMoneyInr(d.femaleMed), d.male.length, N.humanizeMoneyInr(d.maleMed), N.formatPct(d.gap * 100)] as (string | number)[]),
      drill: "department",
    },
  ];
  if (roleGaps.length) {
    tables.push({
      title: "Like-for-like gap by role (job title)",
      caption: "Gap WITHIN a job title — the controlled comparison the EU directive asks for. A like-for-like gap is far harder to justify than a raw one, since role-mix is held constant.",
      columns: ["Job title", "Women", "Women's median", "Men", "Men's median", "Gap %"],
      rows: roleGaps.map((r) => [r.role, r.female, N.humanizeMoneyInr(r.femMed), r.male, N.humanizeMoneyInr(r.maleMed), N.formatPct(r.gap * 100)] as (string | number)[]),
    });
  }

  const watchouts: MetricWatchout[] = flagged.slice(0, 5).map((d) => ({
    severity: Math.abs(d.gap) > 0.1 ? "high" : "medium",
    title: `Gender pay gap in ${d.dept}`,
    detail: `Women's median pay is ${N.formatPct(Math.abs(d.gap) * 100)} ${d.gap >= 0 ? "below" : "above"} men's in ${d.dept} (${d.female.length}F / ${d.male.length}M).`,
    actionHint: "Review like-for-like roles; document objective justification or plan remediation (EU Pay Transparency Directive).",
    owner: "HR Leadership",
  }));
  // Like-for-like gaps are the indefensible core — flag the worst even if its
  // department washed out in the raw view.
  for (const r of roleFlagged.slice(0, 3)) {
    watchouts.push({
      severity: Math.abs(r.gap) > 0.1 ? "high" : "medium",
      title: `Like-for-like pay gap: ${r.role}`,
      detail: `Within the same job title, women's median pay is ${N.formatPct(Math.abs(r.gap) * 100)} ${r.gap >= 0 ? "below" : "above"} men's (${r.female}F / ${r.male}M) — a controlled gap, not a role-mix effect.`,
      actionHint: "This is the hardest gap to justify; prioritise it for remediation in the next pay cycle.",
      owner: "Total Rewards",
    });
  }
  // Glass ceiling: women materially under-represented in the top pay quartile.
  if (overallFemalePct >= 25 && topQuartileFemalePct < overallFemalePct * 0.6) {
    watchouts.push({
      severity: "medium",
      title: "Women under-represented in the top pay quartile",
      detail: `Women are ${N.formatPct(topQuartileFemalePct)} of the best-paid quartile vs ${N.formatPct(overallFemalePct)} of the workforce — a glass-ceiling pattern raw medians can mask.`,
      actionHint: "Audit progression and senior-hire pipelines; the gap is likely in access to the highest-paid roles, not same-role pay alone.",
      owner: "HR Leadership",
    });
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `Overall gender pay gap ${N.formatPct(overallGap * 100)} (women's vs men's median). ${flagged.length} of ${deptGaps.length} comparable departments exceed the 5% threshold; est. ${N.humanizeMoneyInr(remediationAnnual)}/yr to reach parity.`,
    kpis,
    charts,
    tables,
    watchouts,
  };
}
