import { describe, it, expect } from "vitest";
import { compute } from "./payroll";
import type { Row } from "../ingest/types";

const aggregateRows: Row[] = [
  {
    pay_month: "2026-05",
    department: "Technology",
    legal_entity: "Acme",
    headcount_paid: 100,
    total_gross: 1_50_00_000,
    total_variable: 15_00_000,
    total_overtime: 0,
    error_count: 2,
    off_cycle_count: 1,
  },
];
const statutoryRows: Row[] = [
  { pay_month: "2026-05", statutory_type: "PF", status: "Paid" },
  { pay_month: "2026-05", statutory_type: "TDS", status: "Late" },
];

describe("payroll.compute", () => {
  it("returns an empty domain with no inputs", () => {
    expect(compute({}).hasData).toBe(false);
  });

  it("prefers the aggregate sheet for cost and reports cost in crores", () => {
    const d = compute({ aggregateRows, statutoryRows });
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Total Payroll"]).toContain("Cr");
    expect(kpi["Headcount Paid"]).toBe("100");
    expect(kpi["Cost / Head"]).toBeTruthy();
  });

  it("flags payroll errors and late statutory remittances", () => {
    const d = compute({ aggregateRows, statutoryRows });
    expect(d.watchouts.some((w) => w.title.includes("Payroll errors"))).toBe(true);
    expect(d.watchouts.some((w) => w.title.includes("not all on time"))).toBe(true);
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Statutory On-time"]).toBe("50.0%");
  });

  it("falls back to detail records when no aggregate is present", () => {
    const recordRows: Row[] = [
      { employee_number: "E1", pay_month: "2026-05", gross_monthly: 100000, variable_pay_paid: 10000, payroll_status: "Paid" },
      { employee_number: "E2", pay_month: "2026-05", gross_monthly: 80000, variable_pay_paid: 5000, payroll_status: "Error" },
    ];
    const d = compute({ recordRows });
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Headcount Paid"]).toBe("2");
    expect(d.watchouts.some((w) => w.title.includes("Payroll errors"))).toBe(true);
  });
});
