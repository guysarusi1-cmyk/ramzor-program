-- "בדיקות בית מאזן" ONLY (the product's TEST project, lcwtdaqxxzaqwxyimnjs), ONCE (Guy 22.11): the marker that says "this is the TEST database".
-- Every SQL file meant only for this TEST begins by checking it, and stops before any change on any other database.
-- Paste it ONLY in the SQL Editor opened from the link of the TEST project (its address has lcwtdaqxxzaqwxyimnjs). Never on the pilot's database.
-- Safe to run again.
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;
create table if not exists ops.environment (name text primary key check (name = 'test'));
revoke all on ops.environment from public, anon, authenticated;
insert into ops.environment (name) values ('test') on conflict do nothing;

select 'test_marker' as part, 'ok' as result, (select name from ops.environment) as environment, (select string_agg(name, ', ') from public.org) as org;
