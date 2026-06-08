import { describe, it, expect } from "vitest";
import { buildBrain, buildRoadmap, type BrainFinding } from "./brain";
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
    expect(early!.link?.page).toBe("People Analytics"); // deep-links to its evidence
    expect(early!.link?.tab).toBe("retention");
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

  it("flags department hotspots from compounding cross-functional risk", () => {
    const store = new MemoryStore();
    const emp: Row[] = Array.from({ length: 10 }, (_, i) => ({ employee_number: "E" + i, full_name: "E" + i, employment_status: "Working", department: "Tech", date_joined: "2021-01-01" }));
    store.add(snap("2026-05-31", emp));
    // Low training coverage (1 of 10) + low review completion (2 of 10) → Tech compounds.
    store.add({ id: "ld_enrollment:2026-05-31", kind: "ld_enrollment", asOf: "2026-05-31", periodLabel: "2026-05", sourceFile: "f", compatibility: "full", rows: [{ employee_number: "E0", program_id: "P1", status: "Completed" }] });
    const pms: Row[] = Array.from({ length: 10 }, (_, i) => ({ employee_number: "E" + i, cycle: "FY26-H1", manager_review_done: i < 2 }));
    store.add({ id: "pms_review:FY26-H1", kind: "pms_review", asOf: "2026-05-31", periodLabel: "FY26-H1", sourceFile: "f", compatibility: "full", rows: pms });

    const hot = buildBrain(store).findings.find((f) => f.id === "department_hotspots");
    expect(hot).toBeTruthy();
    expect(hot!.evidence.join(" ")).toMatch(/Tech/);
    expect(hot!.remedy.length).toBeGreaterThanOrEqual(3);
  });

  it("sequences findings into a prioritised Now/Next/Later roadmap", () => {
    const f = (id: string, severity: BrainFinding["severity"], owner: string, remedy: string): BrainFinding => ({ id, title: id, category: "", owner, severity, confidence: "confirmed", evidence: [], reason: "", remedy: [remedy] });
    const rm = buildRoadmap([f("statutory", "critical", "Payroll", "fix it"), f("emerging_trends", "low", "CHRO", "watch"), f("pay_gap", "high", "Total Rewards", "analyse")]);
    const byId = Object.fromEntries(rm.map((r) => [r.id, r]));
    expect(byId.statutory.horizon).toBe("Now"); // critical → Now
    expect(byId.statutory.firstAction).toBe("fix it");
    expect(byId.pay_gap.impact).toBe("High");
    expect(byId.pay_gap.effort).toBe("High");
    expect(byId.pay_gap.quadrant).toBe("Major initiative");
    expect(byId.pay_gap.horizon).toBe("Next"); // high-impact major bet → Next
    expect(byId.emerging_trends.horizon).toBe("Later"); // low impact → Later
    expect(rm[0].horizon).toBe("Now"); // sorted, Now first
  });

  it("flags KPIs sitting below the industry benchmark", () => {
    const { findings } = buildBrain(storeWithEarlyExits()); // first-year exit 100% vs typical 10–20%
    const bench = findings.find((f) => f.id === "below_benchmark");
    expect(bench).toBeTruthy();
    expect(bench!.evidence.join(" ")).toMatch(/vs typical/);
    expect(bench!.confidence).toBe("likely"); // illustrative bands → not "confirmed"
  });

  it("scores HR maturity per dimension from the data", () => {
    const { maturity } = buildBrain(storeWithEarlyExits()); // 100% first-year exits
    const retention = maturity.dimensions.find((d) => d.key === "retention");
    expect(retention?.level).toBe(1); // worst band → Ad-hoc
    expect(maturity.overall.score).not.toBeNull();
  });

  it("flags low employee engagement (eNPS)", () => {
    const store = new MemoryStore();
    store.add(snap("2026-05-31", [{ employee_number: "1", employment_status: "Working", department: "Tech" }]));
    // 5 detractor responses (score 3) → eNPS -100
    store.add({ id: "engagement_survey:2026-05", kind: "engagement_survey", asOf: "2026-05-31", periodLabel: "2026-Q2", sourceFile: "f", compatibility: "full", rows: Array.from({ length: 5 }, () => ({ survey_period: "2026-Q2", department: "Tech", recommend_score: 3 })) });
    const f = buildBrain(store).findings.find((x) => x.id === "low_engagement");
    expect(f).toBeTruthy();
    expect(f!.severity).toBe("high"); // negative eNPS
  });

  it("surfaces HR Operations risk from contract renewals (and sequences it as a quick win)", () => {
    const store = new MemoryStore();
    store.add(snap("2026-05-31", [{ employee_number: "E1", employment_status: "Working", department: "Tech" }]));
    // ref = the admin_contract snapshot's as-of (2026-05-31): one already expired, two expiring within 30 days.
    store.add({
      id: "admin_contract:2026-05-31", kind: "admin_contract", asOf: "2026-05-31", periodLabel: "2026-05", sourceFile: "f", compatibility: "full",
      rows: [
        { contract_id: "C1", vendor_name: "Acme", expiry_date: "2026-01-01", annual_cost: 100000 }, // expired
        { contract_id: "C2", vendor_name: "Globex", expiry_date: "2026-06-20", annual_cost: 50000 }, // ≤30d
        { contract_id: "C3", vendor_name: "Initech", expiry_date: "2026-06-25", annual_cost: 50000 }, // ≤30d
      ],
    });
    const { findings, roadmap } = buildBrain(store);
    const f = findings.find((x) => x.id === "hr_operations");
    expect(f).toBeTruthy();
    expect(f!.severity).toBe("high"); // an expired contract escalates the watch-out to high
    expect(f!.owner).toBe("HR Admin");
    expect(f!.confidence).toBe("confirmed");
    expect(f!.evidence.join(" ")).toMatch(/expired|expiring/i);
    expect(f!.remedy.length).toBeGreaterThanOrEqual(3);
    expect(f!.link?.page).toBe("Function Analytics");
    const item = roadmap.find((r) => r.id === "hr_operations");
    expect(item?.horizon).toBe("Now"); // high impact + low (chase/calendar) effort → quick win
    expect(item?.quadrant).toBe("Quick win");
  });

  it("surfaces performance-management risk from an elevated PIP population", () => {
    const store = new MemoryStore();
    store.add(snap("2026-05-31", [{ employee_number: "E1", employment_status: "Working", department: "Tech" }]));
    // 20 reviews, all complete (no review-cycle watch-out), mid-scale ratings (no
    // leniency), but 4 on a PIP → only the "Elevated PIP population" watch-out fires.
    const pms: Row[] = Array.from({ length: 20 }, (_, i) => ({ employee_number: "P" + i, cycle: "FY26-H1", manager_review_done: true, final_rating: 3, rating_scale: "1-5", on_pip: i < 4, pip_outcome: i < 4 ? "Open" : "" }));
    store.add({ id: "pms_review:FY26-H1", kind: "pms_review", asOf: "2026-05-31", periodLabel: "FY26-H1", sourceFile: "f", compatibility: "full", rows: pms });
    const f = buildBrain(store).findings.find((x) => x.id === "performance_management");
    expect(f).toBeTruthy();
    expect(f!.title).toBe("Elevated PIP population"); // single watch-out → its own title
    expect(f!.severity).toBe("medium");
    expect(f!.evidence.join(" ")).toMatch(/PIP/);
    expect(f!.reason).toMatch(/performance plans|manager-capability/i);
    expect(f!.remedy.length).toBeGreaterThanOrEqual(3);
    expect(f!.owner).toBe("HR Business Partners");
    expect(f!.link?.page).toBe("Function Analytics");
  });

  it("downgrades the Performance Management maturity dimension when the PIP load is elevated", () => {
    // Same review completion (18/20 = 90% → band 3); the only difference is the PIP cohort.
    const perfDim = (onPip: number) => {
      const store = new MemoryStore();
      store.add(snap("2026-05-31", [{ employee_number: "E1", employment_status: "Working", department: "Tech" }]));
      const pms: Row[] = Array.from({ length: 20 }, (_, i) => ({ employee_number: "P" + i, cycle: "FY26-H1", manager_review_done: i < 18, final_rating: 3, rating_scale: "1-5", on_pip: i < onPip, pip_outcome: i < onPip ? "Open" : "" }));
      store.add({ id: "pms_review:FY26-H1", kind: "pms_review", asOf: "2026-05-31", periodLabel: "FY26-H1", sourceFile: "f", compatibility: "full", rows: pms });
      return buildBrain(store).maturity.dimensions.find((d) => d.key === "perf");
    };
    expect(perfDim(0)!.level).toBe(3); // 90% reviews, no elevated PIP
    const heavy = perfDim(4)!; // 4/20 on PIP → elevated
    expect(heavy.level).toBe(2); // downgraded one band
    expect(heavy.basis).toMatch(/PIP/);
  });

  it("is empty-safe with no data", () => {
    const r = buildBrain(new MemoryStore());
    expect(r.summary.total).toBe(0);
    expect(r.findings).toEqual([]);
    expect(r.health.score).toBe(100); // nothing wrong → perfect health
    expect(r.health.band).toBe("Excellent");
  });

  it("rolls findings up into a health score that drops with issues", () => {
    const r = buildBrain(storeWithEarlyExits());
    expect(r.health.score).toBeGreaterThan(0);
    expect(r.health.score).toBeLessThan(100); // at least one finding present
    expect(["Excellent", "Good", "Fair", "At Risk", "Critical"]).toContain(r.health.band);
    expect(r.health.caption.length).toBeGreaterThan(0);
  });
});
