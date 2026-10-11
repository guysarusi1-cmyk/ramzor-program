-- ================================================================
-- Scheduling, part 15 — run in the SQL Editor after scheduling-v14.sql. Safe to run again.
--   * the Ramzor with the personal sign-in: an active instructor / coordinator / admin signed in personally is "staff" for the Ramzor data
--     (the shared staff password keeps working as before)
--   * roles: admin (Guy) — a person of its own kind, with every coordinator right, who gets none of the coordinators' notices;
--     ahmash = anyone with an ahmash rank (1 or 2); "control" = ahmash, coordinator or admin
--   * the ahmash control: today's changes of who is shown on the kids' TV, the daily timetable (today's and the fixed one of each weekday),
--     the bonuses of the day (a bonus hidden for today, a special bonus with hours), and a log of all of it
--   * what the kids' TV may read (without signing in): who is on shift today, today's timetable, today's bonus changes
-- ================================================================

-- ---------- roles ----------
alter table public.staff drop constraint if exists staff_kind_check;
alter table public.staff add constraint staff_kind_check check (kind in ('instructor', 'service', 'teacher', 'coordinator', 'admin'));

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() and s.active and s.kind = 'admin')
$$;
create or replace function public.is_coordinator() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_manager(), false) or exists (
    select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
    where p.auth_user_id = auth.uid() and s.kind in ('coordinator', 'admin') and s.active)
$$;
create or replace function public.is_ahmash() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() and s.active and p.ahmash_rank > 0)
$$;
create or replace function public.can_control() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_ahmash() or public.is_coordinator()
$$;
-- the Ramzor data: the two shared logins as before, plus anybody active who signed in personally as an instructor, a coordinator or the admin
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('staff@merkaz-cherum.local', 'manager@merkaz-cherum.local')
      or exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and s.active and s.kind in ('instructor', 'coordinator', 'admin'))
$$;
revoke all on function public.is_admin(), public.is_ahmash(), public.can_control() from public, anon;
grant execute on function public.is_admin(), public.is_ahmash(), public.can_control() to authenticated;

-- the person's own flags, now with the roles (nothing about anybody else)
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('female', p.female, 'no_nights', p.no_nights, 'only_long', p.only_long_weekend, 'manual_only', p.manual_only, 'latest_end', p.latest_end_hour,
                            'kind', s.kind, 'ahmash', p.ahmash_rank, 'admin', s.kind = 'admin', 'control', public.can_control())
  from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = public.my_staff_id()
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- the coordinator and the admin may change the bonus lists (until now only the manager login could)
drop policy if exists "coordinator bonus lists"   on public.mini_lists;
drop policy if exists "coordinator bonus lists 2" on public.mini_lists;
create policy "coordinator bonus lists"   on public.mini_lists for insert to authenticated with check (public.is_coordinator() and key in ('bonusesDaily', 'bonusesWeekly'));
create policy "coordinator bonus lists 2" on public.mini_lists for update to authenticated using (public.is_coordinator() and key in ('bonusesDaily', 'bonusesWeekly')) with check (public.is_coordinator() and key in ('bonusesDaily', 'bonusesWeekly'));

