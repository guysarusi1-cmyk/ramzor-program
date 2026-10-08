-- ================================================================
-- Self-test of scheduling-v11.sql (open shifts with approval). Run in the SQL Editor after scheduling-v11.sql. Made-up people; everything is rolled back at
-- the end (the result is shown as an "error" whose text starts with SELFTEST-V11 — that is how it undoes its own changes).
-- ================================================================
do $$
declare
  res text := ''; ok int := 0; bad int := 0; line text; n int; rid uuid;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); ud uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ul uuid := gen_random_uuid();
  sa uuid; sb uuid; sd uuid; sc uuid; sl uuid; x1 uuid; x2 uuid;
  m date := (date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '3 months')::date;
  tue date; fri date;
begin
  select d::date into tue from generate_series(m, m + 27, interval '1 day') d where extract(dow from d) = 2 limit 1;
  select d::date into fri from generate_series(m, m + 27, interval '1 day') d where extract(dow from d) = 5 limit 1;
  insert into staff (display_name, kind) values ('test-A', 'instructor') returning id into sa;
  insert into staff (display_name, kind) values ('test-B', 'instructor') returning id into sb;
  insert into staff (display_name, kind) values ('test-D', 'instructor') returning id into sd;
  insert into staff (display_name, kind) values ('test-coordinator', 'coordinator') returning id into sc;
  insert into staff (display_name, kind) values ('test-leader', 'instructor') returning id into sl;
  insert into staff (display_name, kind) values ('test-X1', 'instructor') returning id into x1;
  insert into staff (display_name, kind) values ('test-X2', 'instructor') returning id into x2;
  insert into staff_private (staff_id, auth_user_id, email, female, is_leader, no_nights) values
    (sa, ua, 'a@test.invalid', true, false, false), (sb, ub, 'b@test.invalid', false, false, false), (sd, ud, 'd@test.invalid', true, false, true),
    (sc, uc, 'c@test.invalid', true, false, false), (sl, ul, 'l@test.invalid', false, true, false), (x1, null, null, true, false, false), (x2, null, null, true, false, false);
  create temp table t_res (name text, passed boolean) on commit drop;
  grant all on t_res to authenticated, anon;
  insert into schedule (month, status) values (m, 'published');
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (m, sb, tue - 1, 'N', '22:00', '08:00');       -- B worked the night before
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (m, x1, fri, 'M', '07:00', '15:00'), (m, x2, fri, 'M', '07:00', '15:00');       -- two who are not leaders on the Friday morning

  -- what each person is offered
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from open_shifts(m) where day = tue and shift = 'M'; insert into t_res values ('an instructor is offered a shift that is below the minimum', n = 1);
  select count(*) into n from open_shifts(m) where day = fri and shift = 'M'; insert into t_res values ('...but not one that already has two non-leaders (the maximum)', n = 0);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ul, 'email', 'l@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from open_shifts(m) where day = fri and shift = 'M'; insert into t_res values ('a leader is offered that Friday morning', n = 1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'email', 'd@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from open_shifts(m) where day = tue and shift = 'N'; insert into t_res values ('somebody who does no nights is not offered a night', n = 0);
  select count(*) into n from open_shifts(m) where day = tue and shift = 'M'; insert into t_res values ('...but is offered the morning', n = 1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from open_shifts(m) where day = tue and shift = 'M'; insert into t_res values ('somebody who worked the night before is not offered the morning (rest)', n = 0);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform * from open_shifts(m); insert into t_res values ('the coordinator does not use the open-shift list', false);
  exception when others then insert into t_res values ('the coordinator does not use the open-shift list', true); end;
  reset role;

  -- a request goes to the coordinator; nobody is placed yet
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  rid := request_open_shift(tue, 'M'); insert into t_res values ('an instructor asks to join an open shift', rid is not null);
  begin perform request_open_shift(tue, 'M'); insert into t_res values ('...but not twice', false);
  exception when others then insert into t_res values ('...but not twice', true); end;
  select count(*) into n from open_shifts(m) where day = tue and shift = 'M' and mine = 'pending' and req = rid; insert into t_res values ('her own request shows as waiting', n = 1);
  reset role;
  select count(*) into n from assignment where staff_id = sa and day = tue; insert into t_res values ('she is NOT placed before the coordinator approves', n = 0);
  select count(*) into n from notices where to_staff = sc; insert into t_res values ('the coordinator is told about the request', n = 1);
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('the instructor is told that her request is waiting', n = 1);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform decide_open_shift(rid, true); insert into t_res values ('an instructor CANNOT approve', false);
  exception when others then insert into t_res values ('an instructor CANNOT approve', true); end;
  reset role;

  -- the coordinator approves: now she is on the shift, and the shift is no longer open
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform decide_open_shift(rid, true);
  reset role;
  select count(*) into n from assignment where staff_id = sa and day = tue and shift = 'M'; insert into t_res values ('after the approval she is placed on the shift', n = 1);
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('...and she is told', n = 2);
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'email', 'd@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from open_shifts(m) where day = tue and shift = 'M'; insert into t_res values ('a shift that was filled is not offered any more', n = 0);
  rid := request_open_shift(tue, 'A'); insert into t_res values ('another person asks for the afternoon', rid is not null);
  reset role;

  -- the coordinator says no: nobody is placed, the person is told
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform decide_open_shift(rid, false);
  reset role;
  select count(*) into n from assignment where staff_id = sd and day = tue; insert into t_res values ('after a "no" the person is not placed', n = 0);
  select count(*) into n from open_shift_requests where id = rid and status = 'rejected'; insert into t_res values ('...and the request is closed', n = 1);
  select count(*) into n from notices where to_staff = sd and text like '%לא אושרה%' or (to_staff = sd and text like '%לא הצלחנו לאשר%'); insert into t_res values ('...and the person is told', n >= 1);

  for line in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || line; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST-V11 % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
