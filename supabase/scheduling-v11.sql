-- ================================================================
-- Scheduling, part 11 — run in the SQL Editor after scheduling-v10.sql. Safe to run again.
--   * OPEN SHIFTS after the coordinator publishes: every shift that is below the minimum number of instructors is offered to the instructors who could fill it
--     (not working that day, not away, rested enough, not over the maximum of non-leaders, a night keeps one woman and never two men, her own wishes and conditions respected).
--   * an instructor who wants one sends a REQUEST; she is placed on the shift only after the coordinator approves (both are told, in their voice).
--   * this replaces the earlier "take it at once" function.
-- ================================================================
create table if not exists public.open_shift_requests (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff(id) on delete cascade,
  day         date not null,
  shift       text not null check (shift in ('M', 'A', 'N')),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index if not exists open_shift_requests_one_pending on public.open_shift_requests (staff_id, day, shift) where status = 'pending';
alter table public.open_shift_requests enable row level security;
drop policy if exists "own open requests"      on public.open_shift_requests;
drop policy if exists "coordinator open requests" on public.open_shift_requests;
create policy "own open requests"         on public.open_shift_requests for select to authenticated using (staff_id = public.my_staff_id());
create policy "coordinator open requests" on public.open_shift_requests for select to authenticated using (public.is_coordinator());
grant select on public.open_shift_requests to authenticated;
revoke all on public.open_shift_requests from anon;
grant select, insert, update, delete on public.open_shift_requests to service_role;

-- the hours a shift really covers (the long weekend is two parts), as plain timestamps
create or replace function public.shift_windows(p_day date, p_shift text, p_from time, p_to time) returns table (s timestamp, e timestamp)
language plpgsql immutable as $$
declare f time; t time;
begin
  if p_shift = 'L' then
    s := p_day::timestamp + time '17:00'; e := p_day::timestamp + time '22:00'; return next;
    s := (p_day + 1)::timestamp + time '07:00'; e := (p_day + 1)::timestamp + coalesce(p_to, time '20:00'); return next;
    return;
  end if;
  f := coalesce(p_from, case p_shift when 'M' then time '07:00' when 'S' then time '07:00' when 'A' then time '14:00' else time '22:00' end);
  t := coalesce(p_to,   case p_shift when 'M' then time '15:00' when 'S' then time '11:00' when 'A' then time '22:00' else time '08:00' end);
  s := p_day::timestamp + f; e := p_day::timestamp + t; if e <= s then e := e + interval '1 day'; end if;
  return next;
end $$;

-- would this shift break the rest rule for the person: not overlapping anything, at least 7 hours between shifts (8 after more than 11 hours in a row)
create or replace function public.rest_conflict(p_staff uuid, p_day date, p_shift text, p_from time, p_to time) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignment a
      cross join lateral public.shift_windows(a.day, a.shift, a.from_time, a.to_time) x
      cross join lateral public.shift_windows(p_day, p_shift, p_from, p_to) y
    where a.staff_id = p_staff and a.day between p_day - 3 and p_day + 3
      and ((x.s < y.e and y.s < x.e)
        or (y.s >= x.e and y.s - x.e < case when x.e - x.s > interval '11 hours' then interval '8 hours' else interval '7 hours' end)
        or (x.s >= y.e and x.s - y.e < case when y.e - y.s > interval '11 hours' then interval '8 hours' else interval '7 hours' end)))
$$;
revoke all on function public.shift_windows(date, text, time, time), public.rest_conflict(uuid, date, text, time, time) from public, anon, authenticated;

-- the number of instructors a shift needs (morning 1, 5 on Friday/Saturday; afternoon 4, 5 on Thursday-Saturday; night 2)
create or replace function public.open_need(p_day date, p_shift text) returns int language sql immutable as $$
  select case p_shift when 'M' then (case when extract(dow from p_day) in (5, 6) then 5 else 1 end)
                      when 'A' then (case when extract(dow from p_day) in (4, 5, 6) then 5 else 4 end)
                      else 2 end
$$;
revoke all on function public.open_need(date, text) from public, anon;
grant execute on function public.open_need(date, text) to authenticated;

