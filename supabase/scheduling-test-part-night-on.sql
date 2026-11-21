-- TEST project only. Turns on "a part of a night" for the engine (Guy 21.11): "other hours" that pass midnight, e.g. 23:00 to 07:00.
-- On the live site the switch stays off until Guy says so. Safe to run again.
-- safety: TEST only. On any other database this stops here, before any change (the marker: supabase/test-marker.sql, run once on TEST)
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד הבדיקות (TEST). לא שונה דבר.';
  end if;
end $$;

insert into public.sched_settings (key, value) values ('part_night', 'true')
  on conflict (key) do update set value = 'true';
select key, value from public.sched_settings where key = 'part_night';
