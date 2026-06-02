import { describe, it, expect } from "vitest";
import { buildNewsletter } from "./newsletter";
import { MemoryStore } from "../core/store/memoryStore";
import type { Snapshot } from "../core/store/types";
import type { Row } from "../core/ingest/types";

const snap = (kind: string, asOf: string, rows: Row[], periodLabel?: string): Snapshot => ({
  id: `${kind}:${asOf}`,
  kind,
  asOf,
  periodLabel: periodLabel ?? asOf,
  sourceFile: kind + ".xlsx",
  compatibility: "full",
  rows,
});

function populated(): MemoryStore {
  const store = new MemoryStore();
  store.add(
    snap(
      "employee_master",
      "2026-05-31",
      Array.from({ length: 100 }, (_, i) => ({ employee_number: "E" + i, department: "Technology", employment_status: "Working" })),
      "May 2026",
    ),
  );
  store.add(
    snap("ta_requisition", "2026-05-31", [
      {
        requisition_id: "R1",
        department: "Tech",
        status: "Open",
        open_date: "2026-05-01",
        applications: 100,
        shortlisted: 40,
        interviewed: 12,
        offers_made: 10,
        offers_accepted: 8,
        joined: 8,
        primary_source: "Referral",
      },
    ]),
  );
  store.add(
    snap(
      "pms_review",
      "2026-05-31",
      Array.from({ length: 10 }, (_, i) => ({ employee_number: "E" + i, manager_review_done: i < 5, final_rating: 3, rating_scale: "1-5" })),
    ),
  );
  store.add(snap("payroll_statutory", "2026-05-31", [
    { pay_month: "2026-05", statutory_type: "PF", status: "Paid" },
    { pay_month: "2026-05", statutory_type: "TDS", status: "Late" },
  ]));
  return store;
}

describe("buildNewsletter", () => {
  it("assembles 10 sections in CHRO order (incl. attrition risk + pay equity)", () => {
    const nl = buildNewsletter(populated(), { appName: "Acme HR", periodLabel: "May 2026" });
    expect(nl.sections.map((s) => s.kind)).toEqual([
      "employee_master",
      "people_risk",
      "people_pay_equity",
      "ta_requisition",
      "pms_review",
      "ld_enrollment",
      "payroll_record",
      "admin_asset",
      "engagement",
      "cross_functional",
    ]);
    expect(nl.title).toBe("Acme HR — HR Newsletter");
  });

  it("surfaces a pay-equity finding in the action plan", () => {
    const store = new MemoryStore();
    const emp: Row[] = [];
    const pay: Row[] = [];
    for (let i = 0; i < 5; i++) {
      emp.push({ employee_number: "F" + i, department: "Tech", gender: "Female", employment_status: "Working", date_joined: "2020-01-01" });
      pay.push({ employee_number: "F" + i, gross_monthly: 80000 });
    }
    for (let i = 0; i < 5; i++) {
      emp.push({ employee_number: "M" + i, department: "Tech", gender: "Male", employment_status: "Working", date_joined: "2020-01-01" });
      pay.push({ employee_number: "M" + i, gross_monthly: 110000 });
    }
    store.add(snap("employee_master", "2026-05-31", emp, "May 2026"));
    store.add(snap("payroll_record", "2026-05-31", pay));
    const nl = buildNewsletter(store, {});
    expect(nl.actionPlan.some((a) => a.domain === "Pay Equity" && /pay gap/i.test(a.title))).toBe(true);
  });

  it("leads the exec brief with People & Org active headcount", () => {
    const nl = buildNewsletter(populated(), {});
    expect(nl.execBrief.headlineKpis[0].label).toBe("People & Org · Active Headcount");
  });

  it("surfaces TA's strong offer-accept rate as a win", () => {
    const nl = buildNewsletter(populated(), {});
    expect(nl.execBrief.wins.some((w) => w.includes("Talent Acquisition") && w.includes("80"))).toBe(true);
  });

  it("rolls watchouts into a severity-sorted, numbered action plan", () => {
    const nl = buildNewsletter(populated(), {});
    expect(nl.actionPlan[0].severity).toBe("high");
    expect(nl.actionPlan[0].priority).toBe(1);
    const rank = { high: 3, medium: 2, low: 1 } as const;
    for (let i = 1; i < nl.actionPlan.length; i++) {
      expect(rank[nl.actionPlan[i - 1].severity]).toBeGreaterThanOrEqual(rank[nl.actionPlan[i].severity]);
    }
  });

  it("degrades to all-placeholder with an empty store", () => {
    const nl = buildNewsletter(new MemoryStore(), { appName: "X" });
    expect(nl.domainsWithData).toBe(0);
    expect(nl.actionPlan).toHaveLength(0);
    expect(nl.execBrief.headlineKpis).toHaveLength(0);
  });
});
