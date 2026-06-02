import { describe, it, expect } from "vitest";
import { activeByDept, costByDeptFromAggregate, applyOps, computeScenario, type ScenarioOp } from "./scenario";
import type { Row } from "../ingest/types";

const op = (kind: ScenarioOp["kind"], dept: string, count: number, toDept?: string): ScenarioOp => ({ id: kind + dept, kind, dept, count, ...(toDept ? { toDept } : {}) });

const rows: Row[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ employee_number: "T" + i, department: "Tech", employment_status: "Working" })),
  ...Array.from({ length: 5 }, (_, i) => ({ employee_number: "S" + i, department: "Sales", employment_status: "Working" })),
  { employee_number: "X1", department: "Tech", employment_status: "Relieved" }, // not counted
];

describe("scenario engine", () => {
  it("counts active headcount by department", () => {
    const m = activeByDept(rows);
    expect(m.get("Tech")).toBe(10);
    expect(m.get("Sales")).toBe(5);
  });

  it("applies hire / cut / move and clamps at zero", () => {
    const base = activeByDept(rows);
    const after = applyOps(base, [op("hire", "Sales", 3), op("cut", "Tech", 4), op("move", "Tech", 2, "Sales")]);
    expect(after.get("Sales")).toBe(5 + 3 + 2); // hired 3, received 2
    expect(after.get("Tech")).toBe(10 - 4 - 2); // cut 4, moved out 2
  });

  it("never cuts or moves a department below zero", () => {
    const base = new Map([["Ops", 3]]);
    expect(applyOps(base, [op("cut", "Ops", 10)]).get("Ops")).toBe(0);
    const moved = applyOps(base, [op("move", "Ops", 10, "New")]);
    expect(moved.get("Ops")).toBe(0);
    expect(moved.get("New")).toBe(3); // only the 3 that existed moved
  });

  it("derives per-department cost from the payroll aggregate", () => {
    const agg: Row[] = [
      { department: "Tech", total_gross: 1000000, headcount_paid: 10 }, // 100k/head
      { department: "Sales", total_gross: 400000, headcount_paid: 5 }, // 80k/head
    ];
    const cost = costByDeptFromAggregate(agg);
    expect(cost.get("Tech")).toBe(100000);
    expect(cost.get("Sales")).toBe(80000);
  });

  it("computes headcount + cost deltas against the payroll aggregate", () => {
    const base = activeByDept(rows); // Tech 10, Sales 5 → 15
    const cost = new Map([["Tech", 100000], ["Sales", 80000]]);
    const r = computeScenario(base, [op("hire", "Tech", 2), op("cut", "Sales", 1)], cost, null);
    expect(r.baseHeadcount).toBe(15);
    expect(r.scenarioHeadcount).toBe(16); // +2 -1
    expect(r.headcountDelta).toBe(1);
    expect(r.costBasis).toBe("payroll");
    // +2 Tech @100k = +200k; -1 Sales @80k = -80k → +120k
    expect(r.costDelta).toBe(120000);
  });

  it("falls back to an assumed flat cost when no payroll is loaded", () => {
    const base = activeByDept(rows);
    const r = computeScenario(base, [op("hire", "Tech", 4)], null, 75000);
    expect(r.costBasis).toBe("assumed");
    expect(r.costDelta).toBe(4 * 75000);
  });

  it("reports no cost basis when neither payroll nor an assumption is given", () => {
    const r = computeScenario(activeByDept(rows), [op("hire", "Tech", 1)], null, null);
    expect(r.costBasis).toBe("none");
    expect(r.costDelta).toBe(null);
  });
});
