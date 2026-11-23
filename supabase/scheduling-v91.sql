-- ================================================================
-- Scheduling, part 91 — THE FIRST SITE (the Ramzor database). Run in its SQL Editor: TEST first; live only on Guy's explicit word.
-- Safe to run again. (Guy 24.11.2026, from the coordinator and the social workers)
-- 1. The ahmash of a shift chosen by the coordinator: the flag 'lead' on that instructor's row wins over the turn, also on the kids' TV
--    and in the ahmash control (tv_ahmash_picks).
-- 2. "כוננית סוף שבוע": the ACTIVE on-call of that weekend (a social worker) edits the shifts of Thursday 22:00 – Sunday 11:00 as the
--    coordinator does — add (with hours), remove, replace, change hours. The admin's separate permission is no longer needed (the
--    coordinator and the admin may, as before).
-- 3. The ahmash of every shift of the window for the panel (oncall_ahmash), so the social workers see who the ahmash is.
-- ================================================================

-- 1. the ahmash of a day's shift: the one the coordinator chose, else by the turn (as before)
create or replace function public.tv_ahmash_picks(p_day date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := date_trunc('month', p_day)::date; code text; best int; picked uuid; cnt jsonb := '{}'; seen jsonb := '{}'; out jsonb := '{}';
begin
  while d <= p_day loop
    foreach code in array (case when extract(dow from d) in (5, 6) then array['M', 'A'] else array['A'] end) loop
      picked := null;
      -- (Guy 24.11) chosen by the coordinator: the flag 'lead'
      select a.staff_id into picked from public.assignment a join public.staff s on s.id = a.staff_id join public.staff_private p on p.staff_id = s.id
        join public.schedule sc on sc.month = a.month and sc.status = 'published'
        where s.active and 'lead' = any(coalesce(a.flags, '{}')) and (
          (code = 'M' and ((a.day = d and a.shift in ('M', 'S')) or (a.shift = 'L' and a.day = d - 1))) or
          (code = 'A' and ((a.day = d and a.shift = 'A') or (a.shift = 'L' and (a.day = d or a.day = d - 1)))))
        limit 1;
      if picked is null then
        select min(p.ahmash_rank) into best
          from public.assignment a join public.staff s on s.id = a.staff_id join public.staff_private p on p.staff_id = s.id join public.schedule sc on sc.month = a.month and sc.status = 'published'
          where s.active and p.ahmash_rank > 0 and (
            (code = 'M' and ((a.day = d and a.shift in ('M', 'S')) or (a.shift = 'L' and a.day = d - 1))) or
            (code = 'A' and ((a.day = d and a.shift = 'A') or (a.shift = 'L' and (a.day = d or a.day = d - 1)))));
        if best is not null then
          select x.staff_id into picked from (
            select distinct a.staff_id from public.assignment a join public.staff s on s.id = a.staff_id join public.staff_private p on p.staff_id = s.id join public.schedule sc on sc.month = a.month
            where s.active and p.ahmash_rank = best and (
              (code = 'M' and ((a.day = d and a.shift in ('M', 'S')) or (a.shift = 'L' and a.day = d - 1))) or
              (code = 'A' and ((a.day = d and a.shift = 'A') or (a.shift = 'L' and (a.day = d or a.day = d - 1)))))) x
            order by seen ? (x.staff_id::text || '|' || (d - 1)::text), coalesce((cnt ->> x.staff_id::text)::int, 0), x.staff_id::text
            limit 1;
        end if;
      end if;
      if picked is not null then
        cnt := jsonb_set(cnt, array[picked::text], to_jsonb(coalesce((cnt ->> picked::text)::int, 0) + 1));
        seen := seen || jsonb_build_object(picked::text || '|' || d::text, true);
      end if;
      if d = p_day then out := out || jsonb_build_object(code, picked); end if;
    end loop;
    d := d + 1;
  end loop;
  return out;
end $$;
revoke all on function public.tv_ahmash_picks(date) from public, anon;

-- 2. who may edit the weekend window of a day: the coordinator, the admin, or the ACTIVE on-call of that weekend
create or replace function public.oncall_may_assign_at(p_day date) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_coordinator(), false) or coalesce(public.is_admin(), false)
      or exists (select 1 from public.oncall_period op where op.active_staff = public.my_staff_id() and p_day between op.from_day - 1 and op.to_day + 1)
$$;
-- for the panel: may this person edit at all now (the coming / current weekend)
create or replace function public.oncall_may_assign() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_coordinator(), false) or coalesce(public.is_admin(), false)
      or exists (select 1 from public.oncall_period op where op.active_staff = public.my_staff_id() and op.to_day + 1 >= (now() at time zone 'Asia/Jerusalem')::date)
