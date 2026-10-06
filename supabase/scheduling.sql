-- ================================================================
-- Work scheduling for "מרכז חירום": staff, preferences, schedules, swaps, notices.
-- Run ONCE in the Supabase SQL Editor (the TEST project first). Safe to run again.
-- Run AFTER supabase/hardening.sql and supabase/roles.sql (it uses public.is_manager()).
--
-- This file is the STRUCTURE only: no names, no personal conditions, no priorities. Those live in the tables below
-- (filled from a private file) because the code repository is public.
--
-- Who can see what
--   * a PERSONAL account (one per person, signed in with an e-mail code) sees only her own preferences, her own notices,
--     the names/photos of the staff, and the schedule once it is published;
--   * the COORDINATOR (and the manager) also see every preference, the private staff data (who is a leader, priorities,
--     personal conditions) and can edit schedules;
--   * the shared instructors' login (staff@…) and the kids' TV (not signed in) see NONE of this.
--   * the monthly build job and the e-mail sender use the service key, which bypasses these rules.
-- ================================================================

-- ---------- people ----------
create table if not exists public.staff (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  kind          text not null check (kind in ('instructor', 'service', 'teacher', 'coordinator')),
  active        boolean not null default true,
  photo_url     text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- the sensitive part (never sent to instructors' devices)
create table if not exists public.staff_private (
  staff_id          uuid primary key references public.staff(id) on delete cascade,
  email             text unique,
  auth_user_id      uuid unique,                         -- filled when the person has a login
  female            boolean,
  is_leader         boolean not null default false,
  ahmash_rank       int not null default 0 check (ahmash_rank between 0 and 2),   -- 1 = ahmash, 2 = only when no ahmash can
  leader_priority   int,                                  -- order in the leaders' list (the coordinator edits it)
  no_nights         boolean not null default false,
  manual_only       boolean not null default false,       -- not scheduled automatically
  only_long_weekend boolean not null default false,
  latest_end_hour   int,                                  -- e.g. works until 21:00 at the latest
  notes             text
);

-- any other personal condition, as data (hard / strong / soft)
create table if not exists public.staff_constraints (
  id        uuid primary key default gen_random_uuid(),
  staff_id  uuid not null references public.staff(id) on delete cascade,
  kind      text not null,
  strength  text not null check (strength in ('hard', 'strong', 'soft')),
  params    jsonb not null default '{}'::jsonb
);

-- numbers the build uses (shift hours, staffing, rest rules, ...) — not personal
create table if not exists public.sched_settings (
  key    text primary key,
  value  jsonb not null
);

-- standing agreements, kept from month to month until the person changes them
create table if not exists public.staff_standing (
  staff_id          uuid primary key references public.staff(id) on delete cascade,
  extend_morning    boolean not null default false,       -- willing to stay until 16:00 when needed
  pull_to_sunday    boolean not null default false,       -- willing to pull from Saturday night to Sunday 11:00
  updated_at        timestamptz not null default now()
);

-- ---------- preferences (only what differs from the default "yes" is stored) ----------
create table if not exists public.prefs_slot (
  staff_id  uuid not null references public.staff(id) on delete cascade,
  day       date not null,
  shift     text not null check (shift in ('M', 'A', 'N', 'L')),     -- morning, afternoon, night, long weekend
  level     text not null check (level in ('yes', 'can', 'no')),     -- כן / יכול / לא
  primary key (staff_id, day, shift)
);
create table if not exists public.prefs_absence (
  staff_id  uuid not null references public.staff(id) on delete cascade,
  day       date not null,
  primary key (staff_id, day)
);
create table if not exists public.prefs_hours (            -- available only for part of the shift (custom hours)
  staff_id  uuid not null references public.staff(id) on delete cascade,
  day       date not null,
  from_time time not null,
  to_time   time not null,
  primary key (staff_id, day, from_time)
);
create table if not exists public.prefs_submission (
  staff_id      uuid not null references public.staff(id) on delete cascade,
  month         date not null,                              -- the first day of the month the preferences are for
  submitted_at  timestamptz not null default now(),
  primary key (staff_id, month)
);

-- ---------- schedules ----------
create table if not exists public.schedule (
  month               date primary key,                      -- first day of the month
  status              text not null default 'collecting' check (status in ('collecting', 'draft', 'sent', 'published')),
  draft_at            timestamptz,
  built_at            timestamptz,
  sent_to_coordinator timestamptz,
  published_at        timestamptz,
  log                 text
);
create table if not exists public.assignment (
  id          uuid primary key default gen_random_uuid(),
  month       date not null references public.schedule(month) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  day         date not null,
  shift       text not null check (shift in ('M', 'S', 'A', 'N', 'L')),
  from_time   time,
  to_time     time,
  flags       text[] not null default '{}',                  -- extension, double, pull, from16, manual
  created_at  timestamptz not null default now()
);
create index if not exists assignment_month_idx on public.assignment (month, day);
create table if not exists public.coordinator_flags (       -- what the coordinator must look at
  id        uuid primary key default gen_random_uuid(),
  month     date not null,
  day       date,
  kind      text not null,
  text      text not null,
  staff_id  uuid references public.staff(id) on delete set null,
  resolved  boolean not null default false
);

-- ---------- swaps, notices, e-mail queue ----------
create table if not exists public.swap_requests (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignment(id) on delete cascade,
  from_staff    uuid not null references public.staff(id) on delete cascade,
  to_staff      uuid references public.staff(id) on delete cascade,
  status        text not null default 'open' check (status in ('open', 'offered', 'approved', 'rejected', 'cancelled')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  to_staff    uuid not null references public.staff(id) on delete cascade,
  text        text not null,
  kind        text not null default 'info',
  seen        boolean not null default false,
  created_at  timestamptz not null default now()
);
create table if not exists public.email_outbox (            -- only the sender job (service key) touches it
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  subject     text not null,
  body        text not null,
  kind        text not null default 'info',
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  error       text
);

-- ---------- who is asking ----------
create or replace function public.my_staff_id() returns uuid language sql stable security definer set search_path = public as $$
  select staff_id from public.staff_private where auth_user_id = auth.uid() limit 1
$$;
create or replace function public.is_personal() returns boolean language sql stable security definer set search_path = public as $$
  select public.my_staff_id() is not null
$$;
create or replace function public.is_coordinator() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_manager(), false) or exists (
    select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
    where p.auth_user_id = auth.uid() and s.kind = 'coordinator' and s.active)
$$;
create or replace function public.my_kind() returns text language sql stable security definer set search_path = public as $$
  select s.kind from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() limit 1
$$;
-- preferences for a month can be changed from the 1st of the previous month until the 24th of the previous month at 22:30 (Israel time)
create or replace function public.prefs_open(m date) returns boolean language sql stable as $$
  select (now() at time zone 'Asia/Jerusalem') >= (date_trunc('month', m::timestamp) - interval '1 month')
     and (now() at time zone 'Asia/Jerusalem') <  (date_trunc('month', m::timestamp) - interval '1 month' + interval '23 days 22 hours 30 minutes')
$$;

-- ---------- rules ----------
alter table public.staff             enable row level security;
alter table public.staff_private     enable row level security;
alter table public.staff_constraints enable row level security;
alter table public.sched_settings    enable row level security;
alter table public.staff_standing    enable row level security;
alter table public.prefs_slot        enable row level security;
alter table public.prefs_absence     enable row level security;
alter table public.prefs_hours       enable row level security;
alter table public.prefs_submission  enable row level security;
alter table public.schedule          enable row level security;
alter table public.assignment        enable row level security;
alter table public.coordinator_flags enable row level security;
alter table public.swap_requests     enable row level security;
alter table public.notices           enable row level security;
alter table public.email_outbox      enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in
    ('staff','staff_private','staff_constraints','sched_settings','staff_standing','prefs_slot','prefs_absence','prefs_hours',
     'prefs_submission','schedule','assignment','coordinator_flags','swap_requests','notices','email_outbox')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- names and photos: every personal account; the coordinator edits
create policy "see staff"    on public.staff for select to authenticated using (public.is_personal() or public.is_coordinator());
create policy "edit staff"   on public.staff for all    to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
-- the sensitive part: coordinator and manager only
create policy "private staff"        on public.staff_private     for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
create policy "staff constraints"    on public.staff_constraints for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
create policy "see settings"  on public.sched_settings for select to authenticated using (public.is_personal() or public.is_coordinator());
create policy "edit settings" on public.sched_settings for all    to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
-- standing agreements: own row (the coordinator reads all)
create policy "own standing"  on public.staff_standing for all    to authenticated using (staff_id = public.my_staff_id()) with check (staff_id = public.my_staff_id());
create policy "see standing"  on public.staff_standing for select to authenticated using (public.is_coordinator());
-- preferences: own rows, and only while the month is open; the coordinator reads all
create policy "own slots read"     on public.prefs_slot       for select to authenticated using (staff_id = public.my_staff_id());
create policy "own slots add"      on public.prefs_slot       for insert to authenticated with check (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own slots change"   on public.prefs_slot       for update to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date)) with check (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own slots delete"   on public.prefs_slot       for delete to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own absences read"   on public.prefs_absence    for select to authenticated using (staff_id = public.my_staff_id());
create policy "own absences add"    on public.prefs_absence    for insert to authenticated with check (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own absences delete" on public.prefs_absence    for delete to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own hours read"      on public.prefs_hours      for select to authenticated using (staff_id = public.my_staff_id());
create policy "own hours add"       on public.prefs_hours      for insert to authenticated with check (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own hours change"    on public.prefs_hours      for update to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date)) with check (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own hours delete"    on public.prefs_hours      for delete to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', day::timestamp)::date));
create policy "own submission read"   on public.prefs_submission for select to authenticated using (staff_id = public.my_staff_id());
create policy "own submission add"    on public.prefs_submission for insert to authenticated with check (staff_id = public.my_staff_id() and public.prefs_open(month));
create policy "own submission change" on public.prefs_submission for update to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(month)) with check (staff_id = public.my_staff_id() and public.prefs_open(month));create policy "see slots"       on public.prefs_slot       for select to authenticated using (public.is_coordinator());
create policy "see absences"    on public.prefs_absence    for select to authenticated using (public.is_coordinator());
create policy "see hours"       on public.prefs_hours      for select to authenticated using (public.is_coordinator());
create policy "see submissions" on public.prefs_submission for select to authenticated using (public.is_coordinator());
-- schedules: everybody sees a PUBLISHED schedule; the coordinator sees (and edits) all
create policy "see published schedule" on public.schedule   for select to authenticated using (status = 'published' and public.is_personal());
create policy "coordinator schedule"   on public.schedule   for all    to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
create policy "see published assignments" on public.assignment for select to authenticated
  using (public.is_personal() and exists (select 1 from public.schedule s where s.month = assignment.month and s.status = 'published'));
create policy "coordinator assignments"   on public.assignment for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
create policy "coordinator flags"         on public.coordinator_flags for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
-- swaps: instructors see the open board; changes only through the functions below
create policy "see swaps" on public.swap_requests for select to authenticated using (public.is_coordinator() or (public.my_kind() = 'instructor' and public.is_personal()));
-- notices: own
create policy "own notices"        on public.notices for select to authenticated using (to_staff = public.my_staff_id());
create policy "mark my notice"     on public.notices for update to authenticated using (to_staff = public.my_staff_id()) with check (to_staff = public.my_staff_id());
create policy "coordinator notices" on public.notices for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
-- the e-mail queue: no policy at all = only the service key

-- ---------- swap steps (the only way to change a swap) ----------
create or replace function public.request_swap(p_assignment uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sid uuid;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.assignment a where a.id = p_assignment and a.staff_id = me and a.day >= current_date) then raise exception 'not your upcoming shift'; end if;
  insert into public.swap_requests (assignment_id, from_staff) values (p_assignment, me) returning id into sid;
  return sid;
end $$;
create or replace function public.offer_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); sw public.swap_requests; a public.assignment;
begin
  if me is null or public.my_kind() <> 'instructor' then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'open'; if not found then raise exception 'request is not open'; end if;
  if sw.from_staff = me then raise exception 'own request'; end if;
  select * into a from public.assignment where id = sw.assignment_id;
  if exists (select 1 from public.assignment x where x.staff_id = me and x.day = a.day) then raise exception 'already working that day'; end if;
  update public.swap_requests set to_staff = me, status = 'offered' where id = p_swap;
  insert into public.notices (to_staff, text) values (sw.from_staff, 'עמית הציע/ה להחליף אותך. הבקשה הועברה לרכזת.'), (me, 'הבקשה להחלפה הועברה לרכזת.');
end $$;
create or replace function public.cancel_swap(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.swap_requests set status = 'cancelled' where id = p_swap and from_staff = public.my_staff_id() and status in ('open', 'offered');
end $$;
create or replace function public.decide_swap(p_swap uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare sw public.swap_requests;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  select * into sw from public.swap_requests where id = p_swap and status = 'offered'; if not found then raise exception 'nothing to decide'; end if;
  if p_approve then
    update public.assignment set staff_id = sw.to_staff where id = sw.assignment_id;
    update public.swap_requests set status = 'approved', decided_at = now() where id = p_swap;
    insert into public.notices (to_staff, text, kind) values (sw.from_staff, 'שינוי במשמרות: ההחלפה אושרה.', 'ok'), (sw.to_staff, 'שינוי במשמרות: ההחלפה אושרה.', 'ok');
  else
    update public.swap_requests set status = 'rejected', decided_at = now() where id = p_swap;
    insert into public.notices (to_staff, text, kind) values (sw.from_staff, 'בקשת ההחלפה לא אושרה. המשמרת נשארת אצלך.', 'warn'), (sw.to_staff, 'ההחלפה לא אושרה.', 'warn');
  end if;
end $$;
revoke all on function public.request_swap(uuid), public.offer_swap(uuid), public.cancel_swap(uuid), public.decide_swap(uuid, boolean) from public, anon;
grant execute on function public.request_swap(uuid), public.offer_swap(uuid), public.cancel_swap(uuid), public.decide_swap(uuid, boolean) to authenticated;

-- ---------- grants (the rules above decide who may do what) ----------
grant select, insert, update, delete on public.staff, public.staff_private, public.staff_constraints, public.sched_settings, public.staff_standing,
  public.prefs_slot, public.prefs_absence, public.prefs_hours, public.prefs_submission, public.schedule, public.assignment,
  public.coordinator_flags to authenticated;
grant select on public.swap_requests to authenticated;
grant select, update on public.notices to authenticated;
revoke all on public.staff, public.staff_private, public.staff_constraints, public.sched_settings, public.staff_standing, public.prefs_slot,
  public.prefs_absence, public.prefs_hours, public.prefs_submission, public.schedule, public.assignment, public.coordinator_flags,
  public.swap_requests, public.notices, public.email_outbox from anon;
revoke all on public.email_outbox from authenticated;

-- default shift hours (not personal)
insert into public.sched_settings (key, value) values
  ('shifts', '{"M":{"label":"בוקר","from":"07:00","to":"15:00"},"A":{"label":"צהריים","from":"14:00","to":"22:00"},"N":{"label":"לילה","from":"22:00","to":"08:00"},"L":{"label":"סופ\"ש ארוך","from":"17:00","to":"20:00"}}')
on conflict (key) do nothing;
