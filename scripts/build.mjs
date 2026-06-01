// Single-file build WITHOUT the native esbuild Go binary.
//
// The native esbuild executable cannot load winmm.dll under locked-down
// Windows (AppContainer / endpoint protection), which breaks `vite build`.
// esbuild-wasm is the same compiler compiled to WebAssembly — it runs inside
// Node, so it never touches a system DLL. We bundle the app and inline the JS
// + CSS into one self-contained index.html that opens from file:// or a share.

import { initialize, build, version } from "esbuild-wasm";
import { writeFile, mkdir, readFile } from "node:fs/promises";

await initialize({ worker: false });

const result = await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  format: "iife",
  minify: true,
  sourcemap: false,
  jsx: "automatic",
  target: ["es2020"],
  define: { "process.env.NODE_ENV": '"production"' },
  loader: {
    ".css": "css",
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".gif": "dataurl",
    ".svg": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl",
  },
  write: false,
  outdir: "dist",
  logLevel: "silent",
});

if (result.warnings.length) {
  for (const w of result.warnings) console.warn("warn:", w.text);
}

let js = "";
let css = "";
for (const f of result.outputFiles) {
  if (f.path.endsWith(".js")) js = f.text;
  else if (f.path.endsWith(".css")) css = f.text;
}

const tpl = await readFile("index.html", "utf8");
const html = tpl
  .replace(/\s*<script[^>]*src="\/src\/main\.tsx"[^>]*><\/script>/, "")
  .replace("</head>", `    <style>${css}</style>\n  </head>`)
  .replace("</body>", `    <script>${js}</script>\n  </body>`);

await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html, "utf8");

const mb = (html.length / 1024 / 1024).toFixed(2);
console.log(
  `esbuild-wasm ${version}: wrote dist/index.html (${mb} MB · js ${(js.length / 1024).toFixed(0)}kb · css ${(css.length / 1024).toFixed(0)}kb)`,
);

// esbuild-wasm keeps a service alive; exit explicitly so its stdio teardown
// can't emit a late stream error after our file is safely written.
process.exit(0);
