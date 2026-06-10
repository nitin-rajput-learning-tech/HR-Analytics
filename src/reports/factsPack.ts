// Newsletter -> Markdown "facts pack". A deterministic byproduct of the
// newsletter model: a plain-text rollup a CHRO can paste into email/Slack or
// (optionally) hand to an external tool. No AI involved in generating it.

import type { Newsletter } from "./newsletter";
import { findingScope } from "../core/brain/brain";

export function buildFactsMarkdown(nl: Newsletter): string {
  const out: string[] = [];
  const push = (s = "") => out.push(s);

  push(`# ${nl.title}`);
  push();
  push(`*Period: ${nl.periodLabel} · Generated: ${nl.generatedAtLabel} · ${nl.domainsWithData}/${nl.domainsTotal} areas reporting*`);
  push();

  push("## Executive Brief");
  push();
  if (nl.execBrief.summary) {
    push(nl.execBrief.summary);
    push();
  }
  if (nl.brain.periodDigest) {
    push(`_${nl.brain.periodDigest}_`);
    push();
  }
  if (nl.execBrief.headlineKpis.length) {
    push("**Headline metrics**");
    for (const k of nl.execBrief.headlineKpis) push(`- ${k.label}: ${k.value}${k.hint ? ` (${k.hint})` : ""}`);
    push();
  }
  if (nl.execBrief.wins.length) {
    push("**Wins**");
    for (const w of nl.execBrief.wins) push(`- ${w}`);
    push();
  }
  if (nl.execBrief.risks.length) {
    push("**Risks**");
    for (const r of nl.execBrief.risks) push(`- ${r}`);
    push();
  }
  if (nl.execBrief.movers.length) {
    push("**Notable movers (month over month)**");
    for (const m of nl.execBrief.movers) push(`- ${m.text}`);
    push();
  }

  if (nl.comparison) {
    const c = nl.comparison;
    push(`## What Changed Since ${c.priorLabel}`);
    push();
    push(`**HR Health ${c.healthScore}/100**${c.healthTrend ? ` (${c.healthTrend})` : ""}${c.healthPrior !== null ? ` — was ${c.healthPrior}` : ""}`);
    push();
    if (c.newFindings.length) push(`- **New this period:** ${c.newFindings.join("; ")}`);
    if (c.resolvedFindings.length) push(`- **Resolved:** ${c.resolvedFindings.join("; ")}`);
    if (c.improved.length) push(`- **Improved:** ${c.improved.map((m) => `${m.label} ${m.trend}`).join("; ")}`);
    if (c.declined.length) push(`- **Declined:** ${c.declined.map((m) => `${m.label} ${m.trend}`).join("; ")}`);
    if (c.atRisk.length) push(`- **At risk (on target but slipping):** ${c.atRisk.join("; ")}`);
    push();
  }

  const scored = nl.scorecard.filter((r) => r.rag !== "none");
  if (scored.length) {
    push("## Scorecard vs Targets");
    push();
    push("| KPI | Area | Current | vs Last | Typical | Target | Status |");
    push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const r of scored) {
      const typical = r.benchmarkPos === "none" ? "—" : `${r.benchmark} (${r.benchmarkPos})`;
      push(`| ${r.label} | ${r.group} | ${r.display} | ${r.trend || "—"} | ${typical} | ${r.target}${r.unit === "%" ? "%" : r.unit ? " " + r.unit : ""} | ${r.rag.toUpperCase()} — ${r.status} |`);
    }
    push();
  }

  if (nl.brain.findings.length) {
    push("## HR Brain — Diagnosis");
    push();
    push(`**HR Health ${nl.brain.health.score}/100 · ${nl.brain.health.band}**${nl.brain.health.trend ? ` (${nl.brain.health.trend} vs ${nl.brain.health.priorLabel})` : ""} — ${nl.brain.health.caption}`);
    push();
    if (nl.brain.resolved.length) {
      push(`**Resolved since ${nl.brain.health.priorLabel ?? "last period"}:** ${nl.brain.resolved.map((r) => r.title).join(", ")}.`);
      push();
    }
    for (const f of nl.brain.findings) {
      push(`### ${f.title}  _(${f.severity} · ${findingScope(f)}${f.isNew ? " · new this period" : ""})_`);
      push(`- **Likely reason:** ${f.reason}`);
      push(`- **Remedy plan:**`);
      for (const r of f.remedy) push(`  - ${r}`);
      push();
    }
    if (nl.brain.roadmap.length) {
      push("### Recommended action roadmap");
      for (const h of ["Now", "Next", "Later"] as const) {
        const items = nl.brain.roadmap.filter((r) => r.horizon === h);
        if (!items.length) continue;
        const hint = h === "Now" ? "0–30 days" : h === "Next" ? "1–3 months" : "3–12 months";
        push(`- **${h}** (${hint}):`);
        for (const it of items) push(`  - ${it.title} — ${it.impact} impact · ${it.effort} effort · ${it.owner}${it.roi ? ` · ${it.roi.label} at stake` : ""}`);
      }
      push();
    }
    if (nl.brain.maturity.overall.score !== null) {
      push(`### HR maturity — overall ${nl.brain.maturity.overall.score}/5 (${nl.brain.maturity.overall.stage})`);
      for (const d of nl.brain.maturity.dimensions) {
        if (d.level === null) continue;
        push(`- ${d.label}: ${d.level}/5 ${d.stage} — ${d.basis}`);
      }
      push();
    }
  }

  for (const s of nl.sections) {
    push(`## ${s.label}`);
    push();
    if (s.blurb) {
      push(s.blurb);
      push();
    }
    if (s.hasData && s.kpis.length) {
      for (const k of s.kpis) push(`- **${k.label}:** ${k.value}${k.hint ? ` — ${k.hint}` : ""}`);
      push();
    }
    for (const t of s.tables) {
      push(`**${t.title}**`);
      push();
      push("| " + t.columns.join(" | ") + " |");
      push("| " + t.columns.map(() => "---").join(" | ") + " |");
      for (const row of t.rows) push("| " + row.map((c) => String(c)).join(" | ") + " |");
      push();
    }
    if (s.watchouts.length) {
      push("**Watch-outs**");
      for (const w of s.watchouts) {
        push(`- [${w.severity.toUpperCase()}] ${w.title} — ${w.detail}${w.actionHint ? ` _Action:_ ${w.actionHint}` : ""}`);
      }
      push();
    }
  }

  if (nl.actionPlan.length) {
    push("## Prioritised Action Plan");
    push();
    for (const a of nl.actionPlan) {
      push(`${a.priority}. **[${a.severity.toUpperCase()}] ${a.title}** (${a.domain} · owner: ${a.owner}) — ${a.actionHint ?? a.detail}`);
    }
    push();
  }

  if (nl.trackedActions.items.length) {
    const s = nl.trackedActions.summary;
    push("## Tracked Actions");
    push();
    push(`_${s.open} open · ${s.in_progress} in progress · ${s.done} done${s.overdue ? ` · ${s.overdue} overdue` : ""}_`);
    push();
    for (const a of nl.trackedActions.items) {
      const mark = a.status === "done" ? "[x]" : "[ ]";
      push(`- ${mark} **${a.title}** (${a.owner}${a.due ? ` · due ${a.due}` : ""})${a.status === "in_progress" ? " — in progress" : ""}`);
    }
    push();
  }

  return out.join("\n");
}
