import { describe, it, expect } from "vitest";
import { compute } from "./engagement";
import type { Row } from "../ingest/types";

const resp = (dept: string, rec: number, m = 4, g = 4, c = 3, w = 4): Row => ({ survey_period: "2026-Q2", department: dept, recommend_score: rec, manager_score: m, growth_score: g, comp_score: c, worklife_score: w });

describe("engagement.compute", () => {
  it("returns an empty domain without recommend scores", () => {
    expect(compute([], null).hasData).toBe(false);
    expect(compute([{ survey_period: "x", department: "Tech" }], null).hasData).toBe(false);
  });

  it("computes eNPS as promoters minus detractors over responses", () => {
    // 6 promoters (9-10), 2 detractors (<=6), 2 passive (7-8) → (6-2)/10 = +40
    const rows = [
      ...Array.from({ length: 6 }, () => resp("Tech", 10)),
      ...Array.from({ length: 2 }, () => resp("Tech", 5)),
      ...Array.from({ length: 2 }, () => resp("Tech", 8)),
    ];
    const d = compute(rows, null);
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["eNPS"]).toBe("+40");
    expect(kpi["Responses"]).toBe("10");
  });

  it("identifies the weakest driver and breaks down by department", () => {
    const rows = Array.from({ length: 8 }, () => resp("Tech", 9, 4.5, 4, 2, 4)); // comp is weakest (2)
    const d = compute(rows, null);
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Weakest Driver"]).toMatch(/^Compensation/);
    const t = d.tables.find((x) => x.title === "Engagement by department");
    expect(t!.rows[0][0]).toBe("Tech");
  });

  it("flags a net-negative engagement department", () => {
    const rows = [
      ...Array.from({ length: 6 }, () => resp("Sales", 4)), // detractors
      ...Array.from({ length: 2 }, () => resp("Sales", 9)),
    ]; // eNPS = (2-6)/8 = -50
    const d = compute(rows, null);
    expect(d.watchouts.some((w) => /Sales/.test(w.title) && w.severity === "high")).toBe(true);
  });
});
