import { describe, it, expect } from "vitest";
import { buildMobility } from "./mobility";
import type { Row } from "../ingest/types";

const prior = {
  rows: [
    { employee_number: "1", full_name: "A", employment_status: "Working", department: "Tech", job_title: "Engineer", reporting_manager: "M1" },
    { employee_number: "2", full_name: "B", employment_status: "Working", department: "Sales", job_title: "Rep", reporting_manager: "M2" },
    { employee_number: "3", full_name: "C", employment_status: "Working", department: "Tech", job_title: "Engineer", reporting_manager: "M1" },
  ] as Row[],
};
const latest = {
  rows: [
    { employee_number: "1", full_name: "A", employment_status: "Working", department: "Product", job_title: "Engineer", reporting_manager: "M3" }, // dept + manager
    { employee_number: "2", full_name: "B", employment_status: "Working", department: "Sales", job_title: "Senior Rep", reporting_manager: "M2" }, // role
    { employee_number: "3", full_name: "C", employment_status: "Working", department: "Tech", job_title: "Engineer", reporting_manager: "M1" }, // no change
  ] as Row[],
};
const pms: Row[] = [
  { employee_number: "1", promotion_recommended: "Y" },
  { employee_number: "2", promotion_recommended: "N" },
  { employee_number: "3", promotion_recommended: "Y" },
];

describe("buildMobility", () => {
  const m = buildMobility({ employeeSnaps: [prior, latest], pmsRows: pms });
  const kpi = (label: string) => m.kpis.find((k) => k.label === label)?.value;

  it("detects internal moves across snapshots and reads the promotion signal", () => {
    expect(m.hasData).toBe(true);
    expect(kpi("Internal Moves")).toBe("2"); // employees 1 and 2 moved
    expect(kpi("Department Moves")).toBe("1"); // emp 1 Tech -> Product
    expect(kpi("Role Changes")).toBe("1"); // emp 2 Rep -> Senior Rep
    expect(kpi("Promotions Recommended")).toBe("2"); // emp 1 and 3
    expect(m.tables[0].rows.length).toBe(3); // dept+manager for emp1, role for emp2
  });

  it("shows only the promotion pipeline with a single snapshot", () => {
    const single = buildMobility({ employeeSnaps: [latest], pmsRows: pms });
    expect(single.hasData).toBe(true);
    expect(single.kpis.find((k) => k.label === "Internal Moves")).toBeUndefined();
    expect(single.kpis.find((k) => k.label === "Promotions Recommended")?.value).toBe("2");
  });

  it("degrades with no history and no PMS", () => {
    expect(buildMobility({ employeeSnaps: [latest], pmsRows: null }).hasData).toBe(false);
  });
});
