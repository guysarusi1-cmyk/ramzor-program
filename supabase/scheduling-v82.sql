-- ================================================================
-- Scheduling, part 82 — run in the SQL Editor of the product's database (mercury-shibutzim), after scheduling-v81.sql.
-- Safe to run again. (Guy 2026-11-14, after the review agents)
-- A personal notice when one's shift changes AFTER the schedule was published: the builder adds or removes a person in a place, or a
-- swap is approved. The person sees it at the top of "הסידור" with "הבנתי" (the site reads tw_notice; before this file there is nothing).
--   * the database writes the notices by itself (a trigger on tw_assignment), only while the two weeks are published and only for days
--     that have not passed; nobody writes them from the site;
--   * a person sees and marks "seen" only their own notices; the organisation rule ("org only") as on every table;
--   * notices older than 12 months go with tw_purge_old().
-- ================================================================

do $$ begin
  if to_regprocedure('public.current_org()') is null then raise exception 'scheduling-v81.sql first'; end if;
end $$;

create table if not exists public.tw_notice (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  person uuid not null,
  period date not null,
  day date not null,
  shift text not null check (shift in ('M', 'A', 'N', 'W')),
  kind text not null check (kind in ('added', 'removed')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tw_notice_person_fk') then
    alter table public.tw_notice add constraint tw_notice_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tw_notice_period_fk') then
    alter table public.tw_notice add constraint tw_notice_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade;
  end if;
end $$;
create index if not exists tw_notice_person_idx on public.tw_notice (org_id, person, seen_at);

alter table public.tw_notice enable row level security;
revoke all on public.tw_notice from anon, public;
grant select on public.tw_notice to authenticated;
grant update (seen_at) on public.tw_notice to authenticated;
drop policy if exists "org only" on public.tw_notice;
drop policy if exists "tw notice own" on public.tw_notice;
drop policy if exists "tw notice seen" on public.tw_notice;
create policy "org only" on public.tw_notice as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()));
create policy "tw notice own" on public.tw_notice for select to authenticated using (person = (select public.tw_me()));
create policy "tw notice seen" on public.tw_notice for update to authenticated using (person = (select public.tw_me())) with check (person = (select public.tw_me()));

-- the writer: a change in a published schedule, for a day that has not passed
create or replace function public.tw_notice_write() returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid; pr date; dy date; sh text;
begin
  o := coalesce(new.org_id, old.org_id); pr := coalesce(new.period, old.period);
  if not exists (select 1 from public.tw_period t where t.org_id = o and t.start = pr and t.status = 'published') then return null; end if;
  if tg_op = 'INSERT' then
    if new.day >= current_date then insert into public.tw_notice(org_id, person, period, day, shift, kind) values (new.org_id, new.person, new.period, new.day, new.shift, 'added'); end if;
  elsif tg_op = 'DELETE' then
    if old.day >= current_date then insert into public.tw_notice(org_id, person, period, day, shift, kind) values (old.org_id, old.person, old.period, old.day, old.shift, 'removed'); end if;
  elsif new.person is distinct from old.person or new.day is distinct from old.day or new.shift is distinct from old.shift then
    if old.day >= current_date then insert into public.tw_notice(org_id, person, period, day, shift, kind) values (old.org_id, old.person, old.period, old.day, old.shift, 'removed'); end if;
    if new.day >= current_date then insert into public.tw_notice(org_id, person, period, day, shift, kind) values (new.org_id, new.person, new.period, new.day, new.shift, 'added'); end if;
  end if;
  return null;
end $$;
revoke all on function public.tw_notice_write() from public, anon, authenticated;
drop trigger if exists tw_notice_write on public.tw_assignment;
create trigger tw_notice_write after insert or delete or update of person, day, shift on public.tw_assignment for each row execute function public.tw_notice_write();

-- the purge after 12 months takes the notices too
create or replace function public.tw_purge_old() returns int language plpgsql security definer set search_path = public as $$
declare cut date := (current_date - interval '12 months')::date; n int := 0; k int;
begin
  delete from public.tw_option where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_other where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_submission where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_swap where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_build_log where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  delete from public.tw_notice where period + 13 < cut; get diagnostics k = row_count; n := n + k;
  if to_regclass('public.tw_mail_log') is not null then execute 'delete from public.tw_mail_log where period + 13 < $1' using cut; get diagnostics k = row_count; n := n + k; end if;
  return n;
end $$;
revoke all on function public.tw_purge_old() from public, anon, authenticated;

insert into public.schema_migrations(version) values ('scheduling-v82') on conflict (version) do nothing;
select 'scheduling_v82' as part, 'ok' as result,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tw_notice') as rules,
       (select count(*) from pg_trigger where tgname = 'tw_notice_write') as trigger;
