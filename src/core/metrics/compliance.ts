// BUILD-4 — Compliance calendar. A forward-looking list of HR/payroll obligations
// with dates, so nothing lapses silently: statutory remittances (PF/ESI/PT/TDS/LWF)
// from payroll_statutory, and vendor/AMC renewals from admin_contract. Each item is
// classified overdue / due-soon / upcoming / done relative to an as-of date. Pure +
// deterministic (no Date.now — the as-of is passed in).

import type { Row } from "../ingest/types";

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const dayMs = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

export type ComplianceStatus = "overdue" | "due_soon" | "upcoming" | "done";

export interface ComplianceItem {
  id: string;
  title: string;
  category: string; // "Statutory" | "Contract renewal"
  detail: string;
  dueDate: string; // the original date string
  daysUntil: number | null; // negative = overdue; null if as-of unknown
  status: ComplianceStatus;
  owner: string;
  amount: number | null;
  source: "statutory" | "contract";
}

export interface ComplianceCalendar {
  items: ComplianceItem[]; // open items, soonest due first (overdue first)
  done: ComplianceItem[]; // settled items (paid / auto-renew / cancelled)
  summary: { overdue: number; dueSoon: number; upcoming: number; done: number; total: number };
  hasData: boolean;
}

const DUE_SOON_STATUTORY = 30; // days
const DUE_SOON_CONTRACT = 60; // renewals need lead time

function classify(daysUntil: number | null, dueSoonWindow: number): Exclude<ComplianceStatus, "done"> {
  if (daysUntil === null) return "upcoming";
  if (daysUntil < 0) return "overdue";
  return daysUntil <= dueSoonWindow ? "due_soon" : "upcoming";
}

export function buildComplianceCalendar(input: { statutoryRows?: Row[] | null; contractRows?: Row[] | null; asOf: string | null }): ComplianceCalendar {
  const refMs = dayMs(input.asOf);
  const daysTo = (ms: number | null): number | null => (ms === null || refMs === null ? null : Math.floor((ms - refMs) / 86_400_000));
  const open: ComplianceItem[] = [];
  const done: ComplianceItem[] = [];

  for (const r of input.statutoryRows ?? []) {
    const due = str(r["due_date"]);
    const dueMs = dayMs(due);
    if (!due) continue; // can't place an undated obligation
    const settled = str(r["paid_date"]) !== "" || str(r["status"]).toLowerCase() === "paid";
    const type = str(r["statutory_type"]) || "Statutory";
    const month = str(r["pay_month"]);
    const item: ComplianceItem = {
      id: `stat:${type}:${month}`,
      title: `${type} remittance${month ? ` — ${month}` : ""}`,
      category: "Statutory",
      detail: str(r["status"]) ? `Status: ${str(r["status"])}` : "Statutory remittance",
      dueDate: due,
      daysUntil: daysTo(dueMs),
      status: settled ? "done" : str(r["status"]).toLowerCase() === "late" ? "overdue" : classify(daysTo(dueMs), DUE_SOON_STATUTORY),
      owner: "Payroll",
      amount: toNum(r["amount"]),
      source: "statutory",
    };
    (item.status === "done" ? done : open).push(item);
  }

  for (const r of input.contractRows ?? []) {
    const exp = str(r["expiry_date"]);
    const expMs = dayMs(exp);
    if (!exp) continue;
    const renewal = str(r["renewal_status"]).toLowerCase();
    const noAction = renewal === "auto" || renewal === "cancelled"; // auto-renews or intentionally ending
    const vendor = str(r["vendor_name"]) || str(r["contract_id"]) || "Contract";
    const cat = str(r["category"]);
    const item: ComplianceItem = {
      id: `contract:${str(r["contract_id"]) || vendor}`,
      title: `Renew: ${vendor}`,
      category: "Contract renewal",
      detail: `${cat ? cat + " · " : ""}${str(r["renewal_status"]) || "renewal"}`,
      dueDate: exp,
      daysUntil: daysTo(expMs),
      status: noAction ? "done" : classify(daysTo(expMs), DUE_SOON_CONTRACT),
      owner: str(r["owner"]) || "HR Admin",
      amount: toNum(r["annual_cost"]),
      source: "contract",
    };
    (item.status === "done" ? done : open).push(item);
  }

  // Soonest first; within the same due date, overdue ahead of upcoming.
  const rank: Record<ComplianceStatus, number> = { overdue: 0, due_soon: 1, upcoming: 2, done: 3 };
  open.sort((a, b) => (a.daysUntil ?? 1e9) - (b.daysUntil ?? 1e9) || rank[a.status] - rank[b.status] || a.title.localeCompare(b.title));
  done.sort((a, b) => (b.daysUntil ?? -1e9) - (a.daysUntil ?? -1e9));

  const summary = {
    overdue: open.filter((i) => i.status === "overdue").length,
    dueSoon: open.filter((i) => i.status === "due_soon").length,
    upcoming: open.filter((i) => i.status === "upcoming").length,
    done: done.length,
    total: open.length + done.length,
  };

  return { items: open, done, summary, hasData: open.length + done.length > 0 };
}
