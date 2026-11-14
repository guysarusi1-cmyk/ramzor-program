-- ================================================================
-- Scheduling, part 81 — ONE DATABASE FOR MANY ORGANISATIONS. Run in the SQL Editor of the product's database
-- (mercury-shibutzim), after scheduling-v80.sql and core/mail-v1.sql. Safe to run again. (Guy 2026-11-14)
-- Guy: one database for all the organisations (and later all three products), each organisation sees only its own data;
-- the owner (Guy) sees the list of organisations and may enter one for support, and every entry is written down;
-- one sign-in for a person who works in two organisations; each organisation has an address of its own.
-- How:
--   1. public.org: the organisations (slug = the short name in its address, name, products, its own words). It replaces
--      org_profile; the organisation that was here becomes the first row (slug 'demo', can be renamed).
--   2. every table gets org_id. A new row gets the caller's organisation by itself, so the site does not send it.
--   3. current_org(): the organisation of this call = the site's header x-org (the slug of its address), but ONLY if the
--      caller works there (or the owner opened support there). Without the header: the one organisation the caller works in.
--   4. on every table one more rule ("org only", restrictive: it is added to all the others): a row of another organisation
--      is never seen, written or moved, whatever the other rules say.
--   5. every function that reads tables by itself (security definer) now looks only inside current_org().
--   6. links between rows carry the organisation too, so a row can never point at a person of another organisation.
--   7. the owner: core_owner (who), core_support (every entry: who, where, why, until when; 2 hours), core_orgs() (the list,
--      without people's details), core_support_open() / core_support_close(), core_org_create().
-- The Ramzor's databases are NOT touched by this file (it stops at once there).
-- ================================================================

do $$ begin
  if to_regclass('public.org_profile') is null and to_regclass('public.org') is null then raise exception 'only the product database (core-v1 first)'; end if;
  if to_regprocedure('public.tw_publish(date, boolean)') is null then raise exception 'scheduling-v80.sql first'; end if;
  if to_regclass('public.tw_mail_log') is null then raise exception 'core/mail-v1.sql first'; end if;
end $$;

-- 1. the organisations ------------------------------------------------
create table if not exists public.org (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),     -- the short name in its address
  name text not null default 'ארגון חדש',
  products text[] not null default '{}',                                     -- for example {schedule2w}
  words jsonb not null default '{}'::jsonb,                                  -- its own words, for example {"person":"מלווה"}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if to_regclass('public.org_profile') is not null and not exists (select 1 from public.org) then
    insert into public.org(slug, name, products, words) select 'demo', name, products, words from public.org_profile limit 1;
  end if;
  if not exists (select 1 from public.org) then insert into public.org(slug) values ('demo'); end if;
end $$;

create table if not exists public.core_owner (auth_user_id uuid primary key, added_at timestamptz not null default now());
create table if not exists public.core_support (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,                                                       -- the owner's sign-in
  org uuid not null references public.org(id) on delete cascade,
  reason text not null,
  opened_at timestamptz not null default now(),
  until timestamptz not null
);
alter table public.org enable row level security;
alter table public.core_owner enable row level security;
alter table public.core_support enable row level security;
revoke all on public.org, public.core_owner, public.core_support from anon, authenticated, public;
grant select, update on public.org to authenticated;

-- 2. org_id on every table (the rows that are here belong to the first organisation) ------------
do $$
declare t text; o uuid := (select id from public.org order by created_at, slug limit 1);
begin
  foreach t in array array['staff', 'staff_private', 'tw_people', 'tw_period', 'tw_option', 'tw_submission', 'tw_assignment', 'tw_fixed',
                           'tw_settings', 'tw_other', 'tw_swap', 'tw_message', 'tw_build_log', 'tw_mail_log'] loop
    execute format('alter table public.%I add column if not exists org_id uuid', t);
    execute format('update public.%I set org_id = $1 where org_id is null', t) using o;
    execute format('alter table public.%I alter column org_id set not null', t);
  end loop;
end $$;

-- 6. the keys and the links, now with the organisation in them (done once: a second run, or a run after scheduling-v82.sql, skips it)
do $v81keys$
declare r record; t text;
begin
  if exists (select 1 from pg_constraint where conname = 'tw_period_pkey' and conrelid = 'public.tw_period'::regclass and array_length(conkey, 1) = 2) then return; end if;
  -- every old link between these tables goes first (they are made again below)
  for r in select c.conname, c.conrelid::regclass as tbl from pg_constraint c
           where c.contype = 'f' and c.conrelid in ('public.staff'::regclass, 'public.staff_private'::regclass, 'public.tw_people'::regclass,
                 'public.tw_period'::regclass, 'public.tw_option'::regclass, 'public.tw_submission'::regclass, 'public.tw_assignment'::regclass,
                 'public.tw_fixed'::regclass, 'public.tw_settings'::regclass, 'public.tw_other'::regclass, 'public.tw_swap'::regclass,
                 'public.tw_message'::regclass, 'public.tw_build_log'::regclass, 'public.tw_mail_log'::regclass) loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
  execute 'alter table public.tw_period drop constraint if exists tw_period_pkey';
  execute 'alter table public.tw_period add constraint tw_period_pkey primary key (org_id, start)';
  execute 'alter table public.tw_fixed drop constraint if exists tw_fixed_pkey';
  execute 'alter table public.tw_fixed add constraint tw_fixed_pkey primary key (org_id, dow, shift)';
  execute 'alter table public.tw_settings drop constraint if exists tw_settings_pkey';
  execute 'alter table public.tw_settings add constraint tw_settings_pkey primary key (org_id, key)';
  execute 'alter table public.tw_mail_log drop constraint if exists tw_mail_log_pkey';
  execute 'alter table public.tw_mail_log add constraint tw_mail_log_pkey primary key (org_id, period, kind, mark)';
  execute 'alter table public.staff_private drop constraint if exists staff_private_auth_user_id_key';
  execute 'alter table public.staff_private drop constraint if exists staff_private_org_user_key';
  execute 'alter table public.staff_private add constraint staff_private_org_user_key unique (org_id, auth_user_id)';
  execute 'alter table public.staff drop constraint if exists staff_org_id_key';
  execute 'alter table public.staff add constraint staff_org_id_key unique (org_id, id)';
  execute 'alter table public.tw_people drop constraint if exists tw_people_org_id_key';
  execute 'alter table public.tw_people add constraint tw_people_org_id_key unique (org_id, id)';
  execute 'alter table public.tw_assignment drop constraint if exists tw_assignment_org_id_key';
  execute 'alter table public.tw_assignment add constraint tw_assignment_org_id_key unique (org_id, id)';
  foreach t in array array['staff', 'staff_private', 'tw_people', 'tw_period', 'tw_option', 'tw_submission', 'tw_assignment', 'tw_fixed',
                           'tw_settings', 'tw_other', 'tw_swap', 'tw_message', 'tw_build_log', 'tw_mail_log'] loop
    execute format('alter table public.%I add constraint %I foreign key (org_id) references public.org(id) on delete cascade', t, t || '_org_fk');
  end loop;
  execute 'alter table public.staff_private add constraint staff_private_staff_fk foreign key (org_id, staff_id) references public.staff(org_id, id) on delete cascade';
  execute 'alter table public.tw_people     add constraint tw_people_staff_fk foreign key (org_id, staff_id) references public.staff(org_id, id) on delete set null (staff_id)';
  execute 'alter table public.tw_period     add constraint tw_period_builder_fk foreign key (org_id, builder) references public.tw_people(org_id, id) on delete set null (builder)';
  execute 'alter table public.tw_option     add constraint tw_option_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_option     add constraint tw_option_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_submission add constraint tw_submission_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_submission add constraint tw_submission_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_assignment add constraint tw_assignment_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_assignment add constraint tw_assignment_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_fixed      add constraint tw_fixed_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_other      add constraint tw_other_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_other      add constraint tw_other_person_fk foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_swap       add constraint tw_swap_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_swap       add constraint tw_swap_assignment_fk foreign key (org_id, assignment) references public.tw_assignment(org_id, id) on delete set null (assignment)';
  execute 'alter table public.tw_swap       add constraint tw_swap_from_fk foreign key (org_id, from_person) references public.tw_people(org_id, id) on delete cascade';
  execute 'alter table public.tw_swap       add constraint tw_swap_taker_fk foreign key (org_id, taker) references public.tw_people(org_id, id) on delete set null (taker)';
  execute 'alter table public.tw_build_log  add constraint tw_build_log_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
  execute 'alter table public.tw_mail_log   add constraint tw_mail_log_period_fk foreign key (org_id, period) references public.tw_period(org_id, start) on delete cascade';
end $v81keys$;

-- 3. the organisation of this call ------------------------------------
create or replace function public.current_org() returns uuid language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); s text; o uuid; ids uuid[];
begin
  if me is null then          -- the SQL Editor or a job: only what the script itself set (select set_config('app.org', '<slug>', false))
    s := nullif(lower(btrim(coalesce(current_setting('app.org', true), ''))), '');
    if s is null then return null; end if;
    select g.id into o from public.org g where g.slug = s;
    return o;
  end if;
  begin
    s := nullif(lower(btrim(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-org', ''))), '');
  exception when others then s := null;
  end;
  if s is not null then       -- the site of an organisation: only if the caller works there, or the owner opened support there
    select g.id into o from public.org g where g.slug = s and (
      exists (select 1 from public.staff_private p join public.staff t on t.id = p.staff_id where p.auth_user_id = me and p.org_id = g.id and t.active)
      or exists (select 1 from public.core_support c where c.owner = me and c.org = g.id and now() < c.until));
    return o;
  end if;
  select array_agg(distinct p.org_id) into ids from public.staff_private p join public.staff t on t.id = p.staff_id where p.auth_user_id = me and t.active;
  if array_length(ids, 1) = 1 then return ids[1]; end if;          -- (works in one organisation only)
  return null;
end $$;
revoke all on function public.current_org() from public, anon;
grant execute on function public.current_org() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['staff', 'staff_private', 'tw_people', 'tw_period', 'tw_option', 'tw_submission', 'tw_assignment', 'tw_fixed',
                           'tw_settings', 'tw_other', 'tw_swap', 'tw_message', 'tw_build_log', 'tw_mail_log'] loop
    execute format('alter table public.%I alter column org_id set default public.current_org()', t);
    -- 4. the rule that is added to all the others
    execute format('drop policy if exists "org only" on public.%I', t);
    execute format('create policy "org only" on public.%I as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()))', t);
  end loop;
end $$;

-- 7. the owner ---------------------------------------------------------
-- the first owner: the sign-in of the oldest admin here (Guy, on mercury-shibutzim)
insert into public.core_owner(auth_user_id)
select p.auth_user_id from public.staff s join public.staff_private p on p.staff_id = s.id
 where (s.kind = 'admin' or p.is_admin) and p.auth_user_id is not null and not exists (select 1 from public.core_owner)
 order by s.created_at limit 1
on conflict do nothing;

create or replace function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.core_owner o where o.auth_user_id = auth.uid())
$$;
create or replace function public.core_in_support() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.core_support c where c.owner = auth.uid() and c.org = public.current_org() and now() < c.until)
$$;

-- the list of organisations, for the owner only: no people's details, only how many
create or replace function public.core_orgs() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'only the owner' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'name', g.name, 'products', g.products, 'created_at', g.created_at,
                          'people', (select count(*) from public.staff s where s.org_id = g.id and s.active),
                          'support_until', (select max(c.until) from public.core_support c where c.org = g.id and c.owner = auth.uid() and now() < c.until))
                          order by g.created_at) from public.org g), '[]'::jsonb);
