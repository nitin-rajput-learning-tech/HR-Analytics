// BUILD-10 — board-pack builder. The newsletter is the comprehensive monthly read;
// the board pack is the CURATED, exec-only subset a CHRO puts in front of the board:
// HR Health, what changed, the top risks, the Now actions, the scorecard RAG line
// and the maturity stage — nothing else. Pure: it SELECTS from the already-built
// Newsletter model (no new analytics), so it can never disagree with it.

import type { Newsletter, NewsletterComparison } from "./newsletter";
import { scorecardSummary } from "../core/scorecard";
import type { MetricKPI } from "../core/metrics/base";

export interface BoardPack {
  appName: string;
  periodLabel: string;
  generatedAtLabel: string;
  health: { score: number; band: string; trend: string | null; trendTone: "good" | "bad" | "neutral"; caption: string };
  headlineKpis: MetricKPI[];
  comparison: NewsletterComparison | null;
  topRisks: string[];
  nowActions: { title: string; owner: string; impact: string }[];
  scorecard: { onTarget: number; atRisk: number; offTrack: number; red: { label: string; status: string }[] };
  maturity: { score: number; stage: string } | null;
}

export function buildBoardPack(nl: Newsletter): BoardPack {
  const sum = scorecardSummary(nl.scorecard);
  return {
    appName: nl.appName,
    periodLabel: nl.periodLabel,
    generatedAtLabel: nl.generatedAtLabel,
    health: { score: nl.brain.health.score, band: nl.brain.health.band, trend: nl.brain.health.trend, trendTone: nl.brain.health.trendTone, caption: nl.brain.health.caption },
    headlineKpis: nl.execBrief.headlineKpis.slice(0, 5),
    comparison: nl.comparison,
    topRisks: nl.execBrief.risks.slice(0, 3),
    nowActions: nl.brain.roadmap.filter((r) => r.horizon === "Now").slice(0, 5).map((r) => ({ title: r.title, owner: r.owner, impact: r.impact })),
    scorecard: {
      onTarget: sum.onTrack,
      atRisk: sum.atRisk,
      offTrack: sum.offTrack,
      red: nl.scorecard.filter((r) => r.rag === "red").map((r) => ({ label: r.label, status: r.status })),
    },
    maturity: nl.brain.maturity.overall.score !== null ? { score: nl.brain.maturity.overall.score, stage: nl.brain.maturity.overall.stage } : null,
  };
}
