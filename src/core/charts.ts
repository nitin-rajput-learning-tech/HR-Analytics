// ChartSpec -> Plotly figure. Presentation layer for the pure ChartSpec data
// emitted by the metrics modules. Brand-aware (seeded by the brand accent) and
// used by BOTH the interactive dashboards and the newsletter (which snapshots
// figures to static images via Plotly.toImage at export time).

import type { ChartSpec } from "./metrics/base";

export interface PlotlyFigure {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface ChartColors {
  primary: string;
  accent: string;
}

const DEFAULT_COLORS: ChartColors = { primary: "#1f2937", accent: "#2563eb" };
const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const GRID = "rgba(15,23,42,0.08)";

// Stable categorical hues for multi-series charts (pie/funnel). The brand accent
// always leads so the chart reads as "ours"; the rest are fixed for consistency.
const SERIES_BASE = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function seriesPalette(accent: string): string[] {
  const rest = SERIES_BASE.filter((c) => c.toLowerCase() !== accent.toLowerCase());
  return [accent, ...rest];
}

function baseLayout(spec: ChartSpec, text: string): Record<string, unknown> {
  return {
    title: { text: spec.title, font: { size: 15, color: text } },
    margin: { l: 60, r: 20, t: 46, b: 44 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: FONT, color: text, size: 12 },
    showlegend: false,
    autosize: true,
  };
}

export function toPlotly(spec: ChartSpec, brand: Partial<ChartColors> & { dark?: boolean } = {}): PlotlyFigure {
  const colors: ChartColors = {
    primary: brand.primary ?? DEFAULT_COLORS.primary,
    accent: brand.accent ?? DEFAULT_COLORS.accent,
  };
  // On a dark background the brand primary (often a dark navy) is unreadable, so
  // chart text + grid switch to light variants.
  const text = brand.dark ? "#e6ebf4" : colors.primary;
  const grid = brand.dark ? "rgba(148,163,184,0.18)" : GRID;
  const series = seriesPalette(colors.accent);
  const config = { displayModeBar: false, responsive: true };
  const layout = baseLayout(spec, text);

  switch (spec.kind) {
    case "bar":
      return {
        data: [{ type: "bar", x: spec.labels, y: spec.values, marker: { color: colors.accent } }],
        layout: { ...layout, xaxis: { automargin: true }, yaxis: { gridcolor: grid, zeroline: false } },
        config,
      };
    case "barh":
      return {
        data: [{ type: "bar", orientation: "h", y: spec.labels, x: spec.values, marker: { color: colors.accent } }],
        // autorange reversed -> first (largest, since metrics sort desc) sits on top.
        layout: { ...layout, yaxis: { automargin: true, autorange: "reversed" }, xaxis: { gridcolor: grid, zeroline: false } },
        config,
      };
    case "line":
      return {
        data: [
          {
            type: "scatter",
            mode: "lines+markers",
            x: spec.labels,
            y: spec.values,
            line: { color: colors.accent, width: 2 },
            marker: { color: colors.accent, size: 6 },
          },
        ],
        layout: { ...layout, xaxis: { automargin: true }, yaxis: { gridcolor: grid, zeroline: false } },
        config,
      };
    case "pie":
      return {
        data: [
          {
            type: "pie",
            labels: spec.labels,
            values: spec.values,
            hole: 0.5,
            marker: { colors: series },
            textinfo: "label+percent",
            sort: false,
            automargin: true,
          },
        ],
        layout,
        config,
      };
    case "funnel":
      return {
        data: [{ type: "funnel", y: spec.labels, x: spec.values, marker: { color: series } }],
        layout: { ...layout, yaxis: { automargin: true } },
        config,
      };
  }
}
