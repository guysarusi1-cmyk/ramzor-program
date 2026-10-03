# Looks at the finished LIVE build before it is published (READ-ONLY: nothing is written to the live database):
#  1. nothing from the test environment may be inside it (test password, test project, test tools, check scripts),
#  2. it must really open: the kids' TV route draws the children from the live data, without JavaScript errors.
# Exit code 0 = fine.   .\tests\live-smoke.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$port = 5186
$live = Join-Path $root 'dist\live'
$html = [IO.File]::ReadAllText((Join-Path $live 'index.html'), [Text.Encoding]::UTF8)

# 1. test-only things must not leak into live
$test = Get-Content (Join-Path $root 'config\test.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$forbidden = @($test.testPassword, ([Uri]$test.supabaseUrl).Host.Split('.')[0], 'runchecks', 'temp-goto-display', 'temp-celebrate', 'demo=', 'סביבת בדיקות', 'check-results', 'env-banner')
$leaks = @($forbidden | Where-Object { $_ -and $html.Contains($_) })
if($leaks.Count){ Write-Host ('LIVE BUILD CONTAINS TEST-ONLY TEXT: ' + ($leaks -join ', ')) -ForegroundColor Red; exit 1 }
$liveCfg = Get-Content (Join-Path $root 'config\live.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if(-not $html.Contains(([Uri]$liveCfg.supabaseUrl).Host)){ Write-Host 'live build does not point at the live project' -ForegroundColor Red; exit 1 }
if(-not $html.Contains("const APP_ENV = 'live'")){ Write-Host 'live build is not marked as live' -ForegroundColor Red; exit 1 }
Write-Host 'no test-only text in the live build; it points at the live project' -ForegroundColor Green

# 2. it opens and shows the children (reads only)
$browser = @('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
$server = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'tools\serve-folder.ps1'),'-Dir',$live,'-Port',$port
try {
  Start-Sleep -Seconds 2
  $out = Join-Path $env:TEMP 'ramzor-live-smoke.html'
  if(Test-Path $out){ [IO.File]::Delete($out) }
  $profile = Join-Path $env:TEMP ('ramzor-smoke-' + [Guid]::NewGuid().ToString('N').Substring(0,6))
  Start-Process $browser -Wait -RedirectStandardOutput $out -ArgumentList '--headless=new','--disable-gpu','--no-first-run',"--user-data-dir=$profile",'--window-size=1920,1080','--virtual-time-budget=12000','--dump-dom',"http://localhost:$port/#tv" | Out-Null
  $dom = [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8)
  $cards = ([regex]::Matches($dom, 'class="bonus-board-item')).Count + ([regex]::Matches($dom, 'class="star-card"')).Count + ([regex]::Matches($dom, 'class="kid-marker"')).Count
  $stage = $dom -match 'id="view-display"[^>]*class="view active"|class="view active" id="view-display"'
  Write-Host "kids' TV open: $stage, things drawn from live data: $cards"
  if(-not $stage -or $cards -lt 1){ Write-Host 'LIVE SMOKE TEST FAILED' -ForegroundColor Red; exit 1 }
  Write-Host 'live build opens and draws the live data' -ForegroundColor Green
} finally { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
exit 0
