-- ================================================================
-- The rights check of the product's database — run in the SQL Editor of that project. CHANGES NOTHING. (Yigal + Guy 2026-11-14)
-- One database for many organisations (scheduling-v81.sql): inside one block it adds two invented organisations (probe-a, probe-b)
-- with invented people for a moment (in probe-a: an instructor, the current builder, a builder of earlier two weeks, an admin who is
-- not in the schedule, somebody who left; in probe-b: an instructor and an admin; one person who works in BOTH; two owners, one of
-- them in support inside probe-a), tries as each of them (and as a visitor, and as a signed-in address with no staff row) what they
-- may and may not do — above all that nobody ever sees or touches another organisation — and then undoes everything: the block
-- always ends with an error that rolls it all back, and only the answer is kept. It reads no real person's data (every try counts
-- rows of the invented people only, or only asks whether a write is allowed). The answer is one cell: "pass" and the list of what
-- failed. Copy it to Claude.
-- Needs: core-v1, core-v2, scheduling-v75 ... v81, core/mail-v1.
-- ================================================================
drop table if exists pg_temp.rls_probe_out;
create temp table rls_probe_out (j jsonb);

do $$
declare
  fails jsonb := '[]'::jsonb; total int := 0;
  u jsonb := '{}'::jsonb;               -- the invented people: key -> {uid, staff, person}
  per date := (current_date - extract(dow from current_date)::int)::date;          -- the two weeks of now (from this Sunday)
  old_per date := (current_date - extract(dow from current_date)::int - 42)::date; -- two weeks that already ended
  oa uuid; ob uuid; two_uid uuid := gen_random_uuid(); own1 uuid := gen_random_uuid(); own2 uuid := gen_random_uuid();
  k text; o uuid; sid uuid; pid uuid; uid uuid; got text; ok boolean; bswap uuid; bstaff uuid; bperson uuid;
  who_uid uuid; who_hdr text;
  procedure_try text;
