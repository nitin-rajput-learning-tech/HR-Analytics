import { useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { overviewKpis } from "../../core/metrics/overview";
import { buildDomainCompared, buildCrossFunctional, DOMAIN_ORDER, DOMAIN_LABELS, type DomainKey } from "../../core/metrics";
import { leaverEvents } from "../../core/metrics/movement";
import { combinedEmployeeSnapshot, employeePeriods } from "../../core/metrics/combineEmployees";

type Tab = DomainKey | "cross_functional";

const TABS: { key: Tab; label: string }[] = [
  ...DOMAIN_ORDER.map((k) => ({ key: k as Tab, label: DOMAIN_LABELS[k] })),
  { key: "cross_functional", label: "Cross-Functional" },
];

export function FunctionAnalytics() {
  const { store, branding, version, drillToPeople } = useApp();
  const [tab, setTab] = useState<Tab>(DOMAIN_ORDER[0]);

  // Active headcount feeds L&D coverage; derived during render (not in an effect).
  const activeHeadcount = useMemo(() => {
    const rows = combinedEmployeeSnapshot(store)?.rows;
    return rows && rows.length ? overviewKpis(rows).active : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  const domain = useMemo(() => {
    if (tab === "cross_functional") return buildCrossFunctional(store, { leaverEvents: leaverEvents(employeePeriods(store)) });
    return buildDomainCompared(store, tab, { activeHeadcount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, tab, activeHeadcount]);

  return (
    <div>
      <h2>Function Analytics</h2>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={t.key === tab ? "tab active" : "tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <h3 className="domain-title">{domain.label}</h3>
      <DomainView domain={domain} accent={branding.accent} dark={branding.theme === "dark"} onDrill={drillToPeople} />
      <p className="muted" style={{ fontSize: ".82rem", marginTop: 8 }}>Tip: click a department bar to drill into People Analytics filtered to that team.</p>
    </div>
  );
}
