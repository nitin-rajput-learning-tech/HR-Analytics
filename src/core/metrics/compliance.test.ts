import { describe, it, expect } from "vitest";
import { buildComplianceCalendar } from "./compliance";
import type { Row } from "../ingest/types";

const ASOF = "2026-05-31";

function input() {
  const statutoryRows: Row[] = [
    { pay_month: "2026-05", statutory_type: "PF", due_date: "2026-06-15", status: "Pending", amount: 450000 }, // +15d → due_soon
    { pay_month: "2026-04", statutory_type: "TDS", due_date: "2026-05-07", status: "Late" }, // overdue
    { pay_month: "2026-05", statutory_type: "ESI", due_date: "2026-06-15", status: "Paid", paid_date: "2026-06-12" }, // done
    { pay_month: "2026-05", statutory_type: "PT", due_date: "2026-08-15", status: "Pending" }, // +76d → upcoming
  ];
  const contractRows: Row[] = [
    { contract_id: "CON-1", vendor_name: "Acme Facilities", category: "Facilities", expiry_date: "2026-06-10", renewal_status: "Pending", annual_cost: 600000, owner: "Admin Team" }, // +10d → due_soon
    { contract_id: "CON-2", vendor_name: "Zenith IT", category: "IT", expiry_date: "2026-05-01", renewal_status: "In-progress", owner: "IT" }, // expired → overdue
    { contract_id: "CON-3", vendor_name: "Summit Insurance", category: "Insurance", expiry_date: "2026-06-10", renewal_status: "Auto" }, // done (auto)
    { contract_id: "CON-4", vendor_name: "Vertex License", category: "License", expiry_date: "2026-10-01", renewal_status: "Pending" }, // +123d → upcoming
  ];
  return { statutoryRows, contractRows, asOf: ASOF };
}

describe("buildComplianceCalendar", () => {
  const cal = buildComplianceCalendar(input());

  it("summarises obligations by status across statutory + contracts", () => {
    expect(cal.summary).toEqual({ overdue: 2, dueSoon: 2, upcoming: 2, done: 2, total: 8 });
    expect(cal.hasData).toBe(true);
  });

  it("classifies statutory remittances by paid/late/date", () => {
    const byId = Object.fromEntries([...cal.items, ...cal.done].map((i) => [i.id, i]));
    expect(byId["stat:TDS:2026-04"].status).toBe("overdue"); // Late
    expect(byId["stat:PF:2026-05"].status).toBe("due_soon"); // +15d
    expect(byId["stat:PT:2026-05"].status).toBe("upcoming"); // +76d
    expect(byId["stat:ESI:2026-05"].status).toBe("done"); // Paid
  });

  it("classifies contract renewals (auto/cancelled = no action)", () => {
    const byId = Object.fromEntries([...cal.items, ...cal.done].map((i) => [i.id, i]));
    expect(byId["contract:CON-2"].status).toBe("overdue"); // expired, in-progress
    expect(byId["contract:CON-1"].status).toBe("due_soon"); // +10d (within 60)
    expect(byId["contract:CON-4"].status).toBe("upcoming"); // +123d
    expect(byId["contract:CON-3"].status).toBe("done"); // auto-renew
    expect(byId["contract:CON-1"].owner).toBe("Admin Team");
    expect(byId["contract:CON-1"].amount).toBe(600000);
  });

  it("sorts open items soonest-due first (most overdue at the top)", () => {
    expect(cal.items[0].id).toBe("contract:CON-2"); // -30d, the most overdue
    for (let i = 1; i < cal.items.length; i++) expect(cal.items[i - 1].daysUntil!).toBeLessThanOrEqual(cal.items[i].daysUntil!);
    expect(cal.done.every((i) => i.status === "done")).toBe(true);
  });

  it("computes signed days-until (negative = overdue)", () => {
    const tds = cal.items.find((i) => i.id === "stat:TDS:2026-04")!;
    expect(tds.daysUntil).toBeLessThan(0);
    const pf = cal.items.find((i) => i.id === "stat:PF:2026-05")!;
    expect(pf.daysUntil).toBe(15);
  });

  it("skips undated obligations and degrades to empty", () => {
    const noDate = buildComplianceCalendar({ statutoryRows: [{ statutory_type: "PF", status: "Pending" }], contractRows: null, asOf: ASOF });
    expect(noDate.hasData).toBe(false);
    expect(buildComplianceCalendar({ asOf: ASOF }).hasData).toBe(false);
  });
});
