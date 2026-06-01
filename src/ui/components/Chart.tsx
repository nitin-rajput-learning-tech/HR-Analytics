import { useEffect, useMemo, useRef } from "react";
import Plotly from "plotly.js-dist-min";
import { toPlotly } from "../../core/charts";
import type { ChartSpec } from "../../core/metrics/base";

// Imperative Plotly wrapper. The figure is derived from props during render
// (useMemo) — never in an effect — and Plotly.react diffs against the previous
// figure on update. Plotly.purge runs only on unmount to release the WebGL/DOM
// context. `responsive: true` (set in the charts layer) handles window resizes.
export function Chart({ spec, accent }: { spec: ChartSpec; accent?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const figure = useMemo(() => toPlotly(spec, accent ? { accent } : {}), [spec, accent]);

  // Unmount-only cleanup.
  useEffect(() => {
    const node = ref.current;
    return () => {
      if (node) Plotly.purge(node);
    };
  }, []);

  // Create / update the figure whenever it changes.
  useEffect(() => {
    if (ref.current) {
      void Plotly.react(ref.current, figure.data, figure.layout, figure.config);
    }
  }, [figure]);

  return (
    <figure className="chart">
      <div ref={ref} className="chart-canvas" />
      {spec.caption ? <figcaption>{spec.caption}</figcaption> : null}
    </figure>
  );
}
