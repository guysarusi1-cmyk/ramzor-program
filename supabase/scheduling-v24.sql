-- ================================================================
-- Scheduling, part 24 — run in the SQL Editor after scheduling-v23.sql. Safe to run again. Only speed, nothing changes in what people see.
--   * indexes for the lists that are read newest first (the change log, the ahmash control log, announcements, swaps) and for reading
--     everybody's preferences of a few months (the coordinator's portal), and for the e-mails still waiting (the hourly job)
--   * the change log's policy asks "is this the coordinator" once per query instead of once per row
-- ================================================================
create index if not exists audit_log_at            on public.audit_log (at desc);
create index if not exists control_log_at          on public.control_log (at desc);
create index if not exists announcements_created   on public.announcements (created_at desc);
create index if not exists swap_requests_created   on public.swap_requests (created_at desc);
create index if not exists prefs_slot_day          on public.prefs_slot (day);
create index if not exists email_outbox_waiting    on public.email_outbox (send_after) where sent_at is null and error is null;

drop policy if exists "see audit log" on public.audit_log;
create policy "see audit log" on public.audit_log for select to authenticated using ((select public.is_coordinator()));

analyze public.audit_log, public.control_log, public.announcements, public.swap_requests, public.prefs_slot, public.email_outbox;
select 'scheduling_v24' as part, 'ok' as result;
