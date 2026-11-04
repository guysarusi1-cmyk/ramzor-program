-- TEST only (Guy 2026-10-30): open the submission of preferences for a month on TEST, even after the coordinator asked for a build,
-- so the new "שבוע אחרי שבוע" / "בלי צבעים" screens (made for רעות) can be tried. Live is never touched: the guard below stops on any other database.
-- To close it again: delete from public.test_prefs_open;   Safe to run again.
-- safety: TEST only. On any other database this stops here, before any change (the marker: supabase/test-marker.sql, run once on TEST)
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד הבדיקות (TEST). לא שונה דבר.';
  end if;
end $$;

-- the months held open on TEST
create table if not exists public.test_prefs_open(month date primary key);
alter table public.test_prefs_open enable row level security;

-- as in scheduling-v34.sql, plus: a month listed in test_prefs_open is open (TEST only)
create or replace function public.prefs_open(m date) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.test_prefs_open t where t.month = date_trunc('month', m::timestamp)::date)
     or ((now() at time zone 'Asia/Jerusalem') >= (date_trunc('month', m::timestamp) - interval '1 month')
     and (now() at time zone 'Asia/Jerusalem') <  date_trunc('month', m::timestamp)
     and not exists (select 1 from public.sched_requests r where r.month = date_trunc('month', m::timestamp)::date))
$$;
grant execute on function public.prefs_open(date) to authenticated;

-- next month (on 30 Oct 2026: November) open for submitting
insert into public.test_prefs_open(month)
  values ((date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date)
  on conflict do nothing;

select 'test_prefs_open' as part, 'ok' as result,
  public.prefs_open((date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date) as next_month_open;
