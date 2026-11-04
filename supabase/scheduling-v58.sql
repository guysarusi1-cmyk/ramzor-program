-- ================================================================
-- Scheduling, part 58 — run in the SQL Editor after scheduling-v57.sql. Safe to run again. (2026-11-04)
-- The two small questions of the preferences get a fourth answer, "לא רלוונטי": marked by itself for who chose no morning shift at all
-- (the extension to 16:00) or no Saturday night at all (going on to Sunday 11:00), and open to be pressed by hand.
-- For the engine it is a plain "no": extend_morning / pull_to_sunday stay false, exactly as with "תבדקו איתי"; only the answer is kept.
-- ================================================================

alter table public.prefs_consent add column if not exists extend_na boolean not null default false;
alter table public.prefs_consent add column if not exists pull_na boolean not null default false;

select 'scheduling_v58' as part, 'ok' as result;
