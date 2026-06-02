import { describe, it, expect } from "vitest";
import { computeEmployeeRisks, buildRisk } from "./risk";
import type { Row } from "../ingest/types";

const ASOF = "2026-05-31";
const emp = (n: string, extra: Partial<Row> = {}): Row => ({
  employee_number: n,
  full_name: n,
  employment_status: "Working",
  department: "Tech",
  reporting_manager: "M1",
  date_joined: "2018-01-01", // ~8 yrs → low tenure risk
  last_working_day: "",
  ...extra,
});
const tech = (n: number, extra: Partial<Row> = {}): Row[] => Array.from({ length: n }, (_, i) => emp("V" + (i + 1), extra));

describe("computeEmployeeRisks", () => {
  it("scores a new joiner above a veteran, driven by tenure", () => {
    const risks = computeEmployeeRisks({ employeeRows: [emp("NEW", { date_joined: "2026-04-01" }), ...tech(9)], asOf: ASOF });
    const m = Object.fromEntries(risks.map((r) => [r.employee_number, r]));
    expect(m["NEW"].score).toBeGreaterThan(m["V1"].score);
    expect(m["NEW"].contributors[0].key).toBe("tenure");
  });

  it("uses only the three always-on signals without payroll/PMS", () => {
    const keys = new Set(computeEmployeeRisks({ employeeRows: tech(10), asOf: ASOF }).flatMap((r) => r.contributors.map((c) => c.key)));
    expect(keys.has("pay_gap")).toBe(false);
    expect(keys.has("performance")).toBe(false);
  });

  it("raises team-churn risk when the department is separating", () => {
    const rows = [...tech(5), ...Array.from({ length: 5 }, (_, i) => emp("R" + i, { employment_status: "Relieved" }))];
    const v = computeEmployeeRisks({ employeeRows: rows, asOf: ASOF }).find((r) => r.employee_number === "V1")!;
    expect(v.contributors.some((c) => c.key === "team_churn")).toBe(true);
  });

  it("adds a performance signal when PMS shows a PIP", () => {
    const risks = computeEmployeeRisks({ employeeRows: tech(10), asOf: ASOF, pmsRows: [{ employee_number: "V1", on_pip: true, final_rating: 2, rating_scale: "1-5" }] });
    const v1 = risks.find((r) => r.employee_number === "V1")!;
    const v2 = risks.find((r) => r.employee_number === "V2")!;
    expect(v1.contributors.some((c) => c.key === "performance")).toBe(true);
    expect(v1.score).toBeGreaterThan(v2.score);
  });

  it("adds a pay-gap signal for below-median pay", () => {
    const payroll: Row[] = [
      { employee_number: "V1", gross_monthly: 50000 },
      { employee_number: "V2", gross_monthly: 100000 },
      { employee_number: "V3", gross_monthly: 100000 },
      { employee_number: "V4", gross_monthly: 100000 },
    ];
    const v1 = computeEmployeeRisks({ employeeRows: tech(4), asOf: ASOF, payrollRows: payroll }).find((r) => r.employee_number === "V1")!;
    expect(v1.contributors.some((c) => c.key === "pay_gap")).toBe(true);
  });

  it("score equals the sum of its contributor points (explainable-by-construction)", () => {
    const risks = computeEmployeeRisks({ employeeRows: [emp("NEW", { date_joined: "2026-03-01" }), ...tech(20)], asOf: ASOF });
    for (const r of risks) {
      const sum = r.contributors.reduce((s, c) => s + c.points, 0);
      expect(Math.abs(r.score - sum)).toBeLessThanOrEqual(2); // per-contributor rounding
    }
  });
});

describe("buildRisk", () => {
  it("builds a populated domain, and an empty state with no active staff", () => {
    expect(buildRisk({ employeeRows: tech(10), asOf: ASOF }).hasData).toBe(true);
    expect(buildRisk({ employeeRows: [emp("X", { employment_status: "Relieved" })], asOf: ASOF }).hasData).toBe(false);
  });
  it("exposes High Risk / Avg Risk Score / Top Driver KPIs", () => {
    const dm = buildRisk({ employeeRows: [emp("NEW", { date_joined: "2026-05-01" }), ...tech(9)], asOf: ASOF });
    const labels = dm.kpis.map((k) => k.label);
    expect(labels).toContain("High Risk");
    expect(labels).toContain("Avg Risk Score");
    expect(labels).toContain("Top Driver");
  });
});
