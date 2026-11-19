-- ================================================================
-- Scheduling, part 86 — the pilot at the balancing home (Guy's meeting with the institution, 19.11.2026; Chava's task
-- 2026-11-19_pilot-mazan-work-doc; Guy's answers the same evening). Run in the SQL Editor of the product's database, after
-- scheduling-v83.sql and scheduling-v85.sql. Safe to run again.
--   1. the places of a day: two in every shift, also Friday morning; a third only on Tuesday morning; the long weekend shift counts as
--      ONE shift; a holiday eve is a Friday and a holiday is a Saturday (tw_holiday of v83; Hanukkah days stay ordinary days);
--   2. the hours of every shift (tw_shift_span): the weekend hours come from the settings, winter and summer apart
--      (tw_settings 'weekend_hours'; until Guy sends the summer hours both are Friday 14:00 to Saturday 20:30);
--   3. the check before publishing: two shifts of one person that overlap or touch ("a double in a row") stop the publishing;
--      less than 8 hours between them is a warning (the person agreed to that pair, the builder decides);
--   4. a person's own settings (tw_pref): which close pairs she agrees to work, the days she never comes, whether a new hand-in starts
--      from her last one, and which e-mails she gets (all on at the start);
--   5. her phone (tw_phone): seen only by her, the admin and whoever builds a schedule now (for the WhatsApp button);
--   6. the last name (tw_people.last_name): the schedule shows the first name only, and a letter of the last name when two have the same
--      first name;
--   7. a placement the person confirmed (tw_assignment.ok: the builder marks ✓ after a WhatsApp "yes");
--   8. "שליחת עדכונים": changes after publishing are mailed together when the builder presses it (tw_notice.mail_due / mailed_at);
--      new swap requests are mailed once (tw_swap.mailed_at); both are sent by the Edge Function tw-mail;
--   9. "משהו לא עובד?" — a problem report from the site (tw_problem), read by the admin;
--  10. the pilot's template and the organisations' draft settings follow the meeting (two on Friday morning, the weekend shift counts
--      one, rest 8 hours).
-- ================================================================

do $$ begin
  if to_regclass('public.tw_holiday') is null then raise exception 'scheduling-v83.sql first'; end if;
  if not exists (select 1 from public.schema_migrations where version = 'scheduling-v85') then raise exception 'scheduling-v85.sql first'; end if;
end $$;

-- 1. the type of a day: a holiday eve as Friday, a holiday as Saturday -------------------------------------------------------
create or replace function public.tw_kind_of(p_day date) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select case h.kind when 'eve' then 'fri' else 'sat' end from public.tw_holiday h where h.day = p_day),
                  case extract(dow from p_day)::int when 5 then 'fri' when 6 then 'sat' else 'weekday' end)
$$;

create or replace function public.tw_slots(p_day date) returns table(shift text, need int, extra int, w int) language sql stable security definer set search_path = public as $$
  select v.shift, v.need, 0, 1 from (values
    ('weekday', 'M', case when extract(dow from p_day) = 2 then 3 else 2 end), ('weekday', 'A', 2), ('weekday', 'N', 2),
    ('fri', 'M', 2), ('fri', 'W', 2),
    ('sat', 'N', 2)) v(kind, shift, need)
  where v.kind = public.tw_kind_of(p_day)
$$;

-- 2. the hours of a shift on a day (local time); the weekend hours by the season of that day ---------------------------------------
create or replace function public.tw_summer(p_day date) returns boolean language sql stable as $$
  select ((p_day + time '12:00') at time zone 'UTC') - ((p_day + time '12:00') at time zone 'Asia/Jerusalem') >= interval '3 hours'
