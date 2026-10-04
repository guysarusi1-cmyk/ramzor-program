# READ-ONLY backup of the live data (children, stars, progress, lists, events) to C:\dev\ramzor-backups\.
# It only reads — it cannot change anything. Backups stay on this computer (never in git).
# Since the privacy hardening (supabase\hardening.sql) the public key may read only each child's first name
# and initial. For a COMPLETE copy of the roster (age, social workers) set the staff password for this
# session first:   $env:RAMZOR_STAFF_PASSWORD = '<the staff password>'   (never saved anywhere).
param([string]$Dir = 'C:\dev\ramzor-backups')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root 'config\live.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$token = $cfg.anonKey
$signedIn = $false
if($env:RAMZOR_STAFF_PASSWORD){
  $login = Invoke-RestMethod -Method Post -Uri "$($cfg.supabaseUrl)/auth/v1/token?grant_type=password" -Headers @{ apikey = $cfg.anonKey } -ContentType 'application/json' -Body (@{ email = 'staff@merkaz-cherum.local'; password = $env:RAMZOR_STAFF_PASSWORD } | ConvertTo-Json)
  $token = $login.access_token; $signedIn = $true
}
$h = @{ apikey = $cfg.anonKey; Authorization = "Bearer $token" }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$dest = Join-Path $Dir "data_$stamp"
New-Item -ItemType Directory -Force $dest | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$counts = [ordered]@{}
$partial = $false
foreach($t in 'roster','child_state','mini_lists','feedback_events','bonus_revocations'){
  try { $rows = Invoke-RestMethod -Uri "$($cfg.supabaseUrl)/rest/v1/${t}?select=*&limit=100000" -Headers $h }
  catch {
    if($t -ne 'roster'){ throw }
    # hardening is on and nobody is signed in: only the public columns can be read
    $rows = Invoke-RestMethod -Uri "$($cfg.supabaseUrl)/rest/v1/roster?select=id,first_name,last_initial&limit=100000" -Headers $h
    $partial = $true
  }
  $json = ConvertTo-Json -InputObject @($rows) -Depth 20
  [System.IO.File]::WriteAllText((Join-Path $dest "$t.json"), $json, $utf8)
  $counts[$t] = @($rows).Count
}
$summary = ($counts.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', '
Write-Output "data backup -> $dest  ($summary)"
if($partial){ Write-Host 'NOTE: the roster copy has names only (no age / social workers) because the privacy hardening is on. Set $env:RAMZOR_STAFF_PASSWORD for a full copy.' -ForegroundColor Yellow }
