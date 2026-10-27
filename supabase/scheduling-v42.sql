-- scheduling v42 (2026-10-27): the goal bank of the therapy portal (Mercury decisions 97-118). Run once, after v41, on the TEST project
-- (the therapy portal is hidden on the live site). Safe to run again. Changes no data. The bank's content itself is in scheduling-v42-bank.sql.
--   * a template of the library may belong to several themes, carry the treatment methods it is built on (seen by therapists only) and the ages
--     it has a wording for; a template Claude wrote is a draft ("טיוטה – לבדיקת מטפל/ת") until the admin approves it.
--   * a therapist who changes a Mercury template gets a copy in the center's library (source_id); the original stays as it was.
--   * favourites per therapist; how many plans use every template (the order of the bank; the numbers are shown to the admin only).
--   * the staff no longer sees the professional fields of a goal (the targets, the scale, the method).

-- ---- the library
alter table public.mercury_library drop constraint if exists mercury_library_kind_check;
alter table public.mercury_library add constraint mercury_library_kind_check
  check (kind in ('goal', 'skill', 'strength', 'avoid', 'calm', 'signs', 'routine', 'todo', 'plan', 'method'));
alter table public.mercury_library add column if not exists themes      text[] not null default '{}';
alter table public.mercury_library add column if not exists methods     text[] not null default '{}';
alter table public.mercury_library add column if not exists draft       boolean not null default false;
alter table public.mercury_library add column if not exists approved_by uuid references public.staff(id) on delete set null;
alter table public.mercury_library add column if not exists approved_at timestamptz;
alter table public.mercury_library add column if not exists source_id   uuid references public.mercury_library(id) on delete set null;

-- the admin approves a draft (decision 108): the mark goes, and who approved and when is kept
create or replace function public.library_approve(p_item uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.mercury_library set draft = false, approved_by = public.my_staff_id(), approved_at = now() where id = p_item;
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'library_approve', jsonb_build_object('item', p_item));
end $$;
revoke all on function public.library_approve(uuid) from public, anon;
grant execute on function public.library_approve(uuid) to authenticated;

-- ---- favourites (⭐), every therapist her own
create table if not exists public.library_favs (
  staff_id  uuid not null references public.staff(id) on delete cascade,
  item_id   uuid not null references public.mercury_library(id) on delete cascade,
  primary key (staff_id, item_id)
);
alter table public.library_favs enable row level security;
drop policy if exists "own favs" on public.library_favs;
create policy "own favs" on public.library_favs for all to authenticated using (staff_id = public.my_staff_id()) with check (staff_id = public.my_staff_id());
grant select, insert, delete on public.library_favs to authenticated;

-- ---- how many children's plans (the draft or the published one) use every template: the goals by library_id, the parts and the whole plans
-- by the plan's "bank_parts" list. The order of the bank for every therapist; the numbers themselves are shown to the admin only (decision 112).
create or replace function public.library_use_counts() returns table (item_id uuid, n int) language sql stable security definer set search_path = public as $$
  with used as (
    select distinct c.child_id, (g ->> 'library_id') as id
      from public.child_plans c, jsonb_array_elements(coalesce(coalesce(c.draft, c.published) -> 'goals', '[]'::jsonb)) g
     where g ->> 'library_id' is not null
    union
    select distinct c.child_id, p as id
      from public.child_plans c, jsonb_array_elements_text(coalesce(coalesce(c.draft, c.published) -> 'bank_parts', '[]'::jsonb)) p
  )
  select u.id::uuid, count(*)::int from used u
   where (public.is_therapist() or public.is_admin()) and u.id ~ '^[0-9a-f-]{36}$'
   group by u.id
$$;
revoke all on function public.library_use_counts() from public, anon;
grant execute on function public.library_use_counts() to authenticated;

-- ---- what the staff sees of a plan: no thinking, and now no professional fields of a goal either (decisions 100, 106)
create or replace function public.plan_guidance() returns table (child_id text, version int, published_at timestamptz, content jsonb) language sql stable security definer set search_path = public as $$
  select c.child_id, c.published_version, c.published_at,
         jsonb_build_object('summary', c.published -> 'summary', 'avoid', c.published -> 'avoid', 'calm', c.published -> 'calm', 'signs', c.published -> 'signs',
           'routine', c.published -> 'routine',
           'goals', coalesce((select jsonb_agg(g - 'seen' - 'needs' - 'why' - 'targets' - 'scale' - 'methods' - 'bank' - 'review_months')
                              from jsonb_array_elements(coalesce(c.published -> 'goals', '[]'::jsonb)) g), '[]'::jsonb))
  from public.child_plans c
  where c.published is not null and public.is_staff_person()
$$;
revoke all on function public.plan_guidance() from public, anon;
grant execute on function public.plan_guidance() to authenticated;

select 'scheduling_v42' as part, 'ok' as result;