$$;
create or replace function public.tw_weekend_time(p_day date, p_part text) returns time language sql stable security definer set search_path = public as $$
  select coalesce((select (s.value #>> array[case when public.tw_summer(p_day) then 'summer' else 'winter' end, p_part])::time
                   from public.tw_settings s where s.org_id = public.current_org() and s.key = 'weekend_hours'),
                  case p_part when 'start' then time '14:00' else time '20:30' end)
$$;
create or replace function public.tw_shift_span(p_day date, p_shift text, out starts timestamp, out ends timestamp) language plpgsql stable security definer set search_path = public as $$
declare k text := public.tw_kind_of(p_day);
begin
  if p_shift = 'M' then starts := p_day + time '07:30'; ends := p_day + case when k = 'fri' then time '14:30' else time '15:30' end;
  elsif p_shift = 'A' then starts := p_day + time '15:00'; ends := p_day + time '23:00';
  elsif p_shift = 'N' then starts := p_day + case when k = 'sat' then public.tw_weekend_time(p_day, 'end') else time '22:30' end; ends := p_day + 1 + time '08:00';
  elsif p_shift = 'W' then starts := p_day + public.tw_weekend_time(p_day, 'start'); ends := p_day + 1 + public.tw_weekend_time(p_day + 1, 'end');
  end if;
end $$;

-- 3. the check before publishing --------------------------------------------------------------------------------------------
create or replace function public.tw_publish_check(p_period date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare errs text[] := '{}'; warns text[] := '{}'; r record; o uuid := public.current_org();
  rest numeric := coalesce((select (value #>> '{}')::numeric from public.tw_settings where org_id = public.current_org() and key = 'rest_hours'), 8);
begin
  if o is null or not public.tw_builder(p_period) then raise exception 'only the builder of these two weeks'; end if;
  for r in select a.day, a.shift from public.tw_assignment a where a.org_id = o and a.period = p_period
           and not exists (select 1 from public.tw_slots(a.day) s where s.shift = a.shift) loop
    errs := errs || format('%s: אין משמרת %s ביום הזה', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift));
  end loop;
  -- two shifts of one person: overlapping or one right after the other = an error; less than the rest hours between = a warning
  for r in with s as (select a.person, a.day, a.shift, coalesce(a.day + a.from_time, x.starts) as st,
                             case when a.to_time is null then x.ends when a.to_time > coalesce(a.from_time, time '00:00') then a.day + a.to_time else a.day + 1 + a.to_time end as en
                      from public.tw_assignment a cross join lateral public.tw_shift_span(a.day, a.shift) x where a.org_id = o and a.period = p_period)
           select p.name, s1.day as d1, s1.shift as sh1, s2.day as d2, s2.shift as sh2, extract(epoch from (s2.st - s1.en)) / 3600 as gap
           from s s1 join s s2 on s2.person = s1.person and s2.st >= s1.st and (s2.day, s2.shift) <> (s1.day, s1.shift) and s2.st < s1.en + make_interval(hours => rest::int, mins => ((rest - floor(rest)) * 60)::int)
           join public.tw_people p on p.id = s1.person order by s1.day loop
    if r.gap <= 0 then
      errs := errs || format('%s: %s %s ו%s %s חופפות או צמודות בלי הפסקה', r.name, public.tw_shift_name(r.sh1), to_char(r.d1, 'DD/MM'), public.tw_shift_name(r.sh2), to_char(r.d2, 'DD/MM'));
    else
      warns := warns || format('%s: בין %s %s ל%s %s רק %s שעות מנוחה', r.name, public.tw_shift_name(r.sh1), to_char(r.d1, 'DD/MM'), public.tw_shift_name(r.sh2), to_char(r.d2, 'DD/MM'), trim(to_char(r.gap, 'FM990.0')));
    end if;
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
           where exists (select 1 from public.tw_slots(d::date) s where s.shift = f.shift)
             and not exists (select 1 from public.tw_assignment a where a.org_id = o and a.period = p_period and a.day = d::date and a.shift = f.shift and a.person = f.person) loop
    warns := warns || format('%s: המשמרת הקבועה של %s לא בסידור (%s)', to_char(r.day, 'DD/MM'), r.name, public.tw_shift_name(r.shift));
  end loop;
  -- nights: one a week for everybody, and two people of the two weeks get one more (Guy 19.11: once per two weeks, in turn)
  for r in select count(*) as n from (select a.person from public.tw_assignment a where a.org_id = o and a.period = p_period and a.shift = 'N'
           group by a.person, (a.day - p_period) / 7 having count(*) = 2) t having count(*) > 2 loop
    warns := warns || format('בשבועיים האלה %s אנשים עם שני לילות בשבוע (בדרך כלל 2)', r.n);
  end loop;
  return jsonb_build_object('errors', to_jsonb(errs), 'warnings', to_jsonb(warns));
end $$;

-- 4. a person's own settings ---------------------------------------------------------------------------------------------------
create table if not exists public.tw_pref (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  person uuid not null,
  combos text[] not null default '{}',          -- close pairs she agrees to: MN = morning and night the same day, AM = afternoon and the next morning, NA = night and the next afternoon
  days_off int[] not null default '{}',         -- days of the week she never comes (0 = Sunday)
  copy_last boolean not null default false,     -- a new hand-in starts from her marks of the last one
  notify jsonb not null default '{"reminder":true,"published":true,"changed":true,"swap":true}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, person)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tw_pref_person_fk') then
    alter table public.tw_pref add constraint tw_pref_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade;
  end if;
end $$;

-- 5. phones: only the person, the admin and whoever builds a schedule now
create or replace function public.tw_builder_now() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.builder is not null
                                     and t.builder = public.tw_me() and t.start + 13 >= current_date)
$$;
create table if not exists public.tw_phone (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  person uuid not null,
  phone text not null check (phone ~ '^[0-9+\- ]{7,20}$'),
  primary key (org_id, person)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tw_phone_person_fk') then
    alter table public.tw_phone add constraint tw_phone_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade;
  end if;
end $$;

-- 6., 7. the last name; a confirmed placement
alter table public.tw_people add column if not exists last_name text check (last_name is null or length(last_name) <= 40);
alter table public.tw_assignment add column if not exists ok boolean not null default false;

-- 8. the changes are mailed together; a new swap request once
alter table public.tw_notice add column if not exists mail_due boolean not null default false;
alter table public.tw_notice add column if not exists mailed_at timestamptz;
alter table public.tw_swap add column if not exists mailed_at timestamptz;

-- how many changes of these two weeks were not mailed yet (p_send: mark them for the mail and call it now)
create or replace function public.tw_send_updates(p_period date, p_send boolean default false) returns int language plpgsql security definer set search_path = public as $$
declare o uuid := public.current_org(); n int;
begin
  if o is null or not public.tw_builder(p_period) then raise exception 'only the builder of these two weeks'; end if;
  select count(distinct person) into n from public.tw_notice where org_id = o and period = p_period and not mail_due and mailed_at is null;
  if p_send and n > 0 then
    update public.tw_notice set mail_due = true where org_id = o and period = p_period and not mail_due and mailed_at is null;
    begin perform public.tw_mail_now(); exception when undefined_function then null; end;
  end if;
  return n;
end $$;

-- a new swap request: the mail goes at once, not with the hourly round (the round of the job is late: hours)
create or replace function public.tw_swap_mail() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin perform public.tw_mail_now(); exception when undefined_function then null; when others then null; end;
  return null;
end $$;
revoke all on function public.tw_swap_mail() from public, anon, authenticated;
drop trigger if exists tw_swap_mail on public.tw_swap;
create trigger tw_swap_mail after insert on public.tw_swap for each row execute function public.tw_swap_mail();

-- 9. problem reports
create table if not exists public.tw_problem (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  by_staff uuid default public.my_staff_id(),
  text text not null check (length(btrim(text)) between 1 and 1000),
  info jsonb,                                   -- the screen, the device and the version (no personal details)
  created_at timestamptz not null default now()
);

-- rights ------------------------------------------------------------------------------------------------------------------------
alter table public.tw_pref enable row level security;
alter table public.tw_phone enable row level security;
alter table public.tw_problem enable row level security;
revoke all on public.tw_pref, public.tw_phone, public.tw_problem from anon, authenticated, public;          -- (also the automatic rights of a new project)
grant select, insert, update on public.tw_pref to authenticated;
grant select, insert, update, delete on public.tw_phone to authenticated;
grant select, insert on public.tw_problem to authenticated;
drop policy if exists "org only" on public.tw_pref;
drop policy if exists "tw pref read" on public.tw_pref;
drop policy if exists "tw pref own add" on public.tw_pref;
drop policy if exists "tw pref own change" on public.tw_pref;
drop policy if exists "tw pref boss" on public.tw_pref;
create policy "org only" on public.tw_pref as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()));
create policy "tw pref read" on public.tw_pref for select to authenticated using ((select public.tw_member()));
create policy "tw pref own add" on public.tw_pref for insert to authenticated with check (person = (select public.tw_me()));
create policy "tw pref own change" on public.tw_pref for update to authenticated using (person = (select public.tw_me())) with check (person = (select public.tw_me()));
create policy "tw pref boss" on public.tw_pref for all to authenticated using ((select public.tw_boss())) with check ((select public.tw_boss()));
drop policy if exists "org only" on public.tw_phone;
drop policy if exists "tw phone read" on public.tw_phone;
drop policy if exists "tw phone own" on public.tw_phone;
drop policy if exists "tw phone boss" on public.tw_phone;
create policy "org only" on public.tw_phone as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()));
create policy "tw phone read" on public.tw_phone for select to authenticated using (person = (select public.tw_me()) or (select public.tw_builder_now()));
create policy "tw phone own" on public.tw_phone for all to authenticated using (person = (select public.tw_me())) with check (person = (select public.tw_me()));
create policy "tw phone boss" on public.tw_phone for all to authenticated using ((select public.tw_boss())) with check ((select public.tw_boss()));
drop policy if exists "org only" on public.tw_problem;
drop policy if exists "tw problem write" on public.tw_problem;
drop policy if exists "tw problem read" on public.tw_problem;
create policy "org only" on public.tw_problem as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()));
create policy "tw problem write" on public.tw_problem for insert to authenticated with check ((select public.tw_member()) and by_staff is not distinct from (select public.my_staff_id()));
create policy "tw problem read" on public.tw_problem for select to authenticated using ((select public.tw_boss()));
-- (tw_notice keeps "update (seen_at)" only: mail_due / mailed_at are written by tw_send_updates and by tw-mail)

