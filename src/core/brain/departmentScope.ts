// UP-2 — per-department HR Brain. Re-projects the whole workspace onto a single
// department so the Brain (and any builder) can diagnose just that team: an HRBP or
// department head gets dept-specific findings, health and roadmap, not the org-wide
// view. Pairs with the Manager Cockpit. Pure + deterministic.
//
// Scoping is by the natural key of each dataset kind:
//   department field : employee_master, ta_requisition, payroll_aggregate, engagement_survey
//   employee_number  : pms_review, payroll_record, ld_enrollment, admin_lifecycle
//   assigned emp.    : admin_asset
//   kept whole       : ld_program, admin_contract (org-level reference, no dept/emp key)
// A scopeable snapshot that empties out is dropped (its domain degrades gracefully).

import { MemoryStore } from "../store/memoryStore";
import type { DataSource, Snapshot } from "../store/types";

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const isWorking = (r: Record<string, unknown>) => str(r["employment_status"]) === "Working";

const DEPT_FIELD = new Set(["employee_master", "ta_requisition", "payroll_aggregate", "engagement_survey"]);
const EMP_FIELD = new Set(["pms_review", "payroll_record", "ld_enrollment", "admin_lifecycle"]);
const KEEP_WHOLE = new Set(["ld_program", "admin_contract"]);

// Departments present in the latest employee master, with active counts, largest first.
export function departmentsOf(store: DataSource): { name: string; active: number; total: number }[] {
  const rows = store.getLatest("employee_master")?.rows ?? [];
  const m = new Map<string, { active: number; total: number }>();
  for (const r of rows) {
    const d = str(r["department"]);
    if (!d) continue;
    const e = m.get(d) ?? { active: 0, total: 0 };
    e.total += 1;
    if (isWorking(r)) e.active += 1;
    m.set(d, e);
  }
  return [...m.entries()].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
}

// All employee_numbers that belong to `dept` across every employee-master period, so
// per-employee joins (PMS, L&D, payroll) match anyone who was in the department.
function deptEmployeeIds(store: DataSource, dept: string): Set<string> {
  const ids = new Set<string>();
  for (const s of store.allSnapshots()) {
    if (s.kind !== "employee_master") continue;
    for (const r of s.rows) if (str(r["department"]) === dept) ids.add(str(r["employee_number"]));
  }
  return ids;
}

function scopeRows(snap: Snapshot, dept: string, empIds: Set<string>): Snapshot["rows"] | null {
  if (KEEP_WHOLE.has(snap.kind)) return snap.rows;
  if (DEPT_FIELD.has(snap.kind)) return snap.rows.filter((r) => str(r["department"]) === dept);
  if (EMP_FIELD.has(snap.kind)) return snap.rows.filter((r) => empIds.has(str(r["employee_number"])));
  if (snap.kind === "admin_asset") return snap.rows.filter((r) => empIds.has(str(r["assigned_employee_number"])));
  return null; // unknown kind → drop from a department view rather than mislabel it
}

// A new store holding only `dept`'s slice of every snapshot. Empty scopeable
// snapshots are omitted; org-level reference kinds are kept whole.
export function scopeStoreToDepartment(store: DataSource, dept: string): MemoryStore {
  const empIds = deptEmployeeIds(store, dept);
  const out = new MemoryStore();
  for (const s of store.allSnapshots()) {
    const rows = scopeRows(s, dept, empIds);
    if (rows === null) continue;
    if (rows.length === 0 && !KEEP_WHOLE.has(s.kind)) continue;
    out.add({ ...s, rows });
  }
  return out;
}
