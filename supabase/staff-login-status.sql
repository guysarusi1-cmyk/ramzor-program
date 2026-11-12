-- READ ONLY (changes nothing): where the shared staff sign-in (staff@) stands on this database. Run before and after scheduling-v69.sql. (Guy 2026-11-11; the old manager address and removed staff: 2026-11-12)
select 'last sign-in of the shared user' as what, coalesce(to_char(u.last_sign_in_at at time zone 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI'), 'never') as value
  from auth.users u where u.email = 'staff@merkaz-cherum.local'
union all
select 'open sign-ins of the shared user', count(*)::text
  from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'staff@merkaz-cherum.local'
union all
select 'of them used in the last 7 days', count(*)::text
  from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'staff@merkaz-cherum.local' and coalesce(s.refreshed_at, s.updated_at, s.created_at) > now() - interval '7 days'
union all
select 'kids'' screens joined by a code (active)', count(*)::text from public.tv_devices where active
union all
select 'of them seen in the last 7 days', count(*)::text from public.tv_devices where active and last_seen > now() - interval '7 days'
union all
select 'manager user exists', (exists (select 1 from auth.users where email = 'manager@merkaz-cherum.local'))::text
union all
select 'last sign-in of the old manager address', coalesce(to_char(u.last_sign_in_at at time zone 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI'), 'never')
  from auth.users u where u.email = 'manager@merkaz-cherum.local'
union all
select 'open sign-ins of the old manager address', count(*)::text
  from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'manager@merkaz-cherum.local'
union all
select 'staff removed (not active) who still have a sign-in', count(*)::text
  from public.staff s join public.staff_private p on p.staff_id = s.id where not s.active and p.auth_user_id is not null
union all
select 'personal sign-ins in the last 7 days', count(*)::text
  from auth.users u join public.staff_private p on p.auth_user_id = u.id where u.last_sign_in_at > now() - interval '7 days';
