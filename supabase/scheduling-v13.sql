-- ================================================================
-- Scheduling, part 13 — run in the SQL Editor after scheduling-v12.sql. Safe to run again.
--   * "I cannot come" now needs a reason (the database refuses a report without one); the coordinator is told the reason
-- ================================================================
create or replace function public.report_cannot_come(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); a public.assignment; rid uuid; c record; i record; who text; st text; why text := trim(coalesce(p_note, ''));
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  if length(why) < 2 then raise exception 'a reason is required'; end if;
  select * into a from public.assignment where id = p_assignment and staff_id = me and day >= current_date; if not found then raise exception 'not your upcoming shift'; end if;
  if exists (select 1 from public.swap_requests where assignment_id = p_assignment and status in ('open', 'offered')) then raise exception 'already reported'; end if;
  select display_name into who from public.staff where id = me;
  st := public.shift_text(a.day, a.shift, a.from_time, a.to_time);
  insert into public.sick_reports (assignment_id, staff_id, note, status, decided_at) values (p_assignment, me, why, 'approved', now()) returning id into rid;
  insert into public.swap_requests (assignment_id, from_staff, urgent) values (p_assignment, me, true);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop perform public.tell_key(c.id, 'cant_coord', who, st || ' (הסיבה: ' || why || ')', null, 'warn'); end loop;
  for i in select s.id from public.staff s where s.kind = 'instructor' and s.active and s.id <> me loop perform public.tell_key(i.id, 'cant_team', st); end loop;
  perform public.tell_key(me, 'cant_reporter', st);
  return rid;
end $$;
revoke all on function public.report_cannot_come(uuid, text) from public, anon;
grant execute on function public.report_cannot_come(uuid, text) to authenticated;
select 'scheduling_v13' as part, 'ok' as result;
