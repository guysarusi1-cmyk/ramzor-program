-- ================================================================
-- Scheduling, part 50 — run in the SQL Editor after scheduling-v49.sql. Safe to run again. (Guy 2026-11-03)
-- "כוננית סוף שבוע": the social workers (the therapists) and the coordinator, one shared panel per weekend / holiday
--   * oncall_period: a weekend (key 'w:<Friday>') or a holiday range set by the admin (key 'h:<id>'), and who is the active on-call
--   * oncall_trip: arrival and return of an instructor, ONE pair per shift (Guy): taxi needed? / time / place / "המונית הוזמנה"
--   * oncall_event: the messages inside the panel for the active on-call (a change made by somebody else)
--   * the admin may let a social worker add / remove an instructor in the shifts of Thursday 22:00 – Sunday 11:00 (Guy: Thursday 22:00);
--     enforced here in the database (oncall_assign / oncall_unassign), not only by hiding buttons
-- ================================================================

-- who may open the panel: the therapists (the social workers), the coordinator and the admin
create or replace function public.can_oncall() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_coordinator(), false) or coalesce(public.is_admin(), false) or coalesce(public.is_therapist(), false)
$$;
revoke all on function public.can_oncall() from public, anon;
grant execute on function public.can_oncall() to authenticated;

alter table public.staff_settings add column if not exists oncall_assign boolean not null default false;

create table if not exists public.oncall_period (
  key          text primary key check (key ~ '^(w:\d{4}-\d{2}-\d{2}|h:[0-9a-f-]{36})$'),
  kind         text not null check (kind in ('weekend', 'holiday')),
  title        text,
  from_day     date not null,
  to_day       date not null check (to_day >= from_day),
  active_staff uuid references public.staff(id) on delete set null,
  active_since timestamptz,
  created_by   uuid default public.my_staff_id(),
  updated_at   timestamptz not null default now()
);
create table if not exists public.oncall_trip (
  period_key text not null references public.oncall_period(key) on delete cascade,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  day        date not null,
  shift      text not null check (shift in ('M', 'S', 'A', 'N', 'L')),
  dir        text not null check (dir in ('in', 'out')),
  need       text not null default 'pending' check (need in ('none', 'pending', 'need')),
  at_time    text check (at_time is null or length(at_time) <= 20),
  place      text check (place is null or length(place) <= 120),
  ordered    boolean not null default false,
  updated_by uuid default public.my_staff_id(),
  updated_at timestamptz not null default now(),
  primary key (period_key, staff_id, day, shift, dir)
);
create table if not exists public.oncall_event (
  id         uuid primary key default gen_random_uuid(),
  period_key text not null references public.oncall_period(key) on delete cascade,
  by_staff   uuid default public.my_staff_id(),
  for_staff  uuid references public.staff(id) on delete set null,          -- the active on-call at that moment (null: nobody yet — kept for whoever takes it)
  text       text not null check (length(text) between 1 and 400),
  at         timestamptz not null default now(),
  seen       boolean not null default false
);
create index if not exists oncall_event_period on public.oncall_event (period_key, at);

alter table public.oncall_period enable row level security;
alter table public.oncall_trip enable row level security;
alter table public.oncall_event enable row level security;
drop policy if exists "oncall period read" on public.oncall_period;
drop policy if exists "oncall period write" on public.oncall_period;
drop policy if exists "oncall period change" on public.oncall_period;
drop policy if exists "oncall period remove" on public.oncall_period;
create policy "oncall period read" on public.oncall_period for select to authenticated using (public.can_oncall());
create policy "oncall period write" on public.oncall_period for insert to authenticated with check (public.can_oncall() and (kind = 'weekend' or public.is_admin()));          -- (a holiday range: the admin only)
create policy "oncall period change" on public.oncall_period for update to authenticated using (public.can_oncall()) with check (public.can_oncall());
create policy "oncall period remove" on public.oncall_period for delete to authenticated using (public.is_admin());
drop policy if exists "oncall trip all" on public.oncall_trip;
create policy "oncall trip all" on public.oncall_trip for all to authenticated using (public.can_oncall()) with check (public.can_oncall());
drop policy if exists "oncall event read" on public.oncall_event;
drop policy if exists "oncall event write" on public.oncall_event;
drop policy if exists "oncall event seen" on public.oncall_event;
create policy "oncall event read" on public.oncall_event for select to authenticated using (public.can_oncall());
create policy "oncall event write" on public.oncall_event for insert to authenticated with check (public.can_oncall() and by_staff = public.my_staff_id());
create policy "oncall event seen" on public.oncall_event for update to authenticated using (public.can_oncall() and for_staff = public.my_staff_id()) with check (public.can_oncall());

