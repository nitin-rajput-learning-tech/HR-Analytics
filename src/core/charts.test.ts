import { describe, it, expect } from "vitest";
import { toPlotly } from "./charts";
import type { ChartSpec } from "./metrics/base";

const spec = (kind: ChartSpec["kind"]): ChartSpec => ({
  title: "T-" + kind,
  caption: "c",
  kind,
  labels: ["A", "B", "C"],
  values: [3, 2, 1],
});
const ACCENT = "#ff0000";

describe("toPlotly", () => {
  it("renders a vertical bar in the brand accent with no modebar", () => {
    const f = toPlotly(spec("bar"), { accent: ACCENT });
    expect(f.data[0].type).toBe("bar");
    expect(f.data[0].orientation).toBeUndefined();
    expect((f.data[0].marker as { color: string }).color).toBe(ACCENT);
    expect((f.layout.title as { text: string }).text).toBe("T-bar");
    expect(f.config.displayModeBar).toBe(false);
  });

  it("renders barh horizontally with a reversed y-axis", () => {
    const f = toPlotly(spec("barh"), { accent: ACCENT });
    expect(f.data[0].orientation).toBe("h");
    expect((f.layout.yaxis as { autorange: string }).autorange).toBe("reversed");
  });

  it("renders a line as a scatter with lines+markers", () => {
    const f = toPlotly(spec("line"), { accent: ACCENT });
    expect(f.data[0].type).toBe("scatter");
    expect(f.data[0].mode).toBe("lines+markers");
  });

  it("renders a donut pie that leads with the brand accent and keeps order", () => {
    const f = toPlotly(spec("pie"), { accent: ACCENT });
    expect(f.data[0].type).toBe("pie");
    expect(f.data[0].hole).toBe(0.5);
    expect((f.data[0].marker as { colors: string[] }).colors[0]).toBe(ACCENT);
    expect(f.data[0].sort).toBe(false);
  });

  it("renders a funnel trace", () => {
    const f = toPlotly(spec("funnel"), { accent: ACCENT });
    expect(f.data[0].type).toBe("funnel");
  });

  it("falls back to default colors when no brand is supplied", () => {
    const f = toPlotly(spec("bar"));
    expect((f.data[0].marker as { color: string }).color).toBe("#2563eb");
  });
});
