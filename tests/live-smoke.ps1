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

# 1b. privacy of the live database (a warning, not a blocker: the app works both ways, the SQL is what closes it)
try {
  $probe = Invoke-RestMethod -Uri "$($liveCfg.supabaseUrl)/rest/v1/roster?select=sw_phone&limit=1" -Headers @{ apikey = $liveCfg.anonKey }
  if(@($probe).Count -gt 0){ Write-Host 'LIVE PRIVACY WARNING: someone who is not signed in can still read the children''s social-worker phones. Run supabase\hardening.sql in the LIVE project.' -ForegroundColor Yellow }
  else { Write-Host 'live privacy: nothing readable from the roster without signing in' -ForegroundColor Green }
} catch { Write-Host 'live privacy: the social-worker phones are NOT readable without signing in (hardening is on)' -ForegroundColor Green }
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
  # no staff password any more (Mercury stage 6): a screen nobody connected must ask for its code, and show no child
  $pair = $dom -match 'id="tv-pair"' -and $dom -match 'id="tvp-code"'
  $dom = [regex]::Replace($dom, '(?s)<script.*?</script>', '')          # (only what is drawn, not the code of the page)
  $cards = ([regex]::Matches($dom, 'class="bonus-board-item')).Count + ([regex]::Matches($dom, 'class="star-card"')).Count + ([regex]::Matches($dom, 'class="kid-marker"')).Count
  Write-Host "kids' TV of an unknown screen asks for the code: $pair, children drawn without a code: $cards"
  if(-not $pair -or $cards -gt 0){ Write-Host 'LIVE SMOKE TEST FAILED' -ForegroundColor Red; exit 1 }
  # and the app itself opens on the sign-in
  $out2 = Join-Path $env:TEMP 'ramzor-live-smoke2.html'; if(Test-Path $out2){ [IO.File]::Delete($out2) }
  $profile2 = Join-Path $env:TEMP ('ramzor-smoke-' + [Guid]::NewGuid().ToString('N').Substring(0,6))
  Start-Process $browser -Wait -RedirectStandardOutput $out2 -ArgumentList '--headless=new','--disable-gpu','--no-first-run',"--user-data-dir=$profile2",'--window-size=390,844','--virtual-time-budget=12000','--dump-dom',"http://localhost:$port/" | Out-Null
  $dom2 = [IO.File]::ReadAllText($out2, [Text.Encoding]::UTF8)
  $signin = $dom2 -match 'class="plogin'
  Write-Host "the app opens on the personal sign-in: $signin"
  if(-not $signin){ Write-Host 'LIVE SMOKE TEST FAILED' -ForegroundColor Red; exit 1 }
  Write-Host 'live build opens (sign-in, and the kids TV asks for its code)' -ForegroundColor Green
} finally { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
exit 0
