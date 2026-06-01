import type { DType } from "../datasets";

const TRUEISH = new Set(["y", "yes", "true", "1", "t"]);
const FALSEISH = new Set(["n", "no", "false", "0", "f"]);

export function coerce(dtype: DType, value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (dtype === "date") return coerceDate(value);
  if (dtype === "integer" || dtype === "number") {
    if (typeof value === "number") return dtype === "integer" ? Math.trunc(value) : value;
    const cleaned = String(value).replace(/[,\s$]/g, "").replace(/[^\d.\-]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? (dtype === "integer" ? Math.trunc(n) : n) : null;
  }
  if (dtype === "boolean") {
    const t = String(value).trim().toLowerCase();
    if (t === "") return null;
    if (TRUEISH.has(t)) return true;
    if (FALSEISH.has(t)) return false;
    return null;
  }
  const s = String(value).trim();
  return s === "" ? null : s;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function coerceDate(value: unknown): string | null {
  // Date objects come from SheetJS cellDates as local-midnight of the sheet's
  // naive date — use LOCAL components so a date can't shift a day across the
  // timezone offset. String inputs (e.g. ISO "2024-01-15") are parsed as UTC.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const s = String(value).trim();
  if (s === "") return null;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}
