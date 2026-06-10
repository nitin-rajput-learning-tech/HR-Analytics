// UP-7 — per-employee flight risk. Deterministic and explainable: each person's
// risk is assembled from observable signals (tenure band, performance, review
// neglect, training, pay staleness), never a black-box model — so every score can
// be defended in a calibration meeting. Complements cross_functional, which scores
// DEPARTMENTS; this scores PEOPLE.
//
//   s1 (here): extract the raw per-employee features by joining the master to PMS /
//              L&D / payroll on employee_number.
//   s2:        weight the features into a 0–100 score with the contributing factors.
//   s3:        surface the elevated-risk cohort as an HR Brain finding.
//
// Everything degrades gracefully: a signal whose domain is absent is marked
// unavailable (null) rather than guessed, and s2 renormalises over what's present.

import type { Row } from "../ingest/types";

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const dayMs = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};
const truthy = (v: unknown): boolean => {
  if (v === true) return true;
  const s = str(v).toLowerCase();
  return s === "y" || s === "yes" || s === "true" || s === "1";
};

export type PerfBand = "high" | "low" | "mid";

export interface FlightRiskInput {
  employeeRows?: Row[] | null;
  pmsRows?: Row[] | null;
  ldEnrollmentRows?: Row[] | null;
  payrollRecordRows?: Row[] | null;
  asOf?: string | null;
}

export interface EmpFeatures {
  employee_number: string;
  name: string;
  department: string;
  tenureYears: number | null; // null when date-joined is missing
  onPip: boolean; // false when PMS / the field is absent
  perf: PerfBand | null; // null when this person has no review
  reviewMissing: boolean | null; // manager review not done; null when PMS doesn't track it
  trained: boolean | null; // enrolled in any L&D; null when L&D is absent
  payStale: boolean | null; // no pay revision in ~18 months; null when not tracked
}

export interface FlightRiskExtract {
  features: EmpFeatures[];
  available: { pms: boolean; ld: boolean; review: boolean; pay: boolean };
}

const PAY_STALE_DAYS = 548; // ~18 months with no revision reads as a retention risk

function inferScaleMax(rows: Row[]): number {
  const r = rows.find((x) => x["rating_scale"] != null);
  if (r) {
    const digits = String(r["rating_scale"]).replace(/-/g, " ").split(/\s+/).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
    if (digits.length) return Math.max(...digits);
  }
  return 5;
}

export function extractFlightRiskFeatures(input: FlightRiskInput): FlightRiskExtract {
  const active = (input.employeeRows ?? []).filter((r) => str(r["employment_status"]) === "Working");
  const refMs = dayMs(input.asOf);

  const pmsRows = input.pmsRows ?? [];
  const havePms = pmsRows.length > 0 && pmsRows.some((r) => "employee_number" in r);
  const haveReview = havePms && pmsRows.some((r) => "manager_review_done" in r);
  const scaleMax = havePms ? inferScaleMax(pmsRows) : 5;
  const pmsByEmp = new Map<string, Row>();
  if (havePms) for (const r of pmsRows) pmsByEmp.set(str(r["employee_number"]), r); // last review wins

  const ldRows = input.ldEnrollmentRows ?? [];
  const haveLd = ldRows.length > 0 && ldRows.some((r) => "employee_number" in r);
  const trainedSet = new Set<string>();
  if (haveLd) for (const r of ldRows) trainedSet.add(str(r["employee_number"]));

  const payRows = input.payrollRecordRows ?? [];
  const havePay = payRows.length > 0 && payRows.some((r) => "last_revision_date" in r);
  const revByEmp = new Map<string, number | null>();
  if (havePay) {
    for (const r of payRows) {
      const e = str(r["employee_number"]);
      const d = dayMs(r["last_revision_date"]);
      if (!revByEmp.has(e) || (d ?? -Infinity) > (revByEmp.get(e) ?? -Infinity)) revByEmp.set(e, d);
    }
  }

  const perfOf = (r: Row): PerfBand => {
    const rating = Number(r["final_rating"]);
    const hiPot = str(r["potential_rating"]).toLowerCase() === "high";
    if ((Number.isFinite(rating) && rating >= 0.8 * scaleMax) || hiPot) return "high";
    if (Number.isFinite(rating) && rating <= 0.4 * scaleMax) return "low";
    return "mid";
  };

  const features: EmpFeatures[] = active.map((r) => {
    const id = str(r["employee_number"]);
    const j = dayMs(r["date_joined"]);
    const tenureYears = refMs !== null && j !== null ? Math.round(Math.max(0, (refMs - j) / 86_400_000 / 365) * 10) / 10 : null;

    let onPip = false;
    let perf: PerfBand | null = null;
    let reviewMissing: boolean | null = null;
    if (havePms) {
      const pr = pmsByEmp.get(id);
      if (pr) {
        onPip = truthy(pr["on_pip"]);
        perf = perfOf(pr);
      }
      if (haveReview) reviewMissing = pr ? !truthy(pr["manager_review_done"]) : true;
    }

    const trained = haveLd ? trainedSet.has(id) : null;

    let payStale: boolean | null = null;
    if (havePay) {
      const d = revByEmp.get(id);
      payStale = d != null && refMs != null ? (refMs - d) / 86_400_000 > PAY_STALE_DAYS : null;
    }

    return { employee_number: id, name: str(r["full_name"]) || id, department: str(r["department"]) || "Unspecified", tenureYears, onPip, perf, reviewMissing, trained, payStale };
  });

  return { features, available: { pms: havePms, ld: haveLd, review: haveReview, pay: havePay } };
}