-- how many instructors are on a shift (a morning "short" shift counts as morning; the long weekend counts for Friday afternoon and for Saturday morning and afternoon)
create or replace function public.open_have(p_day date, p_shift text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select 1 from public.assignment a join public.staff s on s.id = a.staff_id
      where s.kind = 'instructor' and a.shift <> 'L' and a.day = p_day and (case when a.shift = 'S' then 'M' else a.shift end) = p_shift
    union all
    select 1 from public.assignment a join public.staff s on s.id = a.staff_id
      where s.kind = 'instructor' and a.shift = 'L' and ((a.day = p_day and p_shift = 'A') or (a.day + 1 = p_day and p_shift in ('M', 'A')))
  ) q
$$;
revoke all on function public.open_have(date, text) from public, anon, authenticated;

-- can this person fill this shift (the rules of the schedule, as far as the database can check them)?
create or replace function public.can_fill_open(p_staff uuid, p_day date, p_shift text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p public.staff_private; f time; t time; nonleaders int; men int;
begin
  if p_shift not in ('M', 'A', 'N') then return false; end if;
  select * into p from public.staff_private where staff_id = p_staff;
  if not found then return false; end if;
  if coalesce(p.only_long_weekend, false) then return false; end if;
  if p_shift = 'N' and coalesce(p.no_nights, false) then return false; end if;
  if p.latest_end_hour is not null and p_shift in ('A', 'N') then return false; end if;
  f := case p_shift when 'M' then time '07:00' when 'A' then time '14:00' else time '22:00' end;
  t := case p_shift when 'M' then time '15:00' when 'A' then time '22:00' else time '08:00' end;
  if exists (select 1 from public.assignment x where x.staff_id = p_staff and x.day = p_day) then return false; end if;
  if exists (select 1 from public.prefs_absence ab where ab.staff_id = p_staff and ab.day = p_day) then return false; end if;
  if exists (select 1 from public.prefs_slot ps where ps.staff_id = p_staff and ps.day = p_day and ps.shift = p_shift and ps.level = 'no') then return false; end if;
  if public.rest_conflict(p_staff, p_day, p_shift, f, t) then return false; end if;
  select count(*) filter (where not coalesce(q.is_leader, false)), count(*) filter (where not coalesce(q.female, false)) into nonleaders, men
  from public.assignment a join public.staff s on s.id = a.staff_id join public.staff_private q on q.staff_id = a.staff_id
  where s.kind = 'instructor' and ((a.shift <> 'L' and a.day = p_day and (case when a.shift = 'S' then 'M' else a.shift end) = p_shift)
     or (a.shift = 'L' and ((a.day = p_day and p_shift = 'A') or (a.day + 1 = p_day and p_shift in ('M', 'A')))));
  if p_shift in ('M', 'A') and not coalesce(p.is_leader, false) and nonleaders >= 2 then return false; end if;       -- (at most two who are not leaders in a shift)
  if p_shift = 'N' and not coalesce(p.female, false) and men >= 1 then return false; end if;                          -- (a night: never two men)
  return true;
end $$;
revoke all on function public.can_fill_open(uuid, date, text) from public, anon, authenticated;

-- the open shifts of a published month, as THIS instructor may see them (only the ones she could fill, or that she already asked for)
drop function if exists public.open_shifts(date);
create or replace function public.open_shifts(p_month date) returns table (day date, shift text, have int, need int, mine text, req uuid)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.schedule s where s.month = p_month and s.status = 'published') then return; end if;
  return query
  select g.d, x.sh, public.open_have(g.d, x.sh), public.open_need(g.d, x.sh), r.status, r.id
  from (select generate_series(p_month::timestamp, (p_month + interval '1 month' - interval '1 day'), interval '1 day')::date as d) g
  cross join (values ('M'), ('A'), ('N')) as x(sh)
  left join public.open_shift_requests r on r.staff_id = me and r.day = g.d and r.shift = x.sh and r.status = 'pending'
  where public.open_have(g.d, x.sh) < public.open_need(g.d, x.sh) and g.d >= today
    and (r.id is not null or public.can_fill_open(me, g.d, x.sh))
  order by g.d, x.sh;
end $$;
revoke all on function public.open_shifts(date) from public, anon;
grant execute on function public.open_shifts(date) to authenticated;

