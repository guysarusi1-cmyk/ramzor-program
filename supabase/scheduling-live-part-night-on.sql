-- LIVE (the Ramzor database of the first site). Turns on "a part of a night" for the engine (Guy 22.11, with the release of 1.3):
-- "other hours" that pass midnight, e.g. 23:00 to 07:00, are placed as that part of the night. Safe to run again.
insert into public.sched_settings (key, value) values ('part_night', 'true')
  on conflict (key) do update set value = 'true';
select key, value from public.sched_settings where key = 'part_night';
