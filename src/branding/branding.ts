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

// --- Sanitisation of UNTRUSTED branding (loaded workspace / imported theme) ---
// Colours flow into CSS custom properties used in `background`/`color`, some of
// which accept url(). Without an allowlist a crafted theme could set e.g.
// accent: "url(https://evil/beacon)" and the browser would fetch it on render —
// a phone-home that breaks the offline promise. So clamp to safe colour syntaxes
// (hex / rgb[a] / hsl[a] / a bare keyword) and logos to a local data:image URI.
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|[a-zA-Z]{1,24})$/;

export function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && SAFE_COLOR.test(value.trim()) ? value.trim() : fallback;
}

export function safeLogo(uri: unknown): string | null {
  return typeof uri === "string" && /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml|avif);/i.test(uri) ? uri : null;
}

// Clamp every untrusted field of an incoming Branding to a safe value.
export function sanitizeBranding(b: Branding): Branding {
  return {
    ...b,
    primary: safeColor(b.primary, DEFAULT_BRANDING.primary),
    accent: safeColor(b.accent, DEFAULT_BRANDING.accent),
    logoDataUri: safeLogo(b.logoDataUri),
    theme: b.theme === "dark" ? "dark" : "light",
  };
}

interface CssTarget {
  style: { setProperty(k: string, v: string): void };
  setAttribute(k: string, v: string): void;
}

export function applyBranding(b: Branding, target: CssTarget = document.documentElement): void {
  // Defence-in-depth: clamp colours again at the DOM choke point, so even an
  // in-session bad value can never inject a url() into the stylesheet.
  target.style.setProperty("--brand-primary", safeColor(b.primary, DEFAULT_BRANDING.primary));
  target.style.setProperty("--brand-accent", safeColor(b.accent, DEFAULT_BRANDING.accent));
  target.setAttribute("data-theme", b.theme === "dark" ? "dark" : "light");
}

const THEME_FORMAT = "hr-analytics-theme";

export function serializeTheme(b: Branding): string {
  return JSON.stringify({ format: THEME_FORMAT, version: 1, branding: b }, null, 2);
}

export function parseTheme(json: string): Branding {
  const parsed = JSON.parse(json);
  const incoming = (parsed && parsed.branding) || {};
  return sanitizeBranding({ ...DEFAULT_BRANDING, ...incoming });
}
