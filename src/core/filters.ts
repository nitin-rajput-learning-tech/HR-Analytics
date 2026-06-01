// Interactive filtering + search + CSV export over employee rows — the
// original tool's apply_filters/export, as pure functions so they're testable.

import type { Row } from "./ingest/types";

export const FILTER_DIMENSIONS = [
  { field: "department", label: "Department" },
  { field: "legal_entity", label: "Legal Entity" },
  { field: "current_city", label: "Location" },
  { field: "employment_status", label: "Status" },
  { field: "gender", label: "Gender" },
  { field: "reporting_manager", label: "Manager" },
] as const;

export type FilterField = (typeof FILTER_DIMENSIONS)[number]["field"];
export type Filters = Partial<Record<FilterField, string[]>> & { search?: string };

const SEARCH_FIELDS = ["full_name", "employee_number", "work_email", "job_title", "sub_department", "department"];
const norm = (v: unknown): string => String(v ?? "").trim();
const valueOf = (r: Row, field: string): string => norm(r[field]) || "Unspecified";

export function filterRows(rows: Row[], filters: Filters): Row[] {
  const search = (filters.search ?? "").trim().toLowerCase();
  const active = FILTER_DIMENSIONS.filter((d) => (filters[d.field]?.length ?? 0) > 0);
  if (!search && active.length === 0) return rows;
  return rows.filter((r) => {
    for (const { field } of active) {
      if (!filters[field]!.includes(valueOf(r, field))) return false;
    }
    if (search) {
      const hay = SEARCH_FIELDS.map((f) => norm(r[f])).join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

export interface Facet {
  value: string;
  count: number;
}
export function facets(rows: Row[], field: string): Facet[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = valueOf(r, field);
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function activeFilterCount(filters: Filters): number {
  let n = filters.search?.trim() ? 1 : 0;
  for (const { field } of FILTER_DIMENSIONS) n += filters[field]?.length ?? 0;
  return n;
}

// --- CSV export ------------------------------------------------------------
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: Row[], columns: { name: string; label: string }[]): string {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.name])).join(",")).join("\n");
  return header + "\n" + body;
}

export function tableToCsv(columns: string[], rows: (string | number)[][]): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  return header + "\n" + body;
}
