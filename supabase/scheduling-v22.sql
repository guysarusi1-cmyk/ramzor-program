-- ================================================================
-- Scheduling, part 22 — run in the SQL Editor after scheduling-v21.sql. Safe to run again.
--   * speed: a person's notices are found by an index (they were read row by row, about 2 seconds at every entry to the portal)
--   * the policy asks "who am I" once per query instead of once per row
-- ================================================================
create index if not exists notices_to_staff_created on public.notices (to_staff, created_at desc);

drop policy if exists "own notices" on public.notices;
create policy "own notices" on public.notices for select to authenticated using (to_staff = (select public.my_staff_id()));
drop policy if exists "mark my notice" on public.notices;
create policy "mark my notice" on public.notices for update to authenticated using (to_staff = (select public.my_staff_id())) with check (to_staff = (select public.my_staff_id()));

select 'scheduling_v22' as part, 'ok' as result;
