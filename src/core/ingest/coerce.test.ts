import { describe, it, expect } from "vitest";
import { coerce } from "./coerce";

describe("coerce", () => {
  it("parses integers and numbers, stripping commas/currency", () => {
    expect(coerce("integer", "1,200")).toBe(1200);
    expect(coerce("number", "45,000.50")).toBeCloseTo(45000.5);
    expect(coerce("integer", "")).toBeNull();
  });
  it("parses booleans from Y/N/true/false", () => {
    expect(coerce("boolean", "Y")).toBe(true);
    expect(coerce("boolean", "no")).toBe(false);
    expect(coerce("boolean", "")).toBeNull();
  });
  it("parses dates to ISO yyyy-mm-dd", () => {
    expect(coerce("date", new Date(Date.UTC(2026, 4, 31)))).toBe("2026-05-31");
    expect(coerce("date", "2026-04-01")).toBe("2026-04-01");
    expect(coerce("date", "nonsense")).toBeNull();
  });
  it("trims strings and returns null for blank", () => {
    expect(coerce("string", "  hi ")).toBe("hi");
    expect(coerce("string", "   ")).toBeNull();
  });
});
