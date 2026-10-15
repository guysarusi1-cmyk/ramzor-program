-- ================================================================
-- Scheduling, part 27 — run in the SQL Editor after scheduling-v26.sql. Safe to run again.
--   * fixed preferences, chosen by the person in the gear: "does not do mornings / afternoons / nights" (one or more).
--     Those shifts start as "no" in her preferences; she can still change a single shift by pressing it. The engine treats a shift of
--     that kind that she did not mark as "no".
--   * the wall project: each brick keeps the strength it was given for (and the bricks already given get theirs from the log)
--   * the kids' screen: the live updates of the events are on (a brick or a star shows at once)
-- ================================================================
alter table public.staff_settings add column if not exists fixed_no text[] not null default '{}'
  check (fixed_no <@ array['m', 'e', 'n']::text[]);          -- (m = mornings, e = afternoons, n = nights)
-- the wall project: every brick keeps the strength it was given for (engraved on the brick in the kids' screen)
alter table public.child_state add column if not exists brick_why text[] not null default '{}';
-- the bricks already given: their strengths from the log of the kids' screen (the last ones, as many as the child has; '' when it was not named)
update public.child_state cs set brick_why = array_fill(''::text, array[greatest(0, cs.bricks - array_length(x.why, 1))]) || x.why[greatest(1, array_length(x.why, 1) - cs.bricks + 1):array_length(x.why, 1)]          -- (aligned to the last brick)
  from (select child_id, array_agg(coalesce(substring(message from ' · כוח: (.+)$'), '') order by created_at) as why
        from public.feedback_events where type = 'bricks' group by child_id) x
  where x.child_id = cs.child_id and cs.bricks > 0 and coalesce(array_length(cs.brick_why, 1), 0) = 0;
-- the kids' screen hears about a star, a step or a brick the moment it is given (the database's live updates): make sure they are on
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_events') then
    alter publication supabase_realtime add table public.feedback_events; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bonus_revocations') then
    alter publication supabase_realtime add table public.bonus_revocations; end if;
end $$;
select 'scheduling_v27' as part, 'ok' as result,
  (select string_agg(tablename, ', ') from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') as live_updates;
