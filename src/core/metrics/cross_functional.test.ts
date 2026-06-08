import { describe, it, expect } from "vitest";
import { compute, attritionEconomics, type LeaverEvent } from "./cross_functional";
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
    // Absolute scoring ranks Technology highest: it is the dept actually losing
    // people (23% attrition, the heaviest-weighted signal) plus 80% untrained —
    // whereas min-max previously flagged Sales only because its two weak signals
    // happened to be the per-signal maxima.
    expect(d.watchouts.some((w) => w.title === "Compounding risk in Technology")).toBe(true);
  });

  it("scores are absolute — adding a healthy department doesn't shift another's score", () => {
    const base: Row[] = [];
    for (let i = 1; i <= 10; i++) base.push({ employee_number: "A" + i, department: "Alpha", employment_status: "Working" });
    for (let i = 1; i <= 10; i++) base.push({ employee_number: "B" + i, department: "Beta", employment_status: "Working" });
    const pms: Row[] = [];
    for (let i = 1; i <= 10; i++) pms.push({ employee_number: "A" + i, manager_review_done: i <= 5, final_rating: 3, rating_scale: "1-5" });
    for (let i = 1; i <= 10; i++) pms.push({ employee_number: "B" + i, manager_review_done: i <= 2, final_rating: 3, rating_scale: "1-5" });

    const scoreOf = (dom: ReturnType<typeof compute>, dept: string) => {
      const t = dom.tables.find((x) => x.title === "Compound risk by department")!;
      const row = t.rows.find((r) => r[0] === dept)!;
      return row[row.length - 1];
    };

    const before = scoreOf(compute({ employeeRows: base, pmsRows: pms, asOf: "2026-05-31" }), "Alpha");

    // Add a fully-healthy Gamma dept (100% reviews) — would change min-max ranges.
    const base2 = [...base];
    const pms2 = [...pms];
    for (let i = 1; i <= 10; i++) {
      base2.push({ employee_number: "G" + i, department: "Gamma", employment_status: "Working" });
      pms2.push({ employee_number: "G" + i, manager_review_done: true, final_rating: 3, rating_scale: "1-5" });
    }
    const after = scoreOf(compute({ employeeRows: base2, pmsRows: pms2, asOf: "2026-05-31" }), "Alpha");

    expect(after).toBe(before); // absolute scoring → unchanged by peers (min-max would have shifted it)
    expect(before).toBe(50); // review rate 50% → review-gap 0.5 → only signal present → score 50
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

describe("attritionEconomics", () => {
  it("computes cost-per-hire × trailing-12-month leavers as raw numbers", () => {
    const f = fixture();
    const r = attritionEconomics({ ...f, asOf: "2026-05-31" });
    expect(r.costPerHire).toBe(100000); // 300,000 cost / 3 joined
    expect(r.leavers12m).toBe(3);
    expect(r.totalCost).toBe(300000);
  });

  it("returns a null total when cost or leavers are missing", () => {
    expect(attritionEconomics({ employeeRows: [], asOf: "2026-05-31" }).totalCost).toBeNull();
  });
});
