export type ThemeMode = "light" | "dark";

export interface Branding {
  appName: string;
  logoDataUri: string | null;
  primary: string;
  accent: string;
  footer: string;
  theme?: ThemeMode;
}

export const DEFAULT_BRANDING: Branding = {
  appName: "HR Analytics",
  logoDataUri: null,
  primary: "#1f2937",
  accent: "#2563eb",
  footer: "Generated locally — your data never leaves this browser.",
  theme: "light",
};

interface CssTarget {
  style: { setProperty(k: string, v: string): void };
  setAttribute(k: string, v: string): void;
}

export function applyBranding(b: Branding, target: CssTarget = document.documentElement): void {
  target.style.setProperty("--brand-primary", b.primary);
  target.style.setProperty("--brand-accent", b.accent);
  target.setAttribute("data-theme", b.theme === "dark" ? "dark" : "light");
}

const THEME_FORMAT = "hr-analytics-theme";

export function serializeTheme(b: Branding): string {
  return JSON.stringify({ format: THEME_FORMAT, version: 1, branding: b }, null, 2);
}

export function parseTheme(json: string): Branding {
  const parsed = JSON.parse(json);
  const incoming = (parsed && parsed.branding) || {};
  return { ...DEFAULT_BRANDING, ...incoming };
}
