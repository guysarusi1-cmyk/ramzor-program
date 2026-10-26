-- scheduling v38 (2026-10-26): "בנייה מחדש של הסידור" with two choices (Guy). Run once, after v37, on each project. Safe to run again. Adds only; changes no data.
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

select 'scheduling_v38' as part, 'ok' as result;
