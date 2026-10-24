-- scheduling v36 (2026-10-24): the coordinator (and the admin) fill a service girl's availability for her and hand it in (Guy:
-- this month the service girls did not hand in through the portal). Run once, after v35. Safe to run again.
drop policy if exists "coordinator fills service" on public.prefs_service;
create policy "coordinator fills service" on public.prefs_service for all to authenticated
  using (public.is_coordinator()) with check (public.is_coordinator());
drop policy if exists "coordinator hands in for service" on public.prefs_submission;
create policy "coordinator hands in for service" on public.prefs_submission for all to authenticated
  using (public.is_coordinator() and exists (select 1 from public.staff s where s.id = staff_id and s.kind = 'service'))
  with check (public.is_coordinator() and exists (select 1 from public.staff s where s.id = staff_id and s.kind = 'service'));

select 'scheduling_v36' as part, 'ok' as result;
