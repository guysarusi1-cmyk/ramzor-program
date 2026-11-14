# Builds the small site of ONE product for ONE organisation (Guy 2026-11-13: three products, each organisation in its own database).
#   .\build-product.ps1 -Product shibutz -Org demo   -> dist\product-shibutz-demo\index.html
# The product's page and shell are in products\<product>\; the screens it shows are modules of src\scripts, taken as they are
# (the list below); the styles are all of src\styles, so the look is the same as in the big site.
# The organisation's settings are in config\org-<org>.json: supabaseUrl, anonKey (the public key), orgName, demoTools.
param(
  [Parameter(Mandatory)][ValidateSet('shibutz')][string]$Product,
  [Parameter(Mandatory)][string]$Org,
  [string]$Out
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Read-Text($p){ [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

$modules = @{ shibutz = @('14zj-simple-prefs.js', '14zq-twoweek.js') }          # which screens each product has

$cfgPath = Join-Path $root "config\org-$Org.json"
if(-not (Test-Path $cfgPath)){ throw "missing $cfgPath" }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($k in 'supabaseUrl', 'anonKey', 'orgName'){ if(-not $cfg.$k -or "$($cfg.$k)" -like '*PUT-*'){ throw "config\org-$Org.json: '$k' is not filled in yet" } }

$dir = Join-Path $root "products\$Product"
$css = (Get-ChildItem (Join-Path $root 'src\styles') -Filter *.css | Sort-Object Name | ForEach-Object { Read-Text $_.FullName }) -join ''
$js  = (Read-Text (Join-Path $dir 'shell.js')) + (($modules[$Product] | ForEach-Object { Read-Text (Join-Path $root "src\scripts\$_") }) -join '')
$html = Read-Text (Join-Path $dir 'template.html')
$vendor = Read-Text (Join-Path $root 'src\vendor\supabase-js-2.117.2.js')
$html = $html.Replace('{{CSS}}', $css).Replace('{{JS}}', $js).Replace('{{VENDOR_SUPABASE}}', $vendor)
$html = [regex]::Replace($html, '@config\((\w+)\)', { param($m) $v = $cfg.($m.Groups[1].Value); if($null -eq $v){ throw "config key missing: $($m.Groups[1].Value)" }; [string]$v })
# the styles carry pictures of the big site (@asset): this small site does not use them
$html = [regex]::Replace($html, '@asset\(([^)]+)\)', 'data:,')

if(-not $Out){ $Out = Join-Path $root "dist\product-$Product-$Org\index.html" }
New-Item -ItemType Directory -Force (Split-Path $Out -Parent) | Out-Null
[System.IO.File]::WriteAllText($Out, $html, $utf8)
Write-Output "built product [$Product] for [$Org] -> $Out ($($html.Length) chars)"
