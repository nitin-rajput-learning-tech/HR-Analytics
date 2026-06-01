// Talent Acquisition metrics — funnel, offer health, aging, source mix.
// Pure functions over the latest ta_requisition snapshot rows. Ported from Python.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout, emptyDomain } from "./base";

const LABEL = "Talent Acquisition";
const TEAM = "Talent Acquisition";

const FUNNEL_STAGES: [string, string][] = [
  ["applications", "Applications"],
  ["shortlisted", "Shortlisted"],
  ["interviewed", "Interviewed"],
  ["offers_made", "Offers Made"],
  ["offers_accepted", "Offers Accepted"],
  ["joined", "Joined"],
];

function sumCol(rows: Row[], col: string): number {
  let total = 0;
  for (const r of rows) {
    const v = r[col];
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function ageDays(asOf: string, openIso: string): number | null {
  const a = Date.parse(asOf);
  const o = Date.parse(openIso);
  if (Number.isNaN(a) || Number.isNaN(o)) return null;
  return Math.floor((a - o) / 86_400_000);
}

export function compute(rows: Row[] | null | undefined, asOf: string | null = null): DomainMetrics {
  if (!rows || rows.length === 0) return emptyDomain("ta_requisition", LABEL, TEAM);

  const status = (r: Row) => String(r["status"] ?? "").toLowerCase();
  const openReqs = rows.filter((r) => status(r) === "open").length;
  const onHold = rows.filter((r) => status(r) === "on-hold").length;
  const filled = rows.filter((r) => status(r) === "filled").length;

  const offersMade = sumCol(rows, "offers_made");
  const offersAccepted = sumCol(rows, "offers_accepted");
  const joined = sumCol(rows, "joined");
  const acceptRate = N.pct(offersAccepted, offersMade);

  const ref = asOf ?? new Date().toISOString().slice(0, 10);
  let avgAge: number | null = null;
  let agingBuckets: { labels: string[]; values: number[] } | null = null;
  const openWithDate = rows.filter((r) => status(r) === "open" && r["open_date"]);
  const ages = openWithDate
    .map((r) => ageDays(ref, String(r["open_date"])))
    .filter((d): d is number => d !== null && d >= 0);
  if (ages.length) {
    avgAge = Math.round(ages.reduce((s, d) => s + d, 0) / ages.length);
    agingBuckets = {
      labels: ["0-30d", "31-60d", "61-90d", "90d+"],
      values: [
        ages.filter((d) => d <= 30).length,
        ages.filter((d) => d > 30 && d <= 60).length,
        ages.filter((d) => d > 60 && d <= 90).length,
        ages.filter((d) => d > 90).length,
      ],
    };
  }

  const kpis: MetricKPI[] = [
    { label: "Open Requisitions", value: N.humanizeInt(openReqs), hint: onHold ? `${onHold} on hold` : undefined },
    { label: "Filled (this file)", value: N.humanizeInt(filled) },
    { label: "Offer-Accept Rate", value: N.formatPct(acceptRate), hint: `${offersAccepted}/${offersMade} offers` },
    { label: "Joined", value: N.humanizeInt(joined) },
  ];
  if (avgAge !== null) kpis.push({ label: "Avg Age, Open Reqs", value: `${avgAge} days` });
  const costTotal = sumCol(rows, "cost");
  if (costTotal > 0 && joined > 0) kpis.push({ label: "Cost / Hire", value: N.humanizeMoneyInr(costTotal / joined) });

  const charts: ChartSpec[] = [];
  const funnelLabels = FUNNEL_STAGES.map(([, l]) => l);
  const funnelValues = FUNNEL_STAGES.map(([col]) => sumCol(rows, col));
  if (funnelValues.reduce((s, v) => s + v, 0) > 0) {
    charts.push({
      title: "Hiring funnel",
      caption: "Aggregate counts at each stage across all requisitions.",
      kind: "funnel",
      labels: funnelLabels,
      values: funnelValues,
    });
  }

  if (rows.some((r) => r["primary_source"])) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = String(r["primary_source"] ?? "Unspecified");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    charts.push({
      title: "Requisitions by source",
      caption: "Where openings are being sourced from.",
      kind: "pie",
      labels: sorted.map((e) => e[0]),
      values: sorted.map((e) => e[1]),
    });
  }

  if (agingBuckets && agingBuckets.values.reduce((s, v) => s + v, 0) > 0) {
    charts.push({
      title: "Open requisitions by age",
      caption: "How long current openings have been live.",
      kind: "bar",
      labels: agingBuckets.labels,
      values: agingBuckets.values,
    });
  }

  const tables: MetricTable[] = [];
  if (rows.some((r) => "department" in r)) {
    const byDept = new Map<string, { open: number; filled: number; joined: number }>();
    for (const r of rows) {
      const dept = String(r["department"] ?? "Unspecified");
      const agg = byDept.get(dept) ?? { open: 0, filled: 0, joined: 0 };
      if (status(r) === "open") agg.open += 1;
      if (status(r) === "filled") agg.filled += 1;
      const j = Number(r["joined"]);
      if (Number.isFinite(j)) agg.joined += j;
      byDept.set(dept, agg);
    }
    const deptRows = [...byDept.entries()]
      .sort((a, b) => b[1].open - a[1].open)
      .slice(0, 12)
      .map(([dept, a]) => [dept, a.open, a.filled, a.joined] as (string | number)[]);
    tables.push({
      title: "Requisitions by department",
      caption: "Open vs filled vs joined, top 12 by open.",
      columns: ["Department", "Open", "Filled", "Joined"],
      rows: deptRows,
    });
  }

  const watchouts: MetricWatchout[] = [];
  if (acceptRate !== null && offersMade >= 3) {
    if (acceptRate < 50) {
      watchouts.push({
        severity: "high",
        title: "Offer-accept rate critically low",
        detail: `Only ${N.formatPct(acceptRate)} of offers were accepted (${offersAccepted}/${offersMade}).`,
        actionHint: "Audit compensation bands and the offer-stage candidate experience urgently.",
        owner: "Talent Acquisition",
      });
    } else if (acceptRate < 70) {
      watchouts.push({
        severity: "medium",
        title: "Offer-accept rate below 70%",
        detail: `${N.formatPct(acceptRate)} of offers accepted (${offersAccepted}/${offersMade}).`,
        actionHint: "Review compensation competitiveness and time-to-offer.",
        owner: "Talent Acquisition",
      });
    }
  }
  if (agingBuckets) {
    const stale = agingBuckets.values[3];
    if (stale) {
      watchouts.push({
        severity: stale >= 5 ? "high" : "medium",
        title: "Aging requisitions",
        detail: `${stale} requisition(s) have been open for more than 90 days.`,
        actionHint: "Re-scope, re-prioritise or escalate sourcing for long-open roles.",
        owner: "Talent Acquisition",
      });
    }
  }
  const interviewed = sumCol(rows, "interviewed");
  if (interviewed >= 10 && offersMade) {
    const ivToOffer = N.pct(offersMade, interviewed);
    if (ivToOffer !== null && ivToOffer < 20) {
      watchouts.push({
        severity: "medium",
        title: "Low interview-to-offer conversion",
        detail: `Only ${N.formatPct(ivToOffer)} of interviews led to an offer.`,
        actionHint: "Check interviewer calibration and role/candidate fit at screening.",
        owner: "Talent Acquisition",
      });
    }
  }

  const blurb =
    N.joinClauses([
      `${openReqs} requisitions open` + (avgAge !== null ? ` (avg ${avgAge} days)` : ""),
      `${filled} filled`,
      acceptRate !== null ? `offer-accept rate ${N.formatPct(acceptRate)}` : "",
      `${joined} joined`,
    ]) + ".";

  return { kind: "ta_requisition", label: LABEL, hasData: true, blurb, kpis, charts, tables, watchouts };
}
