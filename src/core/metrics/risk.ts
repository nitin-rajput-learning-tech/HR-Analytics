// Deterministic, explainable attrition-risk index.
//
// Each active employee gets a 0–100 risk score that is a weighted sum of named,
// bounded signals — so the score IS its own explanation (no black box, no LLM).
// Signals from absent domains (payroll, PMS) drop out and the remaining weights
// renormalise, so this works on the employee master alone and sharpens as more
// domains are loaded. Pure + fully testable.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";

const KIND = "people_risk";
const LABEL = "Attrition Risk";

const str = (v: unknown): string => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";
const isRelieved = (r: Row) => str(r["employment_status"]) === "Relieved";
const dim = (r: Row, f: string) => str(r[f]) || "Unspecified";
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round = (x: number) => Math.round(x);

function dayMs(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}
function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
function pushTo<K>(m: Map<K, number[]>, k: K, v: number): void {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

// Each signal is a key, a weight, and a [0,1] value computed per employee.
type SignalKey = "tenure" | "team_churn" | "manager_load" | "pay_gap" | "performance";
const WEIGHTS: Record<SignalKey, number> = { tenure: 0.3, team_churn: 0.25, manager_load: 0.15, pay_gap: 0.15, performance: 0.15 };
const LABELS: Record<SignalKey, string> = {
  tenure: "Early tenure",
  team_churn: "Team churn",
  manager_load: "Manager overload",
  pay_gap: "Pay below peers",
  performance: "Performance / PIP",
};

export interface RiskContributor {
  key: SignalKey;
  label: string;
  points: number; // contribution to the 0–100 score
}
export interface EmployeeRisk {
  employee_number: string;
  name: string;
  department: string;
  manager: string;
  tenureYears: number | null;
  score: number; // 0–100
  band: "High" | "Elevated" | "Moderate" | "Low";
  contributors: RiskContributor[]; // descending, points > 0
}

export interface RiskInput {
  employeeRows: Row[];
  asOf: string | null;
  payrollRows?: Row[] | null; // payroll_record (per-employee gross/ctc)
  pmsRows?: Row[] | null; // pms_review (rating, pip, potential, promotion)
}

function bandOf(score: number): EmployeeRisk["band"] {
  if (score >= 65) return "High";
  if (score >= 45) return "Elevated";
  if (score >= 25) return "Moderate";
  return "Low";
}

function tenureSignal(days: number | null): number {
  if (days === null) return 0.3; // unknown → mild
  if (days < 365) return 0.85;
  if (days < 730) return 0.6;
  if (days < 1825) return 0.3;
  return 0.15;
}

function inferScaleMax(rows: Row[]): number {
  const r = rows.find((x) => x["rating_scale"] != null);
  if (r) {
    const ns = String(r["rating_scale"]).replace(/-/g, " ").split(/\s+/).map((s) => parseInt(s, 10)).filter(Number.isFinite);
    if (ns.length) return Math.max(...ns);
  }
  return 5;
}

// Compute the per-employee risk list. Exported for direct testing.
export function computeEmployeeRisks(input: RiskInput): EmployeeRisk[] {
  const { employeeRows, asOf } = input;
  const refMs = dayMs(asOf);
  const active = employeeRows.filter(isWorking);
  if (!active.length) return [];

  // Which optional domains can we join? Present only if rows carry the keys.
  const havePay = !!input.payrollRows?.some((r) => "employee_number" in r) &&
    !!input.payrollRows?.some((r) => "gross_monthly" in r || "ctc_annual" in r);
  const havePms = !!input.pmsRows?.some((r) => "employee_number" in r);

  // Active weights → renormalise across present signals.
  const present: SignalKey[] = ["tenure", "team_churn", "manager_load"];
  if (havePay) present.push("pay_gap");
  if (havePms) present.push("performance");
  const weightTotal = present.reduce((s, k) => s + WEIGHTS[k], 0) || 1;

  // --- team-churn exposure: (relieved + pending) / dept total, per department.
  const deptTotal = new Map<string, number>();
  const deptSep = new Map<string, number>();
  for (const r of employeeRows) {
    const d = dim(r, "department");
    deptTotal.set(d, (deptTotal.get(d) ?? 0) + 1);
    const lwd = dayMs(r["last_working_day"]);
    const pending = isWorking(r) && refMs !== null && lwd !== null && lwd >= refMs;
    if (isRelieved(r) || pending) deptSep.set(d, (deptSep.get(d) ?? 0) + 1);
  }
  const teamChurn = (d: string) => clamp01((deptSep.get(d) ?? 0) / Math.max(1, deptTotal.get(d) ?? 0) / 0.25);

  // --- manager load: active reports per reporting_manager.
  const span = new Map<string, number>();
  for (const r of active) span.set(dim(r, "reporting_manager"), (span.get(dim(r, "reporting_manager")) ?? 0) + 1);
  const managerLoad = (m: string) => clamp01(((span.get(m) ?? 0) - 10) / 20);

  // --- pay gap: gross vs department median (below-median only).
  const payByEmp = new Map<string, number>();
  if (havePay) {
    for (const r of input.payrollRows!) {
      const id = str(r["employee_number"]);
      const g = toNum(r["gross_monthly"]) ?? (toNum(r["ctc_annual"]) !== null ? (toNum(r["ctc_annual"]) as number) / 12 : null);
      if (id && g !== null) payByEmp.set(id, g);
    }
  }
  const deptPayMedian = new Map<string, number>();
  if (havePay) {
    const byDept = new Map<string, number[]>();
    for (const r of active) {
      const g = payByEmp.get(str(r["employee_number"]));
      if (g != null) pushTo(byDept, dim(r, "department"), g);
    }
    for (const [d, arr] of byDept) {
      const m = medianOf(arr);
      if (m !== null) deptPayMedian.set(d, m);
    }
  }
  const payGap = (r: Row): number => {
    const g = payByEmp.get(str(r["employee_number"]));
    const med = deptPayMedian.get(dim(r, "department"));
    if (g == null || med == null || med <= 0 || g >= med) return 0;
    return clamp01((med - g) / med);
  };

  // --- performance: PIP / low rating / high-potential-not-promoted stagnation.
  const pmsByEmp = new Map<string, Row>();
  let scaleMax = 5;
  if (havePms) {
    scaleMax = inferScaleMax(input.pmsRows!);
    for (const r of input.pmsRows!) pmsByEmp.set(str(r["employee_number"]), r);
  }
  const performance = (r: Row, days: number | null): number => {
    const p = pmsByEmp.get(str(r["employee_number"]));
    if (!p) return 0;
    if (p["on_pip"] === true) return 1;
    const rating = toNum(p["final_rating"]);
    if (rating !== null && rating < 0.6 * scaleMax) return 0.7;
    const hiPot = str(p["potential_rating"]).toLowerCase() === "high";
    const stagnant = hiPot && p["promotion_recommended"] !== true && days !== null && days >= 1095;
    return stagnant ? 0.5 : 0;
  };

  return active.map((r): EmployeeRisk => {
    const days = dayMs(r["date_joined"]) !== null && refMs !== null ? Math.floor((refMs - (dayMs(r["date_joined"]) as number)) / 86_400_000) : null;
    const raw: Record<SignalKey, number> = {
      tenure: tenureSignal(days),
      team_churn: teamChurn(dim(r, "department")),
      manager_load: managerLoad(dim(r, "reporting_manager")),
      pay_gap: havePay ? payGap(r) : 0,
      performance: havePms ? performance(r, days) : 0,
    };
    const contributors: RiskContributor[] = present
      .map((k) => ({ key: k, label: LABELS[k], points: round((WEIGHTS[k] / weightTotal) * raw[k] * 100) }))
      .filter((c) => c.points > 0)
      .sort((a, b) => b.points - a.points);
    const score = present.reduce((s, k) => s + (WEIGHTS[k] / weightTotal) * raw[k] * 100, 0);
    return {
      employee_number: str(r["employee_number"]),
      name: str(r["full_name"]) || str(r["employee_number"]),
      department: dim(r, "department"),
      manager: dim(r, "reporting_manager"),
      tenureYears: days === null ? null : Math.round((days / 365) * 10) / 10,
      score: round(score),
      band: bandOf(score),
      contributors,
    };
  });
}

const BAND_ORDER: EmployeeRisk["band"][] = ["Low", "Moderate", "Elevated", "High"];

export function buildRisk(input: RiskInput): DomainMetrics {
  const risks = computeEmployeeRisks(input);
  if (!risks.length) {
    return { kind: KIND, label: LABEL, hasData: false, blurb: "Attrition risk needs an active employee population.", kpis: [], charts: [], tables: [], watchouts: [] };
  }
  const sorted = [...risks].sort((a, b) => b.score - a.score);
  const high = risks.filter((r) => r.band === "High");
  const elevated = risks.filter((r) => r.band === "Elevated");
  const avg = risks.reduce((s, r) => s + r.score, 0) / risks.length;

  // Which signal contributes the most points on average → headline driver.
  const driverTotals = new Map<string, number>();
  for (const r of risks) for (const c of r.contributors) driverTotals.set(c.label, (driverTotals.get(c.label) ?? 0) + c.points);
  const topDriver = [...driverTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a";

  const kpis: MetricKPI[] = [
    { label: "High Risk", value: N.humanizeInt(high.length), hint: `score ≥ 65 of ${risks.length}` },
    { label: "Elevated+", value: N.humanizeInt(high.length + elevated.length), hint: "score ≥ 45" },
    { label: "Avg Risk Score", value: avg.toFixed(0), hint: "0–100, weighted signals" },
    { label: "Top Driver", value: topDriver },
  ];

  const bandCounts = BAND_ORDER.map((b) => risks.filter((r) => r.band === b).length);
  const charts: ChartSpec[] = [
    { title: "Risk distribution", caption: "Active employees by risk band.", kind: "bar", labels: [...BAND_ORDER], values: bandCounts },
  ];
  // average risk by department (≥5 staff)
  const deptScores = new Map<string, number[]>();
  for (const r of risks) pushTo(deptScores, r.department, r.score);
  const deptAvg = [...deptScores.entries()].filter(([, a]) => a.length >= 5).map(([d, a]) => [d, a.reduce((s, x) => s + x, 0) / a.length] as const).sort((a, b) => b[1] - a[1]);
  if (deptAvg.length) {
    charts.push({ title: "Average risk by department", caption: "Mean risk score (departments with ≥5 active staff).", kind: "barh", labels: deptAvg.slice(0, 12).map((e) => e[0]), values: deptAvg.slice(0, 12).map((e) => Math.round(e[1])), drill: "department" });
  }

  const tableRows = sorted.slice(0, 20).map((r) => [
    r.employee_number,
    r.department,
    r.manager,
    r.tenureYears === null ? "—" : `${r.tenureYears}`,
    r.score,
    r.contributors.map((c) => `${c.label} +${c.points}`).join(", ") || "—",
  ] as (string | number)[]);

  const tables: MetricTable[] = [
    {
      title: "Highest attrition risk",
      caption: "Top 20 by score. Each score is the sum of its named drivers — no black box.",
      columns: ["Employee", "Department", "Manager", "Tenure (yrs)", "Risk score", "Top drivers"],
      rows: tableRows,
    },
  ];

  const watchouts: MetricWatchout[] = [];
  // departments with concentrated high-risk
  for (const [d, arr] of deptScores) {
    if (arr.length < 8) continue;
    const highInDept = risks.filter((r) => r.department === d && r.band === "High").length;
    const share = highInDept / arr.length;
    if (share >= 0.2 || highInDept >= 5) {
      watchouts.push({
        severity: share >= 0.3 || highInDept >= 8 ? "high" : "medium",
        title: `Concentrated flight risk in ${d}`,
        detail: `${highInDept} of ${arr.length} active staff (${N.formatPct(share * 100)}) score High risk.`,
        actionHint: "Run stay-interviews and review comp/progression for this team before exits cluster.",
        owner: "HRBP",
      });
    }
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `${high.length} employees at High risk and ${elevated.length} Elevated (avg score ${avg.toFixed(0)}/100). Largest driver: ${topDriver.toLowerCase()}.`,
    kpis,
    charts,
    tables,
    watchouts: watchouts.sort((a, b) => (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0)).slice(0, 5),
  };
}
