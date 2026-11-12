-- ================================================================
-- The rights matrix, TEST only — run in the SQL Editor of the TEST project. Changes nothing. (Guy 2026-11-12, task 3)
-- For every table and view of "public" and for every kind of user it TRIES to read, add, change and delete,
-- and for the low kinds of user it tries to call every function. Every try is undone at once (a savepoint that is always rolled back),
-- so no row changes. The answer is one cell of JSON: copy it and give it to Claude (tests/rls-matrix.py reads it).
-- Kinds of user: not signed in (anon), a signed-in address with no staff row (stranger), the shared address, the old manager address,
-- and the personal test users: instructor (an ahmash), instructor2, service, secretary, therapist, coordinator, manager
-- (+ an admin and somebody removed from the staff, if they have a sign-in here).
-- Codes — read: X = no right at all, else the number of rows seen. add (own = a copy of a row this user sees, any = a copy of any row):
-- X = no right, P = stopped by a row rule, A = passed the rights (A:<code> = stopped later by something else, e.g. "already exists").
-- change / delete: X = no right, else the number of rows it could touch (A:<code> = passed the rights, stopped later).
-- ================================================================
-- safety: TEST only. On any other database this stops here, before any change (the marker: supabase/test-marker.sql, run once on TEST)
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד הבדיקות (TEST). לא שונה דבר.';
  end if;
end $$;

-- which part to run: 'tables' or 'functions' (two runs keep each one short)
set statement_timeout = '10min';
select set_config('rls.part', 'tables', false);

drop table if exists pg_temp.rls_out;
create temp table rls_out (j jsonb);

do $$
declare
  me text := current_user;
  personas jsonb := '[]'::jsonb;   -- [{k, role, claims}]
  missing text[] := '{}';
  low text[] := array['anon', 'stranger', 'inactive', 'shared', 'service', 'instructor', 'instructor2'];   -- functions are tried only as these
  p jsonb; t record; f record; r record;
  k text; res text; n bigint; q text; cols text; col1 text; rowj jsonb;
  tabs jsonb := '{}'::jsonb; funs jsonb := '[]'::jsonb; one jsonb; per jsonb; args text;
  uid uuid; mail text; len bigint; tids tid[]; part text := current_setting('rls.part', true);
