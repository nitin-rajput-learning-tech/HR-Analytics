import React from "react";
import "./theme.css";
import { useApp } from "./state";
import { People } from "./pages/People";
import { HRBrain } from "./pages/HRBrain";
import { Cockpit } from "./pages/Cockpit";
import { Directory } from "./pages/Directory";
import { FunctionAnalytics } from "./pages/FunctionAnalytics";
import { Scenario } from "./pages/Scenario";
import { Scorecard } from "./pages/Scorecard";
import { Compliance } from "./pages/Compliance";
import { Reports } from "./pages/Reports";
import { DataIntake } from "./pages/DataIntake";
import { BrandingPage } from "./pages/Branding";
import { CommandPalette } from "./components/CommandPalette";
import { useFocusTrap } from "./useFocusTrap";
import { downloadBlob } from "./download";
import { ToastHost, toast } from "./toast";
import { saveWorkspace, loadWorkspace } from "../workspace/workspace";
import { encryptWorkspace, decryptWorkspace, isEncryptedWorkspace } from "../workspace/crypto";
import { getStorageStatus, formatBytes } from "../workspace/storage";
import { loadPersisted } from "../workspace/autosave";

const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
const CMDK_LABEL = isMac ? "⌘K" : "Ctrl K";

const PAGES = ["People Analytics", "HR Brain", "Manager Cockpit", "Directory", "Function Analytics", "Scorecard", "Compliance", "Scenario", "Newsletter", "Data Intake", "Branding"] as const;
type Page = (typeof PAGES)[number];

