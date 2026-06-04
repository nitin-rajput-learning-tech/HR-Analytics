import { describe, it, expect } from "vitest";
import { buildSourceReconciliation } from "./sourceReconciliation";
import type { Row } from "../ingest/types";

const older = {
  asOf: "2026-05-05",
  rows: [
    { employee_number: "1", full_name: "A", department: "Tech", gender: "Male", employment_status: "Working" },
    { employee_number: "2", full_name: "B", department: "Sales", gender: "Female", employment_status: "Working" }, // active, will be absent from latest feed
    { employee_number: "9", full_name: "L", department: "Ops", gender: "Female", employment_status: "Relieved", last_working_day: "2026-04-01" }, // leaver
  ] as Row[],
};
const newer = {
  asOf: "2026-06-04",
  rows: [
    { employee_number: "1", full_name: "A", department: "Product", employment_status: "Working" }, // no gender column
    { employee_number: "5", full_name: "E", department: "Sales", employment_status: "Working" }, // new joiner, no gender
  ] as Row[],
};

describe("buildSourceReconciliation", () => {
  const m = buildSourceReconciliation([older, newer]);
  const kpi = (label: string) => m.kpis.find((k) => k.label === label)?.value;

  it("reconciles two heterogeneous feeds", () => {
    expect(m.hasData).toBe(true);
    expect(kpi("Data Sources")).toBe("2");
    expect(kpi("Active Only in Other Source")).toBe("1"); // employee 2 (active in older, absent from latest)
    expect(kpi("New in Latest Feed")).toBe("1"); // employee 5 (new joiner)
    expect(m.tables[0].rows.length).toBe(1);
    expect(m.tables[0].rows[0][0]).toBe("B");
  });

  it("flags both the feed gap and the missing-gender joiners", () => {
    const titles = m.watchouts.map((w) => w.title).join(" | ");
    expect(titles).toMatch(/not in the latest feed/i);
    expect(titles).toMatch(/missing gender/i);
  });

  it("is empty for a single source or same-schema periods", () => {
    expect(buildSourceReconciliation([newer]).hasData).toBe(false);
    const homoA = { asOf: "2026-04-30", rows: [{ employee_number: "1", department: "Tech", gender: "Male", employment_status: "Working" }] as Row[] };
    const homoB = { asOf: "2026-05-31", rows: [{ employee_number: "1", department: "Tech", gender: "Male", employment_status: "Working" }] as Row[] };
    expect(buildSourceReconciliation([homoA, homoB]).hasData).toBe(false);
  });
});
