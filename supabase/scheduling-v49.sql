-- ================================================================
-- Scheduling, part 49 — run in the SQL Editor after scheduling-v48.sql. Safe to run again. (Guy 2026-11-03)
--   * the preferences screen opens week by week and without colours for everybody, unless the person chose otherwise
--     ("תצוגת העדפות"); only the instructor's screen changes — the marks and the coordinator's colours stay as they are
--   * pref_view_set: the person (or the admin) chose the view; until then the new defaults apply
-- ================================================================

alter table public.staff_settings add column if not exists pref_view_set boolean not null default false;
alter table public.staff_settings alter column pref_weekly set default true;
alter table public.staff_settings alter column pref_plain set default true;
update public.staff_settings set pref_weekly = true, pref_plain = true where not pref_view_set;          -- (nobody chose yet: the new defaults)

create or replace function public.set_simple_prefs(p_staff uuid, p_weekly boolean, p_plain boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into public.staff_settings (staff_id, pref_weekly, pref_plain, pref_view_set) values (p_staff, coalesce(p_weekly, true), coalesce(p_plain, true), true)
  on conflict (staff_id) do update set pref_weekly = excluded.pref_weekly, pref_plain = excluded.pref_plain, pref_view_set = true, updated_at = now();
end $$;
revoke all on function public.set_simple_prefs(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_simple_prefs(uuid, boolean, boolean) to authenticated;

select 'scheduling_v49' as part, 'ok' as result;
