import { useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { buildPeople } from "../../core/metrics/people";

export function People() {
  const { store, branding, version } = useApp();
  const sections = useMemo(() => {
    const snap = store.getLatest("employee_master");
    return snap ? buildPeople(snap.rows, snap.asOf) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);
  const [tab, setTab] = useState(0);

  if (sections.length === 0) {
    return (
      <div>
        <h2>People Analytics</h2>
        <p className="muted placeholder">No employee data yet — upload the Employee Master on the Data Intake page.</p>
      </div>
    );
  }
  const idx = Math.min(tab, sections.length - 1);
  const current = sections[idx];

  return (
    <div>
      <div className="page-head">
        <h2>People Analytics</h2>
        <p className="page-sub">Headcount, tenure, diversity, geography, span of control, attrition and data quality from the employee master.</p>
      </div>
      <div className="tabs">
        {sections.map((s, i) => (
          <button key={s.key} className={i === idx ? "tab active" : "tab"} onClick={() => setTab(i)}>
            {s.label}
          </button>
        ))}
      </div>
      <DomainView domain={current.metrics} accent={branding.accent} />
    </div>
  );
}
