-- scheduling v63 (2026-11-08): the kids' screen round (Guy 8 Nov). Run once on each project, TEST first, AFTER scheduling-v62.sql. Safe to run again.
--   * what the kids' screen shows: the admin hides or shows again every screen and some parts of them (one list for all the screens in the room).
--     Kept in sched_settings under 'tv_display' as { "off": ["birthdays", ...] }. Written only by the admin (tv_display_save); the TV reads tv_display().
--   * the children's birthdays: a real list (until now the screen made the dates up). A full date with the year; the age is counted.
--     Kept by the admin and the secretary. The kids' TV reads only today's birthdays (tv_birthdays_today), never a date.
--     A child who leaves the list leaves the birthdays too (on delete cascade).

do $$ begin
  if to_regprocedure('public.is_secretary()') is null then raise exception 'scheduling-v62.sql first'; end if;
end $$;

-- ---------- what the kids' screen shows ----------
create or replace function public.tv_display() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.sched_settings where key = 'tv_display'), '{"off":[]}'::jsonb)
$$;
revoke all on function public.tv_display() from public;
grant execute on function public.tv_display() to anon, authenticated;

create or replace function public.tv_display_save(p_off text[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if coalesce(array_length(p_off, 1), 0) > 60 then raise exception 'too many'; end if;
  v := jsonb_build_object('off', to_jsonb(coalesce((select array_agg(distinct x order by x) from unnest(p_off) x where x ~ '^[a-z_]{1,30}$'), '{}'::text[])));
  insert into public.sched_settings (key, value) values ('tv_display', v)
    on conflict (key) do update set value = excluded.value;
  return v;
end $$;
revoke all on function public.tv_display_save(text[]) from public, anon;
grant execute on function public.tv_display_save(text[]) to authenticated;

-- ---------- the children's birthdays ----------
create table if not exists public.kid_birthday (
  child_id   text primary key references public.roster(id) on delete cascade,
  born       date not null check (born > date '1990-01-01'),
  updated_at timestamptz not null default now(),
  updated_by uuid default public.my_staff_id()
);
alter table public.kid_birthday enable row level security;
drop policy if exists "birthdays: admin and secretary" on public.kid_birthday;
create policy "birthdays: admin and secretary" on public.kid_birthday for all to authenticated
  using (public.is_admin() or public.is_secretary()) with check (public.is_admin() or public.is_secretary());
revoke all on public.kid_birthday from anon;
grant select, insert, update, delete on public.kid_birthday to authenticated;

-- today's birthdays for the kids' TV: who and how old, no date. Israel's day. Born on 29 Feb: on 28 Feb in a year without it.
create or replace function public.tv_birthdays_today() returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select (now() at time zone 'Asia/Jerusalem')::date v)
  select coalesce(jsonb_agg(jsonb_build_object('child_id', b.child_id, 'age', extract(year from age(d.v, b.born))::int) order by b.child_id), '[]')
  from d, public.kid_birthday b
  where b.born <= d.v
    and (to_char(b.born, 'MM-DD') = to_char(d.v, 'MM-DD')
         or (to_char(b.born, 'MM-DD') = '02-29' and to_char(d.v, 'MM-DD') = '02-28'
             and extract(day from (date_trunc('year', d.v) + interval '1 month 28 days')::date) <> 29))
$$;
revoke all on function public.tv_birthdays_today() from public;
grant execute on function public.tv_birthdays_today() to anon, authenticated;

select 'scheduling_v63' as part, 'ok' as result,
  (select count(*) from public.kid_birthday) as birthdays,
  public.tv_display() as tv_display;