end $$;

-- entering an organisation for support: always with a reason, for two hours, written down
create or replace function public.core_support_open(p_slug text, p_reason text) returns timestamptz language plpgsql security definer set search_path = public as $$
declare o uuid; u timestamptz := now() + interval '2 hours';
begin
  if not public.is_owner() then raise exception 'only the owner' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is needed'; end if;
  select id into o from public.org where slug = lower(btrim(p_slug));
  if o is null then raise exception 'no such organisation'; end if;
  insert into public.core_support(owner, org, reason, until) values (auth.uid(), o, btrim(p_reason), u);
  return u;
end $$;
create or replace function public.core_support_close() returns void language plpgsql security definer set search_path = public as $$
begin
  update public.core_support set until = now() where owner = auth.uid() and now() < until;
end $$;

-- a new organisation (the owner); its first admin is added afterwards inside it, in support
create or replace function public.core_org_create(p_slug text, p_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid; s text := lower(btrim(coalesce(p_slug, '')));
begin
  if not public.is_owner() then raise exception 'only the owner' using errcode = '42501'; end if;
  if s !~ '^[a-z0-9][a-z0-9-]{1,30}$' then raise exception 'the short name: small English letters, digits and -'; end if;
  insert into public.org(slug, name, products) values (s, coalesce(nullif(btrim(p_name), ''), s), array['schedule2w']) returning id into o;
  insert into public.tw_settings(org_id, key, value) values (o, 'open_days', '10'::jsonb), (o, 'close_days', '5'::jsonb) on conflict do nothing;
  return o;
end $$;

revoke all on function public.is_owner(), public.core_in_support(), public.core_orgs(), public.core_support_open(text, text), public.core_support_close(), public.core_org_create(text, text) from public, anon;
grant execute on function public.is_owner(), public.core_in_support(), public.core_orgs(), public.core_support_open(text, text), public.core_support_close(), public.core_org_create(text, text) to authenticated;

-- 5. the core's functions, inside the organisation of the call ----------
create or replace function public.my_staff_id() returns uuid language sql stable security definer set search_path = public as $$
  select p.staff_id from public.staff_private p join public.staff s on s.id = p.staff_id
   where p.auth_user_id = auth.uid() and p.org_id = public.current_org() and s.active limit 1
$$;
create or replace function public.my_kind() returns text language sql stable security definer set search_path = public as $$
  select s.kind from public.staff s join public.staff_private p on p.staff_id = s.id
   where p.auth_user_id = auth.uid() and p.org_id = public.current_org() and s.active limit 1
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and p.org_id = public.current_org() and s.active and (s.kind = 'admin' or p.is_admin))
      or public.core_in_support()
