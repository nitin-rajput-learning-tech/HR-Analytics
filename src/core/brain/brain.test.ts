import { describe, it, expect } from "vitest";
import { buildBrain, buildRoadmap, buildHealthHistory, findingScope, periodDigest, type BrainFinding } from "./brain";
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

describe("findingScope", () => {
  it("collapses category · owner when they're identical, keeps both otherwise", () => {
    expect(findingScope({ category: "Talent Acquisition", owner: "Talent Acquisition" })).toBe("Talent Acquisition");
    expect(findingScope({ category: "Compliance", owner: "L&D" })).toBe("Compliance · L&D");
  });
});

describe("periodDigest", () => {
  const health = (prior: number | null) => ({
    score: 50, band: "Fair" as const, caption: "",
    prior, delta: prior === null ? null : 50 - prior,
    trend: prior === null ? null : "▼ −4", trendTone: "bad" as const,
    priorLabel: prior === null ? null : "Apr 2026",
  });
  const f = (id: string, isNew: boolean): BrainFinding => ({ id, title: id, category: "", owner: "", severity: "low", confidence: "confirmed", evidence: [], reason: "", remedy: [], isNew });

  it("summarises health direction plus new/resolved counts when a prior period exists", () => {
    const r = { health: health(54), findings: [f("a", true), f("b", false), f("c", true)], resolved: [{ id: "x", title: "X" }] };
    expect(periodDigest(r)).toBe("Since Apr 2026: HR Health ▼ −4 · 2 new · 1 resolved.");
  });

  it("returns null when there's no prior period", () => {
    expect(periodDigest({ health: health(null), findings: [], resolved: [] })).toBeNull();
  });
});

describe("buildHealthHistory", () => {
  const clean = (): Row[] => Array.from({ length: 20 }, (_, i) => ({ employee_number: "E" + i, full_name: "W" + i, employment_status: "Working", department: "Tech", date_joined: "2020-01-01" }));
  // a month with 4 first-year exits → a health-denting finding
  const withExits = (asOf: string): Row[] => [
    ...clean(),
    ...Array.from({ length: 4 }, (_, i) => ({ employee_number: "R" + i, full_name: "R" + i, employment_status: "Relieved", department: "Tech", date_joined: "2026-01-01", last_working_day: asOf })),
  ];

  it("returns a line ChartSpec with one point per roster month, current last", () => {
    const store = new MemoryStore();
    store.add(snap("2026-04-30", clean()));
    store.add(snap("2026-05-31", withExits("2026-05-31")));
    const spec = buildHealthHistory(store)!;
    expect(spec.kind).toBe("line");
    expect(spec.labels).toEqual(["Apr 2026", "May 2026"]);
    expect(spec.values).toHaveLength(2);
    expect(spec.values.every((v) => v >= 0 && v <= 100)).toBe(true);
    // health fell once the early exits appeared
    expect(spec.values[1]).toBeLessThan(spec.values[0]);
  });

  it("returns null with fewer than two roster months", () => {
    const one = new MemoryStore();
    one.add(snap("2026-05-31", clean()));
    expect(buildHealthHistory(one)).toBeNull();
    expect(buildHealthHistory(new MemoryStore())).toBeNull();
  });
});

describe("flight-risk cohort finding", () => {
  it("fires when many active employees score Elevated+ on the attrition index", () => {
    const store = new MemoryStore();
    const newJoiners = Array.from({ length: 12 }, (_, i) => ({ employee_number: "N" + i, full_name: "N" + i, employment_status: "Working", department: "Tech", reporting_manager: "M1", date_joined: "2026-03-01" }));
    const relieved = Array.from({ length: 8 }, (_, i) => ({ employee_number: "R" + i, full_name: "R" + i, employment_status: "Relieved", department: "Tech", reporting_manager: "M1", date_joined: "2025-01-01", last_working_day: "2026-04-01" }));
    store.add(snap("2026-05-31", [...newJoiners, ...relieved]));
    const r = buildBrain(store);
    const f = r.findings.find((x) => x.id === "flight_risk_cohort");
    expect(f).toBeTruthy();
    expect(f!.category).toBe("Retention");
    expect(f!.link?.tab).toBe("risk");
    expect(f!.remedy.length).toBeGreaterThanOrEqual(3);
  });

  it("stays quiet on a small, stable, long-tenured workforce", () => {
    const store = new MemoryStore();
    store.add(snap("2026-05-31", Array.from({ length: 10 }, (_, i) => ({ employee_number: "E" + i, full_name: "E" + i, employment_status: "Working", department: "Tech", reporting_manager: "M1", date_joined: "2017-01-01" }))));
    expect(buildBrain(store).findings.some((f) => f.id === "flight_risk_cohort")).toBe(false);
  });
});

