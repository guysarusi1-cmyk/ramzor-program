-- ================================================================
-- Self-test of scheduling-v6.sql (voices). Run in the SQL Editor after scheduling-v6.sql. Made-up people; everything is rolled back at the end
-- (the result is shown as an "error" whose text starts with SELFTEST-V6 — that is how it undoes its own changes).
-- ================================================================
do $$
declare
  res text := ''; ok int := 0; bad int := 0; line text; n int; txt text; subj text;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  sa uuid; sb uuid; sc uuid;
begin
  insert into staff (display_name, kind) values ('test-A', 'instructor') returning id into sa;
  insert into staff (display_name, kind) values ('test-B', 'instructor') returning id into sb;
  insert into staff (display_name, kind) values ('test-coordinator', 'coordinator') returning id into sc;
  insert into staff_private (staff_id, auth_user_id, email, female) values (sa, a, 'a@test.invalid', true), (sb, b, 'b@test.invalid', false), (sc, c, 'c@test.invalid', true);
  create temp table t_res (name text, passed boolean) on commit drop;
  grant all on t_res to authenticated, anon;

  -- each person's own settings
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'email', 'a@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into staff_settings (staff_id, voice) values (sa, 'light'); insert into t_res values ('a person saves her own voice', true);
  exception when others then insert into t_res values ('a person saves her own voice', false); end;
  begin insert into staff_settings (staff_id, voice) values (sb, 'brief'); insert into t_res values ('a person CANNOT set somebody else''s voice', false);
  exception when others then insert into t_res values ('a person CANNOT set somebody else''s voice', true); end;
  begin insert into staff_settings (staff_id, voice) values (sa, 'sarcastic'); insert into t_res values ('an unknown voice is refused', false);
  exception when others then insert into t_res values ('an unknown voice is refused', true); end;
  reset role;
  insert into staff_settings (staff_id, voice) values (sb, 'brief');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'email', 'b@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from staff_settings; insert into t_res values ('a person sees only her own settings', n = 1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'email', 'c@test.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from staff_settings where staff_id in (sa, sb); insert into t_res values ('the coordinator sees the voices (to write each message in the right one)', n = 2);
  reset role;

  -- the same event, three voices
  perform public.tell_key(sa, 'shift_added', '05/12 (שבת) בוקר');
  perform public.tell_key(sb, 'shift_added', '05/12 (שבת) בוקר');
  perform public.tell_key(sc, 'shift_added', '05/12 (שבת) בוקר');
  select text into txt from notices where to_staff = sa limit 1; insert into t_res values ('the light voice writes in a light way', txt like '%נעזור%' and txt like 'שובצת למשמרת: 05/12%');
  select text into txt from notices where to_staff = sb limit 1; insert into t_res values ('the brief voice is short and to the point', txt = 'נוספה משמרת: 05/12 (שבת) בוקר.');
  select text into txt from notices where to_staff = sc limit 1; insert into t_res values ('the warm voice is the default', txt like '%נשמח לעזור%');
  select body into txt from email_outbox where to_email = 'a@test.invalid' limit 1; insert into t_res values ('the light e-mail greets lightly', txt like 'היי test-A%' and txt like '%סתם רצון לדבר%');
  select body into txt from email_outbox where to_email = 'b@test.invalid' limit 1; insert into t_res values ('the brief e-mail has no pleasantries', txt like 'test-B,%' and txt not like '%בהוקרה%' and txt not like '%אנחנו כאן%');
  select body into txt from email_outbox where to_email = 'c@test.invalid' limit 1; insert into t_res values ('the warm e-mail opens and closes warmly', txt like 'שלום test-coordinator%' and txt like '%בהוקרה%');
  select subject into subj from email_outbox where to_email = 'b@test.invalid' limit 1; insert into t_res values ('the subject follows the voice too', subj = 'נוספה משמרת');
  insert into t_res values ('an unknown key still gives a message', (select count(*) from (select public.tell_key(sa, 'no_such_key', 'x')) q) = 1);

  for line in select (case when passed then '  ✓ ' else '  ✗ ' end) || name from t_res order by passed, name loop res := res || E'\n' || line; end loop;
  select count(*) filter (where passed), count(*) filter (where not passed) into ok, bad from t_res;
  raise exception 'SELFTEST-V6 % passed, % FAILED (everything was rolled back).%', ok, bad, res;
end $$;
