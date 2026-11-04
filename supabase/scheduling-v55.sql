-- ================================================================
-- Scheduling, part 55 — run in the SQL Editor after scheduling-v54.sql. Safe to run again. (2026-11-03)
-- Fix of v52: a change of the manager to the timetable failed ("record new has no field weekday"),
-- because one line read the field of the fixed timetable also on the timetable of a day. Now each table reads its own field.
-- ================================================================

create or replace function public.director_timetable_notice() returns trigger language plpgsql security definer set search_path = public as $$
declare who text; what text; r jsonb;
begin
  if not public.is_director() then return null; end if;
  r := to_jsonb(coalesce(new, old));
  select display_name into who from public.staff where id = public.my_staff_id();
  if tg_table_name = 'timetable_fixed' then
    what := 'הלו"ז הקבוע של יום ' || (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[(r->>'weekday')::int + 1];
  else
    what := 'הלו"ז של ' || to_char((r->>'day')::date, 'DD/MM');
  end if;
  insert into public.notices (to_staff, text, kind)
    select s.id, coalesce(who, 'המנהלת') || ' עדכנה את ' || what || '.', 'info' from public.staff s where s.active and s.kind = 'coordinator';
  return null;
end $$;

select 'scheduling_v55' as part, 'ok' as result;
