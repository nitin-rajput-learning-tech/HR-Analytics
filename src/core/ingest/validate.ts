// Row-level validation against a dataset schema. Pure + framework-free so every
// rule is unit-testable. Runs on RAW cell values (pre-coercion) because coercion
// is lossy — coerce("number","lots") and coerce("boolean","maybe") both return
// null, so we'd lose the distinction between "empty" and "bad value" otherwise.

import type { DatasetSchema } from "../datasets";
import { coerce } from "./coerce";

export type IssueKind = "missing_required" | "invalid_enum" | "bad_type";

export interface RowIssue {
  row: number; // 1-based position among the imported rows
  field: string;
  label: string;
  value: string; // offending raw value (truncated)
  kind: IssueKind;
  message: string;
}

const truncate = (s: string, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);

// Validate a single raw row (canonical field -> raw cell value). `present` is
// the set of canonical fields the file actually carries as columns — a required
// field whose column is entirely absent is a schema-compatibility concern
// (reported elsewhere), not a per-row error, so we only flag blank cells in
// columns that DO exist.
export function validateRow(
  schema: DatasetSchema,
  raw: Record<string, unknown>,
  rowNumber: number,
  present: Set<string>,
): RowIssue[] {
  const issues: RowIssue[] = [];
  for (const fld of schema.fields) {
    const rawStr = raw[fld.name] == null ? "" : String(raw[fld.name]).trim();
    const coerced = coerce(fld.dtype, raw[fld.name] ?? null);

    // Missing = the cell is blank. A non-blank value that fails to coerce is a
    // bad_type below, not "missing", so the message points at the real problem.
    if (rawStr === "") {
      if (fld.required && present.has(fld.name)) {
        issues.push({ row: rowNumber, field: fld.name, label: fld.label, value: rawStr, kind: "missing_required", message: `Missing required ${fld.label}` });
      }
      continue;
    }

    if (fld.allowed && fld.allowed.length) {
      const ok =
        fld.dtype === "boolean"
          ? coerced !== null // coercion accepted it as a boolean (Y/N/true/false/1/0…)
          : fld.allowed.some((a) => a.toLowerCase() === rawStr.toLowerCase());
      if (!ok) {
        issues.push({ row: rowNumber, field: fld.name, label: fld.label, value: truncate(rawStr), kind: "invalid_enum", message: `${fld.label} "${truncate(rawStr)}" is not one of: ${fld.allowed.join(", ")}` });
        continue;
      }
    }

    if ((fld.dtype === "number" || fld.dtype === "integer" || fld.dtype === "date") && coerced === null) {
      issues.push({ row: rowNumber, field: fld.name, label: fld.label, value: truncate(rawStr), kind: "bad_type", message: `${fld.label} "${truncate(rawStr)}" is not a valid ${fld.dtype}` });
    }
  }
  return issues;
}

export interface ValidationResult {
  issues: RowIssue[];
  rowsWithIssues: number;
}

// Validate every raw row; returns all issues plus how many distinct rows had ≥1.
export function validateRows(
  schema: DatasetSchema,
  rawRows: Record<string, unknown>[],
  present: Set<string>,
): ValidationResult {
  const issues: RowIssue[] = [];
  const bad = new Set<number>();
  rawRows.forEach((raw, i) => {
    const rowIssues = validateRow(schema, raw, i + 1, present);
    if (rowIssues.length) bad.add(i);
    issues.push(...rowIssues);
  });
  return { issues, rowsWithIssues: bad.size };
}

// Render issues to a CSV the user can download and hand back to the data owner.
export function issuesToCsv(issues: RowIssue[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["Row", "Field", "Issue", "Value", "Detail"].join(",");
  const lines = issues.map((i) => [String(i.row), i.label, i.kind, i.value, i.message].map(esc).join(","));
  return [head, ...lines].join("\n");
}
