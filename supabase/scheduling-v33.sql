-- scheduling v33 (2026-10-22): before the pilot (Guy). Run once, after v32. Safe to run again.
--   * The schedule is built only when the coordinator presses "צור סידור אוטומטי" (after the submission of that month closed).
--     The engine's monthly build (the 24th/25th) and the morning-of-the-25th safety net are off unless sched_settings.auto_build = true.
--   * The admin fills (and hands in) the preferences of somebody else; a hand-in by somebody else is written in the audit log.

-- 1. the coordinator asks for a build (the admin could already); only for a month whose submission closed
drop policy if exists "coordinator requests"   on public.sched_requests;
drop policy if exists "coordinator requests 2" on public.sched_requests;
create policy "coordinator requests"   on public.sched_requests for select to authenticated using (public.is_coordinator());
create policy "coordinator requests 2" on public.sched_requests for insert to authenticated
  with check (public.is_coordinator() and requested_by = public.my_staff_id() and not public.prefs_open(month));

-- 2. no automatic build (the engine reads the same setting)
insert into public.sched_settings (key, value) values ('auto_build', 'false') on conflict (key) do nothing;
create or replace function public.sched_safety_net() returns text language plpgsql security definer set search_path = public as $$
declare il timestamp := now() at time zone 'Asia/Jerusalem'; m date := (date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date; s public.schedule; c record; alert text; res text;
begin
  if coalesce((select value #>> '{}' from public.sched_settings where key = 'auto_build'), 'false') <> 'true' then return 'manual build (צור סידור אוטומטי)'; end if;
  if extract(day from il) <> 25 or il::time < time '05:30' or il::time > time '09:00' then return 'not the time'; end if;
  select * into s from public.schedule where month = m;
  if not found then
    select value #>> '{}' into alert from public.sched_settings where key = 'alert_email';
    if alert is not null then insert into public.email_outbox (to_email, subject, body, kind) values (alert, 'לא נוצר סידור לחודש הבא', 'עד 05:30 לא נוצרו לא טיוטה ולא סידור סופי. צריך לבדוק את המערכת.', 'alert'); end if;
    return 'no schedule at all';
  end if;
  if s.status = 'draft' then
    update public.schedule set status = 'sent', sent_to_coordinator = now(), log = coalesce(log, '') || E'\nהסידור הסופי לא נבנה בזמן, נשלחה הטיוטה (רשת ביטחון).' where month = m;
    for c in select id from public.staff where kind = 'coordinator' and active loop
      perform public.tell_staff(c.id, 'הסידור לחודש הבא מוכן (טיוטה)', 'נשלחה אלייך טיוטת הסידור לחודש הבא. הסידור הסופי לא נבנה בזמן, ולכן כדאי לעבור עליה בעיון.', 'warn');
    end loop;
    res := 'draft sent';
  else res := 'already ' || s.status; end if;
  return res;
end $$;

-- 3. the admin fills somebody's preferences (on top of the person's own rights; the admin also after the closing time)
do $$ declare t text; begin
  foreach t in array array['prefs_slot', 'prefs_absence', 'prefs_hours', 'prefs_submission', 'prefs_consent', 'prefs_pickone'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "admin fills" on public.%I', t);
      execute format('create policy "admin fills" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    end if;
  end loop;
end $$;
create or replace function public.audit_prefs_by_other() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_staff_id() is distinct from new.staff_id then
    insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'prefs_by_admin', jsonb_build_object('staff', new.staff_id, 'month', new.month));
  end if;
  return new;
end $$;
drop trigger if exists prefs_by_other_audit on public.prefs_submission;
create trigger prefs_by_other_audit after insert or update on public.prefs_submission for each row execute function public.audit_prefs_by_other();

select 'scheduling_v33' as part, 'ok' as result, (select value from public.sched_settings where key = 'auto_build') as auto_build;
