import { describe, it, expect } from "vitest";
import { extractFlightRiskFeatures, scoreOne, flightRisk, type EmpFeatures } from "./flight_risk";
import type { Row } from "../ingest/types";

const ASOF = "2026-05-31";

function input(): { employeeRows: Row[]; pmsRows: Row[]; ldEnrollmentRows: Row[]; asOf: string } {
  return {
    asOf: ASOF,
    employeeRows: [
      { employee_number: "E1", full_name: "Asha", department: "Tech", employment_status: "Working", date_joined: "2024-11-30" }, // ~1.5 yr
      { employee_number: "E2", full_name: "Ben", department: "Tech", employment_status: "Working", date_joined: "2020-05-31" }, // ~6 yr
      { employee_number: "E3", full_name: "Cara", department: "Ops", employment_status: "Working", date_joined: "2025-09-30" }, // ~0.7 yr
      { employee_number: "X9", full_name: "Gone", department: "Tech", employment_status: "Relieved", date_joined: "2021-01-01" }, // excluded
    ],
    pmsRows: [
      { employee_number: "E1", final_rating: 2, rating_scale: "1-5", on_pip: "Y", manager_review_done: "N", potential_rating: "Low" },
      { employee_number: "E2", final_rating: 5, rating_scale: "1-5", on_pip: "N", manager_review_done: "Y", potential_rating: "High" },
      // E3 has NO review row even though the PMS cycle ran
    ],
    ldEnrollmentRows: [{ employee_number: "E2", program_id: "P1", status: "Completed" }],
  };
}

describe("extractFlightRiskFeatures", () => {
  const { features, available } = extractFlightRiskFeatures(input());
  const byId = Object.fromEntries(features.map((f) => [f.employee_number, f]));

  it("covers only active employees", () => {
    expect(features.map((f) => f.employee_number).sort()).toEqual(["E1", "E2", "E3"]);
  });

  it("reports which signal domains are available", () => {
    expect(available).toEqual({ pms: true, ld: true, review: true, pay: false });
  });

  it("computes tenure in years from date-joined vs as-of", () => {
    expect(byId.E1.tenureYears).toBeCloseTo(1.5, 1);
    expect(byId.E2.tenureYears).toBeCloseTo(6.0, 1);
    expect(byId.E3.tenureYears).toBeCloseTo(0.7, 1);
  });

  it("derives PIP, performance band and review-missing from PMS", () => {
    expect(byId.E1.onPip).toBe(true);
    expect(byId.E1.perf).toBe("low");
    expect(byId.E1.reviewMissing).toBe(true); // manager_review_done = N
    expect(byId.E2.onPip).toBe(false);
    expect(byId.E2.perf).toBe("high"); // top rating + high potential
    expect(byId.E2.reviewMissing).toBe(false);
  });

  it("treats an employee with no review row as review-missing (cycle ran, they were skipped)", () => {
    expect(byId.E3.perf).toBeNull();
    expect(byId.E3.reviewMissing).toBe(true);
  });

  it("joins L&D enrollment for the trained flag", () => {
    expect(byId.E1.trained).toBe(false);
    expect(byId.E2.trained).toBe(true);
    expect(byId.E3.trained).toBe(false);
  });

  it("marks pay staleness unavailable when payroll has no revision dates", () => {
    expect(byId.E1.payStale).toBeNull();
  });

  it("flags pay stale when the last revision is older than ~18 months", () => {
    const ex = extractFlightRiskFeatures({
      ...input(),
      payrollRecordRows: [
        { employee_number: "E1", last_revision_date: "2024-01-01" }, // > 18mo before as-of → stale
        { employee_number: "E2", last_revision_date: "2026-03-01" }, // recent → fresh
      ],
    });
    const m = Object.fromEntries(ex.features.map((f) => [f.employee_number, f]));
    expect(ex.available.pay).toBe(true);
    expect(m.E1.payStale).toBe(true);
    expect(m.E2.payStale).toBe(false);
    expect(m.E3.payStale).toBeNull(); // no payroll record for E3
  });

  it("degrades to no signals when only the employee master is supplied", () => {
    const ex = extractFlightRiskFeatures({ asOf: ASOF, employeeRows: input().employeeRows });
    expect(ex.available).toEqual({ pms: false, ld: false, review: false, pay: false });
    expect(ex.features[0].perf).toBeNull();
    expect(ex.features[0].reviewMissing).toBeNull();
    expect(ex.features[0].trained).toBeNull();
    expect(ex.features[0].onPip).toBe(false);
  });
});

const feat = (over: Partial<EmpFeatures>): EmpFeatures => ({
  employee_number: "E", name: "E", department: "Tech", tenureYears: 2, onPip: false, perf: "mid", reviewMissing: false, trained: true, payStale: false, ...over,
});

describe("scoreOne / flightRisk", () => {
  it("ranks a PIP'd, unreviewed, untrained early-tenure employee as High, PIP leading", () => {
    const s = scoreOne(feat({ tenureYears: 1.5, onPip: true, perf: "low", reviewMissing: true, trained: false, payStale: null }));
    expect(s.band).toBe("High");
    expect(s.score).toBeGreaterThanOrEqual(70);
    expect(s.factors[0].key).toBe("performance");
    expect(s.factors[0].detail).toMatch(/improvement plan/i);
    // factor contributions roughly sum to the 0–1 score
    const sum = s.factors.reduce((a, f) => a + f.contribution, 0);
    expect(Math.round(sum * 100)).toBeCloseTo(s.score, -1);
  });

  it("scores an all-green long-tenured high performer as Low with no driving factors", () => {
    const s = scoreOne(feat({ tenureYears: 6, perf: "high", reviewMissing: false, trained: true, payStale: false }));
    expect(s.band).toBe("Low");
    expect(s.regrettable).toBe(false);
    // only tenure carries a (small) baseline risk; everything else is 0 and omitted
    expect(s.factors.every((f) => f.key === "tenure")).toBe(true);
  });

  it("flags a high performer with stale pay + no development as regrettable", () => {
    const s = scoreOne(feat({ tenureYears: 2, perf: "high", reviewMissing: true, trained: false, payStale: true }));
    expect(s.score).toBeGreaterThanOrEqual(50);
    expect(s.regrettable).toBe(true);
    // performance contributes 0 for a high performer — the risk comes from the rest
    expect(s.factors.some((f) => f.key === "performance")).toBe(false);
    expect(s.factors.map((f) => f.key).sort()).toEqual(["pay", "review", "tenure", "training"]);
  });

  it("renormalises weights when signals are missing (master + tenure only)", () => {
    const s = scoreOne(feat({ tenureYears: 2, perf: null, reviewMissing: null, trained: null, payStale: null }));
    // only tenure available → score is exactly its band risk (0.8 → 80)
    expect(s.score).toBe(80);
    expect(s.factors).toHaveLength(1);
    expect(s.factors[0].key).toBe("tenure");
  });

  it("flightRisk sorts the cohort highest-risk first", () => {
    const scores = flightRisk(input());
    expect(scores.map((s) => s.employee_number)).toEqual(["E1", "E3", "E2"]);
    for (let i = 1; i < scores.length; i++) expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
  });
});
