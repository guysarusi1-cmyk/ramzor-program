-- ================================================================
-- THE TEST PROJECT of the scheduling product (mercury-shibutzim-Test), set up in one go. Generated from the numbered files, in order:
-- core/core-v1.sql, scheduling-v75.sql, scheduling-v76.sql, core/demo-people-2w.sql, core/core-first-admin.sql, scheduling-v77.sql, scheduling-v78.sql, scheduling-v79.sql, core/core-v2.sql, scheduling-v80.sql, core/mail-v1.sql, scheduling-v81.sql, scheduling-v82.sql, scheduling-v83.sql
-- (core/mail-v1.sql without its hourly mail job: the test project sends no mail). Invented people only. Run ONCE in the SQL Editor of the TEST project.
-- Before: Authentication > Users > Add user (your e-mail + a password, Auto Confirm) — the first user becomes the admin.
-- ================================================================

-- ======== core/core-v1.sql ========
-- ================================================================
-- CORE, part 1 — the first file of a NEW database of an organisation. Safe to run again. (Guy 2026-11-13: the second pilot)
-- The vision: several products (the two-week schedule is the first here) that an organisation takes alone or together, each
-- organisation in a database of its own, seeing only its own data. So a new database gets:
--   1. this CORE: the organisation's profile (its name, which products it has, its own words), the people, their sign-in, the roles;
--   2. on top of it, one file per product (the two-week schedule: scheduling-v75.sql and scheduling-v76.sql, as they are).
-- A product never reaches into another product's tables; it leans only on the core (the people, who is calling, the roles).
-- Nothing here is open to a visitor who is not signed in.
-- ================================================================

create table if not exists public.org_profile (
  id boolean primary key default true check (id),                  -- one row: this database is one organisation
  name text not null default 'ארגון חדש',
  products text[] not null default '{}',                            -- which products are on here, for example {schedule2w}
  words jsonb not null default '{}'::jsonb,                         -- the organisation's own words, for example {"person":"מלווה"}
  updated_at timestamptz not null default now()
);
insert into public.org_profile (id) values (true) on conflict (id) do nothing;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  first_name text,
  kind text not null default 'staff' check (kind in ('admin', 'coordinator', 'staff')),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create table if not exists public.staff_private (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  email text,
  auth_user_id uuid unique,                                         -- the sign-in of this person (auth.users.id)
  is_admin boolean not null default false,
  phone text
);

-- who is calling (only an active person counts)
create or replace function public.my_staff_id() returns uuid language sql stable security definer set search_path = public as $$
  select p.staff_id from public.staff_private p join public.staff s on s.id = p.staff_id where p.auth_user_id = auth.uid() and s.active limit 1
$$;
create or replace function public.my_kind() returns text language sql stable security definer set search_path = public as $$
  select s.kind from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() and s.active limit 1
$$;
create or replace function public.is_active_staff() returns boolean language sql stable security definer set search_path = public as $$
  select public.my_staff_id() is not null
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and s.active and (s.kind = 'admin' or p.is_admin))
$$;
create or replace function public.is_coordinator() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                                      where p.auth_user_id = auth.uid() and s.active and s.kind = 'coordinator')
$$;
-- what the site asks right after the sign-in
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('staff_id', s.id, 'name', s.display_name, 'kind', s.kind, 'admin', public.is_admin(), 'coordinator', public.is_coordinator(),
                            'org', (select jsonb_build_object('name', o.name, 'products', o.products, 'words', o.words) from public.org_profile o))
  from public.staff s where s.id = public.my_staff_id()
$$;
revoke all on function public.my_staff_id(), public.my_kind(), public.is_active_staff(), public.is_admin(), public.is_coordinator(), public.my_profile() from public, anon;
grant execute on function public.my_staff_id(), public.my_kind(), public.is_active_staff(), public.is_admin(), public.is_coordinator(), public.my_profile() to authenticated;

alter table public.org_profile enable row level security;
alter table public.staff enable row level security;
alter table public.staff_private enable row level security;
revoke all on public.org_profile, public.staff, public.staff_private from anon, public;
grant select, update on public.org_profile to authenticated;
grant select, insert, update, delete on public.staff, public.staff_private to authenticated;

drop policy if exists "org read" on public.org_profile;
drop policy if exists "org admin" on public.org_profile;
create policy "org read" on public.org_profile for select to authenticated using ((select public.is_active_staff()));
create policy "org admin" on public.org_profile for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "see staff" on public.staff;
drop policy if exists "edit staff" on public.staff;
create policy "see staff" on public.staff for select to authenticated using ((select public.is_active_staff()));
create policy "edit staff" on public.staff for all to authenticated using ((select public.is_coordinator())) with check ((select public.is_coordinator()));

drop policy if exists "private staff" on public.staff_private;
create policy "private staff" on public.staff_private for all to authenticated using ((select public.is_coordinator())) with check ((select public.is_coordinator()));

