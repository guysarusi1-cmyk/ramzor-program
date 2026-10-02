# Builds the single-file site from src/.
#   .\build.ps1 -Env live   -> dist\live\index.html  (what staff use)
#   .\build.ps1 -Env test   -> dist\test\index.html  (test environment: banner, test tools, test backend)
param(
  [ValidateSet('live','test')][string]$Env = 'live',
  [string]$Out
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Read-Text($p){ [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

# inline @asset(path) tokens as data URIs
$mime = @{ '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.png'='image/png'; '.webp'='image/webp'; '.svg'='image/svg+xml' }
$assetRoot = Join-Path $root 'src\assets'
function Expand-Assets([string]$text){
  [regex]::Replace($text, '@asset\(([^)]+)\)', {
    param($m)
    $file = Join-Path $assetRoot ($m.Groups[1].Value -replace '/','\')
    if(-not (Test-Path $file)){ throw "missing asset: $($m.Groups[1].Value)" }
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    'data:' + $mime[$ext] + ';base64,' + [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($file))
  })
}

$css = (Get-ChildItem (Join-Path $root 'src\styles') -Filter *.css | Sort-Object Name | ForEach-Object { Read-Text $_.FullName }) -join ''
$js  = (Get-ChildItem (Join-Path $root 'src\scripts') -Filter *.js  | Sort-Object Name | ForEach-Object { Read-Text $_.FullName }) -join ''
$html = Read-Text (Join-Path $root 'src\index.template.html')

# String.Replace (not -replace): the payloads contain '$' characters
$html = $html.Replace('{{CSS}}', (Expand-Assets $css)).Replace('{{JS}}', (Expand-Assets $js))

if(-not $Out){ $Out = Join-Path $root "dist\$Env\index.html" }
New-Item -ItemType Directory -Force (Split-Path $Out -Parent) | Out-Null
[System.IO.File]::WriteAllText($Out, $html, $utf8)
Write-Output "built [$Env] -> $Out ($($html.Length) chars)"
