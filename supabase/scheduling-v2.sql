-- ================================================================
-- Scheduling, part 2 — run in the SQL Editor AFTER scheduling.sql. Safe to run again.
--   * per-month consents (extend to 16:00, pull from Saturday night to Sunday 11:00)
--   * availability of the service girls (per day, Sunday-Thursday)
--   * an automatic notice + e-mail to a person whenever a shift of theirs changes after the schedule was published
--   * an e-mail to the coordinator when a colleague offers to take a swap
--   * a safety net: if on the 25th the final schedule was not built, the draft is sent to the coordinator
-- Nothing here contains names or personal data.
-- ================================================================

-- ---------- consents, asked again every month (agreed 6 Oct 2026) ----------
create table if not exists public.prefs_consent (
  staff_id        uuid not null references public.staff(id) on delete cascade,
  month           date not null,                              -- the first day of the month the answer is for
  extend_morning  boolean not null default false,             -- willing to stay until 16:00 when needed (max 4 a month)
  pull_to_sunday  boolean not null default false,             -- willing to pull from Saturday night to Sunday 11:00
  answered_at     timestamptz not null default now(),
  primary key (staff_id, month)
);
-- ---------- service girls: what they can do each day (Sunday-Thursday) ----------
create table if not exists public.prefs_service (
  staff_id  uuid not null references public.staff(id) on delete cascade,
  day       date not null,
  opt       text not null check (opt in ('early', 'late', 'both', 'none')),      -- 07:00-16:00 / 11:00-19:00 / both / not available
  primary key (staff_id, day)
);
alter table public.prefs_consent enable row level security;
alter table public.prefs_service enable row level security;
drop policy if exists "own consent read"   on public.prefs_consent;
drop policy if exists "own consent add"    on public.prefs_consent;
drop policy if exists "own consent change" on public.prefs_consent;
drop policy if exists "see consents"       on public.prefs_consent;
create policy "own consent read"   on public.prefs_consent for select to authenticated using (staff_id = public.my_staff_id());
create policy "own consent add"    on public.prefs_consent for insert to authenticated with check (staff_id = public.my_staff_id() and public.prefs_open(month));
create policy "own consent change" on public.prefs_consent for update to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(month)) with check (staff_id = public.my_staff_id() and public.prefs_open(month));
create policy "see consents"       on public.prefs_consent for select to authenticated using (public.is_coordinator());
drop policy if exists "own service read"   on public.prefs_service;
drop policy if exists "own service add"    on public.prefs_service;
drop policy if exists "own service change" on public.prefs_service;
drop policy if exists "own service delete" on public.prefs_service;
drop policy if exists "see service prefs"  on public.prefs_service;
create policy "own service read"   on public.prefs_service for select to authenticated using (staff_id = public.my_staff_id());
create policy "own service add"    on public.prefs_service for insert to authenticated with check (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own service change" on public.prefs_service for update to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date)) with check (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own service delete" on public.prefs_service for delete to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "see service prefs"  on public.prefs_service for select to authenticated using (public.is_coordinator());
grant select, insert, update, delete on public.prefs_consent, public.prefs_service to authenticated;
revoke all on public.prefs_consent, public.prefs_service from anon;

-- ---------- one place that writes a notice (in the portal) + an e-mail (queued for the sender job) ----------
create or replace function public.tell_staff(p_staff uuid, p_subject text, p_text text, p_kind text default 'info') returns void
language plpgsql security definer set search_path = public as $$
declare mail text; nm text; url text;
begin
  if p_staff is null then return; end if;
  insert into public.notices (to_staff, text, kind) values (p_staff, p_text, p_kind);
  select p.email, s.display_name into mail, nm from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = p_staff;
  select value #>> '{}' into url from public.sched_settings where key = 'portal_url';
  if mail is not null then
    insert into public.email_outbox (to_email, subject, body, kind) values (mail, p_subject, 'שלום ' || nm || E',\n' || p_text || coalesce(E'\n\nלפורטל: ' || url, ''), p_kind);
  end if;
end $$;
revoke all on function public.tell_staff(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.shift_word(p_shift text) returns text language sql immutable as $$
  select case p_shift when 'M' then 'בוקר' when 'S' then 'בוקר קצר' when 'A' then 'צהריים' when 'N' then 'לילה' when 'L' then 'סופ"ש ארוך' else p_shift end
$$;
create or replace function public.shift_text(p_day date, p_shift text, p_from time, p_to time) returns text language sql immutable as $$
  select to_char(p_day, 'DD/MM') || ' (' || (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[extract(dow from p_day)::int + 1] || ') ' || public.shift_word(p_shift)
    || case when p_from is not null then ' ' || to_char(p_from, 'HH24:MI') || '–' || to_char(p_to, 'HH24:MI') else '' end
$$;

-- after the schedule is published, every change to a person's shift tells that person (notice + immediate e-mail)
create or replace function public.notify_assignment_change() returns trigger language plpgsql security definer set search_path = public as $$
declare m date := coalesce(new.month, old.month); pub boolean;
begin
  select (status = 'published') into pub from public.schedule where month = m;
  if not coalesce(pub, false) then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    perform public.tell_staff(new.staff_id, 'נוספה לך משמרת', 'שינוי במשמרות: נוספה לך משמרת ' || public.shift_text(new.day, new.shift, new.from_time, new.to_time) || '.', 'info');
  elsif tg_op = 'DELETE' then
    perform public.tell_staff(old.staff_id, 'משמרת הוסרה', 'שינוי במשמרות: הוסרה ממך המשמרת ' || public.shift_text(old.day, old.shift, old.from_time, old.to_time) || '.', 'warn');
  elsif old.staff_id is distinct from new.staff_id then
    perform public.tell_staff(old.staff_id, 'משמרת הוסרה', 'שינוי במשמרות: הוסרה ממך המשמרת ' || public.shift_text(old.day, old.shift, old.from_time, old.to_time) || '.', 'warn');
    perform public.tell_staff(new.staff_id, 'נוספה לך משמרת', 'שינוי במשמרות: נוספה לך משמרת ' || public.shift_text(new.day, new.shift, new.from_time, new.to_time) || '.', 'info');
  elsif (old.day, old.shift, old.from_time, old.to_time) is distinct from (new.day, new.shift, new.from_time, new.to_time) then
    perform public.tell_staff(new.staff_id, 'משמרת שונתה', 'שינוי במשמרות: המשמרת ' || public.shift_text(old.day, old.shift, old.from_time, old.to_time) || ' שונתה ל-' || public.shift_text(new.day, new.shift, new.from_time, new.to_time) || '.', 'warn');
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists assignment_notify on public.assignment;
create trigger assignment_notify after insert or update or delete on public.assignment for each row execute function public.notify_assignment_change();

-- the swap steps: the approval notice now comes from the trigger above (it says exactly what moved); the other steps tell the coordinator too
create or replace function public.offer_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sw public.swap_requests; a public.assignment; c record;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'open'; if not found then raise exception 'request is not open'; end if;
  if sw.from_staff = me then raise exception 'own request'; end if;
  select * into a from public.assignment where id = sw.assignment_id;
  if exists (select 1 from public.assignment x where x.staff_id = me and x.day = a.day) then raise exception 'already working that day'; end if;
  update public.swap_requests set to_staff = me, status = 'offered' where id = p_swap;
  perform public.tell_staff(sw.from_staff, 'הוצעה לך החלפה', 'עמית הציע/ה להחליף אותך במשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '. הבקשה הועברה לרכזת.', 'info');
  perform public.tell_staff(me, 'הבקשה להחלפה הועברה', 'הבקשה להחלפה במשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || ' הועברה לרכזת.', 'info');
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop
    perform public.tell_staff(c.id, 'בקשת החלפה ממתינה לאישורך', 'יש בקשת החלפה שממתינה לאישורך: ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '.', 'info');
  end loop;
end $$;
create or replace function public.decide_swap(p_swap uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare sw public.swap_requests;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'offered'; if not found then raise exception 'nothing to decide'; end if;
  if p_approve then
    update public.swap_requests set status = 'approved', decided_at = now() where id = p_swap;
    update public.assignment set staff_id = sw.to_staff where id = sw.assignment_id;          -- (the trigger tells both people)
  else
    update public.swap_requests set status = 'rejected', decided_at = now() where id = p_swap;
    perform public.tell_staff(sw.from_staff, 'בקשת ההחלפה לא אושרה', 'בקשת ההחלפה לא אושרה. המשמרת נשארת אצלך.', 'warn');
    perform public.tell_staff(sw.to_staff, 'ההחלפה לא אושרה', 'ההחלפה לא אושרה.', 'warn');
  end if;
end $$;
revoke all on function public.offer_swap(uuid), public.decide_swap(uuid, boolean) from public, anon;
grant execute on function public.offer_swap(uuid), public.decide_swap(uuid, boolean) to authenticated;

-- ---------- safety net: on the 25th, if the final schedule did not get built by 05:30, the draft goes to the coordinator ----------
create or replace function public.sched_safety_net() returns text language plpgsql security definer set search_path = public as $$
declare il timestamp := now() at time zone 'Asia/Jerusalem'; m date := (date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date; s public.schedule; c record; alert text; res text;
begin
  if extract(day from il) <> 25 or il::time < time '05:30' or il::time > time '09:00' then return 'not the time'; end if;
  select * into s from public.schedule where month = m;
  if not found then
    select value #>> '{}' into alert from public.sched_settings where key = 'alert_email';
    if alert is not null then insert into public.email_outbox (to_email, subject, body, kind) values (alert, 'לא נוצר סידור לחודש הבא', 'עד 05:30 לא נוצרו לא טיוטה ולא סידור סופי. צריך לבדוק את המערכת.', 'alert'); end if;
    return 'no schedule at all';
  end if;
  if s.status = 'draft' then
    update public.schedule set status = 'sent', sent_to_coordinator = now(), log = coalesce(log, '') || E'\nהסידור הסופי לא נבנה בזמן, נשלחה הטיוטה (רשת ביטחון).' where month = m;
    for c in select id from public.staff where kind = 'coordinator' and active loop
      perform public.tell_staff(c.id, 'הסידור לחודש הבא מוכן (טיוטה)', 'נשלחה אלייך טיוטת הסידור לחודש הבא. הסידור הסופי לא נבנה בזמן, ולכן כדאי לעבור עליה בעיון.', 'warn');
    end loop;
    res := 'draft sent';
  else res := 'already ' || s.status; end if;
  return res;
end $$;
revoke all on function public.sched_safety_net() from public, anon, authenticated;
-- run it with pg_cron when that extension is on (Database -> Extensions -> pg_cron). Two entries because of summer/winter time; the function itself checks the Israel time.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('sched-safety-net-a', 'sched-safety-net-b');
    perform cron.schedule('sched-safety-net-a', '35 2 25 * *', 'select public.sched_safety_net()');
    perform cron.schedule('sched-safety-net-b', '35 3 25 * *', 'select public.sched_safety_net()');
  end if;
end $$;
select 'ok' as scheduling_v2, exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_on;