$$;
create or replace function public.is_coordinator() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                                      where p.auth_user_id = auth.uid() and p.org_id = public.current_org() and s.active and s.kind = 'coordinator')
$$;
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('staff_id', s.id, 'name', s.display_name, 'kind', s.kind, 'admin', public.is_admin(), 'coordinator', public.is_coordinator(), 'owner', public.is_owner(),
                               'org', (select jsonb_build_object('slug', g.slug, 'name', g.name, 'products', g.products, 'words', g.words) from public.org g where g.id = s.org_id))
       from public.staff s where s.id = public.my_staff_id()),
    case when public.core_in_support() then
      jsonb_build_object('staff_id', null, 'name', 'תמיכה', 'kind', 'admin', 'admin', true, 'coordinator', true, 'owner', true, 'support', true,
                         'org', (select jsonb_build_object('slug', g.slug, 'name', g.name, 'products', g.products, 'words', g.words) from public.org g where g.id = public.current_org()))
    end)
$$;

drop policy if exists "org read" on public.org;
drop policy if exists "org admin" on public.org;
create policy "org read" on public.org for select to authenticated using (id = (select public.current_org()) and ((select public.is_active_staff()) or (select public.core_in_support())));
create policy "org admin" on public.org for update to authenticated using (id = (select public.current_org()) and (select public.is_admin())) with check (id = (select public.current_org()) and (select public.is_admin()));

