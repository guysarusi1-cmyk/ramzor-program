-- scheduling v39 (2026-10-26): "תבדקו איתי" and the names on the kids' TV (Guy). Run once, after v38, on each project. Safe to run again. Changes no data.
--   * the two questions at the end of the preferences (staying until 16:00, going on from Saturday night until 11:00) get a third answer,
--     "תבדקו איתי": for the engine it is "no" (extend_morning / pull_to_sunday stay false), and the coordinator sees it and asks.
--   * the kids' TV writes everybody as the first name and the first letter of the family name ("שני מ'"), not the first name alone.
alter table public.prefs_consent add column if not exists extend_ask boolean not null default false;
alter table public.prefs_consent add column if not exists pull_ask boolean not null default false;

create or replace function public.tv_label(sid uuid) returns text language sql stable security definer set search_path = public as $$
  with me as (select display_name, split_part(trim(display_name), ' ', 1) f, left(split_part(trim(display_name), ' ', 2), 1) l from public.staff where id = sid)
  select case when me.l <> '' then me.f || ' ' || me.l || '''' else me.f end from me
$$;
revoke all on function public.tv_label(uuid) from public, anon;

select 'scheduling_v39' as part, 'ok' as result;
