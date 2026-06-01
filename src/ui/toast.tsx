import { useEffect, useState } from "react";

// Tiny event-based toast system: any module can call toast("…") without needing
// the app context. <ToastHost/> (mounted once in AppShell) listens and renders a
// stack of transient, auto-dismissing, click-to-close messages.

export type ToastTone = "info" | "success" | "error";
interface ToastDetail {
  message: string;
  tone: ToastTone;
}
interface ToastItem extends ToastDetail {
  id: number;
}

export function toast(message: string, tone: ToastTone = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, tone } }));
}

let seq = 0;

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as Partial<ToastDetail>;
      const id = ++seq;
      setItems((xs) => [...xs, { id, message: d.message ?? "", tone: d.tone ?? "info" }].slice(-4));
      window.setTimeout(() => setItems((xs) => xs.filter((t) => t.id !== id)), 3200);
    };
    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="toast-host no-print" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
