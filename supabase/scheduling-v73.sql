-- ================================================================
-- Scheduling, part 73 — run in the SQL Editor after scheduling-v72.sql AND after the site that opens the management screen to the
-- admin is up. Safe to run again. (Guy 2026-11-12, task 3: the rights matrix)
-- The old manager address (manager@) is cancelled, the same way as the shared staff address in scheduling-v69.sql:
--   1. is_manager() and is_staff(): the manager address no longer counts. Only the TEST database keeps it, for the automatic checks.
--   2. Not on TEST: its password becomes a long random one that is made here and written nowhere (nobody knows it), and every open
--      sign-in of it is closed (its sessions and refresh tokens). Nobody else is touched.
-- An access token already given out may keep working for up to an hour; after this file it gives no rights anyway.
-- ================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mini_lists' and policyname = 'admin lists') then raise exception 'scheduling-v72.sql first'; end if;
end $$;

-- (security definer: is_test_env() is closed to a visitor who is not signed in, and is_manager() is asked for such visitors too)
create or replace function public.is_manager() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'manager@merkaz-cherum.local' and public.is_test_env()
$$;

-- the Ramzor data: every personal sign-in of the staff; the manager address and the shared address only on TEST
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select (coalesce(auth.jwt() ->> 'email', '') in ('manager@merkaz-cherum.local', 'staff@merkaz-cherum.local') and public.is_test_env())
      or exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and s.active and s.kind in ('instructor', 'coordinator', 'admin', 'secretary'))
$$;

-- not on TEST: close every open sign-in of the manager address
do $$
declare uid uuid; n_s int := 0; n_r int := 0;
begin
  if public.is_test_env() then raise notice 'TEST: the manager address stays (the automatic checks use it)'; return; end if;
  select id into uid from auth.users where email = 'manager@merkaz-cherum.local';
  if uid is null then raise notice 'no manager address here: nothing to close'; return; end if;
  update auth.users set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')), updated_at = now() where id = uid;
  delete from auth.refresh_tokens where user_id = uid::text;
  get diagnostics n_r = row_count;
  delete from auth.sessions where user_id = uid;
  get diagnostics n_s = row_count;
  raise notice 'manager address: a new random password, % session(s) and % refresh token(s) closed', n_s, n_r;
end $$;

select 'v73' as part,
       case when public.is_test_env() then 'TEST: the manager address stays' else 'the manager address is cancelled' end as result,
       (select count(*) from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'manager@merkaz-cherum.local') as open_sessions;
