// Peer benchmarking — the "how do we compare?" lens on the scorecard. Each headline
// KPI gets a typical industry reference band; the org's value is then placed
// relative to it (better / typical / worse than typical, direction-aware).
//
// IMPORTANT: these are ILLUSTRATIVE general reference ranges, not a sourced
// benchmark survey. They're a starting point to adjust for your sector/region.
// Pure + offline — no external benchmark service.

export interface BenchmarkBand {
  low: number;
  high: number;
}

// Keyed by scorecard KPI id (see scorecard DEFS). Units match the KPI.
export const DEFAULT_BENCHMARKS: Record<string, BenchmarkBand> = {
  offer_accept: { low: 80, high: 90 }, // % — accepted offers
  review_completion: { low: 85, high: 100 }, // %
  statutory_ontime: { low: 98, high: 100 }, // %
  ld_coverage: { low: 60, high: 85 }, // % of staff trained
  pay_gap: { low: 0, high: 8 }, // % gender pay gap (lower better)
  first_year_exit: { low: 10, high: 20 }, // % of exits within first year (lower better)
  avg_tenure: { low: 2.5, high: 5 }, // years
  org_layers: { low: 4, high: 7 }, // reporting layers (lower better)
};

export type BenchPos = "better" | "typical" | "worse" | "none";

// Where a value sits relative to its typical band. Direction-aware: for a
// lower-is-better KPI (pay gap, attrition), being below the band is "better".
export function benchmarkPosition(value: number | null, band: BenchmarkBand | undefined, higherIsBetter: boolean): BenchPos {
  if (value === null || !band) return "none";
  if (value >= band.low && value <= band.high) return "typical";
  const aboveHigh = value > band.high;
  return higherIsBetter ? (aboveHigh ? "better" : "worse") : aboveHigh ? "worse" : "better";
}

export function formatBand(band: BenchmarkBand | undefined, unit: string): string {
  if (!band) return "—";
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const suffix = unit === "%" ? "%" : unit === "yrs" ? " yrs" : "";
  return `${f(band.low)}–${f(band.high)}${suffix}`;
}

export const BENCH_LABEL: Record<BenchPos, string> = {
  better: "Better than typical",
  typical: "Typical",
  worse: "Worse than typical",
  none: "—",
};
