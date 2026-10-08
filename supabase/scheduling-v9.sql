-- ================================================================
-- Scheduling, part 9 — run in the SQL Editor after scheduling-v8.sql. Safe to run again.
--   * a person who is placed on a shift after the schedule was published no longer gets the "you were placed on a shift... you can ask for a swap" notice and e-mail
--     (the people on the same shift still hear about the change; removals, moves and time changes are told as before)
-- ================================================================
create or replace function public.notify_assignment_change() returns trigger language plpgsql security definer set search_path = public as $$
declare m date := case when tg_op = 'DELETE' then old.month else new.month end; pub boolean; o public.assignment; n public.assignment; oname text; nname text; cw record; what text;
begin
  select (status = 'published') into pub from public.schedule where month = m;
  if not coalesce(pub, false) then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if tg_op <> 'INSERT' then o := old; end if;
  if tg_op <> 'DELETE' then n := new; end if;
  if o.id is not null then select display_name into oname from public.staff where id = o.staff_id; end if;
  if n.id is not null then select display_name into nname from public.staff where id = n.staff_id; end if;
  if tg_op = 'INSERT' then
    what := nname || ' הצטרף/ה למשמרת';
  elsif tg_op = 'DELETE' then
    perform public.tell_key(o.staff_id, 'shift_removed', public.shift_text(o.day, o.shift, o.from_time, o.to_time));
    what := oname || ' לא במשמרת הזאת יותר';
  elsif o.staff_id is distinct from n.staff_id then
    perform public.tell_key(o.staff_id, 'shift_moved', public.shift_text(o.day, o.shift, o.from_time, o.to_time));
    perform public.tell_key(n.staff_id, 'shift_taken', public.shift_text(n.day, n.shift, n.from_time, n.to_time));
    what := oname || ' הוחלף/ה ב' || nname;
  elsif (o.day, o.shift, o.from_time, o.to_time) is distinct from (n.day, n.shift, n.from_time, n.to_time) then
    perform public.tell_key(n.staff_id, 'shift_changed', public.shift_text(o.day, o.shift, o.from_time, o.to_time), public.shift_text(n.day, n.shift, n.from_time, n.to_time));
    what := nname || ': שעות המשמרת עודכנו';
  end if;
  if what is not null then
    for cw in select distinct x.staff_id from public.assignment x
              where x.month = m and x.day = coalesce(n.day, o.day) and x.shift = coalesce(n.shift, o.shift)
                and x.staff_id is distinct from o.staff_id and x.staff_id is distinct from n.staff_id loop
      perform public.tell_key(cw.staff_id, 'team_change', public.shift_text(coalesce(n.day, o.day), coalesce(n.shift, o.shift), coalesce(n.from_time, o.from_time), coalesce(n.to_time, o.to_time)), what);
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

select 'scheduling_v9' as part, 'ok' as result;
