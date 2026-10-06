-- ================================================================
-- Scheduling, part 2 — run in the SQL Editor AFTER scheduling.sql. Safe to run again.
--   * per-month consents (extend to 16:00, pull from Saturday night to Sunday 11:00)
--   * availability of the service girls (per day, Sunday-Thursday)
--   * an automatic notice + e-mail to a person whenever a shift of theirs changes after the schedule was published
--   * an e-mail to the coordinator when a colleague offers to take a swap
--   * a safety net: if on the 25th the final schedule was not built, the draft is sent to the coordinator
--   * (2b) absence reasons + long-vacation requests, 'I cannot come' reports, special days, announcements, an audit log, the TV's 'who works today' function
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
declare m date := case when tg_op = 'DELETE' then old.month else new.month end; pub boolean; o public.assignment; n public.assignment; oname text; nname text; cw record; what text;
begin
  select (status = 'published') into pub from public.schedule where month = m;
  if not coalesce(pub, false) then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if tg_op <> 'INSERT' then o := old; end if;
  if tg_op <> 'DELETE' then n := new; end if;
  if o.id is not null then select display_name into oname from public.staff where id = o.staff_id; end if;
  if n.id is not null then select display_name into nname from public.staff where id = n.staff_id; end if;
  if tg_op = 'INSERT' then
    perform public.tell_staff(n.staff_id, 'נוספה לך משמרת', 'שינוי במשמרות: נוספה לך משמרת ' || public.shift_text(n.day, n.shift, n.from_time, n.to_time) || '.', 'info');
    what := nname || ' נוסף/ה למשמרת';
  elsif tg_op = 'DELETE' then
    perform public.tell_staff(o.staff_id, 'משמרת הוסרה', 'שינוי במשמרות: הוסרה ממך המשמרת ' || public.shift_text(o.day, o.shift, o.from_time, o.to_time) || '.', 'warn');
    what := oname || ' הוסר/ה מהמשמרת';
  elsif o.staff_id is distinct from n.staff_id then
    perform public.tell_staff(o.staff_id, 'משמרת הוסרה', 'שינוי במשמרות: הוסרה ממך המשמרת ' || public.shift_text(o.day, o.shift, o.from_time, o.to_time) || '.', 'warn');
    perform public.tell_staff(n.staff_id, 'נוספה לך משמרת', 'שינוי במשמרות: נוספה לך משמרת ' || public.shift_text(n.day, n.shift, n.from_time, n.to_time) || '.', 'info');
    what := oname || ' הוחלף/ה ב' || nname;
  elsif (o.day, o.shift, o.from_time, o.to_time) is distinct from (n.day, n.shift, n.from_time, n.to_time) then
    perform public.tell_staff(n.staff_id, 'משמרת שונתה', 'שינוי במשמרות: המשמרת ' || public.shift_text(o.day, o.shift, o.from_time, o.to_time) || ' שונתה ל-' || public.shift_text(n.day, n.shift, n.from_time, n.to_time) || '.', 'warn');
    what := nname || ': שעות המשמרת שונו';
  end if;
  -- everybody else who is on that same shift is told too
  if what is not null then
    for cw in select distinct x.staff_id from public.assignment x
              where x.month = m and x.day = coalesce(n.day, o.day) and x.shift = coalesce(n.shift, o.shift)
                and x.staff_id is distinct from o.staff_id and x.staff_id is distinct from n.staff_id loop
      perform public.tell_staff(cw.staff_id, 'שינוי בצוות המשמרת', 'שינוי בצוות המשמרת ' || public.shift_text(coalesce(n.day, o.day), coalesce(n.shift, o.shift), coalesce(n.from_time, o.from_time), coalesce(n.to_time, o.to_time)) || ': ' || what || '.', 'info');
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;drop trigger if exists assignment_notify on public.assignment;
create trigger assignment_notify after insert or update or delete on public.assignment for each row execute function public.notify_assignment_change();

