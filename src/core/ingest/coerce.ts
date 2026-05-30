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

function coerceDate(value: unknown): string | null {
  let d: Date | null = null;
  if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value).trim();
    if (s === "") return null;
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
