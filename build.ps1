# Builds the single-file site from src/.
#   .\build.ps1 -Env live   -> dist\live\index.html  (what staff use)
#   .\build.ps1 -Env test   -> dist\test\index.html  (test environment: banner, test tools, test backend, live reload)
param(
  [ValidateSet('live','test')][string]$Env = 'live',
  [string]$Out
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Read-Text($p){ [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

# ---- per-environment settings
$cfgPath = Join-Path $root "config\$Env.json"
if(-not (Test-Path $cfgPath)){ throw "missing $cfgPath" }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json

# ---- test-only blocks: removed entirely from live, markers only removed from test
function Apply-EnvBlocks([string]$text){
  $pattern = '(?s)(?:<!--@TEST-ONLY-->.*?<!--@END-TEST-ONLY-->|/\*@TEST-ONLY\*/.*?/\*@END-TEST-ONLY\*/)[ \t]*\r?\n?'
  if($Env -eq 'live'){ return [regex]::Replace($text, $pattern, '') }
  $text = $text.Replace('<!--@TEST-ONLY-->','').Replace('<!--@END-TEST-ONLY-->','').Replace('/*@TEST-ONLY*/','').Replace('/*@END-TEST-ONLY*/','')
  return $text
}

# ---- @asset(path) -> data URI, @config(key) -> value, @env@ -> env name
$mime = @{ '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.png'='image/png'; '.webp'='image/webp'; '.svg'='image/svg+xml' }
$assetRoot = Join-Path $root 'src\assets'
function Expand-Tokens([string]$text){
  $text = [regex]::Replace($text, '@asset\(([^)]+)\)', {
    param($m)
    $file = Join-Path $assetRoot ($m.Groups[1].Value -replace '/','\')
    if(-not (Test-Path $file)){ throw "missing asset: $($m.Groups[1].Value)" }
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    'data:' + $mime[$ext] + ';base64,' + [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($file))
  })
  $text = [regex]::Replace($text, '@config\((\w+)\)', {
    param($m)
    $v = $cfg.($m.Groups[1].Value)
    if($null -eq $v){ throw "config key missing: $($m.Groups[1].Value)" }
    [string]$v
  })
  return $text.Replace('@env@', $Env)
}

$css = (Get-ChildItem (Join-Path $root 'src\styles') -Filter *.css | Sort-Object Name | ForEach-Object { Read-Text $_.FullName }) -join ''
$js  = (Get-ChildItem (Join-Path $root 'src\scripts') -Filter *.js  | Sort-Object Name | ForEach-Object { Read-Text $_.FullName }) -join ''
$html = Read-Text (Join-Path $root 'src\index.template.html')

# String.Replace (not -replace): the payloads contain '$' characters
$html = $html.Replace('{{CSS}}', $css).Replace('{{JS}}', $js)
$html = Expand-Tokens (Apply-EnvBlocks $html)

if(-not $Out){ $Out = Join-Path $root "dist\$Env\index.html" }
New-Item -ItemType Directory -Force (Split-Path $Out -Parent) | Out-Null
[System.IO.File]::WriteAllText($Out, $html, $utf8)
Write-Output "built [$Env] -> $Out ($($html.Length) chars)"