begin
  begin
    insert into public.org(slug, name) values ('probe-a', 'probe-a') returning id into oa;
    insert into public.org(slug, name) values ('probe-b', 'probe-b') returning id into ob;
    -- the invented people (gone at the end, with everything else)
    foreach k in array array['ins', 'bld', 'oldbld', 'adm', 'gone', 'twoa', 'bins', 'badm', 'twob'] loop
      o := case when k in ('bins', 'badm', 'twob') then ob else oa end;
      uid := case when k in ('twoa', 'twob') then two_uid else gen_random_uuid() end;
      insert into public.staff(org_id, display_name, kind, active) values (o, 'probe-' || k, case when k in ('adm', 'badm') then 'admin' else 'staff' end, k <> 'gone') returning id into sid;
      insert into public.staff_private(org_id, staff_id, email, auth_user_id, is_admin) values (o, sid, 'probe-' || k || '@probe.invalid', uid, k in ('adm', 'badm'));
      pid := null;
      if k not in ('adm', 'badm') then insert into public.tw_people(org_id, name, staff_id, active) values (o, 'probe-' || k, sid, k <> 'gone') returning id into pid; end if;
      u := u || jsonb_build_object(k, jsonb_build_object('uid', uid, 'staff', sid, 'person', pid));
    end loop;
    insert into public.core_owner(auth_user_id) values (own1), (own2);
    insert into public.core_support(owner, org, reason, until) values (own2, oa, 'probe', now() + interval '1 hour');
    bstaff := (u->'bins'->>'staff')::uuid; bperson := (u->'bins'->>'person')::uuid;

    -- probe-a: two weeks of now (open) and two weeks that ended
    insert into public.tw_period(org_id, start, builder, status) values (oa, per, (u->'bld'->>'person')::uuid, 'open');
    insert into public.tw_period(org_id, start, builder, status) values (oa, old_per, (u->'oldbld'->>'person')::uuid, 'built');
    insert into public.tw_option(org_id, period, person, day, shift) values (oa, per, (u->'ins'->>'person')::uuid, per + 1, 'M'), (oa, per, (u->'bld'->>'person')::uuid, per + 2, 'M'), (oa, old_per, (u->'ins'->>'person')::uuid, old_per + 1, 'M');
    insert into public.tw_other(org_id, period, person, day, from_time, to_time) values (oa, per, (u->'ins'->>'person')::uuid, per + 3, '10:00', '16:00');
    insert into public.tw_submission(org_id, period, person, note) values (oa, per, (u->'ins'->>'person')::uuid, 'probe');
    insert into public.tw_assignment(org_id, period, day, shift, person) values (oa, per, per + 1, 'M', (u->'ins'->>'person')::uuid), (oa, old_per, old_per + 1, 'M', (u->'ins'->>'person')::uuid);
    -- probe-b: the SAME two weeks, published, with an open swap request (an organisation must not reach it through equal dates)
    insert into public.tw_period(org_id, start, builder, status) values (ob, per, bperson, 'built');
    perform set_config('tw.publishing', 'on', true);
    update public.tw_period set status = 'published', published_at = now() where org_id = ob and start = per;
    perform set_config('tw.publishing', 'off', true);
    insert into public.tw_option(org_id, period, person, day, shift) values (ob, per, bperson, per + 4, 'A');
    insert into public.tw_assignment(org_id, period, day, shift, person) values (ob, per, current_date + 1, 'A', bperson);
    insert into public.tw_swap(org_id, period, day, shift, from_person, status) values (ob, per, current_date + 1, 'A', bperson, 'open') returning id into bswap;
    insert into public.tw_message(org_id, body, from_staff) values (ob, 'probe-b message', (u->'badm'->>'staff')::uuid);
    -- the next two weeks: closed in probe-a, open in probe-b (a check that looks at the dates only would let probe-a in)
    insert into public.tw_period(org_id, start, status) values (oa, per + 14, 'built'), (ob, per + 14, 'open');

    -- the tries: who, what, what is expected (deny = refused; zero = nothing seen or touched; some = something seen or touched; ok = allowed)
    for k, procedure_try, got in
      select * from (values
        -- a visitor who is not signed in
        ('anon', 'select count(*) from public.tw_people', 'deny_or_zero'), ('anon', 'select count(*) from public.tw_option', 'deny_or_zero'),
        ('anon', 'select count(*) from public.staff_private', 'deny_or_zero'), ('anon', 'select count(*) from public.tw_swap', 'deny_or_zero'),
        ('anon', 'select count(*) from public.tw_message', 'deny_or_zero'), ('anon', 'select count(*) from public.tw_assignment', 'deny_or_zero'),
        ('anon', 'select count(*) from public.org', 'deny_or_zero'),
        ('anon', 'select public.my_profile()', 'deny'), ('anon', 'select public.tw_auto_open()', 'deny'), ('anon', 'select public.core_orgs()', 'deny'),
        -- a signed-in address with no staff row (the sign-up that was open)
        ('stranger', 'select count(*) from public.tw_people', 'zero'), ('stranger', 'select count(*) from public.tw_option', 'zero'),
        ('stranger', 'select count(*) from public.staff', 'zero'), ('stranger', 'select count(*) from public.staff_private', 'zero'),
        ('stranger', 'select count(*) from public.tw_period', 'zero'), ('stranger', 'select count(*) from public.tw_message', 'zero'),
        ('stranger', 'select count(*) from public.tw_swap', 'zero'), ('stranger', 'select count(*) from public.org', 'zero'),
        ('stranger', 'insert into public.tw_message(body) values (''x'')', 'deny'), ('stranger', 'select public.core_add_staff(''x'', null)', 'deny'),
        ('stranger', 'select count(*) from public.tw_mail_log', 'deny_or_zero'), ('stranger', 'select count(*) from public.schema_migrations', 'deny_or_zero'),
        ('stranger', 'select count(*) from public.core_support', 'deny_or_zero'), ('stranger', 'select public.core_orgs()', 'deny'),
        -- somebody who left (her sign-in still exists)
        ('gone', 'select count(*) from public.tw_people', 'zero'), ('gone', 'select count(*) from public.tw_option', 'zero'), ('gone', 'select count(*) from public.staff', 'zero'),
        -- a plain instructor of probe-a
        ('ins', 'select count(*) from public.tw_option where person = (select id from public.tw_people where name = ''probe-ins'')', 'some'),
        ('ins', 'select count(*) from public.tw_option where person <> (select id from public.tw_people where name = ''probe-ins'')', 'zero'),
        ('ins', 'select count(*) from public.tw_assignment where period = ' || quote_literal(per), 'zero'),
        ('ins', 'select count(*) from public.staff_private', 'zero'), ('ins', 'select count(*) from public.tw_build_log', 'zero'),
        ('ins', 'update public.tw_people set per_week = per_week', 'zero'), ('ins', 'update public.org set name = name', 'zero'),
        ('ins', 'insert into public.tw_message(body) values (''x'')', 'deny'), ('ins', 'insert into public.tw_swap(period, day, shift, from_person) values (' || quote_literal(per) || ', ' || quote_literal(per) || ', ''M'', (select id from public.tw_people where name = ''probe-ins''))', 'deny'),
        ('ins', 'update public.tw_period set status = ''published''', 'deny_or_zero'), ('ins', 'select public.tw_publish(' || quote_literal(per) || ', true)', 'deny'),
        ('ins', 'select public.core_add_staff(''x'', null)', 'deny'), ('ins', 'insert into public.tw_settings(key, value) values (''queue'', ''[]'') on conflict (org_id, key) do update set value = excluded.value', 'deny_or_zero'),
        ('ins', 'update public.staff set kind = ''admin'' where display_name = ''probe-ins''', 'deny_or_zero'),
        ('ins', 'select public.core_orgs()', 'deny'), ('ins', 'select public.core_support_open(''probe-b'', ''trying'')', 'deny'), ('ins', 'select public.core_org_create(''probe-c'', ''x'')', 'deny'),
        ('ins', 'select count(*) from public.org', 'some'), ('ins', 'select count(*) from public.org where slug = ''probe-b''', 'zero'),
        -- the instructor writes into the other organisation: a person of probe-b, a row marked as probe-b
        ('ins', 'insert into public.tw_option(period, person, day, shift) values (' || quote_literal(per) || ', ' || quote_literal(bperson) || ', ' || quote_literal(per + 1) || ', ''A'')', 'deny'),
        ('ins', 'insert into public.tw_option(org_id, period, person, day, shift) values (' || quote_literal(ob) || ', ' || quote_literal(per) || ', (select id from public.tw_people where name = ''probe-ins''), ' || quote_literal(per + 5) || ', ''A'')', 'deny'),
        ('ins', 'select public.tw_swap_take(' || quote_literal(bswap) || ')', 'deny'),
        ('ins', 'insert into public.tw_option(period, person, day, shift) values (' || quote_literal(per + 14) || ', (select id from public.tw_people where name = ''probe-ins''), ' || quote_literal(per + 15) || ', ''M'')', 'deny'),
        -- the same instructor, no header (she works in one organisation only: hers)
        ('insnohdr', 'select count(*) from public.tw_option where person = (select id from public.tw_people where name = ''probe-ins'')', 'some'),
        -- the same instructor, pretending to be in probe-b (header x-org: probe-b)
        ('spoof', 'select count(*) from public.tw_option', 'zero'), ('spoof', 'select count(*) from public.tw_people', 'zero'),
        ('spoof', 'select count(*) from public.staff', 'zero'), ('spoof', 'select count(*) from public.tw_swap', 'zero'), ('spoof', 'select count(*) from public.tw_message', 'zero'),
        ('spoof', 'insert into public.tw_option(period, person, day, shift) values (' || quote_literal(per) || ', ' || quote_literal(bperson) || ', ' || quote_literal(per + 1) || ', ''M'')', 'deny'),
        -- the builder of the two weeks of now (probe-a)
        ('bld', 'select count(*) from public.tw_option where period = ' || quote_literal(per) || ' and person = (select id from public.tw_people where name = ''probe-ins'')', 'some'),
        ('bld', 'select count(*) from public.tw_other where period = ' || quote_literal(per), 'some'),
        ('bld', 'select count(*) from public.tw_option where period = ' || quote_literal(old_per), 'zero'),
        ('bld', 'select count(*) from public.tw_option where person = ' || quote_literal(bperson), 'zero'),
        ('bld', 'insert into public.tw_message(body) values (''probe'')', 'ok'), ('bld', 'select public.tw_publish_check(' || quote_literal(per) || ')', 'ok'),
        ('bld', 'insert into public.tw_build_log(period, seed, input, result) values (' || quote_literal(per) || ', 1, ''{}'', ''{}'')', 'ok'),
        ('bld', 'update public.tw_people set per_week = per_week', 'zero'), ('bld', 'select count(*) from public.staff_private', 'zero'),
        ('bld', 'select public.core_add_staff(''x'', null)', 'deny'),
        ('bld', 'select public.tw_swap_cancel(' || quote_literal(bswap) || ')', 'deny'),
        ('bld', 'insert into public.tw_assignment(period, day, shift, person) values (' || quote_literal(per) || ', ' || quote_literal(per + 6) || ', ''N'', ' || quote_literal(bperson) || ')', 'deny'),
        -- the builder of two weeks that already ended
        ('oldbld', 'select count(*) from public.tw_option where period = ' || quote_literal(old_per) || ' and person <> (select id from public.tw_people where name = ''probe-oldbld'')', 'zero'),
        ('oldbld', 'update public.tw_assignment set note = note where period = ' || quote_literal(old_per), 'zero'),
        ('oldbld', 'insert into public.tw_message(body) values (''x'')', 'deny'),
        -- the admin of probe-a (not in the schedule)
        ('adm', 'select count(*) from public.staff_private where email like ''probe-%''', 'some'), ('adm', 'update public.tw_people set per_week = per_week where name like ''probe-%''', 'some'),
        ('adm', 'select count(*) from public.tw_option where period = ' || quote_literal(per), 'some'), ('adm', 'insert into public.tw_message(body) values (''probe'')', 'ok'),
        ('adm', 'select count(*) from public.tw_mail_log', 'deny_or_zero'), ('adm', 'select count(*) from public.schema_migrations', 'deny_or_zero'),
        ('adm', 'select public.tw_purge_old()', 'deny'), ('adm', 'select public.tw_auto_open_job()', 'deny'), ('adm', 'select public.tw_auto_open_org(' || quote_literal(ob) || ')', 'deny'),
        -- the admin of probe-a and the other organisation
        ('adm', 'select count(*) from public.staff_private where email like ''probe-bins%'' or email like ''probe-badm%'' or email like ''probe-twob%''', 'zero'),
        ('adm', 'select count(*) from public.staff where display_name in (''probe-bins'', ''probe-badm'', ''probe-twob'')', 'zero'),
        ('adm', 'select count(*) from public.tw_people where name in (''probe-bins'', ''probe-twob'')', 'zero'),
        ('adm', 'select count(*) from public.tw_option where person = ' || quote_literal(bperson), 'zero'),
        ('adm', 'select count(*) from public.tw_swap', 'zero'), ('adm', 'select count(*) from public.tw_message where body = ''probe-b message''', 'zero'),
        ('adm', 'update public.tw_people set per_week = per_week where name in (''probe-bins'', ''probe-twob'')', 'zero'),
        ('adm', 'update public.tw_people set org_id = ' || quote_literal(ob) || ' where name = ''probe-ins''', 'deny_or_zero'),
        ('adm', 'insert into public.tw_people(org_id, name) values (' || quote_literal(ob) || ', ''probe-x'')', 'deny'),
        ('adm', 'select public.core_set_email(' || quote_literal(bstaff) || ', ''probe-x@probe.invalid'')', 'deny'),
        ('adm', 'select public.tw_swap_decide(' || quote_literal(bswap) || ', true)', 'deny'),
        ('adm', 'update public.org set name = name where slug = ''probe-b''', 'zero'),
        ('adm', 'select public.core_org_create(''probe-c'', ''x'')', 'deny'), ('adm', 'select count(*) from public.core_support', 'deny_or_zero'),
        -- one person who works in both: with the header of each, and with no header
        ('twoa', 'select count(*) from public.tw_people where name = ''probe-twoa''', 'some'), ('twoa', 'select count(*) from public.tw_people where name in (''probe-bins'', ''probe-twob'')', 'zero'),
        ('twob', 'select count(*) from public.tw_people where name = ''probe-twob''', 'some'), ('twob', 'select count(*) from public.tw_people where name in (''probe-ins'', ''probe-twoa'')', 'zero'),
        ('twonone', 'select count(*) from public.tw_people', 'zero'),
        -- an owner who did not open support: the list only
        ('owner', 'select public.core_orgs()', 'ok'), ('owner', 'select count(*) from public.tw_option', 'zero'), ('owner', 'select count(*) from public.staff', 'zero'),
        ('owner', 'select count(*) from public.core_support', 'deny_or_zero'),
        -- an owner in support inside probe-a: probe-a only
        ('supa', 'select count(*) from public.tw_option where period = ' || quote_literal(per), 'some'), ('supa', 'select count(*) from public.tw_option where person = ' || quote_literal(bperson), 'zero'),
        ('supb', 'select count(*) from public.tw_option', 'zero'), ('supb', 'select count(*) from public.staff', 'zero')
      ) v(who, q, expect)
    loop
      total := total + 1;
      -- who the try runs as, and the header of the site it comes from
      who_uid := case k when 'stranger' then gen_random_uuid() when 'insnohdr' then (u->'ins'->>'uid')::uuid when 'spoof' then (u->'ins'->>'uid')::uuid
                        when 'twonone' then two_uid when 'owner' then own1 when 'supa' then own2 when 'supb' then own2 when 'anon' then null
                        else (u->k->>'uid')::uuid end;
      who_hdr := case when k in ('spoof', 'twob', 'supb') then 'probe-b' when k in ('insnohdr', 'twonone', 'anon', 'stranger') then null else 'probe-a' end;
      declare n bigint; outcome text;
      begin
        begin
          perform set_config('request.headers', case when who_hdr is null then '{}' else jsonb_build_object('x-org', who_hdr)::text end, true);
          if k = 'anon' then perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
          else perform set_config('request.jwt.claims', jsonb_build_object('sub', who_uid, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end if;
          if procedure_try ilike 'select count%' then execute procedure_try into n; outcome := case when n > 0 then 'some' else 'zero' end;
          else execute procedure_try; get diagnostics n = row_count; outcome := case when procedure_try ilike 'select %' then 'ok' when n > 0 then 'some' else 'zero' end; end if;
          raise exception using errcode = 'P0001', message = 'rls-probe-undo:' || outcome;          -- (undo this one try at once)
        exception when others then
          if sqlerrm like 'rls-probe-undo:%' then outcome := substr(sqlerrm, 16); else outcome := 'deny'; end if;
        end;
        execute 'reset role';
        perform set_config('request.headers', '{}', true);
        ok := outcome = got or (got = 'deny_or_zero' and outcome in ('deny', 'zero')) or (got = 'ok' and outcome in ('ok', 'some'));
        if not ok then fails := fails || jsonb_build_object('who', k, 'try', left(procedure_try, 140), 'expected', got, 'got', outcome); end if;
      end;
    end loop;
    raise exception using errcode = 'P0001', message = 'rls-probe-done';          -- (undo the invented organisations and everything around them)
  exception when others then
    if sqlerrm <> 'rls-probe-done' then fails := fails || jsonb_build_object('setup', sqlerrm); end if;
  end;
  insert into rls_probe_out values (jsonb_build_object('pass', jsonb_array_length(fails) = 0, 'tries', total, 'failed', fails));
end $$;

select j::text as rls_probe from rls_probe_out;
