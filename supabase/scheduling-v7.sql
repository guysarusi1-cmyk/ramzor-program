-- scheduling-v7: the hourly job (the secret key, role service_role) may read and write what it needs.
-- Run once in the TEST project's SQL Editor. Safe to run again.
-- (service_role is the server-only role; the key never reaches a browser. It already skips the row-level rules.)
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
select 'scheduling_v7' as part, 'ok' as result;
