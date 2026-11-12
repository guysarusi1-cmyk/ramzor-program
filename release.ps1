# Publishes the LIVE build to the real site. Nothing is published unless -Approved is passed — and
# I only pass it after Guy says it's OK to publish.
#   .\release.ps1 -Message "short description"            -> dry run: checks, build, backups, shows what would change
#   .\release.ps1 -Message "short description" -Approved   -> same, then publishes (main branch -> GitHub Pages)
#   -Full : all the checks, even when only the steps that failed last time could run again
# After a release that failed in the checks, the next one runs again only the steps that failed (in all three sizes), when the site's own code
# (src\ without the checks, config\, build.ps1) is the same and less than 24 hours passed; anything else: all the checks (Guy 2026-11-09)
param(
  [Parameter(Mandatory)][string]$Message,
  [switch]$Approved,
  [switch]$Full
)
$ErrorActionPreference = 'Stop'
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$root = $PSScriptRoot
Set-Location $root
function Step($t){ Write-Host "`n== $t" -ForegroundColor Cyan }
function Invoke-Git { $ErrorActionPreference = 'Continue'; & git.exe @args 2>&1 | ForEach-Object { "$_" }; if($LASTEXITCODE -ne 0){ throw "git $($args -join ' ') failed" } }          # (git writes its progress to stderr: that is not a failure; only the exit code counts)

Step "1/6 working tree must be committed on dev"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if($branch -ne 'dev'){ throw "run from the dev branch (currently '$branch')" }
if(git status --porcelain){ throw "uncommitted changes — commit them first" }

# the rights matrix (task 3, Guy 2026-11-12): if somebody can read more than what Guy approved (tests/rls-expected.json), nothing goes up.
# TEST database only, reads only; about 3 minutes, so it runs before the long checks.
Step "1b the rights matrix (who can read what)"
$rls = Join-Path (Join-Path $root 'tests') 'rls-matrix.py'
if(-not (Test-Path $rls)){ throw "the rights matrix is missing (tests/rls-matrix.py) - not releasing" }
& python $rls --auto; if($LASTEXITCODE -ne 0){ throw "the rights matrix found a deviation - not releasing (python tests/rls-matrix.py --auto)" }

