// HR Brain — a local, deterministic recommendation engine. It inspects the signal
// context (KPIs + watch-outs across every domain) and applies a curated set of HR
// diagnostic rules. Each rule, when it fires, returns a finding with: the evidence
// that triggered it, a LIKELY REASON (root-cause hypothesis), and a step-by-step
// REMEDY PLAN. No LLM, no API — pure rule-based inference run on-device.

import type { DataSource } from "../store/types";
import { gatherContext, type BrainContext } from "./context";
import { buildMaturity, type MaturityResult } from "./maturity";

export type BrainSeverity = "critical" | "high" | "medium" | "low";
// "confirmed" = a hard threshold/fact breached (a KNOWN issue);
// "likely"/"possible" = inferred or emerging (a POSSIBLE issue).
export type BrainConfidence = "confirmed" | "likely" | "possible";

export interface BrainFinding {
  id: string;
  title: string;
  category: string;
  owner: string;
  severity: BrainSeverity;
  confidence: BrainConfidence;
  evidence: string[];
  reason: string;
  remedy: string[];
  link?: { page: string; tab?: string }; // where to go to see the evidence
}

type Rule = (ctx: BrainContext) => BrainFinding | null;

export type Level = "High" | "Medium" | "Low";
export interface RoadmapItem {
  id: string;
  title: string;
  owner: string;
  impact: Level;
  effort: Level;
  horizon: "Now" | "Next" | "Later";
  quadrant: "Quick win" | "Major initiative" | "Incremental" | "Deprioritise";
  firstAction: string;
  link?: { page: string; tab?: string };
}

// Severity → business impact. Effort is a per-finding heuristic (how much work a
// people team realistically needs): compliance/data/chase fixes are Low; comp,
// org-redesign and cross-cutting programmes are High.
const IMPACT_OF: Record<BrainSeverity, Level> = { critical: "High", high: "High", medium: "Medium", low: "Low" };
const EFFORT_OF: Record<string, Level> = {
  statutory: "Low", source_reconciliation: "Low", review_completion: "Low", emerging_trends: "Low",
  below_benchmark: "Medium",
  offer_accept: "Medium", ld_coverage: "Medium", regrettable_attrition: "Medium", early_attrition: "Medium", cost_concentration: "Medium", department_hotspots: "Medium",
  pay_gap: "High", org_design: "High", compound_retention: "High",
};
const HORIZON_RANK = { Now: 0, Next: 1, Later: 2 } as const;

// Sequence each finding into a Now / Next / Later horizon from its impact × effort
// (the classic consulting prioritisation): criticals and quick wins go Now; high-
// impact major bets go Next; low-impact or high-effort-low-payoff items go Later.
export function buildRoadmap(findings: BrainFinding[]): RoadmapItem[] {
  const items = findings.map((f): RoadmapItem => {
    const impact = IMPACT_OF[f.severity];
    const effort = EFFORT_OF[f.id] ?? "Medium";
    let horizon: RoadmapItem["horizon"];
    if (f.severity === "critical") horizon = "Now";
    else if (effort === "Low" && impact !== "Low") horizon = "Now"; // quick wins
    else if (impact === "Low") horizon = "Later";
    else if (effort === "High" && impact === "Medium") horizon = "Later";
    else horizon = "Next";
    const quadrant: RoadmapItem["quadrant"] =
      impact === "High" ? (effort === "Low" ? "Quick win" : "Major initiative") : effort === "High" ? "Deprioritise" : "Incremental";
    return { id: f.id, title: f.title, owner: f.owner, impact, effort, horizon, quadrant, firstAction: f.remedy[0] ?? "", link: f.link };
  });
  const lvl = { High: 0, Medium: 1, Low: 2 };
  return items.sort((a, b) => HORIZON_RANK[a.horizon] - HORIZON_RANK[b.horizon] || lvl[a.impact] - lvl[b.impact] || lvl[a.effort] - lvl[b.effort]);
}

