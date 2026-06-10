// Shared, presentation-agnostic result types for per-domain metrics.
// Pure data: the dashboard renders charts via Plotly; the newsletter renders the
// same ChartSpec to static HTML. No Plotly/React imports here.

export type ChartKind = "bar" | "barh" | "line" | "pie" | "funnel";

export interface MetricKPI {
  label: string;
  value: string;
  hint?: string;
  delta?: string | null;
  // Sentiment of the delta vs the prior period, for colour only ("good" = green,
  // "bad" = red, "neutral" = muted). Set by the period-comparison decorator.
  deltaTone?: "good" | "bad" | "neutral";
  // Optional historical series (oldest → newest, current value last) for an inline
  // sparkline. Attached by attachKpiSparklines from per-period recomputation; only
  // present when ≥2 comparable points exist. Same unit as `value`.
  spark?: number[];
}

export interface MetricTable {
  title: string;
  caption?: string;
  columns: string[];
  rows: (string | number)[][];
  // Optional drill-down: the People filter field this table's FIRST column maps to
  // (e.g. "department", "reporting_manager"). When set, the UI makes each row
  // clickable to open People Analytics filtered to that value.
  drill?: string;
}

export interface ChartSpec {
  title: string;
  caption?: string;
  kind: ChartKind;
  labels: string[]; // x categories / pie names / funnel stages
  values: number[]; // y values aligned to labels
  drill?: string; // optional filter field a click on a bar/slice maps to (e.g. "department")
}

export interface MetricWatchout {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  actionHint?: string;
  owner?: string;
}

export interface DomainMetrics {
  kind: string;
  label: string;
  hasData: boolean;
  blurb: string;
  kpis: MetricKPI[];
  charts: ChartSpec[];
  tables: MetricTable[];
  watchouts: MetricWatchout[];
}

const SEVERITY_RANK: Record<MetricWatchout["severity"], number> = { high: 3, medium: 2, low: 1 };

// Order watch-outs most-severe first (stable within a severity) and optionally
// cap the count — used to roll per-section watch-outs up into a single
// "needs attention" summary.
export function rankWatchouts(items: MetricWatchout[], limit = Infinity): MetricWatchout[] {
  return [...items].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]).slice(0, limit);
}

// Handles both coerced booleans (true/false — what parseWorkbook produces after
// coerce("boolean", "Y")) and raw "Y"/"N" strings that demo-generated data carries
// because it bypasses the ingest coerce step. Both representations are in the wild.
export const isTruthy = (v: unknown): boolean =>
  v === true || (typeof v === "string" && ["y", "yes", "true", "1"].includes(v.toLowerCase()));

export function emptyDomain(kind: string, label: string, team: string): DomainMetrics {
  return {
    kind,
    label,
    hasData: false,
    blurb:
      `Awaiting the first ${team} data upload. Share the ${team} template from the ` +
      `Data Intake page; this will populate automatically once data is published.`,
    kpis: [],
    charts: [],
    tables: [],
    watchouts: [],
  };
}