create or replace function public.core_add_staff(p_name text, p_email text default null, p_admin boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); em text := nullif(lower(btrim(coalesce(p_email, ''))), ''); sid uuid; o uuid := public.current_org();
begin
  if o is null or not public.is_admin() then raise exception 'only the admin adds people'; end if;
  if nm = '' then raise exception 'a name is needed'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the e-mail address is not valid'; end if;
  if em is not null and exists (select 1 from public.staff_private p where p.org_id = o and lower(p.email) = em) then raise exception 'this e-mail address is already on the list'; end if;
  insert into public.staff(org_id, display_name, first_name, kind) values (o, nm, split_part(nm, ' ', 1), case when p_admin then 'admin' else 'staff' end) returning id into sid;
  insert into public.staff_private(org_id, staff_id, email, is_admin) values (o, sid, em, coalesce(p_admin, false));
  return sid;
end $$;
create or replace function public.core_set_email(p_staff uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := nullif(lower(btrim(coalesce(p_email, ''))), ''); o uuid := public.current_org();
begin
  if o is null or not public.is_admin() then raise exception 'only the admin changes addresses'; end if;
  if not exists (select 1 from public.staff s where s.id = p_staff and s.org_id = o) then raise exception 'not on this list'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the e-mail address is not valid'; end if;
  if em is not null and exists (select 1 from public.staff_private p where p.org_id = o and lower(p.email) = em and p.staff_id <> p_staff) then raise exception 'this e-mail address is already on the list'; end if;
  if exists (select 1 from public.staff_private p where p.staff_id = p_staff and p.auth_user_id is not null) then raise exception 'this person already signs in'; end if;
  insert into public.staff_private(org_id, staff_id, email) values (o, p_staff, em) on conflict (staff_id) do update set email = excluded.email;
end $$;

-- 5. the schedule's functions, inside the organisation of the call ------
create or replace function public.tw_me() returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.tw_people p where p.active and p.org_id = public.current_org() and p.staff_id = public.my_staff_id() limit 1
$$;
create or replace function public.tw_builder(p_period date) returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.start = p_period
                                     and t.builder is not null and t.builder = public.tw_me() and t.start + 13 >= current_date)
