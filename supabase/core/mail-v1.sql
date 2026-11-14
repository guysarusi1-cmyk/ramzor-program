-- ================================================================
-- The two-week schedule's e-mails, part 1 — run in the SQL Editor of an organisation's database (after scheduling-v79.sql),
-- AFTER the Edge Function tw-mail is deployed. Safe to run again. (Guy 2026-11-14)
--   * tw_mail_log: what tw-mail already sent (nobody reads or writes it from the site; only the function, with the service key);
--   * the address of the site, for the button in the e-mails;
--   * every hour (at minute 15) the database calls tw-mail, which sends only what is due.
-- ================================================================

do $$ begin
  if to_regprocedure('public.tw_auto_open()') is null then raise exception 'scheduling-v79.sql first'; end if;
end $$;

create table if not exists public.tw_mail_log (
  period date not null references public.tw_period(start) on delete cascade,
  kind text not null check (kind in ('reminder', 'published')),
  mark text not null default '',                -- (for "published": the moment of that publishing, so a new publishing mails again)
  count int not null default 0,
  sent_at timestamptz not null default now(),
  primary key (period, kind, mark)
);
alter table public.tw_mail_log enable row level security;
revoke all on public.tw_mail_log from anon, authenticated, public;

insert into public.tw_settings(key, value) values ('site_url', '"https://shibutz.mercuryteam.app/"'::jsonb)
  on conflict (key) do update set value = excluded.value;

create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'tw-mail') then perform cron.unschedule('tw-mail'); end if;
end $$;
select cron.schedule('tw-mail', '15 * * * *', $job$
  select net.http_post(url := 'https://cdxjztahedcweeogllfy.supabase.co/functions/v1/tw-mail', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)
$job$);

select 'mail_v1' as part, 'ok' as result, (select count(*) from cron.job where jobname = 'tw-mail') as hourly_job;
