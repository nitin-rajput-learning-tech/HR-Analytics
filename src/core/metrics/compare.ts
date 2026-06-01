// Period-over-period comparison — decorates People KPI cards with a
// month-over-month delta vs the prior snapshot.
//
// The metric builders are pure over a *single* snapshot, so this module takes
// the already-computed current and prior `PeopleSection[]` (same filters, each
// built at its own as-of) and diffs KPIs by label. Values are formatted strings
// (e.g. "1,234", "90.0%", "4.9 yrs") so we parse them back to a number + unit
// and only diff like-for-like. Non-numeric KPIs ("Engineering", "n/a") get no
// delta. Pure functions; no React/Plotly.

import type { PeopleSection } from "./people";
import type { MetricKPI } from "./base";

export type ValueUnit = "count" | "pct" | "yrs";
export interface ParsedValue {
  n: number;
  unit: ValueUnit;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// Parse a formatted KPI value back to a number + unit. Mirrors the formats the
// builders emit via narrative.ts:
//   count   "1,234"     (en-US grouping; also plain decimals like span "3.4")
//   percent "90.0%"
//   tenure  "4.9 yrs"
// Anything else (text, "n/a", empty) → null (no comparable number).
export function parseKpiValue(value: string | null | undefined): ParsedValue | null {
  const s = String(value ?? "").trim();
  if (!s || s.toLowerCase() === "n/a") return null;
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1).replace(/,/g, "").trim());
    return Number.isFinite(n) ? { n, unit: "pct" } : null;
  }
  if (/\byrs?$/i.test(s)) {
    const n = Number(s.replace(/yrs?$/i, "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? { n, unit: "yrs" } : null;
  }
  const cleaned = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? { n, unit: "count" } : null;
}

export type Tone = "good" | "bad" | "neutral";

// Conservative sentiment map — only the unambiguous KPIs are coloured; anything
// else stays neutral so we never mis-signal good/bad in a context we can't judge
// (e.g. headcount growth, gender mix, remote share — all left neutral).
const HIGHER_IS_GOOD = new Set(["Active Headcount", "Avg Tenure (active)", "5+ years", "Avg Completeness"]);
const HIGHER_IS_BAD = new Set([
  "Relieved",
  "Pending Exits",
  "Next 30 days",
  "Next 90 days",
  "< 1 year",
  "Large Spans (≥15)",
  "Fields < 90% complete",
]);

export function toneFor(label: string, dir: "up" | "down" | "flat"): Tone {
  if (dir === "flat") return "neutral";
  if (HIGHER_IS_GOOD.has(label)) return dir === "up" ? "good" : "bad";
  if (HIGHER_IS_BAD.has(label)) return dir === "up" ? "bad" : "good";
  return "neutral";
}

// Compact, signed delta text. Percentages diff in points ("pp"); tenure keeps
// its unit; counts use en-US grouping. Uses a true minus sign (−) for symmetry
// with the rest of the UI.
export function deltaText(diff: number, unit: ValueUnit): string {
  const arrow = diff > 0 ? "▲" : "▼";
  const sign = diff > 0 ? "+" : "−";
  const mag = Math.abs(diff);
  if (unit === "pct") return `${arrow} ${sign}${round1(mag)}pp`;
  if (unit === "yrs") return `${arrow} ${sign}${round1(mag)} yrs`;
  const m = Number.isInteger(mag) ? mag.toLocaleString("en-US") : round1(mag).toLocaleString("en-US");
  return `${arrow} ${sign}${m}`;
}

function withDelta(curr: MetricKPI, prior: MetricKPI | undefined, priorLabel: string): MetricKPI {
  if (!prior) return curr;
  const c = parseKpiValue(curr.value);
  const p = parseKpiValue(prior.value);
  if (!c || !p || c.unit !== p.unit) return curr;
  const diff = c.n - p.n;
  if (Math.abs(diff) < 1e-9) {
    return { ...curr, delta: `no change vs ${priorLabel}`, deltaTone: "neutral" };
  }
  const dir = diff > 0 ? "up" : "down";
  return { ...curr, delta: `${deltaText(diff, c.unit)} vs ${priorLabel}`, deltaTone: toneFor(curr.label, dir) };
}

// Returns a new section list with deltas applied to matching KPIs. If there is
// no prior period, the current sections are returned unchanged.
export function decoratePeopleDeltas(
  current: PeopleSection[],
  prior: PeopleSection[] | null | undefined,
  priorLabel: string,
): PeopleSection[] {
  if (!prior || prior.length === 0) return current;
  const priorByKey = new Map(prior.map((s) => [s.key, s]));
  return current.map((sec) => {
    const p = priorByKey.get(sec.key);
    if (!p) return sec;
    const priorByLabel = new Map(p.metrics.kpis.map((k) => [k.label, k]));
    const kpis = sec.metrics.kpis.map((k) => withDelta(k, priorByLabel.get(k.label), priorLabel));
    return { ...sec, metrics: { ...sec.metrics, kpis } };
  });
}
