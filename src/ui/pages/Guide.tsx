import { useEffect, useRef } from "react";
import { GUIDEBOOK_HTML } from "../../help/guidebookHtml";
import { installGuideAnchorHandler } from "../../help/guideAnchors";

// The in-app user guide. Renders the self-contained guidebook inside an <iframe
// srcdoc> for full style isolation (the guide ships its own CSS and must not inherit
// or pollute the app's). On load we intercept in-page "#anchor" clicks so the TOC
// scrolls within the frame instead of reloading the srcdoc document (see
// installGuideAnchorHandler). "Save as PDF / Print" prints just the guide via the
// iframe's own print(), so the guidebook's @media print layout applies — not the app.
export function Guide() {
  const ref = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    let cleanup: (() => void) | null = null;
    const wire = () => {
      const doc = iframe.contentDocument;
      if (doc) {
        cleanup?.();
        cleanup = installGuideAnchorHandler(doc);
      }
    };
    iframe.addEventListener("load", wire);
    // srcdoc may already be parsed by the time this effect runs.
    if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") wire();
    return () => {
      iframe.removeEventListener("load", wire);
      cleanup?.();
    };
  }, []);

  const printGuide = () => {
    const win = ref.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  return (
    <div className="domain-view guide-view">
      <div className="guide-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ marginBottom: 2 }}>User Guide</h2>
          <p className="muted" style={{ margin: 0 }}>
            How to run HR Analytics end to end. Press <kbd>?</kbd> anywhere to open this.
          </p>
        </div>
        <button className="primary" onClick={printGuide} title="Print the guide or save it as a PDF">
          Save as PDF / Print
        </button>
      </div>
      <iframe
        ref={ref}
        title="HR Analytics user guide"
        srcDoc={GUIDEBOOK_HTML}
        style={{
          width: "100%",
          height: "calc(100vh - 168px)",
          minHeight: 520,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          background: "#fff",
        }}
      />
    </div>
  );
}
