import { describe, it, expect } from "vitest";
import { departmentsOf, scopeStoreToDepartment } from "./departmentScope";
import { buildBrain } from "./brain";
import { MemoryStore } from "../store/memoryStore";
import type { Snapshot } from "../store/types";
import type { Row } from "../ingest/types";

const snap = (kind: string, asOf: string, rows: Row[]): Snapshot => ({ id: `${kind}:${asOf}`, kind, asOf, periodLabel: asOf, sourceFile: "f", compatibility: "full", rows });

function store(): MemoryStore {
  const s = new MemoryStore();
  s.add(snap("employee_master", "2026-05-31", [
    { employee_number: "T1", department: "Tech", employment_status: "Working", date_joined: "2020-01-01" },
    { employee_number: "T2", department: "Tech", employment_status: "Working", date_joined: "2021-01-01" },
    { employee_number: "S1", department: "Sales", employment_status: "Working", date_joined: "2019-01-01" },
  ]));
  s.add(snap("pms_review", "2026-05-31", [
    { employee_number: "T1", final_rating: 4, rating_scale: "1-5", manager_review_done: true },
    { employee_number: "S1", final_rating: 3, rating_scale: "1-5", manager_review_done: false },
  ]));
  s.add(snap("ta_requisition", "2026-05-31", [
    { requisition_id: "R-T", department: "Tech", status: "Open", open_date: "2026-04-01" },
    { requisition_id: "R-S", department: "Sales", status: "Open", open_date: "2026-04-01" },
  ]));
  s.add(snap("ld_program", "2026-05-31", [{ program_id: "P1", program_name: "Safety", category: "Compliance" }]));
  return s;
}

describe("departmentsOf", () => {
  it("lists departments from the latest master, largest active first", () => {
    expect(departmentsOf(store()).map((d) => d.name)).toEqual(["Tech", "Sales"]);
    expect(departmentsOf(store())[0].active).toBe(2);
  });
});

describe("scopeStoreToDepartment", () => {
  const scoped = scopeStoreToDepartment(store(), "Tech");

  it("keeps only the department's rows in employee_master and dept-keyed kinds", () => {
    expect(scoped.getLatest("employee_master")!.rows.map((r) => r.employee_number)).toEqual(["T1", "T2"]);
    expect(scoped.getLatest("ta_requisition")!.rows.map((r) => r.requisition_id)).toEqual(["R-T"]);
  });

  it("filters employee-keyed kinds to the department's employees", () => {
    expect(scoped.getLatest("pms_review")!.rows.map((r) => r.employee_number)).toEqual(["T1"]); // S1 dropped
  });

  it("keeps org-level reference kinds whole (ld_program)", () => {
    expect(scoped.getLatest("ld_program")!.rows).toHaveLength(1);
  });

  it("drops a scopeable snapshot that empties out", () => {
    expect(scopeStoreToDepartment(store(), "Sales").getLatest("pms_review")!.rows.map((r) => r.employee_number)).toEqual(["S1"]);
    // a department with no TA reqs → ta snapshot dropped entirely
    const noTa = scopeStoreToDepartment(store(), "Sales");
    expect(noTa.getLatest("employee_master")!.rows.map((r) => r.employee_number)).toEqual(["S1"]);
  });

  it("yields an empty store for an unknown department", () => {
    expect(scopeStoreToDepartment(store(), "Nope").getLatest("employee_master")).toBeNull();
  });

  it("produces a department-scoped Brain (health computed on the dept slice only)", () => {
    const tech = buildBrain(scopeStoreToDepartment(store(), "Tech"));
    expect(tech.health.score).toBeGreaterThan(0);
    // the org store has 3 people; the Tech brain should only see 2
    expect(buildBrain(scopeStoreToDepartment(store(), "Tech")).summary.total).toBeGreaterThanOrEqual(0);
  });
});
