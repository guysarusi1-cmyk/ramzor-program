-- ================================================================
-- Scheduling, part 4 — run in the SQL Editor after scheduling-v3.sql. Safe to run again.
--   * a teacher can read her own fixed hours (the table of personal conditions is closed to everybody but the coordinator)
-- ================================================================
create or replace function public.my_fixed_hours() returns jsonb language sql stable security definer set search_path = public as $$
  select params from public.staff_constraints where staff_id = public.my_staff_id() and kind = 'fixed_hours' limit 1
$$;
revoke all on function public.my_fixed_hours() from public, anon;
grant execute on function public.my_fixed_hours() to authenticated;
-- the coordinator may delete a vacation request or an announcement (also used by the automatic checks to clean up after themselves)
drop policy if exists "coordinator delete vacations" on public.vacation_requests;
create policy "coordinator delete vacations" on public.vacation_requests for delete to authenticated using (public.is_coordinator());
grant delete on public.vacation_requests to authenticated;
drop policy if exists "coordinator delete announcements" on public.announcements;
create policy "coordinator delete announcements" on public.announcements for delete to authenticated using (public.is_coordinator());
grant delete on public.announcements to authenticated;select 'ok' as scheduling_v4;