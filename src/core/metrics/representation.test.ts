import { describe, it, expect } from "vitest";
import { buildRepresentation } from "./representation";
import type { Row } from "../ingest/types";

function fixture(): Row[] {
  const rows: Row[] = [];
  // 3 people-managers, 2 male + 1 female (leadership skews male).
  for (const [name, g] of [["Mgr A", "Male"], ["Mgr B", "Male"], ["Mgr C", "Female"]] as [string, string][]) {
    rows.push({ employee_number: "M-" + name, full_name: name, gender: g, employment_status: "Working", department: "Tech", reporting_manager: "CEO", date_joined: "2019-01-01" });
  }
  // 21 reports (12 female / 9 male) reporting to the three managers; 6 are recent hires.
  for (let i = 0; i < 21; i++) {
    rows.push({ employee_number: "E" + i, full_name: "Emp " + i, gender: i < 12 ? "Female" : "Male", employment_status: "Working", department: "Tech", reporting_manager: ["Mgr A", "Mgr B", "Mgr C"][i % 3], date_joined: i < 6 ? "2025-09-01" : "2020-01-01" });
  }
  // 4 leavers.
  for (let i = 0; i < 4; i++) {
    rows.push({ employee_number: "L" + i, full_name: "Left " + i, gender: i < 3 ? "Female" : "Male", employment_status: "Relieved", department: "Tech", date_joined: "2021-01-01", last_working_day: "2026-04-01" });
  }
  return rows;
}

describe("buildRepresentation", () => {
  const m = buildRepresentation({ employeeRows: fixture(), asOf: "2026-05-05" });
  const kpi = (label: string) => m.kpis.find((k) => k.label === label)?.value;

  it("degrades cleanly without gender data", () => {
    expect(buildRepresentation({ employeeRows: [{ employee_number: "1", employment_status: "Working" }], asOf: "2026-05-05" }).hasData).toBe(false);
  });

  it("computes overall + leadership + pipeline female shares", () => {
    expect(m.hasData).toBe(true);
    expect(kpi("Female (overall)")).toContain("%");
    expect(kpi("Leadership Female")).toContain("%");
    expect(kpi("New-Hire Female")).toContain("%");
    expect(kpi("Exiting Female")).toContain("%");
  });

  it("flags a leadership representation gap", () => {
    // overall ~54% female vs leadership 33% (1 of 3 managers) => >=20pp gap, high.
    expect(m.watchouts.some((w) => /under-represented in leadership/i.test(w.title))).toBe(true);
  });

  it("renders tenure + pipeline charts", () => {
    const titles = m.charts.map((c) => c.title);
    expect(titles).toContain("Female share by tenure");
    expect(titles).toContain("Diversity pipeline — female %");
  });
});
