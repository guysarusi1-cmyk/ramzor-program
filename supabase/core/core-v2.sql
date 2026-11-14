-- ================================================================
-- CORE, part 2 — run in the SQL Editor of an organisation's database after core-v1.sql. Safe to run again. (Guy 2026-11-14)
-- Adding people from the screen: the admin writes a name and an e-mail; the person gets a row in the core (staff + staff_private).
-- The sign-in itself is created by the Edge Function create-staff-user (it holds the service key; nobody else does), and the person
-- enters the first time with a code sent to that e-mail, then chooses a password.
-- A product adds its own row on top (the two-week schedule: tw_people.staff_id).
-- ================================================================

do $$ begin
  if to_regclass('public.org_profile') is null then raise exception 'core-v1.sql first'; end if;
end $$;

create or replace function public.core_add_staff(p_name text, p_email text default null, p_admin boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); em text := nullif(lower(btrim(coalesce(p_email, ''))), ''); sid uuid;
begin
  if not public.is_admin() then raise exception 'only the admin adds people'; end if;
  if nm = '' then raise exception 'a name is needed'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the e-mail address is not valid'; end if;
  if em is not null and exists (select 1 from public.staff_private p where lower(p.email) = em) then raise exception 'this e-mail address is already on the list'; end if;
  insert into public.staff(display_name, first_name, kind) values (nm, split_part(nm, ' ', 1), case when p_admin then 'admin' else 'staff' end) returning id into sid;
  insert into public.staff_private(staff_id, email, is_admin) values (sid, em, coalesce(p_admin, false));
  return sid;
end $$;

-- the e-mail of somebody who has no sign-in yet (a person who already signs in keeps her address)
create or replace function public.core_set_email(p_staff uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if not public.is_admin() then raise exception 'only the admin changes addresses'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'the e-mail address is not valid'; end if;
  if em is not null and exists (select 1 from public.staff_private p where lower(p.email) = em and p.staff_id <> p_staff) then raise exception 'this e-mail address is already on the list'; end if;
  if exists (select 1 from public.staff_private p where p.staff_id = p_staff and p.auth_user_id is not null) then raise exception 'this person already signs in'; end if;
  insert into public.staff_private(staff_id, email) values (p_staff, em) on conflict (staff_id) do update set email = excluded.email;
end $$;

revoke all on function public.core_add_staff(text, text, boolean), public.core_set_email(uuid, text) from public, anon;
grant execute on function public.core_add_staff(text, text, boolean), public.core_set_email(uuid, text) to authenticated;

select 'core_v2' as part, 'ok' as result;
