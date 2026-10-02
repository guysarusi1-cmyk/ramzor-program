# Runs the automatic checks of the whole app in a hidden browser (phone, desktop and TV sizes).
# Exit code 0 = everything passed; anything else = something is broken (details are printed).
#   .\tests\run-checks.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$port = 5188
$browser = @('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe','C:\Program Files\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
if(-not $browser){ throw 'no Chrome/Edge found' }

& (Join-Path $root 'build.ps1') -Env test | Out-Null
$resultFile = Join-Path $env:TEMP 'ramzor-check-results.json'
$server = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'tools\serve-folder.ps1'),'-Dir',(Join-Path $root 'dist\test'),'-Port',$port,'-ResultFile',$resultFile
Start-Sleep -Seconds 2
$allOk = $true
try {
  foreach($size in @(@('phone','390,844'), @('desktop','1280,800'), @('tv','1920,1080'))){
    if(Test-Path $resultFile){ [IO.File]::Delete($resultFile) }
    $profile = Join-Path $env:TEMP ('ramzor-check-profile-' + $size[0] + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6))
    Start-Process $browser -ArgumentList '--headless=new','--disable-gpu','--no-first-run',"--user-data-dir=$profile","--window-size=$($size[1])","http://localhost:$port/?runchecks" | Out-Null
    $waited = 0
    while(-not (Test-Path $resultFile) -and $waited -lt 120){ Start-Sleep -Seconds 1; $waited++ }
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    if(-not (Test-Path $resultFile)){ Write-Host "[$($size[0])] no result within 120 s" -ForegroundColor Red; $allOk = $false; continue }
    Start-Sleep -Milliseconds 300
    $res = Get-Content $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $bad = @($res.results | Where-Object { -not $_.ok })
    if($bad.Count -eq 0){ Write-Host "[$($size[0])] all $($res.total) checks passed" -ForegroundColor Green }
    else {
      $allOk = $false
      Write-Host "[$($size[0])] $($bad.Count) of $($res.total) checks FAILED:" -ForegroundColor Red
      $bad | ForEach-Object { Write-Host "   - $($_.name): $($_.detail)" }
    }
  }
} finally { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
if($allOk){ exit 0 } else { exit 1 }
