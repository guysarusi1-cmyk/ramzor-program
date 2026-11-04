-- ================================================================
-- Scheduling, part 56 — run in the SQL Editor after scheduling-v55.sql. Safe to run again. (Guy 2026-11-03)
-- 1. The children's diary: a fourth kind, "אחר", with a few words of its own (besides שיחה / פגישה / יציאה).
-- 2. The weekend taxis: a permanent address for each instructor. It fills both the arrival and the return of every shift;
--    a different address for one trip is kept on that trip only, and the panel asks whether to make it the permanent one.
--    Read and written by who may see the on-call panel (public.can_oncall(): the social workers, the coordinator, the admin).
-- ================================================================

alter table public.child_diary drop constraint if exists child_diary_kind_check;
alter table public.child_diary add constraint child_diary_kind_check check (kind in ('call', 'meeting', 'outing', 'other'));
alter table public.child_diary add column if not exists kind_text text check (kind_text is null or length(kind_text) <= 40);          -- ("אחר": what it is, in a few words)

create table if not exists public.oncall_address (
  staff_id   uuid primary key references public.staff(id) on delete cascade,
  address    text not null check (length(address) between 1 and 120),
  updated_by uuid default public.my_staff_id(),
  updated_at timestamptz not null default now()
);
alter table public.oncall_address enable row level security;
drop policy if exists "oncall address read" on public.oncall_address;
drop policy if exists "oncall address write" on public.oncall_address;
drop policy if exists "oncall address change" on public.oncall_address;
create policy "oncall address read" on public.oncall_address for select to authenticated using (public.can_oncall());
create policy "oncall address write" on public.oncall_address for insert to authenticated with check (public.can_oncall());
create policy "oncall address change" on public.oncall_address for update to authenticated using (public.can_oncall()) with check (public.can_oncall());
grant select, insert, update on public.oncall_address to authenticated;

select 'scheduling_v56' as part, 'ok' as result;
