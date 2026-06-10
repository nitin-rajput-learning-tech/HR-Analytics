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

  it("adds variable-mix + overtime KPIs/chart and flags high overtime when those fields are present", () => {
    const e: Row[] = [];
    const p: Row[] = [];
    for (let i = 0; i < 10; i++) {
      e.push({ employee_number: "T" + i, department: "Tech", employment_status: "Working", date_joined: "2022-01-01" });
      p.push({ employee_number: "T" + i, gross_monthly: 100000, variable_pay_paid: 20000, overtime_hours: 12 });
    }
    const d = buildCompensation({ employeeRows: e, payrollRows: p, asOf: "2026-05-05" });
    const kpi = (l: string) => d.kpis.find((k) => k.label === l)?.value;
    expect(kpi("Variable Pay Mix")).toContain("20"); // 20k / 100k
    expect(kpi("Overtime Load")).toContain("100"); // all 10 logged overtime
    expect(d.charts.some((c) => c.title === "Overtime hours by department")).toBe(true);
    expect(d.watchouts.some((w) => /High overtime in Tech/.test(w.title))).toBe(true); // 12h/head ≥ 8
  });

  it("omits the variable/overtime KPIs when those fields are absent", () => {
    expect(m.kpis.some((k) => k.label === "Variable Pay Mix")).toBe(false); // base fixture has gross only
    expect(m.kpis.some((k) => k.label === "Overtime Load")).toBe(false);
  });
});
