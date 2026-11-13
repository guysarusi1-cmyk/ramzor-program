-- The two-week schedule: sample people for a DEMO database. Run after scheduling-v75.sql. Safe to run again. (Guy 2026-11-13)
-- Eleven invented names (not the staff of any real institution), nine with 3 shifts a week and two with 4. They have no sign-in:
-- whoever builds the schedule hands in for them. It adds people only when the list is still empty, so it never mixes with real staff.
insert into public.tw_people (name, per_week, sort)
select v.name, v.per_week, v.sort
from (values ('נועם', 3, 1), ('שחר', 4, 2), ('עדי', 3, 3), ('יובל', 3, 4), ('רוני', 3, 5), ('אור', 4, 6), ('שקד', 3, 7), ('גל', 3, 8), ('עומר', 3, 9), ('דניאל', 3, 10), ('אריאל', 3, 11)) v(name, per_week, sort)
where not exists (select 1 from public.tw_people);

select 'demo_people_2w' as part, (select count(*) from public.tw_people) as people;
