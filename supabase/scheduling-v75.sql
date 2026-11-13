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
