// HR Brain — a local, deterministic recommendation engine. It inspects the signal
// context (KPIs + watch-outs across every domain) and applies a curated set of HR
// diagnostic rules. Each rule, when it fires, returns a finding with: the evidence
// that triggered it, a LIKELY REASON (root-cause hypothesis), and a step-by-step
// REMEDY PLAN. No LLM, no API — pure rule-based inference run on-device.

import type { DataSource } from "../store/types";
import { gatherContext, type BrainContext } from "./context";
import { buildMaturity, type MaturityResult } from "./maturity";
import { humanizeMoneyInr } from "../narrative";

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

// Format a finding's scope — its category and owner — collapsing the common case
// where they're identical (e.g. "Talent Acquisition · Talent Acquisition") to a
// single label so the cards, newsletter and facts pack all read cleanly.
export function findingScope(f: { category: string; owner: string }): string {
  return f.category === f.owner ? f.category : `${f.category} · ${f.owner}`;
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
  roi?: { label: string; note: string }; // estimated value-at-stake (₹), where quantifiable
}

// Severity → business impact. Effort is a per-finding heuristic (how much work a
// people team realistically needs): compliance/data/chase fixes are Low; comp,
// org-redesign and cross-cutting programmes are High.
const IMPACT_OF: Record<BrainSeverity, Level> = { critical: "High", high: "High", medium: "Medium", low: "Low" };
const EFFORT_OF: Record<string, Level> = {
  statutory: "Low", source_reconciliation: "Low", review_completion: "Low", emerging_trends: "Low", hr_operations: "Low", compliance_training: "Low",
  below_benchmark: "Medium",
  offer_accept: "Medium", ld_coverage: "Medium", regrettable_attrition: "Medium", early_attrition: "Medium", cost_concentration: "Medium", department_hotspots: "Medium", low_engagement: "Medium", performance_management: "Medium", ta_throughput: "Medium",
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
  performance_management: { page: "Function Analytics" },
  offer_accept: { page: "Function Analytics" },
  ta_throughput: { page: "Function Analytics" },
  ld_coverage: { page: "Function Analytics" },
  compliance_training: { page: "Function Analytics" },
  org_design: { page: "People Analytics", tab: "org_health" },
  cost_concentration: { page: "People Analytics", tab: "workforce_cost" },
  source_reconciliation: { page: "People Analytics", tab: "sources" },
  emerging_trends: { page: "Scorecard" },
  below_benchmark: { page: "Scorecard" },
  low_engagement: { page: "Function Analytics" },
  hr_operations: { page: "Function Analytics" },
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

  // Performance management — rating calibration (leniency) and PIP load. The
  // review-completion gap has its own rule above; this surfaces the pms domain's
  // other quality signals (reason + remedy adapt to whichever fired).
  (ctx) => {
    const w = ctx.watchoutsMatching(/leniency|\bPIP\b/i).filter((x) => x.kind === "pms_review");
    if (!w.length) return null;
    const pip = w.some((x) => /\bPIP\b/i.test(x.title));
    const lenient = w.some((x) => /leniency/i.test(x.title));
    const reason = [
      pip ? "A cluster of employees on performance plans often points to a hiring-quality or manager-capability gap rather than isolated under-performance — especially where the PIPs concentrate under particular managers." : "",
      lenient ? "Ratings bunched at the top of the scale weaken the differentiation that fair pay and promotion decisions depend on." : "",
    ].filter(Boolean).join(" ");
    const remedy: string[] = [];
    if (pip) remedy.push("Confirm every PIP has a clear plan, owner and end date, and check whether they cluster under particular managers or teams.", "Trace recurring PIPs back to hiring and onboarding to rule out a quality-of-hire issue.");
    if (lenient) remedy.push("Calibrate ratings to a defensible distribution before any reward or promotion decisions.", "Coach managers whose ratings sit consistently above the calibrated curve.");
    remedy.push("Re-check the rating mix and PIP load next cycle to confirm the signal is improving.");
    return {
      id: "performance_management",
      title: w.length === 1 ? w[0].title : "Performance ratings and PIP load need review",
      category: "Performance",
      owner: "HR Business Partners",
      severity: w.some((x) => x.severity === "high") ? "high" : "medium",
      confidence: "likely", // calibration/PIP interpretation is inferential, not a hard breach
      evidence: w.slice(0, 4).map((x) => x.detail),
      reason,
      remedy,
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

  // Talent Acquisition throughput — aging requisitions and weak funnel conversion.
  // Offer-accept has its own rule above; this covers the velocity/quality signals
  // (reason + remedy adapt to whichever fired).
  (ctx) => {
    const w = ctx.watchoutsMatching(/aging|interview-to-offer|conversion|open for more than/i).filter((x) => x.kind === "ta_requisition");
    if (!w.length) return null;
    const aging = w.some((x) => /aging|open for more than/i.test(`${x.title} ${x.detail}`));
    const conv = w.some((x) => /conversion|interview-to-offer/i.test(x.title));
    const reason = [
      aging ? "Roles open well past 90 days usually mean an unrealistic brief, an uncompetitive offer, or thin sourcing — and every extra week of vacancy is lost output, overloaded teammates and a thinner candidate pool." : "",
      conv ? "Few interviews converting to offers points to a screening or interviewer-calibration gap — the wrong candidates reach the panel, or the panel can't align on the bar." : "",
    ].filter(Boolean).join(" ");
    const remedy: string[] = [];
    if (aging) remedy.push("Triage every requisition open past 90 days: re-scope, re-grade, refresh sourcing channels, or pause it deliberately.", "Set a target time-to-fill per role family and review the oldest reqs weekly with hiring managers.");
    if (conv) remedy.push("Tighten screening so interview slots go to better-fit candidates, and calibrate interviewers on a shared bar.", "Find the funnel stage with the steepest drop and fix that one first.");
    remedy.push("Track time-to-fill and interview-to-offer conversion on the scorecard.");
    return {
      id: "ta_throughput",
      title: w.length === 1 ? w[0].title : "Hiring throughput needs attention (aging roles / funnel)",
      category: "Talent Acquisition",
      owner: "Talent Acquisition",
      severity: w.some((x) => x.severity === "high") ? "high" : "medium",
      confidence: "confirmed",
      evidence: w.slice(0, 4).map((x) => x.detail),
      reason,
      remedy,
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

  // Mandatory / compliance training — distinct from general coverage above. An
  // incomplete compliance curriculum is a regulatory/audit exposure, not merely a
  // development gap, so it gets its own finding.
  (ctx) => {
    const w = ctx.watchoutsMatching(/mandatory|compliance/i).filter((x) => x.kind === "ld_enrollment");
    if (!w.length) return null;
    return {
      id: "compliance_training",
      title: "Mandatory / compliance training incomplete",
      category: "Compliance",
      owner: "L&D",
      severity: w.some((x) => x.severity === "high") ? "high" : "medium",
      confidence: "confirmed",
      evidence: w.map((x) => x.detail),
      reason:
        "Some mandatory or compliance training is unfinished. Unlike general learning coverage, incomplete statutory modules (e.g. anti-harassment, code of conduct, data protection, safety) are a direct audit and legal exposure — the organisation can be held liable for what untrained staff do or fail to do.",
      remedy: [
        "Make every mandatory module assignment-based with a hard due date and manager-level visibility.",
        "Chase the outstanding completions now and escalate non-completion to the function head.",
        "Where feasible, gate the access or certification that depends on the training.",
        "Report compliance-training completion separately from overall coverage so a gap can't be masked.",
      ],
    };
  },

  // Low employee engagement (eNPS).
  (ctx) => {
    const v = ctx.num("eNPS");
    if (v === null || v >= 10) return null;
    return {
      id: "low_engagement",
      title: "Low employee engagement (eNPS)",
      category: "Engagement",
      owner: "HR Leadership",
      severity: v < 0 ? "high" : "medium",
      confidence: "confirmed",
      evidence: [`eNPS ${ctx.display("eNPS")}${ctx.display("Responses") ? ` · ${ctx.display("Responses")} responses` : ""}`],
      reason:
        "Employee engagement (eNPS) is low — detractors rival or outnumber promoters. Disengagement precedes attrition and depresses productivity, and it usually traces back to manager quality, growth, recognition or workload.",
      remedy: [
        "Share results with managers and run team-level listening sessions on the weakest drivers.",
        "Act visibly on the top two themes within 30 days — closing the loop matters more than the survey itself.",
        "Coach managers in the lowest-scoring teams.",
        "Re-survey next cycle and track the trend, not just the level.",
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

  // HR Operations — vendor contract renewals, offboarding asset recovery and lost
  // assets (the admin domain's watch-outs, surfaced as one operational finding).
  (ctx) => {
    const w = ctx.watchoutsMatching(/renewal|contract|asset|offboard|recover|lost/i).filter((x) => x.kind === "admin_asset");
    if (!w.length) return null;
    return {
      id: "hr_operations",
      title: w.length === 1 ? w[0].title : "HR operations risks (contracts & assets)",
      category: "HR Operations",
      owner: "HR Admin",
      severity: w.some((x) => x.severity === "high") ? "high" : "medium",
      confidence: "confirmed",
      evidence: w.slice(0, 5).map((x) => x.detail),
      reason:
        "Operational items need attention: vendor contracts are approaching — or past — their renewal date, and/or company assets weren't recovered when people left. A missed renewal risks a lapse in cover or an unwanted auto-renewal at the old price; an unrecovered asset is a direct financial loss and a security exposure.",
      remedy: [
        "Action contracts expiring in the next 30 / 60 / 90 days — renew, renegotiate or exit each one deliberately rather than by default.",
        "Chase asset recovery for recent leavers and hold final settlement on any outstanding high-value items.",
        "Put every renewal on a shared calendar with a named owner and a reminder 60 days out.",
        "Make asset return a gated step in the offboarding checklist, reconciled with IT before sign-off.",
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
  // Attach an attrition value-at-stake (₹) to the single highest-priority retention
  // initiative — framed as the pool at risk, not a per-item saving (so it can't be
  // double-counted across items).
  const retentionIds = new Set(["compound_retention", "regrettable_attrition", "early_attrition", "department_hotspots"]);
  let roiDone = false;
  const roadmap = buildRoadmap(findings).map((item) => {
    if (!roiDone && ctx.attrition.totalCost && retentionIds.has(item.id)) {
      roiDone = true;
      const { totalCost, leavers12m, costPerHire } = ctx.attrition;
      return { ...item, roi: { label: humanizeMoneyInr(totalCost), note: `est. annual attrition replacement cost (${leavers12m} exits × ${humanizeMoneyInr(costPerHire ?? 0)}/replacement)` } };
    }
    return item;
  });

  return { findings, summary, health: computeHealth(findings, summary), roadmap, maturity: buildMaturity(ctx) };
}
