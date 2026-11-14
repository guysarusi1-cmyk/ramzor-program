-- ================================================================
-- The two-week schedule's e-mails, part 2 — run in the SQL Editor of an organisation's database, after mail-v1.sql and scheduling-v80.sql.
-- Safe to run again. The SAME file for every organisation: nothing here belongs to one project. (Yigal + Guy 2026-11-14)
-- Before running it, two secrets in this project's Vault (Supabase: Project Settings, Vault / Database, Vault):
--   project_url     = the project's address, for example https://xxxx.supabase.co
--   tw_mail_secret  = a long random secret; the SAME value goes to Edge Functions, Secrets, as TW_MAIL_SECRET
-- The hourly job and tw_publish() call tw-mail with the secret in a header; tw-mail refuses every call without it.
-- ================================================================

do $$ begin
  if to_regclass('public.tw_mail_log') is null then raise exception 'mail-v1.sql first'; end if;
  if to_regprocedure('public.tw_publish(date, boolean)') is null then raise exception 'scheduling-v80.sql first'; end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then raise exception 'the Vault secret project_url is missing'; end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'tw_mail_secret') then raise exception 'the Vault secret tw_mail_secret is missing'; end if;
end $$;

-- calls tw-mail now (the hourly job, and right after a publishing); nobody on the site may call it
create or replace function public.tw_mail_now() returns void language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'tw_mail_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(url := rtrim(u, '/') || '/functions/v1/tw-mail',
                        headers := jsonb_build_object('Content-Type', 'application/json', 'x-tw-secret', s), body := '{}'::jsonb);
end $$;
revoke all on function public.tw_mail_now() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'tw-mail') then perform cron.unschedule('tw-mail'); end if;
end $$;
select cron.schedule('tw-mail', '15 * * * *', 'select public.tw_mail_now()');

insert into public.schema_migrations(version) values ('mail-v2') on conflict (version) do nothing;
select 'mail_v2' as part, 'ok' as result, (select count(*) from cron.job where jobname = 'tw-mail') as hourly_job;
