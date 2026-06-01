// Performance (PMS) metrics — cycle completion, rating mix, 9-box, PIP.
// Pure functions over the latest pms_review snapshot rows. Ported from Python.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout, emptyDomain } from "./base";

const LABEL = "Performance (PMS)";
const TEAM = "Performance";

function countTrue(rows: Row[], col: string): number {
  return rows.filter((r) => r[col] === true).length;
}

function perfBand(rating: number | null, scaleMax: number): string {
  if (scaleMax <= 0 || rating === null || Number.isNaN(rating)) return "Unrated";
  const ratio = rating / scaleMax;
  if (ratio >= 0.8) return "High";
  if (ratio >= 0.5) return "Medium";
  return "Low";
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function compute(rows: Row[] | null | undefined, _asOf: string | null = null): DomainMetrics {
  if (!rows || rows.length === 0) return emptyDomain("pms_review", LABEL, TEAM);

  const total = rows.length;
  const mgrDone = countTrue(rows, "manager_review_done");
  const goalsSet = countTrue(rows, "goals_set");
  const calibrated = countTrue(rows, "calibrated");
  const promos = countTrue(rows, "promotion_recommended");
  const onPip = countTrue(rows, "on_pip");
  const reviewRate = N.pct(mgrDone, total);
  const goalsRate = N.pct(goalsSet, total);

  const ratings = rows
    .map((r) => (typeof r["final_rating"] === "number" ? (r["final_rating"] as number) : Number(r["final_rating"])))
    .filter((n) => Number.isFinite(n));
  const avgRating = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : null;

  let scaleMax = 5;
  const scaleText = rows.map((r) => r["rating_scale"]).find((v) => v != null);
  if (scaleText) {
    const digits = String(scaleText)
      .replace(/-/g, " ")
      .split(/\s+/)
      .filter((s) => /^\d+$/.test(s))
      .map(Number);
    if (digits.length) scaleMax = Math.max(...digits);
  } else if (ratings.length) {
    scaleMax = Math.max(5, ...ratings);
  }

  const kpis: MetricKPI[] = [
    { label: "Review Completion", value: N.formatPct(reviewRate), hint: `${mgrDone}/${total} manager reviews` },
    { label: "Goals Set", value: N.formatPct(goalsRate) },
    { label: "Avg Rating", value: avgRating === null ? "n/a" : `${avgRating.toFixed(2)} / ${scaleMax.toFixed(0)}` },
    { label: "Calibrated", value: N.formatPct(N.pct(calibrated, total)) },
    { label: "Promotions Recommended", value: N.humanizeInt(promos) },
    { label: "On PIP", value: N.humanizeInt(onPip) },
  ];

  const charts: ChartSpec[] = [];
  if (ratings.length) {
    const dist = new Map<number, number>();
    for (const r of ratings) {
      const k = Math.round(r);
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
    const sorted = [...dist.entries()].sort((a, b) => a[0] - b[0]);
    charts.push({
      title: "Rating distribution",
      caption: "Employees by final rating (rounded).",
      kind: "bar",
      labels: sorted.map((e) => String(e[0])),
      values: sorted.map((e) => e[1]),
    });
  }

  const tables: MetricTable[] = [];
  if (rows.some((r) => "potential_rating" in r) && ratings.length) {
    const bands = ["High", "Medium", "Low"];
    const potentialsSet = new Set<string>();
    const grid = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const rating = typeof r["final_rating"] === "number" ? (r["final_rating"] as number) : Number(r["final_rating"]);
      const band = perfBand(Number.isFinite(rating) ? rating : null, scaleMax);
      if (band === "Unrated") continue;
      const pot = titleCase(String(r["potential_rating"] ?? "Unrated"));
      potentialsSet.add(pot);
      const row = grid.get(band) ?? new Map<string, number>();
      row.set(pot, (row.get(pot) ?? 0) + 1);
      grid.set(band, row);
    }
    if (potentialsSet.size) {
      const potentials = [...potentialsSet].sort();
      const tableRows = bands.map((band) => [
        band,
        ...potentials.map((p) => grid.get(band)?.get(p) ?? 0),
      ]) as (string | number)[][];
      tables.push({
        title: "9-box (Performance × Potential)",
        caption: "Counts of employees by performance band and potential.",
        columns: ["Performance \\ Potential", ...potentials],
        rows: tableRows,
      });
    }
  }

  if (onPip && rows.some((r) => "pip_outcome" in r)) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r["on_pip"] !== true) continue;
      const k = String(r["pip_outcome"] ?? "Open");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    tables.push({
      title: "PIP outcomes",
      caption: "Status of employees on a performance plan.",
      columns: ["PIP Outcome", "Employees"],
      rows: [...counts.entries()].map(([k, v]) => [k, v] as (string | number)[]),
    });
  }

  const watchouts: MetricWatchout[] = [];
  if (reviewRate !== null && reviewRate < 80) {
    watchouts.push({
      severity: reviewRate < 60 ? "high" : "medium",
      title: "Review cycle behind schedule",
      detail: `Only ${N.formatPct(reviewRate)} of manager reviews are complete (${mgrDone}/${total}).`,
      actionHint: "Nudge managers with open reviews before calibration locks.",
      owner: "HRBP",
    });
  }
  if (avgRating !== null && scaleMax && avgRating / scaleMax >= 0.88) {
    watchouts.push({
      severity: "medium",
      title: "Possible rating leniency",
      detail: `Average rating is ${avgRating.toFixed(2)}/${scaleMax.toFixed(0)} — clustered near the top of the scale.`,
      actionHint: "Check calibration; a skewed curve weakens differentiation for rewards.",
      owner: "HR Leadership",
    });
  }
  if (onPip >= Math.max(3, Math.floor(0.05 * total))) {
    watchouts.push({
      severity: "medium",
      title: "Elevated PIP population",
      detail: `${onPip} employees are on a PIP (${N.formatPct(N.pct(onPip, total))} of reviewed).`,
      actionHint: "Ensure PIPs have clear plans and owners; review manager capability where clustered.",
      owner: "HRBP",
    });
  }

  const blurb =
    N.joinClauses([
      `${N.formatPct(reviewRate)} of reviews complete`,
      avgRating !== null ? `average rating ${avgRating.toFixed(2)}/${scaleMax.toFixed(0)}` : "",
      promos ? `${promos} promotions recommended` : "",
      onPip ? `${onPip} on PIP` : "",
    ]) + ".";

  return { kind: "pms_review", label: LABEL, hasData: true, blurb, kpis, charts, tables, watchouts };
}
