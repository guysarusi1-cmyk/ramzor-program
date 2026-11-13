-- ================================================================
-- Scheduling, part 76 — run in the SQL Editor after scheduling-v75.sql. Safe to run again. (Guy 2026-11-13: the second pilot)
-- The two-week schedule: the fixed shifts (who is the fixed person of which shift of the week) may be set also by whoever builds
-- a schedule that is not published yet. Until now only the admin and the coordinator could. (Guy: "גם מי שבונה את הסידור")
-- ================================================================

do $$ begin
  if to_regclass('public.tw_fixed') is null then raise exception 'scheduling-v75.sql first'; end if;
end $$;

-- is the caller building some two weeks right now (chosen as the builder of a period that is not published yet)?
create or replace function public.tw_building() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.builder is not null and t.builder = public.tw_me() and t.status <> 'published')
$$;
revoke all on function public.tw_building() from public, anon;
grant execute on function public.tw_building() to authenticated;

drop policy if exists "tw fixed boss" on public.tw_fixed;
drop policy if exists "tw fixed builder" on public.tw_fixed;
create policy "tw fixed builder" on public.tw_fixed for all to authenticated using ((select public.tw_building())) with check ((select public.tw_building()));

select 'scheduling_v76' as part, 'ok' as result, (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tw_fixed') as fixed_rules;
