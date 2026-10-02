# Publishes the LIVE build to the real site. Nothing is published unless -Approved is passed — and
# I only pass it after Guy says it's OK to publish.
#   .\release.ps1 -Message "short description"            -> dry run: checks, build, backups, shows what would change
#   .\release.ps1 -Message "short description" -Approved   -> same, then publishes (main branch -> GitHub Pages)
param(
  [Parameter(Mandatory)][string]$Message,
  [switch]$Approved
)
$ErrorActionPreference = 'Stop'
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$root = $PSScriptRoot
Set-Location $root
function Step($t){ Write-Host "`n== $t" -ForegroundColor Cyan }
function Git { & git @args; if($LASTEXITCODE -ne 0){ throw "git $($args -join ' ') failed" } }

Step "1/6 working tree must be committed on dev"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if($branch -ne 'dev'){ throw "run from the dev branch (currently '$branch')" }
if(git status --porcelain){ throw "uncommitted changes — commit them first" }

Step "2/6 automated checks (all screens and flows)"
$checks = Join-Path $root 'tests\run-checks.ps1'
if(Test-Path $checks){ & $checks; if($LASTEXITCODE -ne 0){ throw "automated checks failed — not releasing" } }
else { Write-Host "(no check suite installed yet)" -ForegroundColor Yellow }

Step "3/6 build the live file"
& (Join-Path $root 'build.ps1') -Env live
$new = Join-Path $root 'dist\live\index.html'

Step "4/6 backups (code tag + read-only copy of the real data)"
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
& (Join-Path $root 'tools\backup-live-data.ps1')
Git fetch origin main
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
Git tag "backup/$stamp" origin/main
Git push origin "backup/$stamp"
Git checkout main
Git pull --ff-only origin main
Git merge --no-edit dev
Copy-Item $new (Join-Path $root 'index.html') -Force
Git add -A
Git commit -m "Release: $Message"
Git push origin main
Git checkout dev
Git merge --ff-only main
Git push origin dev
Write-Host "`nPUBLISHED. GitHub Pages updates within ~1-2 minutes. Rollback: tag backup/$stamp, or $backupFile" -ForegroundColor Green
