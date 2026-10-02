# Takes a screenshot of the TEST site at a given moment, in a hidden browser (virtual time, so animations are exact).
#   .\tools\snap.ps1 -Query "demo=star" -Ms 3200 -Size 1920,1080 -Out C:\dev\snap.png
param([string]$Query = 'demo=star', [int]$Ms = 3000, [string]$Size = '1920,1080', [string]$Out = (Join-Path $env:TEMP 'ramzor-snap.png'), [int]$Port = 5189)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$browser = @('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
$dir = Join-Path $root 'dist\snap'
& (Join-Path $root 'build.ps1') -Env test -Out (Join-Path $dir 'index.html') | Out-Null
$server = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'tools\serve-folder.ps1'),'-Dir',$dir,'-Port',$Port
Start-Sleep -Seconds 2
try {
  if(Test-Path $Out){ [IO.File]::Delete($Out) }
  $profile = Join-Path $env:TEMP ('ramzor-snap-' + [Guid]::NewGuid().ToString('N').Substring(0,6))
  $url = "http://localhost:$Port/?$Query"
  $w,$h = [int[]]($Size -split ',')
  if($w -lt 520){   # headless Chrome never makes a window narrower than ~500px, so phones are shown inside a frame of the right width
    [IO.File]::WriteAllText((Join-Path $dir 'frame.html'), "<!doctype html><body style='margin:0;background:#000'><iframe src='/?$Query' style='width:${w}px;height:${h}px;border:0;display:block'></iframe>")
    $url = "http://localhost:$Port/frame.html"; $Size = "520,$($h + 20)"
  }
  $p = Start-Process $browser -Wait -PassThru -ArgumentList '--headless=new','--disable-gpu','--no-first-run',"--user-data-dir=$profile","--window-size=$Size","--virtual-time-budget=$Ms","--screenshot=$Out",$url
  if(Test-Path $Out){ Write-Host "saved $Out" } else { Write-Host 'no screenshot produced' -ForegroundColor Red }
} finally { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
