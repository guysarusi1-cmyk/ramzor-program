-- ================================================================
-- Scheduling, part 74 — run in the SQL Editor after scheduling-v72.sql, and only after the site that sends the screen's token is up
-- (the kids' screens of an older site would go empty). Safe to run again. (Guy 2026-11-12, task 3: the rights matrix, item 3)
-- The kids' screen data is closed to a visitor who is not signed in, unless it is a screen that joined with a code:
--   until now anybody with the site's public key could read the children's first names, their boards, the lists, the events feed,
--   today's shifts (with staff names and photos), the timetable and the duties, with no sign-in and no code.
-- From now on these are read only by: a kids' screen that joined with a code and is still connected (its token arrives with every
-- request, in the header "x-tv-token"), active staff in their personal sign-in, and (TEST only) the old shared addresses.
-- What changes for a joined screen: nothing to see. The live "a star was given" push no longer reaches a screen that is not signed
-- in; the screen already asks for new events every 8 seconds, so a celebration shows within a few seconds.
-- ================================================================

do $$ begin
  if to_regprocedure('public.is_active_staff()') is null then raise exception 'scheduling-v70.sql first'; end if;
  if to_regclass('public.tv_devices') is null then raise exception 'scheduling-v32.sql first'; end if;
end $$;

-- is this request from a kids' screen that joined with a code and is still connected?
create or replace function public.tv_ok() returns boolean language plpgsql stable security definer set search_path = public as $$
declare tok text;
begin
  begin
    tok := nullif(current_setting('request.headers', true), '')::json ->> 'x-tv-token';
  exception when others then tok := null;
  end;
  if tok is null or tok = '' then return false; end if;
  return exists (select 1 from public.tv_devices d where d.token_hash = md5('tvtok:' || tok) and d.active);
end $$;
revoke all on function public.tv_ok() from public;
grant execute on function public.tv_ok() to anon, authenticated;

-- may this caller see what the kids' screen shows? a joined screen, active staff, the old addresses on TEST; and whoever is not a
-- visitor of the site at all (the SQL Editor, the jobs)
create or replace function public.tv_may_see() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_active_staff() or public.is_staff() or public.tv_ok()
$$;
revoke all on function public.tv_may_see() from public;
grant execute on function public.tv_may_see() to anon, authenticated;

-- ---------------------------------------------------------------- the tables the screen reads
do $$
declare r record;
begin
  for r in select * from (values ('roster'), ('child_state'), ('mini_lists'), ('feedback_events'), ('bonus_revocations')) v(tab) loop
    execute format('drop policy if exists "tv read" on public.%I', r.tab);
    execute format('create policy "tv read" on public.%I for select to anon using ((select public.tv_ok()))', r.tab);
  end loop;
end $$;

-- today's bonus changes: were open to everybody (also to a signed-in address with no staff row)
drop policy if exists "everybody reads" on public.bonus_day;
drop policy if exists "tv read" on public.bonus_day;
drop policy if exists "staff read" on public.bonus_day;
create policy "tv read" on public.bonus_day for select to anon using ((select public.tv_ok()));
create policy "staff read" on public.bonus_day for select to authenticated using ((select public.is_active_staff() or public.is_staff()));

-- ---------------------------------------------------------------- the functions the screen calls (the bodies are as before, plus the question "may this caller see")
-- today's staff (scheduling-v2.sql)
create or replace function public.tv_today() returns table (first_name text, photo_url text, shift text, kind text, from_time text, to_time text)
language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; t time := (now() at time zone 'Asia/Jerusalem')::time; sh jsonb;
begin
  if not public.tv_may_see() then return; end if;
  select value into sh from public.sched_settings where key = 'shifts';
  return query
  select s.display_name, s.photo_url, a.shift, s.kind,
         to_char(coalesce(a.from_time, (sh -> a.shift ->> 'from')::time), 'HH24:MI'), to_char(coalesce(a.to_time, (sh -> a.shift ->> 'to')::time), 'HH24:MI')
  from public.assignment a join public.staff s on s.id = a.staff_id join public.schedule sc on sc.month = a.month and sc.status = 'published'
  where s.active and (a.day = d or (a.shift = 'N' and a.day = d - 1 and t < time '08:00') or (a.shift = 'L' and a.day = d - 1 and t < time '22:00'))
  order by a.from_time, s.display_name;
