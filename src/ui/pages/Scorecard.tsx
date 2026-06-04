import { useMemo, useState } from "react";
import { useApp } from "../state";
import { buildScorecard, scorecardSummary } from "../../core/scorecard";

export function Scorecard() {
  const { store, version, targets, setTargets, benchmarks, setBenchmarks } = useApp();
  const [editBench, setEditBench] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildScorecard(store, targets, benchmarks), [store, version, targets, benchmarks]);
  const summary = scorecardSummary(rows);

  const setTarget = (id: string, v: string) => {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) setTargets({ ...targets, [id]: n });
  };
  // Edit one edge of a KPI's benchmark band, seeding from its current effective band.
  const setBench = (id: string, edge: "low" | "high", v: string, current: { low: number; high: number } | null) => {
    const n = Number(v);
    if (v.trim() === "" || !Number.isFinite(n) || !current) return;
    setBenchmarks({ ...benchmarks, [id]: { ...current, [edge]: n } });
  };
  const hasCustom = Object.keys(targets).length > 0;
  const hasCustomBench = Object.keys(benchmarks).length > 0;

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
        <button type="button" className="sc-reset" onClick={() => setEditBench((e) => !e)} aria-pressed={editBench}>
          {editBench ? "Done editing benchmarks" : "Edit benchmarks"}
        </button>
        {hasCustomBench ? (
          <button type="button" className="sc-reset" onClick={() => setBenchmarks({})}>Reset benchmarks</button>
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
                <th>Benchmark</th>
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
                    {editBench && r.benchmarkBand ? (
                      <span className="sc-bench-edit">
                        <input type="number" aria-label={`Benchmark low for ${r.label}`} value={r.benchmarkBand.low} step={r.unit === "yrs" ? 0.5 : 1} onChange={(e) => setBench(r.id, "low", e.target.value, r.benchmarkBand)} />
                        <span aria-hidden="true">–</span>
                        <input type="number" aria-label={`Benchmark high for ${r.label}`} value={r.benchmarkBand.high} step={r.unit === "yrs" ? 0.5 : 1} onChange={(e) => setBench(r.id, "high", e.target.value, r.benchmarkBand)} />
                      </span>
                    ) : r.benchmarkPos === "none" ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className="sc-bench">
                        <span className="sc-bench-range">{r.benchmark}</span>
                        <span className={`sc-bench-pos ${r.benchmarkPos}`}>
                          {r.benchmarkPos === "better" ? "▲ better" : r.benchmarkPos === "worse" ? "▼ worse" : "● typical"}
                        </span>
                      </span>
                    )}
                  </td>
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

      <p className="muted" style={{ fontSize: ".82rem", marginTop: 10, maxWidth: "78ch" }}>
        Targets are stored in your workspace (auto-saved on this device and included when you save/export).{" "}
        {summary.red > 0 ? "Red KPIs are where to focus this period." : summary.tracked > 0 ? "All tracked KPIs are at or near target." : "Upload data to populate the scorecard."}
      </p>
      <p className="muted" style={{ fontSize: ".8rem", marginTop: 4, maxWidth: "78ch" }}>
        Benchmark ranges are <strong>illustrative</strong> general references — a starting point to compare against, not a sourced
        survey. Adjust them for your sector and region.
      </p>
    </div>
  );
}
