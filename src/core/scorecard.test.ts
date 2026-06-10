import { describe, it, expect } from "vitest";
import { ragFor, buildScorecard, scorecardSummary } from "./scorecard";
import { MemoryStore } from "./store/memoryStore";
import type { Snapshot } from "./store/types";
import type { Row } from "./ingest/types";

const snap = (kind: string, asOf: string, rows: Row[]): Snapshot => ({ id: `${kind}:${asOf}`, kind, asOf, periodLabel: asOf, sourceFile: kind, compatibility: "full", rows });

describe("ragFor", () => {
  it("higher-is-better: green at/above, amber just below, red far below, none if missing", () => {
    expect(ragFor(85, 80, true)).toBe("green");
    expect(ragFor(80, 80, true)).toBe("green");
    expect(ragFor(74, 80, true)).toBe("amber");
    expect(ragFor(60, 80, true)).toBe("red");
    expect(ragFor(null, 80, true)).toBe("none");
  });
  it("lower-is-better: green at/below, amber just above, red far above", () => {
    expect(ragFor(4, 5, false)).toBe("green");
    expect(ragFor(5, 5, false)).toBe("green");
    expect(ragFor(5.4, 5, false)).toBe("amber");
    expect(ragFor(12, 5, false)).toBe("red");
  });
});

describe("buildScorecard", () => {
  it("rags a live KPI and marks domains without data as No data", () => {
    const store = new MemoryStore();
    store.add(snap("employee_master", "2026-05-31", Array.from({ length: 40 }, (_, i) => ({ employee_number: "E" + i, department: "Tech", employment_status: "Working", date_joined: "2019-01-01" }))));
    store.add(snap("ta_requisition", "2026-05-31", [{ requisition_id: "R1", department: "Tech", status: "Filled", open_date: "2026-04-01", applications: 100, shortlisted: 40, interviewed: 12, offers_made: 10, offers_accepted: 9, joined: 9, primary_source: "Referral" }]));
    const rows = buildScorecard(store, {});
    const offer = rows.find((r) => r.id === "offer_accept");
    expect(offer?.value).not.toBe(null); // 9/10 = 90%
    expect(["green", "amber", "red"]).toContain(offer?.rag);
    const ld = rows.find((r) => r.id === "ld_coverage");
    expect(ld?.rag).toBe("none");
    expect(ld?.status).toBe("No data");
  });

  it("prefers a user-set target over the default", () => {
    const store = new MemoryStore();
    store.add(snap("employee_master", "2026-05-31", [{ employee_number: "E1", department: "Tech", employment_status: "Working", date_joined: "2024-01-01" }]));
    store.add(snap("ta_requisition", "2026-05-31", [{ requisition_id: "R1", status: "Filled", offers_made: 10, offers_accepted: 7 }]));
    expect(buildScorecard(store, {}).find((r) => r.id === "offer_accept")?.target).toBe(80);
    expect(buildScorecard(store, { offer_accept: 60 }).find((r) => r.id === "offer_accept")?.target).toBe(60);
  });

  it("computes period-over-period trend when history exists", () => {
    const store = new MemoryStore();
    const emp = (n: number) => Array.from({ length: n }, (_, i) => ({ employee_number: "E" + i, department: "Tech", employment_status: "Working", date_joined: "2020-01-01" }));
    store.add(snap("employee_master", "2026-04-30", emp(30)));
    store.add(snap("employee_master", "2026-05-31", emp(40)));
    store.add(snap("ta_requisition", "2026-04-30", [{ requisition_id: "R1", status: "Filled", offers_made: 10, offers_accepted: 7 }])); // 70%
    store.add(snap("ta_requisition", "2026-05-31", [{ requisition_id: "R2", status: "Filled", offers_made: 10, offers_accepted: 9 }])); // 90%
    const offer = buildScorecard(store, {}).find((r) => r.id === "offer_accept");
    expect(offer?.prior).not.toBe(null);
    expect(offer?.delta ?? 0).toBeGreaterThan(0); // improved 70% -> 90%
    expect(offer?.trendTone).toBe("good"); // higher-is-better, rising
    expect(offer?.trend).toContain("pp");
  });

  it("governs org layers when reporting-manager data is present", () => {
    const store = new MemoryStore();
    const rows: Row[] = [
      { employee_number: "H", full_name: "Head", employment_status: "Working", reporting_manager: "", date_joined: "2018-01-01" },
      { employee_number: "M", full_name: "Mgr", employment_status: "Working", reporting_manager: "Head", date_joined: "2019-01-01" },
      ...Array.from({ length: 6 }, (_, i) => ({ employee_number: "E" + i, full_name: "Emp " + i, employment_status: "Working", reporting_manager: "Mgr", date_joined: "2021-01-01" })),
    ];
    store.add(snap("employee_master", "2026-05-31", rows));
    const layers = buildScorecard(store, {}).find((r) => r.id === "org_layers");
    expect(layers?.value).toBe(3); // Head -> Mgr -> Emp
    expect(layers?.rag).toBe("green"); // 3 <= default target 6
  });

  it("leaves trend empty when there is no prior period", () => {
    const store = new MemoryStore();
    store.add(snap("employee_master", "2026-05-31", [{ employee_number: "E1", employment_status: "Working", date_joined: "2024-01-01" }]));
    store.add(snap("ta_requisition", "2026-05-31", [{ requisition_id: "R1", status: "Filled", offers_made: 10, offers_accepted: 9 }]));
    const offer = buildScorecard(store, {}).find((r) => r.id === "offer_accept");
    expect(offer?.prior).toBe(null);
    expect(offer?.trend).toBe("");
  });
});

