import { useEffect, useMemo, useRef } from "react";
import Plotly from "plotly.js-basic-dist-min";
import { toPlotly } from "../../core/charts";
import type { ChartSpec } from "../../core/metrics/base";

// Imperative Plotly wrapper. The figure is derived from props during render
// (useMemo) — never in an effect — and Plotly.react diffs against the previous
// figure on update. Plotly.purge runs only on unmount. When the spec carries a
// `drill` field and an onDrill handler is supplied, a click on a bar/slice maps
// the clicked label to that filter field (drill-down). `responsive: true` (set
// in the charts layer) handles window resizes.
export function Chart({
  spec,
  accent,
  dark,
  onDrill,
}: {
  spec: ChartSpec;
  accent?: string;
  dark?: boolean;
  onDrill?: (field: string, label: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const figure = useMemo(() => toPlotly(spec, { ...(accent ? { accent } : {}), dark }), [spec, accent, dark]);
  // Latest handler via ref so the (stable) click listener always calls current.
  const drillRef = useRef(onDrill);
  drillRef.current = onDrill;

  // Unmount-only cleanup.
  useEffect(() => {
    const node = ref.current;
    return () => {
      if (node) Plotly.purge(node);
    };
  }, []);

  // Create / update the figure whenever it changes; (re)wire the click handler.
  useEffect(() => {
    const node = ref.current as (HTMLDivElement & { on?: Function; removeAllListeners?: Function }) | null;
    if (!node) return;
    void Plotly.react(node, figure.data, figure.layout, figure.config).then(() => {
      if (!spec.drill) return;
      node.removeAllListeners?.("plotly_click");
      node.on?.("plotly_click", (ev: { points?: Array<Record<string, unknown>> }) => {
        const p = ev?.points?.[0];
        if (!p) return;
        const label = spec.kind === "pie" ? p.label : spec.kind === "barh" ? p.y : p.x;
        if (label != null && drillRef.current) drillRef.current(spec.drill as string, String(label));
      });
    });
  }, [figure, spec.drill, spec.kind]);

  function downloadPng() {
    if (!ref.current) return;
    void Plotly.toImage(ref.current, { format: "png", scale: 2 }).then((url) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = (spec.title || "chart").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".png";
      a.click();
    });
  }

  return (
    <figure className={spec.drill && onDrill ? "chart drillable" : "chart"}>
      <button className="chart-dl no-print" title="Download PNG" onClick={downloadPng}>
        PNG
      </button>
      <div ref={ref} className="chart-canvas" />
      {spec.caption ? (
        <figcaption>
          {spec.caption}
          {spec.drill && onDrill ? " · click to filter" : ""}
        </figcaption>
      ) : null}
    </figure>
  );
}
