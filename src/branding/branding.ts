export type ThemeMode = "light" | "dark";
export type FontKey = "system" | "serif" | "humanist" | "mono";

// Offline-safe font stacks — system families only (no @font-face / web-font fetch),
// so theming a font never breaks the offline promise. The value is ALWAYS one of
// these constants (keyed by a clamped enum), so it can't inject into the stylesheet.
export const FONT_STACKS: Record<FontKey, string> = {
  system: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", "Noto Serif", serif',
  humanist: '"Trebuchet MS", "Segoe UI", Verdana, Geneva, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
};
export const FONT_LABELS: Record<FontKey, string> = { system: "System sans", serif: "Serif", humanist: "Humanist", mono: "Monospace" };

export interface Branding {
  appName: string;
  logoDataUri: string | null;
  primary: string;
  accent: string;
  footer: string;
  theme?: ThemeMode;
  font?: FontKey;
}

export const DEFAULT_BRANDING: Branding = {
  appName: "HR Analytics",
  logoDataUri: null,
  primary: "#1f2937",
  accent: "#2563eb",
  footer: "Generated locally — your data never leaves this browser.",
  theme: "light",
  font: "system",
};

// Clamp an untrusted font value to a known key (never an arbitrary stack).
export function safeFont(v: unknown): FontKey {
  return typeof v === "string" && v in FONT_STACKS ? (v as FontKey) : "system";
}

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
    font: safeFont(b.font),
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
  target.style.setProperty("--brand-font", FONT_STACKS[safeFont(b.font)]);
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
