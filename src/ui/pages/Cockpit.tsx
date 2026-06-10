import { useMemo, useState } from "react";
import { useApp } from "../state";
import { KpiCard, DataTable } from "../components/DomainView";
import { combinedEmployeeSnapshot } from "../../core/metrics/combineEmployees";
import { managerOptions, departmentOptions, buildCockpit, type CockpitScope } from "../../core/metrics/cockpit";
import type { MetricKPI, MetricTable } from "../../core/metrics/base";

export function Cockpit() {
  const { store, version, drillToPeople } = useApp();
  const [mode, setMode] = useState<"manager" | "department">("manager");
  const [manager, setManager] = useState("");
  const [depts, setDepts] = useState<string[]>([]);

  const snap = useMemo(() => combinedEmployeeSnapshot(store), [store, version]);
  const rows = snap?.rows ?? [];
  const asOf = snap?.asOf ?? null;
  const pmsRows = useMemo(() => store.getLatest("pms_review")?.rows ?? null, [store, version]);
  const payrollRows = useMemo(() => store.getLatest("payroll_record")?.rows ?? null, [store, version]);

  const managerOpts = useMemo(() => managerOptions(rows), [rows]);
  const deptOpts = useMemo(() => departmentOptions(rows), [rows]);

  // Sensible defaults without effects: the largest manager / largest department.
  const activeManager = manager || managerOpts[0]?.name || "";
  const activeDepts = depts.length ? depts : deptOpts[0] ? [deptOpts[0].name] : [];
  const scope: CockpitScope = mode === "manager" ? { by: "manager", value: activeManager } : { by: "department", values: activeDepts };

  const cockpit = useMemo(
    () => buildCockpit({ employeeRows: rows, pmsRows, payrollRows, asOf, scope }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, pmsRows, payrollRows, asOf, mode, activeManager, activeDepts.join("|")],
  );

  if (!rows.length) {
    return (
      <div className="cockpit">
        <div className="page-head"><h2>Manager Cockpit</h2></div>
        <p className="muted placeholder">No employee data yet. Upload the Employee Master on the Data Intake page — the cockpit scopes it to a manager's team or an HRBP's departments.</p>
      </div>
    );
  }

  const kpis: MetricKPI[] = [
    { label: "Team Headcount", value: cockpit.headcount.toLocaleString("en-IN"), hint: `${cockpit.total} on record${cockpit.relieved ? ` · ${cockpit.relieved} relieved` : ""}` },
    { label: "Avg Tenure", value: cockpit.avgTenureYrs === null ? "—" : `${cockpit.avgTenureYrs} yrs` },
    { label: "High / Elevated Risk", value: `${cockpit.risk.high} / ${cockpit.risk.elevated}`, hint: cockpit.risk.avgScore === null ? undefined : `avg score ${cockpit.risk.avgScore}/100` },
    { label: "Regrettable Risk", value: cockpit.risk.regrettable.toLocaleString("en-IN"), hint: "top performers at Elevated+ risk" },
    { label: "Reviews Pending", value: cockpit.reviews ? `${cockpit.reviews.pendingPeople} of ${cockpit.reviews.tracked}` : "—" },
    { label: "Pending Exits", value: cockpit.pendingExits.toLocaleString("en-IN"), hint: cockpit.newJoiners90d ? `${cockpit.newJoiners90d} new joiner(s) <90d` : undefined },
  ];

  const riskTable: MetricTable = {
    title: "Who's at risk in this scope",
    caption: "Highest attrition-risk people in scope — each score is the sum of its named drivers (no black box). ★ = high performer (regrettable).",
    columns: ["Employee", "Department", "Risk score", "Band", "Top drivers", ""],
    rows: cockpit.topRisk.map((r) => [
      r.employee_number,
      r.department,
      r.score,
      r.band,
      r.contributors.map((c) => `${c.label} +${c.points}`).join(", ") || "—",
      r.regrettable ? "★ Regrettable" : "",
    ]),
  };

  return (
    <div className="cockpit">
      <div className="page-head">
        <h2>Manager Cockpit</h2>
        <p className="page-sub">
          A focused brief for a line manager or HR business partner — the team's headcount, attrition risk, regrettable
          top-talent, pending reviews and watch-outs, scoped to just their people. All computed on-device.
        </p>
      </div>

      <div className="cockpit-scope no-print">
        <div className="cockpit-mode">
          <button className={mode === "manager" ? "tab active" : "tab"} onClick={() => setMode("manager")}>By manager</button>
          <button className={mode === "department" ? "tab active" : "tab"} onClick={() => setMode("department")}>By department (HRBP)</button>
        </div>
        {mode === "manager" ? (
          <label className="cockpit-pick">
            <span>Manager</span>
            <select value={activeManager} onChange={(e) => setManager(e.target.value)} aria-label="Manager">
              {managerOpts.map((o) => (
                <option key={o.name} value={o.name}>{o.name} ({o.active})</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="cockpit-depts" role="group" aria-label="Departments">
            {deptOpts.map((o) => {
              const on = activeDepts.includes(o.name);
              return (
                <button
                  key={o.name}
                  className={on ? "chip on" : "chip"}
                  aria-pressed={on}
                  onClick={() => setDepts((d) => {
                    const base = d.length ? d : activeDepts;
                    return base.includes(o.name) ? base.filter((x) => x !== o.name) : [...base, o.name];
                  })}
                >
                  {o.name} ({o.active})
                </button>
              );
            })}
          </div>
        )}
      </div>

      <h3 className="domain-title">{cockpit.scopeLabel}</h3>

      {cockpit.headcount === 0 ? (
        <p className="muted placeholder">No active employees in this scope.</p>
      ) : (
        <>
          <div className="kpis">
            {kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
          </div>

          {cockpit.flags.length ? (
            <div className="cockpit-flags">
              <h3>This week's watch-outs</h3>
              <ul>
                {cockpit.flags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          ) : null}

          {cockpit.topRisk.length ? (
            <DataTable table={riskTable} />
          ) : (
            <p className="muted">No elevated attrition risk in this scope — nicely steady.</p>
          )}

          <p className="muted no-print" style={{ fontSize: ".82rem", marginTop: 8 }}>
            Tip: open <button className="link-btn" onClick={() => drillToPeople("reporting_manager", activeManager)} disabled={mode !== "manager" || !activeManager}>People Analytics for this team</button> to drill into individuals.
          </p>
        </>
      )}
    </div>
  );
}
