param([string]$Dir, [int]$Port = 5199, [string]$ResultFile)
# Tiny static server, used to try a finished build locally and by tests\run-checks.ps1.
# With -ResultFile it also accepts POST /__results (the in-page checks report back through that).
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.png'='image/png'; '.webmanifest'='application/manifest+json'; '.json'='application/json' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "serving $Dir on http://localhost:$Port/"
while($true){
  $c = $l.GetContext()
  try {
    if($c.Request.HttpMethod -eq 'POST' -and $c.Request.Url.LocalPath -eq '/__results' -and $ResultFile){
      $sr = New-Object IO.StreamReader($c.Request.InputStream, [Text.Encoding]::UTF8)
      [IO.File]::WriteAllText($ResultFile, $sr.ReadToEnd(), (New-Object Text.UTF8Encoding($false)))
      $c.Response.StatusCode = 204
    } else {
      $p = $c.Request.Url.LocalPath; if($p -eq '/'){ $p = '/index.html' }
      $f = Join-Path $Dir ($p.TrimStart('/') -replace '/','\')
      if(Test-Path $f -PathType Leaf){
        $b = [IO.File]::ReadAllBytes($f)
        $c.Response.ContentType = $types[[IO.Path]::GetExtension($f)]
        $c.Response.Headers.Add('Cache-Control','no-store')
        $c.Response.OutputStream.Write($b,0,$b.Length)
      } else { $c.Response.StatusCode = 404 }
    }
  } catch { }
  $c.Response.Close()
}
