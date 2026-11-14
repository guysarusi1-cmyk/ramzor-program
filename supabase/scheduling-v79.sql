-- ================================================================
-- Scheduling, part 79 — run in the SQL Editor after scheduling-v78.sql. Safe to run again. (Guy 2026-11-14: the product's admin screens)
-- The two-week schedule: the builders' queue, and two weeks that open by themselves.
--   * the admin sets once the order of the builders and how many days ahead the hand-in opens and closes (tw_settings: queue, open_days, close_days);
--   * whenever somebody of the list opens the site, tw_auto_open() checks whether the next two weeks are due, and opens them with the
--     next builder of the queue (nothing happens before the queue is set). The admin can still open two weeks or change a builder by hand.
-- ================================================================

do $$ begin
  if to_regclass('public.tw_swap') is null then raise exception 'scheduling-v78.sql first'; end if;
end $$;

insert into public.tw_settings(key, value) values ('open_days', '10'::jsonb), ('close_days', '5'::jsonb) on conflict (key) do nothing;

create or replace function public.tw_auto_open() returns date language plpgsql security definer set search_path = public as $$
declare q jsonb; od int; cd int; last_start date; last_builder uuid; nxt date; ids uuid[]; i int; b uuid; dl timestamptz;
begin
  if not public.tw_member() then return null; end if;
  select value into q from public.tw_settings where key = 'queue';
  if q is null or jsonb_typeof(q) <> 'array' or jsonb_array_length(q) = 0 then return null; end if;
  od := coalesce((select (value #>> '{}')::int from public.tw_settings where key = 'open_days'), 10);
  cd := coalesce((select (value #>> '{}')::int from public.tw_settings where key = 'close_days'), 5);
  select start, builder into last_start, last_builder from public.tw_period order by start desc limit 1;
  if last_start is null then nxt := current_date + ((7 - extract(dow from current_date)::int) % 7);
  else nxt := last_start + 14; end if;
  while nxt + 13 < current_date loop nxt := nxt + 14; end loop;          -- (two weeks that already passed are not opened)
  if nxt - od > current_date then return null; end if;                   -- (not due yet)
  select array_agg(p.id order by t.ord) into ids
    from jsonb_array_elements_text(q) with ordinality t(x, ord) join public.tw_people p on p.id::text = t.x and p.active;
  if ids is not null then
    i := array_position(ids, last_builder);
    b := ids[case when i is null then 1 else (i % array_length(ids, 1)) + 1 end];
  end if;
  dl := greatest(((nxt - cd)::timestamp + time '23:59') at time zone 'Asia/Jerusalem', ((current_date + 1)::timestamp + time '23:59') at time zone 'Asia/Jerusalem');
  insert into public.tw_period(start, builder, deadline) values (nxt, b, dl) on conflict (start) do nothing;
  return nxt;
end $$;
revoke all on function public.tw_auto_open() from public, anon;
grant execute on function public.tw_auto_open() to authenticated;

select 'scheduling_v79' as part, 'ok' as result,
       (select count(*) from public.tw_settings where key in ('open_days', 'close_days')) as settings;
