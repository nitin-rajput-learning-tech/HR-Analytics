# HR Analytics — local launcher (no install required).
#
# Serves the single-file app over http://localhost so downloads, uploads and
# saved data work like a real web app. Opening index.html by double-click uses
# the file:// protocol, where Chrome (and corporate security tools) ignore
# download filenames and block file pickers — this avoids all of that.
#
# Uses only built-in Windows PowerShell (no Node, no install). Double-click
# "Run HR Analytics.bat" to start it. Close this window to stop.
#
# Test hooks (not for normal use): $env:HRA_PORT pins the port; $env:HRA_NO_OPEN
# skips opening the browser.

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Locate the built single-file app: repo layout (../dist), or beside this script
# (when shipped as a flat folder to end users).
$candidates = @(
  (Join-Path $scriptDir "..\dist\index.html"),
  (Join-Path $scriptDir "dist\index.html"),
  (Join-Path $scriptDir "index.html")
)
$indexPath = $null
foreach ($c in $candidates) { if (Test-Path $c) { $indexPath = (Resolve-Path $c).Path; break } }
if (-not $indexPath) {
  Write-Host "Could not find index.html." -ForegroundColor Red
  Write-Host "Build it first (npm run build) or place index.html next to this launcher."
  Read-Host "Press Enter to close"
  exit 1
}
$html = [System.IO.File]::ReadAllBytes($indexPath)

# Pick a free loopback port (4173, then scan upward).
function Test-FreePort([int]$p) {
  try {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}
if ($env:HRA_PORT) {
  $port = [int]$env:HRA_PORT
} else {
  $port = 4173
  while (-not (Test-FreePort $port) -and $port -lt 4273) { $port++ }
}
$prefix = "http://localhost:$port/"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Could not start the local server on $prefix" -ForegroundColor Red
  Write-Host $_.Exception.Message
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "  HR Analytics is running at $prefix" -ForegroundColor Green
Write-Host "  Your browser should open automatically." -ForegroundColor Gray
Write-Host "  Keep this window open while you work; close it to stop." -ForegroundColor DarkGray
Write-Host ""

if (-not $env:HRA_NO_OPEN) { Start-Process $prefix }

# Serve the single HTML for every request (single-file SPA — no other assets).
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    $res.ContentType = "text/html; charset=utf-8"
    $res.Headers.Add("Cache-Control", "no-store")
    $res.ContentLength64 = $html.Length
    $res.OutputStream.Write($html, 0, $html.Length)
    $res.OutputStream.Close()
  } catch {
    break
  }
}
$listener.Stop()
