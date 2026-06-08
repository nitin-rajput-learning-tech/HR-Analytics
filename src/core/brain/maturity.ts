// HR Maturity Assessment — a 1–5 capability model across the people function, the
// classic consulting heat-map. Each dimension is scored deterministically from the
// data already gathered in the Brain context (no extra passes), with a transparent
// basis and a "to advance" hint. Dimensions without data are "Not assessed" and
// excluded from the overall. Pure + local.

import type { BrainContext } from "./context";

export interface MaturityDimension {
  key: string;
  label: string;
  level: number | null; // 1–5, or null when the inputs are absent
  stage: string;
  basis: string; // the data that drove the score
  advance: string; // what would move it up a level
}

export interface MaturityResult {
  dimensions: MaturityDimension[];
  overall: { score: number | null; stage: string };
}

const STAGES = ["", "Ad-hoc", "Developing", "Defined", "Managed", "Optimised"];

// Map a value to 1–5 against descending thresholds [t5, t4, t3, t2].
export function bandHigher(v: number, t: [number, number, number, number]): number {
  return v >= t[0] ? 5 : v >= t[1] ? 4 : v >= t[2] ? 3 : v >= t[3] ? 2 : 1;
}
// Lower-is-better: map against ascending thresholds [t5, t4, t3, t2].
export function bandLower(v: number, t: [number, number, number, number]): number {
  return v <= t[0] ? 5 : v <= t[1] ? 4 : v <= t[2] ? 3 : v <= t[3] ? 2 : 1;
}
const clamp = (n: number) => Math.max(1, Math.min(5, n));

export function buildMaturity(ctx: BrainContext): MaturityResult {
  const num = (l: string) => ctx.num(l);
  const disp = (l: string) => ctx.display(l) ?? "";
  const dims: MaturityDimension[] = [];
  const dim = (key: string, label: string, level: number | null, basis: string, advance: string): MaturityDimension => ({
    key,
    label,
    level,
    stage: level === null ? "Not assessed" : STAGES[level],
    basis,
    advance,
  });

  // Talent Acquisition — offer-accept rate.
  {
    const v = num("Offer-Accept Rate");
    dims.push(dim("ta", "Talent Acquisition", v === null ? null : bandHigher(v, [90, 85, 80, 70]), v === null ? "No requisition data" : `Offer-accept ${disp("Offer-Accept Rate")}`, "Lift offer competitiveness and candidate experience to raise acceptance."));
  }
  // Performance Management — review completion, downgraded for an elevated PIP load
  // (a clustered PIP population signals weaker performance management on top of any
  // completion gap). Reuses the pms domain's own "elevated" threshold via its watch-out.
  {
    const v = num("Review Completion");
    let lvl = v === null ? null : bandHigher(v, [98, 95, 85, 70]);
    const elevatedPip = ctx.watchoutsMatching(/\bPIP\b/i).some((w) => w.kind === "pms_review");
    if (lvl !== null && elevatedPip) lvl = clamp(lvl - 1);
    dims.push(dim("perf", "Performance Management", lvl, v === null ? "No PMS data" : `Reviews ${disp("Review Completion")} complete${elevatedPip ? ", elevated PIP load" : ""}`, "Push review completion past 95%, calibrate before decisions, and keep the PIP population low."));
  }
  // Reward & Pay Equity — gender pay gap (lower is better).
  {
    const v = num("Gender Pay Gap");
    dims.push(dim("reward", "Reward & Pay Equity", v === null ? null : bandLower(v, [2, 5, 8, 15]), v === null ? "No pay + gender data" : `Pay gap ${disp("Gender Pay Gap")}`, "Run a controlled pay-equity analysis and remediate unexplained gaps."));
  }
  // Retention — first-year exits, downgraded if losing high performers.
  {
    const fy = num("First-Year Exit Share");
    let lvl = fy === null ? null : bandLower(fy, [10, 15, 20, 30]);
    const reg = num("Regrettable Exits") ?? 0;
    if (lvl !== null && reg > 0) lvl = clamp(lvl - 1);
    dims.push(dim("retention", "Retention", lvl, fy === null ? "No exit data" : `First-year exits ${disp("First-Year Exit Share")}${reg > 0 ? `, ${reg} regretted` : ""}`, "Run stay interviews and fix the biggest early-attrition drivers."));
  }
  // Engagement — eNPS.
  {
    const v = num("eNPS");
    dims.push(dim("engagement", "Engagement", v === null ? null : bandHigher(v, [40, 20, 0, -20]), v === null ? "No survey data" : `eNPS ${disp("eNPS")}`, "Act visibly on the weakest engagement drivers and re-survey to confirm the trend."));
  }
  // Diversity & Inclusion — representation level (proxy).
  {
    const v = num("Female (overall)") ?? num("Female");
    const d = disp("Female (overall)") || disp("Female");
    dims.push(dim("dei", "Diversity & Inclusion", v === null ? null : bandHigher(v, [45, 35, 25, 15]), v === null ? "No gender data" : `Women ${d}`, "Strengthen the diverse-hire pipeline and check progression equity."));
  }
  // Learning & Development — coverage.
  {
    const v = num("Coverage");
    dims.push(dim("ld", "Learning & Development", v === null ? null : bandHigher(v, [85, 70, 60, 40]), v === null ? "No L&D data" : `Coverage ${disp("Coverage")}`, "Assign mandatory modules and set a per-employee learning-hours floor."));
  }
  // Org Design — layers, downgraded for under-spanned managers.
  {
    const v = num("Org Layers");
    let lvl = v === null ? null : bandLower(v, [5, 6, 7, 8]);
    const ls = num("Low-span Managers") ?? 0;
    if (lvl !== null && ls >= 3) lvl = clamp(lvl - 1);
    dims.push(dim("org", "Org Design", lvl, v === null ? "No reporting data" : `${disp("Org Layers")} layers${ls >= 3 ? `, ${ls} low-span managers` : ""}`, "Delayer and broaden under-spanned management lines."));
  }
  // HR Operations & Compliance — statutory on-time, downgraded for feed gaps.
  {
    const v = num("Statutory On-time");
    let lvl = v === null ? null : bandHigher(v, [100, 98, 95, 90]);
    const gap = num("Active Only in Other Source") ?? 0;
    if (lvl !== null && gap > 0) lvl = clamp(lvl - 1);
    dims.push(dim("ops", "HR Operations & Compliance", lvl, v === null ? "No payroll/statutory data" : `Statutory ${disp("Statutory On-time")} on-time${gap > 0 ? ", source feeds disagree" : ""}`, "Automate the statutory calendar and reconcile data sources."));
  }

  const assessed = dims.filter((d) => d.level !== null);
  const overallScore = assessed.length ? Math.round((assessed.reduce((s, d) => s + (d.level as number), 0) / assessed.length) * 10) / 10 : null;
  const overallStage = overallScore === null ? "Not assessed" : STAGES[clamp(Math.round(overallScore))];
  return { dimensions: dims, overall: { score: overallScore, stage: overallStage } };
}
