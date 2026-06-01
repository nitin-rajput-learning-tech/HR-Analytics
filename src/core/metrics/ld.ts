// Learning & Development metrics — completion, coverage, compliance, spend.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout, emptyDomain } from "./base";

const LABEL = "Learning & Development";
const TEAM = "L&D";
const COMPLIANCE_CATEGORIES = new Set(["mandatory", "compliance"]);

function sumCol(rows: Row[], col: string): number {
  let t = 0;
  for (const r of rows) {
    const n = typeof r[col] === "number" ? (r[col] as number) : Number(r[col]);
    if (Number.isFinite(n)) t += n;
  }
  return t;
}

export interface LdInput {
  enrollmentRows?: Row[] | null;
  programRows?: Row[] | null;
  activeHeadcount?: number;
  asOf?: string | null;
}

export function compute(input: LdInput): DomainMetrics {
  const { enrollmentRows, programRows, activeHeadcount = 0 } = input;
  if (!enrollmentRows || enrollmentRows.length === 0) return emptyDomain("ld_enrollment", LABEL, TEAM);

  const total = enrollmentRows.length;
  const statusLc = (r: Row) => String(r["status"] ?? "").toLowerCase();
  const completed = enrollmentRows.filter((r) => statusLc(r) === "completed").length;
  const completionRate = N.pct(completed, total);
  const distinctEmp = new Set(enrollmentRows.map((r) => r["employee_number"]).filter((v) => v != null)).size;
  const coverage = activeHeadcount ? N.pct(distinctEmp, activeHeadcount) : null;
  const hours = sumCol(enrollmentRows, "duration_hours");
  const feedbackVals = enrollmentRows
    .map((r) => Number(r["feedback_score"]))
    .filter((n) => Number.isFinite(n));
  const feedback = feedbackVals.length ? feedbackVals.reduce((s, n) => s + n, 0) / feedbackVals.length : null;

  const kpis: MetricKPI[] = [
    { label: "Completion Rate", value: N.formatPct(completionRate), hint: `${completed}/${total} enrollments` },
    { label: "Coverage", value: N.formatPct(coverage), hint: `${distinctEmp} of ${activeHeadcount || "n/a"} active staff` },
    { label: "Training Hours", value: N.humanizeInt(hours) },
    { label: "Hours / Trained Head", value: distinctEmp ? (hours / distinctEmp).toFixed(1) : "n/a" },
  ];
  if (feedback !== null) kpis.push({ label: "Avg Feedback", value: `${feedback.toFixed(1)} / 5` });

  const charts: ChartSpec[] = [];
  const tables: MetricTable[] = [];
  const watchouts: MetricWatchout[] = [];
  const blurbParts = [
    `${N.formatPct(completionRate)} of enrollments completed`,
    coverage !== null ? `reaching ${N.formatPct(coverage)} of active staff` : "",
    `${N.humanizeInt(hours)} hours delivered`,
  ];

  // Map program_id -> category, and compute spend.
  const categoryById = new Map<string, string>();
  if (programRows && programRows.length) {
    for (const p of programRows) {
      if (p["program_id"] != null) categoryById.set(String(p["program_id"]), String(p["category"] ?? "Uncategorised"));
    }
    const spend = sumCol(programRows, "total_cost");
    if (spend > 0) {
      kpis.push({ label: "L&D Spend", value: N.humanizeMoneyInr(spend) });
      if (distinctEmp) kpis.push({ label: "Spend / Learner", value: N.humanizeMoneyInr(spend / distinctEmp) });
      blurbParts.push(`spend ${N.humanizeMoneyInr(spend)}`);
    }
  }

  const hasCategory = categoryById.size > 0 || enrollmentRows.some((r) => "category" in r);
  if (hasCategory) {
    const catOf = (r: Row) =>
      r["category"] != null
        ? String(r["category"])
        : categoryById.get(String(r["program_id"])) ?? "Uncategorised";
    const agg = new Map<string, { enrollments: number; completed: number }>();
    for (const r of enrollmentRows) {
      const c = catOf(r) || "Uncategorised";
      const a = agg.get(c) ?? { enrollments: 0, completed: 0 };
      a.enrollments += 1;
      if (statusLc(r) === "completed") a.completed += 1;
      agg.set(c, a);
    }
    const catRows = [...agg.entries()].map(([c, a]) => [
      c,
      a.enrollments,
      a.completed,
      Math.round((a.completed / a.enrollments) * 1000) / 10,
    ]) as (string | number)[][];
    tables.push({
      title: "By category",
      caption: "Enrollment and completion by program category.",
      columns: ["Category", "Enrollments", "Completed", "Completion %"],
      rows: catRows,
    });
    charts.push({
      title: "Enrollments by category",
      caption: "Volume of learning by type.",
      kind: "bar",
      labels: catRows.map((r) => String(r[0])),
      values: catRows.map((r) => Number(r[1])),
    });

    const comp = enrollmentRows.filter((r) => COMPLIANCE_CATEGORIES.has(catOf(r).toLowerCase()));
    if (comp.length) {
      const compDone = comp.filter((r) => statusLc(r) === "completed").length;
      const compRate = N.pct(compDone, comp.length);
      if (compRate !== null && compRate < 90) {
        watchouts.push({
          severity: compRate < 75 ? "high" : "medium",
          title: "Mandatory/compliance training incomplete",
          detail: `Only ${N.formatPct(compRate)} of mandatory/compliance enrollments are complete (${compDone}/${comp.length}).`,
          actionHint: "Chase outstanding completions — compliance gaps carry audit/legal risk.",
          owner: "L&D",
        });
      }
    }
  }

  if (coverage !== null && coverage < 30) {
    watchouts.push({
      severity: "low",
      title: "Training coverage is thin",
      detail: `Only ${N.formatPct(coverage)} of active employees appear in this period's enrollments.`,
      actionHint: "Confirm programs are reaching the full population, not a small core.",
      owner: "L&D",
    });
  }

  return {
    kind: "ld_enrollment",
    label: LABEL,
    hasData: true,
    blurb: N.joinClauses(blurbParts) + ".",
    kpis,
    charts,
    tables,
    watchouts,
  };
}
