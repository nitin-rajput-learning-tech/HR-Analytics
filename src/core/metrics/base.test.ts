import { describe, it, expect } from "vitest";
import { rankWatchouts, type MetricWatchout } from "./base";

const w = (severity: MetricWatchout["severity"], title: string): MetricWatchout => ({ severity, title, detail: "" });

describe("rankWatchouts", () => {
  it("orders most-severe first and is stable within a severity", () => {
    const items = [w("low", "a"), w("high", "b"), w("medium", "c"), w("high", "d"), w("low", "e")];
    expect(rankWatchouts(items).map((x) => x.title)).toEqual(["b", "d", "c", "a", "e"]);
  });
  it("caps the count when a limit is given", () => {
    const items = [w("low", "a"), w("high", "b"), w("medium", "c"), w("high", "d")];
    expect(rankWatchouts(items, 2).map((x) => x.title)).toEqual(["b", "d"]);
  });
  it("does not mutate the input", () => {
    const items = [w("low", "a"), w("high", "b")];
    rankWatchouts(items);
    expect(items.map((x) => x.title)).toEqual(["a", "b"]);
  });
});
