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
  n int; n0 int; asg uuid; asg2 uuid; vid uuid; sid uuid; line text;
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

  -- long vacation: requested ahead, decided by the coordinator, then entered as absence that the person cannot delete
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into vacation_requests (staff_id, from_day, to_day) values (sa, current_date + 40, current_date + 43); insert into t_res values ('instructor requests a vacation far enough ahead', true);
  exception when others then insert into t_res values ('instructor requests a vacation far enough ahead', false); end;
  begin insert into vacation_requests (staff_id, from_day, to_day) values (sa, current_date - 3, current_date - 2); insert into t_res values ('a vacation request in the past is refused', false);
  exception when others then insert into t_res values ('a vacation request in the past is refused', true); end;
  begin insert into vacation_requests (staff_id, from_day, to_day) values (sb, current_date + 40, current_date + 41); insert into t_res values ('instructor CANNOT request a vacation for somebody else', false);
  exception when others then insert into t_res values ('instructor CANNOT request a vacation for somebody else', true); end;
  select id into vid from vacation_requests where staff_id = sa and from_day = current_date + 40;
  begin perform decide_vacation(vid, true); insert into t_res values ('instructor CANNOT approve her own vacation', false);
  exception when others then insert into t_res values ('instructor CANNOT approve her own vacation', true); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform decide_vacation(vid, true); insert into t_res values ('the coordinator approves the vacation', true);
  exception when others then insert into t_res values ('the coordinator approves the vacation', false); end;
  reset role;
  select count(*) into n from prefs_absence where staff_id = sa and reason = 'vacation'; insert into t_res values ('the approved vacation became four absence days', n = 4);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from prefs_absence where reason = 'vacation'; get diagnostics n = row_count; insert into t_res values ('instructor CANNOT delete an approved vacation day', n = 0);
  reset role;

  -- the others on the same shift are told about a change in the team
  update schedule set status = 'published' where month = open_m;
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (open_m, sc, open_m + 4, 'M', '07:00', '15:00');
  select count(*) into n0 from notices where to_staff = sc;
  update assignment set staff_id = sb where id = asg;
  select count(*) into n from notices where to_staff = sc; insert into t_res values ('the others on the same shift are told when somebody is replaced', n = n0 + 1);

  -- "I cannot come": the shift opens for a replacement at once, and the coordinator and the team are told
  insert into schedule (month, status) values (date_trunc('month', current_date + 2)::date, 'sent') on conflict (month) do nothing;
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (date_trunc('month', current_date + 2)::date, sa, current_date + 2, 'M', '07:00', '15:00') returning id into asg2;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform report_cannot_come(asg2, 'x'); insert into t_res values ('nobody can report for somebody else''s shift', false);
  exception when others then insert into t_res values ('nobody can report for somebody else''s shift', true); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin sid := report_cannot_come(asg2, 'sick'); insert into t_res values ('instructor reports that she cannot come to her own shift', true);
  exception when others then insert into t_res values ('instructor reports that she cannot come to her own shift', false); end;
  reset role;
  select count(*) into n from swap_requests where assignment_id = asg2 and urgent and status = 'open'; insert into t_res values ('...and an urgent open request exists at once', n = 1);
  select count(*) into n from notices where to_staff = sb and text like '%פנויה%'; insert into t_res values ('...and the other instructors are told', n >= 1);
  select count(*) into n from notices where to_staff = sc and text like '%להגיע%'; insert into t_res values ('...and the coordinator is told', n >= 1);
  -- announcements, audit log, special days, the TV function
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform post_announcement('hello', 'both'); insert into t_res values ('instructor CANNOT post an announcement', false);
  exception when others then insert into t_res values ('instructor CANNOT post an announcement', true); end;
  select count(*) into n from audit_log; insert into t_res values ('instructor sees NO audit log', n = 0);
  begin insert into special_days (day, kind) values (current_date + 9, 'special'); insert into t_res values ('instructor CANNOT define special days', false);
  exception when others then insert into t_res values ('instructor CANNOT define special days', true); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform post_announcement('hello', 'both'); insert into t_res values ('the coordinator posts an announcement', true);
  exception when others then insert into t_res values ('the coordinator posts an announcement', false); end;
  select count(*) into n from audit_log; insert into t_res values ('the coordinator sees the audit log', n >= 1);
  begin insert into special_days (day, kind, label) values (current_date + 9, 'special', 'trip'); insert into t_res values ('the coordinator defines a special day', true);
  exception when others then insert into t_res values ('the coordinator defines a special day', false); end;
  reset role;
  select count(*) into n from email_outbox where kind = 'announcement'; insert into t_res values ('an e-mail announcement is queued for the staff who have an address', n >= 1);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform count(*) from tv_today(); insert into t_res values ('a visitor can ask who works today (TV)', true);
  exception when others then insert into t_res values ('a visitor can ask who works today (TV)', false); end;
  begin perform 1 from audit_log; insert into t_res values ('a visitor cannot read the audit log', false);
  exception when others then insert into t_res values ('a visitor cannot read the audit log', true); end;
  reset role;

  for line in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || line; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST-V2 % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
