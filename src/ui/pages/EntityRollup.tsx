import { useMemo } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { combinedEmployeeSnapshot } from "../../core/metrics/combineEmployees";
import { buildEntityRollup } from "../../core/metrics/entity_rollup";

export function EntityRollup() {
  const { store, version, branding, drillToPeople } = useApp();
  const domain = useMemo(
    () => {
      const snap = combinedEmployeeSnapshot(store);
      return buildEntityRollup({
        employeeRows: snap?.rows ?? [],
        payrollAggregateRows: store.getLatest("payroll_aggregate")?.rows ?? null,
        asOf: snap?.asOf ?? null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version],
  );

  return (
    <div>
      <div className="page-head">
        <h2>Entity Rollup</h2>
        <p className="page-sub">
          Group view across legal entities — headcount, tenure, departments and cost per entity, with consolidated totals.
          Click an entity to drill into its people. Computed on-device.
        </p>
      </div>
      <DomainView domain={domain} accent={branding.accent} dark={branding.theme === "dark"} onDrill={drillToPeople} />
    </div>
  );
}
