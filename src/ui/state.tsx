import React, { createContext, useContext, useState, useCallback } from "react";
import { MemoryStore } from "../core/store/memoryStore";
import { applyBranding, DEFAULT_BRANDING, type Branding } from "../branding/branding";

interface AppState {
  store: MemoryStore;
  version: number;
  branding: Branding;
  bump(): void;
  setStore(s: MemoryStore): void;
  setBranding(b: Branding): void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [store, setStoreRaw] = useState(() => new MemoryStore());
  const [branding, setBrandingRaw] = useState<Branding>(DEFAULT_BRANDING);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const setStore = useCallback((s: MemoryStore) => {
    setStoreRaw(s);
    setVersion((v) => v + 1);
  }, []);
  const setBranding = useCallback((b: Branding) => {
    setBrandingRaw(b);
    applyBranding(b);
  }, []);
  return (
    <Ctx.Provider value={{ store, version, branding, bump, setStore, setBranding }}>{children}</Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppStateProvider missing");
  return v;
}
