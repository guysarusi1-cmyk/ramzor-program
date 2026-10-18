-- scheduling v29 (2026-10-18): a day opened for sign-up can be for "ahmash and leaders" together (Guy). Run once, after v28. Safe to run again.
--   * the choices of the coordinator are now: everybody / only ahmash / ahmash and leaders ("only leaders" is no longer offered; an old day keeps working)

alter table public.open_days drop constraint if exists open_days_audience_check;
alter table public.open_days add constraint open_days_audience_check check (audience in ('all', 'ahmash', 'leader', 'ahmash_leader'));

create or replace function public.open_day_fits(o public.open_days, p_staff uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id where s.id = p_staff and s.active and s.kind = 'instructor'
                 and (o.audience = 'all'
                      or (o.audience = 'ahmash' and coalesce(p.ahmash_rank, 0) > 0)
                      or (o.audience = 'leader' and coalesce(p.is_leader, false))
                      or (o.audience = 'ahmash_leader' and (coalesce(p.ahmash_rank, 0) > 0 or coalesce(p.is_leader, false)))))
$$;
revoke all on function public.open_day_fits(public.open_days, uuid) from public, anon, authenticated;

select 'scheduling_v29' as part, 'ok' as result;
