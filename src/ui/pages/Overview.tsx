import { useApp } from "../state";
import { overviewKpis } from "../../core/metrics/overview";

export function Overview() {
  const { store } = useApp();
  const latest = store.getLatest("employee_master");
  if (!latest) {
    return (
      <div>
        <h2>Overview</h2>
        <p>No employee data yet — upload it on Data Intake.</p>
      </div>
    );
  }
  const k = overviewKpis(latest.rows);
  const card = (label: string, value: string) => (
    <div className="kpi" key={label}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
  return (
    <div>
      <h2>Overview</h2>
      <div className="kpis">
        {card("Rows", k.total.toLocaleString())}
        {card("Active headcount", k.active.toLocaleString())}
        {card("Relieved", k.relieved.toLocaleString())}
        {card("Active ratio", `${k.activeRatio}%`)}
      </div>
    </div>
  );
}
