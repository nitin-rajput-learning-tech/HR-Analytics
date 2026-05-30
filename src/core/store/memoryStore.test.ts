import { describe, it, expect } from "vitest";
import { MemoryStore } from "./memoryStore";
import type { Snapshot } from "./types";

const snap = (kind: string, asOf: string, rows: any[]): Snapshot => ({
  id: `${kind}:${asOf}`,
  kind,
  asOf,
  periodLabel: asOf,
  sourceFile: `${kind}.xlsx`,
  compatibility: "full",
  rows,
});

describe("MemoryStore", () => {
  it("adds snapshots and returns the latest per kind by asOf", () => {
    const s = new MemoryStore();
    s.add(snap("ta_requisition", "2026-04-30", [{ requisition_id: "A" }]));
    s.add(snap("ta_requisition", "2026-05-31", [{ requisition_id: "B" }]));
    expect(s.hasKind("ta_requisition")).toBe(true);
    expect(s.getLatest("ta_requisition")!.asOf).toBe("2026-05-31");
    expect(s.listByKind("ta_requisition").length).toBe(2);
  });
  it("dedupes by id (same kind+asOf replaces)", () => {
    const s = new MemoryStore();
    s.add(snap("pms_review", "2026-03-31", [{ a: 1 }]));
    s.add(snap("pms_review", "2026-03-31", [{ a: 2 }]));
    expect(s.listByKind("pms_review").length).toBe(1);
    expect(s.getLatest("pms_review")!.rows[0].a).toBe(2);
  });
  it("getLatest returns null for an unknown kind", () => {
    expect(new MemoryStore().getLatest("nope")).toBeNull();
  });
});