-- only the admin gives or takes admin rights (the same guard as scheduling-v70.sql, with this core's roles)
create or replace function public.guard_admin_rights() returns trigger language plpgsql security definer set search_path = public as $$
declare high boolean; msg text := 'רק מנהל מערכת יכול לשנות הרשאות או כניסה של מנהל מערכת';
begin
  if auth.uid() is null or public.is_admin() then return coalesce(new, old); end if;          -- the SQL Editor, or the admin
  if tg_table_name = 'staff' then
    if tg_op = 'INSERT' then
      if new.kind = 'admin' then raise exception '%', msg using errcode = '42501'; end if;
    else
      high := old.kind = 'admin' or exists (select 1 from public.staff_private p where p.staff_id = old.id and p.is_admin);
      if tg_op = 'DELETE' then
        if high then raise exception '%', msg using errcode = '42501'; end if;
      elsif (new.kind is distinct from old.kind and (high or new.kind = 'admin'))
         or (high and (new.active is distinct from old.active or new.id is distinct from old.id)) then
        raise exception '%', msg using errcode = '42501';
      end if;
    end if;
  else
    if tg_op = 'INSERT' then
      if coalesce(new.is_admin, false) or exists (select 1 from public.staff s where s.id = new.staff_id and s.kind = 'admin') then raise exception '%', msg using errcode = '42501'; end if;
    else
      high := coalesce(old.is_admin, false) or exists (select 1 from public.staff s where s.id = old.staff_id and s.kind = 'admin');
      if tg_op = 'DELETE' then
        if high then raise exception '%', msg using errcode = '42501'; end if;
      elsif new.is_admin is distinct from old.is_admin or new.staff_id is distinct from old.staff_id
         or (high and (new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email)) then
        raise exception '%', msg using errcode = '42501';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.guard_admin_rights() from public, anon, authenticated;
drop trigger if exists guard_admin_rights on public.staff;
create trigger guard_admin_rights before insert or update or delete on public.staff for each row execute function public.guard_admin_rights();
drop trigger if exists guard_admin_rights on public.staff_private;
create trigger guard_admin_rights before insert or update or delete on public.staff_private for each row execute function public.guard_admin_rights();

select 'core_v1' as part, 'ok' as result, (select count(*) from public.staff) as people, (select name from public.org_profile) as organisation;


-- ======== scheduling-v75.sql ========
-- ================================================================
-- Scheduling, part 75 — run in the SQL Editor after scheduling-v71.sql. Safe to run again. (Guy 2026-11-13: the second pilot)
-- A TWO-WEEK schedule, as a module of its own next to the monthly one (nothing of the monthly schedule is touched):
--   every two weeks each person hands in OPTIONS (twice as many as the shifts she works), one of the staff builds the schedule
--   (a different one each time), fixes it by hand and publishes it.
-- Tables (all start with tw_): people, periods (two weeks, starting on a Sunday), options, hand-ins, the schedule, fixed shifts, settings.
-- Who may what:
--   * the admin and the coordinator ("the boss"): everything — the list of people, opening a period, choosing who builds;
--   * the builder of a period: sees everybody's options of that period, writes the schedule and publishes it, may hand in for somebody;
--   * a person on the list: her own options while the period is open; the schedule once it is published; the list of names;
--   * anybody else (also a visitor who is not signed in): nothing.
-- ================================================================

do $$ begin
  if to_regprocedure('public.is_active_staff()') is null then raise exception 'scheduling-v70.sql first'; end if;
end $$;

create table if not exists public.tw_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  per_week int not null default 3 check (per_week between 0 and 7),          -- shifts a week
  staff_id uuid unique references public.staff(id) on delete set null,      -- her sign-in (null: somebody else hands in for her)
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.tw_period (
  start date primary key check (extract(dow from start) = 0),               -- the Sunday the two weeks begin on
  status text not null default 'open' check (status in ('open', 'built', 'published')),
  builder uuid references public.tw_people(id) on delete set null,           -- who builds the schedule this time
  deadline timestamptz,                                                      -- options are handed in until then (null: until it is built)
  built_at timestamptz, published_at timestamptz,
  report jsonb,                                                              -- what the builder's run said (missing people and so on)
  created_at timestamptz not null default now()
);
create table if not exists public.tw_option (
  period date not null references public.tw_period(start) on delete cascade,
  person uuid not null references public.tw_people(id) on delete cascade,
  day date not null, shift text not null check (shift in ('M', 'A', 'N', 'W')),   -- morning, afternoon, night, the long weekend shift
  primary key (period, person, day, shift)
);
create table if not exists public.tw_submission (
  period date not null references public.tw_period(start) on delete cascade,
  person uuid not null references public.tw_people(id) on delete cascade,
  submitted_at timestamptz not null default now(), by_staff uuid, note text,
  primary key (period, person)
);
create table if not exists public.tw_assignment (
  id uuid primary key default gen_random_uuid(),
  period date not null references public.tw_period(start) on delete cascade,
  day date not null, shift text not null check (shift in ('M', 'A', 'N', 'W')),
  person uuid not null references public.tw_people(id) on delete cascade,
  third boolean not null default false,      -- the extra (third) person of a shift
  fixed boolean not null default false,      -- her fixed shift
  by_hand boolean not null default false,    -- put by the builder, not by the automatic build
  from_time time, to_time time, note text,
  unique (period, day, shift, person)
);
create table if not exists public.tw_fixed (
  dow int not null check (dow between 0 and 6), shift text not null check (shift in ('M', 'A', 'N', 'W')),
  person uuid not null references public.tw_people(id) on delete cascade,
  primary key (dow, shift)
);
create table if not exists public.tw_settings (key text primary key, value jsonb not null);

-- who is calling
create or replace function public.tw_me() returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.tw_people p where p.active and p.staff_id = public.my_staff_id() limit 1
$$;
create or replace function public.tw_boss() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_coordinator()
$$;
create or replace function public.tw_builder(p_period date) returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.start = p_period and t.builder is not null and t.builder = public.tw_me())
$$;
create or replace function public.tw_open(p_period date) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tw_period t where t.start = p_period and t.status = 'open' and (t.deadline is null or t.deadline > now()))
$$;
create or replace function public.tw_member() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or public.tw_me() is not null
$$;
revoke all on function public.tw_me(), public.tw_boss(), public.tw_builder(date), public.tw_open(date), public.tw_member() from public, anon;
grant execute on function public.tw_me(), public.tw_boss(), public.tw_builder(date), public.tw_open(date), public.tw_member() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['tw_people', 'tw_period', 'tw_option', 'tw_submission', 'tw_assignment', 'tw_fixed', 'tw_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists "tw people read" on public.tw_people;
drop policy if exists "tw people boss" on public.tw_people;
create policy "tw people read" on public.tw_people for select to authenticated using ((select public.tw_member()));
create policy "tw people boss" on public.tw_people for all to authenticated using ((select public.tw_boss())) with check ((select public.tw_boss()));

drop policy if exists "tw period read" on public.tw_period;
drop policy if exists "tw period boss" on public.tw_period;
drop policy if exists "tw period builder" on public.tw_period;
create policy "tw period read" on public.tw_period for select to authenticated using ((select public.tw_member()));
create policy "tw period boss" on public.tw_period for all to authenticated using ((select public.tw_boss())) with check ((select public.tw_boss()));
create policy "tw period builder" on public.tw_period for update to authenticated using (public.tw_builder(start)) with check (public.tw_builder(start));

drop policy if exists "tw option read" on public.tw_option;
drop policy if exists "tw option own add" on public.tw_option;
drop policy if exists "tw option own remove" on public.tw_option;
drop policy if exists "tw option builder" on public.tw_option;
create policy "tw option read" on public.tw_option for select to authenticated using (person = (select public.tw_me()) or public.tw_builder(period));
create policy "tw option own add" on public.tw_option for insert to authenticated with check (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw option own remove" on public.tw_option for delete to authenticated using (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw option builder" on public.tw_option for all to authenticated using (public.tw_builder(period)) with check (public.tw_builder(period));

drop policy if exists "tw submission read" on public.tw_submission;
drop policy if exists "tw submission own" on public.tw_submission;
drop policy if exists "tw submission own change" on public.tw_submission;
drop policy if exists "tw submission builder" on public.tw_submission;
create policy "tw submission read" on public.tw_submission for select to authenticated using (person = (select public.tw_me()) or public.tw_builder(period));
create policy "tw submission own" on public.tw_submission for insert to authenticated with check (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw submission own change" on public.tw_submission for update to authenticated using (person = (select public.tw_me()) and public.tw_open(period)) with check (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw submission builder" on public.tw_submission for all to authenticated using (public.tw_builder(period)) with check (public.tw_builder(period));

drop policy if exists "tw schedule read" on public.tw_assignment;
drop policy if exists "tw schedule builder" on public.tw_assignment;
create policy "tw schedule read" on public.tw_assignment for select to authenticated
  using (public.tw_builder(period) or ((select public.tw_me()) is not null and exists (select 1 from public.tw_period t where t.start = tw_assignment.period and t.status = 'published')));
create policy "tw schedule builder" on public.tw_assignment for all to authenticated using (public.tw_builder(period)) with check (public.tw_builder(period));

drop policy if exists "tw fixed read" on public.tw_fixed;
drop policy if exists "tw fixed boss" on public.tw_fixed;
create policy "tw fixed read" on public.tw_fixed for select to authenticated using ((select public.tw_member()));
create policy "tw fixed boss" on public.tw_fixed for all to authenticated using ((select public.tw_boss())) with check ((select public.tw_boss()));

drop policy if exists "tw settings read" on public.tw_settings;
drop policy if exists "tw settings boss" on public.tw_settings;
create policy "tw settings read" on public.tw_settings for select to authenticated using ((select public.tw_member()));
create policy "tw settings boss" on public.tw_settings for all to authenticated using ((select public.tw_boss())) with check ((select public.tw_boss()));

select 'scheduling_v75' as part, 'ok' as result,
       (select count(*) from pg_tables where schemaname = 'public' and tablename like 'tw\_%') as tables,
       (select count(*) from pg_policies where schemaname = 'public' and tablename like 'tw\_%') as rules;


-- ======== scheduling-v76.sql ========
-- ================================================================
-- Scheduling, part 76 — run in the SQL Editor after scheduling-v75.sql. Safe to run again. (Guy 2026-11-13: the second pilot)
-- The two-week schedule: the fixed shifts (who is the fixed person of which shift of the week) may be set also by whoever builds
-- a schedule that is not published yet. Until now only the admin and the coordinator could. (Guy: "גם מי שבונה את הסידור")
-- ================================================================

do $$ begin
  if to_regclass('public.tw_fixed') is null then raise exception 'scheduling-v75.sql first'; end if;
end $$;

-- is the caller building some two weeks right now (chosen as the builder of a period that is not published yet)?
create or replace function public.tw_building() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.builder is not null and t.builder = public.tw_me() and t.status <> 'published')
$$;
revoke all on function public.tw_building() from public, anon;
grant execute on function public.tw_building() to authenticated;

drop policy if exists "tw fixed boss" on public.tw_fixed;
drop policy if exists "tw fixed builder" on public.tw_fixed;
create policy "tw fixed builder" on public.tw_fixed for all to authenticated using ((select public.tw_building())) with check ((select public.tw_building()));

select 'scheduling_v76' as part, 'ok' as result, (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tw_fixed') as fixed_rules;


-- ======== core/demo-people-2w.sql ========
-- The two-week schedule: sample people for a DEMO database. Run after scheduling-v75.sql. Safe to run again. (Guy 2026-11-13)
-- Eleven invented names (not the staff of any real institution), nine with 3 shifts a week and two with 4. They have no sign-in:
-- whoever builds the schedule hands in for them. It adds people only when the list is still empty, so it never mixes with real staff.
insert into public.tw_people (name, per_week, sort)
select v.name, v.per_week, v.sort
from (values ('נועם', 3, 1), ('שחר', 4, 2), ('עדי', 3, 3), ('יובל', 3, 4), ('רוני', 3, 5), ('אור', 4, 6), ('שקד', 3, 7), ('גל', 3, 8), ('עומר', 3, 9), ('דניאל', 3, 10), ('אריאל', 3, 11)) v(name, per_week, sort)
where not exists (select 1 from public.tw_people);

select 'demo_people_2w' as part, (select count(*) from public.tw_people) as people;


-- ======== core/core-first-admin.sql ========
-- CORE: the first admin of a new database, and the organisation's profile for the two-week schedule. Run after core-v1.sql and the
-- product files. Safe to run again. (Guy 2026-11-13)
-- Before running: create ONE user in the dashboard (Authentication > Users > Add user, with a password). This file links the oldest
-- user of the project to a new admin row. It does nothing when an admin already exists.
do $$
declare u record; sid uuid;
begin
  if exists (select 1 from public.staff s left join public.staff_private p on p.staff_id = s.id where s.kind = 'admin' or p.is_admin) then
    raise notice 'an admin already exists: nothing to do'; return;
  end if;
  select id, email into u from auth.users order by created_at limit 1;
  if u.id is null then raise exception 'אין עדיין משתמש בפרויקט. יוצרים קודם משתמש אחד בלוח הבקרה: Authentication > Users > Add user'; end if;
  insert into public.staff (display_name, first_name, kind) values ('מנהל המערכת', 'מנהל', 'admin') returning id into sid;
  insert into public.staff_private (staff_id, email, auth_user_id, is_admin) values (sid, u.email, u.id, true);
end $$;

update public.org_profile set name = 'מרקורי שיבוצים', products = array['schedule2w'], words = '{"person":"איש צוות","people":"הצוות"}'::jsonb, updated_at = now()
 where name = 'ארגון חדש';

select 'core_first_admin' as part, (select count(*) from public.staff where kind = 'admin') as admins, (select name from public.org_profile) as organisation, (select products from public.org_profile) as products;


-- ======== scheduling-v77.sql ========
-- ================================================================
-- Scheduling, part 77 — run in the SQL Editor after scheduling-v76.sql. Safe to run again. (Guy 2026-11-14: the product's preferences screen)
-- The two-week schedule: preferences instead of plain options.
--   * every marked shift has a level: 'yes' (wants it) or 'can' (only if needed); a shift that is not marked is "no";
--   * "other hours": on a day a person may offer hours of her own (from – to) instead of a whole shift;
--   * a person changes her own marks one by one while the period is open (every tap is saved at once), so she also needs the right to UPDATE her row.
-- Nothing else changes: the same tables, the same people may read and write.
-- ================================================================

do $$ begin
  if to_regprocedure('public.tw_building()') is null then raise exception 'scheduling-v76.sql first'; end if;
end $$;

alter table public.tw_option add column if not exists level text not null default 'yes';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tw_option_level_check') then
    alter table public.tw_option add constraint tw_option_level_check check (level in ('yes', 'can'));
  end if;
end $$;

drop policy if exists "tw option own change" on public.tw_option;
create policy "tw option own change" on public.tw_option for update to authenticated
  using (person = (select public.tw_me()) and public.tw_open(period)) with check (person = (select public.tw_me()) and public.tw_open(period));

create table if not exists public.tw_other (
  period date not null references public.tw_period(start) on delete cascade,
  person uuid not null references public.tw_people(id) on delete cascade,
  day date not null,
  from_time time not null, to_time time not null,          -- (to_time before from_time: until the next morning)
  primary key (period, person, day)
);
alter table public.tw_other enable row level security;
revoke all on public.tw_other from anon, public;
grant select, insert, update, delete on public.tw_other to authenticated;

drop policy if exists "tw other read" on public.tw_other;
drop policy if exists "tw other own add" on public.tw_other;
drop policy if exists "tw other own change" on public.tw_other;
drop policy if exists "tw other own remove" on public.tw_other;
drop policy if exists "tw other builder" on public.tw_other;
create policy "tw other read" on public.tw_other for select to authenticated using (person = (select public.tw_me()) or public.tw_builder(period));
create policy "tw other own add" on public.tw_other for insert to authenticated with check (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw other own change" on public.tw_other for update to authenticated
  using (person = (select public.tw_me()) and public.tw_open(period)) with check (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw other own remove" on public.tw_other for delete to authenticated using (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw other builder" on public.tw_other for all to authenticated using (public.tw_builder(period)) with check (public.tw_builder(period));

select 'scheduling_v77' as part, 'ok' as result,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tw_option' and column_name = 'level') as level_column,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tw_other') as other_rules;


-- ======== scheduling-v78.sql ========
-- ================================================================
-- Scheduling, part 78 — run in the SQL Editor after scheduling-v77.sql. Safe to run again. (Guy 2026-11-14: the product's instructor portal)
-- The two-week schedule: swap requests and messages.
--   SWAPS  a person asks to give away one of her shifts of a PUBLISHED schedule; another person on the list says she takes it;
--          the builder of those two weeks (or the admin) approves, and only then the schedule changes.
--          All the steps go through functions, so nobody writes the table directly.
--   MESSAGES  about the schedule, to everybody on the list: written by whoever builds now (until the last day of her schedule has passed)
--          and by the admin; read by everybody on the list.
-- ================================================================

do $$ begin
  if to_regclass('public.tw_other') is null then raise exception 'scheduling-v77.sql first'; end if;
end $$;

-- who builds now: the builder of two weeks that have not ended yet (she is in charge of changes until their last day)
create or replace function public.tw_builder_now() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.builder is not null and t.builder = public.tw_me() and t.start + 13 >= current_date)
$$;
revoke all on function public.tw_builder_now() from public, anon;
grant execute on function public.tw_builder_now() to authenticated;

create table if not exists public.tw_swap (
  id uuid primary key default gen_random_uuid(),
  period date not null references public.tw_period(start) on delete cascade,
  assignment uuid references public.tw_assignment(id) on delete set null,
  day date not null, shift text not null check (shift in ('M', 'A', 'N', 'W')),
  from_person uuid not null references public.tw_people(id) on delete cascade,
  taker uuid references public.tw_people(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'taken', 'approved', 'declined', 'cancelled')),
  note text,
  created_at timestamptz not null default now(), taken_at timestamptz, decided_at timestamptz, decided_by uuid
);
create index if not exists tw_swap_period_idx on public.tw_swap (period, status);
create table if not exists public.tw_message (
  id uuid primary key default gen_random_uuid(),
  body text not null check (length(btrim(body)) between 1 and 1000),
  from_staff uuid not null default public.my_staff_id(),
  created_at timestamptz not null default now()
);

alter table public.tw_swap enable row level security;
alter table public.tw_message enable row level security;
revoke all on public.tw_swap, public.tw_message from anon, public;
grant select on public.tw_swap to authenticated;
grant select, insert, delete on public.tw_message to authenticated;

drop policy if exists "tw swap read" on public.tw_swap;
create policy "tw swap read" on public.tw_swap for select to authenticated using ((select public.tw_member()));

drop policy if exists "tw message read" on public.tw_message;
drop policy if exists "tw message write" on public.tw_message;
drop policy if exists "tw message remove" on public.tw_message;
create policy "tw message read" on public.tw_message for select to authenticated using ((select public.tw_member()));
create policy "tw message write" on public.tw_message for insert to authenticated with check (from_staff = (select public.my_staff_id()) and (select public.tw_builder_now()));
create policy "tw message remove" on public.tw_message for delete to authenticated using ((select public.tw_boss()) or from_staff = (select public.my_staff_id()));

-- asking: only one's own shift, of a published schedule, that has not passed, and not twice
create or replace function public.tw_swap_ask(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare a public.tw_assignment; me uuid := public.tw_me(); new_id uuid;
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into a from public.tw_assignment where id = p_assignment;
  if a.id is null or a.person <> me then raise exception 'not your shift'; end if;
  if not exists (select 1 from public.tw_period t where t.start = a.period and t.status = 'published') then raise exception 'the schedule is not published'; end if;
  if a.day < current_date then raise exception 'the shift has passed'; end if;
  if exists (select 1 from public.tw_swap s where s.assignment = a.id and s.status in ('open', 'taken')) then raise exception 'already asked'; end if;
  insert into public.tw_swap(period, assignment, day, shift, from_person, note) values (a.period, a.id, a.day, a.shift, me, nullif(btrim(coalesce(p_note, '')), '')) returning id into new_id;
  return new_id;
end $$;

-- taking: somebody else on the list, who is not already in that shift
create or replace function public.tw_swap_take(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me();
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into s from public.tw_swap where id = p_swap for update;
  if s.id is null or s.status <> 'open' then raise exception 'the request is not open'; end if;
  if s.from_person = me then raise exception 'your own request'; end if;
  if exists (select 1 from public.tw_assignment a where a.period = s.period and a.day = s.day and a.person = me) then raise exception 'you already work that day'; end if;
  update public.tw_swap set status = 'taken', taker = me, taken_at = now() where id = p_swap;
end $$;

-- taking back: the one who asked cancels; the one who took lets go (the request is open again)
create or replace function public.tw_swap_cancel(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me();
begin
  select * into s from public.tw_swap where id = p_swap for update;
  if s.id is null or s.status not in ('open', 'taken') then raise exception 'the request is closed'; end if;
  if s.taker is not null and s.taker = me then update public.tw_swap set status = 'open', taker = null, taken_at = null where id = p_swap;
  elsif s.from_person = me or public.tw_builder(s.period) then update public.tw_swap set status = 'cancelled', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else raise exception 'not yours'; end if;
end $$;

-- the builder's word: approving puts the taker in the shift instead of the one who asked
create or replace function public.tw_swap_decide(p_swap uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap;
begin
  select * into s from public.tw_swap where id = p_swap for update;
  if s.id is null or s.status <> 'taken' then raise exception 'nothing to decide'; end if;
  if not public.tw_builder(s.period) then raise exception 'only the builder of these two weeks'; end if;
  if p_approve then
    if not exists (select 1 from public.tw_assignment a where a.id = s.assignment and a.person = s.from_person) then raise exception 'the shift has changed'; end if;
    if exists (select 1 from public.tw_assignment a where a.period = s.period and a.day = s.day and a.person = s.taker) then raise exception 'the taker already works that day'; end if;
    update public.tw_assignment set person = s.taker, by_hand = true, fixed = false where id = s.assignment;
    update public.tw_swap set status = 'approved', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else
    update public.tw_swap set status = 'declined', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  end if;
end $$;

revoke all on function public.tw_swap_ask(uuid, text), public.tw_swap_take(uuid), public.tw_swap_cancel(uuid), public.tw_swap_decide(uuid, boolean) from public, anon;
grant execute on function public.tw_swap_ask(uuid, text), public.tw_swap_take(uuid), public.tw_swap_cancel(uuid), public.tw_swap_decide(uuid, boolean) to authenticated;

select 'scheduling_v78' as part, 'ok' as result,
       (select count(*) from pg_tables where schemaname = 'public' and tablename in ('tw_swap', 'tw_message')) as tables,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'tw\_swap\_%') as functions;


-- ======== scheduling-v79.sql ========
-- ================================================================
-- Scheduling, part 79 — run in the SQL Editor after scheduling-v78.sql. Safe to run again. (Guy 2026-11-14: the product's admin screens)
-- The two-week schedule: the builders' queue, and two weeks that open by themselves.
--   * the admin sets once the order of the builders and how many days ahead the hand-in opens and closes (tw_settings: queue, open_days, close_days);
--   * whenever somebody of the list opens the site, tw_auto_open() checks whether the next two weeks are due, and opens them with the
--     next builder of the queue (nothing happens before the queue is set). The admin can still open two weeks or change a builder by hand.
-- ================================================================

do $$ begin
  if to_regclass('public.tw_swap') is null then raise exception 'scheduling-v78.sql first'; end if;
end $$;

insert into public.tw_settings(key, value) values ('open_days', '10'::jsonb), ('close_days', '5'::jsonb) on conflict (key) do nothing;

create or replace function public.tw_auto_open() returns date language plpgsql security definer set search_path = public as $$
declare q jsonb; od int; cd int; last_start date; last_builder uuid; nxt date; ids uuid[]; i int; b uuid; dl timestamptz;
begin
  if not public.tw_member() then return null; end if;
  select value into q from public.tw_settings where key = 'queue';
  if q is null or jsonb_typeof(q) <> 'array' or jsonb_array_length(q) = 0 then return null; end if;
  od := coalesce((select (value #>> '{}')::int from public.tw_settings where key = 'open_days'), 10);
  cd := coalesce((select (value #>> '{}')::int from public.tw_settings where key = 'close_days'), 5);
  select start, builder into last_start, last_builder from public.tw_period order by start desc limit 1;
  if last_start is null then nxt := current_date + ((7 - extract(dow from current_date)::int) % 7);
  else nxt := last_start + 14; end if;
  while nxt + 13 < current_date loop nxt := nxt + 14; end loop;          -- (two weeks that already passed are not opened)
  if nxt - od > current_date then return null; end if;                   -- (not due yet)
  select array_agg(p.id order by t.ord) into ids
    from jsonb_array_elements_text(q) with ordinality t(x, ord) join public.tw_people p on p.id::text = t.x and p.active;
  if ids is not null then
    i := array_position(ids, last_builder);
    b := ids[case when i is null then 1 else (i % array_length(ids, 1)) + 1 end];
  end if;
  dl := greatest(((nxt - cd)::timestamp + time '23:59') at time zone 'Asia/Jerusalem', ((current_date + 1)::timestamp + time '23:59') at time zone 'Asia/Jerusalem');
  insert into public.tw_period(start, builder, deadline) values (nxt, b, dl) on conflict (start) do nothing;
  return nxt;
end $$;
revoke all on function public.tw_auto_open() from public, anon;
grant execute on function public.tw_auto_open() to authenticated;

select 'scheduling_v79' as part, 'ok' as result,
       (select count(*) from public.tw_settings where key in ('open_days', 'close_days')) as settings;


-- ======== core/core-v2.sql ========
-- ================================================================
-- CORE, part 2 — run in the SQL Editor of an organisation's database after core-v1.sql. Safe to run again. (Guy 2026-11-14)
-- Adding people from the screen: the admin writes a name and an e-mail; the person gets a row in the core (staff + staff_private).
-- The sign-in itself is created by the Edge Function create-staff-user (it holds the service key; nobody else does), and the person
-- enters the first time with a code sent to that e-mail, then chooses a password.
-- A product adds its own row on top (the two-week schedule: tw_people.staff_id).
-- ================================================================

do $$ begin
  if to_regclass('public.org_profile') is null then raise exception 'core-v1.sql first'; end if;
end $$;

create or replace function public.core_add_staff(p_name text, p_email text default null, p_admin boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); em text := nullif(lower(btrim(coalesce(p_email, ''))), ''); sid uuid;
begin
  if not public.is_admin() then raise exception 'only the admin adds people'; end if;
  if nm = '' then raise exception 'a name is needed'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the e-mail address is not valid'; end if;
  if em is not null and exists (select 1 from public.staff_private p where lower(p.email) = em) then raise exception 'this e-mail address is already on the list'; end if;
  insert into public.staff(display_name, first_name, kind) values (nm, split_part(nm, ' ', 1), case when p_admin then 'admin' else 'staff' end) returning id into sid;
  insert into public.staff_private(staff_id, email, is_admin) values (sid, em, coalesce(p_admin, false));
  return sid;
end $$;

-- the e-mail of somebody who has no sign-in yet (a person who already signs in keeps her address)
create or replace function public.core_set_email(p_staff uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if not public.is_admin() then raise exception 'only the admin changes addresses'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the e-mail address is not valid'; end if;
  if em is not null and exists (select 1 from public.staff_private p where lower(p.email) = em and p.staff_id <> p_staff) then raise exception 'this e-mail address is already on the list'; end if;
  if exists (select 1 from public.staff_private p where p.staff_id = p_staff and p.auth_user_id is not null) then raise exception 'this person already signs in'; end if;
  insert into public.staff_private(staff_id, email) values (p_staff, em) on conflict (staff_id) do update set email = excluded.email;
end $$;

revoke all on function public.core_add_staff(text, text, boolean), public.core_set_email(uuid, text) from public, anon;
grant execute on function public.core_add_staff(text, text, boolean), public.core_set_email(uuid, text) to authenticated;

select 'core_v2' as part, 'ok' as result;


-- ======== scheduling-v80.sql ========
-- ================================================================
-- Scheduling, part 80 — run in the SQL Editor after scheduling-v79.sql. Safe to run again. The SAME file for every database
-- (the Ramzor's test database and every organisation's database). (Guy + Yigal 2026-11-14: hardening before real data)
--   1. schema_migrations: which files ran in this database (every file from here on writes its own line at its end);
--   2. publishing goes through tw_publish(): the server checks the schedule first (one shift a day, rest between shifts, the long weekend
--      shift, nights) and refuses a schedule that breaks a rule; a missing person or a fixed shift that was not kept is a warning that
--      the builder confirms. A direct "status = published" from the site is refused;
--   3. tw_build_log: every automatic build keeps its input, its seed and its result, before the builder changes anything by hand;
--   4. the next two weeks open by the database's clock too (every hour), not only when somebody opens the site;
--   0. the builder of two weeks loses her rights on them after their last day;
--   5. after 12 months the hand-ins, the preferences, the other hours, the swaps and the e-mail log are deleted (the published schedule stays).
-- ================================================================

do $$ begin
  if to_regprocedure('public.tw_auto_open()') is null then raise exception 'scheduling-v79.sql first'; end if;
end $$;

-- 0. the builder of two weeks is the builder until their last day (the screen already says so; now the rules too, Yigal 2026-11-14)
create or replace function public.tw_builder(p_period date) returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.start = p_period and t.builder is not null and t.builder = public.tw_me() and t.start + 13 >= current_date)
$$;

-- 1. which files ran here
create table if not exists public.schema_migrations (version text primary key, applied_at timestamptz not null default now());
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated, public;

-- 2. the places of a day (the same as twSlots in the site: keep the two together)
create or replace function public.tw_slots(p_day date) returns table(shift text, need int, extra int, w int) language sql immutable as $$
  select * from (values
    ('M', case when extract(dow from p_day) = 5 then 1 when extract(dow from p_day) = 2 then 3 else 2 end, case when extract(dow from p_day) in (0, 1, 3, 4) then 1 else 0 end, 1),
    ('A', 2, 1, 1), ('N', 2, 0, 1), ('W', 2, 0, 2)) v(shift, need, extra, w)
  where case extract(dow from p_day)::int when 5 then v.shift in ('M', 'W') when 6 then v.shift = 'N' else v.shift in ('M', 'A', 'N') end
$$;

create or replace function public.tw_shift_name(p text) returns text language sql immutable as $$
  select case p when 'M' then 'בוקר' when 'A' then 'צהריים' when 'N' then 'לילה' when 'W' then 'סוף שבוע' else p end
$$;

-- the check: errors stop the publishing, warnings are confirmed by the builder
create or replace function public.tw_publish_check(p_period date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare errs text[] := '{}'; warns text[] := '{}'; r record;
begin
  if not public.tw_builder(p_period) then raise exception 'only the builder of these two weeks'; end if;
  -- a shift that does not exist on that day
  for r in select a.day, a.shift from public.tw_assignment a where a.period = p_period
           and not exists (select 1 from public.tw_slots(a.day) s where s.shift = a.shift) loop
    errs := errs || format('%s: אין משמרת %s ביום הזה', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift));
  end loop;
  -- one shift a day
  for r in select p.name, a.day from public.tw_assignment a join public.tw_people p on p.id = a.person where a.period = p_period
           group by p.name, a.day having count(*) > 1 loop
    errs := errs || format('%s: יותר ממשמרת אחת ב-%s', r.name, to_char(r.day, 'DD/MM'));
  end loop;
  -- rest: a night and then the next morning; the long weekend shift and then anything on Saturday
  for r in select p.name, a.day, a.shift, b.shift as next_shift from public.tw_assignment a join public.tw_assignment b on b.period = a.period and b.person = a.person and b.day = a.day + 1
           join public.tw_people p on p.id = a.person
           where a.period = p_period and ((a.shift = 'N' and b.shift = 'M') or a.shift = 'W') loop
    errs := errs || format('%s: %s ב-%s ומיד אחריה משמרת למחרת', r.name, case when r.shift = 'W' then 'סוף שבוע' else 'לילה' end, to_char(r.day, 'DD/MM'));
  end loop;
  -- nights: at most two a week for a person
  for r in select p.name, (a.day - p_period) / 7 + 1 as wk, count(*) as n from public.tw_assignment a join public.tw_people p on p.id = a.person
           where a.period = p_period and a.shift = 'N' group by p.name, (a.day - p_period) / 7 having count(*) > 2 loop
    errs := errs || format('%s: %s לילות בשבוע %s', r.name, r.n, r.wk);
  end loop;
  -- warnings: places that are not filled
  for r in select d::date as day, s.shift, s.need, (select count(*) from public.tw_assignment a where a.period = p_period and a.day = d::date and a.shift = s.shift) as got
           from generate_series(p_period, p_period + 13, interval '1 day') d cross join lateral public.tw_slots(d::date) s loop
    if r.got < r.need then warns := warns || format('%s %s: חסרים %s', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift), r.need - r.got); end if;
  end loop;
  -- warnings: a fixed shift that was not kept
  for r in select d::date as day, f.shift, p.name from generate_series(p_period, p_period + 13, interval '1 day') d
           join public.tw_fixed f on f.dow = extract(dow from d)::int join public.tw_people p on p.id = f.person and p.active
           where not exists (select 1 from public.tw_assignment a where a.period = p_period and a.day = d::date and a.shift = f.shift and a.person = f.person) loop
    warns := warns || format('%s: המשמרת הקבועה של %s לא בסידור (%s)', to_char(r.day, 'DD/MM'), r.name, public.tw_shift_name(r.shift));
  end loop;
  -- warnings: more than two people with two nights in a week
  for r in select wk, count(*) as n from (select a.person, (a.day - p_period) / 7 + 1 as wk from public.tw_assignment a where a.period = p_period and a.shift = 'N'
           group by a.person, (a.day - p_period) / 7 having count(*) = 2) t group by wk having count(*) > 2 loop
    warns := warns || format('שבוע %s: %s אנשים עם שני לילות', r.wk, r.n);
  end loop;
  return jsonb_build_object('errors', to_jsonb(errs), 'warnings', to_jsonb(warns));
end $$;

-- publishing: only after the check; p_confirm = the builder saw the warnings
create or replace function public.tw_publish(p_period date, p_confirm boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare chk jsonb;
begin
  chk := public.tw_publish_check(p_period);
  if jsonb_array_length(chk->'errors') > 0 then return chk || '{"published":false}'; end if;
  if jsonb_array_length(chk->'warnings') > 0 and not coalesce(p_confirm, false) then return chk || '{"published":false}'; end if;
  perform set_config('tw.publishing', 'on', true);
  update public.tw_period set status = 'published', published_at = now() where start = p_period;
  perform set_config('tw.publishing', 'off', true);
  begin perform public.tw_mail_now(); exception when undefined_function then null; end;          -- (the e-mails at once, where they are set up: mail-v2)
  return chk || '{"published":true}';
end $$;

-- a direct publishing from the site is refused (only tw_publish publishes)
create or replace function public.tw_period_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' and coalesce(current_setting('tw.publishing', true), '') <> 'on' then
    raise exception 'publishing goes through tw_publish()';
  end if;
  return new;
end $$;
drop trigger if exists tw_period_guard on public.tw_period;
create trigger tw_period_guard before update on public.tw_period for each row execute function public.tw_period_guard();
revoke all on function public.tw_period_guard() from public, anon, authenticated;

-- 3. the build log
create table if not exists public.tw_build_log (
  id uuid primary key default gen_random_uuid(),
  period date not null references public.tw_period(start) on delete cascade,
  seed bigint not null,
  input jsonb not null,          -- the people, the options, the fixed shifts and the hand placements the build started from
  result jsonb not null,         -- the placements and the report
  built_by uuid default public.my_staff_id(),
  built_at timestamptz not null default now()
);
create index if not exists tw_build_log_period_idx on public.tw_build_log (period, built_at desc);
alter table public.tw_build_log enable row level security;
revoke all on public.tw_build_log from anon, public;
grant select, insert on public.tw_build_log to authenticated;
drop policy if exists "tw build log read" on public.tw_build_log;
drop policy if exists "tw build log write" on public.tw_build_log;
create policy "tw build log read" on public.tw_build_log for select to authenticated using (public.tw_builder(period));
create policy "tw build log write" on public.tw_build_log for insert to authenticated with check (public.tw_builder(period));

-- 4. opening by the clock: the same opening as tw_auto_open(), for the hourly job (no person calls it)
create or replace function public.tw_auto_open_job() returns date language plpgsql security definer set search_path = public as $$
declare q jsonb; od int; cd int; last_start date; last_builder uuid; nxt date; ids uuid[]; i int; b uuid; dl timestamptz;
begin
  select value into q from public.tw_settings where key = 'queue';
  if q is null or jsonb_typeof(q) <> 'array' or jsonb_array_length(q) = 0 then return null; end if;
  od := coalesce((select (value #>> '{}')::int from public.tw_settings where key = 'open_days'), 10);
  cd := coalesce((select (value #>> '{}')::int from public.tw_settings where key = 'close_days'), 5);
  select start, builder into last_start, last_builder from public.tw_period order by start desc limit 1;
  if last_start is null then nxt := current_date + ((7 - extract(dow from current_date)::int) % 7); else nxt := last_start + 14; end if;
  while nxt + 13 < current_date loop nxt := nxt + 14; end loop;
  if nxt - od > current_date then return null; end if;
  select array_agg(p.id order by t.ord) into ids from jsonb_array_elements_text(q) with ordinality t(x, ord) join public.tw_people p on p.id::text = t.x and p.active;
  if ids is not null then i := array_position(ids, last_builder); b := ids[case when i is null then 1 else (i % array_length(ids, 1)) + 1 end]; end if;
  dl := greatest(((nxt - cd)::timestamp + time '23:59') at time zone 'Asia/Jerusalem', ((current_date + 1)::timestamp + time '23:59') at time zone 'Asia/Jerusalem');
  insert into public.tw_period(start, builder, deadline) values (nxt, b, dl) on conflict (start) do nothing;
  return nxt;
end $$;
create or replace function public.tw_auto_open() returns date language plpgsql security definer set search_path = public as $$
begin
  if not public.tw_member() then return null; end if;
  return public.tw_auto_open_job();
end $$;
revoke all on function public.tw_auto_open_job() from public, anon, authenticated;

-- 5. after 12 months (Guy 2026-11-14): the hand-ins and everything around them go; the schedule itself stays
create or replace function public.tw_purge_old() returns int language plpgsql security definer set search_path = public as $$
declare cut date := (current_date - interval '12 months')::date; n int := 0; k int;
begin
  delete from public.tw_option where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_other where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_submission where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_swap where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_build_log where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  if to_regclass('public.tw_mail_log') is not null then execute 'delete from public.tw_mail_log where period + 13 < $1' using cut; get diagnostics k = row_count; n := n + k; end if;
  return n;
end $$;
revoke all on function public.tw_shift_name(text) from public, anon;
revoke all on function public.tw_slots(date), public.tw_publish_check(date), public.tw_publish(date, boolean), public.tw_purge_old() from public, anon;
grant execute on function public.tw_slots(date), public.tw_publish_check(date), public.tw_publish(date, boolean) to authenticated;
revoke all on function public.tw_purge_old() from authenticated;

-- the clock (where pg_cron is on): opening every hour at minute 5, the purge every night at 03:30
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'tw-auto-open') then perform cron.unschedule('tw-auto-open'); end if;
    if exists (select 1 from cron.job where jobname = 'tw-purge') then perform cron.unschedule('tw-purge'); end if;
    perform cron.schedule('tw-auto-open', '5 * * * *', 'select public.tw_auto_open_job()');
    perform cron.schedule('tw-purge', '30 1 * * *', 'select public.tw_purge_old()');          -- (01:30 UTC = 03:30 in Israel in winter)
  end if;
end $$;

insert into public.schema_migrations(version) values ('scheduling-v80') on conflict (version) do nothing;
select 'scheduling_v80' as part, 'ok' as result,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('tw_publish', 'tw_publish_check', 'tw_auto_open_job', 'tw_purge_old', 'tw_slots')) as functions,
       (select count(*) from pg_extension where extname = 'pg_cron') as clock;


-- ======== core/mail-v1.sql ========
-- ================================================================
-- The two-week schedule's e-mails, part 1 — run in the SQL Editor of an organisation's database (after scheduling-v79.sql),
-- AFTER the Edge Function tw-mail is deployed. Safe to run again. (Guy 2026-11-14)
--   * tw_mail_log: what tw-mail already sent (nobody reads or writes it from the site; only the function, with the service key);
--   * the address of the site, for the button in the e-mails;
--   * every hour (at minute 15) the database calls tw-mail, which sends only what is due.
-- ================================================================

do $$ begin
  if to_regprocedure('public.tw_auto_open()') is null then raise exception 'scheduling-v79.sql first'; end if;
end $$;

create table if not exists public.tw_mail_log (
  period date not null references public.tw_period(start) on delete cascade,
  kind text not null check (kind in ('reminder', 'published')),
  mark text not null default '',                -- (for "published": the moment of that publishing, so a new publishing mails again)
  count int not null default 0,
  sent_at timestamptz not null default now(),
  primary key (period, kind, mark)
);
alter table public.tw_mail_log enable row level security;
revoke all on public.tw_mail_log from anon, authenticated, public;



-- ======== scheduling-v81.sql ========
-- ================================================================
-- Scheduling, part 81 — ONE DATABASE FOR MANY ORGANISATIONS. Run in the SQL Editor of the product's database
-- (mercury-shibutzim), after scheduling-v80.sql and core/mail-v1.sql. Safe to run again. (Guy 2026-11-14)
-- Guy: one database for all the organisations (and later all three products), each organisation sees only its own data;
-- the owner (Guy) sees the list of organisations and may enter one for support, and every entry is written down;
-- one sign-in for a person who works in two organisations; each organisation has an address of its own.
-- How:
--   1. public.org: the organisations (slug = the short name in its address, name, products, its own words). It replaces
--      org_profile; the organisation that was here becomes the first row (slug 'demo', can be renamed).
--   2. every table gets org_id. A new row gets the caller's organisation by itself, so the site does not send it.
--   3. current_org(): the organisation of this call = the site's header x-org (the slug of its address), but ONLY if the
--      caller works there (or the owner opened support there). Without the header: the one organisation the caller works in.
--   4. on every table one more rule ("org only", restrictive: it is added to all the others): a row of another organisation
--      is never seen, written or moved, whatever the other rules say.
--   5. every function that reads tables by itself (security definer) now looks only inside current_org().
--   6. links between rows carry the organisation too, so a row can never point at a person of another organisation.
--   7. the owner: core_owner (who), core_support (every entry: who, where, why, until when; 2 hours), core_orgs() (the list,
--      without people's details), core_support_open() / core_support_close(), core_org_create().
-- The Ramzor's databases are NOT touched by this file (it stops at once there).
-- ================================================================

do $$ begin
  if to_regclass('public.org_profile') is null and to_regclass('public.org') is null then raise exception 'only the product database (core-v1 first)'; end if;
  if to_regprocedure('public.tw_publish(date, boolean)') is null then raise exception 'scheduling-v80.sql first'; end if;
  if to_regclass('public.tw_mail_log') is null then raise exception 'core/mail-v1.sql first'; end if;
end $$;

-- 1. the organisations ------------------------------------------------
create table if not exists public.org (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),     -- the short name in its address
  name text not null default 'ארגון חדש',
  products text[] not null default '{}',                                     -- for example {schedule2w}
  words jsonb not null default '{}'::jsonb,                                  -- its own words, for example {"person":"מלווה"}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if to_regclass('public.org_profile') is not null and not exists (select 1 from public.org) then
    insert into public.org(slug, name, products, words) select 'demo', name, products, words from public.org_profile limit 1;
  end if;
  if not exists (select 1 from public.org) then insert into public.org(slug) values ('demo'); end if;
end $$;

create table if not exists public.core_owner (auth_user_id uuid primary key, added_at timestamptz not null default now());
create table if not exists public.core_support (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,                                                       -- the owner's sign-in
  org uuid not null references public.org(id) on delete cascade,
  reason text not null,
  opened_at timestamptz not null default now(),
  until timestamptz not null
);
alter table public.org enable row level security;
alter table public.core_owner enable row level security;
alter table public.core_support enable row level security;
revoke all on public.org, public.core_owner, public.core_support from anon, authenticated, public;
grant select, update on public.org to authenticated;

-- 2. org_id on every table (the rows that are here belong to the first organisation) ------------
do $$
declare t text; o uuid := (select id from public.org order by created_at, slug limit 1);
begin
  foreach t in array array['staff', 'staff_private', 'tw_people', 'tw_period', 'tw_option', 'tw_submission', 'tw_assignment', 'tw_fixed',
                           'tw_settings', 'tw_other', 'tw_swap', 'tw_message', 'tw_build_log', 'tw_mail_log'] loop
    execute format('alter table public.%I add column if not exists org_id uuid', t);
    execute format('update public.%I set org_id = $1 where org_id is null', t) using o;
    execute format('alter table public.%I alter column org_id set not null', t);
  end loop;
end $$;

-- 6. the keys and the links, now with the organisation in them (done once: a second run, or a run after scheduling-v82.sql, skips it)
do $v81keys$
declare r record; t text;
begin
  if exists (select 1 from pg_constraint where conname = 'tw_period_pkey' and conrelid = 'public.tw_period'::regclass and array_length(conkey, 1) = 2) then return; end if;
  -- every old link between these tables goes first (they are made again below)
  for r in select c.conname, c.conrelid::regclass as tbl from pg_constraint c
           where c.contype = 'f' and c.conrelid in ('public.staff'::regclass, 'public.staff_private'::regclass, 'public.tw_people'::regclass,
                 'public.tw_period'::regclass, 'public.tw_option'::regclass, 'public.tw_submission'::regclass, 'public.tw_assignment'::regclass,
                 'public.tw_fixed'::regclass, 'public.tw_settings'::regclass, 'public.tw_other'::regclass, 'public.tw_swap'::regclass,
                 'public.tw_message'::regclass, 'public.tw_build_log'::regclass, 'public.tw_mail_log'::regclass) loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
  execute 'alter table public.tw_period drop constraint if exists tw_period_pkey';
  execute 'alter table public.tw_period add constraint tw_period_pkey primary key (org_id, start)';
  execute 'alter table public.tw_fixed drop constraint if exists tw_fixed_pkey';
  execute 'alter table public.tw_fixed add constraint tw_fixed_pkey primary key (org_id, dow, shift)';
  execute 'alter table public.tw_settings drop constraint if exists tw_settings_pkey';
  execute 'alter table public.tw_settings add constraint tw_settings_pkey primary key (org_id, key)';
  execute 'alter table public.tw_mail_log drop constraint if exists tw_mail_log_pkey';
  execute 'alter table public.tw_mail_log add constraint tw_mail_log_pkey primary key (org_id, period, kind, mark)';
  execute 'alter table public.staff_private drop constraint if exists staff_private_auth_user_id_key';
  execute 'alter table public.staff_private drop constraint if exists staff_private_org_user_key';
  execute 'alter table public.staff_private add constraint staff_private_org_user_key unique (org_id, auth_user_id)';
  execute 'alter table public.staff drop constraint if exists staff_org_id_key';
  execute 'alter table public.staff add constraint staff_org_id_key unique (org_id, id)';
  execute 'alter table public.tw_people drop constraint if exists tw_people_org_id_key';
  execute 'alter table public.tw_people add constraint tw_people_org_id_key unique (org_id, id)';
  execute 'alter table public.tw_assignment drop constraint if exists tw_assignment_org_id_key';
  execute 'alter table public.tw_assignment add constraint tw_assignment_org_id_key unique (org_id, id)';
  foreach t in array array['staff', 'staff_private', 'tw_people', 'tw_period', 'tw_option', 'tw_submission', 'tw_assignment', 'tw_fixed',
                           'tw_settings', 'tw_other', 'tw_swap', 'tw_message', 'tw_build_log', 'tw_mail_log'] loop
    execute format('alter table public.%I add constraint %I foreign key (org_id) references public.org(id) on delete cascade', t, t || '_org_fk');
  end loop;
  execute 'alter table public.staff_private add constraint staff_private_staff_fk foreign key (org_id, staff_id) references public.staff(org_id, id) on delete cascade';
  execute 'alter table public.tw_people     add constraint tw_people_staff_fk foreign key (org_id, staff_id) references public.staff(org_id, id) on delete set null (staff_id)';
  execute 'alter table public.tw_period     add constraint tw_period_builder_fk foreign key (org_id, builder) references public.tw_people(org_id, id) on delete set null (builder)';
  execute 'alter table public.tw_option     add constraint tw_option_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_option     add constraint tw_option_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_submission add constraint tw_submission_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_submission add constraint tw_submission_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_assignment add constraint tw_assignment_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_assignment add constraint tw_assignment_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_fixed      add constraint tw_fixed_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_other      add constraint tw_other_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_other      add constraint tw_other_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_swap       add constraint tw_swap_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_swap       add constraint tw_swap_assignment_fk foreign key (org_id, assignment) references public.tw_assignment(org_id, id) on delete set null (assignment)';
  execute 'alter table public.tw_swap       add constraint tw_swap_from_fk foreign key (org_id, from_person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_swap       add constraint tw_swap_taker_fk foreign key (org_id, taker) references public.tw_people(org_id, id) on delete set null (taker)';
  execute 'alter table public.tw_build_log  add constraint tw_build_log_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_mail_log   add constraint tw_mail_log_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
end $v81keys$;

-- 3. the organisation of this call ------------------------------------
create or replace function public.current_org() returns uuid language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); s text; o uuid; ids uuid[];
begin
  if me is null then          -- the SQL Editor or a job: only what the script itself set (select set_config('app.org', '<slug>', false))
    s := nullif(lower(btrim(coalesce(current_setting('app.org', true), ''))), '');
    if s is null then return null; end if;
    select g.id into o from public.org g where g.slug = s;
    return o;
  end if;
  begin
    s := nullif(lower(btrim(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-org', ''))), '');
  exception when others then s := null;
  end;
  if s is not null then       -- the site of an organisation: only if the caller works there, or the owner opened support there
    select g.id into o from public.org g where g.slug = s and (
      exists (select 1 from public.staff_private p join public.staff t on t.id = p.staff_id where p.auth_user_id = me and p.org_id = g.id and t.active)
      or exists (select 1 from public.core_support c where c.owner = me and c.org = g.id and now() < c.until));
    return o;
  end if;
  select array_agg(distinct p.org_id) into ids from public.staff_private p join public.staff t on t.id = p.staff_id where p.auth_user_id = me and t.active;
  if array_length(ids, 1) = 1 then return ids[1]; end if;          -- (works in one organisation only)
  return null;
end $$;
revoke all on function public.current_org() from public, anon;
grant execute on function public.current_org() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['staff', 'staff_private', 'tw_people', 'tw_period', 'tw_option', 'tw_submission', 'tw_assignment', 'tw_fixed',
                           'tw_settings', 'tw_other', 'tw_swap', 'tw_message', 'tw_build_log', 'tw_mail_log'] loop
    execute format('alter table public.%I alter column org_id set default public.current_org()', t);
    -- 4. the rule that is added to all the others
    execute format('drop policy if exists "org only" on public.%I', t);
    execute format('create policy "org only" on public.%I as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()))', t);
  end loop;
end $$;

-- 7. the owner ---------------------------------------------------------
-- the first owner: the sign-in of the oldest admin here (Guy, on mercury-shibutzim)
insert into public.core_owner(auth_user_id)
select p.auth_user_id from public.staff s join public.staff_private p on p.staff_id = s.id
 where (s.kind = 'admin' or p.is_admin) and p.auth_user_id is not null and not exists (select 1 from public.core_owner)
 order by s.created_at limit 1
on conflict do nothing;

create or replace function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.core_owner o where o.auth_user_id = auth.uid())
$$;
create or replace function public.core_in_support() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.core_support c where c.owner = auth.uid() and c.org = public.current_org() and now() < c.until)
$$;

-- the list of organisations, for the owner only: no people's details, only how many
create or replace function public.core_orgs() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'only the owner' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'name', g.name, 'products', g.products, 'created_at', g.created_at,
                          'people', (select count(*) from public.staff s where s.org_id = g.id and s.active),
                          'support_until', (select max(c.until) from public.core_support c where c.org = g.id and c.owner = auth.uid() and now() < c.until))
                          order by g.created_at) from public.org g), '[]'::jsonb);
end $$;

-- entering an organisation for support: always with a reason, for two hours, written down
create or replace function public.core_support_open(p_slug text, p_reason text) returns timestamptz language plpgsql security definer set search_path = public as $$
declare o uuid; u timestamptz := now() + interval '2 hours';
begin
  if not public.is_owner() then raise exception 'only the owner' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is needed'; end if;
  select id into o from public.org where slug = lower(btrim(p_slug));
  if o is null then raise exception 'no such organisation'; end if;
  insert into public.core_support(owner, org, reason, until) values (auth.uid(), o, btrim(p_reason), u);
  return u;
end $$;
create or replace function public.core_support_close() returns void language plpgsql security definer set search_path = public as $$
begin
  update public.core_support set until = now() where owner = auth.uid() and now() < until;
end $$;

-- a new organisation (the owner); its first admin is added afterwards inside it, in support
create or replace function public.core_org_create(p_slug text, p_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid; s text := lower(btrim(coalesce(p_slug, '')));
begin
  if not public.is_owner() then raise exception 'only the owner' using errcode = '42501'; end if;
  if s !~ '^[a-z0-9][a-z0-9-]{1,30}$' then raise exception 'the short name: small English letters, digits and -'; end if;
  insert into public.org(slug, name, products) values (s, coalesce(nullif(btrim(p_name), ''), s), array['schedule2w']) returning id into o;
  insert into public.tw_settings(org_id, key, value) values (o, 'open_days', '10'::jsonb), (o, 'close_days', '5'::jsonb) on conflict do nothing;
  return o;
end $$;

revoke all on function public.is_owner(), public.core_in_support(), public.core_orgs(), public.core_support_open(text, text), public.core_support_close(), public.core_org_create(text, text) from public, anon;
grant execute on function public.is_owner(), public.core_in_support(), public.core_orgs(), public.core_support_open(text, text), public.core_support_close(), public.core_org_create(text, text) to authenticated;

-- 5. the core's functions, inside the organisation of the call ----------
create or replace function public.my_staff_id() returns uuid language sql stable security definer set search_path = public as $$
  select p.staff_id from public.staff_private p join public.staff s on s.id = p.staff_id
   where p.auth_user_id = auth.uid() and p.org_id = public.current_org() and s.active limit 1
$$;
create or replace function public.my_kind() returns text language sql stable security definer set search_path = public as $$
  select s.kind from public.staff s join public.staff_private p on p.staff_id = s.id
   where p.auth_user_id = auth.uid() and p.org_id = public.current_org() and s.active limit 1
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and p.org_id = public.current_org() and s.active and (s.kind = 'admin' or p.is_admin))
      or public.core_in_support()
$$;
create or replace function public.is_coordinator() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                                      where p.auth_user_id = auth.uid() and p.org_id = public.current_org() and s.active and s.kind = 'coordinator')
$$;
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('staff_id', s.id, 'name', s.display_name, 'kind', s.kind, 'admin', public.is_admin(), 'coordinator', public.is_coordinator(), 'owner', public.is_owner(),
                               'org', (select jsonb_build_object('slug', g.slug, 'name', g.name, 'products', g.products, 'words', g.words) from public.org g where g.id = s.org_id))
       from public.staff s where s.id = public.my_staff_id()),
    case when public.core_in_support() then
      jsonb_build_object('staff_id', null, 'name', 'תמיכה', 'kind', 'admin', 'admin', true, 'coordinator', true, 'owner', true, 'support', true,
                         'org', (select jsonb_build_object('slug', g.slug, 'name', g.name, 'products', g.products, 'words', g.words) from public.org g where g.id = public.current_org()))
    end)
$$;

drop policy if exists "org read" on public.org;
drop policy if exists "org admin" on public.org;
create policy "org read" on public.org for select to authenticated using (id = (select public.current_org()) and ((select public.is_active_staff()) or (select public.core_in_support())));
create policy "org admin" on public.org for update to authenticated using (id = (select public.current_org()) and (select public.is_admin())) with check (id = (select public.current_org()) and (select public.is_admin()));

create or replace function public.core_add_staff(p_name text, p_email text default null, p_admin boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); em text := nullif(lower(btrim(coalesce(p_email, ''))), ''); sid uuid; o uuid := public.current_org();
begin
  if o is null or not public.is_admin() then raise exception 'only the admin adds people'; end if;
  if nm = '' then raise exception 'a name is needed'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the e-mail address is not valid'; end if;
  if em is not null and exists (select 1 from public.staff_private p where p.org_id = o and lower(p.email) = em) then raise exception 'this e-mail address is already on the list'; end if;
  insert into public.staff(org_id, display_name, first_name, kind) values (o, nm, split_part(nm, ' ', 1), case when p_admin then 'admin' else 'staff' end) returning id into sid;
  insert into public.staff_private(org_id, staff_id, email, is_admin) values (o, sid, em, coalesce(p_admin, false));
  return sid;
end $$;
create or replace function public.core_set_email(p_staff uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := nullif(lower(btrim(coalesce(p_email, ''))), ''); o uuid := public.current_org();
begin
  if o is null or not public.is_admin() then raise exception 'only the admin changes addresses'; end if;
  if not exists (select 1 from public.staff s where s.id = p_staff and s.org_id = o) then raise exception 'not on this list'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the e-mail address is not valid'; end if;
  if em is not null and exists (select 1 from public.staff_private p where p.org_id = o and lower(p.email) = em and p.staff_id <> p_staff) then raise exception 'this e-mail address is already on the list'; end if;
  if exists (select 1 from public.staff_private p where p.staff_id = p_staff and p.auth_user_id is not null) then raise exception 'this person already signs in'; end if;
  insert into public.staff_private(org_id, staff_id, email) values (o, p_staff, em) on conflict (staff_id) do update set email = excluded.email;
end $$;

-- 5. the schedule's functions, inside the organisation of the call ------
create or replace function public.tw_me() returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.tw_people p where p.active and p.org_id = public.current_org() and p.staff_id = public.my_staff_id() limit 1
$$;
create or replace function public.tw_builder(p_period date) returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.start = p_period
                                     and t.builder is not null and t.builder = public.tw_me() and t.start + 13 >= current_date)
$$;
create or replace function public.tw_open(p_period date) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.start = p_period and t.status = 'open' and (t.deadline is null or t.deadline > now()))
$$;
create or replace function public.tw_building() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.builder is not null and t.builder = public.tw_me() and t.status <> 'published')
$$;
create or replace function public.tw_builder_now() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.builder is not null and t.builder = public.tw_me() and t.start + 13 >= current_date)
$$;

create or replace function public.tw_publish_check(p_period date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare errs text[] := '{}'; warns text[] := '{}'; r record; o uuid := public.current_org();
begin
  if o is null or not public.tw_builder(p_period) then raise exception 'only the builder of these two weeks'; end if;
  for r in select a.day, a.shift from public.tw_assignment a where a.org_id = o and a.period = p_period
           and not exists (select 1 from public.tw_slots(a.day) s where s.shift = a.shift) loop
    errs := errs || format('%s: אין משמרת %s ביום הזה', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift));
  end loop;
  for r in select p.name, a.day from public.tw_assignment a join public.tw_people p on p.id = a.person where a.org_id = o and a.period = p_period
           group by p.name, a.day having count(*) > 1 loop
    errs := errs || format('%s: יותר ממשמרת אחת ב-%s', r.name, to_char(r.day, 'DD/MM'));
  end loop;
  for r in select p.name, a.day, a.shift, b.shift as next_shift from public.tw_assignment a
           join public.tw_assignment b on b.org_id = a.org_id and b.period = a.period and b.person = a.person and b.day = a.day + 1
           join public.tw_people p on p.id = a.person
           where a.org_id = o and a.period = p_period and ((a.shift = 'N' and b.shift = 'M') or a.shift = 'W') loop
    errs := errs || format('%s: %s ב-%s ומיד אחריה משמרת למחרת', r.name, case when r.shift = 'W' then 'סוף שבוע' else 'לילה' end, to_char(r.day, 'DD/MM'));
  end loop;
  for r in select p.name, (a.day - p_period) / 7 + 1 as wk, count(*) as n from public.tw_assignment a join public.tw_people p on p.id = a.person
           where a.org_id = o and a.period = p_period and a.shift = 'N' group by p.name, (a.day - p_period) / 7 having count(*) > 2 loop
    errs := errs || format('%s: %s לילות בשבוע %s', r.name, r.n, r.wk);
  end loop;
  for r in select d::date as day, s.shift, s.need, (select count(*) from public.tw_assignment a where a.org_id = o and a.period = p_period and a.day = d::date and a.shift = s.shift) as got
           from generate_series(p_period, p_period + 13, interval '1 day') d cross join lateral public.tw_slots(d::date) s loop
    if r.got < r.need then warns := warns || format('%s %s: חסרים %s', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift), r.need - r.got); end if;
  end loop;
  for r in select d::date as day, f.shift, p.name from generate_series(p_period, p_period + 13, interval '1 day') d
           join public.tw_fixed f on f.org_id = o and f.dow = extract(dow from d)::int join public.tw_people p on p.id = f.person and p.active
           where not exists (select 1 from public.tw_assignment a where a.org_id = o and a.period = p_period and a.day = d::date and a.shift = f.shift and a.person = f.person) loop
    warns := warns || format('%s: המשמרת הקבועה של %s לא בסידור (%s)', to_char(r.day, 'DD/MM'), r.name, public.tw_shift_name(r.shift));
  end loop;
  for r in select wk, count(*) as n from (select a.person, (a.day - p_period) / 7 + 1 as wk from public.tw_assignment a where a.org_id = o and a.period = p_period and a.shift = 'N'
           group by a.person, (a.day - p_period) / 7 having count(*) = 2) t group by wk having count(*) > 2 loop
    warns := warns || format('שבוע %s: %s אנשים עם שני לילות', r.wk, r.n);
  end loop;
  return jsonb_build_object('errors', to_jsonb(errs), 'warnings', to_jsonb(warns));
end $$;

create or replace function public.tw_publish(p_period date, p_confirm boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare chk jsonb;
begin
  chk := public.tw_publish_check(p_period);
  if jsonb_array_length(chk->'errors') > 0 then return chk || '{"published":false}'; end if;
  if jsonb_array_length(chk->'warnings') > 0 and not coalesce(p_confirm, false) then return chk || '{"published":false}'; end if;
  perform set_config('tw.publishing', 'on', true);
  update public.tw_period set status = 'published', published_at = now() where org_id = public.current_org() and start = p_period;
  perform set_config('tw.publishing', 'off', true);
  begin perform public.tw_mail_now(); exception when undefined_function then null; end;
  return chk || '{"published":true}';
end $$;

create or replace function public.tw_swap_ask(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare a public.tw_assignment; me uuid := public.tw_me(); o uuid := public.current_org(); new_id uuid;
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into a from public.tw_assignment where id = p_assignment and org_id = o;
  if a.id is null or a.person <> me then raise exception 'not your shift'; end if;
  if not exists (select 1 from public.tw_period t where t.org_id = o and t.start = a.period and t.status = 'published') then raise exception 'the schedule is not published'; end if;
  if a.day < current_date then raise exception 'the shift has passed'; end if;
  if exists (select 1 from public.tw_swap s where s.assignment = a.id and s.status in ('open', 'taken')) then raise exception 'already asked'; end if;
  insert into public.tw_swap(org_id, period, assignment, day, shift, from_person, note) values (o, a.period, a.id, a.day, a.shift, me, nullif(btrim(coalesce(p_note, '')), '')) returning id into new_id;
  return new_id;
end $$;
create or replace function public.tw_swap_take(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me(); o uuid := public.current_org();
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into s from public.tw_swap where id = p_swap and org_id = o for update;
  if s.id is null or s.status <> 'open' then raise exception 'the request is not open'; end if;
  if s.from_person = me then raise exception 'your own request'; end if;
  if exists (select 1 from public.tw_assignment a where a.org_id = o and a.period = s.period and a.day = s.day and a.person = me) then raise exception 'you already work that day'; end if;
  update public.tw_swap set status = 'taken', taker = me, taken_at = now() where id = p_swap;
end $$;
create or replace function public.tw_swap_cancel(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me();
begin
  select * into s from public.tw_swap where id = p_swap and org_id = public.current_org() for update;
  if s.id is null or s.status not in ('open', 'taken') then raise exception 'the request is closed'; end if;
  if s.taker is not null and s.taker = me then update public.tw_swap set status = 'open', taker = null, taken_at = null where id = p_swap;
  elsif s.from_person = me or public.tw_builder(s.period) then update public.tw_swap set status = 'cancelled', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else raise exception 'not yours'; end if;
end $$;
create or replace function public.tw_swap_decide(p_swap uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap;
begin
  select * into s from public.tw_swap where id = p_swap and org_id = public.current_org() for update;
  if s.id is null or s.status <> 'taken' then raise exception 'nothing to decide'; end if;
  if not public.tw_builder(s.period) then raise exception 'only the builder of these two weeks'; end if;
  if p_approve then
    if not exists (select 1 from public.tw_assignment a where a.id = s.assignment and a.person = s.from_person) then raise exception 'the shift has changed'; end if;
    if exists (select 1 from public.tw_assignment a where a.org_id = s.org_id and a.period = s.period and a.day = s.day and a.person = s.taker) then raise exception 'the taker already works that day'; end if;
    update public.tw_assignment set person = s.taker, by_hand = true, fixed = false where id = s.assignment;
    update public.tw_swap set status = 'approved', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else
    update public.tw_swap set status = 'declined', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  end if;
end $$;

-- opening the next two weeks: per organisation; the hourly job goes over all of them
create or replace function public.tw_auto_open_org(p_org uuid) returns date language plpgsql security definer set search_path = public as $$
declare q jsonb; od int; cd int; last_start date; last_builder uuid; nxt date; ids uuid[]; i int; b uuid; dl timestamptz;
begin
  if p_org is null then return null; end if;
  select value into q from public.tw_settings where org_id = p_org and key = 'queue';
  if q is null or jsonb_typeof(q) <> 'array' or jsonb_array_length(q) = 0 then return null; end if;
  od := coalesce((select (value #>> '{}')::int from public.tw_settings where org_id = p_org and key = 'open_days'), 10);
  cd := coalesce((select (value #>> '{}')::int from public.tw_settings where org_id = p_org and key = 'close_days'), 5);
  select start, builder into last_start, last_builder from public.tw_period where org_id = p_org order by start desc limit 1;
  if last_start is null then nxt := current_date + ((7 - extract(dow from current_date)::int) % 7); else nxt := last_start + 14; end if;
  while nxt + 13 < current_date loop nxt := nxt + 14; end loop;
  if nxt - od > current_date then return null; end if;
  select array_agg(p.id order by t.ord) into ids from jsonb_array_elements_text(q) with ordinality t(x, ord)
    join public.tw_people p on p.id::text = t.x and p.active and p.org_id = p_org;
  if ids is not null then i := array_position(ids, last_builder); b := ids[case when i is null then 1 else (i % array_length(ids, 1)) + 1 end]; end if;
  dl := greatest(((nxt - cd)::timestamp + time '23:59') at time zone 'Asia/Jerusalem', ((current_date + 1)::timestamp + time '23:59') at time zone 'Asia/Jerusalem');
  insert into public.tw_period(org_id, start, builder, deadline) values (p_org, nxt, b, dl) on conflict (org_id, start) do nothing;
  return nxt;
end $$;
create or replace function public.tw_auto_open_job() returns date language plpgsql security definer set search_path = public as $$
declare g record; d date; last date;
begin
  for g in select id from public.org loop
    d := public.tw_auto_open_org(g.id);
    if d is not null then last := d; end if;
  end loop;
  return last;
end $$;
create or replace function public.tw_auto_open() returns date language plpgsql security definer set search_path = public as $$
begin
  if not public.tw_member() then return null; end if;
  return public.tw_auto_open_org(public.current_org());
end $$;
revoke all on function public.tw_auto_open_org(uuid), public.tw_auto_open_job() from public, anon, authenticated;
revoke all on function public.tw_auto_open() from public, anon;
grant execute on function public.tw_auto_open() to authenticated;

-- org_profile is now the first row of public.org
drop table if exists public.org_profile;

insert into public.schema_migrations(version) values ('scheduling-v81') on conflict (version) do nothing;
select 'scheduling_v81' as part, 'ok' as result,
       (select count(*) from public.org) as organisations,
       (select string_agg(slug, ', ') from public.org) as addresses,
       (select count(*) from public.core_owner) as owners,
       (select count(*) from pg_policies where schemaname = 'public' and policyname = 'org only') as org_rules;


-- ======== scheduling-v82.sql ========
-- ================================================================
-- Scheduling, part 82 — run in the SQL Editor of the product's database (mercury-shibutzim), after scheduling-v81.sql.
-- Safe to run again. (Guy 2026-11-14, after the review agents)
-- A personal notice when one's shift changes AFTER the schedule was published: the builder adds or removes a person in a place, or a
-- swap is approved. The person sees it at the top of "הסידור" with "הבנתי" (the site reads tw_notice; before this file there is nothing).
--   * the database writes the notices by itself (a trigger on tw_assignment), only while the two weeks are published and only for days
--     that have not passed; nobody writes them from the site;
--   * a person sees and marks "seen" only their own notices; the organisation rule ("org only") as on every table;
--   * notices older than 12 months go with tw_purge_old().
-- ================================================================

do $$ begin
  if to_regprocedure('public.current_org()') is null then raise exception 'scheduling-v81.sql first'; end if;
end $$;

create table if not exists public.tw_notice (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  person uuid not null,
  period date not null,
  day date not null,
  shift text not null check (shift in ('M', 'A', 'N', 'W')),
  kind text not null check (kind in ('added', 'removed')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tw_notice_person_fk') then
    alter table public.tw_notice add constraint tw_notice_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tw_notice_period_fk') then
    alter table public.tw_notice add constraint tw_notice_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade;
  end if;
end $$;
create index if not exists tw_notice_person_idx on public.tw_notice (org_id, person, seen_at);

alter table public.tw_notice enable row level security;
revoke all on public.tw_notice from anon, public;
grant select on public.tw_notice to authenticated;
grant update (seen_at) on public.tw_notice to authenticated;
drop policy if exists "org only" on public.tw_notice;
drop policy if exists "tw notice own" on public.tw_notice;
drop policy if exists "tw notice seen" on public.tw_notice;
create policy "org only" on public.tw_notice as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()));
create policy "tw notice own" on public.tw_notice for select to authenticated using (person = (select public.tw_me()));
create policy "tw notice seen" on public.tw_notice for update to authenticated using (person = (select public.tw_me())) with check (person = (select public.tw_me()));

-- the writer: a change in a published schedule, for a day that has not passed
create or replace function public.tw_notice_write() returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid; pr date; dy date; sh text;
begin
  o := coalesce(new.org_id, old.org_id); pr := coalesce(new.period, old.period);
  if not exists (select 1 from public.tw_period t where t.org_id = o and t.start = pr and t.status = 'published') then return null; end if;
  if tg_op = 'INSERT' then
    if new.day >= current_date then insert into public.tw_notice(org_id, person, period, day, shift, kind) values (new.org_id, new.person, new.period, new.day, new.shift, 'added'); end if;
  elsif tg_op = 'DELETE' then
    if old.day >= current_date then insert into public.tw_notice(org_id, person, period, day, shift, kind) values (old.org_id, old.person, old.period, old.day, old.shift, 'removed'); end if;
  elsif new.person is distinct from old.person or new.day is distinct from old.day or new.shift is distinct from old.shift then
    if old.day >= current_date then insert into public.tw_notice(org_id, person, period, day, shift, kind) values (old.org_id, old.person, old.period, old.day, old.shift, 'removed'); end if;
    if new.day >= current_date then insert into public.tw_notice(org_id, person, period, day, shift, kind) values (new.org_id, new.person, new.period, new.day, new.shift, 'added'); end if;
  end if;
  return null;
end $$;
revoke all on function public.tw_notice_write() from public, anon, authenticated;
drop trigger if exists tw_notice_write on public.tw_assignment;
create trigger tw_notice_write after insert or delete or update of person, day, shift on public.tw_assignment for each row execute function public.tw_notice_write();

-- the purge after 12 months takes the notices too
create or replace function public.tw_purge_old() returns int language plpgsql security definer set search_path = public as $$
declare cut date := (current_date - interval '12 months')::date; n int := 0; k int;
begin
  delete from public.tw_option where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_other where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_submission where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_swap where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_build_log where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_notice where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  if to_regclass('public.tw_mail_log') is not null then execute 'delete from public.tw_mail_log where period + 13 < $1' using cut; get diagnostics k = row_count; n := n + k; end if;
  return n;
end $$;
revoke all on function public.tw_purge_old() from public, anon, authenticated;

insert into public.schema_migrations(version) values ('scheduling-v82') on conflict (version) do nothing;
select 'scheduling_v82' as part, 'ok' as result,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tw_notice') as rules,
       (select count(*) from pg_trigger where tgname = 'tw_notice_write') as trigger;


-- ======== scheduling-v83.sql ========
-- ================================================================
-- Scheduling, part 83 — STAGE 1: THE ORGANISATION'S SETTINGS IN THE DATABASE. Run in the SQL Editor of the product's database,
-- after scheduling-v82.sql. Safe to run again. (Guy 2026-11-17, block 1 of the weekly plan; spec: reports\2026-11-17_stage1-settings_report.md)
-- Until now the shifts, how many people each needs and the rules were written inside the site's code, for one institution.
-- From here they are rows in the database, one set per organisation:
--   * houses: every organisation has a main house (more can be added later); a person may belong to more than one house;
--   * a settings VERSION per organisation, "valid from" a period start: a schedule is read with the version of its time, so an old
--     schedule keeps the rules it was built with (Guy: ask "from the next period / also the open one" at every change);
--   * shifts per day type (weekday, Friday, Saturday, holiday eve, holiday) and house: name, hours (may end on a later day), what it
--     counts in the quota, paid hours (decided at the meeting of 19.11; empty = the whole length);
--   * how many people each shift needs: a minimum + an extra place "when hands are free", per day of the week if needed, and a weekly
--     cap on the extra places per house;
--   * special days by date (a holiday changed, an event) for the whole organisation or one house, with their own needs;
--   * a fixed list of rules (hard, soft, warning) with a switch and numbers — the same list for everybody (tw_rule_catalog);
--   * Israel's holidays 2026–2028 (one calendar for all; a holiday is like Saturday, its eve like Friday);
--   * three ready templates (emergency centre, boarding / hostel, balancing home); the existing organisations get the balancing-home
--     template (the pilot), as a draft from the institution's form, corrected after the meeting of 19.11.
-- Who: every member of the organisation reads its settings; only an admin writes them. Global lists (rules, holidays, templates)
-- are read by every signed-in person and written by nobody from the site.
-- The building engine is NOT changed here (stage 2 reads these rows); tw_settings (queue, open / close days) keeps working.
-- ================================================================

do $$ begin
  if to_regprocedure('public.current_org()') is null then raise exception 'scheduling-v81.sql first'; end if;
  if to_regclass('public.tw_notice') is null then raise exception 'scheduling-v82.sql first'; end if;
end $$;

-- 1. the global lists -----------------------------------------------------------------------------------------------------
create table if not exists public.tw_rule_catalog (
  key text primary key,
  kind text not null check (kind in ('hard', 'soft', 'warn')),
  label text not null,                       -- Hebrew, as the setup will show it
  params jsonb not null default '{}'::jsonb, -- the default numbers, for example {"hours":7}
  weight int,                                -- soft rules: how much it counts against the others
  templates text[] not null default '{}',    -- the templates in which it is on by default
  only_templates text[],                     -- shown only in these templates (the emergency centre's own rules); null = everybody
  sort int not null default 0
);
create table if not exists public.tw_holiday (
  day date primary key,
  kind text not null check (kind in ('eve', 'holiday')),
  name text not null
);
create table if not exists public.tw_template (
  key text primary key,
  name text not null,
  about text not null,
  data jsonb not null,
  sort int not null default 0
);

-- 2. the organisation's own -----------------------------------------------------------------------------------------------
create table if not exists public.tw_house (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  name text not null default 'הבית',
  is_main boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index if not exists tw_house_one_main on public.tw_house (org_id) where is_main;

create table if not exists public.tw_house_member (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  house uuid not null,
  person uuid not null,
  primary key (house, person),
  foreign key (org_id, house) references public.tw_house(org_id, id) on delete cascade,
  foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade
);

create table if not exists public.tw_cfg (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  valid_from date not null,                                        -- the first period it applies to
  template text references public.tw_template(key) on delete set null,
  cycle text not null default '2weeks' check (cycle in ('week', '2weeks', 'month')),
  open_days int not null default 10 check (open_days between 1 and 60),
  close_days int not null default 5 check (close_days between 0 and 59),
  remind_hours int not null default 24 check (remind_hours between 0 and 240),   -- the reminder, hours before the hand-in closes
  publish_days int not null default 3 check (publish_days between 0 and 30),     -- publish at least this many days before the period
  draft boolean not null default true,                             -- true until the institution confirms its numbers
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (org_id, id),
  unique (org_id, valid_from)
);

create table if not exists public.tw_cfg_house (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  cfg uuid not null,
  house uuid not null,
  extra_week_cap int not null default 2 check (extra_week_cap between 0 and 50),     -- extra places a week, at most
  primary key (cfg, house),
  foreign key (org_id, cfg) references public.tw_cfg(org_id, id) on delete cascade,
  foreign key (org_id, house) references public.tw_house(org_id, id) on delete cascade
);

create table if not exists public.tw_cfg_shift (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  cfg uuid not null,
  house uuid not null,
  day_type text not null check (day_type in ('weekday', 'fri', 'sat', 'eve', 'holiday')),
  code text not null check (code ~ '^[A-Z][A-Z0-9]{0,3}$'),        -- M, A, N, W ... (the same code on every day type = the same kind)
  name text not null,
  starts time not null,
  ends time not null,
  end_day int not null default 0 check (end_day between 0 and 3),   -- 0 = the same day, 1 = the next day ...
  weight numeric(4, 2) not null default 1 check (weight > 0),       -- what it counts in the quota (the long weekend shift: 2)
  paid_hours numeric(5, 2) check (paid_hours is null or paid_hours >= 0),   -- null = the whole length (decided at the meeting)
  sort int not null default 0,
  unique (org_id, id),
  unique (cfg, house, day_type, code),
  foreign key (org_id, cfg) references public.tw_cfg(org_id, id) on delete cascade,
  foreign key (org_id, house) references public.tw_house(org_id, id) on delete cascade,
  check (end_day > 0 or ends > starts)
);

create table if not exists public.tw_cfg_need (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  shift uuid not null,
  dow int not null default -1 check (dow between -1 and 6),        -- -1 = every day of this type; 0..6 = only this weekday
  min_people int not null default 1 check (min_people between 0 and 50),
  extra int not null default 0 check (extra between 0 and 20),     -- places "when hands are free"
  primary key (shift, dow),
  foreign key (org_id, shift) references public.tw_cfg_shift(org_id, id) on delete cascade
);

create table if not exists public.tw_cfg_rule (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  cfg uuid not null,
  rule text not null references public.tw_rule_catalog(key),
  is_on boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  weight int,
  primary key (cfg, rule),
  foreign key (org_id, cfg) references public.tw_cfg(org_id, id) on delete cascade
);

create table if not exists public.tw_special_day (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  house uuid,                                                       -- null = the whole organisation
  day date not null,
  day_type text check (day_type in ('weekday', 'fri', 'sat', 'eve', 'holiday')),   -- null = the usual type, only the needs change
  note text,
  unique (org_id, id),
  foreign key (org_id, house) references public.tw_house(org_id, id) on delete cascade
);
create unique index if not exists tw_special_day_one on public.tw_special_day (org_id, coalesce(house, '00000000-0000-0000-0000-000000000000'::uuid), day);

create table if not exists public.tw_special_need (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  special uuid not null,
  code text not null,
  min_people int not null default 1 check (min_people between 0 and 50),
  extra int not null default 0 check (extra between 0 and 20),
  primary key (special, code),
  foreign key (org_id, special) references public.tw_special_day(org_id, id) on delete cascade
);

create index if not exists tw_cfg_shift_cfg_idx on public.tw_cfg_shift (org_id, cfg, house, day_type);
create index if not exists tw_special_day_day_idx on public.tw_special_day (org_id, day);

-- 3. rights ---------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tw_rule_catalog', 'tw_holiday', 'tw_template'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['tw_house', 'tw_house_member', 'tw_cfg', 'tw_cfg_house', 'tw_cfg_shift', 'tw_cfg_need', 'tw_cfg_rule', 'tw_special_day', 'tw_special_need'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "org only" on public.%I', t);
    execute format('create policy "org only" on public.%I as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()))', t);
    execute format('drop policy if exists "settings read" on public.%I', t);
    execute format('create policy "settings read" on public.%I for select to authenticated using ((select public.tw_member()))', t);
    execute format('drop policy if exists "settings admin" on public.%I', t);
    execute format('create policy "settings admin" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- 4. reading helpers ------------------------------------------------------------------------------------------------------
-- the settings version of a period (the newest one that already applies on its first day)
create or replace function public.tw_cfg_for(p_day date) returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.tw_cfg c where c.org_id = public.current_org() and c.valid_from <= p_day order by c.valid_from desc limit 1
$$;
-- the main house of the organisation
create or replace function public.tw_main_house() returns uuid language sql stable security definer set search_path = public as $$
  select h.id from public.tw_house h where h.org_id = public.current_org() and h.is_main limit 1
$$;
-- the type of a day: a special day of the house, then of the whole organisation, then Israel's holidays, then the weekday
create or replace function public.tw_day_type(p_day date, p_house uuid default null) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.day_type from public.tw_special_day s where s.org_id = public.current_org() and s.day = p_day and p_house is not null and s.house = p_house and s.day_type is not null),
    (select s.day_type from public.tw_special_day s where s.org_id = public.current_org() and s.day = p_day and s.house is null and s.day_type is not null),
    (select h.kind from public.tw_holiday h where h.day = p_day),
    case extract(dow from p_day)::int when 5 then 'fri' when 6 then 'sat' else 'weekday' end)
$$;
revoke all on function public.tw_cfg_for(date), public.tw_main_house(), public.tw_day_type(date, uuid) from public, anon;
grant execute on function public.tw_cfg_for(date), public.tw_main_house(), public.tw_day_type(date, uuid) to authenticated;

-- 5. writing helpers (admin) ----------------------------------------------------------------------------------------------
-- (inside: the organisation is given; from the site: current_org(), and only an admin)
create or replace function public.tw_house_ensure_main(p_org uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from public.tw_house where org_id = p_org and is_main;
  if h is null then insert into public.tw_house(org_id, name, is_main) values (p_org, 'הבית', true) returning id into h; end if;
  insert into public.tw_house_member(org_id, house, person) select p_org, h, p.id from public.tw_people p where p.org_id = p_org on conflict do nothing;
  return h;
end $$;
revoke all on function public.tw_house_ensure_main(uuid) from public, anon, authenticated;

-- a template's settings as a new version of an organisation (p_valid_from = the first period it applies to)
create or replace function public.tw_cfg_from_template(p_org uuid, p_template text, p_valid_from date, p_draft boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare t jsonb; c uuid; h uuid; s jsonb; n jsonb; sid uuid; r record; dt text;
begin
  select data into t from public.tw_template where key = p_template;
  if t is null then raise exception 'אין תבנית בשם %', p_template; end if;
  if exists (select 1 from public.tw_cfg where org_id = p_org and valid_from = p_valid_from) then raise exception 'כבר יש הגדרות שחלות מ-%', p_valid_from; end if;
  h := public.tw_house_ensure_main(p_org);
  insert into public.tw_cfg(org_id, valid_from, template, cycle, open_days, close_days, remind_hours, publish_days, draft, created_by)
    values (p_org, p_valid_from, p_template, coalesce(t->>'cycle', '2weeks'), coalesce((t->>'open_days')::int, 10), coalesce((t->>'close_days')::int, 5),
            coalesce((t->>'remind_hours')::int, 24), coalesce((t->>'publish_days')::int, 3), p_draft, auth.uid())
    returning id into c;
  insert into public.tw_cfg_house(org_id, cfg, house, extra_week_cap) values (p_org, c, h, coalesce((t->>'extra_week_cap')::int, 2));
  -- shifts: each entry lists the day types it is on ("days"), the same shift on each of them
  for s in select * from jsonb_array_elements(t->'shifts') loop
    for dt in select jsonb_array_elements_text(s->'days') loop
      insert into public.tw_cfg_shift(org_id, cfg, house, day_type, code, name, starts, ends, end_day, weight, paid_hours, sort)
        values (p_org, c, h, dt, s->>'code', s->>'name', (s->>'starts')::time, (s->>'ends')::time, coalesce((s->>'end_day')::int, 0),
                coalesce((s->>'weight')::numeric, 1), nullif(s->>'paid_hours', '')::numeric, coalesce((s->>'sort')::int, 0))
        returning id into sid;
      for n in select * from jsonb_array_elements(coalesce(s->'needs', '[{"dow":-1,"min":1}]'::jsonb)) loop
        insert into public.tw_cfg_need(org_id, shift, dow, min_people, extra)
          values (p_org, sid, coalesce((n->>'dow')::int, -1), coalesce((n->>'min')::int, 1), coalesce((n->>'extra')::int, 0));
      end loop;
    end loop;
  end loop;
  -- rules: every rule of the list that this template may show; on as the list says for this template; numbers from the template if given
  for r in select * from public.tw_rule_catalog k where k.only_templates is null or p_template = any(k.only_templates) loop
    insert into public.tw_cfg_rule(org_id, cfg, rule, is_on, params, weight)
      values (p_org, c, r.key, p_template = any(r.templates), r.params || coalesce(t->'rules'->r.key, '{}'::jsonb), r.weight);
  end loop;
  return c;
end $$;
revoke all on function public.tw_cfg_from_template(uuid, text, date, boolean) from public, anon, authenticated;

-- the admin: start the organisation's settings from a template (only when it has none yet; the setup flow, stage 3, will call it)
create or replace function public.tw_cfg_start(p_template text) returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid := public.current_org();
begin
  if o is null or not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.tw_cfg where org_id = o) then raise exception 'למוסד כבר יש הגדרות'; end if;
  return public.tw_cfg_from_template(o, p_template, date '2000-01-02', true);
end $$;

-- the admin: a new version from a period on, copied from the one in force then (later changes are made on the copy)
create or replace function public.tw_cfg_new_version(p_valid_from date) returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid := public.current_org(); src uuid; c uuid; r record; sid uuid;
begin
  if o is null or not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_valid_from is null then raise exception 'from which period?'; end if;
  if exists (select 1 from public.tw_cfg where org_id = o and valid_from = p_valid_from) then
    return (select id from public.tw_cfg where org_id = o and valid_from = p_valid_from);
  end if;
  src := public.tw_cfg_for(p_valid_from);
  if src is null then raise exception 'אין הגדרות להעתיק'; end if;
  insert into public.tw_cfg(org_id, valid_from, template, cycle, open_days, close_days, remind_hours, publish_days, draft, note, created_by)
    select o, p_valid_from, template, cycle, open_days, close_days, remind_hours, publish_days, draft, note, auth.uid() from public.tw_cfg where id = src
    returning id into c;
  insert into public.tw_cfg_house(org_id, cfg, house, extra_week_cap) select o, c, house, extra_week_cap from public.tw_cfg_house where cfg = src;
  insert into public.tw_cfg_rule(org_id, cfg, rule, is_on, params, weight) select o, c, rule, is_on, params, weight from public.tw_cfg_rule where cfg = src;
  for r in select * from public.tw_cfg_shift where cfg = src loop
    insert into public.tw_cfg_shift(org_id, cfg, house, day_type, code, name, starts, ends, end_day, weight, paid_hours, sort)
      values (o, c, r.house, r.day_type, r.code, r.name, r.starts, r.ends, r.end_day, r.weight, r.paid_hours, r.sort) returning id into sid;
    insert into public.tw_cfg_need(org_id, shift, dow, min_people, extra) select o, sid, dow, min_people, extra from public.tw_cfg_need where shift = r.id;
  end loop;
  return c;
end $$;
revoke all on function public.tw_cfg_start(text), public.tw_cfg_new_version(date) from public, anon;
grant execute on function public.tw_cfg_start(text), public.tw_cfg_new_version(date) to authenticated;

-- everything one screen needs, in one answer: the version of a day, its houses, shifts with needs, rules, special days, holidays
create or replace function public.tw_cfg_view(p_day date default current_date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o uuid := public.current_org(); c uuid;
begin
  if o is null or not public.tw_member() then return null; end if;
  c := public.tw_cfg_for(p_day);
  if c is null then return jsonb_build_object('cfg', null); end if;
  return jsonb_build_object(
    'cfg', (select to_jsonb(x) - 'org_id' - 'created_by' from public.tw_cfg x where x.id = c),
    'versions', (select jsonb_agg(jsonb_build_object('id', v.id, 'valid_from', v.valid_from, 'draft', v.draft) order by v.valid_from) from public.tw_cfg v where v.org_id = o),
    'houses', (select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'main', h.is_main,
                 'extra_week_cap', (select ch.extra_week_cap from public.tw_cfg_house ch where ch.cfg = c and ch.house = h.id),
                 'people', (select count(*) from public.tw_house_member m join public.tw_people p on p.id = m.person where m.house = h.id and p.active)) order by h.is_main desc, h.sort, h.name)
               from public.tw_house h where h.org_id = o),
    'shifts', (select jsonb_agg(jsonb_build_object('house', s.house, 'day_type', s.day_type, 'code', s.code, 'name', s.name,
                 'starts', to_char(s.starts, 'HH24:MI'), 'ends', to_char(s.ends, 'HH24:MI'), 'end_day', s.end_day, 'weight', s.weight, 'paid_hours', s.paid_hours,
                 'needs', (select jsonb_agg(jsonb_build_object('dow', n.dow, 'min', n.min_people, 'extra', n.extra) order by n.dow) from public.tw_cfg_need n where n.shift = s.id))
                 order by s.house, array_position(array['weekday', 'fri', 'sat', 'eve', 'holiday'], s.day_type), s.sort, s.starts)
               from public.tw_cfg_shift s where s.cfg = c),
    'rules', (select jsonb_agg(jsonb_build_object('key', k.key, 'kind', k.kind, 'label', k.label, 'on', r.is_on, 'params', r.params, 'weight', r.weight)
                 order by array_position(array['hard', 'soft', 'warn'], k.kind), k.sort)
              from public.tw_cfg_rule r join public.tw_rule_catalog k on k.key = r.rule where r.cfg = c),
    'special', (select jsonb_agg(jsonb_build_object('day', d.day, 'house', d.house, 'day_type', d.day_type, 'note', d.note,
                  'needs', (select jsonb_agg(jsonb_build_object('code', n.code, 'min', n.min_people, 'extra', n.extra)) from public.tw_special_need n where n.special = d.id)) order by d.day)
                from public.tw_special_day d where d.org_id = o and d.day >= p_day - 31),
    'holidays', (select jsonb_agg(jsonb_build_object('day', h.day, 'kind', h.kind, 'name', h.name) order by h.day)
                 from public.tw_holiday h where h.day between p_day - 7 and p_day + 400));
end $$;
revoke all on function public.tw_cfg_view(date) from public, anon;
grant execute on function public.tw_cfg_view(date) to authenticated;

-- a new organisation gets its main house at once; a new person joins the main house
create or replace function public.tw_org_new_house() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.tw_house_ensure_main(new.id); return null; end $$;
drop trigger if exists tw_org_new_house on public.org;
create trigger tw_org_new_house after insert on public.org for each row execute function public.tw_org_new_house();
create or replace function public.tw_person_main_house() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tw_house_member(org_id, house, person)
    select new.org_id, h.id, new.id from public.tw_house h where h.org_id = new.org_id and h.is_main on conflict do nothing;
  return null;
end $$;
drop trigger if exists tw_person_main_house on public.tw_people;
create trigger tw_person_main_house after insert on public.tw_people for each row execute function public.tw_person_main_house();
revoke all on function public.tw_org_new_house(), public.tw_person_main_house() from public, anon, authenticated;

-- 6. the fixed rule list (Albert 17.11; the final list is decided at the meeting of 19.11 — the numbers here are the proposal) -------
insert into public.tw_rule_catalog(key, kind, label, params, weight, templates, only_templates, sort) values
  ('rest_hours',        'hard', 'מנוחה מינימלית בין משמרות',                         '{"hours":7}',                 null, '{emergency,boarding,balancing}', null, 1),
  ('rest_after_long',   'hard', 'מנוחה אחרי משמרת ארוכה',                            '{"hours":8,"long_from":11}',  null, '{emergency,boarding,balancing}', null, 2),
  ('one_per_day',       'hard', 'משמרת אחת ביום',                                    '{}',                          null, '{emergency,boarding,balancing}', null, 3),
  ('max_days_row',      'hard', 'לכל היותר ימים ברצף',                               '{"days":11}',                 null, '{emergency,boarding,balancing}', null, 4),
  ('max_month',         'hard', 'לכל היותר משמרות בחודש',                            '{"shifts":27}',               null, '{emergency,boarding,balancing}', null, 5),
  ('max_nights_week',   'hard', 'לכל היותר לילות בשבוע',                             '{"nights":2}',                null, '{emergency,boarding,balancing}', null, 6),
  ('two_nights_people', 'hard', 'כמה עובדים בשבוע מקבלים את המספר המרבי של לילות',   '{"people":2}',                null, '{boarding,balancing}',           null, 7),
  ('week_flex',         'hard', 'גמישות שבועית במכסה',                               '{"over":1}',                  null, '{emergency,boarding,balancing}', null, 8),
  ('personal_min',      'soft', 'מינימום אישי',                                      '{"midweek":2,"nights":1,"weekends":4}', 5, '{emergency}',         null, 9),
  ('yes_before_can',    'soft', 'קודם "כן", ורק אחר כך "אפשרי"',                     '{}',                          8,    '{emergency,boarding,balancing}', null, 10),
  ('fixed_first',       'soft', 'משמרת קבועה מקבלת עדיפות',                          '{}',                          9,    '{emergency,boarding,balancing}', null, 11),
  ('balance_kinds',     'soft', 'איזון בין סוגי המשמרות',                            '{"gap":2}',                   4,    '{boarding,balancing}',           null, 12),
  ('fair_rotation',     'soft', 'סבב הוגן של לילות ושבתות',                          '{"periods":3}',               4,    '{emergency,boarding,balancing}', null, 13),
  ('day_night_balance', 'soft', 'איזון יום ולילה בין השבועות',                       '{}',                          3,    '{boarding,balancing}',           null, 14),
  ('options_factor',    'warn', 'בהגשה: לפחות פי X אופציות מהמכסה',                 '{"factor":2}',                null, '{boarding,balancing}',           null, 15),
  ('day_buddy',         'soft', 'עמיתה למשמרות יום',                                 '{}',                          3,    '{emergency}', '{emergency}', 16),
  ('one_of_weekends',   'hard', '"רק אחד מסופי השבוע האלה"',                         '{}',                          null, '{emergency}', '{emergency}', 17),
  ('service_mon_wed',   'hard', 'בנות שירות: שני עד רביעי',                          '{}',                          null, '{emergency}', '{emergency}', 18),
  ('weekend_oncall',    'hard', 'כוננות סוף שבוע',                                   '{}',                          null, '{emergency}', '{emergency}', 19)
on conflict (key) do update set kind = excluded.kind, label = excluded.label, params = excluded.params, weight = excluded.weight,
  templates = excluded.templates, only_templates = excluded.only_templates, sort = excluded.sort;

-- 7. Israel's holidays 2026–2028 (a holiday = like Saturday, its eve = like Friday). To check against the official calendar. -----
insert into public.tw_holiday(day, kind, name) values
  ('2026-04-01', 'eve', 'ערב פסח'), ('2026-04-02', 'holiday', 'פסח'), ('2026-04-07', 'eve', 'ערב שביעי של פסח'), ('2026-04-08', 'holiday', 'שביעי של פסח'),
  ('2026-04-21', 'eve', 'ערב יום העצמאות'), ('2026-04-22', 'holiday', 'יום העצמאות'), ('2026-05-21', 'eve', 'ערב שבועות'), ('2026-05-22', 'holiday', 'שבועות'),
  ('2026-09-11', 'eve', 'ערב ראש השנה'), ('2026-09-12', 'holiday', 'ראש השנה'), ('2026-09-13', 'holiday', 'ראש השנה'), ('2026-09-20', 'eve', 'ערב יום כיפור'),
  ('2026-09-21', 'holiday', 'יום כיפור'), ('2026-09-25', 'eve', 'ערב סוכות'), ('2026-09-26', 'holiday', 'סוכות'), ('2026-10-02', 'eve', 'ערב שמיני עצרת'),
  ('2026-10-03', 'holiday', 'שמיני עצרת'),
  ('2027-04-21', 'eve', 'ערב פסח'), ('2027-04-22', 'holiday', 'פסח'), ('2027-04-27', 'eve', 'ערב שביעי של פסח'), ('2027-04-28', 'holiday', 'שביעי של פסח'),
  ('2027-05-11', 'eve', 'ערב יום העצמאות'), ('2027-05-12', 'holiday', 'יום העצמאות'), ('2027-06-10', 'eve', 'ערב שבועות'), ('2027-06-11', 'holiday', 'שבועות'),
  ('2027-10-01', 'eve', 'ערב ראש השנה'), ('2027-10-02', 'holiday', 'ראש השנה'), ('2027-10-03', 'holiday', 'ראש השנה'), ('2027-10-10', 'eve', 'ערב יום כיפור'),
  ('2027-10-11', 'holiday', 'יום כיפור'), ('2027-10-15', 'eve', 'ערב סוכות'), ('2027-10-16', 'holiday', 'סוכות'), ('2027-10-22', 'eve', 'ערב שמיני עצרת'),
  ('2027-10-23', 'holiday', 'שמיני עצרת'),
  ('2028-04-10', 'eve', 'ערב פסח'), ('2028-04-11', 'holiday', 'פסח'), ('2028-04-16', 'eve', 'ערב שביעי של פסח'), ('2028-04-17', 'holiday', 'שביעי של פסח'),
  ('2028-05-01', 'eve', 'ערב יום העצמאות'), ('2028-05-02', 'holiday', 'יום העצמאות'), ('2028-05-30', 'eve', 'ערב שבועות'), ('2028-05-31', 'holiday', 'שבועות'),
  ('2028-09-20', 'eve', 'ערב ראש השנה'), ('2028-09-21', 'holiday', 'ראש השנה'), ('2028-09-22', 'holiday', 'ראש השנה'), ('2028-09-29', 'eve', 'ערב יום כיפור'),
  ('2028-09-30', 'holiday', 'יום כיפור'), ('2028-10-04', 'eve', 'ערב סוכות'), ('2028-10-05', 'holiday', 'סוכות'), ('2028-10-11', 'eve', 'ערב שמיני עצרת'),
  ('2028-10-12', 'holiday', 'שמיני עצרת')
on conflict (day) do update set kind = excluded.kind, name = excluded.name;

-- 8. the three templates (drafts; the balancing home = the pilot, from the institution's form; to correct after 19.11) -------
insert into public.tw_template(key, name, about, sort, data) values
('balancing', 'בית מאזן', 'סידור לשבועיים. בוקר, צהריים ולילה בימי חול; בשישי בוקר קצר ומשמרת סוף שבוע ארוכה עד מוצאי שבת; כל עובד פותח פי 2 אופציות, ומישהו מהצוות בונה.', 1,
 '{"cycle":"2weeks","open_days":10,"close_days":5,"remind_hours":24,"publish_days":3,"extra_week_cap":2,
   "shifts":[
     {"code":"M","name":"בוקר","days":["weekday"],"starts":"07:30","ends":"15:30","sort":1,"needs":[{"dow":-1,"min":2,"extra":1},{"dow":2,"min":3,"extra":0}]},
     {"code":"A","name":"צהריים","days":["weekday"],"starts":"15:00","ends":"23:00","sort":2,"needs":[{"dow":-1,"min":2,"extra":1}]},
     {"code":"N","name":"לילה","days":["weekday"],"starts":"22:30","ends":"08:00","end_day":1,"sort":3,"needs":[{"dow":-1,"min":2}]},
     {"code":"M","name":"בוקר","days":["fri","eve"],"starts":"07:30","ends":"14:30","sort":1,"needs":[{"dow":-1,"min":1}]},
     {"code":"W","name":"סוף שבוע","days":["fri","eve"],"starts":"14:00","ends":"20:30","end_day":1,"weight":2,"sort":2,"needs":[{"dow":-1,"min":2}]},
     {"code":"N","name":"לילה","days":["sat","holiday"],"starts":"20:30","ends":"08:00","end_day":1,"sort":3,"needs":[{"dow":-1,"min":2}]}
   ]}'::jsonb),
('boarding', 'פנימייה / הוסטל', 'כמו בית מאזן: סידור לשבועיים, אופציות פי 2, ומישהו מהצוות בונה. טיוטה: השעות והמספרים ישתנו לפי המוסד.', 2,
 '{"cycle":"2weeks","open_days":10,"close_days":5,"remind_hours":24,"publish_days":3,"extra_week_cap":2,
   "shifts":[
     {"code":"M","name":"בוקר","days":["weekday"],"starts":"07:00","ends":"15:00","sort":1,"needs":[{"dow":-1,"min":2,"extra":1}]},
     {"code":"A","name":"צהריים","days":["weekday"],"starts":"14:30","ends":"22:30","sort":2,"needs":[{"dow":-1,"min":2,"extra":1}]},
     {"code":"N","name":"לילה","days":["weekday"],"starts":"22:00","ends":"07:30","end_day":1,"sort":3,"needs":[{"dow":-1,"min":1}]},
     {"code":"M","name":"בוקר","days":["fri","eve"],"starts":"07:00","ends":"14:00","sort":1,"needs":[{"dow":-1,"min":1}]},
     {"code":"W","name":"סוף שבוע","days":["fri","eve"],"starts":"13:30","ends":"21:00","end_day":1,"weight":2,"sort":2,"needs":[{"dow":-1,"min":2}]},
     {"code":"N","name":"לילה","days":["sat","holiday"],"starts":"21:00","ends":"07:30","end_day":1,"sort":3,"needs":[{"dow":-1,"min":1}]}
   ]}'::jsonb),
('emergency', 'מרכז חירום', 'סידור חודשי. בוקר, צהריים ולילה כל יום, וסופ"ש ארוך משישי בצהריים עד שבת בערב; אחמ"ש בכל משמרת; רכזת בונה. טיוטה לפי הרמזור.', 3,
 '{"cycle":"month","open_days":20,"close_days":10,"remind_hours":48,"publish_days":5,"extra_week_cap":3,
   "rules":{"rest_hours":{"hours":7}},
   "shifts":[
     {"code":"M","name":"בוקר","days":["weekday","fri","sat","eve","holiday"],"starts":"07:00","ends":"15:00","sort":1,"needs":[{"dow":-1,"min":3,"extra":1}]},
     {"code":"A","name":"צהריים","days":["weekday"],"starts":"14:00","ends":"22:00","sort":2,"needs":[{"dow":-1,"min":3,"extra":1}]},
     {"code":"N","name":"לילה","days":["weekday","fri","sat","eve","holiday"],"starts":"22:00","ends":"08:00","end_day":1,"sort":4,"needs":[{"dow":-1,"min":2}]},
     {"code":"L","name":"סופ\"ש ארוך","days":["fri","eve"],"starts":"14:00","ends":"22:00","end_day":1,"weight":1,"sort":3,"needs":[{"dow":-1,"min":2}]},
     {"code":"A","name":"צהריים","days":["sat","holiday"],"starts":"14:00","ends":"22:00","sort":2,"needs":[{"dow":-1,"min":1}]}
   ]}'::jsonb)
on conflict (key) do update set name = excluded.name, about = excluded.about, data = excluded.data, sort = excluded.sort;

-- 9. the organisations that are here: a main house, and the pilot's settings (balancing home) as a draft from the start ------
do $$
declare g record;
begin
  for g in select id from public.org loop
    perform public.tw_house_ensure_main(g.id);
    if not exists (select 1 from public.tw_cfg where org_id = g.id) then
      perform public.tw_cfg_from_template(g.id, 'balancing', date '2000-01-02', true);
    end if;
  end loop;
end $$;

-- 10. the 12-month purge keeps the settings (they are not personal); nothing to add there.
insert into public.schema_migrations(version) values ('scheduling-v83') on conflict (version) do nothing;
select 'scheduling_v83' as part, 'ok' as result,
       (select count(*) from public.tw_house where is_main) as main_houses,
       (select count(*) from public.tw_cfg) as settings_versions,
       (select count(*) from public.tw_cfg_shift) as shifts,
       (select count(*) from public.tw_rule_catalog) as rules_in_list,
       (select count(*) from public.tw_holiday) as holidays,
       (select count(*) from public.tw_template) as templates;


select 'test project set up' as result, (select count(*) from public.tw_people) as people, (select count(*) from public.org) as orgs, (select count(*) from public.tw_cfg) as settings_versions, (select count(*) from public.staff_private where auth_user_id is not null) as admins_linked;