-- may this person add / remove instructors in the weekend shifts? (the coordinator and the admin always; a social worker if the admin allowed it)
create or replace function public.oncall_may_assign() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_coordinator(), false) or coalesce(public.is_admin(), false)
      or (coalesce(public.is_therapist(), false) and exists (select 1 from public.staff_settings x where x.staff_id = public.my_staff_id() and x.oncall_assign))
$$;
revoke all on function public.oncall_may_assign() from public, anon;
grant execute on function public.oncall_may_assign() to authenticated;
-- the shifts of the edit window: Thursday 22:00 – Sunday 11:00, also a shift that overlaps it only partly
create or replace function public.oncall_in_window(p_day date, p_shift text) returns boolean language sql immutable as $$
  select case extract(dow from p_day)::int
    when 4 then p_shift = 'N'                 -- Thursday night (22:00–08:00)
    when 5 then true when 6 then true          -- Friday, Saturday, the long weekend
    when 0 then p_shift in ('M', 'S')          -- Sunday morning (until 11:00 at least)
    else false end
$$;
-- add an instructor to a weekend shift (a published month only; standard hours; the assignment's own triggers tell the people as always)
create or replace function public.oncall_assign(p_day date, p_shift text, p_staff uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_day)::date; nid uuid;
begin
  if not public.oncall_may_assign() then raise exception 'not allowed'; end if;
  if not public.oncall_in_window(p_day, p_shift) then raise exception 'outside the weekend window'; end if;
  if not exists (select 1 from public.schedule s where s.month = m and s.status = 'published') then raise exception 'the month is not published'; end if;
  if exists (select 1 from public.assignment a where a.staff_id = p_staff and a.day = p_day and a.shift = p_shift) then raise exception 'already there'; end if;
  insert into public.assignment (month, staff_id, day, shift, flags) values (m, p_staff, p_day, p_shift, '{manual}') returning id into nid;
  return nid;
end $$;
create or replace function public.oncall_unassign(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.assignment;
begin
  if not public.oncall_may_assign() then raise exception 'not allowed'; end if;
  select * into r from public.assignment where id = p_id;
  if not found then return; end if;
  if not public.oncall_in_window(r.day, r.shift) then raise exception 'outside the weekend window'; end if;
  delete from public.assignment where id = p_id;
end $$;
revoke all on function public.oncall_assign(date, text, uuid), public.oncall_unassign(uuid) from public, anon;
grant execute on function public.oncall_assign(date, text, uuid), public.oncall_unassign(uuid) to authenticated;
-- the admin: who of the social workers may add / remove (the admin only)
create or replace function public.set_oncall_assign(p_staff uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into public.staff_settings (staff_id, oncall_assign) values (p_staff, coalesce(p_on, false))
  on conflict (staff_id) do update set oncall_assign = excluded.oncall_assign, updated_at = now();
end $$;
revoke all on function public.set_oncall_assign(uuid, boolean) from public, anon;
grant execute on function public.set_oncall_assign(uuid, boolean) to authenticated;

-- a change of the schedule in a weekend, made by somebody who is not the active on-call: a message for her inside the panel
create or replace function public.oncall_assignment_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.assignment := coalesce(new, old); fri date; k text; act uuid; who text; w text;
begin
  if not public.oncall_in_window(r.day, r.shift) then return null; end if;
  fri := r.day + case extract(dow from r.day)::int when 4 then 1 when 5 then 0 when 6 then -1 else -2 end;          -- (the Friday of that weekend: Thursday +1, Friday 0, Saturday −1, Sunday −2)
  k := 'w:' || to_char(fri, 'YYYY-MM-DD');
  select active_staff into act from public.oncall_period where key = k;
  if act is not null and act = public.my_staff_id() then return null; end if;
  select display_name into who from public.staff where id = r.staff_id;
  w := case r.shift when 'M' then 'בוקר' when 'S' then 'בוקר קצר' when 'A' then 'צהריים' when 'N' then 'לילה' else 'סופ"ש ארוך' end;
  insert into public.oncall_period (key, kind, from_day, to_day) values (k, 'weekend', fri, fri + 1) on conflict (key) do nothing;
  insert into public.oncall_event (period_key, by_staff, for_staff, text)
    values (k, public.my_staff_id(), act, case when tg_op = 'DELETE' then 'הוסר/ה מהסידור: ' else 'נוסף/ה לסידור: ' end || coalesce(who, '?') || ' · ' || to_char(r.day, 'DD/MM') || ' ' || w);
  return null;
end $$;
drop trigger if exists assignment_oncall_event on public.assignment;
create trigger assignment_oncall_event after insert or delete on public.assignment for each row execute function public.oncall_assignment_event();

select 'scheduling_v50' as part, 'ok' as result;
