-- ================================================================
-- Scheduling, part 6 — run in the SQL Editor after scheduling-v5.sql. Safe to run again.
--   * the person's own settings: the voice of the system (warm / light / brief) and whether to get the reminders
--   * every notice and e-mail that the database writes to a person is now written in HER voice
-- ================================================================
create table if not exists public.staff_settings (
  staff_id    uuid primary key references public.staff(id) on delete cascade,
  voice       text check (voice in ('warm', 'light', 'brief')),
  reminders   boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.staff_settings enable row level security;
drop policy if exists "own settings read"   on public.staff_settings;
drop policy if exists "own settings add"    on public.staff_settings;
drop policy if exists "own settings change" on public.staff_settings;
drop policy if exists "see settings of all" on public.staff_settings;
create policy "own settings read"   on public.staff_settings for select to authenticated using (staff_id = public.my_staff_id());
create policy "own settings add"    on public.staff_settings for insert to authenticated with check (staff_id = public.my_staff_id());
create policy "own settings change" on public.staff_settings for update to authenticated using (staff_id = public.my_staff_id()) with check (staff_id = public.my_staff_id());
create policy "see settings of all" on public.staff_settings for select to authenticated using (public.is_coordinator());
grant select, insert, update on public.staff_settings to authenticated;
revoke all on public.staff_settings from anon;

create or replace function public.voice_of(p_staff uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select voice from public.staff_settings where staff_id = p_staff), 'warm')
$$;
revoke all on function public.voice_of(uuid) from public, anon, authenticated;

-- the e-mail wrapper, in the person's voice (the notice in the portal carries only the text)
create or replace function public.tell_staff(p_staff uuid, p_subject text, p_text text, p_kind text default 'info') returns void
language plpgsql security definer set search_path = public as $$
declare mail text; nm text; url text; v text := public.voice_of(p_staff);
begin
  if p_staff is null then return; end if;
  insert into public.notices (to_staff, text, kind) values (p_staff, p_text, p_kind);
  select p.email, s.display_name into mail, nm from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = p_staff;
  select value #>> '{}' into url from public.sched_settings where key = 'portal_url';
  if mail is not null then
    insert into public.email_outbox (to_email, subject, body, kind) values (mail, p_subject,
      case v
        when 'light' then 'היי ' || nm || E',\n\n' || p_text || E'\n\nשאלה? בקשה? סתם רצון לדבר? אנחנו כאן.' || coalesce(E'\nהפורטל: ' || url, '') || E'\n\nשלך,\nהצוות במרכז חירום'
        when 'brief' then nm || E',\n\n' || p_text || coalesce(E'\n\nהפורטל: ' || url, '')
        else 'שלום ' || nm || E',\n\n' || p_text || E'\n\nאנחנו כאן בשבילך, ואפשר לפנות אלינו בכל שאלה או בקשה.' || coalesce(E'\nהפורטל שלך: ' || url, '') || E'\n\nבהוקרה,\nהצוות שלך במרכז חירום'
      end, p_kind);
  end if;
end $$;
revoke all on function public.tell_staff(uuid, text, text, text) from public, anon, authenticated;

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
    else
      subj := 'עדכון'; txt := coalesce(a, '');
  end case;
  perform public.tell_staff(p_staff, subj, txt, p_kind);
end $$;
revoke all on function public.tell_key(uuid, text, text, text, text, text) from public, anon, authenticated;

-- ---------- the places that write to people now use the keys ----------
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
    perform public.tell_key(n.staff_id, 'shift_added', public.shift_text(n.day, n.shift, n.from_time, n.to_time));
    what := nname || ' הצטרף/ה למשמרת';
  elsif tg_op = 'DELETE' then
    perform public.tell_key(o.staff_id, 'shift_removed', public.shift_text(o.day, o.shift, o.from_time, o.to_time));
    what := oname || ' לא במשמרת הזאת יותר';
  elsif o.staff_id is distinct from n.staff_id then
    perform public.tell_key(o.staff_id, 'shift_moved', public.shift_text(o.day, o.shift, o.from_time, o.to_time));
    perform public.tell_key(n.staff_id, 'shift_taken', public.shift_text(n.day, n.shift, n.from_time, n.to_time));
    what := oname || ' הוחלף/ה ב' || nname;
  elsif (o.day, o.shift, o.from_time, o.to_time) is distinct from (n.day, n.shift, n.from_time, n.to_time) then
    perform public.tell_key(n.staff_id, 'shift_changed', public.shift_text(o.day, o.shift, o.from_time, o.to_time), public.shift_text(n.day, n.shift, n.from_time, n.to_time));
    what := nname || ': שעות המשמרת עודכנו';
  end if;
  if what is not null then
    for cw in select distinct x.staff_id from public.assignment x
              where x.month = m and x.day = coalesce(n.day, o.day) and x.shift = coalesce(n.shift, o.shift)
                and x.staff_id is distinct from o.staff_id and x.staff_id is distinct from n.staff_id loop
      perform public.tell_key(cw.staff_id, 'team_change', public.shift_text(coalesce(n.day, o.day), coalesce(n.shift, o.shift), coalesce(n.from_time, o.from_time), coalesce(n.to_time, o.to_time)), what);
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