describe("UP-2 expanded rules", () => {
  it("flags wide manager spans (>=3 managers with 15+ reports)", () => {
    const store = new MemoryStore();
    const rows: Row[] = [];
    for (const m of ["M1", "M2", "M3"]) for (let i = 0; i < 16; i++) rows.push({ employee_number: `${m}-${i}`, full_name: `${m}-${i}`, employment_status: "Working", department: "Tech", reporting_manager: m, date_joined: "2020-01-01" });
    store.add(snap("2026-05-31", rows));
    const f = buildBrain(store).findings.find((x) => x.id === "span_of_control");
    expect(f).toBeTruthy();
    expect(f!.link?.tab).toBe("managers");
    expect(f!.remedy.length).toBeGreaterThanOrEqual(3);
  });

  it("flags leadership under-representation when leaders lag the workforce by 10pp+", () => {
    const store = new MemoryStore();
    const rows: Row[] = [
      { employee_number: "L1", full_name: "Boss1", gender: "Male", employment_status: "Working", reporting_manager: "CEO", department: "Tech", date_joined: "2018-01-01" },
      { employee_number: "L2", full_name: "Boss2", gender: "Male", employment_status: "Working", reporting_manager: "CEO", department: "Tech", date_joined: "2018-01-01" },
    ];
    for (let i = 0; i < 12; i++) rows.push({ employee_number: "F" + i, full_name: "F" + i, gender: "Female", employment_status: "Working", reporting_manager: i % 2 ? "Boss1" : "Boss2", department: "Tech", date_joined: "2022-01-01" });
    for (let i = 0; i < 4; i++) rows.push({ employee_number: "M" + i, full_name: "MM" + i, gender: "Male", employment_status: "Working", reporting_manager: "Boss1", department: "Tech", date_joined: "2022-01-01" });
    store.add(snap("2026-05-31", rows));
    const f = buildBrain(store).findings.find((x) => x.id === "leadership_representation");
    expect(f).toBeTruthy();
    expect(f!.link?.tab).toBe("representation");
  });

  it("stays quiet on a balanced, normal-span workforce", () => {
    const store = new MemoryStore();
    const rows: Row[] = [];
    for (const m of ["Anya", "Raj"]) {
      rows.push({ employee_number: m, full_name: m, gender: m === "Anya" ? "Female" : "Male", employment_status: "Working", reporting_manager: "CEO", department: "Tech", date_joined: "2017-01-01" });
      for (let i = 0; i < 5; i++) rows.push({ employee_number: `${m}-${i}`, full_name: `${m}-${i}`, gender: i % 2 ? "Female" : "Male", employment_status: "Working", reporting_manager: m, department: "Tech", date_joined: "2021-01-01" });
    }
    store.add(snap("2026-05-31", rows));
    const ids = buildBrain(store).findings.map((f) => f.id);
    expect(ids).not.toContain("span_of_control");
    expect(ids).not.toContain("leadership_representation");
  });
});

