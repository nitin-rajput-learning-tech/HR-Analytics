import { describe, it, expect } from "vitest";
import { parseKpiValue, deltaText, toneFor, decoratePeopleDeltas } from "./compare";
import type { PeopleSection } from "./people";
import type { MetricKPI } from "./base";

describe("parseKpiValue", () => {
  it("parses grouped counts, percents and tenure", () => {
    expect(parseKpiValue("1,234")).toEqual({ n: 1234, unit: "count" });
    expect(parseKpiValue("135")).toEqual({ n: 135, unit: "count" });
    expect(parseKpiValue("3.4")).toEqual({ n: 3.4, unit: "count" });
    expect(parseKpiValue("90.0%")).toEqual({ n: 90, unit: "pct" });
    expect(parseKpiValue("4.9 yrs")).toEqual({ n: 4.9, unit: "yrs" });
    expect(parseKpiValue("1 yr")).toEqual({ n: 1, unit: "yrs" });
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
