-- ================================================================
-- Scheduling, part 23 — run in the SQL Editor after scheduling-v22.sql. Safe to run again.
--   * problems in the field, for the pilot: a "report a problem" button (the person writes what happened), and the script errors that
--     happen on people's devices are written down by themselves. Only the admin sees them (the management portal, tab "ניהול").
--   * a report sends an e-mail to the admin (with the hourly job)
-- ================================================================
create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  staff_id   uuid default public.my_staff_id(),            -- (empty on a shared device without a personal sign-in)
  kind       text not null check (kind in ('report', 'error')),
  message    text not null check (length(message) <= 2000),
  detail     jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 20000),
  handled    boolean not null default false
);
create index if not exists client_errors_at on public.client_errors (at desc);
alter table public.client_errors enable row level security;
drop policy if exists "write a problem" on public.client_errors;
create policy "write a problem" on public.client_errors for insert to authenticated with check (staff_id is not distinct from public.my_staff_id());
drop policy if exists "admin sees problems" on public.client_errors;
create policy "admin sees problems" on public.client_errors for select to authenticated using (public.is_admin());
drop policy if exists "admin marks problems" on public.client_errors;
create policy "admin marks problems" on public.client_errors for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.client_errors to authenticated;

-- a report (not an automatic error) -> an e-mail to the admin
create or replace function public.client_report_mail() returns trigger language plpgsql security definer set search_path = public as $$
declare who text; r record;
begin
  if new.kind <> 'report' or new.message like 'בדיקה אוטומטית%' then return new; end if;          -- (the automatic checks of the test site send no e-mail)
  select display_name into who from public.staff where id = new.staff_id;
  for r in select p.email from public.staff s join public.staff_private p on p.staff_id = s.id
           where s.active and p.email is not null and (s.kind = 'admin' or coalesce(p.is_admin, false)) loop
    insert into public.email_outbox (to_email, subject, body, kind) values (r.email, 'דיווח על תקלה' || coalesce(' מ' || who, ''),
      coalesce(who, 'מכשיר משותף') || E' כתב/ה:\n' || new.message || E'\n\nמסך: ' || coalesce(new.detail ->> 'where', '') || E'\nמכשיר: ' || coalesce(new.detail ->> 'device', '')
      || E'\n\nכל הדיווחים: בפורטל הניהול, לשונית "ניהול".', 'problem-report');
  end loop;
  return new;
end $$;
drop trigger if exists client_report_mail on public.client_errors;
create trigger client_report_mail after insert on public.client_errors for each row execute function public.client_report_mail();

select 'scheduling_v23' as part, 'ok' as result;
