-- ================================================================
-- Scheduling, part 25 — run in the SQL Editor after scheduling-v24.sql. Safe to run again.
--   * personal minimums (management portal): mid-week shifts a week, nights a week, weekend shifts a month (empty = the usual 2 / 1 / 4)
--   * a colleague for day shifts: a day shift preferably only on a day that colleague works one too (otherwise nights) — a wish of the engine
--   * the language of the portal: the admin's default per person, and the person's own choice (Hebrew / Arabic)
--   * a new day for sign-up inside a published month: the coordinator opens it (hours, minimum, maximum, for whom), the instructors
--     place themselves (no approval), at the maximum it closes and the coordinator is told
-- ================================================================

-- ---- personal numbers, the colleague, the language
alter table public.staff_private add column if not exists min_mid     smallint check (min_mid between 0 and 7);
alter table public.staff_private add column if not exists min_nights  smallint check (min_nights between 0 and 7);
alter table public.staff_private add column if not exists min_weekend smallint check (min_weekend between 0 and 12);
alter table public.staff_private add column if not exists day_buddy   uuid references public.staff(id) on delete set null;
alter table public.staff_private add column if not exists lang        text check (lang in ('he', 'ar'));          -- (the admin's default)
alter table public.staff_settings add column if not exists lang       text check (lang in ('he', 'ar'));          -- (the person's own choice, it wins)

create or replace function public.lang_of(p_staff uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select lang from public.staff_settings where staff_id = p_staff), (select lang from public.staff_private where staff_id = p_staff), 'he')
$$;
revoke all on function public.lang_of(uuid) from public, anon, authenticated;

-- the person's own profile: + her minimums and her language
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('female', p.female, 'no_nights', p.no_nights, 'only_long', p.only_long_weekend, 'manual_only', p.manual_only, 'latest_end', p.latest_end_hour,
                            'kind', s.kind, 'ahmash', p.ahmash_rank, 'admin', public.is_admin(), 'control', public.can_control(),
                            'min_mid', p.min_mid, 'min_nights', p.min_nights, 'min_weekend', p.min_weekend, 'lang', public.lang_of(p.staff_id), 'leader', p.is_leader)
  from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = public.my_staff_id()
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- ---- a new day for sign-up
create table if not exists public.open_days (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  scope       text not null check (scope in ('day', 'morning', 'afternoon', 'night', 'hours')),          -- (day = morning + afternoon, without the night)
  from_time   time,
  to_time     time,
  min_staff   smallint not null default 1 check (min_staff between 0 and 20),
  max_staff   smallint not null check (max_staff between 1 and 20),
  audience    text not null default 'all' check (audience in ('all', 'ahmash', 'leader')),
  note        text check (length(note) <= 300),
  closed      boolean not null default false,
  full_told   boolean not null default false,
  created_by  uuid default public.my_staff_id(),
  created_at  timestamptz not null default now(),
  check (max_staff >= min_staff),
  check (scope <> 'hours' or (from_time is not null and to_time is not null and to_time > from_time))
);
create index if not exists open_days_day on public.open_days (day);
alter table public.open_days enable row level security;
drop policy if exists "see open days" on public.open_days;
create policy "see open days" on public.open_days for select to authenticated using (public.is_personal() or public.is_coordinator());
drop policy if exists "coordinator open days" on public.open_days;
create policy "coordinator open days" on public.open_days for all to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
grant select, insert, update, delete on public.open_days to authenticated;

-- the words of an open day: "יום שלישי 12/11, כל היום (07:00–22:00)"
create or replace function public.open_day_text(o public.open_days) returns text language sql immutable as $$
  select 'יום ' || (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[extract(dow from o.day)::int + 1] || ' ' || to_char(o.day, 'FMDD/FMMM') || ', ' ||
    case o.scope when 'day' then 'כל היום (07:00–22:00)' when 'morning' then 'בוקר (07:00–15:00)' when 'afternoon' then 'צהריים (14:00–22:00)'
                 when 'night' then 'לילה (22:00–08:00)' else 'בשעות ' || to_char(o.from_time, 'HH24:MI') || '–' || to_char(o.to_time, 'HH24:MI') end
$$;
-- how many placed themselves (the shifts carry the mark od:<id>; a person the coordinator removed frees the place)
create or replace function public.open_day_taken(p_id uuid) returns int language sql stable security definer set search_path = public as $$
  select count(distinct staff_id)::int from public.assignment where ('od:' || p_id::text) = any(flags)
$$;
create or replace function public.open_day_fits(o public.open_days, p_staff uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id where s.id = p_staff and s.active and s.kind = 'instructor'
                 and (o.audience = 'all' or (o.audience = 'ahmash' and coalesce(p.ahmash_rank, 0) > 0) or (o.audience = 'leader' and coalesce(p.is_leader, false))))
$$;
revoke all on function public.open_day_taken(uuid), public.open_day_fits(public.open_days, uuid) from public, anon, authenticated;

-- what an instructor sees: the open days that are for her (still with room, or that she already took)
create or replace function public.open_days_for_me() returns table (id uuid, day date, scope text, from_time time, to_time time, max_staff smallint, taken int, mine boolean, words text, note text)
language sql stable security definer set search_path = public as $$
  select o.id, o.day, o.scope, o.from_time, o.to_time, o.max_staff, public.open_day_taken(o.id),
         exists (select 1 from public.assignment a where a.staff_id = public.my_staff_id() and ('od:' || o.id::text) = any(a.flags)), public.open_day_text(o), o.note
  from public.open_days o
  where o.day >= current_date and not o.closed and public.open_day_fits(o, public.my_staff_id())
    and exists (select 1 from public.schedule sc where sc.month = date_trunc('month', o.day::timestamp)::date and sc.status = 'published')
    and (public.open_day_taken(o.id) < o.max_staff or exists (select 1 from public.assignment a where a.staff_id = public.my_staff_id() and ('od:' || o.id::text) = any(a.flags)))
  order by o.day
$$;
-- for the coordinator: every open day with how many placed themselves, and who
create or replace function public.open_days_status() returns table (id uuid, day date, scope text, from_time time, to_time time, min_staff smallint, max_staff smallint, audience text, closed boolean, taken int, people uuid[], words text, note text)
language sql stable security definer set search_path = public as $$
  select o.id, o.day, o.scope, o.from_time, o.to_time, o.min_staff, o.max_staff, o.audience, o.closed, public.open_day_taken(o.id),
         array(select distinct a.staff_id from public.assignment a where ('od:' || o.id::text) = any(a.flags)), public.open_day_text(o), o.note
  from public.open_days o where public.is_coordinator() and o.day >= current_date - 1 order by o.day
$$;

-- the coordinator opens a day: it is saved, and the instructors it is for hear about it (portal + e-mail)
create or replace function public.open_day_publish(p_day date, p_scope text, p_from time, p_to time, p_min int, p_max int, p_audience text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.open_days; r record; txt text;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  if p_day < current_date then raise exception 'the day has passed'; end if;
  if not exists (select 1 from public.schedule where month = date_trunc('month', p_day::timestamp)::date and status = 'published') then raise exception 'the month is not published'; end if;
  insert into public.open_days (day, scope, from_time, to_time, min_staff, max_staff, audience, note)
    values (p_day, p_scope, case when p_scope = 'hours' then p_from end, case when p_scope = 'hours' then p_to end, p_min, p_max, coalesce(p_audience, 'all'), nullif(trim(p_note), ''))
    returning * into o;
  txt := 'נפתח יום נוסף לשיבוץ: ' || public.open_day_text(o) || '. יש ' || o.max_staff || ' מקומות, ומי שרוצה יכול/ה להשתבץ בעצמו/ה בפורטל, בלשונית הסידור.' || coalesce(' ' || o.note, '');
  for r in select s.id from public.staff s where s.kind = 'instructor' and s.active loop
    if public.open_day_fits(o, r.id) then
      if coalesce(o.note, '') like 'בדיקה אוטומטית%' then insert into public.notices (to_staff, text, kind) values (r.id, txt, 'open');          -- (the automatic checks of the test site: no e-mails)
      else perform public.tell_staff(r.id, 'נפתח יום נוסף לשיבוץ', txt, 'open'); end if;
    end if;
  end loop;
  return o.id;
end $$;

-- an instructor places herself: the shifts are added at once; at the maximum the coordinator is told
create or replace function public.open_day_join(p_id uuid) returns int language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); o public.open_days; m date; n int; who text; c record; mark text;
begin
  select * into o from public.open_days where id = p_id for update;          -- (one at a time: two people cannot take the last place together)
  if not found or o.closed then raise exception 'closed'; end if;
  if me is null or not public.open_day_fits(o, me) then raise exception 'not for you'; end if;
  if o.day < current_date then raise exception 'the day has passed'; end if;
  m := date_trunc('month', o.day::timestamp)::date;
  if not exists (select 1 from public.schedule where month = m and status = 'published') then raise exception 'the month is not published'; end if;
  mark := 'od:' || o.id::text;
  if exists (select 1 from public.assignment where staff_id = me and mark = any(flags)) then raise exception 'already in'; end if;
  if public.open_day_taken(o.id) >= o.max_staff then raise exception 'full'; end if;
  if exists (select 1 from public.assignment where staff_id = me and day = o.day) then raise exception 'already working that day'; end if;
  if o.scope in ('day', 'morning') then insert into public.assignment (month, staff_id, day, shift, from_time, to_time, flags) values (m, me, o.day, 'M', '07:00', '15:00', array[mark, 'self']); end if;
  if o.scope in ('day', 'afternoon') then insert into public.assignment (month, staff_id, day, shift, from_time, to_time, flags) values (m, me, o.day, 'A', '14:00', '22:00', array[mark, 'self']); end if;
  if o.scope = 'night' then insert into public.assignment (month, staff_id, day, shift, from_time, to_time, flags) values (m, me, o.day, 'N', '22:00', '08:00', array[mark, 'self']); end if;
  if o.scope = 'hours' then insert into public.assignment (month, staff_id, day, shift, from_time, to_time, flags) values (m, me, o.day, case when o.from_time < '14:00' then 'M' else 'A' end, o.from_time, o.to_time, array[mark, 'self']); end if;
  n := public.open_day_taken(o.id);
  select display_name into who from public.staff where id = me;
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop
    insert into public.notices (to_staff, text, kind) values (c.id, who || ' השתבצ/ה ליום הנוסף: ' || public.open_day_text(o) || ' (' || n || ' מתוך ' || o.max_staff || ').', 'open');
    if n >= o.max_staff and not o.full_told then
      perform public.tell_staff(c.id, 'היום הנוסף התמלא', 'הגענו למקסימום במשמרת שפתחת: ' || public.open_day_text(o) || '. נרשמו ' || n || ' מדריכים, וההצעה ירדה מהפורטל של המדריכים.', 'ok');
    end if;
  end loop;
  update public.open_days set full_told = (n >= o.max_staff) where id = o.id;          -- (a place freed later can fill again, and then she is told again)
  return n;
end $$;
revoke all on function public.open_days_for_me(), public.open_days_status(), public.open_day_publish(date, text, time, time, int, int, text, text), public.open_day_join(uuid) from public, anon;
grant execute on function public.open_days_for_me(), public.open_days_status(), public.open_day_publish(date, text, time, time, int, int, text, text), public.open_day_join(uuid) to authenticated;

select 'scheduling_v25' as part, 'ok' as result;
