-- ================================================================
-- Scheduling, part 84 — "משימות משתנות" (the first site): END-OF-SHIFT TASKS + A TAXI FOR THE WEEKEND, from the instructors' phones.
-- Run in the SQL Editor of the Ramzor database: TEST first; live only on Guy's explicit word. Safe to run again. (Guy 2026-11-17/18)
-- 1. End-of-shift tasks: the printed list moves into the site. Areas and tasks (the coordinator / the admin edit them); one shared
--    list a day: whoever works today's afternoon shift (instructors, ahmash, service girls — by the published schedule, their own
--    hours and today's changes in the ahmash control) marks "done" until 23:30; from 21:30 the night shift sees what is still open
--    and marks until 09:00. Every mark keeps who and when; a note is optional. The coordinator / the admin see the history (3 months).
-- 2. A taxi for the weekend: an instructor (or ahmash) who works between Friday 15:00 and Saturday 20:00 (a holiday eve like
--    Friday, a holiday like Saturday) asks for a taxi each way, until Friday 10:00: the time from the schedule, the last address.
--    It is written into the on-call panel's own table (oncall_trip), so the on-call people see it at once and may change it
--    (also after 10:00). The address is seen only by the person and the on-call people. Kept two weeks (the last address stays).
-- Everything an instructor does goes through two functions that check, every time, who calls, what day and what hour it is.
-- ================================================================

do $$ begin
  if to_regclass('public.oncall_trip') is null then raise exception 'scheduling-v50.sql first'; end if;
  if to_regclass('public.oncall_address') is null then raise exception 'scheduling-v56.sql first'; end if;
  if to_regprocedure('public.is_active_staff()') is null then raise exception 'scheduling-v70.sql first'; end if;
end $$;

