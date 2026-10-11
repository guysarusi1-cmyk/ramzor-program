-- ================================================================
-- Scheduling, part 19 — run in the SQL Editor after scheduling-v18.sql. Safe to run again.
--   * the management portal: a request to build a month's schedule again (the hourly job does it, then marks the request done)
--   * the numbers of the rules can be changed from the management portal (sched_settings key "weights"; the engine reads them)
-- ================================================================
create table if not exists public.sched_requests (
  id           uuid primary key default gen_random_uuid(),
  month        date not null,
  kind         text not null default 'rebuild' check (kind in ('rebuild')),
  requested_by uuid references public.staff(id) on delete set null,
  at           timestamptz not null default now(),
  done_at      timestamptz,
  result       text
);
alter table public.sched_requests enable row level security;
drop policy if exists "admin requests"   on public.sched_requests;
drop policy if exists "admin requests 2" on public.sched_requests;
create policy "admin requests"   on public.sched_requests for select to authenticated using (public.is_admin());
create policy "admin requests 2" on public.sched_requests for insert to authenticated with check (public.is_admin() and requested_by = public.my_staff_id());
grant select, insert on public.sched_requests to authenticated;
revoke all on public.sched_requests from anon;

insert into public.sched_settings (key, value) values ('weights', '{}') on conflict (key) do nothing;

select 'scheduling_v19' as part, 'ok' as result;
