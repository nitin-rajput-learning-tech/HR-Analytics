import { describe, it, expect } from "vitest";
import { buildWorkforceCost } from "./workforceCost";
import type { Row } from "../ingest/types";

const employees: Row[] = [
  { employee_number: "1", department: "Tech" },
  { employee_number: "2", department: "Tech" },
  { employee_number: "3", department: "Sales" },
  { employee_number: "4", department: "Sales" },
];
const payroll: Row[] = [
  { employee_number: "1", gross_monthly: 100000, variable_pay_paid: 20000, payroll_status: "Paid" },
  { employee_number: "2", gross_monthly: 100000, variable_pay_paid: 20000, payroll_status: "Paid" },
  { employee_number: "3", gross_monthly: 50000, variable_pay_paid: 5000, payroll_status: "Paid" },
  { employee_number: "4", gross_monthly: 50000, variable_pay_paid: 5000, payroll_status: "Held" },
];

describe("buildWorkforceCost", () => {
  const m = buildWorkforceCost({ payrollRows: payroll, employeeRows: employees });

  it("aggregates cost, cost-per-head and the variable share", () => {
    expect(m.hasData).toBe(true);
    const labels = m.kpis.map((k) => k.label);
    for (const l of ["Monthly Cost", "Cost per Head", "Annual Run-rate", "Variable Pay Share"]) expect(labels.includes(l)).toBe(true);
    expect(m.kpis.find((k) => k.label === "Variable Pay Share")?.value).toBe("16.7%"); // 50k / 300k
    expect(m.kpis.find((k) => k.label === "Monthly Cost")?.hint).toBe("4 on payroll");
  });

  it("ranks departments by cost (highest first)", () => {
    expect(m.charts[0].title).toBe("Monthly cost by department");
    expect(m.tables[0].rows.length).toBe(2);
    expect(m.tables[0].rows[0][0]).toBe("Tech"); // 200k > Sales 100k
  });

  it("is filter-aware — costs only employees present in the passed-in set", () => {
    const extra = buildWorkforceCost({ payrollRows: [...payroll, { employee_number: "99", gross_monthly: 9_000_000 }], employeeRows: employees });
    expect(extra.kpis.find((k) => k.label === "Monthly Cost")?.hint).toBe("4 on payroll"); // employee 99 excluded
  });

  it("degrades without payroll data", () => {
    expect(buildWorkforceCost({ payrollRows: null, employeeRows: employees }).hasData).toBe(false);
  });
});
