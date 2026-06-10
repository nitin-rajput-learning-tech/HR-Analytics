import { describe, it, expect } from "vitest";
import { parseKpiValue, deltaText, toneFor, decoratePeopleDeltas, decorateDomainDeltas, prettyPeriod, attachKpiSparklines } from "./compare";
import type { PeopleSection } from "./people";
import type { MetricKPI, DomainMetrics } from "./base";

describe("parseKpiValue", () => {
  it("parses grouped counts, percents and tenure", () => {
    expect(parseKpiValue("1,234")).toEqual({ n: 1234, unit: "count" });
    expect(parseKpiValue("135")).toEqual({ n: 135, unit: "count" });
    expect(parseKpiValue("3.4")).toEqual({ n: 3.4, unit: "count" });
    expect(parseKpiValue("90.0%")).toEqual({ n: 90, unit: "pct" });
    expect(parseKpiValue("4.9 yrs")).toEqual({ n: 4.9, unit: "yrs" });
    expect(parseKpiValue("1 yr")).toEqual({ n: 1, unit: "yrs" });
    expect(parseKpiValue("42 days")).toEqual({ n: 42, unit: "days" });
    expect(parseKpiValue("1 day")).toEqual({ n: 1, unit: "days" });
    expect(parseKpiValue("+3")).toEqual({ n: 3, unit: "count" }); // signed counts, e.g. eNPS
    expect(parseKpiValue("-5")).toEqual({ n: -5, unit: "count" });
  });
  it("rejects non-numeric values", () => {
    expect(parseKpiValue("Engineering")).toBeNull();
    expect(parseKpiValue("n/a")).toBeNull();
    expect(parseKpiValue("")).toBeNull();
    expect(parseKpiValue(null)).toBeNull();
    expect(parseKpiValue("₹4.2 Cr")).toBeNull();
  });
});

describe("deltaText", () => {
  it("formats signed deltas per unit", () => {
    expect(deltaText(4, "count")).toBe("▲ +4");
    expect(deltaText(-3, "count")).toBe("▼ −3");
    expect(deltaText(1.2, "pct")).toBe("▲ +1.2pp");
    expect(deltaText(-0.3, "yrs")).toBe("▼ −0.3 yrs");
    expect(deltaText(-6, "days")).toBe("▼ −6 days");
    expect(deltaText(1500, "count")).toBe("▲ +1,500");
  });
});

describe("toneFor", () => {
  it("colours only the unambiguous KPIs", () => {
    expect(toneFor("Active Headcount", "up")).toBe("good");
    expect(toneFor("Active Headcount", "down")).toBe("bad");
    expect(toneFor("Pending Exits", "up")).toBe("bad");
    expect(toneFor("Pending Exits", "down")).toBe("good");
    expect(toneFor("Total Records", "up")).toBe("neutral");
    expect(toneFor("Active Headcount", "flat")).toBe("neutral");
  });
});

function section(key: string, kpis: MetricKPI[]): PeopleSection {
  return {
    key,
    label: key,
    metrics: { kind: key, label: key, hasData: true, blurb: "", kpis, charts: [], tables: [], watchouts: [] },
  };
}

describe("decoratePeopleDeltas", () => {
  const prior = [
    section("overview", [
      { label: "Active Headcount", value: "131" },
      { label: "Pending Exits", value: "2" },
      { label: "Largest Department", value: "Sales" },
      { label: "Avg Tenure (active)", value: "4.6 yrs" },
    ]),
  ];

  it("sets a signed, toned delta on matching numeric KPIs", () => {
    const current = [
      section("overview", [
        { label: "Active Headcount", value: "135" }, // +4, good
        { label: "Pending Exits", value: "5" }, // +3, bad
        { label: "Largest Department", value: "Engineering" }, // text → no delta
        { label: "Avg Tenure (active)", value: "4.9 yrs" }, // +0.3 yrs, good
      ]),
    ];
    const [sec] = decoratePeopleDeltas(current, prior, "Apr 2026");
    const k = Object.fromEntries(sec.metrics.kpis.map((x) => [x.label, x]));
    expect(k["Active Headcount"].delta).toBe("▲ +4 vs Apr 2026");
    expect(k["Active Headcount"].deltaTone).toBe("good");
    expect(k["Pending Exits"].delta).toBe("▲ +3 vs Apr 2026");
    expect(k["Pending Exits"].deltaTone).toBe("bad");
    expect(k["Largest Department"].delta).toBeUndefined();
    expect(k["Avg Tenure (active)"].delta).toBe("▲ +0.3 yrs vs Apr 2026");
    expect(k["Avg Tenure (active)"].deltaTone).toBe("good");
  });

  it("emits 'no change' when a value is unchanged", () => {
    const current = [section("overview", [{ label: "Active Headcount", value: "131" }])];
    const [sec] = decoratePeopleDeltas(current, prior, "Apr 2026");
    expect(sec.metrics.kpis[0].delta).toBe("no change vs Apr 2026");
    expect(sec.metrics.kpis[0].deltaTone).toBe("neutral");
  });

  it("skips when units differ or there is no prior", () => {
    const current = [section("overview", [{ label: "Active Headcount", value: "90.0%" }])];
    expect(decoratePeopleDeltas(current, prior, "Apr 2026")[0].metrics.kpis[0].delta).toBeUndefined();
    expect(decoratePeopleDeltas(current, null, "Apr 2026")[0].metrics.kpis[0].delta).toBeUndefined();
  });
});

