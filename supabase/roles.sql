-- ================================================================
-- Roles for "תכנית הרמזור": instructors vs. manager — run ONCE in the Supabase SQL Editor of each project
-- (the test project first, then the live one). Safe to run again. Run AFTER supabase/hardening.sql.
--
-- Before running, create the manager's login:  Authentication -> Users -> Add user -> Create new user
--     email:    manager@merkaz-cherum.local     password: (a long one that only the manager knows)
--     tick "Auto Confirm User".
--
-- What this does
--   * Only two e-mail addresses count as staff:  staff@merkaz-cherum.local (the instructors' shared login)
--     and manager@merkaz-cherum.local.  Anyone else who might sign up gets NO access at all — not even to read.
--   * Instructors can do everything the daily work needs: give stars, record steps, revoke bonuses.
--   * ONLY the manager can: add / change / delete children, change the lists (bonuses, duties, ships,
--     social workers) and lower or reset the boards. The database enforces it, not just the screen.
--   * The kids' TV (not signed in) still reads what it shows — nothing else changed for it.
-- ================================================================

-- the wall project (פרויקט הלבנים): every child builds a wall of 100 bricks; the instructors add the bricks
alter table public.child_state add column if not exists bricks int not null default 0;

-- who is who (taken from the signed login, which cannot be forged)
create or replace function public.is_staff() returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('staff@merkaz-cherum.local', 'manager@merkaz-cherum.local')
$$;
create or replace function public.is_manager() returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'manager@merkaz-cherum.local'
$$;

-- start from a clean list of rules on these tables
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('roster','child_state','mini_lists','feedback_events','bonus_revocations')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.roster            enable row level security;
alter table public.child_state       enable row level security;
alter table public.mini_lists        enable row level security;
alter table public.feedback_events   enable row level security;
alter table public.bonus_revocations enable row level security;

-- reading: the TV (not signed in) sees what it shows (for the roster the columns are limited by hardening.sql);
-- signed-in people see everything only if they are staff
create policy "tv read"    on public.roster            for select to anon using (true);
create policy "tv read"    on public.child_state       for select to anon using (true);
create policy "tv read"    on public.mini_lists        for select to anon using (true);
create policy "tv read"    on public.feedback_events   for select to anon using (true);
create policy "tv read"    on public.bonus_revocations for select to anon using (true);
create policy "staff read" on public.roster            for select to authenticated using (public.is_staff());
create policy "staff read" on public.child_state       for select to authenticated using (public.is_staff());
create policy "staff read" on public.mini_lists        for select to authenticated using (public.is_staff());
create policy "staff read" on public.feedback_events   for select to authenticated using (public.is_staff());
create policy "staff read" on public.bonus_revocations for select to authenticated using (public.is_staff());

-- daily work (instructors and manager)
create policy "staff add star or step" on public.child_state       for insert to authenticated with check (public.is_staff());
create policy "staff change progress"  on public.child_state       for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff log"              on public.feedback_events   for insert to authenticated with check (public.is_staff());
create policy "staff revoke"           on public.bonus_revocations for insert to authenticated with check (public.is_staff());
create policy "staff take back"        on public.bonus_revocations for delete to authenticated using (public.is_staff());

-- management (manager only)
create policy "manager children"   on public.roster      for insert to authenticated with check (public.is_manager());
create policy "manager children 2" on public.roster      for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "manager children 3" on public.roster      for delete to authenticated using (public.is_manager());
create policy "manager lists"      on public.mini_lists  for insert to authenticated with check (public.is_manager());
create policy "manager lists 2"    on public.mini_lists  for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "manager lists 3"    on public.mini_lists  for delete to authenticated using (public.is_manager());
create policy "manager boards"     on public.child_state for delete to authenticated using (public.is_manager());

-- instructors may add to the boards, or take back ONE step; only the manager can lower them further (= reset)
create or replace function public.child_state_guard() returns trigger language plpgsql as $$
begin
  if auth.role() is distinct from 'authenticated' or public.is_manager() then
    return coalesce(new, old);                         -- the SQL editor / the manager
  end if;
  if tg_op = 'UPDATE' and (new.stars < old.stars - 1 or new.moon_steps < old.moon_steps - 1
                           or new.mercury_steps < old.mercury_steps - 1 or new.moon_gifts < old.moon_gifts - 1 or new.bricks < old.bricks - 1) then
    raise exception 'only the manager may reset the boards';
  end if;
  return new;
end $$;
drop trigger if exists child_state_guard on public.child_state;
create trigger child_state_guard before update on public.child_state for each row execute function public.child_state_guard();

-- (the grants from the earlier scripts stay: the policies above decide who may actually do what)
grant select on public.roster to authenticated;
grant select (id, first_name, last_initial) on public.roster to anon;
grant select on public.child_state, public.mini_lists, public.feedback_events, public.bonus_revocations to anon, authenticated;
grant insert, update, delete on public.roster, public.child_state, public.mini_lists to authenticated;
grant insert on public.feedback_events to authenticated;
grant insert, delete on public.bonus_revocations to authenticated;

-- Also, in Supabase: Authentication -> Sign In / Providers -> Email -> turn OFF "Allow new users to sign up".
