import { AppStateProvider } from "./ui/state";
import { AppShell } from "./ui/AppShell";

export function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}