-- 1. the end-of-shift list ----------------------------------------------------------------------------------------------------
create table if not exists public.shift_task_area (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  sort int not null default 0,
  active boolean not null default true
);
create table if not exists public.shift_task (
  id uuid primary key default gen_random_uuid(),
  area uuid not null references public.shift_task_area(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  sort int not null default 0,
  active boolean not null default true          -- removed tasks stay for the history
);
create table if not exists public.shift_task_mark (
  day date not null,                            -- the day of the afternoon shift (the night after it counts for the same day)
  task uuid not null references public.shift_task(id) on delete cascade,
  done boolean not null default false,
  note text check (note is null or length(note) <= 200),
  by_staff uuid references public.staff(id) on delete set null,
  at timestamptz not null default now(),
  primary key (day, task)
);
alter table public.oncall_trip add column if not exists note text check (note is null or length(note) <= 120);

alter table public.shift_task_area enable row level security;
alter table public.shift_task enable row level security;
alter table public.shift_task_mark enable row level security;
revoke all on public.shift_task_area, public.shift_task, public.shift_task_mark from anon, public;
grant select, insert, update, delete on public.shift_task_area, public.shift_task to authenticated;
grant select on public.shift_task_mark to authenticated;
drop policy if exists "tasks read" on public.shift_task_area;
drop policy if exists "tasks edit" on public.shift_task_area;
drop policy if exists "tasks read" on public.shift_task;
drop policy if exists "tasks edit" on public.shift_task;
drop policy if exists "marks history" on public.shift_task_mark;
create policy "tasks read" on public.shift_task_area for select to authenticated using (public.is_active_staff());
create policy "tasks edit" on public.shift_task_area for all to authenticated using (public.is_coordinator() or public.is_admin()) with check (public.is_coordinator() or public.is_admin());
create policy "tasks read" on public.shift_task for select to authenticated using (public.is_active_staff());
create policy "tasks edit" on public.shift_task for all to authenticated using (public.is_coordinator() or public.is_admin()) with check (public.is_coordinator() or public.is_admin());
-- the marks are read directly only by the coordinator / the admin (the history); the people on shift read them through shift_tasks_now()
create policy "marks history" on public.shift_task_mark for select to authenticated using (public.is_coordinator() or public.is_admin());

-- the printed list (only when the list is still empty)
do $$
declare a uuid; r record;
begin
  if exists (select 1 from public.shift_task_area) then return; end if;
  for r in select * from (values
    (1, 'מטבח', array['שטיפת כלים', 'כיורים', 'שיש נקי', 'זריקת אוכל לפח', 'החזרת חפצים למקומות']),
    (2, 'כביסה', array['להכניס ולהפעיל מכונות', 'למיין ולאסוף בסלי כביסה']),
    (3, 'סלון וחדר אוכל', array['ספות', 'ניעור שטיח', 'טיטוא המרחב']),
    (4, 'מקלחות ושירותים', array['ניקוי השירותים עם אקונומיקה', 'איסוף מוצרי היגיינה לארון (שמפו, מרכך, מברשות שיער, מברשות שיניים)']),
    (5, 'לובי, חדרים ומרחבים נוספים', array['לטאטא מרחב (לובי וחדרים)', 'סדר בשידה', 'החזרת חפצים למקומות', 'חדר רוגע', 'חדר משחקים',
                                             'ריקון פחים והחלפת שקיות זבל בכל המרחבים (פינת החתלה, מטבח)', 'ביצוע משימות רוחב'])
  ) v(s, n, t) loop
    insert into public.shift_task_area(name, sort) values (r.n, r.s) returning id into a;
    insert into public.shift_task(area, name, sort) select a, x, o from unnest(r.t) with ordinality u(x, o);
  end loop;
end $$;

-- the time of the institution now (a test may set vt.now; the site cannot: PostgREST sets only request.* settings)
create or replace function public.vt_now() returns timestamp language sql stable as $$
  select coalesce(nullif(current_setting('vt.now', true), '')::timestamp, now() at time zone 'Asia/Jerusalem')
$$;
revoke all on function public.vt_now() from public, anon, authenticated;

-- who is on a shift of a day, by the published schedule, the person's own hours and today's changes of the ahmash control.
-- p_kind 'A' = the afternoon (also the middle 12–20 and a service girl's own afternoon hours: they are rows of 'A'; the long weekend
-- counts on its Friday and its Saturday), 'N' = the night (the long weekend's Friday night too)
create or replace function public.vt_on_shift(p_staff uuid, p_day date, p_kind text) returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_staff is null then return false; end if;
  if exists (select 1 from public.tv_day_changes c where c.day = p_day and c.staff_id = p_staff and c.shift = p_kind and c.action = 'remove') then return false; end if;
  if exists (select 1 from public.tv_day_changes c where c.day = p_day and c.staff_id = p_staff and c.shift = p_kind and c.action = 'add') then return true; end if;
  return exists (select 1 from public.assignment a join public.schedule sc on sc.month = a.month and sc.status = 'published'
                 where a.staff_id = p_staff and (
                   (a.day = p_day and a.shift = p_kind) or
                   (p_kind = 'A' and a.shift = 'L' and (a.day = p_day or a.day = p_day - 1)) or
                   (p_kind = 'N' and a.shift = 'L' and a.day = p_day)));
end $$;
revoke all on function public.vt_on_shift(uuid, date, text) from public, anon, authenticated;

-- the caller's place in the list right now: {day, as: 'A' | 'N', until} or null (not on shift / not the time / not an instructor or service girl)
create or replace function public.vt_task_slot() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); k text := public.my_kind(); t timestamp := public.vt_now(); d date := t::date; n time := t::time;
begin
  if me is null or k is null or k not in ('instructor', 'service') then return null; end if;
  if n >= time '12:00' and n < time '23:30' and public.vt_on_shift(me, d, 'A') then
    return jsonb_build_object('day', d, 'as', 'A', 'until', ((d::timestamp + time '23:30') at time zone 'Asia/Jerusalem'));
  end if;
  if n >= time '21:30' and public.vt_on_shift(me, d, 'N') then
    return jsonb_build_object('day', d, 'as', 'N', 'until', (((d + 1)::timestamp + time '09:00') at time zone 'Asia/Jerusalem'));
  end if;
  if n < time '09:00' and public.vt_on_shift(me, d - 1, 'N') then
    return jsonb_build_object('day', d - 1, 'as', 'N', 'until', ((d::timestamp + time '09:00') at time zone 'Asia/Jerusalem'));
  end if;
  return null;
end $$;
revoke all on function public.vt_task_slot() from public, anon, authenticated;

-- the list for the person on shift (null when there is none for them now)
create or replace function public.shift_tasks_now() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb := public.vt_task_slot(); d date;
begin
  if s is null then return null; end if;
  d := (s->>'day')::date;
  return s || jsonb_build_object(
    'areas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.sort, a.name) from public.shift_task_area a where a.active), '[]'),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'area', x.area, 'name', x.name) order by x.sort, x.name)
                       from public.shift_task x join public.shift_task_area a on a.id = x.area where x.active and a.active), '[]'),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('task', m.task, 'done', m.done, 'note', m.note, 'by', m.by_staff, 'by_name', s2.display_name, 'at', m.at))
                       from public.shift_task_mark m left join public.staff s2 on s2.id = m.by_staff where m.day = d), '[]'));
