import { useMemo } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { combinedEmployeeSnapshot } from "../../core/metrics/combineEmployees";
import { buildHeadcountPlan } from "../../core/metrics/headcount_plan";

export function HeadcountPlan() {
  const { store, version, branding, drillToPeople } = useApp();
  const domain = useMemo(
    () =>
      buildHeadcountPlan({
        employeeRows: combinedEmployeeSnapshot(store)?.rows ?? [],
        planRows: store.getLatest("headcount_plan")?.rows ?? null,
        payrollAggregateRows: store.getLatest("payroll_aggregate")?.rows ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version],
  );

  return (
    <div>
      <div className="page-head">
        <h2>Headcount Plan</h2>
        <p className="page-sub">
          Active headcount against the approved plan and budget — hiring-vs-plan, fill rate, budget headroom and (with payroll)
          cost-vs-budget, by department. Computed on-device.
        </p>
      </div>
      <DomainView domain={domain} accent={branding.accent} dark={branding.theme === "dark"} onDrill={drillToPeople} />
    </div>
  );
}
