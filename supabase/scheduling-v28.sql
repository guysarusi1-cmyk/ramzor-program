-- ================================================================
-- Scheduling, part 28 — run in the SQL Editor after scheduling-v27.sql. Safe to run again.
--   * "a shift looks for somebody" goes only to the people who could take it (free that day, not away, did not say "no", their rules allow it)
--   * swaps for the service girls, only among themselves: a service girl asks for a swap (or reports she cannot come), only the other
--     service girls see it and can offer, the coordinator approves (as with the instructors). Instructors see only instructors' requests.
-- ================================================================

-- who sees a swap request: the coordinator, and the people of the same kind as the one who asked
drop policy if exists "see swaps" on public.swap_requests;
create policy "see swaps" on public.swap_requests for select to authenticated using (
  public.is_coordinator() or (public.is_personal() and public.my_kind() in ('instructor', 'service')
                              and (select s.kind from public.staff s where s.id = swap_requests.from_staff) = public.my_kind()));

create or replace function public.request_swap(p_assignment uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sid uuid;
begin
  if me is null or public.my_kind() not in ('instructor', 'service') then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.assignment a where a.id = p_assignment and a.staff_id = me and a.day >= current_date) then raise exception 'not your upcoming shift'; end if;
  insert into public.swap_requests (assignment_id, from_staff) values (p_assignment, me) returning id into sid;
  return sid;
end $$;

create or replace function public.offer_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sw public.swap_requests; a public.assignment; c record; my_rank int; from_rank int; st text;
begin
  if me is null or public.my_kind() not in ('instructor', 'service') then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'open'; if not found then raise exception 'request is not open'; end if;
  if sw.from_staff = me then raise exception 'own request'; end if;
  if (select kind from public.staff where id = sw.from_staff) <> public.my_kind() then raise exception 'only between people of the same kind'; end if;          -- (service girls among themselves)
  select * into a from public.assignment where id = sw.assignment_id;
  if exists (select 1 from public.assignment x where x.staff_id = me and x.day = a.day) then raise exception 'already working that day'; end if;
  if public.my_kind() = 'instructor' and a.shift = 'A' then
    select coalesce(ahmash_rank, 0) into from_rank from public.staff_private where staff_id = sw.from_staff;
    select coalesce(ahmash_rank, 0) into my_rank from public.staff_private where staff_id = me;
    if from_rank > 0 and my_rank = 0 and not exists (select 1 from public.assignment x join public.staff_private q on q.staff_id = x.staff_id
         where x.day = a.day and x.shift = 'A' and x.staff_id <> sw.from_staff and coalesce(q.ahmash_rank, 0) > 0) then
      raise exception 'would leave the shift without an ahmash';
    end if;
  end if;
  update public.swap_requests set to_staff = me, status = 'offered' where id = p_swap;
  st := public.shift_text(a.day, a.shift, a.from_time, a.to_time);
  perform public.tell_key(sw.from_staff, 'swap_found', st);
  perform public.tell_key(me, 'swap_thanks', st);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop perform public.tell_key(c.id, 'swap_waiting', st); end loop;
end $$;

-- who could take the shift (shown when asking): instructors as before; for a service girl, the service girls free that day
create or replace function public.swap_candidates(p_assignment uuid) returns table (name text) language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); a public.assignment; code text; k text := public.my_kind();
begin
  if me is null or k not in ('instructor', 'service') then raise exception 'not allowed'; end if;
  select * into a from public.assignment where id = p_assignment and staff_id = me; if not found then raise exception 'not your shift'; end if;
  if k = 'service' then
    return query
    select s.display_name from public.staff s
    where s.kind = 'service' and s.active and s.id <> me
      and not exists (select 1 from public.assignment x where x.staff_id = s.id and x.day = a.day)
      and not exists (select 1 from public.prefs_absence ab where ab.staff_id = s.id and ab.day = a.day)
      and not exists (select 1 from public.prefs_service ps where ps.staff_id = s.id and ps.day = a.day and ps.opt = 'none')
    order by s.display_name;
    return;
  end if;
  code := case a.shift when 'S' then 'M' else a.shift end;
  return query
  select s.display_name from public.staff s join public.staff_private p on p.staff_id = s.id
  where s.kind = 'instructor' and s.active and s.id <> me and not p.manual_only
    and not exists (select 1 from public.assignment x where x.staff_id = s.id and x.day = a.day)
    and not exists (select 1 from public.prefs_absence ab where ab.staff_id = s.id and ab.day = a.day)
    and not exists (select 1 from public.prefs_slot f where f.staff_id = s.id and f.day = a.day and f.shift = code and f.level <> 'yes')
    and (a.shift <> 'N' or not p.no_nights)
    and (not p.only_long_weekend or a.shift = 'L')
  order by s.display_name;
