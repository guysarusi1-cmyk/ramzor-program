-- ================================================================
-- Scheduling, part 5 — run in the SQL Editor after scheduling-v4.sql. Safe to run again.
--   * the monthly goal an instructor can ask for (the minimum / as many as possible / 4-5 a week)
--   * "my profile": a person reads her own private flags (needed to tell her what her minimum is)
--   * who else was available for a shift that somebody asks to swap
--   * the coordinator can send a personal message (used for the feedback after the schedule is published)
--   * every message that the system writes to a person, in a warm and respectful voice
-- ================================================================
alter table public.prefs_submission add column if not exists goal text;
alter table public.prefs_submission drop constraint if exists prefs_submission_goal_check;
alter table public.prefs_submission add constraint prefs_submission_goal_check check (goal is null or goal in ('min', 'max', 'weekly45'));

-- the person's own flags (nothing about anybody else, and nothing about the leaders list or the priority)
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('female', p.female, 'no_nights', p.no_nights, 'only_long', p.only_long_weekend, 'manual_only', p.manual_only, 'latest_end', p.latest_end_hour)
  from public.staff_private p where p.staff_id = public.my_staff_id()
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- gender of a person for the wording of a message (the female form when it is not known)
create or replace function public.gx(p_staff uuid, p_male text, p_female text) returns text language sql stable security definer set search_path = public as $$
  select case when coalesce((select female from public.staff_private where staff_id = p_staff), true) then p_female else p_male end
$$;
revoke all on function public.gx(uuid, text, text) from public, anon, authenticated;

-- colleagues who could take a shift: not working that day, not away, and who did not mark "can" / "no" for it (so, for whom it is "yes")
create or replace function public.swap_candidates(p_assignment uuid) returns table (name text) language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); a public.assignment; code text;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  select * into a from public.assignment where id = p_assignment and staff_id = me; if not found then raise exception 'not your shift'; end if;
  code := case a.shift when 'S' then 'M' else a.shift end;
  return query
  select s.display_name from public.staff s join public.staff_private p on p.staff_id = s.id
  where s.kind = 'instructor' and s.active and s.id <> me and not p.manual_only
    and not exists (select 1 from public.assignment x where x.staff_id = s.id and x.day = a.day)
    and not exists (select 1 from public.prefs_absence ab where ab.staff_id = s.id and ab.day = a.day)
    and not exists (select 1 from public.prefs_slot f where f.staff_id = s.id and f.day = a.day and f.shift = code and f.level <> 'yes')
    and (a.shift <> 'N' or not p.no_nights)
    and (not p.only_long_weekend or a.shift = 'L')
  order by s.display_name;
end $$;
revoke all on function public.swap_candidates(uuid) from public, anon;
grant execute on function public.swap_candidates(uuid) to authenticated;

-- a personal message from the coordinator (notice in the portal + e-mail), e.g. the feedback after publishing
create or replace function public.coordinator_tell(p_staff uuid, p_subject text, p_text text, p_kind text default 'info') returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  perform public.tell_staff(p_staff, p_subject, p_text, p_kind);
end $$;
revoke all on function public.coordinator_tell(uuid, text, text, text) from public, anon;
grant execute on function public.coordinator_tell(uuid, text, text, text) to authenticated;

-- ---------- the e-mail wrapper: a warm opening and closing ----------
create or replace function public.tell_staff(p_staff uuid, p_subject text, p_text text, p_kind text default 'info') returns void
language plpgsql security definer set search_path = public as $$
declare mail text; nm text; url text;
begin
  if p_staff is null then return; end if;
  insert into public.notices (to_staff, text, kind) values (p_staff, p_text, p_kind);
  select p.email, s.display_name into mail, nm from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = p_staff;
  select value #>> '{}' into url from public.sched_settings where key = 'portal_url';
  if mail is not null then
    insert into public.email_outbox (to_email, subject, body, kind) values (mail, p_subject,
      'שלום ' || nm || E',\n\n' || p_text || E'\n\nאנחנו כאן בשבילך, ואפשר לפנות אלינו בכל שאלה או בקשה.' || coalesce(E'\nהפורטל שלך: ' || url, '') || E'\n\nבהוקרה,\nהצוות שלך במרכז חירום', p_kind);
  end if;
end $$;
revoke all on function public.tell_staff(uuid, text, text, text) from public, anon, authenticated;

