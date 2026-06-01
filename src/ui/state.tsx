import React, { createContext, useContext, useState, useCallback } from "react";
import { MemoryStore } from "../core/store/memoryStore";
import { applyBranding, DEFAULT_BRANDING, type Branding } from "../branding/branding";
import type { Filters } from "../core/filters";

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
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [store, setStoreRaw] = useState(() => new MemoryStore());
  const [branding, setBrandingRaw] = useState<Branding>(DEFAULT_BRANDING);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState<string>("People Analytics");
  const [peopleFilters, setPeopleFilters] = useState<Filters>({});

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

  return (
    <Ctx.Provider
      value={{ store, version, branding, bump, setStore, setBranding, page, setPage, peopleFilters, setPeopleFilters, drillToPeople }}
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
