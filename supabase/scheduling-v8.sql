-- ================================================================
-- Scheduling, part 8 — run in the SQL Editor after scheduling-v7.sql. Safe to run again.
--   * "only one of these weekends": the Fridays a person marked (the system will give her exactly one of them)
--   * the person's own setting that shows that choice on her preferences screen
-- ================================================================
create table if not exists public.prefs_pickone (
  staff_id  uuid not null references public.staff(id) on delete cascade,
  friday    date not null check (extract(dow from friday) = 5),
  primary key (staff_id, friday)
);
alter table public.prefs_pickone enable row level security;
drop policy if exists "own pickone read"   on public.prefs_pickone;
drop policy if exists "own pickone add"    on public.prefs_pickone;
drop policy if exists "own pickone delete" on public.prefs_pickone;
drop policy if exists "see pickone"        on public.prefs_pickone;
create policy "own pickone read"   on public.prefs_pickone for select to authenticated using (staff_id = public.my_staff_id());
create policy "own pickone add"    on public.prefs_pickone for insert to authenticated with check (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', friday::timestamp)::date));
create policy "own pickone delete" on public.prefs_pickone for delete to authenticated using (staff_id = public.my_staff_id() and public.prefs_open(date_trunc('month', friday::timestamp)::date));
create policy "see pickone"        on public.prefs_pickone for select to authenticated using (public.is_coordinator());
grant select, insert, delete on public.prefs_pickone to authenticated;
revoke all on public.prefs_pickone from anon;
grant select, insert, update, delete on public.prefs_pickone to service_role;

alter table public.staff_settings add column if not exists pick_one boolean not null default false;

select 'scheduling_v8' as part, 'ok' as result;
