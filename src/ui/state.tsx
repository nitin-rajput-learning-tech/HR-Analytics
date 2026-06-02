import React, { createContext, useContext, useState, useCallback } from "react";
import { MemoryStore } from "../core/store/memoryStore";
import { applyBranding, DEFAULT_BRANDING, type Branding } from "../branding/branding";
import { toast } from "./toast";
import type { Filters } from "../core/filters";
import type { SavedView, AuditEntry } from "../workspace/workspace";

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
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

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

  return (
    <Ctx.Provider
      value={{ store, version, branding, bump, setStore, setBranding, page, setPage, peopleFilters, setPeopleFilters, drillToPeople, savedViews, setSavedViews, saveView, applyView, deleteView, auditLog, setAuditLog, logAudit }}
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