$$;
create or replace function public.tw_open(p_period date) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.start = p_period and t.status = 'open' and (t.deadline is null or t.deadline > now()))
$$;
create or replace function public.tw_building() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.builder is not null and t.builder = public.tw_me() and t.status <> 'published')
$$;
create or replace function public.tw_builder_now() returns boolean language sql stable security definer set search_path = public as $$
  select public.tw_boss() or exists (select 1 from public.tw_period t where t.org_id = public.current_org() and t.builder is not null and t.builder = public.tw_me() and t.start + 13 >= current_date)
$$;

create or replace function public.tw_publish_check(p_period date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare errs text[] := '{}'; warns text[] := '{}'; r record; o uuid := public.current_org();
begin
  if o is null or not public.tw_builder(p_period) then raise exception 'only the builder of these two weeks'; end if;
  for r in select a.day, a.shift from public.tw_assignment a where a.org_id = o and a.period = p_period
           and not exists (select 1 from public.tw_slots(a.day) s where s.shift = a.shift) loop
    errs := errs || format('%s: אין משמרת %s ביום הזה', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift));
  end loop;
  for r in select p.name, a.day from public.tw_assignment a join public.tw_people p on p.id = a.person where a.org_id = o and a.period = p_period
           group by p.name, a.day having count(*) > 1 loop
    errs := errs || format('%s: יותר ממשמרת אחת ב-%s', r.name, to_char(r.day, 'DD/MM'));
  end loop;
  for r in select p.name, a.day, a.shift, b.shift as next_shift from public.tw_assignment a
           join public.tw_assignment b on b.org_id = a.org_id and b.period = a.period and b.person = a.person and b.day = a.day + 1
           join public.tw_people p on p.id = a.person
           where a.org_id = o and a.period = p_period and ((a.shift = 'N' and b.shift = 'M') or a.shift = 'W') loop
    errs := errs || format('%s: %s ב-%s ומיד אחריה משמרת למחרת', r.name, case when r.shift = 'W' then 'סוף שבוע' else 'לילה' end, to_char(r.day, 'DD/MM'));
  end loop;
  for r in select p.name, (a.day - p_period) / 7 + 1 as wk, count(*) as n from public.tw_assignment a join public.tw_people p on p.id = a.person
           where a.org_id = o and a.period = p_period and a.shift = 'N' group by p.name, (a.day - p_period) / 7 having count(*) > 2 loop
    errs := errs || format('%s: %s לילות בשבוע %s', r.name, r.n, r.wk);
  end loop;
  for r in select d::date as day, s.shift, s.need, (select count(*) from public.tw_assignment a where a.org_id = o and a.period = p_period and a.day = d::date and a.shift = s.shift) as got
           from generate_series(p_period, p_period + 13, interval '1 day') d cross join lateral public.tw_slots(d::date) s loop
    if r.got < r.need then warns := warns || format('%s %s: חסרים %s', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift), r.need - r.got); end if;
  end loop;
  for r in select d::date as day, f.shift, p.name from generate_series(p_period, p_period + 13, interval '1 day') d
           join public.tw_fixed f on f.org_id = o and f.dow = extract(dow from d)::int join public.tw_people p on p.id = f.person and p.active
           where not exists (select 1 from public.tw_assignment a where a.org_id = o and a.period = p_period and a.day = d::date and a.shift = f.shift and a.person = f.person) loop
    warns := warns || format('%s: המשמרת הקבועה של %s לא בסידור (%s)', to_char(r.day, 'DD/MM'), r.name, public.tw_shift_name(r.shift));
  end loop;
  for r in select wk, count(*) as n from (select a.person, (a.day - p_period) / 7 + 1 as wk from public.tw_assignment a where a.org_id = o and a.period = p_period and a.shift = 'N'
           group by a.person, (a.day - p_period) / 7 having count(*) = 2) t group by wk having count(*) > 2 loop
    warns := warns || format('שבוע %s: %s אנשים עם שני לילות', r.wk, r.n);
  end loop;
  return jsonb_build_object('errors', to_jsonb(errs), 'warnings', to_jsonb(warns));