-- ---------- changes to a shift after the schedule was published ----------
create or replace function public.notify_assignment_change() returns trigger language plpgsql security definer set search_path = public as $$
declare m date := case when tg_op = 'DELETE' then old.month else new.month end; pub boolean; o public.assignment; n public.assignment; oname text; nname text; cw record; what text;
begin
  select (status = 'published') into pub from public.schedule where month = m;
  if not coalesce(pub, false) then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if tg_op <> 'INSERT' then o := old; end if;
  if tg_op <> 'DELETE' then n := new; end if;
  if o.id is not null then select display_name into oname from public.staff where id = o.staff_id; end if;
  if n.id is not null then select display_name into nname from public.staff where id = n.staff_id; end if;
  if tg_op = 'INSERT' then
    perform public.tell_staff(n.staff_id, 'עדכון קטן בסידור שלך', 'שובצת למשמרת: ' || public.shift_text(n.day, n.shift, n.from_time, n.to_time) || '. אם זה לא מסתדר לך, אפשר לבקש החלפה בפורטל, ונשמח לעזור.', 'info');
    what := nname || ' הצטרף/ה למשמרת';
  elsif tg_op = 'DELETE' then
    perform public.tell_staff(o.staff_id, 'עדכון קטן בסידור שלך', 'המשמרת ' || public.shift_text(o.day, o.shift, o.from_time, o.to_time) || ' הוסרה מהסידור שלך. תודה על הגמישות.', 'info');
    what := oname || ' לא במשמרת הזאת יותר';
  elsif o.staff_id is distinct from n.staff_id then
    perform public.tell_staff(o.staff_id, 'עדכון קטן בסידור שלך', 'המשמרת ' || public.shift_text(o.day, o.shift, o.from_time, o.to_time) || ' עברה למישהו אחר. תודה על הגמישות.', 'info');
    perform public.tell_staff(n.staff_id, 'עדכון קטן בסידור שלך', 'שובצת למשמרת: ' || public.shift_text(n.day, n.shift, n.from_time, n.to_time) || '. תודה שאת/ה שם/ה בשביל הצוות.', 'info');
    what := oname || ' הוחלף/ה ב' || nname;
  elsif (o.day, o.shift, o.from_time, o.to_time) is distinct from (n.day, n.shift, n.from_time, n.to_time) then
    perform public.tell_staff(n.staff_id, 'עדכון קטן בסידור שלך', 'עדכנו את המשמרת ' || public.shift_text(o.day, o.shift, o.from_time, o.to_time) || ' ל-' || public.shift_text(n.day, n.shift, n.from_time, n.to_time) || '. נשמח אם זה מסתדר לך, ואם לא, דברו איתנו.', 'info');
    what := nname || ': שעות המשמרת עודכנו';
  end if;
  if what is not null then
    for cw in select distinct x.staff_id from public.assignment x
              where x.month = m and x.day = coalesce(n.day, o.day) and x.shift = coalesce(n.shift, o.shift)
                and x.staff_id is distinct from o.staff_id and x.staff_id is distinct from n.staff_id loop
      perform public.tell_staff(cw.staff_id, 'עדכון בצוות המשמרת שלך', 'עדכון קטן בצוות של המשמרת ' || public.shift_text(coalesce(n.day, o.day), coalesce(n.shift, o.shift), coalesce(n.from_time, o.from_time), coalesce(n.to_time, o.to_time)) || ': ' || what || '.', 'info');
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

