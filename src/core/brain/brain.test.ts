import { describe, it, expect } from "vitest";
import { buildBrain } from "./brain";
import { MemoryStore } from "../store/memoryStore";
import type { Snapshot } from "../store/types";
import type { Row } from "../ingest/types";

const snap = (asOf: string, rows: Row[]): Snapshot => ({ id: "employee_master:" + asOf, kind: "employee_master", asOf, periodLabel: asOf, sourceFile: "f", compatibility: "full", rows });

function storeWithEarlyExits(): MemoryStore {
  const store = new MemoryStore();
  const working: Row[] = Array.from({ length: 20 }, (_, i) => ({ employee_number: "E" + i, full_name: "W" + i, employment_status: "Working", department: "Tech", date_joined: "2020-01-01" }));
  // 4 leavers, all within their first year → first-year exit share = 100% (> 15% target)
  const relieved: Row[] = Array.from({ length: 4 }, (_, i) => ({ employee_number: "R" + i, full_name: "R" + i, employment_status: "Relieved", department: "Tech", date_joined: "2026-01-01", last_working_day: "2026-03-01" }));
  store.add(snap("2026-05-31", [...working, ...relieved]));
  return store;
}

describe("buildBrain", () => {
  it("detects early attrition with a reason and a remedy plan", () => {
    const { findings, summary } = buildBrain(storeWithEarlyExits());
    const early = findings.find((f) => f.id === "early_attrition");
    expect(early).toBeTruthy();
    expect(early!.reason.length).toBeGreaterThan(20);
    expect(early!.remedy.length).toBeGreaterThanOrEqual(3);
    expect(early!.evidence.length).toBeGreaterThan(0);
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.known).toBeGreaterThanOrEqual(1); // early_attrition is a confirmed/known issue
  });

  it("sorts findings by severity (criticals first) and counts the summary", () => {
    const { findings, summary } = buildBrain(storeWithEarlyExits());
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < findings.length; i++) {
      expect(rank[findings[i].severity]).toBeGreaterThanOrEqual(rank[findings[i - 1].severity]);
    }
    expect(summary.total).toBe(findings.length);
    expect(summary.critical + summary.high + summary.medium + summary.low).toBe(findings.length);
  });

  it("is empty-safe with no data", () => {
    const r = buildBrain(new MemoryStore());
    expect(r.summary.total).toBe(0);
    expect(r.findings).toEqual([]);
  });
});
