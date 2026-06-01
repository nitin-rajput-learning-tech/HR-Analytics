// Serve the built single-file app over http://localhost so downloads, uploads
// and everything else behave like a real origin. Opening dist/index.html via
// file:// works for viewing, but Chrome blocks blob: downloads from file://
// origins — use this (or host the file on SharePoint/https) for full function.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
  .listen(PORT, () => console.log(`HR Analytics running at http://localhost:${PORT}   (Ctrl+C to stop)`));
