import React from "react";
import { useApp } from "../state";

export function BrandingPage() {
  const { branding, setBranding } = useApp();

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBranding({ ...branding, logoDataUri: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <h2>Branding</h2>
      <p>
        <label>
          App name{" "}
          <input value={branding.appName} onChange={(e) => setBranding({ ...branding, appName: e.target.value })} />
        </label>
      </p>
      <p>
        <label>
          Primary colour{" "}
          <input type="color" value={branding.primary} onChange={(e) => setBranding({ ...branding, primary: e.target.value })} />
        </label>
      </p>
      <p>
        <label>
          Accent colour{" "}
          <input type="color" value={branding.accent} onChange={(e) => setBranding({ ...branding, accent: e.target.value })} />
        </label>
      </p>
      <p>
        <label>
          Logo <input type="file" accept="image/*" onChange={onLogo} />
        </label>
      </p>
      {branding.logoDataUri && <img src={branding.logoDataUri} alt="logo" style={{ height: 40 }} />}
    </div>
  );
}
