import { describe, it, expect } from "vitest";
import { generateFunctionalDemo, generatePriorEmployeeMonth, generatePriorFunctionalMonth } from "./demoData";
import type { Row } from "../ingest/types";

function roster(): Row[] {
  const rows: Row[] = [];
  let i = 0;
  for (const [dept, n] of [["Tech", 30], ["Sales", 20], ["Ops", 15], ["Finance", 10]] as [string, number][]) {
    for (let k = 0; k < n; k++) {
      i++;
      rows.push({
        employee_number: "AP" + String(i).padStart(4, "0"),
        department: dept,
        legal_entity: "Acme",
        employment_status: i % 6 === 0 ? "Relieved" : "Working",
        date_joined: "2022-01-15",
        last_working_day: i % 6 === 0 ? "2025-12-01" : "",
      });
    }
  }
  return rows;
}

describe("generateFunctionalDemo", () => {
  const rows = roster();
  const snaps = generateFunctionalDemo(rows, "2026-05-05");
  const byKind = Object.fromEntries(snaps.map((s) => [s.kind, s]));
  const empNumbers = new Set(rows.map((r) => r.employee_number));

  it("produces all functional domains", () => {
    expect(snaps.map((s) => s.kind).sort()).toEqual(
      ["admin_asset", "admin_contract", "admin_lifecycle", "engagement_survey", "headcount_plan", "ld_enrollment", "ld_program", "payroll_aggregate", "payroll_record", "payroll_statutory", "pms_review", "ta_requisition"].sort(),
    );
  });

  it("keys per-employee payroll to real active employees with a gross", () => {
    const pay = byKind["payroll_record"];
    const activeCount = rows.filter((r) => r.employment_status === "Working").length;
    expect(pay.rows).toHaveLength(activeCount);
    expect(pay.rows.every((r) => empNumbers.has(r.employee_number) && Number(r.gross_monthly) > 0)).toBe(true);
  });

  it("keys PMS to real active employee numbers", () => {
    const pms = byKind["pms_review"];
    const activeCount = rows.filter((r) => r.employment_status === "Working").length;
    expect(pms.rows).toHaveLength(activeCount);
    expect(pms.rows.every((r) => empNumbers.has(r.employee_number))).toBe(true);
  });

  it("aggregates payroll per real department", () => {
    const pay = byKind["payroll_aggregate"];
    const depts = new Set(rows.filter((r) => r.employment_status === "Working").map((r) => r.department));
    expect(pay.rows).toHaveLength(depts.size);
  });

  it("references real employees in L&D enrollments and asset assignments", () => {
    expect(byKind["ld_enrollment"].rows.every((r) => empNumbers.has(r.employee_number))).toBe(true);
    const assigned = byKind["admin_asset"].rows.filter((r) => r.assigned_employee_number);
    expect(assigned.every((r) => empNumbers.has(r.assigned_employee_number))).toBe(true);
  });

  it("is deterministic", () => {
    const a = generateFunctionalDemo(rows, "2026-05-05");
    const b = generateFunctionalDemo(rows, "2026-05-05");
    expect(a.find((s) => s.kind === "pms_review")!.rows.length).toBe(b.find((s) => s.kind === "pms_review")!.rows.length);
  });

  it("returns nothing without active staff", () => {
    expect(generateFunctionalDemo([], "2026-05-05")).toHaveLength(0);
  });
});

describe("generatePriorFunctionalMonth", () => {
  const rows = roster();
  const cur = Object.fromEntries(generateFunctionalDemo(rows, "2026-05-05").map((s) => [s.kind, s]));
  const prior = Object.fromEntries(generatePriorFunctionalMonth(rows, "2026-05-05").map((s) => [s.kind, s]));

  it("is the month before and only the monthly-cadence kinds", () => {
    const snaps = generatePriorFunctionalMonth(rows, "2026-05-05");
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps.every((s) => s.asOf === "2026-04-05")).toBe(true);
    expect(snaps.some((s) => s.kind === "pms_review" || s.kind === "engagement_survey")).toBe(false);
  });

  it("clones the population (same TA requisition count, so deltas stay sane)", () => {
    expect(prior["ta_requisition"].rows.length).toBe(cur["ta_requisition"].rows.length);
  });

  it("derives a modestly-worse prior month so current shows improvement", () => {
    const errs = (s: { rows: Row[] }) => s.rows.filter((r) => String(r.payroll_status) === "Error").length;
    expect(errs(prior["payroll_record"])).toBeGreaterThan(errs(cur["payroll_record"]));
    const done = (s: { rows: Row[] }) => s.rows.filter((r) => String(r.status) === "Completed").length;
    expect(done(prior["ld_enrollment"])).toBeLessThan(done(cur["ld_enrollment"]));
  });
});

describe("generatePriorEmployeeMonth", () => {
  it("creates an earlier month that differs (so movement can be derived)", () => {
    const rows = roster();
    const prior = generatePriorEmployeeMonth(rows, "2026-05-05");
    expect(prior).not.toBeNull();
    expect(prior!.kind).toBe("employee_master");
    expect(prior!.asOf < "2026-05-05").toBe(true);
    // prior active set should differ from current (joiners excluded / leavers reactivated)
    const curActive = rows.filter((r) => r.employment_status === "Working").length;
    const priorActive = prior!.rows.filter((r) => r.employment_status === "Working").length;
    expect(priorActive).not.toBe(curActive);
  });
});
