# Test environment dev server: rebuilds the TEST build whenever anything in src/ or config/ changes,
# serves it at http://localhost:5173 and tells open pages to reload (see the live-reload block in the template).
param([int]$Port = 5173)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$out  = Join-Path $root 'dist\test'
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
           '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml';
           '.webmanifest'='application/manifest+json; charset=utf-8'; '.txt'='text/plain; charset=utf-8' }

function Newest-Source {
  (Get-ChildItem (Join-Path $root 'src'), (Join-Path $root 'config') -Recurse -File -ErrorAction SilentlyContinue |
    Measure-Object LastWriteTimeUtc -Maximum).Maximum
}
function Build-Test {
  try {
    & (Join-Path $root 'build.ps1') -Env test | Out-Null
    $script:buildId = [string][DateTime]::UtcNow.Ticks
    Write-Host ("[{0}] rebuilt" -f (Get-Date -Format HH:mm:ss))
  } catch { Write-Host ("[{0}] BUILD FAILED: {1}" -f (Get-Date -Format HH:mm:ss), $_.Exception.Message) }
}

$script:buildId = '0'
Build-Test
$seen = Newest-Source

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Test environment ready: http://localhost:$Port/"

$pending = $listener.GetContextAsync()
while($listener.IsListening){
  $now = Newest-Source
  if($now -gt $seen){ Start-Sleep -Milliseconds 300; $seen = Newest-Source; Build-Test }

  if(-not $pending.Wait(500)){ continue }
  $ctx = $pending.Result
  $pending = $listener.GetContextAsync()
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if($path -eq '/__build-id'){
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($script:buildId); $res.ContentType = 'text/plain'
    } else {
      $rel = $path.TrimStart('/'); if([string]::IsNullOrWhiteSpace($rel)){ $rel = 'index.html' }
      $file = Join-Path $out ($rel -replace '/','\')
      if((Test-Path $file -PathType Leaf) -and ($file.StartsWith($out))){
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if($mime.ContainsKey($ext)){ $mime[$ext] } else { 'application/octet-stream' }
      } else { $res.StatusCode = 404; $bytes = [byte[]]@() }
    }
    $res.Headers.Add('Cache-Control','no-store')
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch { } finally { try { $res.OutputStream.Close() } catch { } }
}
