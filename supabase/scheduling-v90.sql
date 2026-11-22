-- ================================================================
-- Scheduling, part 90 — run in the SQL Editor of the product's database, after scheduling-v89.sql. Safe to run again.
-- Guy's walk through the coordinator's screens on "בדיקות בית מאזן" (22–23.11.2026):
--   1. fixed shifts: room for TWO fixed people in each shift of the week (before: one);
--   2. the builders' queue is a list of dates: the first in the queue builds the next two weeks that open, and then goes to the end
--      (before: the one after the last builder). So the screen can say for each one which two weeks she builds;
--   3. a swap taken by the builder of those two weeks herself is approved at once (she would only approve herself).
--      When she asked and somebody else took it, she still approves, as before.
-- Run on the TEST project first; on the pilot's database only on Guy's word.
-- ================================================================
do $$ begin
  if not exists (select 1 from public.schema_migrations where version = 'scheduling-v89') then raise exception 'scheduling-v89.sql first'; end if;
end $$;

-- 1. two fixed people in a shift ---------------------------------------------------------------------------------------------
do $v90fix$ begin
  execute 'alter table public.tw_fixed drop constraint if exists tw_fixed_pkey';
  execute 'alter table public.tw_fixed add constraint tw_fixed_pkey primary key (org_id, dow, shift, person)';
end $v90fix$;
create or replace function public.tw_fixed_two() returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.tw_fixed f where f.org_id = new.org_id and f.dow = new.dow and f.shift = new.shift and f.person <> new.person) >= 2 then
    raise exception 'two fixed people at most in a shift';
  end if;
  return new;
end $$;
drop trigger if exists tw_fixed_two on public.tw_fixed;
create trigger tw_fixed_two before insert or update on public.tw_fixed for each row execute function public.tw_fixed_two();

-- 2. the queue: the first builds the next two weeks, then goes to the end -----------------------------------------------------
create or replace function public.tw_auto_open_org(p_org uuid) returns date language plpgsql security definer set search_path = public as $$
declare q jsonb; od int; cd int; last_start date; nxt date; ids uuid[]; b uuid; dl timestamptz; made date;
begin
  if p_org is null then return null; end if;
  select value into q from public.tw_settings where org_id = p_org and key = 'queue';
  od := coalesce((select (value #>> '{}')::int from public.tw_settings where org_id = p_org and key = 'open_days'), 10);
  cd := coalesce((select (value #>> '{}')::int from public.tw_settings where org_id = p_org and key = 'close_days'), 5);
  select start into last_start from public.tw_period where org_id = p_org order by start desc limit 1;
  if last_start is null then return null; end if;          -- (the first two weeks are opened by hand; from them on the rest follow)
  nxt := last_start + 14;
  while nxt + 13 < current_date loop nxt := nxt + 14; end loop;
  if nxt - od > current_date then return null; end if;
  if q is not null and jsonb_typeof(q) = 'array' and jsonb_array_length(q) > 0 then
    select array_agg(p.id order by t.ord) into ids from jsonb_array_elements_text(q) with ordinality t(x, ord)
      join public.tw_people p on p.id::text = t.x and p.active and p.org_id = p_org;
    if ids is not null then b := ids[1]; end if;
  end if;          -- (no queue: no builder; the system admins build)
  dl := greatest(((nxt - cd + 1)::timestamp + time '05:00') at time zone 'Asia/Jerusalem', ((current_date + 2)::timestamp + time '05:00') at time zone 'Asia/Jerusalem');
  insert into public.tw_period(org_id, start, builder, deadline) values (p_org, nxt, b, dl) on conflict (org_id, start) do nothing returning start into made;
  if made is not null and b is not null then          -- (she built her turn: to the end of the queue)
    update public.tw_settings set value = (select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) from jsonb_array_elements(q) with ordinality t(x, ord) where x #>> '{}' <> b::text) || to_jsonb(b::text)
     where org_id = p_org and key = 'queue';
  end if;
  return nxt;
end $$;
revoke all on function public.tw_auto_open_org(uuid) from public, anon, authenticated;

-- 3. taking a swap: the builder of those two weeks who takes it is approved at once -----------------------------------------
create or replace function public.tw_swap_take(p_swap uuid) returns void language plpgsql security definer set search_path = public as $$
declare s public.tw_swap; me uuid := public.tw_me(); o uuid := public.current_org(); bld uuid; mine boolean;
begin
  if me is null then raise exception 'not on the list'; end if;
  select * into s from public.tw_swap where id = p_swap and org_id = o for update;
  if s.id is null or s.status <> 'open' then raise exception 'the request is not open'; end if;
  if s.from_person = me then raise exception 'your own request'; end if;
  if exists (select 1 from public.tw_assignment a where a.org_id = o and a.period = s.period and a.day = s.day and a.person = me) then raise exception 'you already work that day'; end if;
  select builder into bld from public.tw_period where org_id = o and start = s.period;
  mine := (bld is not null and bld = me) or (bld is null and public.tw_boss());          -- (Guy 23.11: only when she builds those two weeks)
  if mine and exists (select 1 from public.tw_assignment a where a.id = s.assignment and a.person = s.from_person) then
    update public.tw_assignment set person = me, by_hand = true, fixed = false where id = s.assignment;
    update public.tw_swap set status = 'approved', taker = me, taken_at = now(), decided_at = now(), decided_by = public.my_staff_id() where id = p_swap;
  else
    update public.tw_swap set status = 'taken', taker = me, taken_at = now() where id = p_swap;
  end if;
end $$;
revoke all on function public.tw_swap_take(uuid) from public, anon;
grant execute on function public.tw_swap_take(uuid) to authenticated;

insert into public.schema_migrations(version) values ('scheduling-v90') on conflict (version) do nothing;
select 'scheduling_v90' as part, 'ok' as result,
       (select count(*) from public.tw_fixed) as fixed_rows,
       (select value from public.tw_settings where key = 'queue' limit 1) as queue;
