// Pure-Node test runner. Bundles every *.test.ts with esbuild-wasm (aliasing
// "vitest" to our shim) into one CJS module, then runs it in this process.
// No native esbuild binary → works where the Go executable is blocked.

import { initialize, build } from "esbuild-wasm";
import { readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const shimPath = path.resolve(root, "scripts/vitest-shim.mjs");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (entry.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const testFiles = (await walk(path.resolve(root, "src"))).sort();
if (testFiles.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

const entry =
  `import { __run } from ${JSON.stringify(shimPath)};\n` +
  testFiles.map((t) => `import ${JSON.stringify(t)};`).join("\n") +
  `\nglobalThis.__TEST_PROMISE = __run();\n`;

await initialize({ worker: false });
const result = await build({
  stdin: { contents: entry, resolveDir: root, loader: "ts", sourcefile: "_alltests.ts" },
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["es2020"],
  jsx: "automatic",
  alias: { vitest: shimPath },
  define: { "process.env.NODE_ENV": '"test"' },
  loader: { ".css": "empty", ".png": "dataurl", ".svg": "dataurl" },
  write: false,
  logLevel: "silent",
});

if (result.warnings.length) for (const w of result.warnings) console.warn("warn:", w.text);

const tmp = path.join(os.tmpdir(), `hr-analytics-tests-${process.pid}.cjs`);
await writeFile(tmp, result.outputFiles[0].text, "utf8");

const require = createRequire(import.meta.url);
require(tmp);
const res = await globalThis.__TEST_PROMISE;

for (const f of res.failures) console.log("  FAIL  " + f.label + "\n        " + f.message);
console.log(`\nTests: ${res.passed} passed, ${res.failed} failed (${res.total} total) · ${testFiles.length} files`);
process.exit(res.failed ? 1 : 0);
