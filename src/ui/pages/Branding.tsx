import React, { useRef } from "react";
import { useApp } from "../state";
import { DEFAULT_BRANDING, serializeTheme, parseTheme, type Branding } from "../../branding/branding";

const PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "Indigo", primary: "#1f2937", accent: "#2563eb" },
  { name: "Emerald", primary: "#064e3b", accent: "#059669" },
  { name: "Violet", primary: "#2e1065", accent: "#7c3aed" },
  { name: "Rose", primary: "#4c0519", accent: "#e11d48" },
  { name: "Amber", primary: "#451a03", accent: "#d97706" },
  { name: "Ocean", primary: "#0f172a", accent: "#0ea5e9" },
];
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const normHex = (v: string) => (v.startsWith("#") ? v : "#" + v);

export function BrandingPage() {
  const { branding, setBranding } = useApp();
  const importRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Branding>) => setBranding({ ...branding, ...patch });

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ logoDataUri: String(reader.result) });
    reader.readAsDataURL(file);
  }
  function exportTheme() {
    const blob = new Blob([serializeTheme(branding)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "brand-theme.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setBranding(parseTheme(String(reader.result)));
      } catch {
        /* ignore malformed theme files */
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="branding">
      <div className="page-head">
        <h2>Branding</h2>
        <p className="page-sub">White-label the app — name, colours, logo and footer. Changes apply instantly and save with the workspace.</p>
      </div>

      <div className="brand-grid">
        <div className="brand-controls">
          <div className="brand-row">
            <label>App name</label>
            <input className="brand-text" value={branding.appName} onChange={(e) => set({ appName: e.target.value })} />
          </div>

          <div className="brand-row">
            <label>Primary colour</label>
            <div className="color-input">
              <input type="color" value={HEX.test(branding.primary) ? branding.primary : "#000000"} onChange={(e) => set({ primary: e.target.value })} />
              <input className="hex" type="text" maxLength={7} placeholder="#1f2937" value={branding.primary} onChange={(e) => set({ primary: normHex(e.target.value) })} />
              {!HEX.test(branding.primary) ? <span className="hex-warn">invalid hex</span> : null}
            </div>
          </div>

          <div className="brand-row">
            <label>Accent colour</label>
            <div className="color-input">
              <input type="color" value={HEX.test(branding.accent) ? branding.accent : "#000000"} onChange={(e) => set({ accent: e.target.value })} />
              <input className="hex" type="text" maxLength={7} placeholder="#2563eb" value={branding.accent} onChange={(e) => set({ accent: normHex(e.target.value) })} />
              {!HEX.test(branding.accent) ? <span className="hex-warn">invalid hex</span> : null}
            </div>
          </div>

          <div className="brand-row">
            <label>Footer text</label>
            <input className="brand-text" value={branding.footer} onChange={(e) => set({ footer: e.target.value })} />
          </div>

          <div className="brand-row">
            <label>Logo</label>
            <div className="logo-picker">
              {branding.logoDataUri ? <img src={branding.logoDataUri} alt="logo" className="logo-preview" /> : <div className="logo-empty">No logo</div>}
              <input type="file" accept="image/*" onChange={onLogo} />
              {branding.logoDataUri ? (
                <button className="link-btn" onClick={() => set({ logoDataUri: null })}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <div className="brand-row">
            <label>Presets</label>
            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p.name} className="preset" title={p.name} onClick={() => set({ primary: p.primary, accent: p.accent })}>
                  <span style={{ background: p.primary }} />
                  <span style={{ background: p.accent }} />
                </button>
              ))}
            </div>
          </div>

          <div className="brand-actions">
            <button onClick={exportTheme}>Export theme</button>
            <button onClick={() => importRef.current?.click()}>Import theme</button>
            <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={onImport} />
            <button className="link-btn" onClick={() => setBranding(DEFAULT_BRANDING)}>
              Reset to default
            </button>
          </div>
        </div>

        <div className="brand-preview">
          <div className="bp-title">Live preview</div>
          <div className="bp-card" style={{ borderTopColor: branding.accent }}>
            {branding.logoDataUri ? <img src={branding.logoDataUri} alt="" className="bp-logo" /> : null}
            <div className="bp-brand" style={{ color: branding.primary }}>{branding.appName || "Your Brand"}</div>
            <div className="bp-tag" style={{ color: branding.accent }}>WORKFORCE ANALYTICS</div>
            <div className="bp-kpi">
              <div className="label">Active Headcount</div>
              <div className="value" style={{ color: branding.primary }}>720</div>
            </div>
            <button className="bp-btn" style={{ background: branding.accent }}>Primary action</button>
            <div className="bp-foot">{branding.footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
