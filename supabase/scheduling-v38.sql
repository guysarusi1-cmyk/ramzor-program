-- scheduling v38 (2026-10-26): "בנייה מחדש של הסידור" with two choices, and the open days counted with those already placed (Guy).
-- Run once, after v37, on each project. Safe to run again. Changes no data.
--   * sched_requests.mode: 'keep' = build again and keep the coordinator's changes by hand (additions, moves, hours, ✓, removals; the service girls
--     and the teachers as they are); 'all' = build everything anew (only the shifts marked ✓ stay). Empty = the first build of a month.
--   * sched_removed: who the coordinator took off which shift by hand, so that a build that keeps her changes does not put them back.
alter table public.sched_requests add column if not exists mode text;
alter table public.sched_requests drop constraint if exists sched_requests_mode_check;
alter table public.sched_requests add constraint sched_requests_mode_check check (mode is null or mode in ('keep', 'all'));

create table if not exists public.sched_removed (
  id         uuid primary key default gen_random_uuid(),
  month      date not null,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  day        date not null,
  shift      text not null check (shift in ('M', 'S', 'A', 'N', 'L')),
  created_at timestamptz not null default now()
);
create index if not exists sched_removed_month_idx on public.sched_removed (month);
alter table public.sched_removed enable row level security;
drop policy if exists "coordinator removed" on public.sched_removed;
create policy "coordinator removed" on public.sched_removed for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
grant select, insert, delete on public.sched_removed to authenticated;

-- ---- the open days for sign-up (Guy 2026-10-26)
--   * the maximum (and the minimum) is how many instructors are in the shift altogether, the ones already placed included: "נשארו N מקומות" counts them too.
--     A whole day (morning and afternoon): the fuller of the two. Other hours: everyone whose shift that day overlaps them.
--   * the same day and shift cannot be opened twice while the first is open: the coordinator is offered to change the one that is open.
create or replace function public.open_day_taken(p_id uuid) returns int language sql stable security definer set search_path = public as $$
  with o as (select * from public.open_days where id = p_id),
  inst as (select a.* from public.assignment a join public.staff s on s.id = a.staff_id and s.kind = 'instructor', o where a.day = o.day)
  select case o.scope
    when 'morning'   then (select count(distinct staff_id) from inst where shift in ('M', 'S'))
    when 'afternoon' then (select count(distinct staff_id) from inst where shift = 'A')
    when 'day'       then greatest((select count(distinct staff_id) from inst where shift in ('M', 'S')), (select count(distinct staff_id) from inst where shift = 'A'))
    when 'night'     then (select count(distinct staff_id) from inst where shift = 'N')
    else (select count(distinct staff_id) from inst where shift in ('M', 'S', 'A') and coalesce(from_time, '07:00') < o.to_time and coalesce(to_time, '22:00') > o.from_time)
  end::int from o
$$;
revoke all on function public.open_day_taken(uuid) from public, anon, authenticated;
-- do two open days on one date overlap? (day = morning + afternoon; other hours overlap the morning before 15:00 and the afternoon from 14:00)
create or replace function public.open_day_overlap(s1 text, f1 time, t1 time, s2 text, f2 time, t2 time) returns boolean language sql immutable as $$
  select case
    when s1 = 'night' or s2 = 'night' then s1 = s2
    when s1 = 'hours' and s2 = 'hours' then f1 < t2 and f2 < t1
    when s1 = 'hours' then (s2 in ('morning', 'day') and f1 < '15:00') or (s2 in ('afternoon', 'day') and t1 > '14:00')
    when s2 = 'hours' then (s1 in ('morning', 'day') and f2 < '15:00') or (s1 in ('afternoon', 'day') and t2 > '14:00')
    else s1 = s2 or s1 = 'day' or s2 = 'day' end
$$;
create or replace function public.open_day_publish(p_day date, p_scope text, p_from time, p_to time, p_min int, p_max int, p_audience text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.open_days; r record; txt text; txa text; ex uuid; left_n int;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  if p_day < current_date then raise exception 'the day has passed'; end if;
  if not exists (select 1 from public.schedule where month = date_trunc('month', p_day::timestamp)::date and status = 'published') then raise exception 'the month is not published'; end if;
  select x.id into ex from public.open_days x where x.day = p_day and not x.closed
    and public.open_day_overlap(x.scope, x.from_time, x.to_time, p_scope, case when p_scope = 'hours' then p_from end, case when p_scope = 'hours' then p_to end) limit 1;
  if ex is not null then raise exception 'already open %', ex; end if;          -- (the portal offers to change the one that is open)
  insert into public.open_days (day, scope, from_time, to_time, min_staff, max_staff, audience, note)
    values (p_day, p_scope, case when p_scope = 'hours' then p_from end, case when p_scope = 'hours' then p_to end, p_min, p_max, coalesce(p_audience, 'all'), nullif(trim(p_note), ''))
    returning * into o;
  left_n := greatest(o.max_staff - public.open_day_taken(o.id), 0);
  if left_n = 0 then update public.open_days set full_told = true where id = o.id; return o.id; end if;          -- (already full with those placed: nobody is asked)
  txt := 'נפתח יום נוסף לשיבוץ: ' || public.open_day_text(o) || '. ' || case when left_n = 1 then 'נשאר מקום אחד' else 'יש ' || left_n || ' מקומות' end || ', ומי שרוצה יכול/ה להשתבץ בעצמו/ה בפורטל, בלשונית הסידור.' || coalesce(' ' || o.note, '');
  txa := 'فُتح يوم إضافي للجدولة: ' || public.open_day_text_ar(o) || '. يوجد ' || left_n || ' أماكن، ومن يرغب يمكنه الانضمام بنفسه في البوابة، في تبويب الجدول.' || coalesce(' ' || o.note, '');
  for r in select s.id from public.staff s where s.kind = 'instructor' and s.active loop
    if public.open_day_fits(o, r.id) and not exists (select 1 from public.assignment a where a.staff_id = r.id and a.day = o.day) then          -- (not who works that day already)
      if coalesce(o.note, '') like 'בדיקה אוטומטית%' then insert into public.notices (to_staff, text, kind) values (r.id, case when public.lang_of(r.id) = 'ar' then txa else txt end, 'open');          -- (the automatic checks of the test site: no e-mails)
      else perform public.tell_staff_ar(r.id, 'נפתח יום נוסף לשיבוץ', txt, 'open', 'فُتح يوم إضافي للجدولة', txa); end if;
    end if;
  end loop;
  return o.id;
end $$;
revoke all on function public.open_day_publish(date, text, time, time, int, int, text, text) from public, anon;
grant execute on function public.open_day_publish(date, text, time, time, int, int, text, text) to authenticated;

select 'scheduling_v38' as part, 'ok' as result;
