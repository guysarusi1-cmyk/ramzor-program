-- ================================================================
-- Scheduling, part 16 — run in the SQL Editor after scheduling-v15.sql. Safe to run again.
--   * the look of the portal kept with the person (the coordinator's leopard look follows her to every device)
-- ================================================================
alter table public.staff_settings add column if not exists portal_theme text;
alter table public.staff_settings drop constraint if exists staff_settings_theme_check;
alter table public.staff_settings add constraint staff_settings_theme_check check (portal_theme is null or portal_theme in ('dark', 'light', 'leopard'));
select 'scheduling_v16' as part, 'ok' as result;
