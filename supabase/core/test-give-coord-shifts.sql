-- "בדיקות בית מאזן" ONLY (TEST). Guy 23.11: the test sign-in of the coordinator ("+rakezet") was added after the schedules were built, so
-- she has no shifts. This gives her shifts in the schedules that are built or published and not over: about three a week, from today on,
-- never two on one day or on two days in a row, each one TAKEN FROM somebody else (so every shift keeps the number of people it needs).
-- No e-mail is sent. Run once; running again gives her more.
-- safety: TEST only. On any other database this stops here, before any change
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד בדיקות בית מאזן (TEST). לא שונה דבר.';
  end if;
end $$;

do $$
declare me uuid; per record; a record; got int; wk int; n int := 0;
begin
  select p.id into me from public.tw_people p join public.staff_private sp on sp.staff_id = p.staff_id
   where p.active and sp.email like '%+rakezet@%' limit 1;
  if me is null then raise exception 'לא נמצאה ברשימה הכניסה של הרכזת לבדיקה. לא שונה דבר.'; end if;
  for per in select start from public.tw_period where status in ('built', 'published') and start + 13 >= current_date order by start loop
    for wk in 0..1 loop
      got := (select count(*) from public.tw_assignment where period = per.start and person = me and (day - per.start) / 7 = wk);
      for a in select x.* from public.tw_assignment x
               where x.period = per.start and (x.day - per.start) / 7 = wk and x.day >= current_date and x.person <> me and x.shift <> 'W'
               order by random() loop
        exit when got >= 3;
        continue when exists (select 1 from public.tw_assignment y where y.period = per.start and y.person = me and y.day between a.day - 1 and a.day + 1);
        update public.tw_assignment set person = me, from_time = null, to_time = null where id = a.id;
        got := got + 1; n := n + 1;
      end loop;
    end loop;
  end loop;
  raise notice 'shifts given: %', n;
end $$;

-- her shifts now
select a.period, a.day, a.shift from public.tw_assignment a join public.tw_people p on p.id = a.person join public.staff_private sp on sp.staff_id = p.staff_id
where sp.email like '%+rakezet@%' order by a.day;
