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
}

export interface MetricTable {
  title: string;
  caption?: string;
  columns: string[];
  rows: (string | number)[][];
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
