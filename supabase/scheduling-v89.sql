-- ================================================================
-- Scheduling, part 89 — run in the SQL Editor of the product's database, after scheduling-v87.sql. Safe to run again. (Guy 20.11.2026)
-- "שעת סגירת ההגשה: למחרת בבוקר 5 בבוקר": the hand-in of two weeks that open by themselves closes close_days before they start, in the
-- night after that day, at 05:00 (Israel). For the pilot: the hand-in of 26.11 closes on 27.11 at 05:00. (Before: at 23:59 of that day.)
-- Only the deadline of two weeks opened from now on changes; two weeks that are already open keep theirs.
-- ================================================================
do $$ begin
  if not exists (select 1 from public.schema_migrations where version = 'scheduling-v87') then raise exception 'scheduling-v87.sql first'; end if;
end $$;

create or replace function public.tw_auto_open_org(p_org uuid) returns date language plpgsql security definer set search_path = public as $$
declare q jsonb; od int; cd int; last_start date; last_builder uuid; nxt date; ids uuid[]; i int; b uuid; dl timestamptz;
begin
  if p_org is null then return null; end if;
  select value into q from public.tw_settings where org_id = p_org and key = 'queue';
  od := coalesce((select (value #>> '{}')::int from public.tw_settings where org_id = p_org and key = 'open_days'), 10);
  cd := coalesce((select (value #>> '{}')::int from public.tw_settings where org_id = p_org and key = 'close_days'), 5);
  select start, builder into last_start, last_builder from public.tw_period where org_id = p_org order by start desc limit 1;
  if last_start is null then return null; end if;          -- (the first two weeks are opened by hand; from them on the rest follow)
  nxt := last_start + 14;
  while nxt + 13 < current_date loop nxt := nxt + 14; end loop;
  if nxt - od > current_date then return null; end if;
  if q is not null and jsonb_typeof(q) = 'array' and jsonb_array_length(q) > 0 then
    select array_agg(p.id order by t.ord) into ids from jsonb_array_elements_text(q) with ordinality t(x, ord)
      join public.tw_people p on p.id::text = t.x and p.active and p.org_id = p_org;
    if ids is not null then i := array_position(ids, last_builder); b := ids[case when i is null then 1 else (i % array_length(ids, 1)) + 1 end]; end if;
  end if;          -- (no queue: no builder; the system admins build)
  dl := greatest(((nxt - cd + 1)::timestamp + time '05:00') at time zone 'Asia/Jerusalem', ((current_date + 2)::timestamp + time '05:00') at time zone 'Asia/Jerusalem');
  insert into public.tw_period(org_id, start, builder, deadline) values (p_org, nxt, b, dl) on conflict (org_id, start) do nothing;
  return nxt;
end $$;
revoke all on function public.tw_auto_open_org(uuid) from public, anon, authenticated;

insert into public.schema_migrations(version) values ('scheduling-v89') on conflict (version) do nothing;
select 'scheduling_v89' as part, 'ok' as result;
