-- ================================================================
-- Self-test of scheduling-v5.sql. Run in the SQL Editor after scheduling-v5.sql. Creates made-up people, checks the rules, then ROLLS EVERYTHING BACK
-- (the result is shown as an "error" whose text starts with SELFTEST-V5 — that is how it undoes its own changes).
-- ================================================================
do $$
declare
  res text := ''; ok int := 0; bad int := 0; line text; n int; txt text; j jsonb;
  c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  sc uuid; sa uuid; sb uuid; sd uuid;
  m date := (date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date;
  day date := ((date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date + 8);
  asg uuid; asg_other uuid;
begin
  insert into staff (display_name, kind) values ('test-coordinator', 'coordinator') returning id into sc;
  insert into staff (display_name, kind) values ('test-A', 'instructor') returning id into sa;
  insert into staff (display_name, kind) values ('test-B', 'instructor') returning id into sb;
  insert into staff (display_name, kind) values ('test-D', 'instructor') returning id into sd;
  insert into staff_private (staff_id, auth_user_id, email, female, no_nights) values (sc, c, 'c@test.invalid', true, false), (sa, a, 'a@test.invalid', true, false), (sb, b, 'b@test.invalid', false, true), (sd, d, 'd@test.invalid', true, false);
  create temp table t_res (name text, passed boolean) on commit drop;
  grant all on t_res to authenticated, anon;
  insert into schedule (month, status) values (m, 'published');
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (m, sa, day, 'N', '22:00', '08:00') returning id into asg;
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (m, sb, day + 1, 'M', '07:00', '15:00') returning id into asg_other;

  -- my_profile: only my own flags
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.my_profile(); insert into t_res values ('a person reads her own profile (and only the plain flags)', (j ->> 'no_nights')::boolean = true and not (j ? 'is_leader') and not (j ? 'ahmash_rank'));
  reset role;

  -- swap_candidates: for my own shift only; not the person herself; not people who are away, working that day, or who said can/no; not "no nights" people for a night
  insert into prefs_absence (staff_id, day) values (sd, day);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from swap_candidates(asg) where name like 'test-%'; insert into t_res values ('nobody is offered for a night when they do no nights, are away, or are the person herself', n = 0);
  begin perform * from swap_candidates(asg_other); insert into t_res values ('swap candidates are shown only for my own shift', false);
  exception when others then insert into t_res values ('swap candidates are shown only for my own shift', true); end;
  reset role;
  update staff_private set no_nights = false where staff_id = sb;
  delete from assignment where id = asg_other;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from swap_candidates(asg) where name = 'test-B'; insert into t_res values ('a free colleague who is available is listed', n = 1);
  select count(*) into n from swap_candidates(asg) where name in ('test-D', 'test-A'); insert into t_res values ('...but not the one who is away, nor the person herself', n = 0);
  reset role;
  insert into prefs_slot (staff_id, day, shift, level) values (sb, day, 'N', 'can');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from swap_candidates(asg) where name = 'test-B'; insert into t_res values ('someone who marked "can" for that shift is not listed', n = 0);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform * from swap_candidates(asg); insert into t_res values ('the coordinator does not use the swap list (it is for instructors)', false);
  exception when others then insert into t_res values ('the coordinator does not use the swap list (it is for instructors)', true); end;
  reset role;

  -- the coordinator's personal message, and the warm e-mail wrapper
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform coordinator_tell(sa, 'x', 'y'); insert into t_res values ('an instructor CANNOT send personal messages', false);
  exception when others then insert into t_res values ('an instructor CANNOT send personal messages', true); end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform coordinator_tell(sa, 'כותרת', 'הסידור פורסם', 'info'); insert into t_res values ('the coordinator sends a personal message', true);
  exception when others then insert into t_res values ('the coordinator sends a personal message', false); end;
  reset role;
  select body into txt from email_outbox where to_email = 'a@test.invalid' and subject = 'כותרת' limit 1;
  insert into t_res values ('the e-mail opens with a greeting and closes warmly', txt like 'שלום test-A%' and txt like '%אנחנו כאן בשבילך%' and txt like '%בהוקרה%');
  select count(*) into n from notices where to_staff = sa and text = 'הסידור פורסם'; insert into t_res values ('...and the same text is in her portal messages', n = 1);

  -- gender of the wording
  insert into t_res values ('the wording follows the gender', public.gx(sa, 'M', 'F') = 'F' and public.gx(sb, 'M', 'F') = 'M');

  -- the goal: only the three known values
  begin insert into prefs_submission (staff_id, month, goal) values (sa, m, 'max'); insert into t_res values ('a goal can be saved', true);
  exception when others then insert into t_res values ('a goal can be saved', false); end;
  begin insert into prefs_submission (staff_id, month, goal) values (sb, m, 'everything'); insert into t_res values ('an unknown goal is refused', false);
  exception when others then insert into t_res values ('an unknown goal is refused', true); end;

  -- the change notices are now warm
  delete from notices where to_staff = sb;
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (m, sb, day + 3, 'A', '14:00', '22:00');
  select text into txt from notices where to_staff = sb limit 1;
  insert into t_res values ('a shift added after publishing says it kindly and offers help', txt like 'שובצת למשמרת%' and txt like '%נשמח לעזור%');

  for line in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || line; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST-V5 % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
