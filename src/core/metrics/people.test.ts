import { describe, it, expect } from "vitest";
import { buildPeople, directorySection } from "./people";
import type { Row } from "../ingest/types";

function roster(): Row[] {
  const rows: Row[] = [];
  let i = 0;
  for (const [dept, n] of [["Tech", 30], ["Sales", 20], ["Ops", 10]] as [string, number][]) {
    for (let k = 0; k < n; k++) {
      i++;
      const working = i % 3 !== 0;
      rows.push({
        employee_number: "E" + i,
        full_name: "Emp " + i,
        legal_entity: "Acme",
        department: dept,
        sub_department: dept + "-Sub",
        job_title: dept === "Tech" ? "SDE" : "Exec",
        gender: i % 5 === 0 ? "Female" : "Male",
        current_city: i % 4 === 0 ? "Remote" : "Mumbai",
        reporting_manager: "Mgr" + ((i % 3) + 1),
        date_joined: k % 2 === 0 ? "2025-09-01" : "2019-03-01",
        employment_status: working ? "Working" : "Relieved",
        last_working_day: working ? "" : "2025-12-15",
        work_email: "e" + i + "@acme.test",
      });
    }
  }
  let made = 0;
  for (const r of rows) if (r.employment_status === "Working" && made < 5) { r.last_working_day = "2026-06-01"; made++; }
  return rows;
}

describe("buildPeople", () => {
  const sections = buildPeople(roster(), "2026-05-05");
  const byKind = Object.fromEntries(sections.map((s) => [s.metrics.kind, s.metrics]));
  const kpi = (kind: string, label: string) => byKind[kind].kpis.find((k) => k.label === label)?.value;

  it("returns the 9 employee-analytics tabs", () => {
    expect(sections.map((s) => s.key)).toEqual(["overview", "headcount", "tenure", "diversity", "geography", "managers", "attrition", "retention", "quality"]);
  });

  it("computes overview headcount and pending exits", () => {
    expect(kpi("people_overview", "Pending Exits")).toBe("5");
    expect(kpi("people_headcount", "Departments")).toBe("3");
  });

  it("computes tenure bands that sum to active headcount", () => {
    const chart = byKind["people_tenure"].charts[0];
    const activeCount = roster().filter((r) => r.employment_status === "Working").length;
    expect(chart.values.reduce((s, x) => s + x, 0)).toBe(activeCount);
  });

  it("produces diversity, geography, manager and data-quality views", () => {
    expect(kpi("people_diversity", "Female")).toContain("%");
    expect(Number(kpi("people_geography", "Locations"))).toBeGreaterThanOrEqual(2);
    expect(Number(kpi("people_managers", "People Managers"))).toBeGreaterThanOrEqual(1);
    expect(byKind["people_quality"].tables[0].rows).toHaveLength(16);
  });

  it("flags pending-exit pressure as a watch-out", () => {
    expect(kpi("people_attrition", "Pending Exits")).toBe("5");
  });

  it("analyses retention / quality-of-hire from join + exit dates", () => {
    // Leavers joined 2025-09-01 and left 2025-12-15 (~3.5 months) → first-year
    // exits; the cohort table spans the 2019 + 2025 joining years.
    expect(Number(kpi("people_retention", "Exits Analysed"))).toBeGreaterThan(0);
    expect(kpi("people_retention", "First-Year Exit Share")).toContain("%");
    const cohortYears = byKind["people_retention"].tables[0].rows.map((r) => r[0]);
    expect(cohortYears).toContain("2025");
  });

  it("tags dimension charts with a drill field for drill-down", () => {
    expect(byKind["people_headcount"].charts.find((c) => c.title === "Active headcount by department")?.drill).toBe("department");
    expect(byKind["people_geography"].charts[0].drill).toBe("current_city");
    expect(byKind["people_managers"].charts[0].drill).toBe("reporting_manager");
  });

  it("returns nothing for an empty roster", () => {
    expect(buildPeople([], "2026-05-05")).toHaveLength(0);
  });
});

describe("directorySection", () => {
  const rows = roster();
  it("lists matching employees with the standard columns", () => {
    const d = directorySection(rows);
    expect(d.kind).toBe("people_directory");
    expect(d.tables[0].columns).toContain("Employee #");
    expect(d.tables[0].columns).toContain("Reporting Manager");
    expect(d.tables[0].rows).toHaveLength(rows.length);
  });
  it("reports matching + active counts and reflects a filtered subset", () => {
    const full = directorySection(rows);
    const filtered = directorySection(rows.filter((r) => r.department === "Tech"));
    expect(full.kpis.find((k) => k.label === "Matching")!.value).toBe(String(rows.length));
    expect(filtered.tables[0].rows.length).toBeLessThan(full.tables[0].rows.length);
  });
});
