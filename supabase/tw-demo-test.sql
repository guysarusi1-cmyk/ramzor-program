-- The two-week schedule: sample people for the demo. TEST only. Run after scheduling-v75.sql. Safe to run again. (Guy 2026-11-13)
-- Eleven invented names (not the real staff of any institution), nine with 3 shifts a week and two with 4, as in the institution's form.
-- The first one is linked to the test instructor's sign-in, to show the screen of a person who hands in her own options.
-- safety: TEST only. On any other database this stops here, before any change (the marker: supabase/test-marker.sql, run once on TEST)
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד הבדיקות (TEST). לא שונה דבר.';
  end if;
end $$;

insert into public.tw_people (name, per_week, sort)
select v.name, v.per_week, v.sort
from (values ('נועם', 3, 1), ('שחר', 4, 2), ('עדי', 3, 3), ('יובל', 3, 4), ('רוני', 3, 5), ('אור', 4, 6), ('שקד', 3, 7), ('גל', 3, 8), ('עומר', 3, 9), ('דניאל', 3, 10), ('אריאל', 3, 11)) v(name, per_week, sort)
where not exists (select 1 from public.tw_people p where p.name = v.name);

update public.tw_people p set staff_id = sp.staff_id
from public.staff_private sp join auth.users u on u.id = sp.auth_user_id
where p.name = 'נועם' and p.staff_id is null and u.email = 'instructor-test@merkaz-cherum.local'
  and not exists (select 1 from public.tw_people x where x.staff_id = sp.staff_id);

select 'tw_demo' as part, (select count(*) from public.tw_people) as people, (select count(*) from public.tw_people where staff_id is not null) as with_sign_in, (select count(*) from public.tw_period) as periods;