function domain(kpis: MetricKPI[]): DomainMetrics {
  return { kind: "talent_acquisition", label: "Talent Acquisition", hasData: true, blurb: "", kpis, charts: [], tables: [], watchouts: [] };
}

describe("decorateDomainDeltas", () => {
  it("diffs functional KPI cards by label, with days + conservative tone", () => {
    const prior = domain([
      { label: "Offer-Accept Rate", value: "70.0%" },
      { label: "Avg Age, Open Reqs", value: "40 days" },
      { label: "Payroll Errors", value: "5" },
      { label: "Cost / Head", value: "₹1.2 L" }, // currency → not comparable → no delta
    ]);
    const current = domain([
      { label: "Offer-Accept Rate", value: "78.0%" }, // +8pp, higher good
      { label: "Avg Age, Open Reqs", value: "34 days" }, // −6 days, lower good
      { label: "Payroll Errors", value: "8" }, // +3, higher bad
      { label: "Cost / Head", value: "₹1.4 L" },
    ]);
    const k = Object.fromEntries(decorateDomainDeltas(current, prior, "Apr 2026").kpis.map((x) => [x.label, x]));
    expect(k["Offer-Accept Rate"].delta).toBe("▲ +8pp vs Apr 2026");
    expect(k["Offer-Accept Rate"].deltaTone).toBe("good");
    expect(k["Avg Age, Open Reqs"].delta).toBe("▼ −6 days vs Apr 2026");
    expect(k["Avg Age, Open Reqs"].deltaTone).toBe("good");
    expect(k["Payroll Errors"].delta).toBe("▲ +3 vs Apr 2026");
    expect(k["Payroll Errors"].deltaTone).toBe("bad");
    expect(k["Cost / Head"].delta).toBeUndefined();
  });

  it("returns the current domain unchanged when there is no prior", () => {
    const current = domain([{ label: "Offer-Accept Rate", value: "78.0%" }]);
    expect(decorateDomainDeltas(current, null, "Apr 2026").kpis[0].delta).toBeUndefined();
  });
});

describe("attachKpiSparklines", () => {
  it("attaches a same-unit series matched by label, current value last", () => {
    const history = [
      [{ label: "Active Headcount", value: "100" }],
      [{ label: "Active Headcount", value: "110" }],
      [{ label: "Active Headcount", value: "120" }],
    ];
    const [k] = attachKpiSparklines([{ label: "Active Headcount", value: "120" }], history);
    expect(k.spark).toEqual([100, 110, 120]);
  });

  it("keeps only points whose unit matches the current value", () => {
    const history = [
      [{ label: "X", value: "5" }], // count
      [{ label: "X", value: "90.0%" }], // pct — dropped (unit mismatch)
      [{ label: "X", value: "7" }], // count
    ];
    expect(attachKpiSparklines([{ label: "X", value: "7" }], history)[0].spark).toEqual([5, 7]);
  });

  it("leaves a KPI bare with <2 comparable points or <2 periods", () => {
    expect(attachKpiSparklines([{ label: "X", value: "7" }], [[{ label: "X", value: "7" }]])[0].spark).toBeUndefined();
    const oneNumeric = [[{ label: "X", value: "n/a" }], [{ label: "X", value: "7" }]];
    expect(attachKpiSparklines([{ label: "X", value: "7" }], oneNumeric)[0].spark).toBeUndefined();
  });

  it("preserves an existing delta/deltaTone while adding the spark", () => {
    const cur: MetricKPI[] = [{ label: "X", value: "7", delta: "▲ +2 vs Apr", deltaTone: "good" }];
    const h = [[{ label: "X", value: "5" }], [{ label: "X", value: "7" }]];
    const [k] = attachKpiSparklines(cur, h);
    expect(k.spark).toEqual([5, 7]);
    expect(k.delta).toBe("▲ +2 vs Apr");
    expect(k.deltaTone).toBe("good");
  });
});

describe("prettyPeriod", () => {
  it("formats ISO dates and passes other labels through", () => {
    expect(prettyPeriod("2026-04-05")).toBe("Apr 2026");
    expect(prettyPeriod("2026-04")).toBe("Apr 2026");
    expect(prettyPeriod("FY26-H1")).toBe("FY26-H1");
    expect(prettyPeriod(null)).toBe("prior period");
    expect(prettyPeriod("")).toBe("prior period");
  });
});
