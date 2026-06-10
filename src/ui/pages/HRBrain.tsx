import { useMemo } from "react";
import { useApp } from "../state";
import { Chart } from "../components/Chart";
import { buildBrain, buildHealthHistory, findingScope, type BrainFinding, type RoadmapItem } from "../../core/brain/brain";
import { actionFromRoadmap, withStatus, hasOpenActionForFinding, actionSummary, ACTION_STATUSES, ACTION_STATUS_LABEL, type ActionStatus } from "../../core/actions";

const SEV_LABEL: Record<BrainFinding["severity"], string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const CONF_LABEL: Record<BrainFinding["confidence"], string> = { confirmed: "Known", likely: "Likely", possible: "Possible" };
const HORIZON_HINT: Record<"Now" | "Next" | "Later", string> = { Now: "0–30 days", Next: "1–3 months", Later: "3–12 months" };

export function HRBrain() {
  const { store, version, targets, effectiveBenchmarks, branding, goTo, actions, setActions } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { findings, summary, health, roadmap, maturity, resolved } = useMemo(() => buildBrain(store, { targets, benchmarks: effectiveBenchmarks }), [store, version, targets, effectiveBenchmarks]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const healthHistory = useMemo(() => buildHealthHistory(store, { targets, benchmarks: effectiveBenchmarks }), [store, version, targets, effectiveBenchmarks]);
  const hasData = !!store.getLatest("employee_master");
  const bandClass = health.band.toLowerCase().replace(/\s+/g, "-");
  const newCount = findings.filter((f) => f.isNew).length;

  // Action tracking: turn a roadmap item into a tracked commitment, then manage status.
  const trackAction = (it: RoadmapItem) => {
    if (hasOpenActionForFinding(actions, it.id)) return;
    setActions((prev) => [...prev, actionFromRoadmap(it, new Date().toISOString())]);
  };
  const setActionStatus = (id: string, status: ActionStatus) =>
    setActions((prev) => prev.map((a) => (a.id === id ? withStatus(a, status, new Date().toISOString()) : a)));
  const setActionDue = (id: string, due: string | null) =>
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, due } : a)));
  const removeAction = (id: string) => setActions((prev) => prev.filter((a) => a.id !== id));
  const actSummary = actions.length ? actionSummary(actions, new Date().toISOString().slice(0, 10)) : null;

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
              <div className="brain-score-band">
                HR Health: {health.band}
                {health.trend ? <span className={`brain-trend ${health.trendTone}`} title={`vs ${health.priorLabel}`}>{health.trend} vs {health.priorLabel}</span> : null}
              </div>
              <div className="brain-score-caption">{health.caption}</div>
            </div>
          </div>
          {healthHistory ? (
            <div className="brain-health-history">
              <Chart spec={healthHistory} accent={branding.accent} dark={branding.theme === "dark"} />
            </div>
          ) : null}
          {resolved.length > 0 ? (
            <p className="brain-resolved">✓ Resolved since {health.priorLabel ?? "last period"}: {resolved.map((r) => r.title).join(", ")}.</p>
          ) : null}
          {findings.length === 0 ? (
            <p className="brain-clear">✅ No material issues detected. HR Brain will flag problems here as they emerge.</p>
          ) : (
            <>
          <div className="brain-summary" role="status">
            <span className="brain-chip total">{summary.total} finding{summary.total === 1 ? "" : "s"}</span>
            {newCount > 0 ? <span className="brain-chip new">{newCount} new this period</span> : null}
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
                  {f.isNew ? <span className="brain-new" title="Newly emerged since last period">NEW</span> : null}
                  <h3>{f.title}</h3>
                  <span className="brain-owner">{findingScope(f)}</span>
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
                          {hasOpenActionForFinding(actions, it.id)
                            ? <span className="rm-tracked" title="Added to tracked actions">✓ Tracked</span>
                            : <button className="rm-track no-print" onClick={() => trackAction(it)}>+ Track</button>}
                        </div>
                        {it.firstAction ? <div className="rm-action"><strong>First action:</strong> {it.firstAction}</div> : null}
                        {it.roi ? <div className="rm-roi"><strong>{it.roi.label}</strong> at stake <span className="rm-roi-note">— {it.roi.note}</span></div> : null}
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          ) : null}

          {maturity.overall.score !== null ? (
            <section className="brain-maturity">
              <h3>HR maturity assessment</h3>
              <p className="muted brain-maturity-sub">
                Overall maturity <strong>{maturity.overall.score}/5 · {maturity.overall.stage}</strong> — capability across the
                people function, scored from your data on a 1–5 scale (Ad-hoc → Optimised).
              </p>
              <div className="metric-table">
                <div className="table-scroll" tabIndex={0} aria-label="HR maturity by dimension">
                  <table>
                    <thead>
                      <tr><th>Dimension</th><th>Maturity</th><th>Stage</th><th>Basis</th></tr>
                    </thead>
                    <tbody>
                      {maturity.dimensions.map((d) => (
                        <tr key={d.key} title={d.level === null ? undefined : `To advance: ${d.advance}`}>
                          <td>{d.label}</td>
                          <td>{d.level === null ? <span className="muted">—</span> : <span className="mat-dots" aria-label={`${d.level} of 5`}>{"●".repeat(d.level)}<span className="mat-dots-empty">{"○".repeat(5 - d.level)}</span> <span className="mat-n">{d.level}/5</span></span>}</td>
                          <td>{d.stage}</td>
                          <td className="muted">{d.basis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          <p className="muted" style={{ fontSize: ".82rem", marginTop: 14, maxWidth: "78ch" }}>
            Findings come from a local rule engine — deterministic, explainable and offline. Treat them as decision
            support, not a replacement for HR judgement.
          </p>
            </>
          )}

          {actions.length > 0 ? (
            <section className="brain-actions">
              <h3>Tracked actions</h3>
              {actSummary ? (
                <p className="muted brain-actions-sub">
                  {actSummary.open} open · {actSummary.in_progress} in progress · {actSummary.done} done
                  {actSummary.overdue ? <span className="act-overdue"> · {actSummary.overdue} overdue</span> : null}
                </p>
              ) : null}
              <div className="metric-table">
                <div className="table-scroll" tabIndex={0} aria-label="Tracked actions">
                  <table>
                    <thead>
                      <tr><th>Action</th><th>Owner</th><th>Status</th><th>Due</th><th className="no-print" aria-label="Remove"></th></tr>
                    </thead>
                    <tbody>
                      {actions.map((a) => (
                        <tr key={a.id} className={a.status === "done" ? "act-row-done" : ""}>
                          <td>{a.title}</td>
                          <td>{a.owner}</td>
                          <td>
                            <select className="act-status" value={a.status} onChange={(e) => setActionStatus(a.id, e.target.value as ActionStatus)} aria-label={`Status for ${a.title}`}>
                              {ACTION_STATUSES.map((s) => <option key={s} value={s}>{ACTION_STATUS_LABEL[s]}</option>)}
                            </select>
                          </td>
                          <td><input className="act-due" type="date" value={a.due ?? ""} onChange={(e) => setActionDue(a.id, e.target.value || null)} aria-label={`Due date for ${a.title}`} /></td>
                          <td className="no-print"><button className="act-del" aria-label={`Remove ${a.title}`} onClick={() => removeAction(a.id)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
