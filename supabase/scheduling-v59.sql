-- v59 (Guy 2026-11-04): the manager of the framework.
--   * the weekend on-call panel: she may work in it as the social workers do
--   * reading only: everything the Ramzor's staff and the coordinator read, so that she can open the Ramzor to look, and see a person's screen in the "משתמשים" tab.
--     SELECT rules only: she gets no new right to change anything. staff_private (phones, e-mails, personal rules) stays closed to her.
-- Safe to run again.
create or replace function public.can_oncall() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_coordinator(), false) or coalesce(public.is_admin(), false) or coalesce(public.is_therapist(), false) or coalesce(public.is_director(), false)
$$;
revoke all on function public.can_oncall() from public, anon;
grant execute on function public.can_oncall() to authenticated;

do $$
declare t text;
begin
  for t in
    select distinct tablename from pg_policies
    where schemaname = 'public' and cmd in ('SELECT', 'ALL') and (qual ilike '%is_staff()%' or qual ilike '%is_coordinator()%' or qual ilike '%can_control()%')
      and tablename not in ('staff_private')
  loop
    execute format('drop policy if exists "director reads" on public.%I', t);
    execute format('create policy "director reads" on public.%I for select to authenticated using (public.is_director())', t);
  end loop;
end $$;
