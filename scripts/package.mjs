// Assemble a hand-over package: the single-file app + the zero-install Windows
// launcher + a one-page usage guide, in a flat `package/` folder the HR team can
// run by double-clicking (or that you can zip and share). The launcher + server
// resolve index.html beside themselves, so the flat layout "just works".
//
//   npm run package   (builds first, then assembles package/)

import * as fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "package");
const dist = path.join(root, "dist", "index.html");

if (!fs.existsSync(dist)) {
  console.error("dist/index.html not found — run `npm run build` first.");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(dist, path.join(out, "index.html"));
fs.copyFileSync(path.join(root, "Run HR Analytics.bat"), path.join(out, "Run HR Analytics.bat"));
fs.copyFileSync(path.join(root, "scripts", "serve.ps1"), path.join(out, "serve.ps1"));

const usage = `HR Analytics — how to run
=========================

WINDOWS (recommended — nothing to install):
  1. Double-click "Run HR Analytics.bat".
  2. A small window opens and your browser opens to the app (http://localhost).
  3. Use it. Keep that small window open while you work; close it to stop.

The app opens in DEMO mode with a sample organisation. To use your own data, go
to Data Intake, download a template, fill it, and upload it — the app switches to
your data, which then auto-saves on THIS device and survives refreshes.

WHY NOT just double-click index.html?
  Opening the HTML directly (file://) makes Chrome block downloads and the file
  upload picker. The launcher serves it at http://localhost so everything works.
  Nothing leaves your machine — the "server" is local-only, no internet needed.

FOR A WHOLE TEAM:
  Host index.html on SharePoint or any intranet / https web server. Any real
  https:// link works for everyone with zero setup.

Private by design: no account, no login, no telemetry, no cloud. Your data stays
in the browser on your device. To back up or move it: Save workspace (optionally
passphrase-encrypted) and Load it elsewhere.
`;
fs.writeFileSync(path.join(out, "USAGE.txt"), usage);

const mb = (fs.statSync(path.join(out, "index.html")).size / 1024 / 1024).toFixed(2);
console.log(`packaged -> package/  (index.html ${mb} MB + "Run HR Analytics.bat" + serve.ps1 + USAGE.txt)`);
console.log("Hand the whole package/ folder to the team (or zip it and share).");
