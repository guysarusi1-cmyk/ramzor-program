-- ================================================================
-- Scheduling, part 77 — run in the SQL Editor after scheduling-v76.sql. Safe to run again. (Guy 2026-11-14: the product's preferences screen)
-- The two-week schedule: preferences instead of plain options.
--   * every marked shift has a level: 'yes' (wants it) or 'can' (only if needed); a shift that is not marked is "no";
--   * "other hours": on a day a person may offer hours of her own (from – to) instead of a whole shift;
--   * a person changes her own marks one by one while the period is open (every tap is saved at once), so she also needs the right to UPDATE her row.
-- Nothing else changes: the same tables, the same people may read and write.
-- ================================================================

do $$ begin
  if to_regprocedure('public.tw_building()') is null then raise exception 'scheduling-v76.sql first'; end if;
end $$;

alter table public.tw_option add column if not exists level text not null default 'yes';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tw_option_level_check') then
    alter table public.tw_option add constraint tw_option_level_check check (level in ('yes', 'can'));
  end if;
end $$;

drop policy if exists "tw option own change" on public.tw_option;
create policy "tw option own change" on public.tw_option for update to authenticated
  using (person = (select public.tw_me()) and public.tw_open(period)) with check (person = (select public.tw_me()) and public.tw_open(period));

create table if not exists public.tw_other (
  period date not null references public.tw_period(start) on delete cascade,
  person uuid not null references public.tw_people(id) on delete cascade,
  day date not null,
  from_time time not null, to_time time not null,          -- (to_time before from_time: until the next morning)
  primary key (period, person, day)
);
alter table public.tw_other enable row level security;
revoke all on public.tw_other from anon, public;
grant select, insert, update, delete on public.tw_other to authenticated;

drop policy if exists "tw other read" on public.tw_other;
drop policy if exists "tw other own add" on public.tw_other;
drop policy if exists "tw other own change" on public.tw_other;
drop policy if exists "tw other own remove" on public.tw_other;
drop policy if exists "tw other builder" on public.tw_other;
create policy "tw other read" on public.tw_other for select to authenticated using (person = (select public.tw_me()) or public.tw_builder(period));
create policy "tw other own add" on public.tw_other for insert to authenticated with check (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw other own change" on public.tw_other for update to authenticated
  using (person = (select public.tw_me()) and public.tw_open(period)) with check (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw other own remove" on public.tw_other for delete to authenticated using (person = (select public.tw_me()) and public.tw_open(period));
create policy "tw other builder" on public.tw_other for all to authenticated using (public.tw_builder(period)) with check (public.tw_builder(period));

select 'scheduling_v77' as part, 'ok' as result,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tw_option' and column_name = 'level') as level_column,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tw_other') as other_rules;