revoke all on function public.tw_kind_of(date), public.tw_slots(date), public.tw_summer(date), public.tw_weekend_time(date, text), public.tw_shift_span(date, text),
  public.tw_publish_check(date), public.tw_builder_now(), public.tw_send_updates(date, boolean) from public, anon;
grant execute on function public.tw_kind_of(date), public.tw_slots(date), public.tw_summer(date), public.tw_weekend_time(date, text), public.tw_shift_span(date, text),
  public.tw_publish_check(date), public.tw_builder_now(), public.tw_send_updates(date, boolean) to authenticated;

-- 10. the pilot's template and the draft settings of the organisations (still drafts from the start, made from this template) --------
update public.tw_template set data = '{"cycle":"2weeks","open_days":10,"close_days":5,"remind_hours":24,"publish_days":3,"extra_week_cap":0,
   "rules":{"rest_hours":{"hours":8}},
   "shifts":[
     {"code":"M","name":"בוקר","days":["weekday"],"starts":"07:30","ends":"15:30","sort":1,"needs":[{"dow":-1,"min":2},{"dow":2,"min":3}]},
     {"code":"A","name":"צהריים","days":["weekday"],"starts":"15:00","ends":"23:00","sort":2,"needs":[{"dow":-1,"min":2}]},
     {"code":"N","name":"לילה","days":["weekday"],"starts":"22:30","ends":"08:00","end_day":1,"sort":3,"needs":[{"dow":-1,"min":2}]},
     {"code":"M","name":"בוקר","days":["fri","eve"],"starts":"07:30","ends":"14:30","sort":1,"needs":[{"dow":-1,"min":2}]},
     {"code":"W","name":"סוף שבוע","days":["fri","eve"],"starts":"14:00","ends":"20:30","end_day":1,"weight":1,"sort":2,"needs":[{"dow":-1,"min":2}]},
     {"code":"N","name":"לילה","days":["sat","holiday"],"starts":"20:30","ends":"08:00","end_day":1,"sort":3,"needs":[{"dow":-1,"min":2}]}
   ]}'::jsonb,
  about = 'סידור לשבועיים. בוקר, צהריים ולילה בימי חול, 2 בכל משמרת ו-3 בשלישי בבוקר; בשישי בוקר ומשמרת סוף שבוע עד מוצאי שבת (נספרת כאחת); כל עובד פותח פי 2 אופציות, ומישהו מהצוות בונה.'
  where key = 'balancing';
