import { describe, it, expect } from "vitest";
import { buildOrgHealth } from "./orgHealth";
import type { Row } from "../ingest/types";

// Head -> {Mgr One, Mgr Two} -> ICs; plus Mgr Three (1 report) under Mgr One,
// giving a 4th layer and a low-span (delayering) manager.
function org(): Row[] {
  const rows: Row[] = [];
  rows.push({ employee_number: "H", full_name: "Head", employment_status: "Working", department: "Exec", reporting_manager: "" });
  rows.push({ employee_number: "M1", full_name: "Mgr One", employment_status: "Working", department: "Tech", reporting_manager: "Head" });
  rows.push({ employee_number: "M2", full_name: "Mgr Two", employment_status: "Working", department: "Sales", reporting_manager: "Head" });
  for (let i = 0; i < 8; i++) rows.push({ employee_number: "T" + i, full_name: "Tech " + i, employment_status: "Working", department: "Tech", reporting_manager: "Mgr One" });
  for (let i = 0; i < 6; i++) rows.push({ employee_number: "S" + i, full_name: "Sales " + i, employment_status: "Working", department: "Sales", reporting_manager: "Mgr Two" });
  rows.push({ employee_number: "M3", full_name: "Mgr Three", employment_status: "Working", department: "Tech", reporting_manager: "Mgr One" });
  rows.push({ employee_number: "T9", full_name: "Tech 9", employment_status: "Working", department: "Tech", reporting_manager: "Mgr Three" });
  return rows;
}

describe("buildOrgHealth", () => {
  const m = buildOrgHealth(org());
  const kpi = (label: string) => m.kpis.find((k) => k.label === label)?.value;

  it("degrades without reporting-manager data", () => {
    expect(buildOrgHealth([{ employee_number: "1", employment_status: "Working" }]).hasData).toBe(false);
  });

  it("computes layers, manager count and low-span managers", () => {
    expect(m.hasData).toBe(true);
    expect(kpi("Org Layers")).toBe("4"); // Head -> Mgr -> IC, and Head -> M1 -> M3 -> T9
    expect(kpi("People Managers")).toBe("4"); // Head, Mgr One, Mgr Two, Mgr Three
    expect(kpi("Low-span Managers")).toBe("1"); // Mgr Three (1 report); Head excluded as the root
  });

  it("renders an org-pyramid chart by layer", () => {
    expect(m.charts.map((c) => c.title)).toContain("Headcount by layer");
  });
});
