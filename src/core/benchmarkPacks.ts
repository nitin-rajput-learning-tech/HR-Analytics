// BUILD-7 — loadable benchmark packs. The scorecard's "typical" band can be driven
// by a chosen reference pack instead of one hard-coded set, and an org can load its
// OWN sourced pack (e.g. a Mercer / AON / internal survey) so the comparison is real
// and attributed. Per-KPI user edits still layer on top of whichever pack is active.
//
// HONESTY: the built-in packs are ILLUSTRATIVE, sector-flavoured reference ranges —
// NOT a sourced survey. They're a starting point; the provenance fields exist so a
// loaded custom pack can carry its real source, year and caveats onto the scorecard.
// Pure + offline — no external benchmark service.

import { DEFAULT_BENCHMARKS, type BenchmarkBand } from "./benchmarks";

export interface BenchmarkPack {
  id: string;
  name: string;
  region?: string;
  industry?: string;
  source: string; // provenance — where these numbers came from
  year?: number;
  note?: string; // caveats / scope
  illustrative: boolean; // true for the built-ins (not a sourced survey)
  bands: Record<string, BenchmarkBand>;
}

// The general pack reuses the existing illustrative defaults verbatim, so there is a
// single source of truth for the baseline ranges.
const GENERAL: BenchmarkPack = {
  id: "general",
  name: "General (illustrative)",
  source: "Illustrative general reference ranges (not a sourced survey)",
  illustrative: true,
  note: "A neutral starting point. Pick a sector pack below, or load your own sourced pack for real comparisons.",
  bands: DEFAULT_BENCHMARKS,
};

// Sector-flavoured illustrative packs. The differences encode well-known directional
// norms (e.g. higher early attrition and shorter tenure in Indian IT services), NOT
// survey figures — every one is labelled illustrative.
const INDIA_IT: BenchmarkPack = {
  id: "india_it",
  name: "India · IT / ITeS (illustrative)",
  region: "India",
  industry: "IT / ITeS",
  source: "Illustrative sector ranges (not a sourced survey)",
  illustrative: true,
  note: "Reflects higher churn and shorter tenure typical of Indian IT services. Adjust to your own data.",
  bands: {
    offer_accept: { low: 70, high: 85 },
    review_completion: { low: 85, high: 100 },
    statutory_ontime: { low: 98, high: 100 },
    ld_coverage: { low: 65, high: 90 },
    pay_gap: { low: 0, high: 10 },
    first_year_exit: { low: 15, high: 28 },
    avg_tenure: { low: 2, high: 3.5 },
    org_layers: { low: 5, high: 8 },
  },
};

const INDIA_BFSI: BenchmarkPack = {
  id: "india_bfsi",
  name: "India · BFSI (illustrative)",
  region: "India",
  industry: "Banking / Financial Services / Insurance",
  source: "Illustrative sector ranges (not a sourced survey)",
  illustrative: true,
  note: "Reflects a compliance-heavy, more tenured workforce. Adjust to your own data.",
  bands: {
    offer_accept: { low: 78, high: 88 },
    review_completion: { low: 90, high: 100 },
    statutory_ontime: { low: 99, high: 100 },
    ld_coverage: { low: 70, high: 90 },
    pay_gap: { low: 0, high: 8 },
    first_year_exit: { low: 12, high: 22 },
    avg_tenure: { low: 3, high: 6 },
    org_layers: { low: 5, high: 9 },
  },
};

const GLOBAL_TECH: BenchmarkPack = {
  id: "global_tech",
  name: "Global · Technology (illustrative)",
  industry: "Technology",
  source: "Illustrative sector ranges (not a sourced survey)",
  illustrative: true,
  note: "Reflects strong L&D and pay-equity discipline typical of global tech. Adjust to your own data.",
  bands: {
    offer_accept: { low: 82, high: 92 },
    review_completion: { low: 88, high: 100 },
    statutory_ontime: { low: 98, high: 100 },
    ld_coverage: { low: 70, high: 90 },
    pay_gap: { low: 0, high: 6 },
    first_year_exit: { low: 8, high: 16 },
    avg_tenure: { low: 2.5, high: 4.5 },
    org_layers: { low: 4, high: 6 },
  },
};

export const BUILTIN_PACKS: BenchmarkPack[] = [GENERAL, INDIA_IT, INDIA_BFSI, GLOBAL_TECH];
export const DEFAULT_PACK_ID = "general";

export function getPack(id: string | null | undefined, custom?: BenchmarkPack | null): BenchmarkPack {
  if (custom && id === custom.id) return custom;
  return BUILTIN_PACKS.find((p) => p.id === id) ?? GENERAL;
}

// One-line provenance for display on the scorecard.
export function provenanceLine(pack: BenchmarkPack): string {
  const bits = [pack.source];
  if (pack.year) bits.push(String(pack.year));
  return bits.join(" · ");
}

// Effective bands for a chosen pack with the user's per-KPI edits layered on top.
// Edits win; KPIs absent from the pack fall back to the general baseline downstream
// (buildScorecard already defaults to DEFAULT_BENCHMARKS for unmapped ids).
export function effectiveBands(pack: BenchmarkPack, overrides: Record<string, BenchmarkBand> = {}): Record<string, BenchmarkBand> {
  return { ...DEFAULT_BENCHMARKS, ...pack.bands, ...overrides };
}

const isBand = (v: unknown): v is BenchmarkBand => {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return typeof b.low === "number" && typeof b.high === "number" && Number.isFinite(b.low) && Number.isFinite(b.high) && b.low <= b.high;
};

// Validate + parse a user-supplied custom pack (JSON text from a file). Returns the
// pack or a human-readable error. Tolerant of extra fields; strict on the essentials
// so a bad file can't silently produce nonsense bands.
export function parseBenchmarkPack(text: string): { pack?: BenchmarkPack; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "Not valid JSON." };
  }
  if (!raw || typeof raw !== "object") return { error: "Expected a JSON object." };
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return { error: "Pack is missing a \"name\"." };
  const source = typeof o.source === "string" && o.source.trim() ? o.source.trim() : "";
  if (!source) return { error: "Pack is missing a \"source\" (provenance is required for a custom pack)." };
  if (!o.bands || typeof o.bands !== "object") return { error: "Pack is missing a \"bands\" object." };
  const bands: Record<string, BenchmarkBand> = {};
  for (const [k, v] of Object.entries(o.bands as Record<string, unknown>)) {
    if (!isBand(v)) return { error: `Band "${k}" must be { low, high } numbers with low <= high.` };
    bands[k] = { low: (v as BenchmarkBand).low, high: (v as BenchmarkBand).high };
  }
  if (Object.keys(bands).length === 0) return { error: "Pack has no benchmark bands." };
  return {
    pack: {
      id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : "custom",
      name,
      region: typeof o.region === "string" ? o.region : undefined,
      industry: typeof o.industry === "string" ? o.industry : undefined,
      source,
      year: typeof o.year === "number" && Number.isFinite(o.year) ? o.year : undefined,
      note: typeof o.note === "string" ? o.note : undefined,
      illustrative: o.illustrative === true,
      bands,
    },
  };
}