-- one message by its key, in the person's voice: a = the shift (or the dates), b = another detail, c = a third
create or replace function public.tell_key(p_staff uuid, p_key text, a text default null, b text default null, c text default null, p_kind text default 'info') returns void
language plpgsql security definer set search_path = public as $$
declare v text := public.voice_of(p_staff); subj text; txt text;
begin
  case p_key
    when 'shift_added' then
      subj := case v when 'light' then 'משמרת חדשה בדרך אלייך' when 'brief' then 'נוספה משמרת' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'שובצת למשמרת: ' || a || '. אם זה לא מסתדר, אפשר לבקש החלפה בפורטל, ואנחנו נעזור.' when 'brief' then 'נוספה משמרת: ' || a || '.' else 'שובצת למשמרת: ' || a || '. אם זה לא מסתדר לך, אפשר לבקש החלפה בפורטל, ונשמח לעזור.' end;
    when 'shift_removed' then
      subj := case v when 'brief' then 'הוסרה משמרת' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'המשמרת ' || a || ' הוסרה מהסידור שלך. יום חופשי! (ותודה על הגמישות.)' when 'brief' then 'הוסרה משמרת: ' || a || '.' else 'המשמרת ' || a || ' הוסרה מהסידור שלך. תודה על הגמישות.' end;
    when 'shift_moved' then
      subj := case v when 'brief' then 'המשמרת עברה' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'המשמרת ' || a || ' עברה למישהו אחר. תודה על הגמישות!' when 'brief' then 'המשמרת ' || a || ' עברה לאחר.' else 'המשמרת ' || a || ' עברה למישהו אחר. תודה על הגמישות.' end;
    when 'shift_taken' then
      subj := case v when 'brief' then 'נוספה משמרת' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'שובצת למשמרת: ' || a || '. תודה שאת/ה שם/ה בשביל הצוות!' when 'brief' then 'שובצת: ' || a || '.' else 'שובצת למשמרת: ' || a || '. תודה שאת/ה שם/ה בשביל הצוות.' end;
    when 'shift_changed' then
      subj := case v when 'brief' then 'שעות המשמרת עודכנו' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'עדכנו את המשמרת ' || a || ' ל-' || b || '. אם זה לא מסתדר, דברו איתנו.' when 'brief' then 'עודכן: ' || a || ' ← ' || b || '.' else 'עדכנו את המשמרת ' || a || ' ל-' || b || '. נשמח אם זה מסתדר לך, ואם לא, דברו איתנו.' end;
    when 'team_change' then
      subj := case v when 'brief' then 'שינוי בצוות' else 'עדכון בצוות המשמרת שלך' end;
      txt  := case v when 'brief' then a || ': ' || b || '.' else 'עדכון קטן בצוות של המשמרת ' || a || ': ' || b || '.' end;
    when 'swap_found' then
      subj := case v when 'light' then 'נמצא גיבור/ה להחלפה' when 'brief' then 'נמצא מחליף/ה' else 'יש חדשות טובות לגבי ההחלפה' end;
      txt  := case v when 'light' then 'עמית מוכן/ה להחליף אותך במשמרת ' || a || '. העברנו לרכזת לאישור, ונעדכן ברגע שתהיה תשובה.' when 'brief' then 'נמצא מחליף/ה למשמרת ' || a || '. ממתין לאישור הרכזת.' else 'עמית מוכן/ה להחליף אותך במשמרת ' || a || '. העברנו את זה לרכזת לאישור, ונעדכן אותך ברגע שתהיה תשובה.' end;
    when 'swap_thanks' then
      subj := case v when 'brief' then 'ההצעה הועברה' else 'תודה שהצעת להחליף' end;
      txt  := case v when 'light' then 'תודה שהצעת להחליף במשמרת ' || a || '! הבקשה אצל הרכזת, ונעדכן כשתאשר.' when 'brief' then 'ההצעה למשמרת ' || a || ' הועברה לרכזת.' else 'תודה שהצעת להחליף במשמרת ' || a || '. הבקשה אצל הרכזת, ונעדכן אותך כשהיא תאשר.' end;
    when 'swap_waiting' then
      subj := 'בקשת החלפה מחכה לך';
      txt  := 'יש בקשת החלפה שמחכה לאישור שלך: ' || a || '.';
    when 'swap_rej_req' then
      subj := case v when 'brief' then 'ההחלפה לא אושרה' else 'לגבי בקשת ההחלפה שלך' end;
      txt  := case v when 'light' then 'הפעם לא הצלחנו לאשר את ההחלפה, והמשמרת נשארת אצלך. אפשר לדבר איתנו על פתרון אחר.' when 'brief' then 'ההחלפה לא אושרה. המשמרת נשארת אצלך.' else 'הפעם לא הצלחנו לאשר את ההחלפה, והמשמרת נשארת אצלך. אנחנו מבינים שזה לא תמיד נוח, ואפשר לדבר איתנו על פתרון אחר.' end;
    when 'swap_rej_take' then
      subj := case v when 'brief' then 'ההחלפה לא אושרה' else 'לגבי ההחלפה שהצעת' end;
      txt  := case v when 'light' then 'תודה על הנכונות! הפעם ההחלפה לא אושרה, אבל ההצעה שלך מוערכת מאוד.' when 'brief' then 'ההחלפה שהצעת לא אושרה. תודה.' else 'תודה על הנכונות! הפעם לא הצלחנו לאשר את ההחלפה, אבל ההצעה שלך מוערכת מאוד.' end;
    when 'cant_reporter' then
      subj := case v when 'brief' then 'העדכון התקבל' else 'קיבלנו את העדכון שלך' end;
      txt  := case v when 'light' then 'תודה שעדכנת. פתחנו את המשמרת ' || a || ' להחלפה ועדכנו את הרכזת, אז אין לך מה לדאוג. תרגיש/י טוב!' when 'brief' then 'המשמרת ' || a || ' נפתחה להחלפה והרכזת עודכנה.' else 'תודה שעדכנת אותנו. פתחנו את המשמרת ' || a || ' להחלפה ועדכנו את הרכזת, אז אין לך מה לדאוג. תרגיש/י טוב, ובריאות שלמה אם צריך.' end;
    when 'cant_team' then
      subj := case v when 'light' then 'קריאה לעזרה (קטנה)' when 'brief' then 'משמרת מחפשת מחליף/ה' else 'מישהו מהצוות זקוק לעזרה' end;
      txt  := case v when 'light' then 'משמרת מחפשת מחליף/ה: ' || a || '. אם יש לך אפשרות להציל אותה, הציע/י בלוח ההחלפות. תודה, אתם צוות!' when 'brief' then 'משמרת מחפשת מחליף/ה: ' || a || '. הצעה בלוח ההחלפות.' else 'נפתחה משמרת שמחפשת מחליף/ה: ' || a || '. אם יש לך אפשרות, נשמח אם תציע/י להחליף בלוח ההחלפות. תודה שאתם שם אחד בשביל השני.' end;
    when 'cant_coord' then
      subj := 'עדכון: משמרת שנפתחה להחלפה';
      txt  := a || ' עדכנ/ה שלא יהיה אפשר להגיע למשמרת ' || b || '. פתחנו אותה להחלפה, וכשיימצא מחליף/ה היא תחכה לאישורך.';
    when 'vac_ok' then
      subj := case v when 'brief' then 'החופשה אושרה' else 'החופשה שלך אושרה' end;
      txt  := case v when 'light' then 'בשורה טובה: בקשת החופשה שלך (' || a || ') אושרה. חופשה נעימה, ותיהנו (מגיע לך)!' when 'brief' then 'חופשה אושרה: ' || a || '.' else 'שמחים לעדכן שבקשת החופשה שלך (' || a || ') אושרה. חופשה נעימה ומרעננת!' end;
    when 'vac_no' then
      subj := case v when 'brief' then 'החופשה לא אושרה' else 'לגבי בקשת החופשה שלך' end;
      txt  := case v when 'light' then 'הפעם לא הצלחנו לאשר את בקשת החופשה (' || a || '). בואו נתאם מועד אחר שיתאים גם לכם וגם לצוות.' when 'brief' then 'חופשה לא אושרה: ' || a || '. נא לתאם מועד אחר מול הרכזת.' else 'הפעם לא הצלחנו לאשר את בקשת החופשה (' || a || '). נשמח לתאם איתך מועד אחר שיתאים גם לך וגם לצוות.' end;
    when 'open_coord' then
      subj := 'מישהי מילאה משמרת חסרה';
      txt  := a || ' שיבצה את עצמה למשמרת ' || b || '.';
    when 'open_self' then
      subj := case v when 'brief' then 'שובצת' else 'תודה שמילאת משמרת חסרה' end;
      txt  := case v when 'light' then 'שיבצנו אותך למשמרת ' || a || '. תודה, הצלת את היום!' when 'brief' then 'שובצת למשמרת ' || a || '.' else 'שיבצנו אותך למשמרת ' || a || '. תודה שאכפת לך מהצוות!' end;
    when 'open_req_coord' then
      subj := 'בקשה להצטרף למשמרת פתוחה';
      txt  := a || ' מבקש/ת להצטרף למשמרת ' || b || '. הבקשה מחכה לאישורך.';
    when 'open_req_self' then
      subj := case v when 'brief' then 'הבקשה נשלחה' else 'קיבלנו את הבקשה שלך' end;
      txt  := case v when 'light' then 'תודה על האומץ! הבקשה להצטרף למשמרת ' || a || ' אצל הרכזת, ונעדכן ברגע שתאשר.' when 'brief' then 'הבקשה למשמרת ' || a || ' נשלחה לרכזת.' else 'תודה שרצית להצטרף! הבקשה למשמרת ' || a || ' נשלחה לרכזת, ונעדכן אותך ברגע שתאשר.' end;
    when 'open_no' then
      subj := case v when 'brief' then 'הבקשה לא אושרה' else 'לגבי הבקשה להצטרף למשמרת' end;
      txt  := case v when 'light' then 'תודה על הנכונות! הפעם לא הצלחנו לאשר את המשמרת ' || a || ', אבל הרצון לעזור מוערך מאוד.' when 'brief' then 'המשמרת ' || a || ' לא אושרה. תודה.' else 'תודה על הנכונות להצטרף! הפעם לא הצלחנו לאשר את המשמרת ' || a || ', ואנחנו מעריכים מאוד את הרצון לעזור.' end;
    else
      subj := 'עדכון'; txt := coalesce(a, '');
  end case;
  perform public.tell_staff(p_staff, subj, txt, p_kind);