-- ---------- swaps ----------
create or replace function public.offer_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sw public.swap_requests; a public.assignment; c record; my_rank int; from_rank int;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'open'; if not found then raise exception 'request is not open'; end if;
  if sw.from_staff = me then raise exception 'own request'; end if;
  select * into a from public.assignment where id = sw.assignment_id;
  if exists (select 1 from public.assignment x where x.staff_id = me and x.day = a.day) then raise exception 'already working that day'; end if;
  if a.shift = 'A' then
    select coalesce(ahmash_rank, 0) into from_rank from public.staff_private where staff_id = sw.from_staff;
    select coalesce(ahmash_rank, 0) into my_rank from public.staff_private where staff_id = me;
    if from_rank > 0 and my_rank = 0 and not exists (select 1 from public.assignment x join public.staff_private q on q.staff_id = x.staff_id
         where x.day = a.day and x.shift = 'A' and x.staff_id <> sw.from_staff and coalesce(q.ahmash_rank, 0) > 0) then
      raise exception 'would leave the shift without an ahmash';
    end if;
  end if;
  update public.swap_requests set to_staff = me, status = 'offered' where id = p_swap;
  perform public.tell_staff(sw.from_staff, 'יש חדשות טובות לגבי ההחלפה', 'עמית מוכן/ה להחליף אותך במשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '. העברנו את זה לרכזת לאישור, ונעדכן אותך ברגע שתהיה תשובה.', 'info');
  perform public.tell_staff(me, 'תודה שהצעת להחליף', 'תודה שהצעת להחליף במשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '. הבקשה אצל הרכזת, ונעדכן אותך כשהיא תאשר.', 'info');
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop
    perform public.tell_staff(c.id, 'בקשת החלפה מחכה לך', 'יש בקשת החלפה שמחכה לאישור שלך: ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '.', 'info');
  end loop;
end $$;
create or replace function public.decide_swap(p_swap uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare sw public.swap_requests;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'offered'; if not found then raise exception 'nothing to decide'; end if;
  if p_approve then
    update public.swap_requests set status = 'approved', decided_at = now() where id = p_swap;
    update public.assignment set staff_id = sw.to_staff where id = sw.assignment_id;
  else
    update public.swap_requests set status = 'rejected', decided_at = now() where id = p_swap;
    perform public.tell_staff(sw.from_staff, 'לגבי בקשת ההחלפה שלך', 'הפעם לא הצלחנו לאשר את ההחלפה, והמשמרת נשארת אצלך. אנחנו מבינים שזה לא תמיד נוח, ואפשר לדבר איתנו על פתרון אחר.', 'info');
    perform public.tell_staff(sw.to_staff, 'לגבי ההחלפה שהצעת', 'תודה על הנכונות! הפעם לא הצלחנו לאשר את ההחלפה, אבל ההצעה שלך מוערכת מאוד.', 'info');
  end if;
end $$;
create or replace function public.report_cannot_come(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); a public.assignment; rid uuid; c record; i record; who text;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  select * into a from public.assignment where id = p_assignment and staff_id = me and day >= current_date; if not found then raise exception 'not your upcoming shift'; end if;
  if exists (select 1 from public.swap_requests where assignment_id = p_assignment and status in ('open', 'offered')) then raise exception 'already reported'; end if;
  select display_name into who from public.staff where id = me;
  insert into public.sick_reports (assignment_id, staff_id, note, status, decided_at) values (p_assignment, me, p_note, 'approved', now()) returning id into rid;
  insert into public.swap_requests (assignment_id, from_staff, urgent) values (p_assignment, me, true);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop
    perform public.tell_staff(c.id, 'עדכון: משמרת שנפתחה להחלפה', who || ' עדכנ/ה שלא יהיה אפשר להגיע למשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '. פתחנו אותה להחלפה, וכשיימצא מחליף/ה היא תחכה לאישורך.', 'warn');
  end loop;
  for i in select s.id from public.staff s where s.kind = 'instructor' and s.active and s.id <> me loop
    perform public.tell_staff(i.id, 'מישהו מהצוות זקוק לעזרה', 'נפתחה משמרת שמחפשת מחליף/ה: ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '. אם יש לך אפשרות, נשמח אם תציע/י להחליף בלוח ההחלפות. תודה שאתם שם אחד בשביל השני.', 'info');
  end loop;
  perform public.tell_staff(me, 'קיבלנו את העדכון שלך', 'תודה שעדכנת אותנו. פתחנו את המשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || ' להחלפה ועדכנו את הרכזת, אז אין לך מה לדאוג. תרגיש/י טוב, ובריאות שלמה אם צריך.', 'info');
  return rid;
end $$;
create or replace function public.decide_vacation(p_id uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare v public.vacation_requests; a record;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  select * into v from public.vacation_requests where id = p_id and status = 'pending'; if not found then raise exception 'nothing to decide'; end if;
  if p_approve then
    update public.vacation_requests set status = 'approved', decided_at = now() where id = p_id;
    insert into public.prefs_absence (staff_id, day, reason, note)
      select v.staff_id, g::date, 'vacation', v.note from generate_series(v.from_day::timestamp, v.to_day::timestamp, interval '1 day') g
      on conflict (staff_id, day) do update set reason = 'vacation', note = excluded.note;
    for a in select * from public.assignment x where x.staff_id = v.staff_id and x.day between v.from_day and v.to_day loop
      insert into public.coordinator_flags (month, day, kind, text, staff_id) values (a.month, a.day, 'vacation_conflict', 'חופשה שאושרה חופפת למשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time), a.staff_id);
    end loop;
    perform public.tell_staff(v.staff_id, 'החופשה שלך אושרה', 'שמחים לעדכן שבקשת החופשה שלך (' || to_char(v.from_day, 'DD/MM') || '–' || to_char(v.to_day, 'DD/MM') || ') אושרה. חופשה נעימה ומרעננת!', 'ok');
  else
    update public.vacation_requests set status = 'rejected', decided_at = now() where id = p_id;
    perform public.tell_staff(v.staff_id, 'לגבי בקשת החופשה שלך', 'הפעם לא הצלחנו לאשר את בקשת החופשה (' || to_char(v.from_day, 'DD/MM') || '–' || to_char(v.to_day, 'DD/MM') || '). נשמח לתאם איתך מועד אחר שיתאים גם לך וגם לצוות.', 'info');
  end if;
end $$;
revoke all on function public.offer_swap(uuid), public.decide_swap(uuid, boolean), public.report_cannot_come(uuid, text), public.decide_vacation(uuid, boolean) from public, anon;
grant execute on function public.offer_swap(uuid), public.decide_swap(uuid, boolean), public.report_cannot_come(uuid, text), public.decide_vacation(uuid, boolean) to authenticated;


-- ---------- open shifts: the instructors who are not scheduled automatically (they place themselves where somebody is missing) ----------
-- only counts (nothing about people); standard numbers: morning 1 (5 on Friday/Saturday), afternoon 4 (5 on Thursday, Friday, Saturday), night 2
create or replace function public.open_shifts(p_month date) returns table (day date, shift text, have int, need int) language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_staff_id() is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  if not coalesce((select manual_only from public.staff_private where staff_id = public.my_staff_id()), false) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.schedule s where s.month = p_month and s.status in ('sent', 'published')) then return; end if;
  return query
  select g.d, x.sh, coalesce(c.n, 0)::int,
         case x.sh when 'M' then (case when extract(dow from g.d) in (5, 6) then 5 else 1 end)
                   when 'A' then (case when extract(dow from g.d) in (4, 5, 6) then 5 else 4 end)
                   else 2 end
  from (select generate_series(p_month::timestamp, (p_month + interval '1 month' - interval '1 day'), interval '1 day')::date as d) g
  cross join (values ('M'), ('A'), ('N')) as x(sh)
  left join (select a.day, case when a.shift = 'S' then 'M' else a.shift end as sh, count(*) as n from public.assignment a join public.staff s on s.id = a.staff_id
             where a.month = p_month and s.kind = 'instructor' group by 1, 2) c on c.day = g.d and c.sh = x.sh
  where coalesce(c.n, 0) < case x.sh when 'M' then (case when extract(dow from g.d) in (5, 6) then 5 else 1 end)
                                      when 'A' then (case when extract(dow from g.d) in (4, 5, 6) then 5 else 4 end)
                                      else 2 end
    and g.d >= current_date
  order by g.d, x.sh;
end $$;
revoke all on function public.open_shifts(date) from public, anon;
grant execute on function public.open_shifts(date) to authenticated;

create or replace function public.take_open_shift(p_day date, p_shift text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); m date := date_trunc('month', p_day::timestamp)::date; rid uuid; f time; t time; who text; c record;
begin
  if me is null or public.my_kind() <> 'instructor' or not coalesce((select manual_only from public.staff_private where staff_id = me), false) then raise exception 'not allowed'; end if;
  if p_shift not in ('M', 'A', 'N') or p_day < current_date then raise exception 'bad shift'; end if;
  if not exists (select 1 from public.open_shifts(m) o where o.day = p_day and o.shift = p_shift) then raise exception 'the shift is already covered'; end if;
  if exists (select 1 from public.assignment x where x.staff_id = me and x.day = p_day) then raise exception 'already working that day'; end if;
  if exists (select 1 from public.prefs_absence ab where ab.staff_id = me and ab.day = p_day) then raise exception 'away that day'; end if;
  f := case p_shift when 'M' then time '07:00' when 'A' then time '14:00' else time '22:00' end;
  t := case p_shift when 'M' then time '15:00' when 'A' then time '22:00' else time '08:00' end;
  insert into public.assignment (month, staff_id, day, shift, from_time, to_time, flags) values (m, me, p_day, p_shift, f, t, array['self']) returning id into rid;
  select display_name into who from public.staff where id = me;
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop
    perform public.tell_staff(c.id, 'מישהי מילאה משמרת חסרה', who || ' שיבצה את עצמה למשמרת ' || public.shift_text(p_day, p_shift, f, t) || '.', 'info');
  end loop;
  perform public.tell_staff(me, 'תודה שמילאת משמרת חסרה', 'שיבצנו אותך למשמרת ' || public.shift_text(p_day, p_shift, f, t) || '. תודה שאכפת לך מהצוות!', 'ok');
  return rid;
end $$;
revoke all on function public.take_open_shift(date, text) from public, anon;
grant execute on function public.take_open_shift(date, text) to authenticated;
-- she must be able to write her own row for this (the function does it as the system, so no extra policy is needed)
select 'ok' as scheduling_v5;
