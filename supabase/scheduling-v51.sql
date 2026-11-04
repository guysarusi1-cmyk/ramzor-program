-- ================================================================
-- Scheduling, part 51 — run in the SQL Editor after scheduling-v50.sql. Safe to run again. (Guy 2026-11-03)
-- "יומן הילדים": the technical diary of the social workers (the therapists) — calls, meetings and outings of the children in
-- their care; no therapeutic text. The spec: Mercury-Work-Manager plans/SOCIAL-WORKERS-URGENT-SPEC.md.
--   * a child's responsible therapist (child_therapist) and the admin see and change it; nobody else (no sharing with the
--     coordinator or the instructors in this version) — enforced here
--   * times are optional; an outing has an expected return
--   * repeating: every N weeks on the same weekday, or monthly on a relative weekday (the first / second … / last Tuesday);
--     "רק הפעם" = one changed or cancelled occurrence (child_diary_skip + a single event); "מהיום והלאה" = the old series ends,
--     a new one starts — the past is never rewritten
-- ================================================================

create or replace function public.can_diary_child(p_child text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false) or (coalesce(public.is_therapist(), false)
    and exists (select 1 from public.child_therapist t where t.child_id = p_child and t.staff_id = public.my_staff_id()))
$$;
revoke all on function public.can_diary_child(text) from public, anon;
grant execute on function public.can_diary_child(text) to authenticated;

create table if not exists public.child_diary (
  id          uuid primary key default gen_random_uuid(),
  child_id    text not null,
  kind        text not null check (kind in ('call', 'meeting', 'outing')),
  day         date not null,                              -- the first day (of a series: its start)
  start_time  time,
  end_time    time,
  with_whom   text check (with_whom is null or length(with_whom) <= 120),
  place       text check (place is null or length(place) <= 120),
  note        text check (note is null or length(note) <= 300),          -- technical only
  return_day  date,                                       -- an outing: the expected return
  return_time time,
  every_weeks smallint check (every_weeks is null or every_weeks between 1 and 12),          -- every N weeks, the weekday of "day"
  monthly_nth smallint check (monthly_nth is null or monthly_nth in (1, 2, 3, 4, -1)),       -- monthly: the Nth (−1 = last) weekday of "day"
  until_day   date,                                       -- a series ends (after "מהיום והלאה" the old one ends the day before)
  series_id   uuid,                                       -- the same series across "מהיום והלאה" splits and single changes
  orig_day    date,                                       -- a single changed occurrence: the day it replaced
  created_by  uuid default public.my_staff_id(),
  created_at  timestamptz not null default now(),
  updated_by  uuid default public.my_staff_id(),
  updated_at  timestamptz not null default now(),
  check (not (every_weeks is not null and monthly_nth is not null))
);
create index if not exists child_diary_child on public.child_diary (child_id, day);
create table if not exists public.child_diary_skip (          -- "רק הפעם": this occurrence of the series is not shown (a changed copy may stand in its place)
  event_id uuid not null references public.child_diary(id) on delete cascade,
  day      date not null,
  primary key (event_id, day)
);
alter table public.child_diary enable row level security;
alter table public.child_diary_skip enable row level security;
drop policy if exists "diary read" on public.child_diary;
drop policy if exists "diary add" on public.child_diary;
drop policy if exists "diary change" on public.child_diary;
drop policy if exists "diary remove" on public.child_diary;
create policy "diary read"   on public.child_diary for select to authenticated using (public.can_diary_child(child_id));
create policy "diary add"    on public.child_diary for insert to authenticated with check (public.can_diary_child(child_id));
create policy "diary change" on public.child_diary for update to authenticated using (public.can_diary_child(child_id)) with check (public.can_diary_child(child_id));
create policy "diary remove" on public.child_diary for delete to authenticated using (public.can_diary_child(child_id));
drop policy if exists "diary skip all" on public.child_diary_skip;
create policy "diary skip all" on public.child_diary_skip for all to authenticated
  using (exists (select 1 from public.child_diary e where e.id = event_id and public.can_diary_child(e.child_id)))
  with check (exists (select 1 from public.child_diary e where e.id = event_id and public.can_diary_child(e.child_id)));

select 'scheduling_v51' as part, 'ok' as result;
