-- ================================================================
-- The pilot's start (the balancing home, Guy 19.11.2026) — run in the SQL Editor of the product's database (mercury-shibutzim), AFTER
-- scheduling-v83.sql, scheduling-v85.sql, scheduling-v86.sql and scheduling-v87.sql, and BEFORE any real person is added. Only on Guy's explicit word.
-- It has no names and no personal details. What it does, inside the organisation set on the next line:
--   1. stops if somebody with a sign-in is already on the list (real staff: then nothing is touched);
--   2. removes the invented people of the demo and everything of the demo (two weeks, hand-ins, the schedule, swaps, messages, notices);
--   3. the pilot's settings: the hand-in opens 17 days before and closes 10 days before (26.11 for the two weeks from 6.12), the weekend
--      shift Friday 14:00 to Saturday 20:30 in winter and in summer (Guy sends the summer hours later), rest 8 hours, no builders'
--      queue (Guy 20.11: the local admin builds; she may set a queue later). With scheduling-v87.sql the next two weeks then open by
--      themselves, 17 days before, with no builder set (the admins build);
--   4. opens the first two weeks, 6.12–19.12, for hand-in until Thursday 26.11 at 23:59 (Israel); the builder is chosen on the site.
-- Safe to run again (the second time it finds nothing of the demo, and the two weeks are already there).
-- ================================================================
select set_config('app.org', 'demo', false);          -- (the pilot organisation's address on the site: config/org-shibutz.local.json orgSlug)

do $$
declare o uuid := public.current_org(); n int;
begin
  if o is null then raise exception 'no organisation: check the line set_config(''app.org'', ...) above'; end if;
  if not exists (select 1 from public.schema_migrations where version = 'scheduling-v86') then raise exception 'scheduling-v86.sql first'; end if;
  if exists (select 1 from public.tw_people where org_id = o and staff_id is not null) then
    raise exception 'there is already somebody with a sign-in on the list: nothing was changed (this file is only for before the real staff)';
  end if;
  -- 2. the demo goes
  delete from public.tw_message where org_id = o;
  delete from public.tw_period where org_id = o;          -- (with them: hand-ins, other hours, the schedule, swaps, notices, build logs, mail log)
  delete from public.tw_fixed where org_id = o;
  delete from public.tw_people where org_id = o and staff_id is null;
  -- 3. the pilot's settings
  insert into public.tw_settings(org_id, key, value) values
    (o, 'open_days', '17'::jsonb), (o, 'close_days', '10'::jsonb), (o, 'queue', '[]'::jsonb), (o, 'rest_hours', '8'::jsonb),
    (o, 'weekend_hours', '{"winter":{"start":"14:00","end":"20:30"},"summer":{"start":"14:00","end":"20:30"}}'::jsonb)
  on conflict (org_id, key) do update set value = excluded.value;
  -- 4. the first two weeks
  insert into public.tw_period(org_id, start, status, deadline)
    values (o, date '2026-12-06', 'open', (date '2026-11-26' + time '23:59') at time zone 'Asia/Jerusalem')
  on conflict do nothing;
  select count(*) into n from public.tw_people where org_id = o;
  raise notice 'people left on the list: %', n;
end $$;

select 'pilot_start' as part, 'ok' as result,
       (select count(*) from public.tw_people where org_id = public.current_org()) as people_on_list,
       (select string_agg(start::text || ' ' || status || ' until ' || to_char(deadline at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI'), ', ')
          from public.tw_period where org_id = public.current_org()) as two_weeks,
       (select value::text from public.tw_settings where org_id = public.current_org() and key = 'close_days') as close_days;
