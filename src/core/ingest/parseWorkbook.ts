import * as XLSX from "xlsx";
import { DatasetSchema } from "../datasets";
import { coerce } from "./coerce";
import { parsePeriod } from "./period";
import { validateRows } from "./validate";
import type { Row, SnapshotCandidate } from "./types";

export async function parseWorkbook(
  data: ArrayBuffer,
  fileName: string,
  schema: DatasetSchema,
  overrideAsOf?: string,
): Promise<SnapshotCandidate> {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const alias = schema.aliasMap();
  const canonical = new Set(schema.columnNames);
  const dtypeByField = new Map(schema.fields.map((fld) => [fld.name, fld.dtype] as const));

  let best: { sheet: string; headerRow: number; headers: string[]; score: number } | null = null;
  for (const sheetName of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, blankrows: false });
    const scan = Math.min(10, aoa.length);
    for (let r = 0; r < scan; r++) {
      const headers = (aoa[r] || []).map((v) => (v == null ? "" : String(v).trim()));
      const mapped = headers
        .map((h) => alias[h.toLowerCase()])
        .filter((c): c is string => !!c && canonical.has(c));
      const score = new Set(mapped).size;
      if (!best || score > best.score) best = { sheet: sheetName, headerRow: r, headers, score };
    }
  }

  const period = parsePeriod(fileName, schema.periodKind);
  const asOf = overrideAsOf ?? period.asOf;
  const threshold = Math.max(1, Math.min(2, schema.keyFields.length));
  if (!best || best.score < threshold) {
    return reject(schema, fileName, asOf, period.periodLabel, "No sheet matched the template columns.");
  }

  const headerToField = best.headers.map((h) => alias[h.toLowerCase()]);
  const available = new Set(headerToField.filter((c): c is string => !!c && canonical.has(c)));
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[best.sheet], { header: 1, blankrows: false });
  const rows: Row[] = [];
  const rawRows: Record<string, unknown>[] = []; // pre-coercion values, for validation
  for (let r = best.headerRow + 1; r < aoa.length; r++) {
    const values = (aoa[r] || []) as unknown[];
    const row: Row = Object.fromEntries(schema.columnNames.map((n) => [n, null]));
    const raw: Record<string, unknown> = {};
    let hasData = false;
    best.headers.forEach((_, ci) => {
      const field = headerToField[ci];
      if (!field || !canonical.has(field)) return;
      raw[field] = values[ci];
      const c = coerce(dtypeByField.get(field)!, values[ci]);
      row[field] = c;
      if (c !== null && c !== "") hasData = true;
    });
    if (!hasData) continue;
    if (schema.keyFields.length && !schema.keyFields.some((k) => row[k] !== null && row[k] !== "")) continue;
    rows.push(row);
    rawRows.push(raw);
  }
  const { issues, rowsWithIssues } = validateRows(schema, rawRows, available);

  const missing = schema.columnNames.filter((c) => !available.has(c));
  const compatibility = determineCompatibility(available, schema);
  const status: SnapshotCandidate["status"] = compatibility !== "rejected" && asOf ? "imported" : "rejected";
  return {
    kind: schema.kind,
    sourceFile: fileName,
    asOf,
    periodLabel: overrideAsOf ?? period.periodLabel,
    detectedSheet: best.sheet,
    availableColumns: [...available].sort(),
    missingColumns: missing,
    compatibility,
    rowCount: rows.length,
    status,
    rows,
    notes: status === "imported" ? [period.note] : [period.note, "Rejected — missing required columns or period."],
    issues,
    rowsWithIssues,
  };
}

function determineCompatibility(
  available: Set<string>,
  schema: DatasetSchema,
): SnapshotCandidate["compatibility"] {
  const required = schema.requiredFields();
  const all = new Set(schema.columnNames);
  const hasAllRequired = [...required].every((c) => available.has(c));
  if (hasAllRequired) return [...all].every((c) => available.has(c)) ? "full" : "compatible_with_warnings";
  if (schema.keyFields.every((c) => available.has(c))) return "partial";
  return "rejected";
}

function reject(
  schema: DatasetSchema,
  fileName: string,
  asOf: string | null,
  label: string | null,
  msg: string,
): SnapshotCandidate {
  return {
    kind: schema.kind,
    sourceFile: fileName,
    asOf,
    periodLabel: label,
    detectedSheet: null,
    availableColumns: [],
    missingColumns: [...schema.columnNames],
    compatibility: "rejected",
    rowCount: 0,
    status: "rejected",
    rows: [],
    notes: [msg],
    issues: [],
    rowsWithIssues: 0,
  };
}
