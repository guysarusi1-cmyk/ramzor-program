-- ================================================================
-- Self-test of scheduling-v8.sql ("only one of these weekends"). Run in the SQL Editor after scheduling-v8.sql. Made-up people; everything is rolled back
-- at the end (the result is shown as an "error" whose text starts with SELFTEST-V8 — that is how it undoes its own changes).
-- ================================================================
do $$
declare
  res text := ''; ok int := 0; bad int := 0; line text; n int;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  sa uuid; sb uuid; sc uuid;
  open_fri date := (select d::date from generate_series(date_trunc('month', (now() at time zone 'Asia/Jerusalem') + interval '1 month')::date, date_trunc('month', (now() at time zone 'Asia/Jerusalem') + interval '1 month')::date + 27, interval '1 day') d where extract(dow from d) = 5 limit 1);
begin
  insert into staff (display_name, kind) values ('test-A', 'instructor') returning id into sa;
  insert into staff (display_name, kind) values ('test-B', 'instructor') returning id into sb;
  insert into staff (display_name, kind) values ('test-coordinator', 'coordinator') returning id into sc;
  insert into staff_private (staff_id, auth_user_id, email, female) values (sa, a, 'a@test.invalid', true), (sb, b, 'b@test.invalid', false), (sc, c, 'c@test.invalid', true);
  create temp table t_res (name text, passed boolean) on commit drop;
  grant all on t_res to authenticated, anon;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into prefs_pickone (staff_id, friday) values (sa, open_fri); insert into t_res values ('a person marks one of her own weekends (open month)', true);
  exception when others then insert into t_res values ('a person marks one of her own weekends (open month)', false); end;
  begin insert into prefs_pickone (staff_id, friday) values (sa, open_fri + 7); insert into t_res values ('...and a second one', true);
  exception when others then insert into t_res values ('...and a second one', false); end;
  begin insert into prefs_pickone (staff_id, friday) values (sb, open_fri); insert into t_res values ('a person CANNOT mark for somebody else', false);
  exception when others then insert into t_res values ('a person CANNOT mark for somebody else', true); end;
  begin insert into prefs_pickone (staff_id, friday) values (sa, open_fri + 1); insert into t_res values ('only a Friday can be marked', false);
  exception when others then insert into t_res values ('only a Friday can be marked', true); end;
  begin insert into prefs_pickone (staff_id, friday) values (sa, date '2020-01-03'); insert into t_res values ('a closed month cannot be changed', false);
  exception when others then insert into t_res values ('a closed month cannot be changed', true); end;
  begin insert into staff_settings (staff_id, pick_one) values (sa, true); insert into t_res values ('a person turns the option on in her own settings', true);
  exception when others then insert into t_res values ('a person turns the option on in her own settings', false); end;
  delete from prefs_pickone where friday = open_fri + 7; get diagnostics n = row_count; insert into t_res values ('a person can take a mark back', n = 1);
  reset role;
  insert into prefs_pickone (staff_id, friday) values (sb, open_fri);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from prefs_pickone; insert into t_res values ('another instructor sees only her own marks', n = 1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from prefs_pickone where staff_id in (sa, sb); insert into t_res values ('the coordinator sees everybody''s marks', n = 2);
  reset role;

  for line in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || line; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST-V8 % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
