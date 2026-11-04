-- ================================================================
-- Scheduling, part 57 — run in the SQL Editor after scheduling-v56.sql. Safe to run again. (Guy 2026-11-04)
-- 1. "יומן הילדים" for the coordinator: she sees and changes the diary of every child (SCHEDULE-SPEC: the child's social worker and the
--    coordinator create and edit; the admin everything; the manager reads only — unchanged). Checked by her own person (staff kind
--    'coordinator'), not by the shared device sign-in of the Ramzor.
-- 2. The ahmash control: the diary events of one day, to read only — the children who go out, calls and meetings that should happen
--    (the update of 02.11 to SCHEDULE-SPEC). Only for whoever may use the control now (public.can_control()); only that day's events and
--    the series that may fall on it; never the technical note. Nothing can be changed from the control.
-- ================================================================

create or replace function public.is_coordinator_person() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s where s.id = public.my_staff_id() and s.active and s.kind = 'coordinator')
$$;
revoke all on function public.is_coordinator_person() from public, anon;
grant execute on function public.is_coordinator_person() to authenticated;

create or replace function public.can_diary_child(p_child text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false) or public.is_coordinator_person() or (coalesce(public.is_therapist(), false)
    and exists (select 1 from public.child_therapist t where t.child_id = p_child and t.staff_id = public.my_staff_id()))
$$;

create or replace function public.diary_for_control(p_day date) returns table (
  id uuid, child_id text, kind text, kind_text text, day date, start_time time, end_time time, with_whom text, place text,
  return_day date, return_time time, every_weeks smallint, monthly_nth smallint, until_day date, skipped boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.child_id, d.kind, d.kind_text, d.day, d.start_time, d.end_time, d.with_whom, d.place, d.return_day, d.return_time,
         d.every_weeks, d.monthly_nth, d.until_day,
         exists (select 1 from public.child_diary_skip k where k.event_id = d.id and k.day = p_day)
  from public.child_diary d
  where public.can_control() and p_day between current_date - 1 and current_date + 1
    and d.day <= p_day and (d.until_day is null or d.until_day >= p_day)
    and (d.day = p_day or d.every_weeks is not null or d.monthly_nth is not null)
$$;
revoke all on function public.diary_for_control(date) from public, anon;
grant execute on function public.diary_for_control(date) to authenticated;

select 'scheduling_v57' as part, 'ok' as result;
