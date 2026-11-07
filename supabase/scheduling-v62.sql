-- scheduling v62 (2026-11-05): the secretary, the stars, mentoring and volunteering (Alex card c36860ff + Guy's answers of 5 Nov). Run once on each project, TEST first. Safe to run again.
--   * a new kind of staff: 'secretary'. She works in the Ramzor with her personal sign-in; the admin has all of her new abilities too.
--   * stars: the secretary and the admin may lower them as far as they want (the other boards stay as they were).
--   * "ילדים במסגרת": the secretary and the admin, with no shared password. No other part of the management screen.
--   * the timetable: the secretary changes all of it; a change of hers tells nobody (the manager's still tells the coordinator).
--   * an ahmash changes the timetable of today ONLY during their shift (the rest of the control stays as it was).
--   * mentoring and volunteering: tt_event (a series: every N weeks, or a month's Nth weekday), tt_event_skip, tt_contact.
--     Written only through the functions here. The kids' TV reads tv_events_today(): no phone ever leaves tt_contact.

-- ---------- who is who ----------
alter table public.staff drop constraint if exists staff_kind_check;
alter table public.staff add constraint staff_kind_check check (kind in ('instructor', 'service', 'teacher', 'coordinator', 'admin', 'therapist', 'manager', 'secretary'));

create or replace function public.is_secretary() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() and s.active and s.kind = 'secretary')
$$;
revoke all on function public.is_secretary() from public, anon;
grant execute on function public.is_secretary() to authenticated;

-- the Ramzor data: as before, plus the secretary
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('staff@merkaz-cherum.local', 'manager@merkaz-cherum.local')
      or exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and s.active and s.kind in ('instructor', 'coordinator', 'admin', 'secretary'))
$$;
-- (the ahmash control is not hers: Guy, in answer to the question. can_control() stays as it was)

-- an ahmash on shift right now (Guy 5 Nov: anybody with an ahmash rank who is on shift now, not only the marked one).
-- By the published schedule and the person's own hours; today's changes of the control count: taken off the shift = not on it, added = on it
create or replace function public.ahmash_on_shift() returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := public.my_staff_id();
  t timestamp := now() at time zone 'Asia/Jerusalem';
  d date := t::date; n time := t::time;
  cur text := case when t::time >= '22:00' or t::time < '07:00' then 'N' when t::time >= '14:00' then 'A' else 'M' end;
  logical date := case when t::time < '07:00' then t::date - 1 else t::date end;
  sh jsonb;
begin
  if me is null or not exists (select 1 from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = me and s.active and p.ahmash_rank > 0) then return false; end if;
  if exists (select 1 from public.tv_day_changes c where c.day = logical and c.staff_id = me and c.shift = cur and c.action = 'remove') then return false; end if;
  if exists (select 1 from public.tv_day_changes c where c.day = logical and c.staff_id = me and c.shift = cur and c.action = 'add') then return true; end if;
  select value into sh from public.sched_settings where key = 'shifts';
  return exists (
    select 1 from (
      select a.day, a.shift, coalesce(a.from_time, (sh -> a.shift ->> 'from')::time) f, coalesce(a.to_time, (sh -> a.shift ->> 'to')::time) e
      from public.assignment a join public.schedule sc on sc.month = a.month and sc.status = 'published'
      where a.staff_id = me and a.day between d - 1 and d) x
    where t >= x.day + x.f and t < case when x.shift = 'L' or x.e <= x.f then x.day + 1 + x.e else x.day + x.e end);
end $$;
revoke all on function public.ahmash_on_shift() from public, anon;
grant execute on function public.ahmash_on_shift() to authenticated;

-- who changes the timetable and the events (Guy 5 Nov: the coordinator and the manager too; an ahmash during the shift)
create or replace function public.can_edit_timetable() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_coordinator(), false) or coalesce(public.is_director(), false) or public.is_secretary() or public.ahmash_on_shift()
$$;
revoke all on function public.can_edit_timetable() from public, anon;
grant execute on function public.can_edit_timetable() to authenticated;

