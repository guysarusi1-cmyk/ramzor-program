-- ================================================================
-- The rights check of an organisation's database — run in the SQL Editor of that project. CHANGES NOTHING. (Yigal + Guy 2026-11-14)
-- Inside one block it adds a few invented people for a moment (an instructor, the current builder, a builder of earlier two weeks,
-- an admin who is not in the schedule, somebody who left), tries as each of them (and as a visitor, and as a signed-in address with no
-- staff row) what they may and may not do, and then undoes everything: the block always ends with an error that rolls it all back,
-- and only the answer is kept. It reads no real person's data (every try counts rows of the invented people only, or only asks
-- whether a write is allowed). The answer is one cell: "pass" and the list of what failed. Copy it to Claude.
-- Needs: core-v1, core-v2, scheduling-v75 ... v80.
-- ================================================================
drop table if exists pg_temp.rls_probe_out;
create temp table rls_probe_out (j jsonb);

do $$
declare
  res jsonb := '[]'::jsonb; fails jsonb := '[]'::jsonb; total int := 0;
  u jsonb := '{}'::jsonb;               -- the invented people: key -> {uid, staff, person}
  per date := (current_date - extract(dow from current_date)::int)::date;          -- the two weeks of now (from this Sunday)
  old_per date := (current_date - extract(dow from current_date)::int - 42)::date; -- two weeks that already ended
  k text; sid uuid; pid uuid; uid uuid; got text; ok boolean;
  procedure_try text;