Step "2/6 automated checks (all screens and flows)"
$checks = Join-Path $root 'tests\run-checks.ps1'
if(-not (Test-Path $checks)){ throw "check suite missing (tests\run-checks.ps1) — not releasing" }
# the site's own code: what the live file is built from (the checks file is not part of it)
function Get-SiteHash {
  $files = @(Get-ChildItem (Join-Path $root 'src') -Recurse -File | Where-Object { $_.Name -ne '18-checks.js' }) + @(Get-ChildItem (Join-Path $root 'config') -File) + @(Get-Item (Join-Path $root 'build.ps1'))
  $sb = New-Object Text.StringBuilder
  foreach($f in ($files | Sort-Object FullName)){ [void]$sb.Append($f.FullName.Substring($root.Length)).Append(':').Append((Get-FileHash $f.FullName -Algorithm SHA256).Hash).Append(';') }
  $bytes = [Text.Encoding]::UTF8.GetBytes($sb.ToString())
  return ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes))).Replace('-', '')
}
$stateFile = Join-Path $env:TEMP 'ramzor-release-checks-state.json'
$siteHash = Get-SiteHash
$state = $null
if((Test-Path $stateFile) -and -not $Full){ try { $state = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $state = $null } }
$partial = $false
if($state){
  $age = ((Get-Date) - [datetime]::Parse($state.since)).TotalHours
  if($state.siteHash -ne $siteHash){ Write-Host "the site's code changed since the failed run: all the checks" -ForegroundColor Yellow }
  elseif($age -ge 24){ Write-Host ("the failed run was {0:N0} hours ago (24 or more): all the checks" -f $age) -ForegroundColor Yellow }
  elseif(@($state.failed).Count -gt 0){ $partial = $true }
}
if($Full){ Write-Host "-Full: all the checks" -ForegroundColor Yellow }
$runStart = Get-Date
if($partial){
  $failedBefore = @($state.failed)
  Write-Host ("running again only the {0} step(s) that failed: {1}" -f $failedBefore.Count, ($failedBefore -join ' | ')) -ForegroundColor Yellow
  Write-Host ("the other {0} step(s) passed in the run of {1} (same site code)" -f (@($state.allSteps).Count - $failedBefore.Count), ([datetime]::Parse($state.since)).ToString('dd/MM HH:mm')) -ForegroundColor Yellow
  & $checks -Sizes 'phone,desktop,tv' -Only ($failedBefore -join '|')
} else { & $checks -Sizes 'phone,desktop,tv' }
if($LASTEXITCODE -ne 0){
  # which steps failed, from this run's results of each size; a size with no result, or a failure outside any step: next time all the checks
  $failedNow = @(); $allNow = @(); $clear = $true
  foreach($sz in 'phone','desktop','tv'){
    $f = Join-Path $env:TEMP "ramzor-check-results-$sz.json"
    if(-not (Test-Path $f) -or (Get-Item $f).LastWriteTime -lt $runStart){ $clear = $false; continue }
    $res = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
    $allNow += @($res.steps)
    foreach($b in @($res.results | Where-Object { -not $_.ok })){ if($b.step){ $failedNow += $b.step } else { $clear = $false } }
  }
  $failedNow = @($failedNow | Select-Object -Unique)
  if($clear -and $failedNow.Count -gt 0){
    $since = if($partial){ $state.since } else { $runStart.ToString('o') }
    $all = if($partial){ @($state.allSteps) } else { @($allNow | Select-Object -Unique) }
    [IO.File]::WriteAllText($stateFile, (@{ siteHash = $siteHash; since = $since; failed = $failedNow; allSteps = $all } | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
    throw ("automated checks failed — not releasing. Next release (same site code, within 24 hours of {0}) runs again only: {1}" -f ([datetime]::Parse($since)).ToString('dd/MM HH:mm'), ($failedNow -join ' | '))
  }
  if(Test-Path $stateFile){ Remove-Item $stateFile -Force }
  throw "automated checks failed — not releasing (next release: all the checks)"
}
if(Test-Path $stateFile){ Remove-Item $stateFile -Force }          # (every step passed: within 24 hours, with the same site code)
& (Join-Path $root 'tests\offline-check.ps1'); if($LASTEXITCODE -ne 0){ throw "offline check failed — not releasing" }

Step "3/6 build the live file"
& (Join-Path $root 'build.ps1') -Env live
$new = Join-Path $root 'dist\live\index.html'
& (Join-Path $root 'tests\live-smoke.ps1'); if($LASTEXITCODE -ne 0){ throw "live build smoke test failed — not releasing" }

Step "4/6 backups (code tag + read-only copy of the real data)"
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
& (Join-Path $root 'tools\backup-live-data.ps1')
Invoke-Git fetch origin main
$backupFile = "C:\dev\ramzor-backups\site_before_$stamp.html"
cmd /c "git show origin/main:index.html > `"$backupFile`""   # cmd redirect keeps the raw bytes
if($LASTEXITCODE -ne 0){ throw "could not save the current live site" }
Write-Host "previous live site saved -> $backupFile"

Step "5/6 what changes on the live site"
$oldHash = (Get-FileHash $backupFile).Hash; $newHash = (Get-FileHash $new).Hash
"live now : $((Get-Item $backupFile).Length) bytes"
"will be  : $((Get-Item $new).Length) bytes"
if($oldHash -eq $newHash){ Write-Host "identical to what is live — nothing to publish" -ForegroundColor Yellow; return }

if(-not $Approved){ Write-Host "`nDRY RUN finished — not published (no -Approved)." -ForegroundColor Yellow; return }

Step "6/6 publish"
Invoke-Git tag "backup/$stamp" origin/main
Invoke-Git push origin "backup/$stamp"
Invoke-Git checkout main
Invoke-Git pull --ff-only origin main
Invoke-Git merge --no-edit dev
Copy-Item (Join-Path $root 'dist\live\*') $root -Recurse -Force   # index.html + manifest + sw.js + icons
Invoke-Git add -A
$msgFile = Join-Path $env:TEMP 'ramzor-release-msg.txt'; [IO.File]::WriteAllText($msgFile, "Release: $Message", (New-Object Text.UTF8Encoding $false))          # (from a file: quotes in the message, like סופ"ש, broke the command line)
Invoke-Git commit -F $msgFile
Invoke-Git push origin main
Invoke-Git checkout dev
Invoke-Git merge --ff-only main
Invoke-Git push origin dev
Write-Host "`nPUBLISHED. GitHub Pages updates within ~1-2 minutes. Rollback: tag backup/$stamp, or $backupFile" -ForegroundColor Green
