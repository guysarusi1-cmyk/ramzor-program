-- TEST project only, ONCE (Guy 2026-10-29): the marker that says "this is the TEST database". Every SQL file meant for TEST begins by checking it,
-- and stops before any change on any other database. This file itself refuses to run where the TEST sign-in accounts do not exist (only TEST has them).
-- Safe to run again.
do $$ begin
  if not exists (select 1 from auth.users where email like '%-test@merkaz-cherum.local') then
    raise exception 'עצירה: לא נמצאו חשבונות הבדיקה, כנראה שזה לא מסד הבדיקות (TEST). לא שונה דבר.';
  end if;
end $$;

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;
create table if not exists ops.environment (name text primary key check (name = 'test'));
revoke all on ops.environment from public, anon, authenticated;
insert into ops.environment (name) values ('test') on conflict do nothing;

select 'test_marker' as part, 'ok' as result, (select name from ops.environment) as environment;