end $$;

-- who is on shift today (scheduling-v17.sql)
create or replace function public.tv_shifts_today() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; sh jsonb;
begin
  if not public.tv_may_see() then return null; end if;
  select value into sh from public.sched_settings where key = 'shifts';
  return jsonb_build_object(
    'day', d,
    'ahmash', public.tv_ahmash_picks(d),
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

-- today's timetable (scheduling-v15.sql)
create or replace function public.tv_timetable_today() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; sp record; wd int; items jsonb;
begin
  if not public.tv_may_see() then return null; end if;
  select kind, label into sp from public.special_days where day = d;
  wd := case when sp.kind = 'holiday' then 6 when sp.kind = 'eve' then 5 else extract(dow from d)::int end;
  select t.items into items from public.timetable_day t where t.day = d;
  if items is null then select f.items into items from public.timetable_fixed f where f.weekday = wd; end if;
  return jsonb_build_object('day', d, 'weekday', wd, 'items', coalesce(items, '[]'), 'title', case when sp.kind in ('holiday', 'eve') then sp.label end, 'changed', exists (select 1 from public.timetable_day t where t.day = d));
end $$;

-- today's events (scheduling-v62.sql)
create or replace function public.tv_events_today() returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select (now() at time zone 'Asia/Jerusalem')::date v)
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 't', to_char(e.start_time, 'HH24:MI'), 'end', to_char(e.end_time, 'HH24:MI'), 'i', e.icon, 'person', e.person_name,
                                               'child', public.tt_child_label(e.child_id), 'activity', e.activity, 'group', e.group_kind, 'group_text', e.group_text)
                            order by e.start_time, e.kind, e.person_name), '[]')
  from d, public.tt_occurrences(d.v, d.v) o join public.tt_event e on e.id = o.ev_id
  where public.tv_may_see()
$$;

-- today's birthdays (scheduling-v63.sql)
create or replace function public.tv_birthdays_today() returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select (now() at time zone 'Asia/Jerusalem')::date v)
  select coalesce(jsonb_agg(jsonb_build_object('child_id', b.child_id, 'age', extract(year from age(d.v, b.born))::int) order by b.child_id), '[]')
  from d, public.kid_birthday b
  where b.born <= d.v and public.tv_may_see()
    and (to_char(b.born, 'MM-DD') = to_char(d.v, 'MM-DD')
         or (to_char(b.born, 'MM-DD') = '02-29' and to_char(d.v, 'MM-DD') = '02-28'
             and extract(day from (date_trunc('year', d.v) + interval '1 month 28 days')::date) <> 29))
$$;

-- the duties board (scheduling-v39.sql)
create or replace function public.duty_board() returns jsonb language plpgsql security definer set search_path = public as $$
declare t date := (now() at time zone 'Asia/Jerusalem')::date; w date := t - extract(dow from t)::int;
begin
  if not public.tv_may_see() then return null; end if;
  perform public.duty_shuffle_do(w, false);
  return jsonb_build_object('week', w, 'duties', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kids', d.kids,
           'children', coalesce((select jsonb_agg(a.child_id order by a.child_id) from public.duty_assign a where a.week = w and a.duty_id = d.id), '[]'::jsonb)) order by d.sort, d.name)
         from public.duties d where d.active), '[]'::jsonb));
end $$;

-- what the screen shows and hides (scheduling-v63.sql)
create or replace function public.tv_display() returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.tv_may_see() then coalesce((select value from public.sched_settings where key = 'tv_display'), '{"off":[]}'::jsonb) end
$$;

select 'scheduling_v74' as part, 'ok' as result,
       (select count(*) from pg_policies where schemaname = 'public' and policyname = 'tv read' and qual like '%tv_ok()%') as screen_rules,
       (select count(*) from public.tv_devices where active) as joined_screens;
