-- ================================================================
-- Scheduling, part 3 — run in the SQL Editor after scheduling-v2.sql. Safe to run again.
--   * a free note from the instructor to the coordinator, with the preferences
--   * the address of the portal (used in the e-mails)
-- ================================================================
alter table public.prefs_submission add column if not exists note text;
insert into public.sched_settings (key, value) values ('portal_url', '"https://guysarusi1-cmyk.github.io/ramzor-program/#portal"') on conflict (key) do nothing;
select 'ok' as scheduling_v3;