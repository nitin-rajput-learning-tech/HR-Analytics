import { describe, it, expect } from "vitest";
import { filterRows, facets, activeFilterCount, rowsToCsv, tableToCsv } from "./filters";
import type { Row } from "./ingest/types";

const rows: Row[] = [
  { employee_number: "E1", full_name: "Asha Rao", department: "Tech", employment_status: "Working", gender: "Female", work_email: "asha@x.test", job_title: "SDE" },
  { employee_number: "E2", full_name: "Vikram Shah", department: "Tech", employment_status: "Relieved", gender: "Male", work_email: "vik@x.test", job_title: "SDE II" },
  { employee_number: "E3", full_name: "Neha Iyer", department: "Sales", employment_status: "Working", gender: "Female", work_email: "neha@x.test", job_title: "AM" },
  { employee_number: "E4", full_name: "Sam Khan", department: "Sales", employment_status: "Working", gender: "Male", work_email: "sam@x.test", job_title: "AM" },
  { employee_number: "E5", full_name: "Ravi Das", department: "", employment_status: "Working", gender: "Male", work_email: "ravi@x.test", job_title: "Analyst" },
];

describe("filterRows", () => {
  it("returns all rows unchanged when no filters", () => {
    expect(filterRows(rows, {})).toBe(rows);
  });
  it("filters by a dimension (OR within, AND across)", () => {
    expect(filterRows(rows, { department: ["Tech"] })).toHaveLength(2);
    expect(filterRows(rows, { department: ["Tech", "Sales"] })).toHaveLength(4);
    expect(filterRows(rows, { employment_status: ["Working"], gender: ["Female"] })).toHaveLength(2);
  });
  it("treats blank values as Unspecified", () => {
    expect(filterRows(rows, { department: ["Unspecified"] })).toHaveLength(1);
  });
  it("searches across name, id, email and title", () => {
    expect(filterRows(rows, { search: "asha" })).toHaveLength(1);
    expect(filterRows(rows, { search: "sde" })).toHaveLength(2);
    expect(filterRows(rows, { department: ["Sales"], search: "am" })).toHaveLength(2);
  });
});

describe("facets / activeFilterCount", () => {
  it("counts and sorts facet values", () => {
    const f = facets(rows, "department");
    expect(f.map((x) => x.value)).toEqual(["Sales", "Tech", "Unspecified"]);
    expect(f.find((x) => x.value === "Tech")!.count).toBe(2);
  });
  it("counts active filters", () => {
    expect(activeFilterCount({ department: ["Tech", "Sales"], search: "x" })).toBe(3);
    expect(activeFilterCount({})).toBe(0);
  });
});

describe("csv", () => {
  it("quotes cells containing commas", () => {
    expect(rowsToCsv([{ a: "hi", b: "x,y" }], [{ name: "a", label: "A" }, { name: "b", label: "B" }])).toBe('A,B\nhi,"x,y"');
  });
  it("serializes a metric table", () => {
    expect(tableToCsv(["X", "Y"], [[1, 2], ["a", "b"]])).toBe("X,Y\n1,2\na,b");
  });
});