begin
  begin
    -- the invented people (gone at the end, with everything else)
    foreach k in array array['ins', 'bld', 'oldbld', 'adm', 'gone'] loop
      uid := gen_random_uuid();
      insert into public.staff(display_name, kind, active) values ('probe-' || k, case when k = 'adm' then 'admin' else 'staff' end, k <> 'gone') returning id into sid;
      insert into public.staff_private(staff_id, email, auth_user_id, is_admin) values (sid, 'probe-' || k || '@probe.invalid', uid, k = 'adm');
      pid := null;
      if k <> 'adm' then insert into public.tw_people(name, staff_id, active) values ('probe-' || k, sid, k <> 'gone') returning id into pid; end if;
      u := u || jsonb_build_object(k, jsonb_build_object('uid', uid, 'staff', sid, 'person', pid));
    end loop;
    insert into public.tw_period(start, builder, status) values (per, (u->'bld'->>'person')::uuid, 'open') on conflict (start) do update set builder = excluded.builder, status = 'open';
    insert into public.tw_period(start, builder, status) values (old_per, (u->'oldbld'->>'person')::uuid, 'built') on conflict (start) do update set builder = excluded.builder;
    insert into public.tw_option(period, person, day, shift) values (per, (u->'ins'->>'person')::uuid, per + 1, 'M'), (per, (u->'bld'->>'person')::uuid, per + 2, 'M'), (old_per, (u->'ins'->>'person')::uuid, old_per + 1, 'M');
    insert into public.tw_other(period, person, day, from_time, to_time) values (per, (u->'ins'->>'person')::uuid, per + 3, '10:00', '16:00');
    insert into public.tw_submission(period, person, note) values (per, (u->'ins'->>'person')::uuid, 'probe');
    insert into public.tw_assignment(period, day, shift, person) values (per, per + 1, 'M', (u->'ins'->>'person')::uuid), (old_per, old_per + 1, 'M', (u->'ins'->>'person')::uuid);

    -- the tries: who, what, what is expected (deny = refused; zero = nothing seen or touched; some = something seen or touched; ok = allowed)
    for k, procedure_try, got in
      select * from (values
        -- a visitor who is not signed in
        ('anon', 'select count(*) from public.tw_people', 'deny_or_zero'), ('anon', 'select count(*) from public.tw_option', 'deny_or_zero'),
        ('anon', 'select count(*) from public.staff_private', 'deny_or_zero'), ('anon', 'select count(*) from public.tw_swap', 'deny_or_zero'),
        ('anon', 'select count(*) from public.tw_message', 'deny_or_zero'), ('anon', 'select count(*) from public.tw_assignment', 'deny_or_zero'),
        ('anon', 'select public.my_profile()', 'deny'), ('anon', 'select public.tw_auto_open()', 'deny'),
        -- a signed-in address with no staff row (the sign-up that was open)
        ('stranger', 'select count(*) from public.tw_people', 'zero'), ('stranger', 'select count(*) from public.tw_option', 'zero'),
        ('stranger', 'select count(*) from public.staff', 'zero'), ('stranger', 'select count(*) from public.staff_private', 'zero'),
        ('stranger', 'select count(*) from public.tw_period', 'zero'), ('stranger', 'select count(*) from public.tw_message', 'zero'),
        ('stranger', 'select count(*) from public.tw_swap', 'zero'), ('stranger', 'select count(*) from public.org_profile', 'zero'),
        ('stranger', 'insert into public.tw_message(body) values (''x'')', 'deny'), ('stranger', 'select public.core_add_staff(''x'', null)', 'deny'),
        ('stranger', 'select count(*) from public.tw_mail_log', 'deny_or_zero'), ('stranger', 'select count(*) from public.schema_migrations', 'deny_or_zero'),
        -- somebody who left (her sign-in still exists)
        ('gone', 'select count(*) from public.tw_people', 'zero'), ('gone', 'select count(*) from public.tw_option', 'zero'), ('gone', 'select count(*) from public.staff', 'zero'),
        -- a plain instructor
        ('ins', 'select count(*) from public.tw_option where person = (select id from public.tw_people where name = ''probe-ins'')', 'some'),
        ('ins', 'select count(*) from public.tw_option where person <> (select id from public.tw_people where name = ''probe-ins'')', 'zero'),
        ('ins', 'select count(*) from public.tw_assignment where period = ' || quote_literal(per), 'zero'),
        ('ins', 'select count(*) from public.staff_private', 'zero'), ('ins', 'select count(*) from public.tw_build_log', 'zero'),
        ('ins', 'update public.tw_people set per_week = per_week', 'zero'), ('ins', 'update public.org_profile set name = name', 'zero'),
        ('ins', 'insert into public.tw_message(body) values (''x'')', 'deny'), ('ins', 'insert into public.tw_swap(period, day, shift, from_person) values (' || quote_literal(per) || ', ' || quote_literal(per) || ', ''M'', (select id from public.tw_people where name = ''probe-ins''))', 'deny'),
        ('ins', 'update public.tw_period set status = ''published''', 'deny_or_zero'), ('ins', 'select public.tw_publish(' || quote_literal(per) || ', true)', 'deny'),
        ('ins', 'select public.core_add_staff(''x'', null)', 'deny'), ('ins', 'insert into public.tw_settings(key, value) values (''queue'', ''[]'') on conflict (key) do update set value = excluded.value', 'deny_or_zero'),
        ('ins', 'update public.staff set kind = ''admin'' where display_name = ''probe-ins''', 'deny_or_zero'),
        -- the builder of the two weeks of now
        ('bld', 'select count(*) from public.tw_option where period = ' || quote_literal(per) || ' and person = (select id from public.tw_people where name = ''probe-ins'')', 'some'),
        ('bld', 'select count(*) from public.tw_other where period = ' || quote_literal(per), 'some'),
        ('bld', 'select count(*) from public.tw_option where period = ' || quote_literal(old_per), 'zero'),
        ('bld', 'insert into public.tw_message(body) values (''probe'')', 'ok'), ('bld', 'select public.tw_publish_check(' || quote_literal(per) || ')', 'ok'),
        ('bld', 'insert into public.tw_build_log(period, seed, input, result) values (' || quote_literal(per) || ', 1, ''{}'', ''{}'')', 'ok'),
        ('bld', 'update public.tw_people set per_week = per_week', 'zero'), ('bld', 'select count(*) from public.staff_private', 'zero'),
        ('bld', 'select public.core_add_staff(''x'', null)', 'deny'),
        -- the builder of two weeks that already ended
        ('oldbld', 'select count(*) from public.tw_option where period = ' || quote_literal(old_per) || ' and person <> (select id from public.tw_people where name = ''probe-oldbld'')', 'zero'),
        ('oldbld', 'update public.tw_assignment set note = note where period = ' || quote_literal(old_per), 'zero'),
        ('oldbld', 'insert into public.tw_message(body) values (''x'')', 'deny'),
        -- the admin who is not in the schedule
        ('adm', 'select count(*) from public.staff_private where email like ''probe-%''', 'some'), ('adm', 'update public.tw_people set per_week = per_week where name like ''probe-%''', 'some'),
        ('adm', 'select count(*) from public.tw_option where period = ' || quote_literal(per), 'some'), ('adm', 'insert into public.tw_message(body) values (''probe'')', 'ok'),
        ('adm', 'select count(*) from public.tw_mail_log', 'deny_or_zero'), ('adm', 'select count(*) from public.schema_migrations', 'deny_or_zero'),
        ('adm', 'select public.tw_purge_old()', 'deny'), ('adm', 'select public.tw_auto_open_job()', 'deny')
      ) v(who, q, expect)
    loop
      total := total + 1;
      declare n bigint; outcome text;
      begin
        begin
          if k = 'anon' then perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
          elsif k = 'stranger' then perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true); execute 'set local role authenticated';
          else perform set_config('request.jwt.claims', jsonb_build_object('sub', u->k->>'uid', 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end if;
          if procedure_try ilike 'select count%' then execute procedure_try into n; outcome := case when n > 0 then 'some' else 'zero' end;
          else execute procedure_try; get diagnostics n = row_count; outcome := case when procedure_try ilike 'select %' then 'ok' when n > 0 then 'some' else 'zero' end; end if;
          raise exception using errcode = 'P0001', message = 'rls-probe-undo:' || outcome;          -- (undo this one try at once)
        exception when others then
          if sqlerrm like 'rls-probe-undo:%' then outcome := substr(sqlerrm, 16); else outcome := 'deny'; end if;
        end;
        execute 'reset role';
        ok := outcome = got or (got = 'deny_or_zero' and outcome in ('deny', 'zero')) or (got = 'ok' and outcome in ('ok', 'some'));
        if not ok then fails := fails || jsonb_build_object('who', k, 'try', left(procedure_try, 140), 'expected', got, 'got', outcome); end if;
      end;
    end loop;
    raise exception using errcode = 'P0001', message = 'rls-probe-done';          -- (undo the invented people and everything around them)
  exception when others then
    if sqlerrm <> 'rls-probe-done' then fails := fails || jsonb_build_object('setup', sqlerrm); end if;
  end;
  insert into rls_probe_out values (jsonb_build_object('pass', jsonb_array_length(fails) = 0, 'tries', total, 'failed', fails));
end $$;

select j::text as rls_probe from rls_probe_out;