end $$;
revoke all on function public.shift_tasks_now() from public, anon;
grant execute on function public.shift_tasks_now() to authenticated;

-- mark / unmark / a note (p_note null = keep the note; '' = clear it)
create or replace function public.shift_task_set(p_task uuid, p_done boolean, p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb := public.vt_task_slot(); d date; me uuid := public.my_staff_id();
begin
  if s is null then raise exception 'not on shift now' using errcode = '42501'; end if;
  d := (s->>'day')::date;
  if not exists (select 1 from public.shift_task x join public.shift_task_area a on a.id = x.area where x.id = p_task and x.active and a.active) then raise exception 'no such task'; end if;
  insert into public.shift_task_mark(day, task, done, note, by_staff, at)
    values (d, p_task, coalesce(p_done, false), nullif(btrim(coalesce(p_note, '')), ''), me, now())
  on conflict (day, task) do update set done = coalesce(p_done, shift_task_mark.done),
    note = case when p_note is null then shift_task_mark.note else nullif(btrim(p_note), '') end,
    by_staff = case when p_done is not null and p_done is distinct from shift_task_mark.done then me else coalesce(shift_task_mark.by_staff, me) end,
    at = case when p_done is not null and p_done is distinct from shift_task_mark.done then now() else shift_task_mark.at end;
  delete from public.shift_task_mark where day < public.vt_now()::date - 92;          -- (the history: 3 months)
  return jsonb_build_object('day', d, 'task', p_task);
end $$;
revoke all on function public.shift_task_set(uuid, boolean, text) from public, anon;
grant execute on function public.shift_task_set(uuid, boolean, text) to authenticated;

-- 2. the weekend taxi ----------------------------------------------------------------------------------------------------------
-- the caller's weekend (or holiday) of now: its key in the on-call panel, its first day (Friday / the eve), its last day, and until when
-- the person may ask (the first day 10:00). A weekend: from Sunday to Friday 10:00 it is the coming one.
create or replace function public.vt_taxi_window() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t timestamp := public.vt_now(); d date := t::date; fri date; h record;
begin
  fri := d + ((5 - extract(dow from d)::int + 7) % 7);
  if extract(dow from d)::int = 6 then fri := d - 1; end if;
  -- a holiday the admin set in the on-call panel, whose eve comes before the weekend, wins
  select * into h from public.oncall_period p where p.kind = 'holiday' and p.to_day >= d and p.from_day <= fri order by p.from_day limit 1;
  if h.key is not null then
    return jsonb_build_object('key', h.key, 'from_day', h.from_day, 'to_day', h.to_day, 'kind', 'holiday', 'title', h.title,
                              'deadline_local', h.from_day::timestamp + time '10:00', 'deadline', ((h.from_day::timestamp + time '10:00') at time zone 'Asia/Jerusalem'));
  end if;
  return jsonb_build_object('key', 'w:' || fri, 'from_day', fri, 'to_day', fri + 1, 'kind', 'weekend',
                            'deadline_local', fri::timestamp + time '10:00', 'deadline', ((fri::timestamp + time '10:00') at time zone 'Asia/Jerusalem'));
end $$;
revoke all on function public.vt_taxi_window() from public, anon, authenticated;

-- the caller's trips of that weekend: one per way of every shift whose time is between the first day 15:00 and the last day 20:00
create or replace function public.taxi_mine() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); w jsonb := public.vt_taxi_window(); f date; l date; sh jsonb; lo timestamp; hi timestamp;
begin
  if me is null or coalesce(public.my_kind(), '') <> 'instructor' then return null; end if;
  f := (w->>'from_day')::date; l := (w->>'to_day')::date;
  lo := f::timestamp + time '15:00'; hi := l::timestamp + time '20:00';
  select value into sh from public.sched_settings where key = 'shifts';
  return w || jsonb_build_object(
    'open', public.vt_now() < (w->>'deadline_local')::timestamp,
    'address', (select o.address from public.oncall_address o where o.staff_id = me),
    'trips', coalesce((
      select jsonb_agg(x order by x->>'day', x->>'shift', x->>'dir') from (
        select jsonb_build_object('day', a.day, 'shift', a.shift, 'dir', w2.dir,
                 'time', to_char(case when w2.dir = 'in' then a.st else a.en end, 'HH24:MI'),
                 'need', coalesce(tr.need, 'pending'), 'at_time', tr.at_time, 'place', tr.place, 'note', tr.note, 'ordered', coalesce(tr.ordered, false)) x
        from (select a.*, a.day + coalesce(a.from_time, (sh -> a.shift ->> 'from')::time, time '07:00') as st,
                     case when a.shift in ('N', 'L') or coalesce(a.to_time, (sh -> a.shift ->> 'to')::time) <= coalesce(a.from_time, (sh -> a.shift ->> 'from')::time)
                          then a.day + 1 else a.day end + coalesce(a.to_time, (sh -> a.shift ->> 'to')::time, time '15:00') as en
              from public.assignment a join public.schedule sc on sc.month = a.month and sc.status = 'published'
              where a.staff_id = me and a.day between f - 1 and l) a
        cross join (values ('in'), ('out')) w2(dir)
        left join public.oncall_trip tr on tr.period_key = w->>'key' and tr.staff_id = me and tr.day = a.day and tr.shift = a.shift and tr.dir = w2.dir
        where (case when w2.dir = 'in' then a.st else a.en end) between lo and hi) q), '[]'));