-- ---------- the timetable ----------
drop policy if exists "day: control" on public.timetable_day;
create policy "day: control" on public.timetable_day for all to authenticated using (public.can_edit_timetable()) with check (public.can_edit_timetable());
drop policy if exists "fixed: secretary" on public.timetable_fixed;
create policy "fixed: secretary" on public.timetable_fixed for all to authenticated using (public.is_secretary()) with check (public.is_secretary());

-- ---------- the stars and "ילדים במסגרת" ----------
create or replace function public.child_state_guard() returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'authenticated' or public.is_manager() then
    return coalesce(new, old);                         -- the SQL editor / the manager
  end if;
  if tg_op = 'UPDATE' and ((new.stars < old.stars - 1 and not (public.is_secretary() or public.is_admin()))
                           or new.moon_steps < old.moon_steps - 1 or new.mercury_steps < old.mercury_steps - 1 or new.moon_gifts < old.moon_gifts - 1 or new.bricks < old.bricks - 1) then
    raise exception 'only the manager may reset the boards';
  end if;
  return new;
end $$;

drop policy if exists "secretary children"   on public.roster;
drop policy if exists "secretary children 2" on public.roster;
drop policy if exists "secretary children 3" on public.roster;
create policy "secretary children"   on public.roster for insert to authenticated with check (public.is_secretary() or public.is_admin());
create policy "secretary children 2" on public.roster for update to authenticated using (public.is_secretary() or public.is_admin()) with check (public.is_secretary() or public.is_admin());
create policy "secretary children 3" on public.roster for delete to authenticated using (public.is_secretary() or public.is_admin());
-- the ship and the character of a child live in one row of mini_lists; only that row
drop policy if exists "secretary child settings" on public.mini_lists;
create policy "secretary child settings" on public.mini_lists for all to authenticated
  using (key = 'childSettings' and (public.is_secretary() or public.is_admin())) with check (key = 'childSettings' and (public.is_secretary() or public.is_admin()));

-- ---------- mentoring and volunteering ----------
create table if not exists public.tt_contact (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 80),
  phone      text check (phone is null or length(phone) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tt_event (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('mentor', 'volunteer')),
  child_id    text,                                       -- mentoring: the child
  activity    text check (activity is null or length(activity) <= 60),          -- volunteering: the name of the activity
  contact_id  uuid references public.tt_contact(id) on delete set null,
  person_name text not null check (length(person_name) <= 80),          -- the mentor / the volunteer: follows the contact; stays on past events when the contact goes
  icon        text not null default 'other' check (length(icon) <= 30),
  group_kind  text check (group_kind in ('small', 'big', 'all', 'other')),          -- volunteering: "קבוצה"
  group_text  text check (group_text is null or length(group_text) <= 40),
  day         date not null,                              -- the first day (of a series: its start)
  start_time  time not null,
  end_time    time,
  every_weeks smallint check (every_weeks is null or every_weeks between 1 and 12),          -- every N weeks, on the weekday of "day"
  monthly_nth smallint check (monthly_nth is null or monthly_nth between 1 and 5),           -- the month's Nth weekday of "day", as in the timetable
  until_day   date,                                       -- a series ends ("מהפעם הזאת והלאה": the old one ends the day before)
  series_id   uuid,                                       -- the same series across splits and single changes
  orig_day    date,                                       -- a single changed occurrence: the day it replaced
  created_by  uuid default public.my_staff_id(),
  created_at  timestamptz not null default now(),
  updated_by  uuid default public.my_staff_id(),
  updated_at  timestamptz not null default now(),
  check (not (every_weeks is not null and monthly_nth is not null)),
  check (end_time is null or end_time > start_time),
  check ((kind = 'mentor' and child_id is not null) or (kind = 'volunteer' and activity is not null and group_kind is not null))
);
create index if not exists tt_event_contact on public.tt_event (contact_id);
create table if not exists public.tt_event_skip (          -- "רק הפעם": this occurrence of the series is not shown (a changed copy may stand in its place)
  event_id uuid not null references public.tt_event(id) on delete cascade,
  day      date not null,
  primary key (event_id, day)
);
alter table public.tt_contact    enable row level security;
alter table public.tt_event      enable row level security;
alter table public.tt_event_skip enable row level security;
revoke all on public.tt_event, public.tt_event_skip, public.tt_contact from anon, authenticated;
grant select, insert, update on public.tt_contact to authenticated;          -- (never delete: tt_contact_remove)
drop policy if exists "contacts read"   on public.tt_contact;
drop policy if exists "contacts add"    on public.tt_contact;
drop policy if exists "contacts change" on public.tt_contact;
create policy "contacts read"   on public.tt_contact for select to authenticated using (public.can_edit_timetable());
create policy "contacts add"    on public.tt_contact for insert to authenticated with check (public.can_edit_timetable());
create policy "contacts change" on public.tt_contact for update to authenticated using (public.can_edit_timetable()) with check (public.can_edit_timetable());

