import { describe, it, expect } from "vitest";
import { buildCompensation } from "./compensation";
import type { Row } from "../ingest/types";

function fixture() {
  const emp: Row[] = [];
  const pay: Row[] = [];
  for (let i = 0; i < 30; i++) {
    const dept = i < 18 ? "Tech" : "Sales";
    const senior = i % 3 === 0; // ~1/3 long-tenured, higher-paid
    emp.push({ employee_number: "E" + i, department: dept, employment_status: "Working", date_joined: senior ? "2018-01-01" : "2025-09-01" });
    pay.push({ employee_number: "E" + i, gross_monthly: senior ? 200000 : 80000 });
  }
  return { emp, pay };
}

describe("buildCompensation", () => {
  const { emp, pay } = fixture();
  const m = buildCompensation({ employeeRows: emp, payrollRows: pay, asOf: "2026-05-05" });
  const kpi = (label: string) => m.kpis.find((k) => k.label === label)?.value;

  it("degrades without per-employee payroll", () => {
    expect(buildCompensation({ employeeRows: emp, payrollRows: [] }).hasData).toBe(false);
  });

  it("computes a pay distribution, dispersion and concentration", () => {
    expect(m.hasData).toBe(true);
    expect(kpi("Median Pay")).toBeTruthy();
    expect(kpi("Pay Dispersion")).toContain("×");
    expect(kpi("Top-10% Pay Share")).toContain("%");
  });

  it("shows pay-by-department and pay-by-tenure charts", () => {
    const titles = m.charts.map((c) => c.title);
    expect(titles).toContain("Median pay by department");
    expect(titles).toContain("Pay progression by tenure");
  });
});
