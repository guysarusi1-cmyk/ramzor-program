-- "בדיקות בית מאזן" ONLY (the product's TEST project). Guy 22.11: a swap and a message to check the tabs "החלפות" and "הודעות" as an instructor.
-- Run AFTER core/test-marker-product.sql (once). It creates, for the instructor who signed in last on TEST (not an admin):
--   א. an open swap request of another person, on a day she can take it (she has no shift that day, the day before or the day after);
--   ב. a swap request of HER OWN that somebody else already took: "ממתין לאישור של מי שבנתה את הסידור";
--   ג. a new message to the whole team in "הודעות".
-- Only in published schedules, only future days. No e-mail is sent for these (the open request is marked as already mailed).
-- To remove them later: the swaps whose note starts with "בדיקה:" and the message that starts with "הודעת בדיקה".
-- safety: TEST only. On any other database this stops here, before any change
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד בדיקות בית מאזן (TEST). לא שונה דבר.';
  end if;
end $$;

do $$
declare me record; a record; b record; t uuid; boss uuid;
begin
  -- the instructor: linked to a sign-in, not an admin, the one who signed in last
  select p.id, p.org_id, p.staff_id, p.name into me
  from public.tw_people p join public.staff s on s.id = p.staff_id join public.staff_private sp on sp.staff_id = p.staff_id join auth.users u on u.id = sp.auth_user_id
  where p.active and s.active and s.kind = 'staff'
  order by u.last_sign_in_at desc nulls last limit 1;
  if me.id is null then raise exception 'לא נמצאה מדריכה עם כניסה במסד הזה. לא שונה דבר.'; end if;

  -- א. somebody else's shift that she can take
  select x.* into a from public.tw_assignment x join public.tw_period pr on pr.org_id = x.org_id and pr.start = x.period
  where x.org_id = me.org_id and pr.status = 'published' and x.day > current_date and x.person <> me.id
    and not exists (select 1 from public.tw_assignment y where y.org_id = me.org_id and y.person = me.id and y.day between x.day - 1 and x.day + 1)
    and not exists (select 1 from public.tw_swap s where s.assignment = x.id and s.status in ('open', 'taken'))
  order by x.day limit 1;
  if a.id is not null then
    insert into public.tw_swap (org_id, period, assignment, day, shift, from_person, note, mailed_at)
    values (me.org_id, a.period, a.id, a.day, a.shift, a.person, 'בדיקה: יש לי תור לרופא, מי יכולה להחליף?', now());
  else raise notice 'א: לא נמצאה משמרת שהיא יכולה לקחת'; end if;

  -- ב. her own shift, already taken by somebody who is free around it
  select x.* into b from public.tw_assignment x join public.tw_period pr on pr.org_id = x.org_id and pr.start = x.period
  where x.org_id = me.org_id and pr.status = 'published' and x.day > current_date and x.person = me.id
    and not exists (select 1 from public.tw_swap s where s.assignment = x.id and s.status in ('open', 'taken'))
  order by x.day limit 1;
  if b.id is not null then
    select p.id into t from public.tw_people p
    where p.org_id = me.org_id and p.active and p.id <> me.id
      and not exists (select 1 from public.tw_assignment y where y.org_id = me.org_id and y.person = p.id and y.day between b.day - 1 and b.day + 1)
    order by p.sort, p.name limit 1;
    if t is not null then
      insert into public.tw_swap (org_id, period, assignment, day, shift, from_person, taker, status, note, taken_at, mailed_at)
      values (me.org_id, b.period, b.id, b.day, b.shift, me.id, t, 'taken', 'בדיקה: בקשה שלי', now(), now());
    else raise notice 'ב: אין מי שפנויה לקחת את המשמרת שלה'; end if;
  else raise notice 'ב: אין לה משמרת עתידית בסידור שפורסם'; end if;

  -- ג. a message from the management (an admin of the organisation; if none, from her)
  select s.id into boss from public.staff s where s.org_id = me.org_id and s.active and s.kind = 'admin' order by s.id limit 1;
  insert into public.tw_message (org_id, body, from_staff)
  values (me.org_id, 'הודעת בדיקה: ביום חמישי יש ישיבת צוות ב-14:00. מי שבמשמרת בוקר, נשארת עוד חצי שעה.', coalesce(boss, me.staff_id));
end $$;

-- what was created (no personal details beyond the invented names of the test)
select 'swap' as part, s.status, s.day, s.shift, (select name from public.tw_people where id = s.from_person) as from_person, (select name from public.tw_people where id = s.taker) as taker
from public.tw_swap s where s.note like 'בדיקה:%' and s.created_at > now() - interval '5 minutes'
union all
select 'message', 'new', m.created_at::date, null, null, null from public.tw_message m where m.body like 'הודעת בדיקה%' and m.created_at > now() - interval '5 minutes';
