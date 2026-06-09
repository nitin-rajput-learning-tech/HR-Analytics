import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { MemoryStore } from "../core/store/memoryStore";
import { applyBranding, DEFAULT_BRANDING, type Branding } from "../branding/branding";
import { toast } from "./toast";
import { saveWorkspace, loadWorkspace } from "../workspace/workspace";
import { persistWorkspace, loadPersisted, clearPersisted } from "../workspace/autosave";
import { requestPersistentStorage } from "../workspace/storage";
import { demoWorkspaceBytes } from "../demo/demo";
import type { Filters } from "../core/filters";
import type { SavedView, AuditEntry } from "../workspace/workspace";
import type { Snapshot } from "../core/store/types";
import type { Action } from "../core/actions";

interface AppState {
  store: MemoryStore;
  version: number;
  branding: Branding;
  bump(): void;
  setStore(s: MemoryStore): void;
  setBranding(b: Branding): void;
  // Shared navigation + People filter state (so a click in one view can drill
  // into People filtered by that value — cross-page drill-down).
  page: string;
  setPage(p: string): void;
  peopleFilters: Filters;
  setPeopleFilters: React.Dispatch<React.SetStateAction<Filters>>;
  drillToPeople(field: string, label: string): void;
  // Active People sub-tab, lifted to shared state so other pages (e.g. HR Brain)
  // can deep-link straight to a specific analytic.
  peopleTab: string;
  setPeopleTab(t: string): void;
  goTo(page: string, peopleTab?: string): void;
  // Saved views — named page + filter presets, persisted with the workspace.
  savedViews: SavedView[];
  setSavedViews(v: SavedView[]): void;
  saveView(name: string): void;
  applyView(id: string): void;
  deleteView(id: string): void;
  // Local, workspace-embedded activity log (no PII) — records that data actions
  // happened (save/load/publish), surfaced read-only and persisted on save.
  auditLog: AuditEntry[];
  setAuditLog(l: AuditEntry[]): void;
  logAudit(action: string, detail?: string): void;
  // Demo vs live. The tool ships in "demo" mode — a sample workspace that is
  // never persisted. The first real upload/load switches to "live" mode, whose
  // data auto-saves to IndexedDB (survives refresh) and stays on this device.
  mode: "demo" | "live";
  ready: boolean; // false until the initial demo/live decision is made
  commitSnapshot(snap: Snapshot): void; // add one dataset; exits demo on first add
  markLive(): void; // a full workspace load is the user's own data → live
  clearData(): void; // wipe the saved data and return to demo mode
  // Scorecard KPI targets (management-by-objective); persisted with the workspace.
  targets: Record<string, number>;
  setTargets(t: Record<string, number>): void;
  // Edited benchmark bands per KPI (override the illustrative defaults); persisted.
  benchmarks: Record<string, { low: number; high: number }>;
  setBenchmarks(b: Record<string, { low: number; high: number }>): void;
  // Tracked HR actions / commitments (from the Brain roadmap or manual); persisted.
  actions: Action[];
  setActions: React.Dispatch<React.SetStateAction<Action[]>>;
}

