// Employee engagement analytics from anonymous survey responses — eNPS and
// driver scores by department. Closes the one clear gap vs engagement platforms
// (Culture Amp / Glint) without becoming a cloud listening tool: it's just
// another offline domain over a survey workbook. Pure + testable.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout, emptyDomain } from "./base";
import { mean } from "./stats";

const KIND = "engagement";
const LABEL = "Engagement";
const MIN_DEPT_RESPONSES = 5;
const DRIVERS: { field: string; label: string }[] = [
  { field: "manager_score", label: "Manager" },
  { field: "growth_score", label: "Growth" },
  { field: "comp_score", label: "Compensation" },
  { field: "worklife_score", label: "Work-Life" },
];

const str = (v: unknown) => String(v ?? "").trim();
const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const dim = (r: Row) => str(r["department"]) || "Unspecified";

// eNPS = (% promoters − % detractors) × 100 over responses with a 0–10 score.
function enps(scores: number[]): number | null {
  if (!scores.length) return null;
  const prom = scores.filter((s) => s >= 9).length;
  const det = scores.filter((s) => s <= 6).length;
  return Math.round(((prom - det) / scores.length) * 100);
}
function driverAvg(rows: Row[], field: string): number | null {
  const xs = rows.map((r) => toNum(r[field])).filter((n): n is number => n !== null);
  return mean(xs);
}
const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

export function compute(rows: Row[] | null | undefined, _asOf?: string | null): DomainMetrics {
  if (!rows || rows.length === 0 || !rows.some((r) => "recommend_score" in r)) {
    return emptyDomain(KIND, LABEL, "the engagement");
  }
  const scored = rows.filter((r) => toNum(r["recommend_score"]) !== null);
  if (scored.length === 0) return emptyDomain(KIND, LABEL, "the engagement");

  const allScores = scored.map((r) => toNum(r["recommend_score"]) as number);
  const overall = enps(allScores);
  const promoters = allScores.filter((s) => s >= 9).length;
  const detractors = allScores.filter((s) => s <= 6).length;

  // Driver averages overall → headline best/weakest.
  const driverScores = DRIVERS.map((d) => ({ ...d, avg: round1(driverAvg(scored, d.field)) })).filter((d) => d.avg !== null);
  const ranked = [...driverScores].sort((a, b) => (a.avg as number) - (b.avg as number));
  const weakest = ranked[0];
  const strongest = ranked[ranked.length - 1];

  // By department (≥ MIN_DEPT_RESPONSES responses).
  const byDept = new Map<string, Row[]>();
  for (const r of scored) {
    const d = dim(r);
    (byDept.get(d) ?? byDept.set(d, []).get(d)!).push(r);
  }
  const deptRows = [...byDept.entries()]
    .filter(([, rs]) => rs.length >= MIN_DEPT_RESPONSES)
    .map(([d, rs]) => ({ dept: d, n: rs.length, enps: enps(rs.map((r) => toNum(r["recommend_score"]) as number)) as number }))
    .sort((a, b) => a.enps - b.enps);

  const kpis: MetricKPI[] = [
    { label: "eNPS", value: overall === null ? "n/a" : `${overall > 0 ? "+" : ""}${overall}`, hint: `${promoters} promoters · ${detractors} detractors` },
    { label: "Responses", value: N.humanizeInt(scored.length) },
    { label: "Weakest Driver", value: weakest ? `${weakest.label} ${weakest.avg}` : "n/a", hint: "lowest average (1-5)" },
    { label: "Strongest Driver", value: strongest ? `${strongest.label} ${strongest.avg}` : "n/a", hint: "highest average (1-5)" },
  ];

  const charts: ChartSpec[] = [
    { title: "Driver scores", caption: "Average rating per driver (1-5).", kind: "bar", labels: driverScores.map((d) => d.label), values: driverScores.map((d) => d.avg as number) },
  ];
  if (deptRows.length) {
    charts.push({ title: "eNPS by department", caption: "Net promoter score per team (lowest first, ≥5 responses).", kind: "barh", labels: deptRows.map((d) => d.dept), values: deptRows.map((d) => d.enps), drill: "department" });
  }

  const tables: MetricTable[] = [
    {
      title: "Engagement by department",
      caption: "eNPS and driver averages per team (≥5 responses).",
      columns: ["Department", "Responses", "eNPS", ...DRIVERS.map((d) => d.label)],
      rows: [...byDept.entries()]
        .filter(([, rs]) => rs.length >= MIN_DEPT_RESPONSES)
        .sort((a, b) => (enps(b[1].map((r) => toNum(r["recommend_score"]) as number)) ?? 0) - (enps(a[1].map((r) => toNum(r["recommend_score"]) as number)) ?? 0))
        .map(([d, rs]) => {
          const e = enps(rs.map((r) => toNum(r["recommend_score"]) as number)) as number;
          return [d, rs.length, `${e > 0 ? "+" : ""}${e}`, ...DRIVERS.map((dr) => round1(driverAvg(rs, dr.field)) ?? "—")] as (string | number)[];
        }),
    },
  ];

  const watchouts: MetricWatchout[] = [];
  for (const d of deptRows) {
    if (d.enps <= 0) {
      watchouts.push({
        severity: d.enps <= -20 ? "high" : "medium",
        title: `Net-negative engagement in ${d.dept}`,
        detail: `${d.dept} eNPS is ${d.enps > 0 ? "+" : ""}${d.enps} across ${d.n} responses — detractors outweigh promoters.`,
        actionHint: "Run a focused listening session; act on the weakest driver before attrition follows.",
        owner: "HRBP",
      });
    }
  }
  if (weakest && (weakest.avg as number) < 3) {
    watchouts.push({
      severity: (weakest.avg as number) < 2.5 ? "high" : "medium",
      title: `Low ${weakest.label.toLowerCase()} scores org-wide`,
      detail: `${weakest.label} averages ${weakest.avg}/5 — the weakest engagement driver.`,
      actionHint: `Prioritise ${weakest.label.toLowerCase()} in the people plan; it tends to lead attrition.`,
      owner: "HR Leadership",
    });
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `eNPS ${overall === null ? "n/a" : `${overall > 0 ? "+" : ""}${overall}`} across ${N.humanizeInt(scored.length)} responses; weakest driver: ${weakest ? `${weakest.label.toLowerCase()} (${weakest.avg}/5)` : "n/a"}.`,
    kpis,
    charts,
    tables,
    watchouts: watchouts.slice(0, 5),
  };
}
