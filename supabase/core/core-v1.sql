-- ================================================================
-- CORE, part 1 — the first file of a NEW database of an organisation. Safe to run again. (Guy 2026-11-13: the second pilot)
-- The vision: several products (the two-week schedule is the first here) that an organisation takes alone or together, each
-- organisation in a database of its own, seeing only its own data. So a new database gets:
--   1. this CORE: the organisation's profile (its name, which products it has, its own words), the people, their sign-in, the roles;
--   2. on top of it, one file per product (the two-week schedule: scheduling-v75.sql and scheduling-v76.sql, as they are).
-- A product never reaches into another product's tables; it leans only on the core (the people, who is calling, the roles).
-- Nothing here is open to a visitor who is not signed in.
-- ================================================================

create table if not exists public.org_profile (
  id boolean primary key default true check (id),                  -- one row: this database is one organisation
  name text not null default 'ארגון חדש',
  products text[] not null default '{}',                            -- which products are on here, for example {schedule2w}
  words jsonb not null default '{}'::jsonb,                         -- the organisation's own words, for example {"person":"מלווה"}
  updated_at timestamptz not null default now()
);
insert into public.org_profile (id) values (true) on conflict (id) do nothing;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  first_name text,
  kind text not null default 'staff' check (kind in ('admin', 'coordinator', 'staff')),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create table if not exists public.staff_private (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  email text,
  auth_user_id uuid unique,                                         -- the sign-in of this person (auth.users.id)
  is_admin boolean not null default false,
  phone text
);

-- who is calling (only an active person counts)
create or replace function public.my_staff_id() returns uuid language sql stable security definer set search_path = public as $$
  select p.staff_id from public.staff_private p join public.staff s on s.id = p.staff_id where p.auth_user_id = auth.uid() and s.active limit 1
$$;
create or replace function public.my_kind() returns text language sql stable security definer set search_path = public as $$
  select s.kind from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() and s.active limit 1
$$;
create or replace function public.is_active_staff() returns boolean language sql stable security definer set search_path = public as $$
  select public.my_staff_id() is not null
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where p.auth_user_id = auth.uid() and s.active and (s.kind = 'admin' or p.is_admin))
$$;
create or replace function public.is_coordinator() returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                                      where p.auth_user_id = auth.uid() and s.active and s.kind = 'coordinator')
$$;
-- what the site asks right after the sign-in
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('staff_id', s.id, 'name', s.display_name, 'kind', s.kind, 'admin', public.is_admin(), 'coordinator', public.is_coordinator(),
                            'org', (select jsonb_build_object('name', o.name, 'products', o.products, 'words', o.words) from public.org_profile o))
  from public.staff s where s.id = public.my_staff_id()
$$;
revoke all on function public.my_staff_id(), public.my_kind(), public.is_active_staff(), public.is_admin(), public.is_coordinator(), public.my_profile() from public, anon;
grant execute on function public.my_staff_id(), public.my_kind(), public.is_active_staff(), public.is_admin(), public.is_coordinator(), public.my_profile() to authenticated;

alter table public.org_profile enable row level security;
alter table public.staff enable row level security;
alter table public.staff_private enable row level security;
revoke all on public.org_profile, public.staff, public.staff_private from anon, public;
grant select, update on public.org_profile to authenticated;
grant select, insert, update, delete on public.staff, public.staff_private to authenticated;

drop policy if exists "org read" on public.org_profile;
drop policy if exists "org admin" on public.org_profile;
create policy "org read" on public.org_profile for select to authenticated using ((select public.is_active_staff()));
create policy "org admin" on public.org_profile for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "see staff" on public.staff;
drop policy if exists "edit staff" on public.staff;
create policy "see staff" on public.staff for select to authenticated using ((select public.is_active_staff()));
create policy "edit staff" on public.staff for all to authenticated using ((select public.is_coordinator())) with check ((select public.is_coordinator()));

drop policy if exists "private staff" on public.staff_private;
create policy "private staff" on public.staff_private for all to authenticated using ((select public.is_coordinator())) with check ((select public.is_coordinator()));

-- only the admin gives or takes admin rights (the same guard as scheduling-v70.sql, with this core's roles)
create or replace function public.guard_admin_rights() returns trigger language plpgsql security definer set search_path = public as $$
declare high boolean; msg text := 'רק מנהל מערכת יכול לשנות הרשאות או כניסה של מנהל מערכת';
begin
  if auth.uid() is null or public.is_admin() then return coalesce(new, old); end if;          -- the SQL Editor, or the admin
  if tg_table_name = 'staff' then
    if tg_op = 'INSERT' then
      if new.kind = 'admin' then raise exception '%', msg using errcode = '42501'; end if;
    else
      high := old.kind = 'admin' or exists (select 1 from public.staff_private p where p.staff_id = old.id and p.is_admin);
      if tg_op = 'DELETE' then
        if high then raise exception '%', msg using errcode = '42501'; end if;
      elsif (new.kind is distinct from old.kind and (high or new.kind = 'admin'))
         or (high and (new.active is distinct from old.active or new.id is distinct from old.id)) then
        raise exception '%', msg using errcode = '42501';
      end if;
    end if;
  else
    if tg_op = 'INSERT' then
      if coalesce(new.is_admin, false) or exists (select 1 from public.staff s where s.id = new.staff_id and s.kind = 'admin') then raise exception '%', msg using errcode = '42501'; end if;
    else
      high := coalesce(old.is_admin, false) or exists (select 1 from public.staff s where s.id = old.staff_id and s.kind = 'admin');
      if tg_op = 'DELETE' then
        if high then raise exception '%', msg using errcode = '42501'; end if;
      elsif new.is_admin is distinct from old.is_admin or new.staff_id is distinct from old.staff_id
         or (high and (new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email)) then
        raise exception '%', msg using errcode = '42501';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.guard_admin_rights() from public, anon, authenticated;
drop trigger if exists guard_admin_rights on public.staff;
create trigger guard_admin_rights before insert or update or delete on public.staff for each row execute function public.guard_admin_rights();
drop trigger if exists guard_admin_rights on public.staff_private;
create trigger guard_admin_rights before insert or update or delete on public.staff_private for each row execute function public.guard_admin_rights();

select 'core_v1' as part, 'ok' as result, (select count(*) from public.staff) as people, (select name from public.org_profile) as organisation;
