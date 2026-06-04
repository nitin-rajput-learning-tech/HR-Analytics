import { describe, it, expect } from "vitest";
import { combineEmployeeSnapshots, employeePeriods } from "./combineEmployees";
import { MemoryStore } from "../store/memoryStore";
import type { Snapshot } from "../store/types";
import type { Row } from "../ingest/types";

const snap = (asOf: string, rows: Row[]) => ({ asOf, rows });
const S = (asOf: string, rows: Row[]): Snapshot => ({ id: "employee_master:" + asOf, kind: "employee_master", asOf, periodLabel: asOf, sourceFile: "f", compatibility: "full", rows });

describe("combineEmployeeSnapshots", () => {
  it("returns a single snapshot unchanged", () => {
    const r = combineEmployeeSnapshots([snap("2026-05-05", [{ employee_number: "1", department: "Tech" }])]);
    expect(r.combined).toBe(false);
    expect(r.rows.length).toBe(1);
  });

  it("does NOT merge homogeneous snapshots (same schema → kept as separate periods)", () => {
    const a = snap("2026-04-30", [{ employee_number: "1", department: "Tech", gender: "Male" }]);
    const b = snap("2026-05-31", [
      { employee_number: "1", department: "Tech", gender: "Male" },
      { employee_number: "2", department: "Sales", gender: "Female" },
    ]);
    const r = combineEmployeeSnapshots([a, b]);
    expect(r.combined).toBe(false);
    expect(r.rows.length).toBe(2); // latest only — not a union
  });

  it("merges heterogeneous sources: backfills missing fields, unions employees, freshest wins", () => {
    const older = snap("2026-05-05", [
      { employee_number: "1", department: "Tech", gender: "Male", employment_status: "Working" },
      { employee_number: "9", department: "Ops", gender: "Female", employment_status: "Relieved", last_working_day: "2026-04-01" },
    ]);
    const newer = snap("2026-06-04", [
      { employee_number: "1", department: "Product", employment_status: "Working" }, // moved dept; no gender column at all
      { employee_number: "5", department: "Sales", employment_status: "Working" }, // new joiner
    ]);
    const r = combineEmployeeSnapshots([older, newer]);
    expect(r.combined).toBe(true);
    expect(r.addedFields).toContain("gender");
    const byId = Object.fromEntries(r.rows.map((x) => [String(x.employee_number), x]));
    expect(Object.keys(byId).sort()).toEqual(["1", "5", "9"]); // union of both sources
    expect(byId["1"].department).toBe("Product"); // freshest source wins for an overlapping field
    expect(byId["1"].gender).toBe("Male"); // backfilled from the richer older source
    expect(byId["9"].employment_status).toBe("Relieved"); // leaver carried in from the HR snapshot
    expect(byId["5"].gender ?? null).toBeNull(); // a new joiner the HR snapshot never saw → unknown
  });
});

describe("employeePeriods", () => {
  it("collapses heterogeneous sources to one period, but keeps homogeneous snapshots as a series", () => {
    const hetero = new MemoryStore();
    hetero.add(S("2026-05-05", [{ employee_number: "1", department: "Tech", gender: "Male" }]));
    hetero.add(S("2026-06-04", [{ employee_number: "1", department: "Tech" }])); // newer lacks gender → heterogeneous
    expect(employeePeriods(hetero).length).toBe(1);

    const homo = new MemoryStore();
    homo.add(S("2026-04-30", [{ employee_number: "1", department: "Tech", gender: "Male" }]));
    homo.add(S("2026-05-31", [{ employee_number: "1", department: "Tech", gender: "Male" }]));
    expect(employeePeriods(homo).length).toBe(2);
  });
});
