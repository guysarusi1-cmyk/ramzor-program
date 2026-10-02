# One-off: split the legacy single-file app into src/ (lossless — build.ps1 must rebuild it byte-for-byte).
param([string]$Legacy = "C:\Users\Admin\OneDrive\Desktop\מרכז חירום\אתר הרמזור\traffic-light-app.html")
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object System.Text.UTF8Encoding($false)
$t = [System.IO.File]::ReadAllText($Legacy)

$cssStart = $t.IndexOf("<style>") + 7
$cssEnd   = $t.IndexOf("</style>")
$jsOpen   = $t.IndexOf("<script>", $t.IndexOf("supabase.js"))
$jsStart  = $jsOpen + 8
$jsEnd    = $t.LastIndexOf("</script>")

$template = $t.Substring(0, $cssStart) + "{{CSS}}" + $t.Substring($cssEnd, $jsStart - $cssEnd) + "{{JS}}" + $t.Substring($jsEnd)
$css = $t.Substring($cssStart, $cssEnd - $cssStart)
$js  = $t.Substring($jsStart, $jsEnd - $jsStart)

# ---- images -> assets, replaced by @asset(name) tokens
$assetDir = Join-Path $repo "src\assets"
New-Item -ItemType Directory -Force (Join-Path $assetDir "boards"), (Join-Path $assetDir "ships") | Out-Null
$map = [ordered]@{}
function Save-Asset([string]$dataUri, [string]$relPath){
  $m = [regex]::Match($dataUri, '^data:(image/[a-z0-9+.-]+);base64,(.+)$')
  $bytes = [Convert]::FromBase64String($m.Groups[2].Value)
  if([Convert]::ToBase64String($bytes) -ne $m.Groups[2].Value){ throw "non-canonical base64 for $relPath" }
  [System.IO.File]::WriteAllBytes((Join-Path $assetDir $relPath), $bytes)
  return $m.Groups[1].Value
}

# CSS backgrounds (3): board backgrounds, in order of appearance
$boardNames = @('star-board','moon-board','mercury-board')
$i = 0
$css = [regex]::Replace($css, 'data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+', {
  param($m)
  $name = $boardNames[$script:i]; $script:i++
  $ext = if($m.Groups[1].Value -eq 'jpeg'){ 'jpg' } else { $m.Groups[1].Value }
  Save-Asset $m.Value ("boards\$name.$ext") | Out-Null
  return "@asset(boards/$name.$ext)"
})
if($i -ne 3){ throw "expected 3 css images, found $i" }

# JS ship constants (9)
$js = [regex]::Replace($js, "const (SHIP_\w+) = '(data:image/png;base64,[A-Za-z0-9+/=]+)';", {
  param($m)
  $name = $m.Groups[1].Value
  Save-Asset $m.Groups[2].Value ("ships\$name.png") | Out-Null
  return "const $name = '@asset(ships/$name.png)';"
})

# ---- split CSS at top-level comment markers (lossless: boundaries fall between characters)
$cssCuts = @(
  @{ at = 0;                                                         file = '01-base.css' },
  @{ at = $css.IndexOf('/* Traffic light signature element */');   file = '02-components.css' },
  @{ at = $css.IndexOf('/* ---- recreated star board');             file = '03-boards.css' },
  @{ at = $css.IndexOf('/* ---- staff drill-down screens ---- */'); file = '04-screens.css' }
)
foreach($c in $cssCuts){ if($c.at -lt 0){ throw "css marker missing for $($c.file)" } }
$cssDir = Join-Path $repo "src\styles"; New-Item -ItemType Directory -Force $cssDir | Out-Null
for($k=0;$k -lt $cssCuts.Count;$k++){
  $from = $cssCuts[$k].at; $to = if($k+1 -lt $cssCuts.Count){ $cssCuts[$k+1].at } else { $css.Length }
  [System.IO.File]::WriteAllText((Join-Path $cssDir $cssCuts[$k].file), $css.Substring($from, $to-$from), $utf8)
}

# ---- split JS at its section markers
$markers = [regex]::Matches($js, '(?m)^// -{5,}.*$')
$names = @('01-config','02-program-data','03-storage','04-bonus-logic','05-toast','06-tabs','07-protocol-card','08-roster-admin','09-admin-minilists','10-staff-state','11-guided-protocols','12-display-view','13-carousel','14-auth','15-kids-quick','16-init')
if($markers.Count -ne $names.Count){ throw "expected $($names.Count) js sections, found $($markers.Count)" }
$jsDir = Join-Path $repo "src\scripts"; New-Item -ItemType Directory -Force $jsDir | Out-Null
for($k=0;$k -lt $markers.Count;$k++){
  $from = if($k -eq 0){ 0 } else { $markers[$k].Index }
  $to = if($k+1 -lt $markers.Count){ $markers[$k+1].Index } else { $js.Length }
  [System.IO.File]::WriteAllText((Join-Path $jsDir ($names[$k] + ".js")), $js.Substring($from, $to-$from), $utf8)
}

[System.IO.File]::WriteAllText((Join-Path $repo "src\index.template.html"), $template, $utf8)
Write-Output "split ok: template $($template.Length), css parts 4, js parts $($names.Count), assets $((Get-ChildItem $assetDir -Recurse -File).Count)"
