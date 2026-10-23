-- scheduling v35 (2026-10-24): "צור סידור אוטומטי" starts the build at once (Guy). Run once, after v34, on each project. Safe to run again.
--   When a build is asked for (a row in sched_requests), the database tells GitHub to start the workflow "build-now" right away
--   (about a minute to start, then the build itself, up to 10 minutes). It needs two things set once per project (see the end of
--   this file): a GitHub token kept in the Vault, and which site this is (build_target). Until they are set, or if GitHub does not
--   answer, nothing breaks: the hourly job builds the request, as before.
create extension if not exists pg_net;

create or replace function public.sched_request_dispatch() returns trigger language plpgsql security definer set search_path = public as $$
declare tok text; tgt text;
begin
  select value #>> '{}' into tgt from public.sched_settings where key = 'build_target';
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_build_token' limit 1;
  if tgt is null or tok is null then return new; end if;          -- (not set up: the hourly job builds it)
  perform net.http_post(
    url := 'https://api.github.com/repos/guysarusi1-cmyk/ramzor-scheduler/actions/workflows/build-now.yml/dispatches',
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('target', tgt)),
    headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Accept', 'application/vnd.github+json', 'X-GitHub-Api-Version', '2022-11-28',
                                  'User-Agent', 'ramzor-build-now', 'Content-Type', 'application/json'));
  return new;
exception when others then
  return new;                                                      -- (never stop the request itself: the hourly job is the safety net)
end $$;
revoke all on function public.sched_request_dispatch() from public, anon, authenticated;
drop trigger if exists sched_request_dispatch on public.sched_requests;
create trigger sched_request_dispatch after insert on public.sched_requests for each row execute function public.sched_request_dispatch();

select 'scheduling_v35' as part, 'ok' as result,
  exists (select 1 from public.sched_settings where key = 'build_target') as target_set,
  exists (select 1 from vault.decrypted_secrets where name = 'github_build_token') as token_set;

-- ---- once per project, by hand (Guy): the token (GitHub -> Settings -> Developer settings -> Fine-grained tokens; only the repository
-- ramzor-scheduler; permission Actions: Read and write) and which site this project is ('test' or 'live'):
--   select vault.create_secret('<the token>', 'github_build_token');
--   insert into public.sched_settings (key, value) values ('build_target', '"live"') on conflict (key) do update set value = excluded.value;
