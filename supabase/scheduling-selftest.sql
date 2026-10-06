-- ================================================================
-- Self-test of the scheduling rules (supabase/scheduling.sql). Run in the SQL Editor after scheduling.sql.
-- It creates made-up people, tries what each kind of account may and may not do, and then ROLLS EVERYTHING BACK.
-- The result is shown as an "error" whose text starts with SELFTEST — that is how it undoes its own changes.
-- Nothing real is read or written.
-- ================================================================
do $$
declare
  res text := '';
  ok int := 0; bad int := 0;
  c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); s uuid := gen_random_uuid();   -- auth ids
  sc uuid; sa uuid; sb uuid; ss uuid;                                                                                  -- staff ids
  local_now timestamp := now() at time zone 'Asia/Jerusalem';
  open_m date := (date_trunc('month', local_now) + interval '1 month')::date;
  closed_m date := date_trunc('month', local_now)::date;
  n int; asg uuid; sw uuid; who uuid;
  procedure_note text;
begin
  insert into staff (display_name, kind) values ('test-coordinator', 'coordinator') returning id into sc;
  insert into staff (display_name, kind) values ('test-A', 'instructor') returning id into sa;
  insert into staff (display_name, kind) values ('test-B', 'instructor') returning id into sb;
  insert into staff (display_name, kind) values ('test-S', 'service') returning id into ss;
  insert into staff_private (staff_id, auth_user_id, email, female, is_leader) values (sc, c, 'c@test.invalid', true, true), (sa, a, 'a@test.invalid', true, true), (sb, b, 'b@test.invalid', false, false), (ss, s, 's@test.invalid', true, false);

  -- helper: run a statement as a signed-in person (their id in the token) and report whether it worked
  create temp table t_res (name text, passed boolean) on commit drop;
  grant all on t_res to authenticated, anon;

  -- 1. an instructor sees names but not the private data
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from staff;            insert into t_res values ('instructor sees the staff list', n >= 4);
  select count(*) into n from staff_private;    insert into t_res values ('instructor sees NO private staff data', n = 0);
  select count(*) into n from staff_constraints; insert into t_res values ('instructor sees NO personal conditions', n = 0);
  begin perform 1 from email_outbox; insert into t_res values ('instructor cannot read the e-mail queue', false);
  exception when others then insert into t_res values ('instructor cannot read the e-mail queue', true); end;
  -- 2. preferences: own only, only while open
  begin insert into prefs_slot (staff_id, day, shift, level) values (sa, open_m + 3, 'M', 'can'); insert into t_res values ('instructor marks own preference (open month)', true);
  exception when others then insert into t_res values ('instructor marks own preference (open month)', (local_now >= date_trunc('month', local_now) + interval '23 days 22 hours 30 minutes')); end;
  begin insert into prefs_slot (staff_id, day, shift, level) values (sb, open_m + 3, 'M', 'no'); insert into t_res values ('instructor CANNOT mark for somebody else', false);
  exception when others then insert into t_res values ('instructor CANNOT mark for somebody else', true); end;
  begin insert into prefs_slot (staff_id, day, shift, level) values (sa, closed_m + 3, 'M', 'no'); insert into t_res values ('instructor CANNOT change a closed month', false);
  exception when others then insert into t_res values ('instructor CANNOT change a closed month', true); end;
  reset role;
  -- (a closed-month mark placed by the system, to check that the instructor cannot delete it)
  insert into prefs_slot (staff_id, day, shift, level) values (sa, closed_m + 5, 'A', 'no');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from prefs_slot where day = closed_m + 5; get diagnostics n = row_count; insert into t_res values ('instructor CANNOT delete a mark in a closed month', n = 0);
  reset role;
  -- 3. another instructor cannot read mine; the coordinator can
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from prefs_slot; insert into t_res values ('another instructor sees NO one else''s preferences', n = 0);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from prefs_slot; insert into t_res values ('coordinator sees all preferences', n >= 1);
  select count(*) into n from staff_private; insert into t_res values ('coordinator sees the private staff data', n >= 4);
  reset role;

  -- 4. a schedule is invisible until it is published
  insert into schedule (month, status) values (open_m, 'sent');
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (open_m, sa, (current_date + 2), 'M', '07:00', '15:00') returning id into asg;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from assignment; insert into t_res values ('instructor sees NO schedule before it is published', n = 0);
  reset role;
  update schedule set status = 'published' where month = open_m;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from assignment; insert into t_res values ('instructor sees the schedule once published', n >= 1);
  -- 5. swaps
  begin sw := request_swap(asg); insert into t_res values ('instructor can publish her own shift for a swap', true);
  exception when others then insert into t_res values ('instructor can publish her own shift for a swap', false); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'email', 's@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform request_swap(asg); insert into t_res values ('service staff are NOT in the instructors'' swap system', false);
  exception when others then insert into t_res values ('service staff are NOT in the instructors'' swap system', true); end;
  select count(*) into n from swap_requests; insert into t_res values ('service staff do not see the swap board', n = 0);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform offer_swap(sw); insert into t_res values ('a colleague can offer to take the shift', true);
  exception when others then insert into t_res values ('a colleague can offer to take the shift', false); end;
  begin perform decide_swap(sw, true); insert into t_res values ('only the coordinator can decide a swap', false);
  exception when others then insert into t_res values ('only the coordinator can decide a swap', true); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform decide_swap(sw, true); insert into t_res values ('the coordinator approves, and the shift moves', true);
  exception when others then insert into t_res values ('the coordinator approves, and the shift moves', false); end;
  reset role;
  select staff_id into who from assignment where id = asg; insert into t_res values ('the shift now belongs to the colleague', who = sb);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from notices; insert into t_res values ('the requester got a notice', n >= 1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('a colleague does NOT see the other person''s notices', n = 0);
  reset role;
  -- 6. nobody who is not signed in sees anything
  set local role anon;
  begin perform 1 from staff; insert into t_res values ('a visitor who is not signed in sees NO staff data', false);
  exception when others then insert into t_res values ('a visitor who is not signed in sees NO staff data', true); end;
  reset role;

  for procedure_note in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || procedure_note; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
