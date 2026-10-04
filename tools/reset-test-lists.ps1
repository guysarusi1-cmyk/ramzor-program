# Puts the TEST project's bonus lists, duty roster and ship choices back to the starting data of
# supabase\test-project-setup.sql (useful if an automatic check run was interrupted half-way).
# Only ever talks to the test project (config\test.json) — never the live site.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cfg = Get-Content (Join-Path $root 'config\test.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($cfg.env -ne 'test'){ throw 'config\test.json is not a test config' }
$sql = [IO.File]::ReadAllText((Join-Path $root 'supabase\test-project-setup.sql'), [Text.Encoding]::UTF8)

$login = Invoke-RestMethod -Method Post -Uri "$($cfg.supabaseUrl)/auth/v1/token?grant_type=password" -Headers @{ apikey = $cfg.anonKey } -ContentType 'application/json' -Body (@{ email = 'staff@merkaz-cherum.local'; password = $cfg.testPassword } | ConvertTo-Json)
$h = @{ apikey = $cfg.anonKey; Authorization = "Bearer $($login.access_token)"; Prefer = 'resolution=merge-duplicates' }

foreach($m in [regex]::Matches($sql, "\('(bonusesDaily|bonusesWeekly|dutyRoster)',\s*'(.*?)'::jsonb\)", 'Singleline')){
  $key = $m.Groups[1].Value; $items = $m.Groups[2].Value | ConvertFrom-Json
  $body = [Text.Encoding]::UTF8.GetBytes((@{ key = $key; items = @($items) } | ConvertTo-Json -Depth 8 -Compress))
  Invoke-RestMethod -Method Post -Uri "$($cfg.supabaseUrl)/rest/v1/mini_lists" -Headers $h -ContentType 'application/json; charset=utf-8' -Body $body | Out-Null
  Write-Host "reset list: $key"
}
$body = [Text.Encoding]::UTF8.GetBytes('{"key":"childSettings","items":[]}')
Invoke-RestMethod -Method Post -Uri "$($cfg.supabaseUrl)/rest/v1/mini_lists" -Headers $h -ContentType 'application/json; charset=utf-8' -Body $body | Out-Null
Write-Host 'reset list: childSettings (empty)'
$body = [Text.Encoding]::UTF8.GetBytes('{"key":"managerLock","items":[]}')
Invoke-RestMethod -Method Post -Uri "$($cfg.supabaseUrl)/rest/v1/mini_lists" -Headers $h -ContentType 'application/json; charset=utf-8' -Body $body | Out-Null
Write-Host 'reset list: managerLock (no code)'
# children added by an interrupted check run
$roster = Invoke-RestMethod -Uri "$($cfg.supabaseUrl)/rest/v1/roster?select=id" -Headers $h
foreach($r in $roster){ if($r.id -notmatch '^c([1-9]|1[0-4])$'){ Invoke-RestMethod -Method Delete -Uri "$($cfg.supabaseUrl)/rest/v1/roster?id=eq.$($r.id)" -Headers $h | Out-Null; Write-Host "removed stray child $($r.id)" } }

# bonus revocations left by earlier check runs (staff may delete them since supabase\hardening.sql)
try { Invoke-RestMethod -Method Delete -Uri "$($cfg.supabaseUrl)/rest/v1/bonus_revocations?id=not.is.null" -Headers $h | Out-Null; Write-Host 'cleared test bonus revocations' } catch { Write-Host 'could not clear test revocations (run supabase\hardening.sql in the test project)' }
