// Minimal ambient declaration for the prebuilt Plotly bundle. The dist-min
// package ships no types; we only use the imperative figure API (react/purge),
// so a narrow surface keeps the rest of the app strictly typed. We ship the
// "basic" partial bundle (bar/scatter/pie) to keep the single-file download
// small — the funnel chart is rendered as a horizontal bar (see charts.ts).
declare module "plotly.js-basic-dist-min" {
  type PlotData = Record<string, unknown>;
  type PlotLayout = Record<string, unknown>;
  type PlotConfig = Record<string, unknown>;

  export function newPlot(el: HTMLElement, data: PlotData[], layout?: PlotLayout, config?: PlotConfig): Promise<HTMLElement>;
  export function react(el: HTMLElement, data: PlotData[], layout?: PlotLayout, config?: PlotConfig): Promise<HTMLElement>;
  export function purge(el: HTMLElement): void;
  export function toImage(el: HTMLElement, opts: { format?: string; width?: number; height?: number; scale?: number }): Promise<string>;

  const Plotly: {
    newPlot: typeof newPlot;
    react: typeof react;
    purge: typeof purge;
    toImage: typeof toImage;
  };
  export default Plotly;
}