describe("buildBrain skipTrend fast-path (FIX-8)", () => {
  it("yields the same health score but skips the prior-period trend recompute", () => {
    const store = new MemoryStore();
    const emp = (n: number) => Array.from({ length: n }, (_, i) => ({ employee_number: "E" + i, full_name: "W" + i, employment_status: "Working", department: "Tech", date_joined: "2020-01-01" }));
    store.add(snap("2026-04-30", emp(40)));
    store.add(snap("2026-05-31", emp(40)));
    const full = buildBrain(store);
    const fast = buildBrain(store, { skipTrend: true });
    expect(fast.health.score).toBe(full.health.score); // score unaffected
    expect(fast.health.trend).toBeNull(); // trend/prior skipped
    expect(fast.health.priorLabel).toBeNull();
    expect(fast.resolved).toEqual([]);
  });
});

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

  it("flags incomplete mandatory/compliance training as a compliance risk", () => {
    const store = new MemoryStore();
    store.add(snap("2026-05-31", [{ employee_number: "E1", employment_status: "Working", department: "Tech" }]));
    // 10 compliance enrollments, 7 complete → 70% (< 75%) → high severity.
    const enroll: Row[] = Array.from({ length: 10 }, (_, i) => ({ employee_number: "E" + i, program_id: "C1", category: "Compliance", status: i < 7 ? "Completed" : "Enrolled" }));
    store.add({ id: "ld_enrollment:2026-05", kind: "ld_enrollment", asOf: "2026-05-31", periodLabel: "2026-05", sourceFile: "f", compatibility: "full", rows: enroll });
    const f = buildBrain(store).findings.find((x) => x.id === "compliance_training");
    expect(f).toBeTruthy();
    expect(f!.severity).toBe("high"); // 70% complete is below the 75% high-severity threshold
    expect(f!.category).toBe("Compliance");
    expect(f!.confidence).toBe("confirmed");
    expect(f!.evidence.join(" ")).toMatch(/mandatory|compliance/i);
    expect(f!.link?.page).toBe("Function Analytics");
  });

  it("flags aging requisitions as a hiring-throughput risk", () => {
    const store = new MemoryStore();
    store.add(snap("2026-05-31", [{ employee_number: "E1", employment_status: "Working", department: "Tech" }]));
    // 5 requisitions open >90 days (opened 2026-01-01, as-of 2026-05-31) → high severity.
    const reqs: Row[] = Array.from({ length: 5 }, (_, i) => ({ requisition_id: "R" + i, department: "Tech", status: "Open", open_date: "2026-01-01" }));
    store.add({ id: "ta_requisition:2026-05-31", kind: "ta_requisition", asOf: "2026-05-31", periodLabel: "2026-05", sourceFile: "f", compatibility: "full", rows: reqs });
    const f = buildBrain(store).findings.find((x) => x.id === "ta_throughput");
    expect(f).toBeTruthy();
    expect(f!.title).toBe("Aging requisitions"); // single watch-out → its own title
    expect(f!.severity).toBe("high"); // 5 reqs open >90 days
    expect(f!.evidence.join(" ")).toMatch(/90 days/);
    expect(f!.owner).toBe("Talent Acquisition");
    expect(f!.link?.page).toBe("Function Analytics");
  });

  it("shows period-over-period health direction when there is a prior snapshot", () => {
    const store = new MemoryStore();
    // Identical, healthy employee feed in both months (employee_master snapshots are
    // combined across periods, so the trend must come from a functional domain).
    const emp: Row[] = Array.from({ length: 20 }, (_, i) => ({ employee_number: "E" + i, full_name: "W" + i, employment_status: "Working", department: "Tech", date_joined: "2020-01-01" }));
    store.add(snap("2026-04-30", emp));
    store.add(snap("2026-05-31", emp));
    const ta = (id: string, asOf: string, period: string, rows: Row[]): Snapshot => ({ id, kind: "ta_requisition", asOf, periodLabel: period, sourceFile: "f", compatibility: "full", rows });
    // Prior month: 5 requisitions open >90 days → an aging-requisitions finding → lower health.
    store.add(ta("ta_requisition:2026-04-30", "2026-04-30", "2026-04", Array.from({ length: 5 }, (_, i) => ({ requisition_id: "R" + i, department: "Tech", status: "Open", open_date: "2026-01-01" }))));
    // Current month: a single recently-opened req → no aging finding → higher health.
    store.add(ta("ta_requisition:2026-05-31", "2026-05-31", "2026-05", [{ requisition_id: "R9", department: "Tech", status: "Open", open_date: "2026-05-15" }]));
    const { health } = buildBrain(store);
    expect(health.prior).not.toBeNull();
    expect(health.priorLabel).toBe("Apr 2026");
    expect(health.score).toBeGreaterThan(health.prior as number); // health improved month-over-month
    expect(health.trend!.startsWith("▲")).toBe(true);
    expect(health.trendTone).toBe("good"); // higher health is a good move
  });

  it("has no health trend when there is only one period", () => {
    const r = buildBrain(storeWithEarlyExits()); // single snapshot
    expect(r.health.prior).toBeNull();
    expect(r.health.trend).toBeNull();
    expect(r.health.trendTone).toBe("neutral");
  });

  it("downgrades HR Operations maturity for contract/asset gaps", () => {
    const opsDim = (withAdminGap: boolean) => {
      const store = new MemoryStore();
      store.add(snap("2026-05-31", [{ employee_number: "E1", employment_status: "Working", department: "Tech" }]));
      // Statutory 100% on-time → band 5 before any operational downgrade.
      store.add({ id: "payroll_statutory:2026-05", kind: "payroll_statutory", asOf: "2026-05-31", periodLabel: "2026-05", sourceFile: "f", compatibility: "full", rows: [{ pay_month: "2026-05", statutory_type: "PF", status: "Paid" }, { pay_month: "2026-05", statutory_type: "TDS", status: "Paid" }] });
      if (withAdminGap) {
        // An expired contract → "Contract renewals due" watch-out (kind admin_asset).
        store.add({ id: "admin_contract:2026-05-31", kind: "admin_contract", asOf: "2026-05-31", periodLabel: "2026-05", sourceFile: "f", compatibility: "full", rows: [{ contract_id: "C1", vendor_name: "Acme", expiry_date: "2026-01-01", annual_cost: 100000 }] });
      }
      return buildBrain(store).maturity.dimensions.find((d) => d.key === "ops");
    };
    expect(opsDim(false)!.level).toBe(5); // statutory 100% on-time, no operational gaps
    const gapped = opsDim(true)!;
    expect(gapped.level).toBe(4); // downgraded one band for the contract gap
    expect(gapped.basis).toMatch(/contract\/asset/);
  });

  it("flags findings that newly emerged since the prior period", () => {
    const store = new MemoryStore();
    const emp: Row[] = Array.from({ length: 20 }, (_, i) => ({ employee_number: "E" + i, employment_status: "Working", department: "Tech", date_joined: "2020-01-01" }));
    store.add(snap("2026-04-30", emp));
    store.add(snap("2026-05-31", emp));
    const statutory = (asOf: string): Snapshot => ({ id: "payroll_statutory:" + asOf, kind: "payroll_statutory", asOf, periodLabel: asOf, sourceFile: "f", compatibility: "full", rows: [{ pay_month: asOf.slice(0, 7), statutory_type: "PF", status: "Paid" }, { pay_month: asOf.slice(0, 7), statutory_type: "TDS", status: "Late" }] });
    store.add(statutory("2026-04-30"));
    store.add(statutory("2026-05-31")); // statutory issue present in BOTH periods → not new
    const ta = (asOf: string, period: string, rows: Row[]): Snapshot => ({ id: "ta_requisition:" + asOf, kind: "ta_requisition", asOf, periodLabel: period, sourceFile: "f", compatibility: "full", rows });
    store.add(ta("2026-04-30", "2026-04", [{ requisition_id: "R0", department: "Tech", status: "Open", open_date: "2026-04-20" }])); // recent → no aging
    store.add(ta("2026-05-31", "2026-05", Array.from({ length: 5 }, (_, i) => ({ requisition_id: "R" + i, department: "Tech", status: "Open", open_date: "2026-01-01" })))); // 5 aging → NEW
    const { findings } = buildBrain(store);
    expect(findings.find((f) => f.id === "ta_throughput")?.isNew).toBe(true); // aging reqs only appeared this period
    expect(findings.find((f) => f.id === "statutory")?.isNew).toBe(false); // statutory issue was there last period too
  });

  it("reports findings resolved since the prior period", () => {
    const store = new MemoryStore();
    const emp: Row[] = Array.from({ length: 20 }, (_, i) => ({ employee_number: "E" + i, employment_status: "Working", department: "Tech", date_joined: "2020-01-01" }));
    store.add(snap("2026-04-30", emp));
    store.add(snap("2026-05-31", emp));
    const ta = (asOf: string, period: string, rows: Row[]): Snapshot => ({ id: "ta_requisition:" + asOf, kind: "ta_requisition", asOf, periodLabel: period, sourceFile: "f", compatibility: "full", rows });
    store.add(ta("2026-04-30", "2026-04", Array.from({ length: 5 }, (_, i) => ({ requisition_id: "R" + i, department: "Tech", status: "Open", open_date: "2026-01-01" })))); // aging → finding last period
    store.add(ta("2026-05-31", "2026-05", [{ requisition_id: "R9", department: "Tech", status: "Open", open_date: "2026-05-20" }])); // recent → cleared this period
    const r = buildBrain(store);
    expect(r.resolved.some((x) => x.id === "ta_throughput")).toBe(true); // open last period, gone now
    expect(r.findings.some((f) => f.id === "ta_throughput")).toBe(false);
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
