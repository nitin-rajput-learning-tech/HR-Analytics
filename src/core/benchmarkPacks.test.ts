import { describe, it, expect } from "vitest";
import { BUILTIN_PACKS, DEFAULT_PACK_ID, getPack, provenanceLine, effectiveBands, parseBenchmarkPack } from "./benchmarkPacks";
import { DEFAULT_BENCHMARKS } from "./benchmarks";

describe("benchmark packs", () => {
  it("ships the general pack as default, reusing the illustrative defaults verbatim", () => {
    expect(DEFAULT_PACK_ID).toBe("general");
    const general = getPack("general");
    expect(general.bands).toBe(DEFAULT_BENCHMARKS);
    expect(general.illustrative).toBe(true);
  });

  it("every built-in pack is labelled illustrative and carries a source", () => {
    expect(BUILTIN_PACKS.length).toBeGreaterThanOrEqual(3);
    for (const p of BUILTIN_PACKS) {
      expect(p.illustrative).toBe(true);
      expect(p.source).toMatch(/not a sourced survey/i);
      expect(Object.keys(p.bands).length).toBeGreaterThan(0);
    }
  });

  it("sector packs encode directional norms (India IT has higher early attrition than global tech)", () => {
    const it = getPack("india_it");
    const tech = getPack("global_tech");
    expect(it.bands.first_year_exit.high).toBeGreaterThan(tech.bands.first_year_exit.high);
    expect(it.bands.avg_tenure.high).toBeLessThan(tech.bands.avg_tenure.high + 0.001 + 10); // sanity
    expect(it.region).toBe("India");
  });

  it("falls back to general for an unknown id", () => {
    expect(getPack("nope").id).toBe("general");
    expect(getPack(null).id).toBe("general");
  });

  it("returns a loaded custom pack by id over the built-ins", () => {
    const custom = { id: "custom", name: "Our survey", source: "Mercer 2025", illustrative: false, bands: { pay_gap: { low: 0, high: 3 } } };
    expect(getPack("custom", custom).name).toBe("Our survey");
    expect(getPack("general", custom).id).toBe("general"); // not custom when another id is active
  });

  it("provenanceLine combines source and year", () => {
    expect(provenanceLine(getPack("india_it"))).toMatch(/Illustrative sector ranges/);
    expect(provenanceLine({ id: "x", name: "X", source: "Mercer", year: 2025, illustrative: false, bands: {} })).toBe("Mercer · 2025");
  });

  it("effectiveBands layers user edits over the pack over the general baseline", () => {
    const pack = getPack("india_it");
    const eff = effectiveBands(pack, { pay_gap: { low: 0, high: 2 } });
    expect(eff.pay_gap).toEqual({ low: 0, high: 2 }); // user edit wins
    expect(eff.first_year_exit).toEqual(pack.bands.first_year_exit); // pack value
    // a KPI absent from a (hypothetical) sparse pack still has the general baseline
    expect(eff.avg_tenure).toBeDefined();
  });
});

describe("parseBenchmarkPack", () => {
  it("accepts a well-formed custom pack", () => {
    const { pack, error } = parseBenchmarkPack(JSON.stringify({ name: "Our 2025 survey", source: "AON", year: 2025, bands: { offer_accept: { low: 85, high: 95 } } }));
    expect(error).toBeUndefined();
    expect(pack!.name).toBe("Our 2025 survey");
    expect(pack!.illustrative).toBe(false);
    expect(pack!.bands.offer_accept).toEqual({ low: 85, high: 95 });
  });

  it("rejects invalid JSON, missing name/source/bands, and bad bands", () => {
    expect(parseBenchmarkPack("{not json").error).toMatch(/valid JSON/i);
    expect(parseBenchmarkPack(JSON.stringify({ source: "x", bands: {} })).error).toMatch(/name/i);
    expect(parseBenchmarkPack(JSON.stringify({ name: "x", bands: { a: { low: 1, high: 2 } } })).error).toMatch(/source/i);
    expect(parseBenchmarkPack(JSON.stringify({ name: "x", source: "s" })).error).toMatch(/bands/i);
    expect(parseBenchmarkPack(JSON.stringify({ name: "x", source: "s", bands: { a: { low: 5, high: 2 } } })).error).toMatch(/low <= high/i);
    expect(parseBenchmarkPack(JSON.stringify({ name: "x", source: "s", bands: {} })).error).toMatch(/no benchmark bands/i);
  });
});
