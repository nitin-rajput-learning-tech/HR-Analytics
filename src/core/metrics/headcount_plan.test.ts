import { describe, it, expect } from "vitest";
import { buildHeadcountPlan } from "./headcount_plan";
import type { Row } from "../ingest/types";

const emp = (dept: string, n: number): Row[] => Array.from({ length: n }, (_, i) => ({ employee_number: `${dept}${i}`, department: dept, employment_status: "Working" }));
const plan = (dept: string, planned: number, budget: number): Row => ({ period: "2026-05", department: dept, planned_hc: planned, budget_hc: budget });

describe("buildHeadcountPlan", () => {
  it("awaits a plan upload when none is present", () => {
    const d = buildHeadcountPlan({ employeeRows: emp("Tech", 10), planRows: null });
    expect(d.hasData).toBe(false);
    expect(d.blurb).toMatch(/Headcount Plan/i);
  });

  it("computes actual vs plan vs budget, fill and headroom per department", () => {
    const employeeRows = [...emp("Tech", 8), ...emp("Sales", 12)];
    const planRows = [plan("Tech", 10, 12), plan("Sales", 10, 11)]; // Tech under (8/10), Sales over (12/10)
    const d = buildHeadcountPlan({ employeeRows, planRows });
    expect(d.hasData).toBe(true);
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Actual vs Plan"]).toBe("20 / 20"); // 8+12 actual, 10+10 planned
    expect(kpi["Open to Plan"]).toBe("2"); // Tech short by 2; Sales over doesn't offset
    expect(kpi["Over Plan"]).toBe("2"); // Sales 12 vs 10
    expect(kpi["Budget Headroom"]).toBe("3"); // budget 23 − actual 20
  });

  it("rolls sub-department plan rows up to the department", () => {
    const planRows = [
      { period: "2026-05", department: "Tech", sub_department: "Backend", planned_hc: 6, budget_hc: 7 },
      { period: "2026-05", department: "Tech", sub_department: "Frontend", planned_hc: 4, budget_hc: 5 },
    ];
    const d = buildHeadcountPlan({ employeeRows: emp("Tech", 8), planRows });
    const row = d.tables[0].rows.find((r) => r[0] === "Tech")!;
    expect(row[2]).toBe(10); // planned 6+4
    expect(row[3]).toBe(12); // budget 7+5
  });

  it("flags a department materially under plan and one over budget", () => {
    const employeeRows = [...emp("Tech", 6), ...emp("Ops", 14)];
    const planRows = [plan("Tech", 10, 12), plan("Ops", 10, 12)]; // Tech 60% filled; Ops over budget (14>12)
    const d = buildHeadcountPlan({ employeeRows, planRows });
    expect(d.watchouts.some((w) => /Tech is under plan/.test(w.title))).toBe(true);
    expect(d.watchouts.some((w) => /Ops is over budget/.test(w.title))).toBe(true);
  });

  it("adds a cost-vs-budget KPI when a payroll aggregate prices departments", () => {
    const employeeRows = emp("Tech", 12); // over budget of 10
    const planRows = [plan("Tech", 10, 10)];
    const payrollAggregateRows: Row[] = [{ department: "Tech", total_gross: 1000000, headcount_paid: 10 }]; // 100k/head
    const d = buildHeadcountPlan({ employeeRows, planRows, payrollAggregateRows });
    const cvb = d.kpis.find((k) => k.label === "Cost vs Budget");
    expect(cvb).toBeTruthy();
    expect(cvb!.value).toMatch(/^\+/); // 12 actual > 10 budget → over budget run-rate
  });
});
