-- scheduling v34 (2026-10-22): the submission of a month stays open after the 24th, until the coordinator presses
-- "צור סידור אוטומטי" (Guy). Run once, after v33. Safe to run again.
--   * prefs_open(m): from the 1st of the month before, until a build of that month was asked for (or the month began).
--     The 24th at 22:30 stays the date the staff are told; who is late can still hand in until the coordinator presses.
--   * prefs_deadline_passed(m): the 24th at 22:30 has passed — from then on the coordinator may press the button.

create or replace function public.prefs_deadline_passed(m date) returns boolean language sql stable as $$
  select (now() at time zone 'Asia/Jerusalem') >= (date_trunc('month', m::timestamp) - interval '1 month' + interval '23 days 22 hours 30 minutes')
$$;
create or replace function public.prefs_open(m date) returns boolean language sql stable security definer set search_path = public as $$
  select (now() at time zone 'Asia/Jerusalem') >= (date_trunc('month', m::timestamp) - interval '1 month')
     and (now() at time zone 'Asia/Jerusalem') <  date_trunc('month', m::timestamp)
     and not exists (select 1 from public.sched_requests r where r.month = date_trunc('month', m::timestamp)::date)
$$;
grant execute on function public.prefs_open(date), public.prefs_deadline_passed(date) to authenticated;

-- the coordinator presses from the 24th at 22:30 on (pressing is what closes the submission)
drop policy if exists "coordinator requests 2" on public.sched_requests;
create policy "coordinator requests 2" on public.sched_requests for insert to authenticated
  with check (public.is_coordinator() and requested_by = public.my_staff_id() and public.prefs_deadline_passed(month));

select 'scheduling_v34' as part, 'ok' as result,
  public.prefs_open((date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date) as next_month_open;
