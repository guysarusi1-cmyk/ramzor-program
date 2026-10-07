# Puts the TEST version on its own address, so that it can be tried from a phone. It is a copy WITHOUT the automatic checks and demo modes (no test password inside).
# Own repository (ramzor-test), separate from the real site, so the real site is never touched.
#   .\tools\publish-test.ps1              -> only builds and shows what would be published
#   .\tools\publish-test.ps1 -Approved    -> creates / updates the repository and the address (only after Guy says yes)
param([switch]$Approved)
$ErrorActionPreference = 'Stop'
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$root = Split-Path $PSScriptRoot -Parent
$site = Join-Path $root 'dist\test-site'
& (Join-Path $root 'build.ps1') -Env test -NoTools -Out (Join-Path $site 'index.html') | Out-Null
$html = [IO.File]::ReadAllText((Join-Path $site 'index.html'))
$cfg = Get-Content (Join-Path $root 'config\test.json') -Raw | ConvertFrom-Json
foreach($k in 'testPassword','testManagerPassword','testPersonalPassword'){ if($html.Contains([string]$cfg.$k)){ throw "the test build contains $k - not publishing" } }
if($html.Contains('runchecks')){ throw 'the test build still has the automatic checks - not publishing' }
Write-Host ("built {0:N0} chars, no test password inside" -f $html.Length)
if(-not $Approved){ Write-Host 'dry run: nothing published (add -Approved)'; return }
$owner = (gh api user --jq .login).Trim(); $repo = "$owner/ramzor-test"
$exists = $true; try { gh repo view $repo --json name 2>$null | Out-Null; if($LASTEXITCODE -ne 0){ $exists = $false } } catch { $exists = $false }
if(-not $exists){ gh repo create $repo --public --description "Test version of the Ramzor program (no real data on this page)" | Out-Null }
Set-Location $site
if(-not (Test-Path '.git')){ git init -b main | Out-Null; git remote add origin "https://github.com/$repo.git" }
git config user.name 'Claude (dev)'; git config user.email "$owner@users.noreply.github.com"
git add -A; git commit -q -m 'Test version' 2>$null
git push -f -u origin main 2>&1 | Select-Object -Last 1
gh api -X POST "repos/$repo/pages" -f 'source[branch]=main' -f 'source[path]=/' 2>$null | Out-Null
Write-Host "address (ready in a minute or two): https://$owner.github.io/ramzor-test/"