// Newsletter -> Markdown "facts pack". A deterministic byproduct of the
// newsletter model: a plain-text rollup a CHRO can paste into email/Slack or
// (optionally) hand to an external tool. No AI involved in generating it.

import type { Newsletter } from "./newsletter";

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

  const scored = nl.scorecard.filter((r) => r.rag !== "none");
  if (scored.length) {
    push("## Scorecard vs Targets");
    push();
    push("| KPI | Area | Current | vs Last | Target | Status |");
    push("| --- | --- | --- | --- | --- | --- |");
    for (const r of scored) push(`| ${r.label} | ${r.group} | ${r.display} | ${r.trend || "—"} | ${r.target}${r.unit === "%" ? "%" : r.unit ? " " + r.unit : ""} | ${r.rag.toUpperCase()} — ${r.status} |`);
    push();
  }

  if (nl.brain.findings.length) {
    push("## HR Brain — Diagnosis");
    push();
    push(`**HR Health ${nl.brain.health.score}/100 · ${nl.brain.health.band}** — ${nl.brain.health.caption}`);
    push();
    for (const f of nl.brain.findings) {
      push(`### ${f.title}  _(${f.severity} · ${f.category} · ${f.owner})_`);
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
        for (const it of items) push(`  - ${it.title} — ${it.impact} impact · ${it.effort} effort · ${it.owner}`);
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

  return out.join("\n");
}