// ----------------------------------------------------------------- s2: scoring

export type RiskBand = "Low" | "Moderate" | "Elevated" | "High";

export interface RiskFactor {
  key: string;
  label: string;
  // This factor's share of the final 0–1 score (weight × signal-risk, renormalised
  // over the signals available for this person). Factors with no risk are omitted.
  contribution: number;
  detail: string;
}

export interface FlightRiskScore {
  employee_number: string;
  name: string;
  department: string;
  score: number; // 0–100
  band: RiskBand;
  // A high performer at Elevated+ risk — the people you can least afford to lose.
  regrettable: boolean;
  factors: RiskFactor[]; // contributing signals, strongest first
}

// Base weights per signal dimension. Renormalised over the dimensions actually
// available for each employee, so a workspace with only the master + PMS still
// produces a defensible score from those two signals.
const DIM_WEIGHTS = { tenure: 0.2, performance: 0.25, review: 0.15, training: 0.15, pay: 0.25 } as const;

// Attrition risk by tenure band — the classic curve peaks in the 1–3 year window
// (past onboarding, growth expectations unmet, not yet anchored). Deterministic.
function tenureRisk(years: number): number {
  if (years < 1) return 0.5;
  if (years < 3) return 0.8;
  if (years < 5) return 0.45;
  return 0.25;
}
const tenureDetail = (y: number): string =>
  y < 1 ? `Under a year (${y.toFixed(1)}y) — onboarding window` : y < 3 ? `${y.toFixed(1)} years — peak-attrition window` : y < 5 ? `${y.toFixed(1)} years` : `${y.toFixed(1)} years — long-tenured`;

function bandOf(score: number): RiskBand {
  return score >= 70 ? "High" : score >= 50 ? "Elevated" : score >= 30 ? "Moderate" : "Low";
}

interface Dim { key: string; label: string; weight: number; risk: number; detail: string }

function dimsFor(f: EmpFeatures): Dim[] {
  const dims: Dim[] = [];
  if (f.tenureYears !== null) dims.push({ key: "tenure", label: "Tenure", weight: DIM_WEIGHTS.tenure, risk: tenureRisk(f.tenureYears), detail: tenureDetail(f.tenureYears) });
  if (f.perf !== null) dims.push({ key: "performance", label: "Performance", weight: DIM_WEIGHTS.performance, risk: f.onPip ? 1 : f.perf === "low" ? 0.7 : 0, detail: f.onPip ? "On a performance improvement plan" : f.perf === "low" ? "Low recent rating" : "Performance not a risk factor" });
  if (f.reviewMissing !== null) dims.push({ key: "review", label: "Manager review", weight: DIM_WEIGHTS.review, risk: f.reviewMissing ? 1 : 0, detail: f.reviewMissing ? "Latest manager review not completed" : "Manager review completed" });
  if (f.trained !== null) dims.push({ key: "training", label: "Development", weight: DIM_WEIGHTS.training, risk: f.trained ? 0 : 1, detail: f.trained ? "Recent L&D participation" : "No recent L&D participation" });
  if (f.payStale !== null) dims.push({ key: "pay", label: "Compensation", weight: DIM_WEIGHTS.pay, risk: f.payStale ? 1 : 0, detail: f.payStale ? "No pay revision in 18+ months" : "Pay revised within 18 months" });
  return dims;
}

export function scoreOne(f: EmpFeatures): FlightRiskScore {
  const dims = dimsFor(f);
  const wTotal = dims.reduce((s, d) => s + d.weight, 0) || 1;
  let score01 = 0;
  for (const d of dims) score01 += (d.weight / wTotal) * d.risk;
  const score = Math.round(score01 * 100);
  const factors: RiskFactor[] = dims
    .filter((d) => d.risk > 0)
    .map((d) => ({ key: d.key, label: d.label, contribution: Math.round((d.weight / wTotal) * d.risk * 100) / 100, detail: d.detail }))
    .sort((a, b) => b.contribution - a.contribution);
  return { employee_number: f.employee_number, name: f.name, department: f.department, score, band: bandOf(score), regrettable: f.perf === "high" && score >= 50, factors };
}

// Score every extracted employee, highest risk first.
export function scoreFlightRisk(extract: FlightRiskExtract): FlightRiskScore[] {
  return extract.features.map(scoreOne).sort((a, b) => b.score - a.score);
}

// Convenience: extract + score in one call.
export function flightRisk(input: FlightRiskInput): FlightRiskScore[] {
  return scoreFlightRisk(extractFlightRiskFeatures(input));
}
