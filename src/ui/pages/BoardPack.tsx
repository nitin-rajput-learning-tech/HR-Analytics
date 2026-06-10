import { useMemo, useState } from "react";
import { useApp } from "../state";
import { overviewKpis } from "../../core/metrics/overview";
import { buildNewsletter } from "../../reports/newsletter";
import { buildBoardPack } from "../../reports/boardPack";
import { leaverEvents } from "../../core/metrics/movement";
import { combinedEmployeeSnapshot, employeePeriods } from "../../core/metrics/combineEmployees";

export function BoardPack() {
  const { store, branding, version, targets, effectiveBenchmarks, actions } = useApp();
  const [generatedAtLabel] = useState(() => new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }));

  const activeHeadcount = useMemo(() => {
    const rows = combinedEmployeeSnapshot(store)?.rows;
    return rows && rows.length ? overviewKpis(rows).active : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  const bp = useMemo(
    () => buildBoardPack(buildNewsletter(store, { appName: branding.appName, activeHeadcount, generatedAtLabel, leaverEvents: leaverEvents(employeePeriods(store)), targets, benchmarks: effectiveBenchmarks, actions })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version, branding.appName, activeHeadcount, generatedAtLabel, targets, effectiveBenchmarks, actions],
  );

  const bandClass = bp.health.band.toLowerCase().replace(/\s+/g, "-");
  const c = bp.comparison;

  return (
    <div className="board-pack">
      <div className="reports-toolbar no-print">
        <h2>Board Pack</h2>
        <span className="spacer" />
        <button className="primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <article className="board-deck">
        <section className="board-slide board-cover">
          {branding.logoDataUri ? <img src={branding.logoDataUri} alt="" className="nl-logo" /> : null}
          <h1>{bp.appName}</h1>
          <p className="board-period">Board Pack · {bp.periodLabel} · Generated {bp.generatedAtLabel}</p>
          <div className={`board-health band-${bandClass}`}>
            <div className="bh-score">{bp.health.score}<span>/100</span></div>
            <div className="bh-meta">
              <div className="bh-band">HR Health · {bp.health.band}{bp.health.trend ? <span className={`sc-trend ${bp.health.trendTone}`}> {bp.health.trend}</span> : null}</div>
              <div className="bh-caption">{bp.health.caption}</div>
              {bp.maturity ? <div className="bh-maturity">HR maturity {bp.maturity.score}/5 · {bp.maturity.stage}</div> : null}
            </div>
          </div>
          {bp.headlineKpis.length ? (
            <div className="kpis board-kpis">
              {bp.headlineKpis.map((k) => (
                <div className="kpi" key={k.label}><div className="label">{k.label}</div><div className="value">{k.value}</div>{k.hint ? <div className="hint">{k.hint}</div> : null}</div>
              ))}
            </div>
          ) : null}
        </section>

        {c ? (
          <section className="board-slide">
            <h2>What changed since {c.priorLabel}</h2>
            <p className="board-cmp-health">HR Health <strong>{c.healthScore}/100</strong>{c.healthTrend ? <span className={`sc-trend ${bp.health.trendTone}`}> {c.healthTrend}</span> : null}{c.healthPrior !== null ? <span className="muted"> (was {c.healthPrior})</span> : null}</p>
            <div className="board-cols">
              <div><h3>New / resolved</h3><ul>{c.newFindings.slice(0, 4).map((t, i) => <li key={"n" + i}>▲ {t}</li>)}{c.resolvedFindings.slice(0, 3).map((t, i) => <li key={"r" + i}>✓ {t}</li>)}{!c.newFindings.length && !c.resolvedFindings.length ? <li className="muted">No change in findings.</li> : null}</ul></div>
              <div><h3>Movers</h3><ul>{c.improved.slice(0, 4).map((m, i) => <li key={"i" + i}>{m.label} <span className="sc-trend good">{m.trend}</span></li>)}{c.declined.slice(0, 4).map((m, i) => <li key={"d" + i}>{m.label} <span className="sc-trend bad">{m.trend}</span></li>)}</ul></div>
            </div>
          </section>
        ) : null}

        <section className="board-slide">
          <h2>Top risks & immediate actions</h2>
          <div className="board-cols">
            <div>
              <h3>Top risks</h3>
              {bp.topRisks.length ? <ul>{bp.topRisks.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="muted">No high/medium risks flagged.</p>}
            </div>
            <div>
              <h3>Now — next 30 days</h3>
              {bp.nowActions.length ? <ul>{bp.nowActions.map((a, i) => <li key={i}>{a.title} <em>· {a.owner} · {a.impact} impact</em></li>)}</ul> : <p className="muted">No immediate actions queued.</p>}
            </div>
          </div>
        </section>

        <section className="board-slide">
          <h2>Scorecard</h2>
          <div className="sc-summary">
            <span className="sc-chip green"><span className="rag-dot green" aria-hidden="true" /> {bp.scorecard.onTarget} on track</span>
            {bp.scorecard.atRisk > 0 ? <span className="sc-chip atrisk">▾ {bp.scorecard.atRisk} at risk</span> : null}
            <span className="sc-chip red"><span className="rag-dot red" aria-hidden="true" /> {bp.scorecard.offTrack} off track</span>
          </div>
          {bp.scorecard.red.length ? (
            <div className="board-red">
              <h3>Off-target KPIs</h3>
              <ul>{bp.scorecard.red.map((r, i) => <li key={i}><span className="rag-dot red" aria-hidden="true" /> {r.label} — {r.status}</li>)}</ul>
            </div>
          ) : <p className="muted">No KPI is materially off target.</p>}
        </section>

        <footer className="nl-footer">{branding.footer}</footer>
      </article>
    </div>
  );
}
