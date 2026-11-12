-- ================================================================
-- Scheduling, part 70 — run in the SQL Editor after scheduling-v69.sql. Safe to run again. (Guy 2026-11-12, task 3: the rights matrix)
-- Two gaps that the rights matrix found (supabase/rls-matrix-test.sql) are closed here:
--   1. Only the admin gives or takes admin rights. Until now a coordinator could tick "admin" on anybody (herself too), or change a
--      person's role to admin / manager, because she may change every field of the staff. Now a change of the admin mark, of the roles
--      admin and manager, and of the sign-in of an admin or a manager is refused unless the admin does it. Everything else stays hers.
--      (The SQL Editor, the jobs and the service key are not a signed-in person, so they are not stopped.)
--   2. A signed-in address that is not active staff (for example somebody who was removed and still has a sign-in) no longer reads the
--      children's journeys, their strengths, the journey planets and choices, and the therapy library, and cannot add a strength or write
--      a problem report. Active staff see what they saw.
-- ================================================================

do $$ begin
  if to_regprocedure('public.is_test_env()') is null then raise exception 'scheduling-v69.sql first'; end if;
end $$;

-- ---------------------------------------------------------------- 2. active staff only
-- somebody active in the staff list who signed in personally (any role)
create or replace function public.is_active_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() and s.active)
$$;
revoke all on function public.is_active_staff() from public, anon;
grant execute on function public.is_active_staff() to authenticated;

do $$
declare r record;
begin
  for r in select * from (values ('child_journeys', 'read journeys'), ('child_strengths', 'read strengths'), ('journey_choices', 'see choices'),
                                 ('journey_planets', 'read planets'), ('mercury_library', 'read library')) v(tab, pol) loop
    if to_regclass('public.' || r.tab) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', r.pol, r.tab);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active_staff() or public.is_staff())', r.pol, r.tab);
  end loop;
  if to_regclass('public.client_errors') is not null then
    drop policy if exists "write a problem" on public.client_errors;
    create policy "write a problem" on public.client_errors for insert to authenticated
      with check (staff_id is not distinct from public.my_staff_id() and (public.is_active_staff() or public.is_staff()));
  end if;
end $$;

-- the strengths of a child for the brick: as scheduling-v32.sql, only for active staff
create or replace function public.brick_strengths(p_child text) returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.published is null then null else jsonb_build_object(
    'plan', coalesce((select jsonb_agg(distinct x) from jsonb_array_elements(coalesce(c.published -> 'goals', '[]'::jsonb)) g, jsonb_array_elements_text(coalesce(g -> 'strengths', '[]'::jsonb)) x), '[]'::jsonb),
    'main', coalesce((select jsonb_agg(s.strength order by s.picks desc) from public.child_strengths s where s.child_id = p_child and s.status = 'main'), '[]'::jsonb),
    'extra', coalesce((select jsonb_agg(s.strength order by s.picks desc) from public.child_strengths s where s.child_id = p_child and s.status = 'extra'), '[]'::jsonb)) end
  from (select (select published from public.child_plans where child_id = p_child) as published) c
  where public.is_active_staff() or public.is_staff()
$$;

-- a strength chosen with a brick: as scheduling-v32.sql, only for active staff
create or replace function public.note_strength(p_child text, p_strength text) returns text language plpgsql security definer set search_path = public as $$
declare s public.child_strengths; me uuid := public.my_staff_id(); st text := btrim(left(coalesce(p_strength, ''), 20)); nm text;
begin
  if not (public.is_active_staff() or public.is_staff()) then return null; end if;
  if st = '' or not exists (select 1 from public.roster where id = p_child) then return null; end if;
  insert into public.child_strengths (child_id, strength) values (p_child, st) on conflict (child_id, strength) do nothing;
  select * into s from public.child_strengths where child_id = p_child and strength = st for update;
  if s.status = 'removed' then update public.child_strengths set picks = picks + 1, updated_at = now() where child_id = p_child and strength = st; return 'removed'; end if;
  if me is not null and not (me = any(s.pickers)) then s.pickers := array_append(s.pickers, me); end if;
  update public.child_strengths set pickers = s.pickers, picks = picks + 1, updated_at = now(),
         status = case when status = 'extra' and coalesce(array_length(s.pickers, 1), 0) >= 2 then 'main' else status end
   where child_id = p_child and strength = st returning status into s.status;
  if s.status = 'main' and coalesce(array_length(s.pickers, 1), 0) = 2 then
    nm := coalesce(public.child_name(p_child), '');
    perform public.tell_therapist(p_child, 'חוזקה חדשה אצל ' || nm, 'החוזקה "' || st || '" נבחרה אצל ' || nm || ' על ידי שני מדריכים, ועלתה להצעות המרכזיות שלו/ה. אפשר להוריד אותה בפורטל הטיפול.');
  end if;
  return s.status;
end $$;

-- the journeys for the kids' screen: a screen that joined by a code, or active staff (until now: anybody signed in)
create or replace function public.tv_journeys(p_token text default null) returns table (child_id text, planet text, art text, stage text, step int, ship text, symbols text[]) language sql stable security definer set search_path = public as $$
  select j.child_id, j.route[j.planet_idx + 1], pl.art, j.stage, j.step, j.ship, j.symbols
  from public.child_journeys j left join public.journey_planets pl on pl.id = j.route[j.planet_idx + 1]
  where public.is_active_staff() or public.is_staff() or exists (select 1 from public.tv_devices d where d.token_hash = md5('tvtok:' || coalesce(p_token, '')) and d.active)
$$;

-- ---------------------------------------------------------------- 1. only the admin gives or takes admin rights
create or replace function public.guard_admin_rights() returns trigger language plpgsql security definer set search_path = public as $$
declare high boolean; msg text := 'רק מנהל מערכת יכול לשנות הרשאות או כניסה של מנהל מערכת ושל מנהלת';
begin
  -- no signed-in person (the SQL Editor, a job, the service key) or the admin: nothing to check
  if auth.uid() is null or public.is_admin() then return coalesce(new, old); end if;
  if tg_table_name = 'staff' then
    if tg_op = 'INSERT' then
      if new.kind in ('admin', 'manager') then raise exception '%', msg using errcode = '42501'; end if;
    else
      high := old.kind in ('admin', 'manager') or exists (select 1 from public.staff_private p where p.staff_id = old.id and p.is_admin);
      if tg_op = 'DELETE' then
        if high then raise exception '%', msg using errcode = '42501'; end if;
      elsif (new.kind is distinct from old.kind and (high or new.kind in ('admin', 'manager')))
         or (high and (new.active is distinct from old.active or new.id is distinct from old.id)) then
        raise exception '%', msg using errcode = '42501';
      end if;
    end if;
  else          -- staff_private
    if tg_op = 'INSERT' then
      if coalesce(new.is_admin, false) or exists (select 1 from public.staff s where s.id = new.staff_id and s.kind in ('admin', 'manager')) then raise exception '%', msg using errcode = '42501'; end if;
    else
      high := coalesce(old.is_admin, false) or exists (select 1 from public.staff s where s.id = old.staff_id and s.kind in ('admin', 'manager'));
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

select 'scheduling_v70' as part, 'ok' as result,
       (select count(*) from pg_trigger where tgname = 'guard_admin_rights' and not tgisinternal) as guards,
       (select count(*) from pg_policies where schemaname = 'public' and qual like '%is_active_staff()%') as active_staff_rules;
