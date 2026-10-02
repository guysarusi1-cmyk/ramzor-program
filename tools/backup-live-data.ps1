# READ-ONLY backup of the live data (children, stars, progress, lists, events) to C:\dev\ramzor-backups\.
# Uses only the public read key — it cannot change anything. Backups stay on this computer (never in git).
param([string]$Dir = 'C:\dev\ramzor-backups')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root 'config\live.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$h = @{ apikey = $cfg.anonKey; Authorization = "Bearer $($cfg.anonKey)" }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$dest = Join-Path $Dir "data_$stamp"
New-Item -ItemType Directory -Force $dest | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$counts = [ordered]@{}
foreach($t in 'roster','child_state','mini_lists','feedback_events','bonus_revocations'){
  $rows = Invoke-RestMethod -Uri "$($cfg.supabaseUrl)/rest/v1/${t}?select=*&limit=100000" -Headers $h
  $json = ConvertTo-Json -InputObject @($rows) -Depth 20
  [System.IO.File]::WriteAllText((Join-Path $dest "$t.json"), $json, $utf8)
  $counts[$t] = @($rows).Count
}
$summary = ($counts.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', '
Write-Output "data backup -> $dest  ($summary)"
