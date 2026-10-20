-- scheduling v30 (2026-10-20): how an instructor's preferences start every month (Guy). Run once, after v29. Safe to run again.
--   * staff_settings.pref_start: null = every shift starts unmarked (as until now), 'yes' = all start "כן", 'no' = all start "לא".
--     The portal fills the month when the person first opens it (real marks, so the engine needs nothing new).

alter table public.staff_settings add column if not exists pref_start text;
alter table public.staff_settings drop constraint if exists staff_settings_pref_start_check;
alter table public.staff_settings add constraint staff_settings_pref_start_check check (pref_start is null or pref_start in ('yes', 'no'));

select 'scheduling_v30' as part, 'ok' as result;