// Where each finding's evidence lives — used to deep-link from a finding card to
// the relevant analytic (People sub-tab, or another page).
const FINDING_LINKS: Record<string, { page: string; tab?: string }> = {
  compound_retention: { page: "People Analytics", tab: "risk" },
  department_hotspots: { page: "Function Analytics" },
  statutory: { page: "Function Analytics" },
  regrettable_attrition: { page: "People Analytics", tab: "retention" },
  early_attrition: { page: "People Analytics", tab: "retention" },
  pay_gap: { page: "People Analytics", tab: "pay_equity" },
  review_completion: { page: "Function Analytics" },
  offer_accept: { page: "Function Analytics" },
  ld_coverage: { page: "Function Analytics" },
  org_design: { page: "People Analytics", tab: "org_health" },
  cost_concentration: { page: "People Analytics", tab: "workforce_cost" },
  source_reconciliation: { page: "People Analytics", tab: "sources" },
  emerging_trends: { page: "Scorecard" },
  below_benchmark: { page: "Scorecard" },
};

const SEV_RANK: Record<BrainSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const CONF_RANK: Record<BrainConfidence, number> = { confirmed: 0, likely: 1, possible: 2 };

// --- Diagnostic rules --------------------------------------------------------
// Each is independent and self-gating (returns null when its inputs are absent or
// the condition isn't met), so the Brain degrades gracefully with partial data.