do $$
declare g record;
begin
  for g in select c.org_id from public.tw_cfg c where c.valid_from = date '2000-01-02' and c.draft and c.template = 'balancing'
           and not exists (select 1 from public.tw_cfg c2 where c2.org_id = c.org_id and c2.id <> c.id) loop
    delete from public.tw_cfg where org_id = g.org_id and valid_from = date '2000-01-02';
    perform public.tw_cfg_from_template(g.org_id, 'balancing', date '2000-01-02', true);
  end loop;
end $$;

-- the purge after 12 months takes the problem reports too
create or replace function public.tw_purge_old() returns int language plpgsql security definer set search_path = public as $$
declare cut date := (current_date - interval '12 months')::date; n int := 0; k int;
begin
  delete from public.tw_option where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_other where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_submission where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_swap where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_build_log where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_notice where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_problem where created_at < cut; get diagnostics k = row_count; n := n + k;
  if to_regclass('public.tw_mail_log') is not null then execute 'delete from public.tw_mail_log where period + 13 < $1' using cut; get diagnostics k = row_count; n := n + k; end if;
  return n;
end $$;
revoke all on function public.tw_purge_old() from public, anon, authenticated;

insert into public.schema_migrations(version) values ('scheduling-v86') on conflict (version) do nothing;
select 'scheduling_v86' as part, 'ok' as result,
       (select count(*) from public.tw_slots(date '2026-12-11')) as friday_shifts,
       (select need from public.tw_slots(date '2026-12-11') where shift = 'M') as friday_morning,
       (select w from public.tw_slots(date '2026-12-11') where shift = 'W') as weekend_counts,
       (select count(*) from pg_class where relname in ('tw_pref', 'tw_phone', 'tw_problem')) as new_tables;
