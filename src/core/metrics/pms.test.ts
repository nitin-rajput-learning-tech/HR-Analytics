import { describe, it, expect } from "vitest";
import { compute } from "./pms";
import type { Row } from "../ingest/types";

function reviewRows(done: number, total = 10): Row[] {
  return Array.from({ length: total }, (_, i) => ({
    employee_number: "E" + i,
    cycle: "FY26-H1",
    manager_review_done: i < done,
    goals_set: true,
    final_rating: 3,
    rating_scale: "1-5",
    calibrated: true,
    potential_rating: "Medium",
    promotion_recommended: false,
    on_pip: false,
  }));
}

describe("pms.compute", () => {
  it("returns an empty domain when there are no rows", () => {
    expect(compute([], null).hasData).toBe(false);
  });

  it("computes review completion and flags when behind schedule", () => {
    const d = compute(reviewRows(5), "2025-09-30");
    expect(d.hasData).toBe(true);
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Review Completion"]).toBe("50.0%");
    expect(d.watchouts.some((w) => w.title.includes("behind schedule"))).toBe(true);
  });

  it("does not flag review completion when on track", () => {
    const d = compute(reviewRows(10), "2025-09-30");
    expect(d.watchouts.some((w) => w.title.includes("behind schedule"))).toBe(false);
  });

  it("infers the rating scale max and reports an average rating", () => {
    const d = compute(reviewRows(10), "2025-09-30");
    const kpi = d.kpis.find((k) => k.label.toLowerCase().includes("rating"));
    expect(kpi).toBeTruthy();
  });
});
