-- ================================================================
-- Self-test of scheduling-v10.sql (who is an ahmash). Run in the SQL Editor after scheduling-v10.sql. Made-up people; everything is rolled back at the end
-- (the result is shown as an "error" whose text starts with SELFTEST-V10 — that is how it undoes its own changes).
-- ================================================================
do $$
declare
  res text := ''; ok int := 0; bad int := 0; line text; n int; r int;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  sa uuid; sb uuid;
begin
  insert into staff (display_name, kind) values ('test-A', 'instructor') returning id into sa;
  insert into staff (display_name, kind) values ('test-B', 'instructor') returning id into sb;
  insert into staff_private (staff_id, auth_user_id, email, female, ahmash_rank) values (sa, a, 'a@test.invalid', true, 1), (sb, b, 'b@test.invalid', false, 0);
  create temp table t_res (name text, passed boolean) on commit drop;
  grant all on t_res to authenticated, anon;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from ahmash_staff() where staff_id = sa; insert into t_res values ('an instructor can see who is an ahmash', n = 1);
  select count(*) into n from ahmash_staff() where staff_id = sb; insert into t_res values ('a person who is not an ahmash is not listed', n = 0);
  select rank into r from ahmash_staff() where staff_id = sa; insert into t_res values ('the rank comes with it', r = 1);
  reset role;
  set local role anon;
  begin perform * from ahmash_staff(); insert into t_res values ('somebody who is not signed in cannot ask', false);
  exception when others then insert into t_res values ('somebody who is not signed in cannot ask', true); end;
  reset role;

  for line in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || line; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST-V10 % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