-- a contact changed once = changed on everything linked to it
create or replace function public.tt_contact_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.name is distinct from old.name then update public.tt_event set person_name = new.name where contact_id = new.id; end if;
  return new;
end $$;
drop trigger if exists tt_contact_sync on public.tt_contact;
create trigger tt_contact_sync before update on public.tt_contact for each row execute function public.tt_contact_sync();

-- every occurrence between two days. A recurring one does not come on a holiday or its eve (Guy 5 Nov); a one-time one always comes
create or replace function public.tt_occurrences(p_from date, p_to date) returns table (ev_id uuid, occ date) language sql stable security definer set search_path = public as $$
  select e.id, g.d::date
  from public.tt_event e
  cross join lateral generate_series(greatest(p_from, e.day)::timestamp, least(p_to, coalesce(e.until_day, p_to))::timestamp, interval '1 day') g(d)
  where case when e.every_weeks is not null then (g.d::date - e.day) % (7 * e.every_weeks) = 0
             when e.monthly_nth is not null then extract(dow from g.d) = extract(dow from e.day) and ceil(extract(day from g.d) / 7.0) = e.monthly_nth
             else g.d::date = e.day end
    and not exists (select 1 from public.tt_event_skip k where k.event_id = e.id and k.day = g.d::date)
    and (e.kind <> 'mentor' or exists (select 1 from public.roster r where r.id = e.child_id))
    and ((e.every_weeks is null and e.monthly_nth is null)
         or not exists (select 1 from public.special_days s where s.day = g.d::date and s.kind in ('holiday', 'eve')))
$$;
revoke all on function public.tt_occurrences(date, date) from public, anon, authenticated;

