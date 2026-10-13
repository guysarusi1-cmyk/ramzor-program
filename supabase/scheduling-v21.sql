-- ================================================================
-- Scheduling, part 21 — run in the SQL Editor after scheduling-v20.sql. Safe to run again.
--   * a phone number for every person (seen only by the coordinator and the admin, like the e-mail): the coordinator can open a
--     WhatsApp chat with an instructor before placing her in a shift she marked "no" or did not mark
-- ================================================================
alter table public.staff_private add column if not exists phone text;
select 'scheduling_v21' as part, 'ok' as result;
