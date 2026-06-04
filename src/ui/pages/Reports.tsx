import { useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { overviewKpis } from "../../core/metrics/overview";
import { buildNewsletter } from "../../reports/newsletter";
import { buildFactsMarkdown } from "../../reports/factsPack";
import { leaverEvents } from "../../core/metrics/movement";
import { combinedEmployeeSnapshot, employeePeriods } from "../../core/metrics/combineEmployees";
import { downloadBlob } from "../download";

export function Reports() {
  const { store, branding, version, targets } = useApp();
  // Stamp the generation date once per mount (lazy state init — stable across renders).
  const [generatedAtLabel] = useState(() =>
    new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
  );

  const activeHeadcount = useMemo(() => {
    const rows = combinedEmployeeSnapshot(store)?.rows;
    return rows && rows.length ? overviewKpis(rows).active : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  const nl = useMemo(
    () =>
      buildNewsletter(store, {
        appName: branding.appName,
        activeHeadcount,
        generatedAtLabel,
        leaverEvents: leaverEvents(employeePeriods(store)),
        targets,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version, branding.appName, activeHeadcount, generatedAtLabel, targets],
  );

  function downloadFacts() {
    downloadBlob(new Blob([buildFactsMarkdown(nl)], { type: "text/markdown" }), "hr-newsletter-facts.md");
  }

  return (
    <div className="reports">
      <div className="reports-toolbar no-print">
        <h2>HR Newsletter</h2>
        <span className="spacer" />
        <button className="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <button onClick={downloadFacts}>Download facts pack (.md)</button>
      </div>

      <article className="newsletter" id="newsletter">
        <header className="nl-header">
          {branding.logoDataUri ? <img src={branding.logoDataUri} alt="" className="nl-logo" /> : null}
          <h1>{nl.title}</h1>
          <p className="nl-meta">
            {nl.periodLabel} · Generated {nl.generatedAtLabel} · {nl.domainsWithData}/{nl.domainsTotal} areas reporting
          </p>
        </header>

        {nl.domainsWithData === 0 ? (
          <p className="muted">No data yet. Publish workbooks on Data Intake; the newsletter fills in automatically.</p>
        ) : null}

        <nav className="nl-toc" aria-label="Newsletter contents">
          <h2>Contents</h2>
          <ul>
            <li>
              <a href="#sec-exec">Executive Brief</a>
            </li>
            {nl.brain.findings.length > 0 ? (
              <li>
                <a href="#sec-brain">HR Brain — Diagnosis</a>
              </li>
            ) : null}
            {nl.scorecard.some((r) => r.rag !== "none") ? (
              <li>
                <a href="#sec-scorecard">Scorecard vs Targets</a>
              </li>
            ) : null}
            {nl.sections.map((s, i) => (
              <li key={s.anchor}>
                <a href={`#${s.anchor}`}>
                  <span className="toc-num">{i + 1}</span>
                  {s.label}
                </a>
              </li>
            ))}
            {nl.actionPlan.length > 0 ? (
              <li>
                <a href="#sec-actions">Prioritised Action Plan</a>
              </li>
            ) : null}
          </ul>
        </nav>

        <section className="exec-brief" id="sec-exec">
          <h2>CHRO Executive Brief</h2>
          {nl.execBrief.summary ? <p className="brief-summary">{nl.execBrief.summary}</p> : null}
          {nl.execBrief.headlineKpis.length > 0 ? (
            <div className="kpis">
              {nl.execBrief.headlineKpis.map((k) => (
                <div className="kpi" key={k.label}>
                  <div className="label">{k.label}</div>
                  <div className="value">{k.value}</div>
                  {k.hint ? <div className="hint">{k.hint}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="brief-cols">
            <div>
              <h3>Wins</h3>
              {nl.execBrief.wins.length > 0 ? (
                <ul>
                  {nl.execBrief.wins.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No standout wins flagged this period.</p>
              )}
            </div>
            <div>
              <h3>Top Risks</h3>
              {nl.execBrief.risks.length > 0 ? (
                <ul>
                  {nl.execBrief.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No high/medium risks flagged this period.</p>
              )}
            </div>
          </div>
          {nl.execBrief.movers.length > 0 ? (
            <div className="brief-movers">
              <h3>Notable movers — month over month</h3>
              <ul>
                {nl.execBrief.movers.map((m, i) => (
                  <li key={i} className={`mover ${m.tone}`}>
                    {m.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {nl.brain.findings.length > 0 ? (
          <section className="nl-brain" id="sec-brain">
            <h2>HR Brain — Diagnosis</h2>
            <p className="nl-brain-score">
              HR Health <strong>{nl.brain.health.score}/100</strong> · {nl.brain.health.band} — {nl.brain.health.caption}
            </p>
            {nl.brain.findings.map((f) => (
              <div className={`nl-brain-finding sev-${f.severity}`} key={f.id}>
                <div className="nl-brain-head">
                  <strong>{f.title}</strong> <span className="nl-brain-tag">{f.severity} · {f.category} · {f.owner}</span>
                </div>
                <p className="nl-brain-reason">{f.reason}</p>
                <div className="nl-brain-remedy">Remedy: {f.remedy[0]}</div>
              </div>
            ))}
            {nl.brain.roadmap.length > 0 ? (
              <div className="nl-roadmap">
                <h3>Recommended action roadmap</h3>
                {(["Now", "Next", "Later"] as const).map((h) => {
                  const items = nl.brain.roadmap.filter((r) => r.horizon === h);
                  if (!items.length) return null;
                  const hint = h === "Now" ? "0–30 days" : h === "Next" ? "1–3 months" : "3–12 months";
                  return (
                    <div className="nl-rm-h" key={h}>
                      <div className="nl-rm-label">{h} <span>· {hint}</span></div>
                      <ul>
                        {items.map((it) => (
                          <li key={it.id}>
                            {it.title} <em>— {it.impact} impact · {it.effort} effort · {it.owner}</em>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {nl.scorecard.some((r) => r.rag !== "none") ? (
          <section className="nl-scorecard" id="sec-scorecard">
            <h2>Scorecard vs Targets</h2>
            <table className="nl-sc-table">
              <thead>
                <tr>
                  <th>KPI</th>
                  <th>Area</th>
                  <th>Current</th>
                  <th>vs last</th>
                  <th>Target</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {nl.scorecard.filter((r) => r.rag !== "none").map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{r.group}</td>
                    <td>{r.display}</td>
                    <td>{r.trend ? <span className={`sc-trend ${r.trendTone}`}>{r.trend}</span> : "—"}</td>
                    <td>{r.target}{r.unit === "%" ? "%" : r.unit ? ` ${r.unit}` : ""}</td>
                    <td><span className={`rag-dot ${r.rag}`} aria-hidden="true" /> {r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {nl.sections.map((s, i) => (
          <section className="nl-section" id={s.anchor} key={s.anchor}>
            <h2>
              <span className="sec-num">{i + 1}</span>
              {s.label}
            </h2>
            <DomainView domain={s} accent={branding.accent} />
          </section>
        ))}

        {nl.actionPlan.length > 0 ? (
          <section className="action-plan" id="sec-actions">
            <h2>Prioritised Action Plan</h2>
            <ol>
              {nl.actionPlan.map((a) => (
                <li key={a.priority} className={`sev-${a.severity}`}>
                  <span className={`badge sev-${a.severity}`}>{a.severity}</span>
                  <strong>{a.title}</strong> <span className="ap-meta">({a.domain} · {a.owner})</span>
                  <div className="ap-action">{a.actionHint ?? a.detail}</div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <footer className="nl-footer">{branding.footer}</footer>
      </article>
    </div>
  );
}
