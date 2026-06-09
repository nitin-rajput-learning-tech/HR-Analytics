import { describe, it, expect } from "vitest";
import { actionSummary, actionFromRoadmap, withStatus, hasOpenActionForFinding, type Action } from "./actions";

const mk = (over: Partial<Action> = {}): Action => ({
  id: "a1", title: "Fix it", owner: "CHRO", status: "open", due: null, note: "", source: "manual", findingId: null, createdAt: "2026-05-01T00:00:00Z", doneAt: null, ...over,
});

describe("actionSummary", () => {
  it("counts by status and flags overdue (not-done past due)", () => {
    const actions = [
      mk({ status: "open", due: "2026-04-01" }), // overdue (before as-of)
      mk({ status: "in_progress", due: "2026-09-01" }), // future
      mk({ status: "done", due: "2026-04-01" }), // done → not overdue
    ];
    const s = actionSummary(actions, "2026-06-01");
    expect(s.total).toBe(3);
    expect(s.open).toBe(1);
    expect(s.in_progress).toBe(1);
    expect(s.done).toBe(1);
    expect(s.overdue).toBe(1); // only the open one past due
  });
});

describe("actionFromRoadmap", () => {
  it("creates an open, brain-sourced action linked to the finding", () => {
    const a = actionFromRoadmap({ id: "statutory", title: "Fix statutory", owner: "Payroll", firstAction: "Clear filings" }, "2026-06-01T00:00:00Z");
    expect(a.status).toBe("open");
    expect(a.source).toBe("brain");
    expect(a.findingId).toBe("statutory");
    expect(a.note).toBe("Clear filings");
    expect(a.id).toContain("statutory");
  });
});

describe("withStatus", () => {
  it("stamps doneAt when done and clears it otherwise", () => {
    const done = withStatus(mk(), "done", "2026-06-02T00:00:00Z");
    expect(done.status).toBe("done");
    expect(done.doneAt).toBe("2026-06-02T00:00:00Z");
    expect(withStatus(done, "in_progress", "2026-06-03T00:00:00Z").doneAt).toBeNull();
  });
});

describe("hasOpenActionForFinding", () => {
  it("detects an existing non-done action for a finding (avoids duplicates)", () => {
    const actions = [mk({ findingId: "pay_gap", status: "in_progress" })];
    expect(hasOpenActionForFinding(actions, "pay_gap")).toBe(true);
    expect(hasOpenActionForFinding(actions, "statutory")).toBe(false);
    expect(hasOpenActionForFinding([mk({ findingId: "pay_gap", status: "done" })], "pay_gap")).toBe(false); // done doesn't block a new one
  });
});
