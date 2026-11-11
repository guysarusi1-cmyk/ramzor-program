-- ================================================================
-- Scheduling, part 69 — run in the SQL Editor after scheduling-v62.sql. Safe to run again. (Guy 2026-11-11)
-- The shared staff sign-in (staff@) is cancelled:
--   1. is_staff(): the shared address no longer counts as staff. Only the TEST database keeps it, for the automatic checks
--      (TEST = the marker of supabase/test-marker.sql). The manager's address and every personal sign-in are as before.
--   2. Not on TEST: the shared user's password becomes a long random one that is made here and written nowhere (nobody knows it),
--      and every open sign-in of the shared user is closed (its sessions and refresh tokens). Nobody else is touched.
-- An access token already given out may keep working for up to an hour; after this file it gives no staff rights anyway.
-- ================================================================

do $$ begin
  if to_regprocedure('public.is_secretary()') is null then raise exception 'scheduling-v62.sql first'; end if;
end $$;

-- is this the TEST database? (the marker table exists only there; read with execute, so that this also compiles where it is missing)
create or replace function public.is_test_env() returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  if to_regclass('ops.environment') is null then return false; end if;
  execute 'select exists (select 1 from ops.environment where name = ''test'')' into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.is_test_env() from public, anon;
grant execute on function public.is_test_env() to authenticated;

-- the Ramzor data: the manager, every personal sign-in of the staff; the shared address only on TEST
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'manager@merkaz-cherum.local'
      or (coalesce(auth.jwt() ->> 'email', '') = 'staff@merkaz-cherum.local' and public.is_test_env())
      or exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and s.active and s.kind in ('instructor', 'coordinator', 'admin', 'secretary'))
$$;

-- not on TEST: close every open sign-in of the shared user
do $$
declare uid uuid; n_s int := 0; n_r int := 0;
begin
  if public.is_test_env() then raise notice 'TEST: the shared user stays (the automatic checks use it)'; return; end if;
  select id into uid from auth.users where email = 'staff@merkaz-cherum.local';
  if uid is null then raise notice 'no shared user here: nothing to close'; return; end if;
  update auth.users set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')), updated_at = now() where id = uid;
  delete from auth.refresh_tokens where user_id = uid::text;
  get diagnostics n_r = row_count;
  delete from auth.sessions where user_id = uid;
  get diagnostics n_s = row_count;
  raise notice 'shared user: a new random password, % session(s) and % refresh token(s) closed', n_s, n_r;
end $$;

-- the result: is the shared address still staff here, and how many open sign-ins it has
select 'v69' as part,
       case when public.is_test_env() then 'TEST: the shared user stays' else 'the shared user is not staff any more' end as result,
       (select count(*) from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'staff@merkaz-cherum.local') as open_sessions;
