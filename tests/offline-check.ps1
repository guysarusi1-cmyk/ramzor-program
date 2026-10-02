# Proves the app starts and the protocols open with NO internet:
#  1. open the site once online (signs in, the service worker saves the app),
#  2. stop the server (= no connection),
#  3. open it again in the same browser profile and walk into the red protocol, step 3.
# Exit code 0 = works offline.   .\tests\offline-check.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$port = 5187
$browser = @('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
$dir = Join-Path $root 'dist\offline'
& (Join-Path $root 'build.ps1') -Env test -Out (Join-Path $dir 'index.html') | Out-Null
$profile = Join-Path $env:TEMP ('ramzor-offline-' + [Guid]::NewGuid().ToString('N').Substring(0,6))

function Start-Server { Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'tools\serve-folder.ps1'),'-Dir',$dir,'-Port',$port }
function Dump($query, $budget){
  $out = Join-Path $env:TEMP 'ramzor-offline-dom.html'
  if(Test-Path $out){ [IO.File]::Delete($out) }
  $p = Start-Process $browser -Wait -PassThru -RedirectStandardOutput $out -ArgumentList '--headless=new','--disable-gpu','--no-first-run',"--user-data-dir=$profile",'--window-size=520,900',"--virtual-time-budget=$budget",'--dump-dom',"http://localhost:$port/?$query"
  return [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8)
}

$server = Start-Server
try {
  Start-Sleep -Seconds 2
  $online = Dump 'demo=hub' 20000
  Write-Host ("online visit: " + $(if($online -match 'view-hub'){ 'page loaded' } else { 'PAGE DID NOT LOAD' }))
} finally { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# no server now = no connection
$offline = Dump 'demo=guided-red-3' 30000
$ok = ($offline -match 'id="login-password"') -and ($offline -match '3 מתוך 8')
if($ok){ Write-Host 'OFFLINE: the app opened and the red protocol reached step 3 of 8 without any connection' -ForegroundColor Green; exit 0 }
Write-Host 'OFFLINE CHECK FAILED' -ForegroundColor Red
Write-Host ('page loaded: ' + ($offline -match 'id="login-password"') + ' | protocol step 3 shown: ' + ($offline -match '3 מתוך 8'))
exit 1
