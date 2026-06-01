import React from "react";
import "./theme.css";
import { useApp } from "./state";
import { People } from "./pages/People";
import { Directory } from "./pages/Directory";
import { FunctionAnalytics } from "./pages/FunctionAnalytics";
import { Reports } from "./pages/Reports";
import { DataIntake } from "./pages/DataIntake";
import { BrandingPage } from "./pages/Branding";
import { saveWorkspace, loadWorkspace } from "../workspace/workspace";

const PAGES = ["People Analytics", "Directory", "Function Analytics", "Newsletter", "Data Intake", "Branding"] as const;
type Page = (typeof PAGES)[number];

export function AppShell() {
  const app = useApp();
  const page = app.page as Page;
  const setPage = app.setPage;

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
      <nav className="sidebar no-print">
        <div className="brandbar">{app.branding.appName}</div>
        {app.branding.logoDataUri ? <img src={app.branding.logoDataUri} alt="" style={{ height: 30, margin: "8px 6px" }} /> : null}
        <div className="nav">
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
              <span className="dot" />
              {p}
            </a>
          ))}
        </div>
        <div className="side-foot">
          <hr />
          <div className="muted-label">Workspace</div>
          <button className="primary" style={{ width: "100%", marginTop: 6 }} onClick={onSave}>
            Save workspace
          </button>
          <label style={{ marginTop: 10, fontSize: ".8rem", color: "var(--muted)" }}>
            Load workspace
            <br />
            <input type="file" accept=".gz,.json" onChange={onLoad} style={{ marginTop: 4, fontSize: ".78rem" }} />
          </label>
        </div>
      </nav>
      <main className="content">
        {page === "People Analytics" && <People />}
        {page === "Directory" && <Directory />}
        {page === "Function Analytics" && <FunctionAnalytics />}
        {page === "Newsletter" && <Reports />}
        {page === "Data Intake" && <DataIntake />}
        {page === "Branding" && <BrandingPage />}
        <footer className="no-print" style={{ marginTop: 32, color: "var(--faint)", fontSize: ".82rem" }}>
          {app.branding.footer}
        </footer>
      </main>
    </div>
  );
}
