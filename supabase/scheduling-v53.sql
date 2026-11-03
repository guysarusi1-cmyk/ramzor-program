-- ================================================================
-- Scheduling, part 53 — run in the SQL Editor after scheduling-v52.sql. Safe to run again. (Guy 2026-11-03)
-- Swaps: who may take an instructor's shift — kept here in the database, not only on the screen:
--   * marked "כן" or "יכול" for that very shift (no mark = not offered; "לא" = never)
--   * not working that day already, and every existing rule of can_replace (absence, no nights, only the long weekend, fixed "no"...)
--   * no clash with the rest between shifts: a night (22:00–08:00) is never next to a morning of the next / the same morning
-- The service girls keep their own rules (their availability), unchanged.
-- ================================================================

create or replace function public.swap_ok(p_staff uuid, a public.assignment) returns boolean language sql stable security definer set search_path = public as $$
  select public.can_replace(p_staff, a)
    and case (select kind from public.staff where id = p_staff)
      when 'instructor' then
        exists (select 1 from public.prefs_slot f where f.staff_id = p_staff and f.day = a.day
                and f.shift = case a.shift when 'S' then 'M' else a.shift end and f.level in ('yes', 'can'))
        and not (a.shift in ('M', 'S') and exists (select 1 from public.assignment x where x.staff_id = p_staff and x.day = a.day - 1 and x.shift = 'N'))
        and not (a.shift = 'N' and exists (select 1 from public.assignment x where x.staff_id = p_staff and x.day = a.day + 1 and x.shift in ('M', 'S')))
      else true end
$$;
revoke all on function public.swap_ok(uuid, public.assignment) from public, anon, authenticated;

create or replace function public.swap_candidates2(p_assignment uuid) returns table (person uuid, name text, level text, wa text, female boolean)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); a public.assignment; code text; k text := public.my_kind();
begin
  if me is null or k not in ('instructor', 'service') then raise exception 'not allowed'; end if;
  select * into a from public.assignment x where x.id = p_assignment and x.staff_id = me; if not found then raise exception 'not your shift'; end if;
  code := case a.shift when 'S' then 'M' else a.shift end;
  return query
  select s.id, s.display_name, f.level, nullif(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), ''), coalesce(p.female, true)
  from public.staff s left join public.staff_private p on p.staff_id = s.id
       left join public.prefs_slot f on f.staff_id = s.id and f.day = a.day and f.shift = code
  where s.kind = k and s.active and s.id <> me and public.swap_ok(s.id, a)
  order by case f.level when 'yes' then 0 when 'can' then 1 else 2 end, s.display_name;
end $$;
revoke all on function public.swap_candidates2(uuid) from public, anon;
grant execute on function public.swap_candidates2(uuid) to authenticated;

-- "אני יכול/ה להחליף" on an open request: the same rule (the function of scheduling-v28.sql, with the check added)
create or replace function public.offer_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sw public.swap_requests; a public.assignment; c record; my_rank int; from_rank int; st text;
begin
  if me is null or public.my_kind() not in ('instructor', 'service') then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'open'; if not found then raise exception 'request is not open'; end if;
  if sw.from_staff = me then raise exception 'own request'; end if;
  if (select kind from public.staff where id = sw.from_staff) <> public.my_kind() then raise exception 'only between people of the same kind'; end if;          -- (service girls among themselves)
  select * into a from public.assignment where id = sw.assignment_id;
  if exists (select 1 from public.assignment x where x.staff_id = me and x.day = a.day) then raise exception 'already working that day'; end if;
  if not public.swap_ok(me, a) then raise exception 'not a fitting candidate'; end if;          -- (marked "כן" / "יכול", the rules and the rest: v53)
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

select 'scheduling_v53' as part, 'ok' as result;
