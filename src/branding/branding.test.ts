import { describe, it, expect } from "vitest";
import { DEFAULT_BRANDING, applyBranding, serializeTheme, parseTheme, type Branding } from "./branding";

describe("branding", () => {
  it("ships a neutral default brand", () => {
    expect(DEFAULT_BRANDING.appName).toBe("HR Analytics");
    expect(DEFAULT_BRANDING.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("applies branding to CSS variables on a target element", () => {
    const seen: Record<string, string> = {};
    const el = { style: { setProperty: (k: string, v: string) => { seen[k] = v; } } };
    const brand: Branding = { ...DEFAULT_BRANDING, primary: "#123456", accent: "#abcdef", appName: "Acme HR" };
    applyBranding(brand, el);
    expect(seen["--brand-primary"]).toBe("#123456");
    expect(seen["--brand-accent"]).toBe("#abcdef");
  });

  it("round-trips a theme file (export then import)", () => {
    const brand: Branding = { ...DEFAULT_BRANDING, appName: "Acme", footer: "(c) Acme" };
    expect(parseTheme(serializeTheme(brand))).toEqual(brand);
  });

  it("parseTheme fills missing fields from defaults", () => {
    const back = parseTheme(JSON.stringify({ format: "hr-analytics-theme", version: 1, branding: { appName: "Only Name" } }));
    expect(back.appName).toBe("Only Name");
    expect(back.primary).toBe(DEFAULT_BRANDING.primary);
  });
});
