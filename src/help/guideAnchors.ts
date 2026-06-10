// In-frame anchor handling for the Guide view.
//
// The guidebook renders inside an <iframe srcdoc>. A bare `#anchor` link in a srcdoc
// document has a base URL of about:srcdoc, so the browser treats a click as a
// navigation to "about:srcdoc#anchor" — which reloads the whole srcdoc document in
// the frame (and, in some engines, the embedding app). We instead intercept clicks on
// in-page anchors and scroll the target element into view ourselves.
//
// This module is pure and DOM-light (typed against minimal interfaces) so the core
// behaviour is unit-testable without a real browser.

export interface ScrollableEl {
  scrollIntoView(opts?: ScrollIntoViewOptions): void;
}
export interface AnchorDoc {
  getElementById(id: string): ScrollableEl | null;
}

/**
 * Given an anchor href (e.g. "#sec-overview"), scroll the matching element into view
 * within `doc`. Returns true when the href is a same-page anchor that we handled
 * (so the caller should preventDefault) — even if the target id isn't found, we still
 * claim it to stop the srcdoc reload. Returns false for non-anchor / cross-page hrefs.
 */
export function scrollGuideAnchor(href: string | null | undefined, doc: AnchorDoc): boolean {
  if (!href || href[0] !== "#") return false;
  const id = decodeURIComponent(href.slice(1));
  if (!id) return false; // bare "#" — treat as handled no-op so the frame doesn't reload
  const el = doc.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

/**
 * Wire same-page anchor interception onto an iframe's document. Returns a cleanup
 * function. Used by the Guide view after the iframe loads.
 */
export function installGuideAnchorHandler(doc: Document): () => void {
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    const a = target && "closest" in target ? target.closest('a[href^="#"]') : null;
    if (!a) return;
    if (scrollGuideAnchor(a.getAttribute("href"), doc)) e.preventDefault();
  };
  doc.addEventListener("click", onClick);
  return () => doc.removeEventListener("click", onClick);
}
