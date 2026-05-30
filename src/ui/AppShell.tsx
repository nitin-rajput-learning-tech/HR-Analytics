import React, { useState } from "react";
import "./theme.css";
import { useApp } from "./state";
import { Overview } from "./pages/Overview";
import { DataIntake } from "./pages/DataIntake";
import { BrandingPage } from "./pages/Branding";
import { saveWorkspace, loadWorkspace } from "../workspace/workspace";

const PAGES = ["Overview", "Data Intake", "Branding"] as const;
type Page = (typeof PAGES)[number];

export function AppShell() {
  const app = useApp();
  const [page, setPage] = useState<Page>("Overview");

  function onSave() {
    const bytes = saveWorkspace(app.store, app.branding, new Date().toISOString());
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/gzip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hr-workspace.json.gz";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { store, branding } = loadWorkspace(new Uint8Array(await file.arrayBuffer()));
    app.setStore(store);
    app.setBranding(branding);
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brandbar">{app.branding.appName}</div>
        {app.branding.logoDataUri && (
          <img src={app.branding.logoDataUri} alt="" style={{ height: 32, margin: "8px 0" }} />
        )}
        {PAGES.map((p) => (
          <a
            key={p}
            className={p === page ? "active" : ""}
            href="#"
            onClick={(ev) => {
              ev.preventDefault();
              setPage(p);
            }}
          >
            {p}
          </a>
        ))}
        <hr />
        <button className="primary" onClick={onSave}>
          Save workspace
        </button>
        <div style={{ marginTop: 8 }}>
          <label>
            Load workspace
            <br />
            <input type="file" accept=".gz,.json" onChange={onLoad} />
          </label>
        </div>
      </nav>
      <main className="content">
        {page === "Overview" && <Overview />}
        {page === "Data Intake" && <DataIntake />}
        {page === "Branding" && <BrandingPage />}
        <footer style={{ marginTop: 32, color: "#667085", fontSize: ".82rem" }}>{app.branding.footer}</footer>
      </main>
    </div>
  );
}
