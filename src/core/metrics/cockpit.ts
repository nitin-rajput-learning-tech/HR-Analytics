// BUILD-3 — Manager / HRBP cockpit. A focused one-screen brief scoped to a single
// manager's team or an HRBP's portfolio of departments, so the tool serves the
// front line (not just the CHRO). It reuses the existing per-employee attrition
// index (risk.ts) — scored on the FULL roster then filtered to the scope, so a
// person's risk is the same number wherever it's shown — and computes the team's
// headcount, tenure, review completion and a few plain-language flags. Pure +
// deterministic.

import type { Row } from "../ingest/types";
import { computeEmployeeRisks, type EmployeeRisk } from "./risk";

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";
const truthy = (v: unknown): boolean => v === true || ["y", "yes", "true", "1"].includes(str(v).toLowerCase());
const dayMs = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

export type CockpitScope = { by: "manager"; value: string } | { by: "department"; values: string[] };

export interface ScopeOption {
  name: string;
  active: number;
  total: number;
}

export interface CockpitReviews {
  tracked: number; // scoped active people with a review row
  done: number; // …whose manager review is complete
  pendingPeople: number; // scoped active people with no completed review
}

export interface Cockpit {
  scopeLabel: string;
  headcount: number; // active in scope
  total: number; // all records in scope
  relieved: number;
  pendingExits: number; // active with a future last-working-day
  newJoiners90d: number; // active with tenure < 90 days
  avgTenureYrs: number | null;
  reviews: CockpitReviews | null; // null when no PMS data overlaps the scope
  risk: { high: number; elevated: number; regrettable: number; avgScore: number | null };
  topRisk: EmployeeRisk[]; // highest-scoring people in scope (capped)
  flags: string[]; // plain-language watch-outs for this team
}

// Distinct reporting managers with their team sizes, largest first.
export function managerOptions(rows: Row[]): ScopeOption[] {
  return groupOptions(rows, "reporting_manager");
}
// Distinct departments with their sizes, largest first.
export function departmentOptions(rows: Row[]): ScopeOption[] {
  return groupOptions(rows, "department");
}
function groupOptions(rows: Row[], field: string): ScopeOption[] {
  const m = new Map<string, { active: number; total: number }>();
  for (const r of rows) {
    const name = str(r[field]);
    if (!name) continue;
    const e = m.get(name) ?? { active: 0, total: 0 };
    e.total += 1;
    if (isWorking(r)) e.active += 1;
    m.set(name, e);
  }
  return [...m.entries()].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
}

export function scopeEmployees(rows: Row[], scope: CockpitScope): Row[] {
  if (scope.by === "manager") return rows.filter((r) => str(r["reporting_manager"]) === scope.value);
  const set = new Set(scope.values);
  return rows.filter((r) => set.has(str(r["department"])));
}

function scopeLabelOf(scope: CockpitScope): string {
  if (scope.by === "manager") return scope.value ? `${scope.value}'s team` : "Team";
  if (scope.values.length === 0) return "No departments selected";
  if (scope.values.length === 1) return scope.values[0];
  return `${scope.values.length} departments`;
}

export interface CockpitInput {
  employeeRows: Row[];
  pmsRows?: Row[] | null;
  payrollRows?: Row[] | null;
  asOf: string | null;
  scope: CockpitScope;
  topN?: number;
}

export function buildCockpit(input: CockpitInput): Cockpit {
  const { employeeRows, pmsRows, payrollRows, asOf, scope } = input;
  const topN = input.topN ?? 8;
  const refMs = dayMs(asOf);
  const scoped = scopeEmployees(employeeRows, scope);
  const active = scoped.filter(isWorking);
  const ids = new Set(active.map((r) => str(r["employee_number"])));

  const pendingExits = active.filter((r) => {
    const lwd = dayMs(r["last_working_day"]);
    return refMs !== null && lwd !== null && lwd >= refMs;
  }).length;

  const tenures = refMs !== null ? active.map((r) => dayMs(r["date_joined"])).filter((j): j is number => j !== null).map((j) => (refMs - j) / 86_400_000) : [];
  const avgTenureYrs = tenures.length ? Math.round((tenures.reduce((s, d) => s + d, 0) / tenures.length / 365) * 10) / 10 : null;
  const newJoiners90d = tenures.filter((d) => d < 90).length;

  // Risk: score the WHOLE roster (so scores match other views), then keep the scope.
  const allRisk = computeEmployeeRisks({ employeeRows, asOf, payrollRows, pmsRows });
  const scopedRisk = allRisk.filter((r) => ids.has(r.employee_number)).sort((a, b) => b.score - a.score);
  const high = scopedRisk.filter((r) => r.band === "High").length;
  const elevated = scopedRisk.filter((r) => r.band === "Elevated").length;
  const regrettable = scopedRisk.filter((r) => r.regrettable).length;
  const avgScore = scopedRisk.length ? Math.round(scopedRisk.reduce((s, r) => s + r.score, 0) / scopedRisk.length) : null;

  // Reviews scoped to the team (only meaningful when PMS overlaps the scope).
  let reviews: CockpitReviews | null = null;
  if (pmsRows && pmsRows.some((r) => "employee_number" in r) && pmsRows.some((r) => "manager_review_done" in r)) {
    const byEmp = new Map<string, Row>();
    for (const r of pmsRows) byEmp.set(str(r["employee_number"]), r);
    let tracked = 0;
    let done = 0;
    for (const id of ids) {
      const pr = byEmp.get(id);
      if (!pr) continue;
      tracked += 1;
      if (truthy(pr["manager_review_done"])) done += 1;
    }
    if (tracked > 0) reviews = { tracked, done, pendingPeople: tracked - done };
  }

  const flags: string[] = [];
  if (regrettable > 0) flags.push(`${regrettable} high performer${regrettable === 1 ? "" : "s"} at elevated flight risk — prioritise stay-interviews.`);
  if (high > 0) flags.push(`${high} ${high === 1 ? "person is" : "people are"} at High attrition risk.`);
  if (pendingExits > 0) flags.push(`${pendingExits} pending exit${pendingExits === 1 ? "" : "s"} with a future last-working-day.`);
  if (reviews && reviews.pendingPeople > 0) flags.push(`${reviews.pendingPeople} of ${reviews.tracked} manager review${reviews.tracked === 1 ? "" : "s"} still pending.`);
  if (newJoiners90d > 0) flags.push(`${newJoiners90d} recent joiner${newJoiners90d === 1 ? "" : "s"} (<90 days) — ensure onboarding check-ins.`);

  return {
    scopeLabel: scopeLabelOf(scope),
    headcount: active.length,
    total: scoped.length,
    relieved: scoped.filter((r) => str(r["employment_status"]) === "Relieved").length,
    pendingExits,
    newJoiners90d,
    avgTenureYrs,
    reviews,
    risk: { high, elevated, regrettable, avgScore },
    topRisk: scopedRisk.slice(0, topN),
    flags,
  };
}
