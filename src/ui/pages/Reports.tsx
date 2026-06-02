import { useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { overviewKpis } from "../../core/metrics/overview";
import { buildNewsletter } from "../../reports/newsletter";
import { buildFactsMarkdown } from "../../reports/factsPack";
import { leaverEvents } from "../../core/metrics/movement";
import { downloadBlob } from "../download";

export function Reports() {
  const { store, branding, version } = useApp();
  // Stamp the generation date once per mount (lazy state init — stable across renders).
  const [generatedAtLabel] = useState(() =>
    new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
  );

  const activeHeadcount = useMemo(() => {
    const rows = store.getLatest("employee_master")?.rows;
    return rows && rows.length ? overviewKpis(rows).active : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  const nl = useMemo(
    () =>
      buildNewsletter(store, {
        appName: branding.appName,
        activeHeadcount,
        generatedAtLabel,
        leaverEvents: leaverEvents(store.listByKind("employee_master")),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version, branding.appName, activeHeadcount, generatedAtLabel],
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

        <nav className="nl-toc">
          <h3>Contents</h3>
          <ul>
            <li>
              <a href="#sec-exec">Executive Brief</a>
            </li>
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
