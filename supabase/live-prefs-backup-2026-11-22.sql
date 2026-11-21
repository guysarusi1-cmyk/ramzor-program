-- LIVE (the Ramzor database of the first site). A safety copy of every preference that was handed in, before the release of 1.3 (Guy 22.11).
-- It only COPIES: nothing in the preference tables is changed or deleted. The copies are in their own schema "backup", which the site
-- and its users cannot reach. Run once; running it again stops with "already exists" and changes nothing.
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table backup.prefs_slot_20261122       as table public.prefs_slot;
create table backup.prefs_absence_20261122    as table public.prefs_absence;
create table backup.prefs_hours_20261122      as table public.prefs_hours;
create table backup.prefs_submission_20261122 as table public.prefs_submission;
create table backup.prefs_consent_20261122    as table public.prefs_consent;
create table backup.prefs_pickone_20261122    as table public.prefs_pickone;
-- how many rows were copied (the same numbers as in the live tables)
select 'prefs_slot' as t, (select count(*) from backup.prefs_slot_20261122) as copied, (select count(*) from public.prefs_slot) as live
union all select 'prefs_absence', (select count(*) from backup.prefs_absence_20261122), (select count(*) from public.prefs_absence)
union all select 'prefs_hours', (select count(*) from backup.prefs_hours_20261122), (select count(*) from public.prefs_hours)
union all select 'prefs_submission', (select count(*) from backup.prefs_submission_20261122), (select count(*) from public.prefs_submission)
union all select 'prefs_consent', (select count(*) from backup.prefs_consent_20261122), (select count(*) from public.prefs_consent)
union all select 'prefs_pickone', (select count(*) from backup.prefs_pickone_20261122), (select count(*) from public.prefs_pickone);