-- a child as the TV shows it (first name + first letter of the family name)
create or replace function public.tt_child_label(p_child text) returns text language sql stable security definer set search_path = public as $$
  select case when coalesce(r.last_initial, '') = '' then r.first_name else r.first_name || ' ' || r.last_initial || '''' end from public.roster r where r.id = p_child
$$;
revoke all on function public.tt_child_label(text) from public, anon, authenticated;

-- what the kids' TV reads, not signed in: today's events, in words only
create or replace function public.tv_events_today() returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select (now() at time zone 'Asia/Jerusalem')::date v)
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 't', to_char(e.start_time, 'HH24:MI'), 'end', to_char(e.end_time, 'HH24:MI'), 'i', e.icon, 'person', e.person_name,
                                               'child', public.tt_child_label(e.child_id), 'activity', e.activity, 'group', e.group_kind, 'group_text', e.group_text)
                            order by e.start_time, e.kind, e.person_name), '[]')
  from d, public.tt_occurrences(d.v, d.v) o join public.tt_event e on e.id = o.ev_id
$$;
revoke all on function public.tv_events_today() from public;
grant execute on function public.tv_events_today() to anon, authenticated;

-- what the staff screens read: the occurrences between two days (no phone here either)
create or replace function public.tt_events_between(p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_personal() or public.is_staff()) then raise exception 'not allowed'; end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'range'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'occ', o.occ, 'kind', e.kind, 't', to_char(e.start_time, 'HH24:MI'), 'end', to_char(e.end_time, 'HH24:MI'), 'i', e.icon,
                                                       'person', e.person_name, 'contact_id', e.contact_id, 'child_id', e.child_id, 'child', public.tt_child_label(e.child_id),
                                                       'activity', e.activity, 'group', e.group_kind, 'group_text', e.group_text, 'day', e.day,
                                                       'every_weeks', e.every_weeks, 'monthly_nth', e.monthly_nth, 'until_day', e.until_day)
                                    order by o.occ, e.start_time, e.kind, e.person_name), '[]')
          from public.tt_occurrences(p_from, p_to) o join public.tt_event e on e.id = o.ev_id);
end $$;
revoke all on function public.tt_events_between(date, date) from public, anon;
grant execute on function public.tt_events_between(date, date) to authenticated;

-- add or change. p_id null = a new one. p_scope: 'all' (a one-time event), 'one' ("רק הפעם"), 'on' ("מהפעם הזאת והלאה"); p_day: the occurrence that was pressed.
-- All of it or nothing. What came before p_day is never touched.
create or replace function public.tt_event_save(p_id uuid, p_scope text, p_day date, p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare
  old public.tt_event; r public.tt_event; who text; new_id uuid; series boolean; me uuid := public.my_staff_id();
begin
  if not public.can_edit_timetable() then raise exception 'not allowed'; end if;
  r := jsonb_populate_record(null::public.tt_event, p);
  select c.name into who from public.tt_contact c where c.id = r.contact_id;
  if who is null then raise exception 'contact'; end if;
  r.person_name := who;
  if r.kind = 'volunteer' then r.child_id := null; else r.activity := null; r.group_kind := null; r.group_text := null; end if;
  if r.group_kind is distinct from 'other' then r.group_text := null; end if;
  if p_id is null then
    insert into public.tt_event (kind, child_id, activity, contact_id, person_name, icon, group_kind, group_text, day, start_time, end_time, every_weeks, monthly_nth, series_id, created_by, updated_by)
    values (r.kind, r.child_id, r.activity, r.contact_id, r.person_name, coalesce(r.icon, 'other'), r.group_kind, r.group_text, r.day, r.start_time, r.end_time, r.every_weeks, r.monthly_nth,
            case when r.every_weeks is not null or r.monthly_nth is not null then gen_random_uuid() end, me, me)
    returning id into new_id;
    return new_id;
  end if;
  select * into old from public.tt_event where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  series := old.every_weeks is not null or old.monthly_nth is not null;
  if not series or p_scope = 'all' or (p_scope = 'on' and p_day <= old.day) then
    update public.tt_event set kind = r.kind, child_id = r.child_id, activity = r.activity, contact_id = r.contact_id, person_name = r.person_name, icon = coalesce(r.icon, 'other'),
      group_kind = r.group_kind, group_text = r.group_text, day = r.day, start_time = r.start_time, end_time = r.end_time, every_weeks = r.every_weeks, monthly_nth = r.monthly_nth,
      series_id = case when r.every_weeks is not null or r.monthly_nth is not null then coalesce(old.series_id, gen_random_uuid()) end, updated_by = me, updated_at = now()
    where id = p_id;
    return p_id;
  end if;
  if p_scope = 'one' then
    insert into public.tt_event_skip (event_id, day) values (p_id, p_day) on conflict do nothing;
    insert into public.tt_event (kind, child_id, activity, contact_id, person_name, icon, group_kind, group_text, day, start_time, end_time, series_id, orig_day, created_by, updated_by)
    values (r.kind, r.child_id, r.activity, r.contact_id, r.person_name, coalesce(r.icon, 'other'), r.group_kind, r.group_text, r.day, r.start_time, r.end_time, coalesce(old.series_id, old.id), p_day, me, me)
    returning id into new_id;
    return new_id;
  end if;
  if p_scope <> 'on' then raise exception 'scope'; end if;
  update public.tt_event set until_day = p_day - 1, updated_by = me, updated_at = now() where id = p_id;
  insert into public.tt_event (kind, child_id, activity, contact_id, person_name, icon, group_kind, group_text, day, start_time, end_time, every_weeks, monthly_nth, until_day, series_id, created_by, updated_by)
  values (r.kind, r.child_id, r.activity, r.contact_id, r.person_name, coalesce(r.icon, 'other'), r.group_kind, r.group_text, r.day, r.start_time, r.end_time, r.every_weeks, r.monthly_nth, old.until_day, coalesce(old.series_id, old.id), me, me)
  returning id into new_id;
  insert into public.tt_event_skip (event_id, day) select new_id, k.day from public.tt_event_skip k where k.event_id = p_id and k.day >= p_day;          -- (what was cancelled ahead stays cancelled)
  return new_id;
end $$;
revoke all on function public.tt_event_save(uuid, text, date, jsonb) from public, anon;
grant execute on function public.tt_event_save(uuid, text, date, jsonb) to authenticated;

create or replace function public.tt_event_remove(p_id uuid, p_scope text, p_day date) returns void language plpgsql security definer set search_path = public as $$
declare old public.tt_event;
begin
  if not public.can_edit_timetable() then raise exception 'not allowed'; end if;
  select * into old from public.tt_event where id = p_id for update;
  if not found then return; end if;
  if old.every_weeks is null and old.monthly_nth is null then delete from public.tt_event where id = p_id; return; end if;
  if p_scope = 'one' then insert into public.tt_event_skip (event_id, day) values (p_id, p_day) on conflict do nothing; return; end if;
  if p_scope <> 'on' then raise exception 'scope'; end if;
  delete from public.tt_event c where c.series_id = coalesce(old.series_id, old.id) and c.orig_day >= p_day;          -- (the single changes ahead go with it)
  if p_day <= old.day then delete from public.tt_event where id = p_id;
  else update public.tt_event set until_day = p_day - 1, updated_by = public.my_staff_id(), updated_at = now() where id = p_id; end if;
end $$;
revoke all on function public.tt_event_remove(uuid, text, date) from public, anon;
grant execute on function public.tt_event_remove(uuid, text, date) to authenticated;

-- removing a contact (Guy 5 Nov): not while something is still ahead. Then the answer lists what is ahead, and nothing changes.
-- Past events keep the name, without the contact
create or replace function public.tt_contact_remove(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jerusalem')::date; ahead jsonb;
begin
  if not public.can_edit_timetable() then raise exception 'not allowed'; end if;
  select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'day', e.day, 't', to_char(e.start_time, 'HH24:MI'), 'child', public.tt_child_label(e.child_id), 'activity', e.activity,
                                      'every_weeks', e.every_weeks, 'monthly_nth', e.monthly_nth) order by e.day, e.start_time) into ahead
  from public.tt_event e
  where e.contact_id = p_id and ((e.every_weeks is null and e.monthly_nth is null and e.day >= today)
                                 or ((e.every_weeks is not null or e.monthly_nth is not null) and (e.until_day is null or e.until_day >= today)));
  if ahead is not null then return jsonb_build_object('ok', false, 'ahead', ahead); end if;
  delete from public.tt_contact where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.tt_contact_remove(uuid) from public, anon;
grant execute on function public.tt_contact_remove(uuid) to authenticated;

select 'scheduling_v62' as part, 'ok' as result;
