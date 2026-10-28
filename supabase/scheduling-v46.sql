-- ================================================================
-- Scheduling, part 46 — run in the SQL Editor after scheduling-v45.sql. Safe to run again. (Guy 2026-10-28)
--   * a swap request shows the colleagues who could take the shift by name, "כן" and "יכול" first, each with a WhatsApp button:
--     the number is given to the person who asks only for her own shift, and only of the colleagues who could take it
-- ================================================================

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
  where s.kind = k and s.active and s.id <> me and public.can_replace(s.id, a)
    and coalesce(f.level, '') <> 'no'
  order by case f.level when 'yes' then 0 when 'can' then 1 else 2 end, s.display_name;
end $$;
revoke all on function public.swap_candidates2(uuid) from public, anon;
grant execute on function public.swap_candidates2(uuid) to authenticated;

select 'scheduling_v46' as part, 'ok' as result;
