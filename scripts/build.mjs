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

// The bundle contains HTML-sensitive byte sequences (xlsx ships "<!--"/"-->"
// markers, Plotly an innerHTML="<script>" string). Inlining JS as raw <script>
// text means the HTML tokenizer scans it in "script data" state and these
// sequences derail parsing (script-data-escaped state, early tag close) →
// truncated JS → "Invalid regular expression: missing /". Escaping individual
// sequences is whack-a-mole. Instead, base64-encode the bundle: base64 contains
// no "<", so the HTML parser cannot mis-tokenize it. A tiny ASCII bootstrap
// decodes it (UTF-8 safe) and runs it via a DOM-injected <script>, which the JS
// engine parses directly — never through the HTML script-data tokenizer.
const safeCss = css.replace(/<\/style/gi, "<\\/style").replace(/<!--/g, "<\\!--");
const b64 = Buffer.from(js, "utf8").toString("base64");
const bootstrap =
  `(function(){var b="${b64}";var s=atob(b),n=s.length,u=new Uint8Array(n);` +
  `for(var i=0;i<n;i++)u[i]=s.charCodeAt(i);` +
  `var el=document.createElement("script");el.textContent=new TextDecoder("utf-8").decode(u);` +
  `document.body.appendChild(el);})();`;

const tpl = await readFile("index.html", "utf8");
const html = tpl
  .replace(/\s*<script[^>]*src="\/src\/main\.tsx"[^>]*><\/script>/, "")
  .replace("</head>", `    <style>${safeCss}</style>\n  </head>`)
  .replace("</body>", `    <script>${bootstrap}</script>\n  </body>`);

await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html, "utf8");

const mb = (html.length / 1024 / 1024).toFixed(2);
console.log(
  `esbuild-wasm ${version}: wrote dist/index.html (${mb} MB · js ${(js.length / 1024).toFixed(0)}kb · css ${(css.length / 1024).toFixed(0)}kb)`,
);

// esbuild-wasm keeps a service alive; exit explicitly so its stdio teardown
// can't emit a late stream error after our file is safely written.
process.exit(0);