end $$;

create or replace function public.tw_publish(p_period date, p_confirm boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare chk jsonb;
begin
  chk := public.tw_publish_check(p_period);
  if jsonb_array_length(chk->'errors') > 0 then return chk || '{"published":false}'; end if;
  if jsonb_array_length(chk->'warnings') > 0 and not coalesce(p_confirm, false) then return chk || '{"published":false}'; end if;
  perform set_config('tw.publishing', 'on', true);
  update public.tw_period set status = 'published', published_at = now() where org_id = public.current_org() and start = p_period;
  perform set_config('tw.publishing', 'off', true);
  begin perform public.tw_mail_now(); exception when undefined_function then null; end;
  return chk || '{"published":true}';
end $$;

create or replace function public.tw_swap_ask(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare a public.tw_assignment; me uuid := public.tw_me(); o uuid := public.current_org(); new_id uuid;
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into a from public.tw_assignment where id = p_assignment and org_id = o;
  if a.id is null or a.person <> me then raise exception 'not your shift'; end if;
  if not exists (select 1 from public.tw_period t where t.org_id = o and t.start = a.period and t.status = 'published') then raise exception 'the schedule is not published'; end if;
  if a.day < current_date then raise exception 'the shift has passed'; end if;
  if exists (select 1 from public.tw_swap s where s.assignment = a.id and s.status in ('open', 'taken')) then raise exception 'already asked'; end if;
  insert into public.tw_swap(org_id, period, assignment, day, shift, from_person, note) values (o, a.period, a.id, a.day, a.shift, me, nullif(btrim(coalesce(p_note, '')), '')) returning id into new_id;
  return new_id;
end $$;
create or replace function public.tw_swap_take(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me(); o uuid := public.current_org();
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into s from public.tw_swap where id = p_swap and org_id = o for update;
  if s.id is null or s.status <> 'open' then raise exception 'the request is not open'; end if;
  if s.from_person = me then raise exception 'your own request'; end if;
  if exists (select 1 from public.tw_assignment a where a.org_id = o and a.period = s.period and a.day = s.day and a.person = me) then raise exception 'you already work that day'; end if;
  update public.tw_swap set status = 'taken', taker = me, taken_at = now() where id = p_swap;
end $$;
create or replace function public.tw_swap_cancel(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me();
begin
  select * into s from public.tw_swap where id = p_swap and org_id = public.current_org() for update;
  if s.id is null or s.status not in ('open', 'taken') then raise exception 'the request is closed'; end if;
  if s.taker is not null and s.taker = me then update public.tw_swap set status = 'open', taker = null, taken_at = null where id = p_swap;
  elsif s.from_person = me or public.tw_builder(s.period) then update public.tw_swap set status = 'cancelled', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else raise exception 'not yours'; end if;
end $$;
create or replace function public.tw_swap_decide(p_swap uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap;
begin
  select * into s from public.tw_swap where id = p_swap and org_id = public.current_org() for update;
  if s.id is null or s.status <> 'taken' then raise exception 'nothing to decide'; end if;
  if not public.tw_builder(s.period) then raise exception 'only the builder of these two weeks'; end if;
  if p_approve then
    if not exists (select 1 from public.tw_assignment a where a.id = s.assignment and a.person = s.from_person) then raise exception 'the shift has changed'; end if;
    if exists (select 1 from public.tw_assignment a where a.org_id = s.org_id and a.period = s.period and a.day = s.day and a.person = s.taker) then raise exception 'the taker already works that day'; end if;
    update public.tw_assignment set person = s.taker, by_hand = true, fixed = false where id = s.assignment;
    update public.tw_swap set status = 'approved', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else
    update public.tw_swap set status = 'declined', decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  end if;
end $$;

-- opening the next two weeks: per organisation; the hourly job goes over all of them
create or replace function public.tw_auto_open_org(p_org uuid) returns date language plpgsql security definer set search_path = public as $$
declare q jsonb; od int; cd int; last_start date; last_builder uuid; nxt date; ids uuid[]; i int; b uuid; dl timestamptz;
begin
  if p_org is null then return null; end if;
  select value into q from public.tw_settings where org_id = p_org and key = 'queue';
  if q is null or jsonb_typeof(q) <> 'array' or jsonb_array_length(q) = 0 then return null; end if;
  od := coalesce((select (value #>> '{}')::int from public.tw_settings where org_id = p_org and key = 'open_days'), 10);
  cd := coalesce((select (value #>> '{}')::int from public.tw_settings where org_id = p_org and key = 'close_days'), 5);
  select start, builder into last_start, last_builder from public.tw_period where org_id = p_org order by start desc limit 1;
  if last_start is null then nxt := current_date + ((7 - extract(dow from current_date)::int) % 7); else nxt := last_start + 14; end if;
  while nxt + 13 < current_date loop nxt := nxt + 14; end loop;
  if nxt - od > current_date then return null; end if;
  select array_agg(p.id order by t.ord) into ids from jsonb_array_elements_text(q) with ordinality t(x, ord)
    join public.tw_people p on p.id::text = t.x and p.active and p.org_id = p_org;
  if ids is not null then i := array_position(ids, last_builder); b := ids[case when i is null then 1 else (i % array_length(ids, 1)) + 1 end]; end if;
  dl := greatest(((nxt - cd)::timestamp + time '23:59') at time zone 'Asia/Jerusalem', ((current_date + 1)::timestamp + time '23:59') at time zone 'Asia/Jerusalem');
  insert into public.tw_period(org_id, start, builder, deadline) values (p_org, nxt, b, dl) on conflict (org_id, start) do nothing;
  return nxt;
end $$;
create or replace function public.tw_auto_open_job() returns date language plpgsql security definer set search_path = public as $$
declare g record; d date; last date;
begin
  for g in select id from public.org loop
    d := public.tw_auto_open_org(g.id);
    if d is not null then last := d; end if;
  end loop;
  return last;
end $$;
create or replace function public.tw_auto_open() returns date language plpgsql security definer set search_path = public as $$
begin
  if not public.tw_member() then return null; end if;
  return public.tw_auto_open_org(public.current_org());
end $$;
revoke all on function public.tw_auto_open_org(uuid), public.tw_auto_open_job() from public, anon, authenticated;
revoke all on function public.tw_auto_open() from public, anon;
grant execute on function public.tw_auto_open() to authenticated;

-- org_profile is now the first row of public.org
drop table if exists public.org_profile;

insert into public.schema_migrations(version) values ('scheduling-v81') on conflict (version) do nothing;
select 'scheduling_v81' as part, 'ok' as result,
       (select count(*) from public.org) as organisations,
       (select string_agg(slug, ', ') from public.org) as addresses,
       (select count(*) from public.core_owner) as owners,
       (select count(*) from pg_policies where schemaname = 'public' and policyname = 'org only') as org_rules;
