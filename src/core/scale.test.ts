import { describe, it, expect } from "vitest";
import { MemoryStore } from "./store/memoryStore";
import { buildPeople } from "./metrics/people";
import { buildAll } from "./metrics";
import { buildScorecard } from "./scorecard";
import { buildBrain, buildHealthHistory } from "./brain/brain";
import { buildEntityRollup } from "./metrics/entity_rollup";
import { buildCockpit } from "./metrics/cockpit";
import { pivotTable, COUNT_MEASURE } from "./metrics/pivot";
import { generateFunctionalDemo } from "./intake/demoData";
import { overviewKpis } from "./metrics/overview";
import type { Snapshot } from "./store/types";
import type { Row } from "./ingest/types";

const DEPTS = ["Technology", "Sales", "Operations", "Finance", "Human Resources", "Product", "Customer Support", "Marketing"];
const ENTITIES = ["Acme Payments Pvt Ltd", "Acme Academy Pvt Ltd", "Acme Labs Pvt Ltd"];
const CITIES = ["Pune", "Mumbai", "Bengaluru", "Delhi", "Remote"];

function roster(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    employee_number: "E" + i,
    full_name: "Employee " + i,
    department: DEPTS[i % DEPTS.length],
    legal_entity: ENTITIES[i % ENTITIES.length],
    current_city: CITIES[i % CITIES.length],
    gender: i % 2 ? "Male" : "Female",
    reporting_manager: "Manager " + (i % 200),
    job_title: "Role " + (i % 12),
    employment_status: i % 20 === 0 ? "Relieved" : "Working",
    date_joined: `20${18 + (i % 7)}-0${1 + (i % 9)}-15`,
    last_working_day: i % 20 === 0 ? "2026-05-15" : "",
  }) as Row);
}

const snap = (kind: string, asOf: string, rows: Row[]): Snapshot => ({ id: `${kind}:${asOf}`, kind, asOf, periodLabel: asOf, sourceFile: "scale.xlsx", compatibility: "full", rows });

describe("scale (FIX-8)", () => {
  it("runs the full heavy pipeline on a large multi-period workspace, correctly and within a generous budget", () => {
    const ASOF = "2026-05-31";
    const PRIOR = "2026-04-30";
    const cur = roster(3000);
    const store = new MemoryStore();
    store.add(snap("employee_master", PRIOR, roster(2900)));
    store.add(snap("employee_master", ASOF, cur));
    for (const s of generateFunctionalDemo(cur, ASOF)) store.add(snap(s.kind, s.asOf, s.rows));
    const active = overviewKpis(cur).active;

    const t0 = Date.now();
    const people = buildPeople(cur, ASOF);
    const all = buildAll(store, { activeHeadcount: active });
    const sc = buildScorecard(store, {}, {});
    const brain = buildBrain(store, {});
    const hist = buildHealthHistory(store, {});
    const rollup = buildEntityRollup({ employeeRows: cur, payrollAggregateRows: store.getLatest("payroll_aggregate")?.rows ?? null, asOf: ASOF });
    const cockpit = buildCockpit({ employeeRows: cur, asOf: ASOF, scope: { by: "department", values: ["Technology"] } });
    const piv = pivotTable(cur, { groupBy: "department", measureField: COUNT_MEASURE, agg: "count" });
    const elapsed = Date.now() - t0;

    // Correct at scale (not just fast).
    expect(people.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(0);
    expect(sc.length).toBeGreaterThan(0);
    expect(brain.health.score).toBeGreaterThanOrEqual(0);
    expect(brain.health.score).toBeLessThanOrEqual(100);
    expect(hist).not.toBeNull(); // two roster months → a health line
    expect(rollup.hasData).toBe(true);
    expect(rollup.kpis.find((k) => k.label === "Legal Entities")?.value).toBe("3");
    expect(cockpit.headcount).toBeGreaterThan(0);
    expect(piv.rows.length).toBe(DEPTS.length);

    // Generous ceiling — the whole pipeline is O(n) over rows; this only trips on a
    // catastrophic (e.g. accidentally O(n^2)) regression, never on machine variance.
    expect(elapsed).toBeLessThan(20000);
  });
});
