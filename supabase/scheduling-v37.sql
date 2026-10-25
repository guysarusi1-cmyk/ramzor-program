-- scheduling v37 (2026-10-25): a service girl may also have hours of her own on a day ("שעות אחרות"), like the instructors (Guy).
-- The choice of the day is 'hours'; the hours themselves are in prefs_hours, as for the instructors. Run once, after v36. Safe to run again.
alter table public.prefs_service drop constraint if exists prefs_service_opt_check;
alter table public.prefs_service add constraint prefs_service_opt_check check (opt in ('early', 'late', 'both', 'none', 'hours'));
-- the coordinator fills a service girl's hours too (she already fills her availability: scheduling-v36.sql)
drop policy if exists "coordinator fills service hours" on public.prefs_hours;
create policy "coordinator fills service hours" on public.prefs_hours for all to authenticated
  using (public.is_coordinator() and exists (select 1 from public.staff s where s.id = staff_id and s.kind = 'service'))
  with check (public.is_coordinator() and exists (select 1 from public.staff s where s.id = staff_id and s.kind = 'service'));

select 'scheduling_v37' as part, 'ok' as result;