begin
  -- who we try as
  personas := personas || jsonb_build_object('k', 'anon', 'role', 'anon', 'claims', jsonb_build_object('role', 'anon'));
  personas := personas || jsonb_build_object('k', 'stranger', 'role', 'authenticated', 'claims',
    jsonb_build_object('role', 'authenticated', 'aud', 'authenticated', 'sub', '00000000-0000-4000-8000-000000000001', 'email', 'nobody@example.invalid'));
  for r in select * from (values ('shared', 'staff@merkaz-cherum.local'), ('oldmanager', 'manager@merkaz-cherum.local'),
                                 ('instructor', 'instructor-test@merkaz-cherum.local'), ('instructor2', 'instructor2-test@merkaz-cherum.local'), ('service', 'service-test@merkaz-cherum.local'),
                                 ('secretary', 'secretary-test@merkaz-cherum.local'), ('therapist', 'therapist-test@merkaz-cherum.local'),
                                 ('coordinator', 'coordinator-test@merkaz-cherum.local'), ('manager', 'manager-test@merkaz-cherum.local')) v(k, email) loop
    select id into uid from auth.users where email = r.email;
    if uid is null then missing := missing || r.k; continue; end if;
    personas := personas || jsonb_build_object('k', r.k, 'role', 'authenticated', 'claims',
      jsonb_build_object('role', 'authenticated', 'aud', 'authenticated', 'sub', uid, 'email', r.email));
  end loop;
  select u.id, u.email into uid, mail from public.staff s join public.staff_private sp on sp.staff_id = s.id join auth.users u on u.id = sp.auth_user_id
   where s.active and (s.kind = 'admin' or sp.is_admin) order by u.created_at limit 1;
  if uid is null then missing := missing || 'admin'::text;
  else personas := personas || jsonb_build_object('k', 'admin', 'role', 'authenticated', 'claims',
         jsonb_build_object('role', 'authenticated', 'aud', 'authenticated', 'sub', uid, 'email', mail));
  end if;

  -- somebody who was removed from the staff (not active) and still has a sign-in
  select u.id, u.email into uid, mail from public.staff s join public.staff_private sp on sp.staff_id = s.id join auth.users u on u.id = sp.auth_user_id
   where not s.active order by u.created_at limit 1;
  if uid is null then missing := missing || 'inactive'::text;
  else personas := personas || jsonb_build_object('k', 'inactive', 'role', 'authenticated', 'claims',
         jsonb_build_object('role', 'authenticated', 'aud', 'authenticated', 'sub', uid, 'email', mail));
  end if;

  -- ---------- tables and views ----------
  for t in select c.oid, c.relname, c.relkind, c.relrowsecurity, coalesce(array_to_string(c.reloptions, ','), '') as opts
             from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') and part = 'tables' order by c.relname loop
    execute format('select count(*) from public.%I', t.relname) into n;
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum), min(quote_ident(a.attname)) filter (where a.attnum = (select min(b.attnum) from pg_attribute b where b.attrelid = t.oid and b.attnum > 0 and not b.attisdropped and b.attgenerated = '' and b.attidentity <> 'a'))
      into cols, col1 from pg_attribute a where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a';
    rowj := null; tids := null;
    -- on a big table the tries touch only a random sample of rows (the row rules run a function per row)
    if t.relkind in ('r', 'p') then
      if n <= 400 then execute format('select array_agg(ctid) from public.%I', t.relname) into tids;
      else execute format('select array_agg(c) from (select ctid as c from public.%I order by random() limit 200) z', t.relname) into tids; end if;
      tids := coalesce(tids, '{}');
    end if;
    if t.relkind in ('r', 'p') and n > 0 then execute format('select to_jsonb(x) from public.%I x limit 1', t.relname) into rowj; end if;
    per := '{}'::jsonb;
    for p in select * from jsonb_array_elements(personas) loop
      k := p->>'k'; one := '{}'::jsonb;
      -- read
      begin
        perform set_config('request.jwt.claims', (p->'claims')::text, true); execute 'set local role ' || quote_ident(p->>'role');
        if tids is null then execute format('select count(*) from public.%I', t.relname) into n;
        else execute format('select count(*) from public.%I where ctid = any($1)', t.relname) into n using tids; end if;
        res := n::text;
        raise exception using errcode = 'RB000', message = 'undo';
      exception when others then
        if sqlstate <> 'RB000' then res := case when sqlstate = '42501' then 'X' else 'E:' || sqlstate end; end if;
      end;
      one := one || jsonb_build_object('s', res);
      if t.relkind in ('r', 'p') then
        -- add: a copy of a row this user sees (else an empty row)
        begin
          perform set_config('request.jwt.claims', (p->'claims')::text, true); execute 'set local role ' || quote_ident(p->>'role');
          n := 0;
          begin
            execute format('select count(*) from public.%I where ctid = any($1)', t.relname) into n using tids;
          exception when others then n := 0; end;
          if n > 0 then execute format('insert into public.%I (%s) select %s from public.%I where ctid = any($1) limit 1', t.relname, cols, cols, t.relname) using tids; res := 'A';
          else execute format('insert into public.%I default values', t.relname); res := 'A:empty'; end if;
          raise exception using errcode = 'RB000', message = 'undo';
        exception when others then
          if sqlstate <> 'RB000' then res := case when sqlstate = '42501' and sqlerrm ilike '%row-level security%' then 'P' when sqlstate = '42501' then 'X' else 'A:' || sqlstate end || case when n > 0 then '' else '~' end; end if;
        end;
        one := one || jsonb_build_object('i', res);
        -- add: a copy of any row (also one this user does not see)
        if rowj is not null then
          begin
            perform set_config('request.jwt.claims', (p->'claims')::text, true); execute 'set local role ' || quote_ident(p->>'role');
            execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', t.relname, cols, cols, t.relname) using rowj; res := 'A';
            raise exception using errcode = 'RB000', message = 'undo';
          exception when others then
            if sqlstate <> 'RB000' then res := case when sqlstate = '42501' and sqlerrm ilike '%row-level security%' then 'P' when sqlstate = '42501' then 'X' else 'A:' || sqlstate end; end if;
          end;
          one := one || jsonb_build_object('j', res);
        end if;
        -- change (every row it can, to the same value)
        begin
          perform set_config('request.jwt.claims', (p->'claims')::text, true); execute 'set local role ' || quote_ident(p->>'role');
          execute format('update public.%I set %s = %s where ctid = any($1)', t.relname, col1, col1) using tids; get diagnostics n = row_count; res := n::text;
          raise exception using errcode = 'RB000', message = 'undo';
        exception when others then
          if sqlstate <> 'RB000' then res := case when sqlstate = '42501' and sqlerrm ilike '%row-level security%' then 'P' when sqlstate = '42501' then 'X' else 'A:' || sqlstate end; end if;
        end;
        one := one || jsonb_build_object('u', res);
        -- delete (every row it can)
        begin
          perform set_config('request.jwt.claims', (p->'claims')::text, true); execute 'set local role ' || quote_ident(p->>'role');
          execute format('delete from public.%I where ctid = any($1)', t.relname) using tids; get diagnostics n = row_count; res := n::text;
          raise exception using errcode = 'RB000', message = 'undo';
        exception when others then
          if sqlstate <> 'RB000' then res := case when sqlstate = '42501' then 'X' else 'A:' || sqlstate end; end if;
        end;
        one := one || jsonb_build_object('d', res);
      end if;
      per := per || jsonb_build_object(k, one);
    end loop;
    execute format('select count(*) from public.%I', t.relname) into n;
    tabs := tabs || jsonb_build_object(t.relname, jsonb_build_object(
      'kind', t.relkind, 'rls', t.relrowsecurity, 'opts', t.opts, 'rows', n, 'tried', coalesce(cardinality(tids), n), 'p', per,
      'cols', (select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
      'anon_cols', (select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped and has_column_privilege('anon', t.oid, a.attnum, 'select')),
      'grants', (select jsonb_object_agg(g.role, g.privs) from (select x.role, string_agg(x.priv, ',') as privs from (values ('anon'), ('authenticated')) rr(role)
                   cross join lateral (select rr.role, pr as priv from unnest(array['select', 'insert', 'update', 'delete']) pr where has_table_privilege(rr.role, t.oid, pr)) x group by x.role) g),
      'policies', (select jsonb_agg(jsonb_build_object('n', pl.policyname, 'cmd', pl.cmd, 'to', pl.roles, 'using', pl.qual, 'check', pl.with_check, 'perm', pl.permissive) order by pl.policyname)
                     from pg_policies pl where pl.schemaname = 'public' and pl.tablename = t.relname)));
  end loop;

  -- ---------- functions ----------
  for f in select pr.oid, pr.proname, pr.prosecdef, pr.proretset, pg_get_function_identity_arguments(pr.oid) as idargs, format_type(pr.prorettype, null) as ret,
                  (select coalesce(string_agg('null::' || format_type(a.t, null), ', ' order by a.ord), '') from unnest(pr.proargtypes) with ordinality a(t, ord)) as nullargs,
                  pr.prosrc ~* '(is_staff|is_coordinator|is_admin|is_secretary|is_manager|is_personal|is_therapist|is_director|my_staff_id|auth\.uid|auth\.jwt|auth\.role|tv_device|device_token)' as guard,
                  has_function_privilege('anon', pr.oid, 'execute') as g_anon, has_function_privilege('authenticated', pr.oid, 'execute') as g_auth
             from pg_proc pr
            where pr.pronamespace = 'public'::regnamespace and pr.prokind = 'f' and part = 'functions'
              and pr.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
              and not exists (select 1 from pg_depend d where d.objid = pr.oid and d.deptype = 'e')
            order by pr.proname, 5 loop
    per := '{}'::jsonb;
    if f.g_anon or f.g_auth then
      for p in select * from jsonb_array_elements(personas) loop
        k := p->>'k';
        continue when not (k = any(low));
        begin
          perform set_config('request.jwt.claims', (p->'claims')::text, true); execute 'set local role ' || quote_ident(p->>'role');
          if f.ret = 'boolean' and not f.proretset then
            execute format('select coalesce(public.%I(%s)::text, ''null'')', f.proname, f.nullargs) into res; res := 'R=' || res;
          else
            execute format('select count(*), coalesce(sum(length(x::text)), 0) from public.%I(%s) x', f.proname, f.nullargs) into n, len; res := 'R:' || n || '/' || len;
          end if;
          raise exception using errcode = 'RB000', message = 'undo';
        exception when others then
          if sqlstate <> 'RB000' then res := case when sqlstate = '42501' then 'X' else 'E:' || sqlstate end || ':' || left(regexp_replace(sqlerrm, '\s+', ' ', 'g'), 70); end if;
        end;
        per := per || jsonb_build_object(k, res);
      end loop;
    end if;
    funs := funs || jsonb_build_object('n', f.proname, 'args', f.idargs, 'ret', f.ret, 'def', f.prosecdef, 'anon', f.g_anon, 'auth', f.g_auth, 'guard', f.guard, 'r', per);
  end loop;

  -- ---------- pointed tries (with the functions part): the admin rights guard, and a person who was removed from the staff ----------
  per := '{}'::jsonb;
  select sp.staff_id into uid from public.staff_private sp where sp.email = 'instructor2-test@merkaz-cherum.local';
  if part = 'functions' and uid is not null then
    for p in select * from jsonb_array_elements(personas) loop
      k := p->>'k';
      continue when not (k = any(array['coordinator', 'oldmanager', 'admin', 'instructor']));
      one := '{}'::jsonb;
      for r in select * from (values ('tick_admin', 'update public.staff_private set is_admin = true where staff_id = $1'),
                                     ('role_admin', 'update public.staff set kind = ''admin'' where id = $1'),
                                     ('role_manager', 'update public.staff set kind = ''manager'' where id = $1'),
                                     ('plain_edit', 'update public.staff set sort_order = sort_order where id = $1'),
                                     ('role_service', 'update public.staff set kind = ''service'' where id = $1')) v(name, q) loop
        begin
          perform set_config('request.jwt.claims', (p->'claims')::text, true); execute 'set local role ' || quote_ident(p->>'role');
          execute r.q using uid; get diagnostics n = row_count; res := n::text;
          raise exception using errcode = 'RB000', message = 'undo';
        exception when others then
          if sqlstate <> 'RB000' then res := case when sqlstate = '42501' and sqlerrm ilike '%row-level security%' then 'P' when sqlstate = '42501' then 'X' else 'A:' || sqlstate end; end if;
        end;
        one := one || jsonb_build_object(r.name, res);
      end loop;
      per := per || jsonb_build_object(k, one);
    end loop;
    -- the same instructor after a removal from the staff (active = false; undone at once): what is still read
    select p2 into p from jsonb_array_elements(personas) p2 where p2->>'k' = 'instructor2';
    one := '{}'::jsonb;
    for r in select * from unnest(array['staff', 'assignment', 'schedule', 'special_days', 'open_days', 'sched_settings', 'timetable_fixed', 'roster', 'child_state',
                                        'child_journeys', 'mercury_library', 'notices', 'announcements', 'swap_requests', 'observations']) v(name) loop
      begin
        update public.staff set active = false where id = uid;
        perform set_config('request.jwt.claims', (p->'claims')::text, true); execute 'set local role authenticated';
        execute format('select count(*) from public.%I', r.name) into n; res := n::text;
        raise exception using errcode = 'RB000', message = 'undo';
      exception when others then
        if sqlstate <> 'RB000' then res := case when sqlstate = '42501' then 'X' else 'E:' || sqlstate end; end if;
      end;
      one := one || jsonb_build_object(r.name, res);
    end loop;
    per := per || jsonb_build_object('removed_instructor_reads', one);
  end if;

  insert into rls_out values (jsonb_build_object('made', now(), 'by', me, 'part', part, 'personas', (select jsonb_agg(x->>'k') from jsonb_array_elements(personas) x),
    'missing', to_jsonb(missing), 'tables', tabs, 'functions', funs, 'pointed', per));
end $$;

select j::text as rls_matrix from rls_out;
