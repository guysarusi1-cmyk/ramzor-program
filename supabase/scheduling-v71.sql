-- ================================================================
-- Scheduling, part 71 — run in the SQL Editor after scheduling-v70.sql. Safe to run again. (Guy 2026-11-12, task 3: the rights matrix)
-- A person who is not active in the staff list and still has a sign-in (the "active" box was cleared in the staff editor, which keeps
-- the sign-in; "remove from the staff" already cuts it) could still read the staff list, the schedule, the open and special days, the
-- settings, the timetable and their own notices, and could still hand in preferences: "has a staff row" did not look at "active".
-- From now on my_staff_id() finds only an active person, so every rule built on it (is_personal, "own ..." rules, the functions that
-- ask who is calling) treats a not-active person as somebody without a staff row. The site already handles that case: no entry.
-- Switching the person back to active gives everything back at once; nothing is deleted.
-- ================================================================

do $$ begin
  if to_regprocedure('public.is_active_staff()') is null then raise exception 'scheduling-v70.sql first'; end if;
end $$;

create or replace function public.my_staff_id() returns uuid language sql stable security definer set search_path = public as $$
  select p.staff_id from public.staff_private p join public.staff s on s.id = p.staff_id where p.auth_user_id = auth.uid() and s.active limit 1
$$;

create or replace function public.my_kind() returns text language sql stable security definer set search_path = public as $$
  select s.kind from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() and s.active limit 1
$$;

select 'scheduling_v71' as part, 'ok' as result,
       (select count(*) from public.staff s join public.staff_private p on p.staff_id = s.id where not s.active and p.auth_user_id is not null) as not_active_with_sign_in;
