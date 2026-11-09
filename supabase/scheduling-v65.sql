-- ================================================================
-- Scheduling, part 65 — run in the SQL Editor after scheduling-v64.sql. Safe to run again. (Guy 2026-11-09)
-- Swaps: "אני יכול/ה להחליף" is open to every instructor who is free for that shift, also without a mark (Guy: "כל מי שפנוי").
--   Free = every rule of can_replace (not working that day, not on leave, did not mark "לא" for that shift, no nights / only the long weekend / fixed "no"...)
--   and the rest as in the real schedule: a night is never next to a morning (the morning after it / the night before it).
-- The list "יכולים לקחת את המשמרת" that the asker sees is unchanged: only who marked "כן" or "יכול" (swap_ok, v53).
-- The service girls keep their own rules, unchanged.
-- ================================================================

do $$ begin
  if to_regprocedure('public.swap_ok(uuid, public.assignment)') is null then raise exception 'scheduling-v53.sql first'; end if;
end $$;

create or replace function public.swap_offer_ok(p_staff uuid, a public.assignment) returns boolean language sql stable security definer set search_path = public as $$
  select public.can_replace(p_staff, a)
    and case (select kind from public.staff where id = p_staff)
      when 'instructor' then
        not (a.shift in ('M', 'S') and exists (select 1 from public.assignment x where x.staff_id = p_staff and x.day = a.day - 1 and x.shift = 'N'))
        and not (a.shift = 'N' and exists (select 1 from public.assignment x where x.staff_id = p_staff and x.day = a.day + 1 and x.shift in ('M', 'S')))
      else true end
$$;
revoke all on function public.swap_offer_ok(uuid, public.assignment) from public, anon, authenticated;

create or replace function public.offer_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sw public.swap_requests; a public.assignment; c record; my_rank int; from_rank int; st text;
begin
  if me is null or public.my_kind() not in ('instructor', 'service') then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'open'; if not found then raise exception 'request is not open'; end if;
  if sw.from_staff = me then raise exception 'own request'; end if;
  if (select kind from public.staff where id = sw.from_staff) <> public.my_kind() then raise exception 'only between people of the same kind'; end if;          -- (service girls among themselves)
  select * into a from public.assignment where id = sw.assignment_id;
  if exists (select 1 from public.assignment x where x.staff_id = me and x.day = a.day) then raise exception 'already working that day'; end if;
  if not public.swap_offer_ok(me, a) then raise exception 'not a fitting candidate'; end if;          -- (free that day, the rules and the rest; no mark needed: v65)
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

select 'scheduling_v65' as part, 'ok' as result;
