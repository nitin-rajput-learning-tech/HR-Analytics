// Serve the built single-file app over http://localhost so downloads, uploads
// and everything else behave like a real origin. Opening dist/index.html via
// file:// works for viewing, but Chrome blocks blob: downloads from file://
// origins — use this (or host the file on SharePoint/https) for full function.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function openBrowser(url) {
  if (process.env.HRA_NO_OPEN) return;
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* opening the browser is best-effort */
  }
}

const PORT = Number(process.env.PORT) || 4173;
const root = path.resolve("dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http
  .createServer(async (req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/" || p.endsWith("/")) p += "index.html";
    const fp = path.join(root, p);
    try {
      const data = await readFile(fp);
      res.setHeader("content-type", (types[path.extname(fp)] || "application/octet-stream") + "; charset=utf-8");
      res.end(data);
    } catch {
      try {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(await readFile(path.join(root, "index.html"))); // SPA fallback
      } catch {
        res.statusCode = 404;
        res.end("dist/index.html not found — run `npm run build` first.");
      }
    }
  })
  .listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`HR Analytics running at ${url}   (Ctrl+C to stop)`);
    openBrowser(url);
  });
