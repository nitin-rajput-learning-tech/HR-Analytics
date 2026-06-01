import { describe, it, expect } from "vitest";
import { compute } from "./ld";
import type { Row } from "../ingest/types";

const programRows: Row[] = [{ program_id: "P1", category: "Mandatory", total_cost: 100000 }];
const enrollmentRows: Row[] = [
  { employee_number: "E1", program_id: "P1", status: "Completed", duration_hours: 8 },
  { employee_number: "E2", program_id: "P1", status: "Enrolled", duration_hours: 8 },
  { employee_number: "E3", program_id: "P1", status: "Completed", duration_hours: 4 },
];

describe("ld.compute", () => {
  it("returns an empty domain when there are no enrollments", () => {
    expect(compute({ enrollmentRows: [] }).hasData).toBe(false);
  });

  it("computes completion and coverage against active headcount", () => {
    const d = compute({ enrollmentRows, programRows, activeHeadcount: 100, asOf: "2026-05-31" });
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Completion Rate"]).toBe("66.7%");
    expect(kpi["Coverage"]).toBe("3.0%");
  });

  it("surfaces L&D spend via the program join", () => {
    const d = compute({ enrollmentRows, programRows, activeHeadcount: 100 });
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["L&D Spend"]).toBeTruthy();
  });

  it("flags thin coverage and incomplete mandatory training", () => {
    const d = compute({ enrollmentRows, programRows, activeHeadcount: 100, asOf: "2026-05-31" });
    expect(d.watchouts.some((w) => w.title.includes("coverage is thin"))).toBe(true);
    expect(d.watchouts.some((w) => w.title.includes("Mandatory/compliance"))).toBe(true);
  });
});
