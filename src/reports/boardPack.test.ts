import { describe, it, expect } from "vitest";
import { buildBoardPack } from "./boardPack";
import { buildNewsletter } from "./newsletter";
import { MemoryStore } from "../core/store/memoryStore";
import type { Snapshot } from "../core/store/types";
import type { Row } from "../core/ingest/types";

const snap = (kind: string, asOf: string, rows: Row[], periodLabel?: string): Snapshot => ({ id: `${kind}:${asOf}`, kind, asOf, periodLabel: periodLabel ?? asOf, sourceFile: kind + ".xlsx", compatibility: "full", rows });

function populated(): MemoryStore {
  const s = new MemoryStore();
  s.add(snap("employee_master", "2026-05-31", Array.from({ length: 100 }, (_, i) => ({ employee_number: "E" + i, department: "Technology", employment_status: "Working", date_joined: "2021-01-01" })), "May 2026"));
  s.add(snap("ta_requisition", "2026-05-31", [{ requisition_id: "R1", department: "Tech", status: "Open", open_date: "2026-05-01", applications: 100, offers_made: 10, offers_accepted: 5, joined: 5 }]));
  s.add(snap("pms_review", "2026-05-31", Array.from({ length: 10 }, (_, i) => ({ employee_number: "E" + i, manager_review_done: i < 5, final_rating: 3, rating_scale: "1-5" }))));
  return s;
}

describe("buildBoardPack", () => {
  const nl = buildNewsletter(populated(), { appName: "Acme HR", periodLabel: "May 2026" });
  const bp = buildBoardPack(nl);

  it("carries the headline identity + HR Health", () => {
    expect(bp.appName).toBe("Acme HR");
    expect(bp.periodLabel).toBe("May 2026");
    expect(bp.health.score).toBeGreaterThanOrEqual(0);
    expect(bp.health.score).toBeLessThanOrEqual(100);
    expect(bp.health.band).toBeTruthy();
  });

  it("caps headline KPIs and top risks to a board-readable few", () => {
    expect(bp.headlineKpis.length).toBeLessThanOrEqual(5);
    expect(bp.topRisks.length).toBeLessThanOrEqual(3);
  });

  it("selects only the Now-horizon actions", () => {
    expect(bp.nowActions.length).toBeLessThanOrEqual(5);
    for (const a of bp.nowActions) {
      expect(a.title).toBeTruthy();
      expect(a.owner).toBeTruthy();
    }
    // every Now action corresponds to a Now roadmap item
    const nowTitles = new Set(nl.brain.roadmap.filter((r) => r.horizon === "Now").map((r) => r.title));
    expect(bp.nowActions.every((a) => nowTitles.has(a.title))).toBe(true);
  });

  it("summarises the scorecard RAG (on-target / at-risk / off-track + red list)", () => {
    expect(bp.scorecard.onTarget + bp.scorecard.atRisk + bp.scorecard.offTrack).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(bp.scorecard.red)).toBe(true);
  });

  it("has no comparison for a single-period store; non-null with history", () => {
    expect(bp.comparison).toBeNull();
    const s = populated();
    s.add(snap("employee_master", "2026-04-30", Array.from({ length: 95 }, (_, i) => ({ employee_number: "E" + i, department: "Technology", employment_status: "Working", date_joined: "2021-01-01" })), "Apr 2026"));
    const bp2 = buildBoardPack(buildNewsletter(s, {}));
    expect(bp2.comparison).not.toBeNull();
  });
});
