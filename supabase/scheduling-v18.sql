-- ================================================================
-- Scheduling, part 18 — run in the SQL Editor after scheduling-v17.sql. Safe to run again.
--   * "admin" becomes a flag of a person instead of a kind of his own: an instructor can also be the admin
--     (he hands in preferences and is scheduled like everybody, and he has the management portal with every coordinator right)
--   * (who is the admin is set by a separate line that is not kept here)
-- ================================================================
alter table public.staff_private add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and s.active and (s.kind = 'admin' or p.is_admin))
$$;
create or replace function public.is_coordinator() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_manager(), false) or public.is_admin() or exists (
    select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
    where p.auth_user_id = auth.uid() and s.kind = 'coordinator' and s.active)
$$;
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('female', p.female, 'no_nights', p.no_nights, 'only_long', p.only_long_weekend, 'manual_only', p.manual_only, 'latest_end', p.latest_end_hour,
                            'kind', s.kind, 'ahmash', p.ahmash_rank, 'admin', public.is_admin(), 'control', public.can_control())
  from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = public.my_staff_id()
$$;
revoke all on function public.is_admin(), public.my_profile() from public, anon;
grant execute on function public.is_admin(), public.my_profile() to authenticated;

select 'scheduling_v18' as part, 'ok' as result, (select count(*) from public.staff_private where is_admin) as admins;
