import { sparklineGeometry } from "../../core/metrics/timeseries";

// Tiny inline trend line for a KPI card — "where this number has been", at a glance.
// Pure SVG, no deps; colour follows the theme accent (currentColor). Deliberately
// not coloured green/red by direction: "higher" isn't always "better" across KPIs,
// and the delta chip already carries the good/bad sentiment. Renders nothing for
// fewer than two points.
export function Sparkline({ values, label }: { values: number[]; label?: string }) {
  const w = 64;
  const h = 18;
  const g = sparklineGeometry(values, w, h, 2);
  if (!g.line) return null;
  const title = `${label ? label + " — " : ""}${values.length}-period trend (${g.rising ? "up" : "down"} overall)`;
  return (
    <svg
      className="spark"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <path d={g.line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={g.lastX} cy={g.lastY} r="1.7" fill="currentColor" />
    </svg>
  );
}
