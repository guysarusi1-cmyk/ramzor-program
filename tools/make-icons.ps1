# Generates the app icons (line-art traffic light on the app's dark navy; neutral colours on purpose —
# the programme colours carry professional meaning, so none are used decoratively).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root 'src\public\icons'
New-Item -ItemType Directory -Force $dir | Out-Null

function New-Icon([int]$size, [string]$name, [double]$safe, [bool]$rounded){
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $bg = [System.Drawing.Color]::FromArgb(255, 18, 23, 42)       # #12172A
  $fg = [System.Drawing.Color]::FromArgb(255, 242, 239, 230)    # #F2EFE6
  if($rounded){
    $r = $size * 0.22
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0,0,$r*2,$r*2,180,90); $path.AddArc($size-$r*2,0,$r*2,$r*2,270,90)
    $path.AddArc($size-$r*2,$size-$r*2,$r*2,$r*2,0,90); $path.AddArc(0,$size-$r*2,$r*2,$r*2,90,90); $path.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush $bg), $path)
  } else { $g.Clear($bg) }                                        # maskable / apple: full bleed, the OS rounds it
  $pen = New-Object System.Drawing.Pen $fg, ($size * 0.035)
  $pen.LineJoin = 'Round'
  # traffic light body, centred, scaled into the safe zone
  $h = $size * $safe; $w = $h * 0.46
  $x = ($size - $w)/2; $y = ($size - $h)/2
  $rad = $w * 0.30
  $body = New-Object System.Drawing.Drawing2D.GraphicsPath
  $body.AddArc($x,$y,$rad*2,$rad*2,180,90); $body.AddArc($x+$w-$rad*2,$y,$rad*2,$rad*2,270,90)
  $body.AddArc($x+$w-$rad*2,$y+$h-$rad*2,$rad*2,$rad*2,0,90); $body.AddArc($x,$y+$h-$rad*2,$rad*2,$rad*2,90,90); $body.CloseFigure()
  $g.DrawPath($pen, $body)
  $lamp = $w * 0.46
  for($i=0;$i -lt 3;$i++){
    $cy = $y + $h * (0.2 + 0.3*$i)
    $g.DrawEllipse($pen, ($size-$lamp)/2, $cy-$lamp/2, $lamp, $lamp)
  }
  $bmp.Save((Join-Path $dir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
New-Icon 192 'icon-192.png' 0.62 $true
New-Icon 512 'icon-512.png' 0.62 $true
New-Icon 512 'icon-maskable-512.png' 0.44 $false
New-Icon 180 'apple-touch-icon.png' 0.50 $false
Get-ChildItem $dir | Select-Object Name, Length | Format-Table -AutoSize | Out-String
