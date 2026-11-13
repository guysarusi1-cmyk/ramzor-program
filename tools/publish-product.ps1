# Puts the small site of one product for one organisation on its own address (GitHub Pages, a repository of its own).
#   .\tools\publish-product.ps1 -Product shibutz -Org demo -Repo mercury-shibutzim              -> only builds and shows what would be published
#   .\tools\publish-product.ps1 -Product shibutz -Org demo -Repo mercury-shibutzim -Approved    -> creates / updates the repository and the address (only after Guy says yes)
# The page holds no password: only the organisation's public address and public key (config\org-<org>.json).
param([Parameter(Mandatory)][string]$Product, [Parameter(Mandatory)][string]$Org, [Parameter(Mandatory)][string]$Repo, [switch]$Approved)
$ErrorActionPreference = 'Stop'
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$root = Split-Path $PSScriptRoot -Parent
$site = Join-Path $root "dist\product-$Product-$Org"
& (Join-Path $root 'build-product.ps1') -Product $Product -Org $Org -Out (Join-Path $site 'index.html') | Out-Null
$html = [IO.File]::ReadAllText((Join-Path $site 'index.html'))
$testCfg = Join-Path $root 'config\test.json'
if(Test-Path $testCfg){ $t = Get-Content $testCfg -Raw | ConvertFrom-Json; foreach($k in 'testPassword','testManagerPassword','testPersonalPassword'){ if($t.$k -and $html.Contains([string]$t.$k)){ throw "the build contains $k - not publishing" } } }
if($html.Contains('runchecks') -or $html.Contains('service_role')){ throw 'the build holds something it must not - not publishing' }
Write-Host ("built {0:N0} chars for {1}" -f $html.Length, $Repo)
if(-not $Approved){ Write-Host 'dry run: nothing published (add -Approved)'; return }
$owner = (gh api user --jq .login).Trim(); $full = "$owner/$Repo"
$exists = $true; try { gh repo view $full --json name 2>$null | Out-Null; if($LASTEXITCODE -ne 0){ $exists = $false } } catch { $exists = $false }
if(-not $exists){ gh repo create $full --public --description "Mercury: the scheduling product (one organisation's page; no data on this page)" | Out-Null }
Set-Location $site
$ErrorActionPreference = 'Continue'      # git writes harmless warnings to the error stream
if(-not (Test-Path '.git')){ git init -b main | Out-Null; git remote add origin "https://github.com/$full.git" }
git config user.name 'Claude (dev)'; git config user.email "$owner@users.noreply.github.com"
git add -A; git commit -q -m 'Product site' 2>$null
git push -f -u origin main 2>&1 | Select-Object -Last 1
gh api -X POST "repos/$full/pages" -f 'source[branch]=main' -f 'source[path]=/' 2>$null | Out-Null
Write-Host "address (ready in a minute or two): https://$owner.github.io/$Repo/"