const AUDIT_CAP = 250;

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "v" + Date.now() + Math.floor(Math.random() * 1e6);
  }
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [store, setStoreRaw] = useState(() => new MemoryStore());
  const [branding, setBrandingRaw] = useState<Branding>(DEFAULT_BRANDING);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState<string>("People Analytics");
  const [peopleFilters, setPeopleFilters] = useState<Filters>({});
  const [peopleTab, setPeopleTab] = useState<string>("overview");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [ready, setReady] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [benchmarks, setBenchmarks] = useState<Record<string, { low: number; high: number }>>({});
  const [actions, setActions] = useState<Action[]>([]);

  const logAudit = useCallback((action: string, detail?: string) => {
    setAuditLog((l) => [...l, { ts: new Date().toISOString(), action, ...(detail ? { detail } : {}) }].slice(-AUDIT_CAP));
  }, []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const setStore = useCallback((s: MemoryStore) => {
    setStoreRaw(s);
    setVersion((v) => v + 1);
  }, []);
  const setBranding = useCallback((b: Branding) => {
    setBrandingRaw(b);
    applyBranding(b);
  }, []);
  const goTo = useCallback((p: string, tab?: string) => {
    if (tab) setPeopleTab(tab);
    setPage(p);
  }, []);
  const drillToPeople = useCallback((field: string, label: string) => {
    setPeopleFilters((f) => {
      const cur = (f as Record<string, string[] | undefined>)[field] ?? [];
      return cur.includes(label) ? f : { ...f, [field]: [...cur, label] };
    });
    setPage("People Analytics");
  }, []);
  const saveView = useCallback(
    (name: string) => {
      setSavedViews((vs) => [...vs, { id: makeId(), name, page, filters: peopleFilters }]);
      toast(`Saved view “${name}”`, "success");
    },
    [page, peopleFilters],
  );
  const applyView = useCallback(
    (id: string) => {
      const v = savedViews.find((x) => x.id === id);
      if (v) {
        setPeopleFilters(v.filters);
        setPage(v.page);
        toast(`Applied view “${v.name}”`);
      }
    },
    [savedViews],
  );
  const deleteView = useCallback((id: string) => {
    setSavedViews((vs) => vs.filter((x) => x.id !== id));
    toast("View deleted");
  }, []);

  // --- Demo mode + session persistence -------------------------------------
  // The tool ships populated (demo mode); the user's own data, once uploaded,
  // auto-saves to IndexedDB and survives refresh. Demo data is never persisted,
  // so the presence of a saved workspace is exactly "live mode" — no extra flag.
  const hydrated = useRef(false);

  // Replace the whole workspace from gzipped bytes (demo, restore, file load).
  const applyBytes = useCallback(
    (bytes: Uint8Array) => {
      const r = loadWorkspace(bytes);
      setStore(r.store);
      setBranding(r.branding);
      setSavedViews(r.savedViews);
      setAuditLog(r.auditLog);
      setTargets(r.targets);
      setBenchmarks(r.benchmarks);
      setActions(r.actions);
    },
    [setStore, setBranding],
  );

  const loadDemo = useCallback(() => {
    try {
      applyBytes(demoWorkspaceBytes());
    } catch {
      setStore(new MemoryStore()); // demo bytes unavailable (e.g. test runner)
    }
    setMode("demo");
  }, [applyBytes, setStore]);

  // On first mount: restore the user's saved workspace if one exists (live),
  // otherwise show the bundled demo.
  useEffect(() => {
    let cancelled = false;
    loadPersisted().then((bytes) => {
      if (cancelled) return;
      if (bytes) {
        try {
          applyBytes(bytes);
          setMode("live");
        } catch {
          loadDemo(); // corrupt saved data — fall back to demo
        }
      } else {
        loadDemo();
      }
      hydrated.current = true;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [applyBytes, loadDemo]);

  // Auto-save to IndexedDB on change (debounced). Skipped before hydration and
  // in demo mode, so demo data never becomes — or overwrites — a saved session.
  useEffect(() => {
    if (!hydrated.current || mode === "demo") return;
    const id = window.setTimeout(() => {
      try {
        void persistWorkspace(saveWorkspace(store, branding, new Date().toISOString(), savedViews, auditLog, targets, benchmarks, actions));
      } catch {
        /* persistence is best-effort */
      }
    }, 800);
    return () => window.clearTimeout(id);
  }, [store, version, branding, savedViews, auditLog, targets, benchmarks, actions, mode]);

  // Once the user has their own data, ask the browser to keep it durable so the
  // local database isn't evicted under storage pressure. Idempotent; no-ops
  // where the Storage API is unavailable.
  useEffect(() => {
    if (ready && mode === "live") void requestPersistentStorage();
  }, [ready, mode]);

  // Add one dataset snapshot. The first add while in demo mode swaps the demo
  // showroom for a clean live workspace holding just the user's own data.
  const commitSnapshot = useCallback(
    (snap: Snapshot) => {
      if (mode === "demo") {
        const fresh = new MemoryStore();
        fresh.add(snap);
        setStore(fresh);
        setBranding(DEFAULT_BRANDING);
        setSavedViews([]);
        setAuditLog([]);
        setTargets({});
        setBenchmarks({});
        setActions([]);
        setMode("live");
      } else {
        store.add(snap);
        bump();
      }
    },
    [mode, store, setStore, setBranding, bump],
  );

  // A full workspace load (from a file) is the user's own data → live mode.
  const markLive = useCallback(() => setMode("live"), []);

  const clearData = useCallback(() => {
    void clearPersisted();
    loadDemo();
    setTargets({});
    setBenchmarks({});
    setActions([]);
    setPeopleFilters({});
    toast("Your data was cleared — showing demo data");
  }, [loadDemo]);

  return (
    <Ctx.Provider
      value={{ store, version, branding, bump, setStore, setBranding, page, setPage, peopleFilters, setPeopleFilters, drillToPeople, peopleTab, setPeopleTab, goTo, savedViews, setSavedViews, saveView, applyView, deleteView, auditLog, setAuditLog, logAudit, mode, ready, commitSnapshot, markLive, clearData, targets, setTargets, benchmarks, setBenchmarks, actions, setActions }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppStateProvider missing");
  return v;
}