end $$;
revoke all on function public.tell_key(uuid, text, text, text, text, text) from public, anon, authenticated;

-- an instructor asks to join an open shift (she is placed only after the coordinator approves)
drop function if exists public.take_open_shift(date, text);
create or replace function public.request_open_shift(p_day date, p_shift text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); m date := date_trunc('month', p_day::timestamp)::date; rid uuid; who text; c record; st text;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  if p_shift not in ('M', 'A', 'N') then raise exception 'bad shift'; end if;
  if not exists (select 1 from public.open_shifts(m) o where o.day = p_day and o.shift = p_shift and o.req is null) then raise exception 'the shift is not open to you'; end if;
  insert into public.open_shift_requests (staff_id, day, shift) values (me, p_day, p_shift) returning id into rid;
  select display_name into who from public.staff where id = me;
  st := public.shift_text(p_day, p_shift, null, null);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop perform public.tell_key(c.id, 'open_req_coord', who, st); end loop;
  perform public.tell_key(me, 'open_req_self', st);
  return rid;
end $$;
create or replace function public.cancel_open_request(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.open_shift_requests set status = 'cancelled', decided_at = now() where id = p_id and staff_id = public.my_staff_id() and status = 'pending';
  if not found then raise exception 'nothing to cancel'; end if;
end $$;
-- the coordinator decides: approving places the person on the shift (and the people on that shift hear about it); rejecting tells her
create or replace function public.decide_open_shift(p_id uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare r public.open_shift_requests; m date; f time; t time; st text; have int;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  select * into r from public.open_shift_requests where id = p_id and status = 'pending'; if not found then raise exception 'nothing to decide'; end if;
  m := date_trunc('month', r.day::timestamp)::date;
  f := case r.shift when 'M' then time '07:00' when 'A' then time '14:00' else time '22:00' end;
  t := case r.shift when 'M' then time '15:00' when 'A' then time '22:00' else time '08:00' end;
  st := public.shift_text(r.day, r.shift, f, t);
  if p_approve then
    have := public.open_have(r.day, r.shift);
    if have >= public.open_need(r.day, r.shift) then raise exception 'the shift is already covered'; end if;
    if exists (select 1 from public.assignment x where x.staff_id = r.staff_id and x.day = r.day) then raise exception 'already working that day'; end if;
    insert into public.assignment (month, staff_id, day, shift, from_time, to_time, flags) values (m, r.staff_id, r.day, r.shift, f, t, array['self']);
    update public.open_shift_requests set status = 'approved', decided_at = now() where id = p_id;
    perform public.tell_key(r.staff_id, 'open_self', st, null, null, 'ok');
  else
    update public.open_shift_requests set status = 'rejected', decided_at = now() where id = p_id;
    perform public.tell_key(r.staff_id, 'open_no', st);
  end if;
end $$;
revoke all on function public.request_open_shift(date, text), public.cancel_open_request(uuid), public.decide_open_shift(uuid, boolean) from public, anon;
grant execute on function public.request_open_shift(date, text), public.cancel_open_request(uuid), public.decide_open_shift(uuid, boolean) to authenticated;

select 'scheduling_v11' as part, 'ok' as result;