const RULES: Rule[] = [
  // Compounding retention risk — the flagship cross-domain diagnosis.
  (ctx) => {
    const regrettable = ctx.num("Regrettable Exits") ?? 0;
    const firstYear = ctx.num("First-Year Exit Share") ?? 0;
    const highRisk = ctx.num("High Risk") ?? 0;
    const attrition = regrettable > 0 || firstYear > 15 || highRisk > 0;
    const contributors: string[] = [];
    if ((ctx.num("Gender Pay Gap") ?? 0) > 5) contributors.push("a gender pay gap");
    if ((ctx.num("Review Completion") ?? 100) < 95) contributors.push("incomplete performance reviews");
    if ((ctx.num("Coverage") ?? 100) < 80) contributors.push("low learning coverage");
    if ((ctx.num("Offer-Accept Rate") ?? 100) < 80) contributors.push("a weak offer-accept rate");
    if (!attrition || contributors.length < 2) return null;
    const ev: string[] = [];
    if (regrettable > 0) ev.push(`${ctx.display("Regrettable Exits")} regrettable exits`);
    if (firstYear > 15) ev.push(`first-year exit share ${ctx.display("First-Year Exit Share")}`);
    if (highRisk > 0) ev.push(`${ctx.display("High Risk")} high flight-risk staff`);
    contributors.forEach((c) => ev.push(c));
    return {
      id: "compound_retention",
      title: "Compounding retention risk",
      category: "Retention",
      owner: "CHRO",
      severity: "critical",
      confidence: "likely",
      evidence: ev,
      reason: `Attrition signals are coinciding with ${contributors.join(", ")}. When pay, development and performance gaps stack on top of flight risk, voluntary exits accelerate and become much harder to reverse than any single issue alone.`,
      remedy: [
        "Treat retention as the top people priority this quarter, with a named executive owner.",
        "Sequence the fixes: stabilise pay for at-risk top talent first, then close the review and learning gaps.",
        "Stand up a weekly retention review for the most affected teams (flight risk × regretted exits).",
        "Re-measure flight risk and regretted exits next period to confirm the trend is bending.",
      ],
    };
  },

  // Department hotspots — WHERE the people-risk concentrates. Reads the cross-
  // functional compound-risk table (attrition + training + reviews per dept):
  // departments at/over the high threshold are confirmed hotspots; those merely
  // elevated surface as an emerging "possible" watch list.
  (ctx) => {
    const cf = ctx.domains.find((d) => d.kind === "cross_functional" && d.hasData);
    const table = cf?.tables.find((t) => /compound risk by department/i.test(t.title));
    if (!table || !table.rows.length) return null;
    const scoreIdx = table.columns.length - 1; // "Risk score" is the last column
    const ranked = table.rows
      .map((r) => ({ dept: String(r[0]), score: Number(r[scoreIdx]) }))
      .filter((x) => x.dept && Number.isFinite(x.score))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) return null;
    const high = ranked.filter((r) => r.score >= 50);
    const remedy = [
      "Prioritise the highest-scoring departments ahead of any org-wide initiative.",
      "For each, combine its specific gaps into ONE plan (e.g. clear reviews and launch targeted training together, not sequentially).",
      "Assign an HRBP and the line manager to co-own each department with a 30-day checkpoint.",
      "Re-score next period; if the risk hasn't fallen, escalate to the function head.",
    ];
    if (high.length) {
      return {
        id: "department_hotspots",
        title: high.length === 1 ? `Department hotspot: ${high[0].dept}` : `${high.length} department hotspots (compounding risk)`,
        category: "Cross-Functional",
        owner: "HR Business Partners",
        severity: high[0].score >= 65 ? "high" : "medium",
        confidence: "likely",
        evidence: high.slice(0, 6).map((r) => `${r.dept} — compound-risk score ${r.score}/100`),
        reason:
          "These departments show several people-risk signals at once — attrition, low training coverage and/or reviews behind. Overlapping risks compound: a team that's losing people AND under-trained AND behind on reviews spirals faster than any single gap, and org-wide programmes won't reach it in time.",
        remedy,
      };
    }
    const elevated = ranked.filter((r) => r.score >= 35);
    if (elevated.length) {
      return {
        id: "department_hotspots",
        title: "Departments approaching compound-risk",
        category: "Cross-Functional",
        owner: "HR Business Partners",
        severity: "low",
        confidence: "possible",
        evidence: elevated.slice(0, 4).map((r) => `${r.dept} — compound-risk score ${r.score}/100 (watch)`),
        reason:
          "No department has crossed the high-risk threshold yet, but these sit closest — their attrition, training-coverage and review signals are starting to stack. Acting on the weakest single signal now is far cheaper than after they compound.",
        remedy: [
          "Watch the listed departments' attrition, training coverage and review completion together, not in isolation.",
          "Fix each department's weakest current signal before the others pile on.",
          "Re-check next period; promote any that cross the threshold to a priority plan.",
        ],
      };
    }
    return null;
  },

  // Statutory compliance.
  (ctx) => {
    const v = ctx.num("Statutory On-time");
    if (v === null || v >= 100) return null;
    return {
      id: "statutory",
      title: "Statutory remittances not fully on time",
      category: "Payroll Compliance",
      owner: "Payroll",
      severity: v < 90 ? "critical" : "high",
      confidence: "confirmed",
      evidence: [`Statutory on-time ${ctx.display("Statutory On-time")} (target 100%)`],
      reason:
        "One or more statutory filings (PF / ESI / PT / TDS / LWF) were paid late or are pending. This is almost always a calendar/ownership gap or a cash-flow timing issue — and it carries interest, penalties and reputational risk.",
      remedy: [
        "Clear any pending or late filings immediately and document the cause.",
        "Put every statutory due date on a shared compliance calendar with an owner and a reminder 5 days prior.",
        "Reconcile challans monthly and escalate exceptions to Finance the same day.",
        "Report statutory on-time at 100% on the scorecard going forward.",
      ],
    };
  },

  // Regrettable attrition (losing top talent).
  (ctx) => {
    const v = ctx.num("Regrettable Exits");
    if (v === null || v <= 0) return null;
    return {
      id: "regrettable_attrition",
      title: "Losing high performers (regrettable attrition)",
      category: "Retention",
      owner: "HR Business Partners",
      severity: v >= 5 ? "high" : "medium",
      confidence: "confirmed",
      evidence: [`${ctx.display("Regrettable Exits")} regrettable exits — high-rated people who left`],
      reason:
        "The organisation is losing rated talent, not just headcount. Regretted exits typically stem from limited career growth, below-market pay for top performers, or manager-relationship issues — rarely from a single cause.",
      remedy: [
        "Run stay interviews with remaining high performers and anyone flagged as flight risk.",
        "Benchmark and adjust compensation for top performers and business-critical roles.",
        "Audit promotion velocity and internal-mobility access for high-potentials.",
        "Coach managers in the teams with the most regretted exits.",
      ],
    };
  },

  // Early attrition / quality-of-hire.
  (ctx) => {
    const v = ctx.num("First-Year Exit Share");
    if (v === null || v <= 15) return null;
    return {
      id: "early_attrition",
      title: "High first-year attrition",
      category: "Talent Acquisition / Onboarding",
      owner: "Talent Acquisition",
      severity: v >= 30 ? "high" : "medium",
      confidence: "confirmed",
      evidence: [`First-year exit share ${ctx.display("First-Year Exit Share")} (target ≤ 15%)`],
      reason:
        "An outsized share of leavers depart within their first year — a quality-of-hire, onboarding or role-expectation problem rather than long-tenure churn.",
      remedy: [
        "Review job descriptions and screening criteria for the roles with the most early exits.",
        "Strengthen onboarding and add structured 30 / 60 / 90-day check-ins.",
        "Align hiring-manager expectations with the candidate brief before offer.",
        "Track first-year attrition by source and recruiter to find weak channels.",
      ],
    };
  },

  // Gender pay gap.
  (ctx) => {
    const v = ctx.num("Gender Pay Gap");
    if (v === null || v <= 5) return null;
    return {
      id: "pay_gap",
      title: "Gender pay gap above threshold",
      category: "Pay Equity",
      owner: "Total Rewards",
      severity: v >= 15 ? "high" : "medium",
      confidence: "confirmed",
      evidence: [`Gender pay gap ${ctx.display("Gender Pay Gap")} (target ≤ 5%)`],
      reason:
        "Median pay differs by gender beyond a defensible 5% threshold. The driver is usually role/level mix, starting-offer differences or uneven progression — not necessarily same-role inequity, which is why a controlled analysis comes first.",
      remedy: [
        "Run a like-for-like pay-equity analysis controlling for role, level and tenure.",
        "Remediate the unexplained portion of the gap in the next pay cycle.",
        "Standardise offer bands and require sign-off for out-of-band offers.",
        "Review raise and promotion distributions by gender every cycle.",
      ],
    };
  },

  // Performance review completion.
  (ctx) => {
    const v = ctx.num("Review Completion");
    if (v === null || v >= 95) return null;
    return {
      id: "review_completion",
      title: "Performance reviews incomplete",
      category: "Performance",
      owner: "HR Operations",
      severity: v < 70 ? "high" : "medium",
      confidence: "confirmed",
      evidence: [`Review completion ${ctx.display("Review Completion")} (target ≥ 95%)`],
      reason:
        "A material share of reviews are unfinished, so rating, promotion, PIP and pay decisions lack a documented basis and calibration is unreliable.",
      remedy: [
        "Publish the deadline with manager-level completion tracking visible to all.",
        "Escalate non-completion to skip-level managers within the week.",
        "Run calibration only once completion clears 90%.",
        "Make review completion an explicit manager objective.",
      ],
    };
  },

  // Hiring funnel — offer-accept rate.
  (ctx) => {
    const v = ctx.num("Offer-Accept Rate");
    if (v === null || v >= 80) return null;
    return {
      id: "offer_accept",
      title: "Offers being declined at an elevated rate",
      category: "Talent Acquisition",
      owner: "Talent Acquisition",
      severity: v < 60 ? "high" : "medium",
      confidence: "confirmed",
      evidence: [`Offer-accept rate ${ctx.display("Offer-Accept Rate")} (target ≥ 80%)`],
      reason:
        "Candidates are turning down offers more than they should — typically compensation competitiveness, a slow or impersonal process, or a weak candidate experience.",
      remedy: [
        "Benchmark offer compensation against market for the affected roles.",
        "Compress the time from final interview to offer.",
        "Capture decline reasons and review them monthly.",
        "Brief candidates on growth, role and culture before the offer stage.",
      ],
    };
  },

  // L&D coverage.
  (ctx) => {
    const v = ctx.num("Coverage");
    if (v === null || v >= 80) return null;
    return {
      id: "ld_coverage",
      title: "Low learning & development coverage",
      category: "Learning & Development",
      owner: "L&D",
      severity: v < 50 ? "medium" : "low",
      confidence: "confirmed",
      evidence: [`L&D coverage ${ctx.display("Coverage")} (target ≥ 80%)`],
      reason:
        "A large share of active staff completed no training in the period. Sustained low coverage erodes capability and compliance and correlates with higher attrition.",
      remedy: [
        "Make compliance/mandatory modules assignment-based with due dates.",
        "Set a minimum learning-hours target per employee per quarter.",
        "Prioritise teams that have both low coverage and high attrition.",
        "Track coverage on the scorecard.",
      ],
    };
  },

  // Org design — deep / top-heavy / under-spanned.
  (ctx) => {
    const w = ctx.watchoutsMatching(/layers|top-heavy|low-span|span/i).filter((x) => x.kind === "people_org_health");
    if (!w.length) return null;
    return {
      id: "org_design",
      title: "Organisation structure is carrying drag",
      category: "Org Design",
      owner: "Org Design",
      severity: w.some((x) => x.severity === "high") ? "high" : "medium",
      confidence: "likely",
      evidence: w.map((x) => x.title),
      reason:
        "The reporting structure has extra layers and/or under-spanned managers. Deep hierarchies slow decisions and dilute accountability; small spans add management cost without leverage.",
      remedy: [
        "List managers with ≤ 2 reports and consolidate or broaden their teams.",
        "Target ≤ 6 layers from top to individual contributor.",
        "Widen spans where role complexity allows (aim for 6–8).",
        "Redeploy freed management capacity to under-resourced IC work.",
      ],
    };
  },

  // Workforce cost concentration.
  (ctx) => {
    const w = ctx.watchoutsMatching(/concentration/i).filter((x) => x.kind === "people_workforce_cost");
    if (!w.length) return null;
    return {
      id: "cost_concentration",
      title: "Workforce cost concentrated in one team",
      category: "Workforce Cost",
      owner: "Finance / HR",
      severity: w.some((x) => x.severity === "high") ? "high" : "medium",
      confidence: "confirmed",
      evidence: w.map((x) => x.detail),
      reason:
        "A single team carries a large share of workforce cost, creating budget and key-person risk if that function contracts or a few senior people leave.",
      remedy: [
        "Confirm the concentration matches strategic priority and revenue contribution.",
        "Stress-test the budget against that team's attrition scenarios.",
        "Document succession for the most expensive critical roles.",
        "Review the span and level mix in the concentrated team.",
      ],
    };
  },

  // Data-source reconciliation (feeds disagree).
  (ctx) => {
    const v = ctx.num("Active Only in Other Source");
    if (v === null || v <= 0) return null;
    return {
      id: "source_reconciliation",
      title: "Employee feeds disagree — headcount needs reconciling",
      category: "Data Quality",
      owner: "HR Operations",
      severity: v >= 50 ? "high" : "medium",
      confidence: "confirmed",
      evidence: [`${ctx.display("Active Only in Other Source")} active staff appear only in an earlier source, not the latest feed`],
      reason:
        "Your employee sources don't agree: active staff appear in one feed but are missing from the latest export. Until reconciled, headcount, cost and attrition will be off.",
      remedy: [
        "Confirm the automated export covers all legal entities and worker types.",
        "Capture exits for anyone who has genuinely left.",
        "Add recent joiners' attributes (e.g. gender) to the maintained snapshot.",
        "Re-run the combine and re-check the Data Sources tab.",
      ],
    };
  },

  // Emerging / possible issues — still on target but trending the wrong way.
  (ctx) => {
    const worsening = ctx.scorecard.filter((r) => r.trendTone === "bad" && (r.rag === "green" || r.rag === "amber"));
    if (worsening.length < 1) return null;
    return {
      id: "emerging_trends",
      title: "Metrics trending the wrong way (early warning)",
      category: "Watch List",
      owner: "CHRO",
      severity: "low",
      confidence: "possible",
      evidence: worsening.slice(0, 6).map((r) => `${r.label}: ${r.display} (${r.trend} vs last period)`),
      reason:
        "These KPIs still meet or sit near target but moved adversely versus last period. They aren't problems yet — but acting while they're cheap to fix beats waiting for them to breach.",
      remedy: [
        "Review the largest adverse movers with their owners.",
        "Decide whether each move is seasonal noise or a structural shift.",
        "Set a checkpoint next period and act before any of them cross target.",
      ],
    };
  },

  // Below industry norm — KPIs sitting worse than the typical benchmark band.
  (ctx) => {
    const below = ctx.scorecard.filter((r) => r.benchmarkPos === "worse");
    if (below.length < 1) return null;
    const redCount = below.filter((r) => r.rag === "red").length;
    return {
      id: "below_benchmark",
      title: `${below.length} KPI${below.length === 1 ? "" : "s"} below industry norm`,
      category: "Benchmarking",
      owner: "CHRO",
      severity: below.length >= 4 || redCount >= 3 ? "high" : "medium",
      confidence: "likely", // benchmark bands are illustrative references, not a sourced survey
      evidence: below.slice(0, 6).map((r) => `${r.label}: ${r.display} vs typical ${r.benchmark}`),
      reason:
        "Several headline metrics sit outside the typical range for comparable organisations. The bands here are illustrative references, so validate against real peer data — but a cluster of below-norm KPIs usually signals systemic, not isolated, gaps.",
      remedy: [
        "Confirm the gaps against a sourced benchmark for your sector and region.",
        "Prioritise metrics that are BOTH below norm and below your own target.",
        "Set improvement targets that close at least half the gap to typical this year.",
        "Re-benchmark each cycle to confirm you're converging.",
      ],
    };
  },
];

