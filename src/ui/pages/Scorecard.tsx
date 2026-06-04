import { useMemo } from "react";
import { useApp } from "../state";
import { buildScorecard, scorecardSummary } from "../../core/scorecard";

export function Scorecard() {
  const { store, version, targets, setTargets } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildScorecard(store, targets), [store, version, targets]);
  const summary = scorecardSummary(rows);

  const setTarget = (id: string, v: string) => {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) setTargets({ ...targets, [id]: n });
  };
  const hasCustom = Object.keys(targets).length > 0;

  return (
    <div className="scorecard">
      <div className="page-head">
        <h2>Scorecard</h2>
        <p className="page-sub">
          Headline KPIs against your targets — red / amber / green status, plus the change since last period. Edit any target
          inline; it saves with your workspace.
        </p>
      </div>

      <div className="sc-summary" role="status">
        <span className="sc-chip green"><span className="rag-dot green" aria-hidden="true" /> {summary.green} on target</span>
        <span className="sc-chip amber"><span className="rag-dot amber" aria-hidden="true" /> {summary.amber} watch</span>
        <span className="sc-chip red"><span className="rag-dot red" aria-hidden="true" /> {summary.red} off target</span>
        <span className="sc-chip none"><span className="rag-dot none" aria-hidden="true" /> {rows.length - summary.tracked} no data</span>
        {hasCustom ? (
          <button type="button" className="sc-reset" onClick={() => setTargets({})}>Reset targets to defaults</button>
        ) : null}
      </div>

      <div className="metric-table">
        <div className="table-scroll" tabIndex={0} aria-label="KPI scorecard">
          <table>
            <thead>
              <tr>
                <th>KPI</th>
                <th>Area</th>
                <th>Current</th>
                <th>vs last period</th>
                <th>Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td className="muted">{r.group}</td>
                  <td><strong>{r.display}</strong></td>
                  <td>{r.trend ? <span className={`sc-trend ${r.trendTone}`}>{r.trend}</span> : <span className="muted">—</span>}</td>
                  <td>
                    <span className="sc-target">
                      <input
                        type="number"
                        aria-label={`Target for ${r.label}`}
                        value={r.target}
                        step={r.unit === "yrs" ? 0.5 : 1}
                        onChange={(e) => setTarget(r.id, e.target.value)}
                      />
                      {r.unit ? <span className="sc-unit">{r.unit}</span> : null}
                    </span>
                  </td>
                  <td>
                    <span className={`rag-dot ${r.rag}`} aria-hidden="true" /> {r.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted" style={{ fontSize: ".82rem", marginTop: 10, maxWidth: "72ch" }}>
        Targets are stored in your workspace (auto-saved on this device and included when you save/export).{" "}
        {summary.red > 0 ? "Red KPIs are where to focus this period." : summary.tracked > 0 ? "All tracked KPIs are at or near target." : "Upload data to populate the scorecard."}
      </p>
    </div>
  );
}
