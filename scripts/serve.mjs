// Serve the built single-file app over http://localhost so downloads, uploads
// and everything else behave like a real origin. Opening dist/index.html via
// file:// works for viewing, but Chrome blocks blob: download filenames and
// file pickers from file:// origins — use this (or host on SharePoint/https)
// for full function.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

// Resolve dist/ relative to THIS script, not the working directory, so the
// launcher works no matter where it's invoked from.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "dist");
const START_PORT = Number(process.env.PORT) || 4173;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const server = http.createServer(async (req, res) => {
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
});

// Try START_PORT, then scan upward if it's already in use, so a second copy (or
// a stale server) never crashes the launcher.
let port = START_PORT;
server.on("listening", () => {
  const url = `http://localhost:${port}`;
  console.log(`HR Analytics running at ${url}   (Ctrl+C to stop)`);
  openBrowser(url);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && port < START_PORT + 100) {
    port += 1;
    setTimeout(() => server.listen(port), 0);
  } else {
    console.error(`Could not start the server: ${err.message}`);
    process.exit(1);
  }
});
server.listen(port);