$$;
revoke all on function public.oncall_may_assign_at(date), public.oncall_may_assign() from public, anon;
grant execute on function public.oncall_may_assign_at(date), public.oncall_may_assign() to authenticated;

create or replace function public.oncall_assign(p_day date, p_shift text, p_staff uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  return public.oncall_assign_hours(p_day, p_shift, p_staff, null, null);
end $$;
create or replace function public.oncall_assign_hours(p_day date, p_shift text, p_staff uuid, p_from time, p_to time) returns uuid
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_day)::date; nid uuid;
begin
  if not public.oncall_may_assign_at(p_day) then raise exception 'not allowed'; end if;
  if not public.oncall_in_window(p_day, p_shift) then raise exception 'outside the weekend window'; end if;
  if not exists (select 1 from public.schedule s where s.month = m and s.status = 'published') then raise exception 'the month is not published'; end if;
  if exists (select 1 from public.assignment a where a.staff_id = p_staff and a.day = p_day and a.shift = p_shift) then raise exception 'already there'; end if;
  insert into public.assignment (month, staff_id, day, shift, from_time, to_time, flags) values (m, p_staff, p_day, p_shift, p_from, p_to, '{manual}') returning id into nid;
  return nid;
end $$;
create or replace function public.oncall_unassign(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.assignment;
begin
  select * into r from public.assignment where id = p_id;
  if not found then return; end if;
  if not public.oncall_may_assign_at(r.day) then raise exception 'not allowed'; end if;
  if not public.oncall_in_window(r.day, r.shift) then raise exception 'outside the weekend window'; end if;
  delete from public.assignment where id = p_id;
end $$;
create or replace function public.oncall_set_hours(p_id uuid, p_from time, p_to time) returns void
language plpgsql security definer set search_path = public as $$
declare r public.assignment;
begin
  select * into r from public.assignment where id = p_id;
  if not found then raise exception 'not found'; end if;
  if not public.oncall_may_assign_at(r.day) then raise exception 'not allowed'; end if;
  if not public.oncall_in_window(r.day, r.shift) then raise exception 'outside the weekend window'; end if;
  update public.assignment set from_time = p_from, to_time = p_to, flags = (select array_agg(distinct f) from unnest(coalesce(flags, '{}') || '{manual}') f) where id = p_id;
end $$;
create or replace function public.oncall_replace(p_id uuid, p_staff uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.assignment;
begin
  select * into r from public.assignment where id = p_id;
  if not found then raise exception 'not found'; end if;
  if not public.oncall_may_assign_at(r.day) then raise exception 'not allowed'; end if;
  if not public.oncall_in_window(r.day, r.shift) then raise exception 'outside the weekend window'; end if;
  if exists (select 1 from public.assignment a where a.staff_id = p_staff and a.day = r.day and a.shift = r.shift) then raise exception 'already there'; end if;
  -- (as a removal and an adding, so the active on-call gets the message of a change made by somebody else: the trigger of v50)
  delete from public.assignment where id = p_id;
  insert into public.assignment (month, staff_id, day, shift, from_time, to_time, flags) values (r.month, p_staff, r.day, r.shift, r.from_time, r.to_time, '{manual}');
end $$;
revoke all on function public.oncall_assign(date, text, uuid), public.oncall_assign_hours(date, text, uuid, time, time), public.oncall_unassign(uuid),
  public.oncall_set_hours(uuid, time, time), public.oncall_replace(uuid, uuid) from public, anon;
grant execute on function public.oncall_assign(date, text, uuid), public.oncall_assign_hours(date, text, uuid, time, time), public.oncall_unassign(uuid),
  public.oncall_set_hours(uuid, time, time), public.oncall_replace(uuid, uuid) to authenticated;

-- 3. the ahmash of each day of a range, for the people of the panel (the same as the kids' TV)
create or replace function public.oncall_ahmash(p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := p_from; out jsonb := '{}';
begin
  if not public.can_oncall() then raise exception 'not allowed'; end if;
  if p_to - p_from > 40 then raise exception 'too long'; end if;
  while d <= p_to loop out := out || jsonb_build_object(d::text, public.tv_ahmash_picks(d)); d := d + 1; end loop;
  return out;
end $$;
revoke all on function public.oncall_ahmash(date, date) from public, anon;
grant execute on function public.oncall_ahmash(date, date) to authenticated;

select 'scheduling_v91' as part, 'ok' as result;