export interface BrainHealth {
  score: number; // 0–100
  band: "Excellent" | "Good" | "Fair" | "At Risk" | "Critical";
  caption: string;
}

export interface BrainResult {
  findings: BrainFinding[];
  summary: { total: number; critical: number; high: number; medium: number; low: number; known: number; possible: number };
  health: BrainHealth;
  roadmap: RoadmapItem[];
  maturity: MaturityResult;
}

// Multiplicative health: each open issue retains a fraction of health, so the
// score has diminishing returns (one critical hurts a lot; a tenth low barely
// moves it) and never collapses to 0 unfairly. Pure function of the findings.
const HEALTH_FACTOR: Record<BrainSeverity, number> = { critical: 0.78, high: 0.9, medium: 0.96, low: 0.99 };

export function computeHealth(findings: BrainFinding[], summary: BrainResult["summary"]): BrainHealth {
  let h = 1;
  for (const f of findings) h *= HEALTH_FACTOR[f.severity];
  const score = Math.round(h * 100);
  const band: BrainHealth["band"] = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : score >= 30 ? "At Risk" : "Critical";
  const priority = summary.critical + summary.high;
  const caption = findings.length === 0
    ? "No material issues detected across the loaded data."
    : `${priority} priority issue${priority === 1 ? "" : "s"} of ${summary.total} open${findings[0] ? ` · lead concern: ${findings[0].title}` : ""}.`;
  return { score, band, caption };
}

export function buildBrain(store: DataSource, opts: { targets?: Record<string, number>; benchmarks?: Record<string, { low: number; high: number }> } = {}): BrainResult {
  const ctx = gatherContext(store, opts);
  const findings = RULES.map((r) => {
    try {
      return r(ctx);
    } catch {
      return null;
    }
  })
    .filter((f): f is BrainFinding => !!f)
    .map((f) => ({ ...f, link: FINDING_LINKS[f.id] }));

  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || CONF_RANK[a.confidence] - CONF_RANK[b.confidence]);

  const summary = {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    known: findings.filter((f) => f.confidence === "confirmed").length,
    possible: findings.filter((f) => f.confidence !== "confirmed").length,
  };
  return { findings, summary, health: computeHealth(findings, summary), roadmap: buildRoadmap(findings), maturity: buildMaturity(ctx) };
}