describe("goal trajectory (UP-4)", () => {
  const emp = (n: number) => Array.from({ length: n }, (_, i) => ({ employee_number: "E" + i, department: "Tech", employment_status: "Working", date_joined: "2020-01-01" }));
  const ta = (made: number, acc: number): Row => ({ requisition_id: "R", status: "Filled", offers_made: made, offers_accepted: acc });

  it("flags a below-target KPI as off_track", () => {
    const s = new MemoryStore();
    s.add(snap("employee_master", "2026-05-31", emp(20)));
    s.add(snap("ta_requisition", "2026-05-31", [ta(10, 5)])); // 50% < 80 target
    const offer = buildScorecard(s, {}).find((r) => r.id === "offer_accept")!;
    expect(offer.rag).not.toBe("green");
    expect(offer.track).toBe("off_track");
  });

  it("flags a green-but-slipping KPI as at_risk (the future-red RAG misses)", () => {
    const s = new MemoryStore();
    s.add(snap("employee_master", "2026-04-30", emp(20)));
    s.add(snap("employee_master", "2026-05-31", emp(20)));
    s.add(snap("ta_requisition", "2026-04-30", [ta(10, 10)])); // 100% green
    s.add(snap("ta_requisition", "2026-05-31", [ta(10, 9)])); // 90% still green but −10pp
    const offer = buildScorecard(s, {}).find((r) => r.id === "offer_accept")!;
    expect(offer.rag).toBe("green");
    expect(offer.trendTone).toBe("bad");
    expect(offer.track).toBe("at_risk");
  });

  it("treats a green, improving KPI as on_track", () => {
    const s = new MemoryStore();
    s.add(snap("employee_master", "2026-04-30", emp(20)));
    s.add(snap("employee_master", "2026-05-31", emp(20)));
    s.add(snap("ta_requisition", "2026-04-30", [ta(10, 8)])); // 80% green
    s.add(snap("ta_requisition", "2026-05-31", [ta(10, 10)])); // 100% green, improving
    expect(buildScorecard(s, {}).find((r) => r.id === "offer_accept")!.track).toBe("on_track");
  });

  it("summary partitions tracked KPIs into off-track / at-risk / on-track", () => {
    const s = new MemoryStore();
    s.add(snap("employee_master", "2026-05-31", emp(20)));
    s.add(snap("ta_requisition", "2026-05-31", [ta(10, 5)]));
    const sum = scorecardSummary(buildScorecard(s, {}));
    expect(sum.offTrack).toBeGreaterThanOrEqual(1);
    expect(sum.offTrack + sum.atRisk + sum.onTrack).toBe(sum.tracked);
  });
});