export function AppShell() {
  const app = useApp();
  const page = app.page as Page;
  const setPage = app.setPage;

  // Encrypt-on-save controls.
  const [encrypt, setEncrypt] = React.useState(false);
  const [passphrase, setPassphrase] = React.useState("");
  // Decrypt-on-load modal state.
  const [encOpen, setEncOpen] = React.useState(false);
  const [encBytes, setEncBytes] = React.useState<Uint8Array | null>(null);
  const [loadPass, setLoadPass] = React.useState("");
  const [encErr, setEncErr] = React.useState("");
  const encModalRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(encModalRef, encOpen);

  // Live-mode storage status (durable? how much stored?) for the sidebar note.
  // Re-read on data changes; also after a short delay so the debounced autosave
  // write has landed before we estimate usage.
  const [storage, setStorage] = React.useState<{ supported: boolean; persisted: boolean; savedBytes: number | null } | null>(null);
  React.useEffect(() => {
    if (app.mode !== "live") {
      setStorage(null);
      return;
    }
    let cancelled = false;
    // Durability (persisted/supported) from the Storage API; the displayed size
    // is the EXACT gzipped workspace we persisted, not navigator.storage.estimate
    // (which is padded for privacy and counts all origin storage).
    const read = async () => {
      const [s, bytes] = await Promise.all([getStorageStatus(), loadPersisted()]);
      if (!cancelled) setStorage({ supported: s.supported, persisted: s.persisted, savedBytes: bytes ? bytes.length : null });
    };
    void read();
    const t = window.setTimeout(() => { void read(); }, 1300);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [app.mode, app.version]);

  async function onSave() {
    if (encrypt && !passphrase.trim()) {
      toast("Enter a passphrase to encrypt the workspace", "error");
      return;
    }
    let bytes = saveWorkspace(app.store, app.branding, new Date().toISOString(), app.savedViews, app.auditLog, app.targets, app.benchmarks, app.actions, app.benchmarkPackId, app.customBenchmarkPack);
    let filename = "hr-workspace.json.gz";
    const willEncrypt = encrypt && !!passphrase.trim();
    if (willEncrypt) {
      try {
        bytes = await encryptWorkspace(bytes, passphrase);
        filename = "hr-workspace.enc.gz";
      } catch (err) {
        toast(err instanceof Error ? err.message : "Encryption failed", "error");
        return;
      }
    }
    downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }), filename);
    const emp = app.store.getLatest("employee_master")?.rows.length ?? 0;
    const detail = emp ? `${emp.toLocaleString("en-IN")} employees` : `${app.store.allSnapshots().length} snapshot(s)`;
    app.logAudit(willEncrypt ? "Saved workspace (encrypted)" : "Saved workspace", detail);
    toast(willEncrypt ? "Workspace saved (encrypted)" : "Workspace saved", "success");
  }

  function applyWorkspaceBytes(bytes: Uint8Array) {
    const { store, branding, savedViews, auditLog, targets, benchmarks, actions, benchmarkPackId, customBenchmarkPack } = loadWorkspace(bytes);
    app.setStore(store);
    app.setBranding(branding);
    app.setSavedViews(savedViews);
    app.setAuditLog(auditLog);
    app.setTargets(targets);
    app.setBenchmarks(benchmarks);
    app.setActions(actions);
    app.setBenchmarkPackId(benchmarkPackId);
    app.setCustomBenchmarkPack(customBenchmarkPack);
    app.markLive(); // a loaded workspace is the user's own data — persist it
    const emp = store.getLatest("employee_master")?.rows.length ?? 0;
    app.logAudit("Loaded workspace", emp ? `${emp.toLocaleString("en-IN")} employees` : `${store.allSnapshots().length} snapshot(s)`);
    toast(emp ? `Workspace loaded — ${emp.toLocaleString("en-IN")} employees` : "Workspace loaded", "success");
  }

  async function onLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isEncryptedWorkspace(bytes)) {
        setEncBytes(bytes);
        setLoadPass("");
        setEncErr("");
        setEncOpen(true);
      } else {
        applyWorkspaceBytes(bytes);
      }
    } catch {
      toast("Couldn't read that workspace file", "error");
    }
    e.target.value = "";
  }

  async function submitDecrypt() {
    if (!encBytes) return;
    try {
      const plain = await decryptWorkspace(encBytes, loadPass);
      applyWorkspaceBytes(plain);
      setEncOpen(false);
      setEncBytes(null);
      setLoadPass("");
    } catch (err) {
      setEncErr(err instanceof Error ? err.message : "Could not decrypt this workspace.");
    }
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <nav className="sidebar no-print" aria-label="Primary">
        <div className="brandbar">{app.branding.appName}</div>
        {app.branding.logoDataUri ? <img src={app.branding.logoDataUri} alt="" style={{ height: 30, margin: "8px 6px" }} /> : null}
        <div className="nav">
          {PAGES.map((p) => (
            <a
              key={p}
              className={p === page ? "active" : ""}
              href="#"
              aria-current={p === page ? "page" : undefined}
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
          <button
            className="cmdk-trigger"
            onClick={() => window.dispatchEvent(new CustomEvent("cmdk:open"))}
            title="Open command palette"
          >
            <span>Commands</span>
            <kbd>{CMDK_LABEL}</kbd>
          </button>
          <button
            className="theme-quick"
            onClick={() => app.setBranding({ ...app.branding, theme: app.branding.theme === "dark" ? "light" : "dark" })}
            title="Toggle light / dark theme"
          >
            {app.branding.theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
          </button>
          <div className="muted-label">Workspace</div>
          <button className="primary" style={{ width: "100%", marginTop: 6 }} onClick={onSave}>
            Save workspace
          </button>
          <label className="ws-encrypt">
            <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
            <span>🔒 Encrypt with passphrase</span>
          </label>
          {encrypt ? (
            <input
              type="password"
              className="ws-pass"
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="new-password"
            />
          ) : null}
          <label style={{ marginTop: 10, fontSize: ".8rem", color: "var(--muted)" }}>
            Load workspace
            <br />
            <input type="file" accept=".gz,.json,.enc" onChange={onLoad} style={{ marginTop: 4, fontSize: ".78rem" }} />
          </label>
          <div className="ws-autosave">
            {app.mode === "live" ? (
              <>
                ↻ Saved on this device{storage?.persisted ? " · durable" : ""}
                {storage && storage.savedBytes != null && storage.savedBytes > 0 ? ` · ${formatBytes(storage.savedBytes)}` : ""} ·{" "}
                <button
                  className="link-btn"
                  onClick={() => {
                    if (window.confirm("Clear your data from this device and return to the demo? Save or export a workspace first if you want a backup — this cannot be undone.")) app.clearData();
                  }}
                >
                  Clear my data
                </button>
                {storage && storage.supported && !storage.persisted ? (
                  <div className="ws-warn">
                    ⚠ This browser may clear local data —{" "}
                    <button className="link-btn" onClick={onSave}>save a backup</button>.
                  </div>
                ) : null}
              </>
            ) : (
              <>🔬 Demo data — upload your own in Data Intake to begin.</>
            )}
          </div>
        </div>
      </nav>
      <main className="content" id="main-content" tabIndex={-1}>
        <h1 className="sr-only">{app.branding.appName} — {page}</h1>
        {app.ready && app.mode === "demo" ? (
          <div className="demo-banner no-print" role="status">
            <span>
              🔬 <strong>Demo mode</strong> — you're exploring a sample organisation, and nothing here is saved. Upload your
              own data to begin; it stays on this device and is kept across refreshes.
            </span>
            <button className="primary" onClick={() => setPage("Data Intake")}>
              Upload your data →
            </button>
          </div>
        ) : null}
        {page === "People Analytics" && <People />}
        {page === "HR Brain" && <HRBrain />}
        {page === "Manager Cockpit" && <Cockpit />}
        {page === "Directory" && <Directory />}
        {page === "Function Analytics" && <FunctionAnalytics />}
        {page === "Scorecard" && <Scorecard />}
        {page === "Compliance" && <Compliance />}
        {page === "Scenario" && <Scenario />}
        {page === "Newsletter" && <Reports />}
        {page === "Data Intake" && <DataIntake />}
        {page === "Branding" && <BrandingPage />}
        <footer className="no-print" style={{ marginTop: 32, color: "var(--faint)", fontSize: ".82rem" }}>
          {app.branding.footer}
        </footer>
      </main>
      {encOpen ? (
        <div className="cmdk-overlay no-print" onMouseDown={(e) => { if (e.target === e.currentTarget) setEncOpen(false); }}>
          <div className="enc-modal" ref={encModalRef} role="dialog" aria-modal="true" aria-label="Decrypt workspace">
            <h3>🔒 Encrypted workspace</h3>
            <p className="muted">This workspace is passphrase-protected. Enter the passphrase to open it.</p>
            <input
              type="password"
              className="ws-pass"
              autoFocus
              placeholder="Passphrase"
              value={loadPass}
              onChange={(e) => { setLoadPass(e.target.value); setEncErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitDecrypt(); }}
            />
            {encErr ? <p className="enc-err">{encErr}</p> : null}
            <div className="enc-actions">
              <button onClick={() => { setEncOpen(false); setEncBytes(null); }}>Cancel</button>
              <button className="primary" onClick={submitDecrypt}>Open</button>
            </div>
          </div>
        </div>
      ) : null}
      <CommandPalette onSaveWorkspace={onSave} />
      <ToastHost />
    </div>
  );
}
