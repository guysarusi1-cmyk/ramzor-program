-- ================================================================
-- Scheduling, part 10 — run in the SQL Editor after scheduling-v9.sql. Safe to run again.
--   * who is an ahmash (the person in charge of a shift) — so that the team calendar can mark them for everybody.
--     Only the fact that a person is an ahmash and her rank are shown; nothing else from the private details.
-- ================================================================
create or replace function public.ahmash_staff() returns table (staff_id uuid, rank int)
language sql stable security definer set search_path = public as $$
  select p.staff_id, p.ahmash_rank::int from public.staff_private p join public.staff s on s.id = p.staff_id
  where coalesce(p.ahmash_rank, 0) > 0 and s.active and public.my_staff_id() is not null
$$;
revoke all on function public.ahmash_staff() from public, anon;
grant execute on function public.ahmash_staff() to authenticated, service_role;

select 'scheduling_v10' as part, 'ok' as result;