-- ---------- the ahmash control ----------
-- who the kids' TV shows TODAY: somebody taken off a shift, or added to it (only the TV; the real schedule does not change)
create table if not exists public.tv_day_changes (
  day      date not null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  shift    text not null check (shift in ('M', 'A', 'N')),
  action   text not null check (action in ('add', 'remove')),
  by_staff uuid references public.staff(id) on delete set null,
  at       timestamptz not null default now(),
  primary key (day, staff_id, shift)
);
-- the daily timetable: the fixed one of every weekday (0 = Sunday ... 6 = Saturday), and the one of a given day (when it was changed)
-- items: [{ "t": "08:00", "n": "ארוחת בוקר", "i": "breakfast" }, ...]
create table if not exists public.timetable_fixed (
  weekday    smallint primary key check (weekday between 0 and 6),
  items      jsonb not null default '[]',
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.timetable_day (
  day        date primary key,
  items      jsonb not null default '[]',
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- the bonuses of one day: a bonus of the lists hidden for that day, or a special bonus for some hours of that day
create table if not exists public.bonus_day (
  id        uuid primary key default gen_random_uuid(),
  day       date not null,
  kind      text not null check (kind in ('hide', 'special')),
  bonus_id  text,
  name      text,
  from_time time,
  to_time   time,
  icon      text,
  by_staff  uuid references public.staff(id) on delete set null,
  at        timestamptz not null default now(),
  check (kind = 'hide' and bonus_id is not null or kind = 'special' and name is not null)
);
create index if not exists bonus_day_day on public.bonus_day (day);
-- what was changed in the control, by whom (written by the database itself)
create table if not exists public.control_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  by_staff uuid references public.staff(id) on delete set null,
  what     text not null,
  detail   jsonb
);

alter table public.tv_day_changes  enable row level security;
alter table public.timetable_fixed enable row level security;
alter table public.timetable_day   enable row level security;
alter table public.bonus_day       enable row level security;
alter table public.control_log     enable row level security;
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('tv_day_changes', 'timetable_fixed', 'timetable_day', 'bonus_day', 'control_log') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
create policy "control reads"    on public.tv_day_changes  for select to authenticated using (public.can_control());
create policy "control changes"  on public.tv_day_changes  for all    to authenticated using (public.can_control()) with check (public.can_control());
create policy "staff reads"      on public.timetable_fixed for select to authenticated using (public.is_staff() or public.is_personal());
create policy "fixed: coordinator" on public.timetable_fixed for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
create policy "staff reads"      on public.timetable_day   for select to authenticated using (public.is_staff() or public.is_personal());
create policy "day: control"     on public.timetable_day   for all    to authenticated using (public.can_control()) with check (public.can_control());
create policy "everybody reads"  on public.bonus_day       for select to anon, authenticated using (true);          -- (nothing private: the names of the bonuses; the TV and the staff phones show them)
create policy "control changes"  on public.bonus_day       for all    to authenticated using (public.can_control()) with check (public.can_control());
create policy "control reads"    on public.control_log     for select to authenticated using (public.can_control());
grant select, insert, update, delete on public.tv_day_changes, public.timetable_fixed, public.timetable_day, public.bonus_day to authenticated;
grant select on public.bonus_day to anon;
grant select on public.control_log to authenticated;
revoke all on public.tv_day_changes, public.timetable_fixed, public.timetable_day, public.control_log from anon;

-- the log (and who did it), filled by the database on every change of the control's tables
create or replace function public.control_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' and tg_table_name in ('tv_day_changes', 'bonus_day') then new.by_staff := coalesce(public.my_staff_id(), new.by_staff); end if;
  if tg_op <> 'DELETE' and tg_table_name in ('timetable_fixed', 'timetable_day') then new.updated_by := coalesce(public.my_staff_id(), new.updated_by); new.updated_at := now(); end if;
  insert into public.control_log (by_staff, what, detail)
    values (public.my_staff_id(), tg_table_name || ' ' || lower(tg_op), jsonb_build_object('old', case when tg_op <> 'INSERT' then to_jsonb(old) end, 'new', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists control_audit on public.tv_day_changes;
drop trigger if exists control_audit on public.timetable_fixed;
drop trigger if exists control_audit on public.timetable_day;
drop trigger if exists control_audit on public.bonus_day;
create trigger control_audit before insert or update or delete on public.tv_day_changes  for each row execute function public.control_audit();
create trigger control_audit before insert or update or delete on public.timetable_fixed for each row execute function public.control_audit();
create trigger control_audit before insert or update or delete on public.timetable_day   for each row execute function public.control_audit();
create trigger control_audit before insert or update or delete on public.bonus_day       for each row execute function public.control_audit();

-- ---------- what the kids' TV may read (without signing in) ----------
-- a name as the TV shows it: the first name; when somebody else active has the same first name, + the first letter of the family name; when that is the same too, the full name
create or replace function public.tv_label(sid uuid) returns text language sql stable security definer set search_path = public as $$
  with me as (select display_name, split_part(display_name, ' ', 1) f, left(split_part(display_name, ' ', 2), 1) l from public.staff where id = sid)
  select case
    when not exists (select 1 from public.staff o, me where o.active and o.id <> sid and split_part(o.display_name, ' ', 1) = me.f) then me.f
    when not exists (select 1 from public.staff o, me where o.active and o.id <> sid and split_part(o.display_name, ' ', 1) = me.f and left(split_part(o.display_name, ' ', 2), 1) = me.l) and me.l <> '' then me.f || ' ' || me.l
    else me.display_name end
  from me
$$;
revoke all on function public.tv_label(uuid) from public, anon;
-- who is on shift today (Israel time): the published schedule of today (and the long weekend that began yesterday), the control's changes of today,
-- and the people those changes add — first name (see tv_label), photo, gender, kind and ahmash rank only
create or replace function public.tv_shifts_today() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; sh jsonb;
begin
  select value into sh from public.sched_settings where key = 'shifts';
  return jsonb_build_object(
    'day', d,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('staff', a.staff_id, 'shift', a.shift, 'day', a.day,
                        'from', to_char(coalesce(a.from_time, (sh -> a.shift ->> 'from')::time), 'HH24:MI'), 'to', to_char(coalesce(a.to_time, (sh -> a.shift ->> 'to')::time), 'HH24:MI')))
                      from public.assignment a join public.staff s on s.id = a.staff_id join public.schedule sc on sc.month = a.month and sc.status = 'published'
                      where s.active and (a.day = d or (a.shift = 'L' and a.day = d - 1))), '[]'),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('staff', c.staff_id, 'shift', c.shift, 'action', c.action)) from public.tv_day_changes c where c.day = d), '[]'),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', public.tv_label(s.id), 'photo', s.photo_url, 'female', coalesce(p.female, true), 'kind', s.kind, 'ahmash', coalesce(p.ahmash_rank, 0)))
                        from public.staff s left join public.staff_private p on p.staff_id = s.id
                        where s.active and (s.id in (select a.staff_id from public.assignment a join public.schedule sc on sc.month = a.month and sc.status = 'published' where a.day = d or (a.shift = 'L' and a.day = d - 1))
                                            or s.id in (select c.staff_id from public.tv_day_changes c where c.day = d))), '[]'));
end $$;
-- today's timetable: the one changed for today, else the fixed one of the weekday (a holiday uses Saturday's, its eve Friday's), and the holiday's name
create or replace function public.tv_timetable_today() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; sp record; wd int; items jsonb;
begin
  select kind, label into sp from public.special_days where day = d;
  wd := case when sp.kind = 'holiday' then 6 when sp.kind = 'eve' then 5 else extract(dow from d)::int end;
  select t.items into items from public.timetable_day t where t.day = d;
  if items is null then select f.items into items from public.timetable_fixed f where f.weekday = wd; end if;
  return jsonb_build_object('day', d, 'weekday', wd, 'items', coalesce(items, '[]'), 'title', case when sp.kind in ('holiday', 'eve') then sp.label end, 'changed', exists (select 1 from public.timetable_day t where t.day = d));
end $$;
revoke all on function public.tv_shifts_today(), public.tv_timetable_today() from public;
grant execute on function public.tv_shifts_today(), public.tv_timetable_today() to anon, authenticated;

select 'scheduling_v15' as part, 'ok' as result;
