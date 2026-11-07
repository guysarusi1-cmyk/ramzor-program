-- TEST project only: a test secretary (kind 'secretary' of scheduling-v62.sql), to see her screens as she sees them.
-- Before running: Authentication -> Users -> Add user -> Create new user (tick "Auto Confirm User"), the same password as the other test accounts:
--     secretary-test@merkaz-cherum.local
-- Safe to run again.
-- safety: TEST only. On any other database this stops here, before any change (the marker: supabase/test-marker.sql, run once on TEST)
do $$ begin
  if to_regclass('ops.environment') is null or not exists (select 1 from ops.environment where name = 'test') then
    raise exception 'עצירה: זה לא מסד הבדיקות (TEST). לא שונה דבר.';
  end if;
end $$;

do $$
declare sid uuid; uid uuid;
begin
  select id into uid from auth.users where email = 'secretary-test@merkaz-cherum.local';
  if uid is null then raise exception 'first add the user secretary-test@merkaz-cherum.local (Authentication -> Users)'; end if;
  select staff_id into sid from public.staff_private where email = 'secretary-test@merkaz-cherum.local';
  if sid is null then
    insert into public.staff (display_name, kind, active, sort_order) values ('מזכירה בדיקה', 'secretary', true, 960) returning id into sid;
    insert into public.staff_private (staff_id, email, auth_user_id, female) values (sid, 'secretary-test@merkaz-cherum.local', uid, true);
  else
    update public.staff set kind = 'secretary', active = true where id = sid;
    update public.staff_private set auth_user_id = uid where staff_id = sid;
  end if;
end $$;
select s.display_name, s.kind, p.email, (p.auth_user_id is not null) as linked
  from public.staff s join public.staff_private p on p.staff_id = s.id where p.email = 'secretary-test@merkaz-cherum.local';