-- the swap steps: the approval notice now comes from the trigger above (it says exactly what moved); the other steps tell the coordinator too
create or replace function public.offer_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sw public.swap_requests; a public.assignment; c record; my_rank int; from_rank int;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'open'; if not found then raise exception 'request is not open'; end if;
  if sw.from_staff = me then raise exception 'own request'; end if;
  select * into a from public.assignment where id = sw.assignment_id;
  if exists (select 1 from public.assignment x where x.staff_id = me and x.day = a.day) then raise exception 'already working that day'; end if;
  -- an afternoon shift must never be left without an ahmash
  if a.shift = 'A' then
    select coalesce(ahmash_rank, 0) into from_rank from public.staff_private where staff_id = sw.from_staff;
    select coalesce(ahmash_rank, 0) into my_rank from public.staff_private where staff_id = me;
    if from_rank > 0 and my_rank = 0 and not exists (select 1 from public.assignment x join public.staff_private q on q.staff_id = x.staff_id
         where x.day = a.day and x.shift = 'A' and x.staff_id <> sw.from_staff and coalesce(q.ahmash_rank, 0) > 0) then
      raise exception 'would leave the shift without an ahmash';
    end if;
  end if;
  update public.swap_requests set to_staff = me, status = 'offered' where id = p_swap;
  perform public.tell_staff(sw.from_staff, 'הוצעה לך החלפה', 'עמית הציע/ה להחליף אותך במשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '. הבקשה הועברה לרכזת.', 'info');
  perform public.tell_staff(me, 'הבקשה להחלפה הועברה', 'הבקשה להחלפה במשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || ' הועברה לרכזת.', 'info');
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop
    perform public.tell_staff(c.id, 'בקשת החלפה ממתינה לאישורך', 'יש בקשת החלפה שממתינה לאישורך: ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '.', 'info');
  end loop;
end $$;create or replace function public.decide_swap(p_swap uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
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

-- ================= part 2b: decisions of 6 Oct (round 3) =================
alter table public.staff add column if not exists start_date date;           -- first / last working day (a new or leaving instructor)
alter table public.staff add column if not exists end_date date;
alter table public.swap_requests add column if not exists urgent boolean not null default false;
insert into public.sched_settings (key, value) values ('vacation_min_days', '30') on conflict (key) do nothing;     -- a long vacation must be requested this many days ahead

-- absences now say why (the coordinator marks sick leave, reserve duty, ...; an approved vacation request is entered automatically)
alter table public.prefs_absence add column if not exists reason text not null default 'self' check (reason in ('self', 'vacation', 'sick', 'reserve', 'leave', 'other'));
alter table public.prefs_absence add column if not exists note text;
drop policy if exists "own absences add"    on public.prefs_absence;
drop policy if exists "own absences delete" on public.prefs_absence;
drop policy if exists "coordinator absences" on public.prefs_absence;
create policy "own absences add"    on public.prefs_absence for insert to authenticated with check (staff_id = public.my_staff_id() and reason = 'self' and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own absences delete" on public.prefs_absence for delete to authenticated using (staff_id = public.my_staff_id() and reason = 'self' and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "coordinator absences" on public.prefs_absence for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());

-- long vacation: requested in advance, the coordinator decides
create or replace function public.vacation_min_days() returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from public.sched_settings where key = 'vacation_min_days'), 30)
$$;
create table if not exists public.vacation_requests (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff(id) on delete cascade,
  from_day    date not null,
  to_day      date not null,
  note        text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  check (to_day >= from_day and to_day - from_day < 60)
);
alter table public.vacation_requests drop constraint if exists vacation_requests_check;
alter table public.vacation_requests drop constraint if exists vacation_span;
alter table public.vacation_requests add constraint vacation_span check (to_day >= from_day and to_day - from_day < 120);
alter table public.vacation_requests enable row level security;
drop policy if exists "own vacation read"   on public.vacation_requests;
drop policy if exists "own vacation add"    on public.vacation_requests;
drop policy if exists "own vacation cancel" on public.vacation_requests;
drop policy if exists "see vacations"       on public.vacation_requests;
create policy "own vacation read"   on public.vacation_requests for select to authenticated using (staff_id = public.my_staff_id());
create policy "own vacation add"    on public.vacation_requests for insert to authenticated with check (staff_id = public.my_staff_id() and status = 'pending' and from_day >= current_date);          -- (the advance notice - 30 days, 2 months for 3 weeks or more - is guidance in the portal, not a rule here)
create policy "own vacation cancel" on public.vacation_requests for update to authenticated using (staff_id = public.my_staff_id() and status = 'pending') with check (staff_id = public.my_staff_id() and status in ('pending', 'cancelled'));
create policy "see vacations"       on public.vacation_requests for select to authenticated using (public.is_coordinator());
grant select, insert, update on public.vacation_requests to authenticated;
revoke all on public.vacation_requests from anon;
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
    for a in select * from public.assignment x where x.staff_id = v.staff_id and x.day between v.from_day and v.to_day loop      -- a shift already handed out in those days: the coordinator must look at it
      insert into public.coordinator_flags (month, day, kind, text, staff_id) values (a.month, a.day, 'vacation_conflict', 'חופשה שאושרה חופפת למשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time), a.staff_id);
    end loop;
    perform public.tell_staff(v.staff_id, 'בקשת החופשה אושרה', 'בקשת החופשה שלך אושרה (' || to_char(v.from_day, 'DD/MM') || '–' || to_char(v.to_day, 'DD/MM') || ').', 'ok');
  else
    update public.vacation_requests set status = 'rejected', decided_at = now() where id = p_id;
    perform public.tell_staff(v.staff_id, 'בקשת החופשה לא אושרה', 'בקשת החופשה שלך (' || to_char(v.from_day, 'DD/MM') || '–' || to_char(v.to_day, 'DD/MM') || ') לא אושרה. אפשר לפנות לרכזת.', 'warn');
  end if;
end $$;
revoke all on function public.decide_vacation(uuid, boolean) from public, anon;
grant execute on function public.decide_vacation(uuid, boolean) to authenticated;

-- "I cannot come" (sick at the last minute): the shift opens for a replacement at once, the coordinator and the team are told; the coordinator still approves the swap when somebody is found
create table if not exists public.sick_reports (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignment(id) on delete cascade,
  staff_id      uuid not null references public.staff(id) on delete cascade,
  note          text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
alter table public.sick_reports enable row level security;
drop policy if exists "see sick reports" on public.sick_reports;
create policy "see sick reports" on public.sick_reports for select to authenticated using (staff_id = public.my_staff_id() or public.is_coordinator());
grant select on public.sick_reports to authenticated;
revoke all on public.sick_reports from anon;
create or replace function public.report_cannot_come(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); a public.assignment; rid uuid; c record; i record; who text;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  select * into a from public.assignment where id = p_assignment and staff_id = me and day >= current_date; if not found then raise exception 'not your upcoming shift'; end if;
  if exists (select 1 from public.swap_requests where assignment_id = p_assignment and status in ('open', 'offered')) then raise exception 'already reported'; end if;
  select display_name into who from public.staff where id = me;
  insert into public.sick_reports (assignment_id, staff_id, note, status, decided_at) values (p_assignment, me, p_note, 'approved', now()) returning id into rid;
  insert into public.swap_requests (assignment_id, from_staff, urgent) values (p_assignment, me, true);                 -- open for a replacement at once
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop
    perform public.tell_staff(c.id, 'דיווח: לא יכול/ה להגיע', who || ' דיווח/ה שלא יוכל/תוכל להגיע למשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '. המשמרת נפתחה להחלפה. כשיימצא מחליף/ה, החלפה תחכה לאישורך.', 'warn');
  end loop;
  for i in select s.id from public.staff s where s.kind = 'instructor' and s.active and s.id <> me loop
    perform public.tell_staff(i.id, 'משמרת פנויה בדחיפות', 'נפתחה משמרת פנויה: ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || '. מי שיכול/ה מוזמן/ת להציע להחליף בלוח ההחלפות.', 'warn');
  end loop;
  perform public.tell_staff(me, 'הדיווח נשלח', 'הדיווח על המשמרת ' || public.shift_text(a.day, a.shift, a.from_time, a.to_time) || ' נשלח לרכזת, והמשמרת נפתחה להחלפה.', 'info');
  return rid;
end $$;
drop function if exists public.decide_sick_report(uuid, boolean);revoke all on function public.report_cannot_come(uuid, text) from public, anon;
grant execute on function public.report_cannot_come(uuid, text) to authenticated;

-- special days (holidays are filled in automatically by the job; the coordinator can edit or add)
create table if not exists public.special_days (
  day        date primary key,
  kind       text not null check (kind in ('holiday', 'eve', 'special')),      -- holiday = like Saturday, eve = like Friday, special = own staffing numbers
  label      text,
  min_staff  int,
  max_staff  int
);
alter table public.special_days enable row level security;
drop policy if exists "see special days"  on public.special_days;
drop policy if exists "edit special days" on public.special_days;
create policy "see special days"  on public.special_days for select to authenticated using (public.is_personal() or public.is_coordinator());
create policy "edit special days" on public.special_days for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
grant select, insert, update, delete on public.special_days to authenticated;
revoke all on public.special_days from anon;

-- announcements from the coordinator: in the portal, by e-mail, or both (her choice each time)
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  from_staff  uuid references public.staff(id) on delete set null,
  text        text not null,
  via         text not null check (via in ('portal', 'email', 'both'))
);
alter table public.announcements enable row level security;
drop policy if exists "see announcements" on public.announcements;
create policy "see announcements" on public.announcements for select to authenticated using (public.is_personal() or public.is_coordinator());
grant select on public.announcements to authenticated;
revoke all on public.announcements from anon;
create or replace function public.post_announcement(p_text text, p_via text) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); r record; url text;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  if p_via not in ('portal', 'email', 'both') or coalesce(trim(p_text), '') = '' then raise exception 'bad input'; end if;
  insert into public.announcements (from_staff, text, via) values (me, p_text, p_via);
  if p_via in ('email', 'both') then
    select value #>> '{}' into url from public.sched_settings where key = 'portal_url';
    for r in select p.email, s.display_name from public.staff s join public.staff_private p on p.staff_id = s.id where s.active and p.email is not null and s.id is distinct from me loop
      insert into public.email_outbox (to_email, subject, body, kind) values (r.email, 'הודעה מהרכזת', 'שלום ' || r.display_name || E',\n' || p_text || coalesce(E'\n\nלפורטל: ' || url, ''), 'announcement');
    end loop;
  end if;
end $$;
revoke all on function public.post_announcement(text, text) from public, anon;
grant execute on function public.post_announcement(text, text) to authenticated;

-- a log of every change to the shifts: who, what, when (visible to the coordinator and the manager)
create table if not exists public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  by_staff  uuid,
  what      text not null,
  detail    jsonb
);
alter table public.audit_log enable row level security;
drop policy if exists "see audit log" on public.audit_log;
create policy "see audit log" on public.audit_log for select to authenticated using (public.is_coordinator());
grant select on public.audit_log to authenticated;
revoke all on public.audit_log from anon;
create or replace function public.audit_assignment() returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), lower(tg_op) || ' shift', jsonb_build_object('old', o, 'new', n, 'auth', auth.uid()));
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists assignment_audit on public.assignment;
create trigger assignment_audit after insert or update or delete on public.assignment for each row execute function public.audit_assignment();

-- the TV of the children: who works TODAY (morning, afternoon, night) — first name + photo only. The only thing of the staff data that a visitor can read.
drop function if exists public.tv_on_shift();
create or replace function public.tv_today() returns table (first_name text, photo_url text, shift text, kind text, from_time text, to_time text)
language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; t time := (now() at time zone 'Asia/Jerusalem')::time; sh jsonb;
begin
  select value into sh from public.sched_settings where key = 'shifts';
  return query
  select s.display_name, s.photo_url, a.shift, s.kind,
         to_char(coalesce(a.from_time, (sh -> a.shift ->> 'from')::time), 'HH24:MI'), to_char(coalesce(a.to_time, (sh -> a.shift ->> 'to')::time), 'HH24:MI')
  from public.assignment a join public.staff s on s.id = a.staff_id join public.schedule sc on sc.month = a.month and sc.status = 'published'
  where s.active and (a.day = d or (a.shift = 'N' and a.day = d - 1 and t < time '08:00') or (a.shift = 'L' and a.day = d - 1 and t < time '22:00'))
  order by a.from_time, s.display_name;
end $$;revoke all on function public.tv_today() from public;
grant execute on function public.tv_today() to anon, authenticated;
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
