-- "בדיקות בית מאזן" ONLY (TEST). Guy 23.11: a swap request that somebody already took, waiting for the coordinator's approval in "החלפות".
-- The taker only needs to be free on that day itself. No e-mail is sent. To remove: the swaps whose note starts with "בדיקה:".
-- safety: TEST only. On any other database this stops here, before any change
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד בדיקות בית מאזן (TEST). לא שונה דבר.';
  end if;
end $$;

do $$
declare b record; t uuid;
begin
  for b in select x.* from public.tw_assignment x join public.tw_period pr on pr.org_id = x.org_id and pr.start = x.period
           where pr.status = 'published' and x.day > current_date
             and not exists (select 1 from public.tw_swap s where s.assignment = x.id and s.status in ('open', 'taken'))
           order by x.day, x.shift loop
    select p.id into t from public.tw_people p
    where p.org_id = b.org_id and p.active and p.id <> b.person
      and not exists (select 1 from public.tw_assignment y where y.org_id = b.org_id and y.person = p.id and y.day = b.day)
    order by p.sort, p.name limit 1;
    if t is not null then
      insert into public.tw_swap (org_id, period, assignment, day, shift, from_person, taker, status, note, taken_at, mailed_at)
      values (b.org_id, b.period, b.id, b.day, b.shift, b.person, t, 'taken', 'בדיקה: מישהי כבר לקחה, מחכה לאישור', now(), now());
      return;
    end if;
  end loop;
  raise exception 'לא נמצאה משמרת עם מישהי פנויה לקחת אותה. לא שונה דבר.';
end $$;

select s.status, s.day, s.shift, (select name from public.tw_people where id = s.from_person) as from_person, (select name from public.tw_people where id = s.taker) as taker
from public.tw_swap s where s.note like 'בדיקה:%' order by s.created_at desc;
