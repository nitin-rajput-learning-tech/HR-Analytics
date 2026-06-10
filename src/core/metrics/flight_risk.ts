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
