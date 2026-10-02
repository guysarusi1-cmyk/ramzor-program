param([string]$Dir, [int]$Port = 5199)
# Tiny static server, used to try a finished build (e.g. dist\live) locally before it is published.
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.png'='image/png'; '.webmanifest'='application/manifest+json'; '.json'='application/json' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "serving $Dir on http://localhost:$Port/"
while($true){
  $c = $l.GetContext()
  $p = $c.Request.Url.LocalPath; if($p -eq '/'){ $p = '/index.html' }
  $f = Join-Path $Dir ($p.TrimStart('/') -replace '/','\')
  if(Test-Path $f -PathType Leaf){
    $b = [IO.File]::ReadAllBytes($f)
    $c.Response.ContentType = $types[[IO.Path]::GetExtension($f)]
    $c.Response.OutputStream.Write($b,0,$b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}
