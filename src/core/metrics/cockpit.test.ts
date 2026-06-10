import { describe, it, expect } from "vitest";
import { managerOptions, departmentOptions, scopeEmployees, buildCockpit } from "./cockpit";
import type { Row } from "../ingest/types";

const ASOF = "2026-05-31";
const e = (n: string, mgr: string, dept: string, extra: Partial<Row> = {}): Row => ({
  employee_number: n,
  full_name: n,
  employment_status: "Working",
  reporting_manager: mgr,
  department: dept,
  date_joined: "2019-01-01",
  last_working_day: "",
  ...extra,
});

function roster(): Row[] {
  return [
    ...Array.from({ length: 6 }, (_, i) => e("A" + i, "Asha", "Tech")),
    ...Array.from({ length: 3 }, (_, i) => e("B" + i, "Ben", "Tech")),
    ...Array.from({ length: 4 }, (_, i) => e("C" + i, "Cara", "Sales")),
    e("X1", "Asha", "Tech", { employment_status: "Relieved" }),
  ];
}

describe("scope options + scoping", () => {
  it("lists managers by team size (active), largest first", () => {
    const opts = managerOptions(roster());
    expect(opts.map((o) => o.name)).toEqual(["Asha", "Cara", "Ben"]);
    expect(opts[0].active).toBe(6);
    expect(opts[0].total).toBe(7);
  });

  it("lists departments by size", () => {
    expect(departmentOptions(roster()).map((o) => o.name)).toEqual(["Tech", "Sales"]);
  });

  it("scopes employees by manager and by department(s)", () => {
    expect(scopeEmployees(roster(), { by: "manager", value: "Ben" }).map((r) => r.employee_number)).toEqual(["B0", "B1", "B2"]);
    expect(scopeEmployees(roster(), { by: "department", values: ["Sales"] })).toHaveLength(4);
  });
});

describe("buildCockpit", () => {
  it("summarises a manager's team (headcount, relieved, tenure, label)", () => {
    const c = buildCockpit({ employeeRows: roster(), asOf: ASOF, scope: { by: "manager", value: "Asha" } });
    expect(c.scopeLabel).toBe("Asha's team");
    expect(c.headcount).toBe(6); // active
    expect(c.total).toBe(7); // includes the relieved X1
    expect(c.relieved).toBe(1);
    expect(c.avgTenureYrs).toBeGreaterThan(6);
  });

  it("counts pending exits and recent joiners in scope", () => {
    const rows = [
      e("A0", "Asha", "Tech", { last_working_day: "2026-07-01" }), // future LWD → pending exit
      e("A1", "Asha", "Tech", { date_joined: "2026-04-15" }), // <90 days → recent joiner
      e("A2", "Asha", "Tech"),
    ];
    const c = buildCockpit({ employeeRows: rows, asOf: ASOF, scope: { by: "manager", value: "Asha" } });
    expect(c.pendingExits).toBe(1);
    expect(c.newJoiners90d).toBe(1);
  });

  it("scores risk on the full roster then filters to scope (PIP'd report surfaces, with flags)", () => {
    const rows = roster();
    const pms: Row[] = [{ employee_number: "B0", on_pip: true, final_rating: 2, rating_scale: "1-5", manager_review_done: false }];
    const c = buildCockpit({ employeeRows: rows, asOf: ASOF, scope: { by: "manager", value: "Ben" }, pmsRows: pms });
    // Ben's team is 3; B0 is on PIP → should appear in topRisk with a performance driver
    expect(c.topRisk[0].employee_number).toBe("B0");
    expect(c.topRisk[0].contributors.some((x) => x.key === "performance")).toBe(true);
    // review tracking surfaces the pending review
    expect(c.reviews).toEqual({ tracked: 1, done: 0, pendingPeople: 1 });
    expect(c.flags.some((f) => /review/i.test(f))).toBe(true);
  });

  it("leaves reviews null when no PMS overlaps the scope", () => {
    const c = buildCockpit({ employeeRows: roster(), asOf: ASOF, scope: { by: "department", values: ["Sales"] } });
    expect(c.reviews).toBeNull();
  });

  it("scopes risk to the selected team only (other teams' risk excluded)", () => {
    const rows = roster();
    const pms: Row[] = [{ employee_number: "A0", on_pip: true, final_rating: 1, rating_scale: "1-5" }];
    const ben = buildCockpit({ employeeRows: rows, asOf: ASOF, scope: { by: "manager", value: "Ben" }, pmsRows: pms });
    // A0 (Asha's team) is PIP'd but must NOT appear in Ben's cockpit
    expect(ben.topRisk.every((r) => r.employee_number.startsWith("B"))).toBe(true);
  });
});
