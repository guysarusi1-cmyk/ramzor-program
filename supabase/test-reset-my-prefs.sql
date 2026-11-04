-- TEST only (Guy 2026-10-30): clears Guy's own preferences for next month on TEST (the marks, his days off, hours, the two questions and the
-- submission), so the "שבוע אחרי שבוע" / "בלי צבעים" screens can be gone through from the first question. Nobody else's data is touched.
-- Safe to run again (each run starts him over).
-- safety: TEST only. On any other database this stops here, before any change (the marker: supabase/test-marker.sql, run once on TEST)
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד הבדיקות (TEST). לא שונה דבר.';
  end if;
end $$;

do $$
declare
  me uuid := (select staff_id from public.staff_private where lower(email) = 'guysarusi1@gmail.com');
  m  date := (date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date;
begin
  if me is null then raise exception 'לא נמצא איש צוות עם המייל של גיא בטסט'; end if;
  delete from public.prefs_slot       where staff_id = me and day >= m and day < m + interval '1 month';
  delete from public.prefs_absence    where staff_id = me and reason = 'self' and day >= m and day < m + interval '1 month';
  delete from public.prefs_hours      where staff_id = me and day >= m and day < m + interval '1 month';
  delete from public.prefs_pickone    where staff_id = me and friday >= m and friday < m + interval '1 month';
  delete from public.prefs_consent    where staff_id = me and month = m;
  delete from public.prefs_submission where staff_id = me and month = m;
end $$;

select 'test_reset_my_prefs' as part, 'ok' as result,
  (select count(*) from public.prefs_submission s join public.staff_private p on p.staff_id = s.staff_id
    where lower(p.email) = 'guysarusi1@gmail.com' and s.month = (date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date) as my_submissions_left;