end $$;

-- could this person take that shift? (free that day, not away, did not say "no" to it, her rules allow it) — for the call "a shift looks for somebody"
create or replace function public.can_replace(p_staff uuid, a public.assignment) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s left join public.staff_private p on p.staff_id = s.id left join public.staff_settings ss on ss.staff_id = s.id
    where s.id = p_staff and s.active
      and not exists (select 1 from public.assignment x where x.staff_id = s.id and x.day = a.day)
      and not exists (select 1 from public.prefs_absence ab where ab.staff_id = s.id and ab.day = a.day)
      and case s.kind
        when 'service' then not exists (select 1 from public.prefs_service ps where ps.staff_id = s.id and ps.day = a.day and ps.opt = 'none')
        when 'instructor' then not coalesce(p.manual_only, false)
          and not exists (select 1 from public.prefs_slot f where f.staff_id = s.id and f.day = a.day and f.shift = case a.shift when 'S' then 'M' else a.shift end and f.level = 'no')
          and (a.shift <> 'N' or not coalesce(p.no_nights, false))
          and (not coalesce(p.only_long_weekend, false) or a.shift = 'L')
          and not (coalesce(ss.fixed_no, '{}') @> array[case a.shift when 'N' then 'n' when 'A' then 'e' else 'm' end]
                   and not exists (select 1 from public.prefs_slot f where f.staff_id = s.id and f.day = a.day and f.shift = case a.shift when 'S' then 'M' else a.shift end and f.level in ('yes', 'can')))
        else false end)
$$;
revoke all on function public.can_replace(uuid, public.assignment) from public, anon, authenticated;

-- "I cannot come": also for a service girl; the call for help goes only to the people of her kind who could take it (Guy 2026-10-17)
create or replace function public.report_cannot_come(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); k text := public.my_kind(); a public.assignment; rid uuid; c record; i record; who text; st text; why text := trim(coalesce(p_note, ''));
begin
  if me is null or k not in ('instructor', 'service') then raise exception 'not allowed'; end if;
  if length(why) < 2 then raise exception 'a reason is required'; end if;
  select * into a from public.assignment where id = p_assignment and staff_id = me and day >= current_date; if not found then raise exception 'not your upcoming shift'; end if;
  if exists (select 1 from public.swap_requests where assignment_id = p_assignment and status in ('open', 'offered')) then raise exception 'already reported'; end if;
  select display_name into who from public.staff where id = me;
  st := public.shift_text(a.day, a.shift, a.from_time, a.to_time);
  insert into public.sick_reports (assignment_id, staff_id, note, status, decided_at) values (p_assignment, me, why, 'approved', now()) returning id into rid;
  insert into public.swap_requests (assignment_id, from_staff, urgent) values (p_assignment, me, true);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop perform public.tell_key(c.id, 'cant_coord', who, st || ' (הסיבה: ' || why || ')', null, 'warn'); end loop;
  for i in select s.id from public.staff s where s.kind = k and s.active and s.id <> me and public.can_replace(s.id, a) loop perform public.tell_key(i.id, 'cant_team', st); end loop;
  perform public.tell_key(me, 'cant_reporter', st);
  return rid;
end $$;
revoke all on function public.request_swap(uuid), public.offer_swap(uuid), public.swap_candidates(uuid), public.report_cannot_come(uuid, text) from public, anon;
grant execute on function public.request_swap(uuid), public.offer_swap(uuid), public.swap_candidates(uuid), public.report_cannot_come(uuid, text) to authenticated;

select 'scheduling_v28' as part, 'ok' as result;
