import { useMemo } from "react";
import { useApp } from "../state";
import { buildBrain, type BrainFinding } from "../../core/brain/brain";

const SEV_LABEL: Record<BrainFinding["severity"], string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const CONF_LABEL: Record<BrainFinding["confidence"], string> = { confirmed: "Known", likely: "Likely", possible: "Possible" };
const HORIZON_HINT: Record<"Now" | "Next" | "Later", string> = { Now: "0–30 days", Next: "1–3 months", Later: "3–12 months" };

export function HRBrain() {
  const { store, version, targets, benchmarks, goTo } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { findings, summary, health, roadmap } = useMemo(() => buildBrain(store, { targets, benchmarks }), [store, version, targets, benchmarks]);
  const hasData = !!store.getLatest("employee_master");
  const bandClass = health.band.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="hr-brain">
      <div className="page-head">
        <h2>HR Brain</h2>
        <p className="page-sub">
          Automatic, on-device diagnosis across every domain — known and emerging issues, each with a likely cause and a
          remedy plan. No data leaves your machine, and no AI service is used.
        </p>
      </div>

      {!hasData ? (
        <p className="muted placeholder">No employee data yet. Upload the Employee Master on the Data Intake page — HR Brain diagnoses it automatically.</p>
      ) : (
        <>
          <div className={`brain-score band-${bandClass}`} role="status" aria-label={`HR health score ${health.score} of 100, ${health.band}`}>
            <div className="brain-score-num">{health.score}<span className="brain-score-of">/100</span></div>
            <div className="brain-score-meta">
              <div className="brain-score-band">HR Health: {health.band}</div>
              <div className="brain-score-caption">{health.caption}</div>
            </div>
          </div>
          {findings.length === 0 ? (
            <p className="brain-clear">✅ No material issues detected. HR Brain will flag problems here as they emerge.</p>
          ) : (
            <>
          <div className="brain-summary" role="status">
            <span className="brain-chip total">{summary.total} finding{summary.total === 1 ? "" : "s"}</span>
            {summary.critical > 0 ? <span className="brain-chip critical">{summary.critical} critical</span> : null}
            {summary.high > 0 ? <span className="brain-chip high">{summary.high} high</span> : null}
            {summary.medium > 0 ? <span className="brain-chip medium">{summary.medium} medium</span> : null}
            {summary.low > 0 ? <span className="brain-chip low">{summary.low} low</span> : null}
            <span className="brain-chip plain">{summary.known} known · {summary.possible} possible</span>
          </div>

          <div className="brain-findings">
            {findings.map((f) => (
              <article className={`brain-card sev-${f.severity}`} key={f.id}>
                <header className="brain-card-head">
                  <span className={`brain-sev sev-${f.severity}`}>{SEV_LABEL[f.severity]}</span>
                  <span className={`brain-conf conf-${f.confidence}`}>{CONF_LABEL[f.confidence]}</span>
                  <h3>{f.title}</h3>
                  <span className="brain-owner">{f.category} · {f.owner}</span>
                </header>
                <div className="brain-section">
                  <div className="brain-label">Evidence</div>
                  <ul className="brain-evidence">{f.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
                <div className="brain-section">
                  <div className="brain-label">Likely reason</div>
                  <p className="brain-reason">{f.reason}</p>
                </div>
                <div className="brain-section">
                  <div className="brain-label">Remedy plan</div>
                  <ol className="brain-remedy">{f.remedy.map((r, i) => <li key={i}>{r}</li>)}</ol>
                </div>
                {f.link ? (
                  <button className="brain-link" onClick={() => goTo(f.link!.page, f.link!.tab)}>
                    View the evidence →
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          {roadmap.length > 0 ? (
            <section className="brain-roadmap">
              <h3>Prioritised action roadmap</h3>
              <p className="muted brain-roadmap-sub">Findings sequenced by impact and effort — the order a people team would actually work them.</p>
              {(["Now", "Next", "Later"] as const).map((h) => {
                const items = roadmap.filter((r) => r.horizon === h);
                if (!items.length) return null;
                return (
                  <div className="rm-horizon" key={h}>
                    <div className="rm-horizon-head">
                      <span className={`rm-h rm-h-${h.toLowerCase()}`}>{h}</span>
                      <span className="rm-h-hint">{HORIZON_HINT[h]}</span>
                    </div>
                    {items.map((it) => (
                      <div className="rm-item" key={it.id}>
                        <div className="rm-item-main">
                          <span className="rm-title">{it.title}</span>
                          <span className={`rm-chip imp-${it.impact.toLowerCase()}`}>{it.impact} impact</span>
                          <span className="rm-chip eff">{it.effort} effort</span>
                          <span className="rm-quadrant">{it.quadrant}</span>
                          <span className="rm-owner">{it.owner}</span>
                        </div>
                        {it.firstAction ? <div className="rm-action"><strong>First action:</strong> {it.firstAction}</div> : null}
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          ) : null}

          <p className="muted" style={{ fontSize: ".82rem", marginTop: 14, maxWidth: "78ch" }}>
            Findings come from a local rule engine — deterministic, explainable and offline. Treat them as decision
            support, not a replacement for HR judgement.
          </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
