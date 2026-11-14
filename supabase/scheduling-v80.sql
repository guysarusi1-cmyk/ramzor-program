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
