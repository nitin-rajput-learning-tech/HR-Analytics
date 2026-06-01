import { describe, it, expect } from "vitest";
import { compute, type LeaverEvent } from "./cross_functional";
import type { Row } from "../ingest/types";

function fixture() {
  const employeeRows: Row[] = [];
  for (let i = 1; i <= 10; i++) employeeRows.push({ employee_number: "E" + i, department: "Technology", employment_status: "Working" });
  for (let i = 1; i <= 10; i++) employeeRows.push({ employee_number: "S" + i, department: "Sales", employment_status: "Working" });

  const ldEnrollmentRows: Row[] = [
    { employee_number: "E1", program_id: "P1", status: "Completed" },
    { employee_number: "E2", program_id: "P1", status: "Completed" },
  ];

  const pmsRows: Row[] = [];
  for (let i = 1; i <= 10; i++) pmsRows.push({ employee_number: "E" + i, manager_review_done: i <= 9, final_rating: 3, rating_scale: "1-5" });
  for (let i = 1; i <= 10; i++) pmsRows.push({ employee_number: "S" + i, manager_review_done: i <= 3, final_rating: 3, rating_scale: "1-5" });
  for (const id of ["L1", "L2", "L3"]) pmsRows.push({ employee_number: id, manager_review_done: true, final_rating: 5, rating_scale: "1-5", potential_rating: "High" });

  const leaverEvents: LeaverEvent[] = [
    { employee_number: "L1", event_date: "2026-03-01", department: "Technology" },
    { employee_number: "L2", event_date: "2026-02-10", department: "Technology" },
    { employee_number: "L3", event_date: "2025-12-20", department: "Technology" },
  ];
  const taRows: Row[] = [{ requisition_id: "R1", cost: 300000, joined: 3 }];
  return { employeeRows, ldEnrollmentRows, pmsRows, leaverEvents, taRows };
}

describe("cross_functional.compute", () => {
  it("returns an empty domain without an employee master", () => {
    expect(compute({ employeeRows: [] }).hasData).toBe(false);
  });

  it("scores compound risk across the available signals", () => {
    const f = fixture();
    const d = compute({ ...f, asOf: "2026-05-31" });
    expect(d.hasData).toBe(true);
    const t = d.tables.find((x) => x.title === "Compound risk by department");
    expect(t).toBeTruthy();
    for (const c of ["Attrition %", "Trained %", "Reviews %", "Risk score"]) {
      expect(t!.columns).toContain(c);
    }
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Compound-Risk Depts"]).toBe("1");
    expect(d.watchouts.some((w) => w.title === "Compounding risk in Sales")).toBe(true);
  });

  it("detects regrettable high-performer exits", () => {
    const f = fixture();
    const d = compute({ ...f, asOf: "2026-05-31" });
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Regrettable Exits"]).toBe("3");
    expect(d.watchouts.some((w) => w.title === "Losing high performers")).toBe(true);
  });

  it("estimates attrition cost from TA cost-per-hire", () => {
    const f = fixture();
    const d = compute({ ...f, asOf: "2026-05-31" });
    const kpi = d.kpis.find((k) => k.label === "Est. Attrition Cost (12m)");
    expect(kpi).toBeTruthy();
    expect(kpi!.hint).toContain("3 exits");
  });

  it("still builds (0 high-risk) with the master only", () => {
    const f = fixture();
    const d = compute({ employeeRows: f.employeeRows, asOf: "2026-05-31" });
    expect(d.hasData).toBe(true);
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Compound-Risk Depts"]).toBe("0");
  });
});
