-- ================================================================
-- Scheduling, part 72 — run in the SQL Editor after scheduling-v71.sql. Safe to run again. (Guy 2026-11-12, task 3: the rights matrix)
-- The management screen moves from the old manager address (manager@, a password that several people could know) to the personal
-- sign-in of the admin. This file only ADDS: what was allowed to the manager address alone is now allowed to the admin too:
--   1. every list of the Ramzor (mini_lists): add, change, delete;
--   2. deleting a child's board (child_state), and lowering the counters of a board (resetting the boards).
-- Nothing is taken from anybody here. The manager address itself is cancelled in scheduling-v73.sql, after the site is updated.
-- ================================================================

do $$ begin
  if to_regprocedure('public.is_active_staff()') is null then raise exception 'scheduling-v70.sql first'; end if;
end $$;

drop policy if exists "admin lists"   on public.mini_lists;
drop policy if exists "admin lists 2" on public.mini_lists;
drop policy if exists "admin lists 3" on public.mini_lists;
create policy "admin lists"   on public.mini_lists for insert to authenticated with check (public.is_admin());
create policy "admin lists 2" on public.mini_lists for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin lists 3" on public.mini_lists for delete to authenticated using (public.is_admin());

drop policy if exists "admin boards" on public.child_state;
create policy "admin boards" on public.child_state for delete to authenticated using (public.is_admin());

-- the boards guard: as scheduling-v62.sql, and the admin may reset like the manager
create or replace function public.child_state_guard() returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'authenticated' or public.is_manager() or public.is_admin() then
    return coalesce(new, old);                         -- the SQL editor / the manager / the admin
  end if;
  if tg_op = 'UPDATE' and ((new.stars < old.stars - 1 and not public.is_secretary())
                           or new.moon_steps < old.moon_steps - 1 or new.mercury_steps < old.mercury_steps - 1 or new.moon_gifts < old.moon_gifts - 1 or new.bricks < old.bricks - 1) then
    raise exception 'only the manager may reset the boards';
  end if;
  return new;
end $$;

select 'scheduling_v72' as part, 'ok' as result,
       (select count(*) from pg_policies where schemaname = 'public' and policyname in ('admin lists', 'admin lists 2', 'admin lists 3', 'admin boards')) as admin_rules;
