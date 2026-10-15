-- ================================================================
-- Scheduling, part 27 — run in the SQL Editor after scheduling-v26.sql. Safe to run again.
--   * fixed preferences, chosen by the person in the gear: "does not do mornings / afternoons / nights" (one or more).
--     Those shifts start as "no" in her preferences; she can still change a single shift by pressing it. The engine treats a shift of
--     that kind that she did not mark as "no".
-- ================================================================
alter table public.staff_settings add column if not exists fixed_no text[] not null default '{}'
  check (fixed_no <@ array['m', 'e', 'n']::text[]);          -- (m = mornings, e = afternoons, n = nights)
select 'scheduling_v27' as part, 'ok' as result;
