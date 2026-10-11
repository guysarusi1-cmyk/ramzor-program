-- ================================================================
-- Scheduling, part 14 — run in the SQL Editor after scheduling-v13.sql. Safe to run again.
--   * a special day's own number of instructors can apply to the whole day, the morning shift, the afternoon shift, the night, or hours the coordinator writes
-- ================================================================
alter table public.special_days add column if not exists scope     text not null default 'all';
alter table public.special_days add column if not exists from_time time;
alter table public.special_days add column if not exists to_time   time;
alter table public.special_days drop constraint if exists special_days_scope_check;
alter table public.special_days add constraint special_days_scope_check check (scope in ('all', 'morning', 'afternoon', 'night', 'hours'));
alter table public.special_days drop constraint if exists special_days_hours_check;
alter table public.special_days add constraint special_days_hours_check check (scope <> 'hours' or (from_time is not null and to_time is not null and to_time > from_time));
select 'scheduling_v14' as part, 'ok' as result;
