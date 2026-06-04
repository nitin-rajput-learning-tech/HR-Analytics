import { useMemo, useRef, useState } from "react";
import { useApp } from "../state";
import * as N from "../../core/narrative";
import { activeByDept, costByDeptFromAggregate, computeScenario, type ScenarioOp, type ScenarioOpKind } from "../../core/metrics/scenario";
import { combinedEmployeeSnapshot } from "../../core/metrics/combineEmployees";
import { tableToCsv } from "../../core/filters";
import { downloadBlob } from "../download";

function describeOp(o: ScenarioOp): string {
  if (o.kind === "hire") return `Hire ${o.count} → ${o.dept}`;
  if (o.kind === "cut") return `Cut ${o.count} from ${o.dept}`;
  return `Move ${o.count}: ${o.dept} → ${o.toDept}`;
}

const signed = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toLocaleString("en-IN");
const signedMoney = (n: number) => (n >= 0 ? "+" : "−") + N.humanizeMoneyInr(Math.abs(n));

export function Scenario() {
  const { store, version } = useApp();
  const idRef = useRef(0);
  const [ops, setOps] = useState<ScenarioOp[]>([]);
  const [kind, setKind] = useState<ScenarioOpKind>("hire");
  const [dept, setDept] = useState("");
  const [toDept, setToDept] = useState("");
  const [count, setCount] = useState(1);
  const [assumed, setAssumed] = useState(75000);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => activeByDept(combinedEmployeeSnapshot(store)?.rows ?? []), [store, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const costByDept = useMemo(() => costByDeptFromAggregate(store.getLatest("payroll_aggregate")?.rows), [store, version]);
  const depts = useMemo(() => [...base.keys()].sort(), [base]);

  const result = useMemo(
    () => computeScenario(base, ops, costByDept.size ? costByDept : null, assumed),
    [base, ops, costByDept, assumed],
  );

  if (base.size === 0) {
    return (
      <div>
        <div className="page-head">
          <h2>Scenario Planner</h2>
          <p className="page-sub">Model hiring, reductions and reorganisations — see the headcount and cost impact instantly.</p>
        </div>
        <p className="muted placeholder">Load an Employee Master on the Data Intake page to start planning scenarios.</p>
      </div>
    );
  }

  const curDept = dept || depts[0];
  const curTo = toDept || depts.find((d) => d !== curDept) || depts[0];

  function addOp() {
    const c = Math.max(1, Math.floor(count || 0));
    const d = dept || depts[0];
    const t = toDept || depts.find((x) => x !== d) || depts[0];
    if (kind === "move" && d === t) return;
    setOps((prev) => [...prev, { id: "op" + ++idRef.current, kind, dept: d, count: c, ...(kind === "move" ? { toDept: t } : {}) }]);
  }
  const removeOp = (id: string) => setOps((prev) => prev.filter((o) => o.id !== id));

  // Export the scenario (the ops + headcount/cost summary + per-department impact)
  // as CSV so a planned what-if can be shared or attached to a proposal.
  function downloadScenarioCsv() {
    const opsLine = ops.length ? ops.map(describeOp).join("; ") : "(baseline — no changes)";
    const summary = tableToCsv(
      ["Metric", "Baseline", "Scenario", "Delta"],
      [
        ["Active headcount", result.baseHeadcount, result.scenarioHeadcount, result.headcountDelta],
        ...(result.baseCost !== null && result.scenarioCost !== null
          ? [["Monthly cost (INR)", Math.round(result.baseCost), Math.round(result.scenarioCost), Math.round(result.costDelta ?? 0)] as (string | number)[]]
          : []),
      ],
    );
    const depts = tableToCsv(["Department", "Baseline", "Scenario", "Delta"], result.depts.map((d) => [d.dept, d.base, d.scenario, d.delta]));
    const csv = `Scenario: ${opsLine}\n\n${summary}\n\n${depts}\n`;
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "scenario-plan.csv");
  }

  const costBasisNote =
    result.costBasis === "payroll"
      ? "Cost uses per-department averages from the payroll aggregate."
      : result.costBasis === "assumed"
        ? "No payroll loaded — cost uses the assumed monthly figure below."
        : "Load a payroll aggregate (or set an assumed cost) to see cost impact.";

  return (
    <div>
      <div className="page-head">
        <h2>Scenario Planner</h2>
        <p className="page-sub">Model hiring, reductions and reorganisations against the latest snapshot — headcount and INR cost impact recompute instantly, fully offline.</p>
      </div>

      <div className="scn-builder no-print">
        <select value={kind} onChange={(e) => setKind(e.target.value as ScenarioOpKind)} aria-label="Operation">
          <option value="hire">Hire</option>
          <option value="cut">Cut</option>
          <option value="move">Move</option>
        </select>
        <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Count" className="scn-count" />
        <select value={curDept} onChange={(e) => setDept(e.target.value)} aria-label={kind === "move" ? "From department" : "Department"}>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {kind === "move" ? (
          <>
            <span className="scn-arrow">→</span>
            <select value={curTo} onChange={(e) => setToDept(e.target.value)} aria-label="To department">
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </>
        ) : null}
        <button className="primary" onClick={addOp}>Add</button>
        {ops.length ? <button className="link-btn" onClick={() => setOps([])}>Clear all</button> : null}
      </div>

      {ops.length === 0 ? (
        <p className="muted">No changes yet — add a hire, cut or move above to model a scenario.</p>
      ) : (
        <ul className="scn-ops no-print">
          {ops.map((o) => (
            <li key={o.id} className={`scn-op k-${o.kind}`}>
              <span>{describeOp(o)}</span>
              <button className="scn-op-del" aria-label="Remove" onClick={() => removeOp(o.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="label">Active Headcount</div>
          <div className="value">{N.humanizeInt(result.scenarioHeadcount)}</div>
          <div className={`delta ${result.headcountDelta === 0 ? "neutral" : result.headcountDelta > 0 ? "good" : "bad"}`}>
            {result.headcountDelta === 0 ? "no change" : `${signed(result.headcountDelta)} vs ${N.humanizeInt(result.baseHeadcount)}`}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Monthly Cost</div>
          <div className="value">{result.scenarioCost === null ? "—" : N.humanizeMoneyInr(result.scenarioCost)}</div>
          <div className={`delta ${!result.costDelta ? "neutral" : result.costDelta > 0 ? "bad" : "good"}`}>
            {result.costDelta === null ? "no cost basis" : result.costDelta === 0 ? "no change" : `${signedMoney(result.costDelta)}/mo`}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Annualised Cost Impact</div>
          <div className="value">{result.costDelta === null ? "—" : signedMoney(result.costDelta * 12)}</div>
          <div className="hint">vs baseline, ×12 months</div>
        </div>
      </div>
      <p className="muted scn-basis">{costBasisNote}</p>

      {result.costBasis !== "payroll" ? (
        <label className="scn-assumed no-print">
          Assumed monthly cost / role (₹)
          <input type="number" min={0} step={5000} value={assumed} onChange={(e) => setAssumed(Number(e.target.value))} />
        </label>
      ) : null}

      <div className="metric-table">
        <div className="mt-head">
          <h4>Department impact</h4>
          <div className="mt-tools no-print">
            <button className="table-csv" title="Export this scenario as CSV" onClick={downloadScenarioCsv}>Export CSV</button>
          </div>
        </div>
        <div className="table-scroll" tabIndex={0}>
          <table>
            <thead>
              <tr><th>Department</th><th>Baseline</th><th>Scenario</th><th>Δ</th></tr>
            </thead>
            <tbody>
              {result.depts.map((r) => (
                <tr key={r.dept}>
                  <td>{r.dept}</td>
                  <td>{r.base.toLocaleString("en-IN")}</td>
                  <td>{r.scenario.toLocaleString("en-IN")}</td>
                  <td className={r.delta === 0 ? "" : r.delta > 0 ? "scn-up" : "scn-down"}>{r.delta === 0 ? "—" : signed(r.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
