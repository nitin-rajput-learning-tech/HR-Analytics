import { describe, it, expect } from "vitest";
import { DEFAULT_BRANDING, applyBranding, serializeTheme, parseTheme, safeColor, safeLogo, sanitizeBranding, type Branding } from "./branding";

describe("branding", () => {
  it("ships a neutral default brand", () => {
    expect(DEFAULT_BRANDING.appName).toBe("HR Analytics");
    expect(DEFAULT_BRANDING.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("applies branding colours + theme to a target element", () => {
    const seen: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    const el = {
      style: { setProperty: (k: string, v: string) => { seen[k] = v; } },
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
    };
    const brand: Branding = { ...DEFAULT_BRANDING, primary: "#123456", accent: "#abcdef", appName: "Acme HR", theme: "dark" };
    applyBranding(brand, el);
    expect(seen["--brand-primary"]).toBe("#123456");
    expect(seen["--brand-accent"]).toBe("#abcdef");
    expect(attrs["data-theme"]).toBe("dark");
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

// --- Security: sanitising UNTRUSTED branding (loaded workspace / theme file) ---
describe("safeColor", () => {
  it("accepts hex, rgb/rgba, hsl/hsla and bare keywords", () => {
    expect(safeColor("#1f2937", "#000")).toBe("#1f2937");
    expect(safeColor("#abc", "#000")).toBe("#abc");
    expect(safeColor("rgb(10, 20, 30)", "#000")).toBe("rgb(10, 20, 30)");
    expect(safeColor("rgba(10,20,30,0.5)", "#000")).toBe("rgba(10,20,30,0.5)");
    expect(safeColor("hsl(200 50% 40%)", "#000")).toBe("hsl(200 50% 40%)");
    expect(safeColor("navy", "#000")).toBe("navy");
  });
  it("rejects url() and CSS-injection payloads, falling back to default", () => {
    expect(safeColor("url(https://evil/beacon)", "#000")).toBe("#000");
    expect(safeColor("red; background: url(https://evil/x)", "#000")).toBe("#000");
    expect(safeColor("#fff} body{display:none}", "#000")).toBe("#000");
    expect(safeColor("expression(alert(1))", "#000")).toBe("#000");
    expect(safeColor("", "#000")).toBe("#000");
    expect(safeColor(null, "#000")).toBe("#000");
    expect(safeColor(123, "#000")).toBe("#000");
  });
});

describe("safeLogo", () => {
  it("accepts local data:image URIs", () => {
    expect(safeLogo("data:image/png;base64,iVBOR")).toBe("data:image/png;base64,iVBOR");
    expect(safeLogo("data:image/svg+xml;utf8,<svg/>")).toBe("data:image/svg+xml;utf8,<svg/>");
  });
  it("rejects remote and non-image URIs (no phone-home)", () => {
    expect(safeLogo("https://evil/logo.png")).toBe(null);
    expect(safeLogo("data:text/html;base64,xxx")).toBe(null);
    expect(safeLogo("javascript:alert(1)")).toBe(null);
    expect(safeLogo(null)).toBe(null);
  });
});

describe("sanitizeBranding", () => {
  it("clamps a malicious branding from an untrusted workspace", () => {
    const evil = {
      appName: "Acme",
      footer: "x",
      primary: "url(https://evil/a)",
      accent: "#2563eb",
      logoDataUri: "https://evil/track.png",
      theme: "weird",
    } as unknown as Branding;
    const clean = sanitizeBranding(evil);
    expect(clean.primary).toBe(DEFAULT_BRANDING.primary); // url() rejected
    expect(clean.accent).toBe("#2563eb"); // valid hex kept
    expect(clean.logoDataUri).toBe(null); // remote logo rejected
    expect(clean.theme).toBe("light"); // unknown theme clamped
    expect(clean.appName).toBe("Acme"); // text passes through (React-escaped at render)
  });
  it("parseTheme sanitises an imported theme", () => {
    const b = parseTheme(JSON.stringify({ branding: { primary: "url(https://evil/x)", accent: "#059669" } }));
    expect(b.primary).toBe(DEFAULT_BRANDING.primary);
    expect(b.accent).toBe("#059669");
  });
});

describe("applyBranding (defence-in-depth)", () => {
  it("never writes an unsafe colour into the CSS target", () => {
    const props: Record<string, string> = {};
    const target = { style: { setProperty: (k: string, v: string) => { props[k] = v; } }, setAttribute: () => {} };
    applyBranding({ ...DEFAULT_BRANDING, accent: "url(https://evil/x)" }, target);
    expect(props["--brand-accent"]).toBe(DEFAULT_BRANDING.accent);
    expect(props["--brand-accent"].includes("url(")).toBe(false);
  });
});
