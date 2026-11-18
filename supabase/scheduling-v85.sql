-- ================================================================
-- Scheduling, part 85 — the personal notices: only "seen" may change. Run in the SQL Editor of the product's database (and of its TEST
-- project). Safe to run again. (found by the rights check on the new TEST project, 2026-11-18)
-- A project created with "Grant API access to new tables automatically" gives every signed-in person ALL rights on a new table.
-- scheduling-v82.sql granted only "update (seen_at)" but did not take the automatic rights back, so a person could also change the
-- kind / day of their OWN notice (never another person's: the row rules held). Here the automatic rights are taken back.
-- ================================================================
do $$ begin
  if to_regclass('public.tw_notice') is null then raise exception 'scheduling-v82.sql first'; end if;
end $$;
revoke all on public.tw_notice from anon, authenticated, public;
grant select on public.tw_notice to authenticated;
grant update (seen_at) on public.tw_notice to authenticated;
insert into public.schema_migrations(version) values ('scheduling-v85') on conflict (version) do nothing;
select 'scheduling_v85' as part, 'ok' as result,
       (select count(*) from information_schema.column_privileges where table_name = 'tw_notice' and grantee = 'authenticated' and privilege_type = 'UPDATE') as update_columns;
