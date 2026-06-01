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

function baseLayout(spec: ChartSpec, colors: ChartColors): Record<string, unknown> {
  return {
    title: { text: spec.title, font: { size: 15, color: colors.primary } },
    margin: { l: 60, r: 20, t: 46, b: 44 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: FONT, color: colors.primary, size: 12 },
    showlegend: false,
    autosize: true,
  };
}

export function toPlotly(spec: ChartSpec, brand: Partial<ChartColors> = {}): PlotlyFigure {
  const colors: ChartColors = { ...DEFAULT_COLORS, ...brand };
  const series = seriesPalette(colors.accent);
  const config = { displayModeBar: false, responsive: true };
  const layout = baseLayout(spec, colors);

  switch (spec.kind) {
    case "bar":
      return {
        data: [{ type: "bar", x: spec.labels, y: spec.values, marker: { color: colors.accent } }],
        layout: { ...layout, xaxis: { automargin: true }, yaxis: { gridcolor: GRID, zeroline: false } },
        config,
      };
    case "barh":
      return {
        data: [{ type: "bar", orientation: "h", y: spec.labels, x: spec.values, marker: { color: colors.accent } }],
        // autorange reversed -> first (largest, since metrics sort desc) sits on top.
        layout: { ...layout, yaxis: { automargin: true, autorange: "reversed" }, xaxis: { gridcolor: GRID, zeroline: false } },
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
        layout: { ...layout, xaxis: { automargin: true }, yaxis: { gridcolor: GRID, zeroline: false } },
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