create or replace function public.offer_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sw public.swap_requests; a public.assignment; c record; my_rank int; from_rank int; st text;
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
  st := public.shift_text(a.day, a.shift, a.from_time, a.to_time);
  perform public.tell_key(sw.from_staff, 'swap_found', st);
  perform public.tell_key(me, 'swap_thanks', st);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop perform public.tell_key(c.id, 'swap_waiting', st); end loop;
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
    perform public.tell_key(sw.from_staff, 'swap_rej_req');
    perform public.tell_key(sw.to_staff, 'swap_rej_take');
  end if;
end $$;
create or replace function public.report_cannot_come(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); a public.assignment; rid uuid; c record; i record; who text; st text;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  select * into a from public.assignment where id = p_assignment and staff_id = me and day >= current_date; if not found then raise exception 'not your upcoming shift'; end if;
  if exists (select 1 from public.swap_requests where assignment_id = p_assignment and status in ('open', 'offered')) then raise exception 'already reported'; end if;
  select display_name into who from public.staff where id = me;
  st := public.shift_text(a.day, a.shift, a.from_time, a.to_time);
  insert into public.sick_reports (assignment_id, staff_id, note, status, decided_at) values (p_assignment, me, p_note, 'approved', now()) returning id into rid;
  insert into public.swap_requests (assignment_id, from_staff, urgent) values (p_assignment, me, true);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop perform public.tell_key(c.id, 'cant_coord', who, st, null, 'warn'); end loop;
  for i in select s.id from public.staff s where s.kind = 'instructor' and s.active and s.id <> me loop perform public.tell_key(i.id, 'cant_team', st); end loop;
  perform public.tell_key(me, 'cant_reporter', st);
  return rid;
end $$;
create or replace function public.decide_vacation(p_id uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare v public.vacation_requests; a record; dates text;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  select * into v from public.vacation_requests where id = p_id and status = 'pending'; if not found then raise exception 'nothing to decide'; end if;
  dates := to_char(v.from_day, 'DD/MM') || '–' || to_char(v.to_day, 'DD/MM');
  if p_approve then
    update public.vacation_requests set status = 'approved', decided_at = now() where id = p_id;
    insert into public.prefs_absence (staff_id, day, reason, note)
      select v.staff_id, g::date, 'vacation', v.note from generate_series(v.from_day::timestamp, v.to_day::timestamp, interval '1 day') g
      on conflict (staff_id, day) do update set reason = 'vacation', note = excluded.note;
    for a in select * from public.assignment x where x.staff_id = v.staff_id and x.day between v.from_day and v.to_day loop
      insert into public.coordinator_flags (month, day, kind, text, staff_id) values (a.month, a.day, 'vacation_conflict', 'חופשה שאושרה חופפת למשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time), a.staff_id);
    end loop;
    perform public.tell_key(v.staff_id, 'vac_ok', dates, null, null, 'ok');
  else
    update public.vacation_requests set status = 'rejected', decided_at = now() where id = p_id;
    perform public.tell_key(v.staff_id, 'vac_no', dates);
  end if;
end $$;
create or replace function public.take_open_shift(p_day date, p_shift text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); m date := date_trunc('month', p_day::timestamp)::date; rid uuid; f time; t time; who text; c record; st text;
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
  st := public.shift_text(p_day, p_shift, f, t);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop perform public.tell_key(c.id, 'open_coord', who, st); end loop;
  perform public.tell_key(me, 'open_self', st, null, null, 'ok');
  return rid;
end $$;
revoke all on function public.offer_swap(uuid), public.decide_swap(uuid, boolean), public.report_cannot_come(uuid, text), public.decide_vacation(uuid, boolean), public.take_open_shift(date, text) from public, anon;
grant execute on function public.offer_swap(uuid), public.decide_swap(uuid, boolean), public.report_cannot_come(uuid, text), public.decide_vacation(uuid, boolean), public.take_open_shift(date, text) to authenticated;

select 'ok' as scheduling_v6;
