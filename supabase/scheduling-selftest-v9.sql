-- ================================================================
-- Self-test of scheduling-v9.sql. Run in the SQL Editor after scheduling-v9.sql. Made-up people; everything is rolled back at the end
-- (the result is shown as an "error" whose text starts with SELFTEST-V9 — that is how it undoes its own changes).
-- ================================================================
do $$
declare
  res text := ''; ok int := 0; bad int := 0; line text; n int;
  sa uuid; sb uuid;
  m date := (date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date;
  day date := ((date_trunc('month', now() at time zone 'Asia/Jerusalem') + interval '1 month')::date + 8);
  asg uuid;
begin
  insert into staff (display_name, kind) values ('test-A', 'instructor') returning id into sa;
  insert into staff (display_name, kind) values ('test-B', 'instructor') returning id into sb;
  insert into staff_private (staff_id, email, female) values (sa, 'a@test.invalid', true), (sb, 'b@test.invalid', false);
  create temp table t_res (name text, passed boolean) on commit drop;
  insert into schedule (month, status) values (m, 'published');
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (m, sb, day, 'M', '07:00', '15:00');
  -- A is added to B's shift after publishing
  insert into assignment (month, staff_id, day, shift, from_time, to_time) values (m, sa, day, 'M', '07:00', '15:00') returning id into asg;
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('the person who was added gets no "you were placed" notice', n = 0);
  select count(*) into n from email_outbox where to_email = 'a@test.invalid'; insert into t_res values ('...and no e-mail', n = 0);
  select count(*) into n from notices where to_staff = sb; insert into t_res values ('the colleague on the same shift is told about the change', n = 1);
  -- removing, and changing the hours, still tell the person
  update assignment set to_time = '16:00' where id = asg;
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('a change of hours is still told to the person', n = 1);
  delete from assignment where id = asg;
  select count(*) into n from notices where to_staff = sa; insert into t_res values ('a removal is still told to the person', n = 2);

  for line in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || line; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST-V9 % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
