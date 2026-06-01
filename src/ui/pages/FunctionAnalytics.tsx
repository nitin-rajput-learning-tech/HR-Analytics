import { useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { overviewKpis } from "../../core/metrics/overview";
import { buildDomain, buildCrossFunctional, DOMAIN_ORDER, DOMAIN_LABELS, type DomainKey } from "../../core/metrics";
import { leaverEvents } from "../../core/metrics/movement";

type Tab = DomainKey | "cross_functional";

const TABS: { key: Tab; label: string }[] = [
  ...DOMAIN_ORDER.map((k) => ({ key: k as Tab, label: DOMAIN_LABELS[k] })),
  { key: "cross_functional", label: "Cross-Functional" },
];

export function FunctionAnalytics() {
  const { store, branding, version } = useApp();
  const [tab, setTab] = useState<Tab>(DOMAIN_ORDER[0]);

  // Active headcount feeds L&D coverage; derived during render (not in an effect).
  const activeHeadcount = useMemo(() => {
    const rows = store.getLatest("employee_master")?.rows;
    return rows && rows.length ? overviewKpis(rows).active : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  const domain = useMemo(() => {
    if (tab === "cross_functional") return buildCrossFunctional(store, { leaverEvents: leaverEvents(store.listByKind("employee_master")) });
    return buildDomain(store, tab, { activeHeadcount });
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
      <DomainView domain={domain} accent={branding.accent} />
    </div>
  );
}
