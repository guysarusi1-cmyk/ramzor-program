-- ================================================================
-- Scheduling, part 12 — run in the SQL Editor after scheduling-v11.sql. Safe to run again.
--   * the person's own setting: show the long weekend on her preferences screen (off by default)
-- ================================================================
alter table public.staff_settings add column if not exists show_long boolean not null default false;
select 'scheduling_v12' as part, 'ok' as result;
