-- ================================================================
-- Self-test of scheduling-v2.sql. Run in the SQL Editor after scheduling-v2.sql. Creates made-up people, checks the rules, then ROLLS EVERYTHING BACK
-- (the result is shown as an "error" whose text starts with SELFTEST-V2 — that is how it undoes its own changes).
-- ================================================================
do $$
declare
  res text := ''; ok int := 0; bad int := 0;
  c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  sc uuid; sa uuid; sb uuid; ss uuid;
  local_now timestamp := now() at time zone 'Asia/Jerusalem';
  open_m date := (date_trunc('month', local_now) + interval '1 month')::date;
  closed_m date := date_trunc('month', local_now)::date;
  n int; asg uuid; line text;
begin
  insert into staff (display_name, kind) values ('test-coordinator', 'coordinator') returning id into sc;
  insert into staff (display_name, kind) values ('test-A', 'instructor') returning id into sa;
  insert into staff (display_name, kind) values ('test-B', 'instructor') returning id into sb;
  insert into staff (display_name, kind) values ('test-S', 'service') returning id into ss;
  insert into staff_private (staff_id, auth_user_id, email, female) values (sc, c, 'c@test.invalid', true), (sa, a, 'a@test.invalid', true), (sb, b, 'b@test.invalid', false), (ss, s, 's@test.invalid', true);
  create temp table t_res (name text, passed boolean) on commit drop;
  grant all on t_res to authenticated, anon;

  -- consents: own, while open
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into prefs_consent (staff_id, month, extend_morning) values (sa, open_m, true); insert into t_res values ('instructor answers her own consent (open month)', true);
  exception when others then insert into t_res values ('instructor answers her own consent (open month)', local_now >= date_trunc('month', local_now) + interval '23 days 22 hours 30 minutes'); end;
  begin insert into prefs_consent (staff_id, month, extend_morning) values (sb, open_m, true); insert into t_res values ('instructor CANNOT answer for somebody else', false);
  exception when others then insert into t_res values ('instructor CANNOT answer for somebody else', true); end;
  begin insert into prefs_consent (staff_id, month, pull_to_sunday) values (sa, closed_m, true); insert into t_res values ('instructor CANNOT answer for a closed month', false);
  exception when others then insert into t_res values ('instructor CANNOT answer for a closed month', true); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from prefs_consent; insert into t_res values ('another instructor sees NO one else''s consent', n = 0);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from prefs_consent; insert into t_res values ('coordinator sees the consents', n >= 0);
  reset role;

  -- service girls' availability: own only
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'email', 's@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into prefs_service (staff_id, day, opt) values (ss, open_m + 2, 'both'); insert into t_res values ('service girl marks her own availability (open month)', true);
  exception when others then insert into t_res values ('service girl marks her own availability (open month)', local_now >= date_trunc('month', local_now) + interval '23 days 22 hours 30 minutes'); end;
  begin insert into prefs_service (staff_id, day, opt) values (sa, open_m + 2, 'none'); insert into t_res values ('service girl CANNOT mark for somebody else', false);
  exception when others then insert into t_res values ('service girl CANNOT mark for somebody else', true); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from prefs_service; insert into t_res values ('an instructor sees NO service-girl availability', n = 0);
  reset role;

  -- a change after publishing: a notice and an e-mail in the queue
  insert into schedule (month, status) values (open_m, 'published');
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (open_m, sa, open_m + 4, 'M', '07:00', '15:00') returning id into asg;
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('a shift added to a published schedule tells the person (notice)', n = 1);
  select count(*) into n from email_outbox where to_email = 'a@test.invalid'; insert into t_res values ('...and queues an e-mail for her', n = 1);
  update assignment set staff_id = sb where id = asg;
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('moving the shift tells the one who loses it', n = 2);
  select count(*) into n from notices where to_staff = sb; insert into t_res values ('...and the one who gets it', n = 1);
  update schedule set status = 'sent' where month = open_m;
  update assignment set staff_id = sa where id = asg;
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('before publishing nobody is notified', n = 2);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from email_outbox; insert into t_res values ('instructor cannot read the e-mail queue', false);
  exception when others then insert into t_res values ('instructor cannot read the e-mail queue', true); end;
  begin perform public.tell_staff(sa, 'x', 'y'); insert into t_res values ('instructor cannot send notices herself', false);
  exception when others then insert into t_res values ('instructor cannot send notices herself', true); end;
  reset role;
  perform public.sched_safety_net();
  insert into t_res values ('the safety net can be called without harm outside its time', true);

  for line in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || line; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST-V2 % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
