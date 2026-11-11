-- ================================================================
-- Scheduling, part 68 — run in the SQL Editor. Safe to run again. (Guy 2026-11-11)
-- Two ship pictures had keys that were first names. In the site's code they are now "ufo_blue" and "ufo_pink".
-- This renames the same two keys where a child's ship is saved, so every child keeps the same ship:
--   mini_lists, row "childSettings" (items: [{ id, ship, ... }])   and   child_journeys.ship
-- The old keys are matched by their md5, so they are not written here either (this repository is public).
-- Nothing else changes. The site also understands the old keys until this has run.
-- ================================================================

do $$
declare n_list int := 0; n_journey int := 0;
begin
  with x as (
    select coalesce(jsonb_agg(
      case when jsonb_typeof(e) = 'object' and md5(e->>'ship') = '0cb1eb413b8f7cee17701a37a1d74dc3' then jsonb_set(e, '{ship}', '"ufo_blue"')
           when jsonb_typeof(e) = 'object' and md5(e->>'ship') = '5102ecd3d47f6561de70979017b87a80' then jsonb_set(e, '{ship}', '"ufo_pink"')
           else e end order by ord), '[]'::jsonb) as items,
      count(*) filter (where jsonb_typeof(e) = 'object' and md5(e->>'ship') in ('0cb1eb413b8f7cee17701a37a1d74dc3', '5102ecd3d47f6561de70979017b87a80')) as n
    from public.mini_lists m, jsonb_array_elements(m.items) with ordinality as t(e, ord)
    where m.key = 'childSettings'
  )
  update public.mini_lists m set items = x.items from x where m.key = 'childSettings' and x.n > 0;
  get diagnostics n_list = row_count;

  if to_regclass('public.child_journeys') is not null then
    update public.child_journeys set ship = case md5(ship) when '0cb1eb413b8f7cee17701a37a1d74dc3' then 'ufo_blue' else 'ufo_pink' end
      where md5(ship) in ('0cb1eb413b8f7cee17701a37a1d74dc3', '5102ecd3d47f6561de70979017b87a80');
    get diagnostics n_journey = row_count;
  end if;
  raise notice 'ship keys renamed: childSettings row changed = %, journeys changed = %', n_list, n_journey;
end $$;

-- what is saved now, by ship (no names): the two old keys must not appear
select e->>'ship' as ship, count(*) as children
  from public.mini_lists m, jsonb_array_elements(m.items) e
 where m.key = 'childSettings' and e ? 'ship'
 group by 1 order by 1;