end $$;
revoke all on function public.taxi_mine() from public, anon;
grant execute on function public.taxi_mine() to authenticated;

-- the instructor asks / changes / cancels one way (until the first day 10:00); the on-call people change it in their panel as before
create or replace function public.taxi_set(p_day date, p_shift text, p_dir text, p_need text, p_time text default null, p_place text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); m jsonb := public.taxi_mine(); w jsonb; ok boolean;
begin
  if m is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if not (m->>'open')::boolean then raise exception 'closed: ask the on-call' using errcode = '42501'; end if;
  if p_need not in ('need', 'none') then raise exception 'need or none'; end if;
  select exists (select 1 from jsonb_array_elements(m->'trips') x where (x->>'day')::date = p_day and x->>'shift' = p_shift and x->>'dir' = p_dir) into ok;
  if not ok then raise exception 'no such trip' using errcode = '42501'; end if;
  insert into public.oncall_period(key, kind, from_day, to_day) values (m->>'key', m->>'kind', (m->>'from_day')::date, (m->>'to_day')::date) on conflict (key) do nothing;
  insert into public.oncall_trip(period_key, staff_id, day, shift, dir, need, at_time, place, note, updated_by, updated_at)
    values (m->>'key', me, p_day, p_shift, p_dir, p_need, left(nullif(btrim(coalesce(p_time, '')), ''), 20), left(nullif(btrim(coalesce(p_place, '')), ''), 120), left(nullif(btrim(coalesce(p_note, '')), ''), 120), me, now())
  on conflict (period_key, staff_id, day, shift, dir) do update set need = excluded.need, at_time = excluded.at_time, place = excluded.place, note = excluded.note,
    ordered = case when excluded.need = 'none' then false else oncall_trip.ordered end, updated_by = me, updated_at = now();
  if p_need = 'need' and nullif(btrim(coalesce(p_place, '')), '') is not null then          -- (the last address marked = the next default)
    insert into public.oncall_address(staff_id, address, updated_by, updated_at) values (me, left(btrim(p_place), 120), me, now())
    on conflict (staff_id) do update set address = excluded.address, updated_by = me, updated_at = now();
  end if;
  delete from public.oncall_trip where day < public.vt_now()::date - 14;          -- (two weeks; the last address stays)
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.taxi_set(date, text, text, text, text, text, text) from public, anon;
grant execute on function public.taxi_set(date, text, text, text, text, text, text) to authenticated;

select 'scheduling_v84' as part, 'ok' as result,
       (select count(*) from public.shift_task_area) as areas, (select count(*) from public.shift_task) as tasks,
       (select count(*) from information_schema.columns where table_name = 'oncall_trip' and column_name = 'note') as trip_note;
