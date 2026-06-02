// Client-side file download helper.
//
// The naive pattern (create anchor → click → revokeObjectURL immediately) is a
// footgun: the download is ASYNCHRONOUS but revokeObjectURL is synchronous, so
// the object URL is gone before the browser resolves the filename — Chrome then
// saves the file under the blob's UUID with no extension. Two fixes make it
// reliable: append the anchor to the DOM (some engines ignore `download` on a
// detached node) and defer cleanup to a later tick so the blob outlives the
// download's name-resolution.

export function downloadUrl(url: string, filename: string, revoke = false): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Defer: let the browser start (and name) the download before we tear down.
  setTimeout(() => {
    a.remove();
    if (revoke) URL.revokeObjectURL(url);
  }, 0);
}

export function downloadBlob(blob: Blob, filename: string): void {
  downloadUrl(URL.createObjectURL(blob), filename, true);
}
