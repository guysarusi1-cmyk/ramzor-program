-- ================================================================
-- Scheduling, part 54 — run in the SQL Editor after scheduling-v53.sql. Safe to run again. (2026-11-03)
-- The table grants that v50–v52 left out: without them the signed-in page gets "permission denied" on the new tables.
-- What each person may actually see or change is still decided by the row rules (RLS) of v50–v52; nothing is opened beyond them.
-- ================================================================

grant select, insert, update on public.oncall_period to authenticated;
grant select, insert, update, delete on public.oncall_trip to authenticated;
grant select, insert, update on public.oncall_event to authenticated;
grant select, insert, update, delete on public.child_diary to authenticated;
grant select, insert, delete on public.child_diary_skip to authenticated;
grant select, insert on public.therapy_access to authenticated;
grant select on public.conv to authenticated;
grant select, update on public.conv_member to authenticated;
grant select, insert on public.conv_msg to authenticated;
grant select, insert, update on public.announcement_read to authenticated;
do $$ declare s text := pg_get_serial_sequence('public.therapy_access', 'id'); begin          -- (its automatic number)
  if s is not null then execute format('grant usage, select on sequence %s to authenticated', s); end if;
end $$;

select 'scheduling_v54' as part, 'ok' as result;
