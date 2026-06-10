import { describe, it, expect } from "vitest";
import { pivotDimensions, pivotMeasures, pivotTable, COUNT_MEASURE, TENURE_MEASURE } from "./pivot";
import type { Row } from "../ingest/types";

const ASOF = "2026-05-31";
function roster(): Row[] {
  return [
    { employee_number: "T1", department: "Tech", gender: "Female", current_city: "Pune", employment_status: "Working", date_joined: "2020-05-31" }, // 6y
    { employee_number: "T2", department: "Tech", gender: "Male", current_city: "Pune", employment_status: "Working", date_joined: "2024-05-31" }, // 2y
    { employee_number: "T3", department: "Tech", gender: "Male", current_city: "Mumbai", employment_status: "Working", date_joined: "2025-05-31" }, // 1y
    { employee_number: "S1", department: "Sales", gender: "Female", current_city: "Mumbai", employment_status: "Working", date_joined: "2023-05-31" }, // 3y
    { employee_number: "S2", department: "Sales", gender: "Male", current_city: "Mumbai", employment_status: "Relieved", date_joined: "2022-05-31" },
  ];
}

describe("pivot discovery", () => {
  it("offers dimensions present in the data (not ids/dates)", () => {
    const dims = pivotDimensions(roster()).map((d) => d.field);
    expect(dims).toContain("department");
    expect(dims).toContain("gender");
    expect(dims).toContain("current_city");
    expect(dims).not.toContain("employee_number");
    expect(dims).not.toContain("date_joined");
  });

  it("offers headcount always and tenure when date-joined is present", () => {
    expect(pivotMeasures(roster()).map((m) => m.field)).toEqual([COUNT_MEASURE, TENURE_MEASURE]);
    expect(pivotMeasures([{ employee_number: "X", department: "Tech" }]).map((m) => m.field)).toEqual([COUNT_MEASURE]);
  });
});

describe("pivotTable", () => {
  it("counts headcount by a dimension, sorted desc", () => {
    const r = pivotTable(roster(), { groupBy: "department", measureField: COUNT_MEASURE, agg: "count" });
    expect(r.rows.map((x) => [x.group, x.value])).toEqual([["Tech", 3], ["Sales", 2]]);
    expect(r.total).toBe(5);
    expect(r.measureLabel).toBe("Headcount");
  });

  it("averages tenure by a dimension", () => {
    const r = pivotTable(roster(), { groupBy: "department", measureField: TENURE_MEASURE, agg: "avg", asOf: ASOF });
    const byGroup = Object.fromEntries(r.rows.map((x) => [x.group, x.value]));
    expect(byGroup["Tech"]).toBeCloseTo(3.0, 1); // (6+2+1)/3 = 3.0
    expect(byGroup["Sales"]).toBeCloseTo(3.5, 1); // (S1 3y + S2 4y)/2 — all records, status is itself a dimension
    expect(r.unit).toBe("yrs");
    expect(r.measureLabel).toBe("Avg tenure");
  });

  it("supports min/max tenure", () => {
    const max = pivotTable(roster(), { groupBy: "department", measureField: TENURE_MEASURE, agg: "max", asOf: ASOF });
    expect(Object.fromEntries(max.rows.map((x) => [x.group, x.value]))["Tech"]).toBeCloseTo(6.0, 1);
    const min = pivotTable(roster(), { groupBy: "department", measureField: TENURE_MEASURE, agg: "min", asOf: ASOF });
    expect(Object.fromEntries(min.rows.map((x) => [x.group, x.value]))["Tech"]).toBeCloseTo(1.0, 1);
  });

  it("groups by any dimension (gender, location) and keeps a per-group n", () => {
    const g = pivotTable(roster(), { groupBy: "gender", measureField: COUNT_MEASURE, agg: "count" });
    expect(Object.fromEntries(g.rows.map((x) => [x.group, x.value]))).toEqual({ Female: 2, Male: 3 });
    const loc = pivotTable(roster(), { groupBy: "current_city", measureField: COUNT_MEASURE, agg: "count" });
    expect(Object.fromEntries(loc.rows.map((x) => [x.group, x.value]))).toEqual({ Mumbai: 3, Pune: 2 });
  });

  it("buckets blanks as Unspecified", () => {
    const r = pivotTable([{ employee_number: "X", employment_status: "Working" }], { groupBy: "department", measureField: COUNT_MEASURE, agg: "count" });
    expect(r.rows[0].group).toBe("Unspecified");
  });
});
