-- ================================================================
-- Scheduling, part 48 — run in the SQL Editor after scheduling-v46.sql. Safe to run again. (Guy 2026-10-30, for רעות)
--   * two settings of the preferences screen, each instructor her own: "שבוע אחרי שבוע" (one week at a time) and "בלי צבעים"
--     (taps: a dot = not marked yet, bold = yes, faded = no). Only the screen changes: the marks are kept as for everyone.
--   * the weekdays she never comes (her settings), marked "לא" for her at the start of every month
--   * the admin (only) may switch the two settings on or off for somebody
-- ================================================================

alter table public.staff_settings add column if not exists pref_weekly boolean not null default false;
alter table public.staff_settings add column if not exists pref_plain boolean not null default false;
alter table public.staff_settings add column if not exists fixed_no_days int[] not null default '{}';          -- (0 = Sunday ... 6 = Saturday)

create or replace function public.set_simple_prefs(p_staff uuid, p_weekly boolean, p_plain boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into public.staff_settings (staff_id, pref_weekly, pref_plain) values (p_staff, coalesce(p_weekly, false), coalesce(p_plain, false))
  on conflict (staff_id) do update set pref_weekly = excluded.pref_weekly, pref_plain = excluded.pref_plain, updated_at = now();
end $$;
revoke all on function public.set_simple_prefs(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_simple_prefs(uuid, boolean, boolean) to authenticated;

select 'scheduling_v48' as part, 'ok' as result;
