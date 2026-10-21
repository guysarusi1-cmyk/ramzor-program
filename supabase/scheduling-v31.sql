-- scheduling v31 (2026-10-21): Mercury, stage 1 — the therapist and the children they are responsible for. Run once, after v30. Safe to run again.
--   * a new kind of staff "therapist" (a therapist only), and a flag for somebody who is also a therapist (an instructor, the coordinator...)
--   * every child has one responsible therapist (child_therapist); assigned by the admin and the coordinator (also from the management screen
--     of the children, with the manager's sign-in); every change is written in the audit log
--   * a therapist sees only the children they are responsible for; the admin sees everything (for now)
--   * how a therapist prefers to be told (stage 5): right away by e-mail / a daily summary (the default) / only in the portal
--   * "institution": every new Mercury table carries it already (one institution today), so more can join without rebuilding

-- ---- the therapist
alter table public.staff drop constraint if exists staff_kind_check;
alter table public.staff add constraint staff_kind_check check (kind in ('instructor', 'service', 'teacher', 'coordinator', 'admin', 'therapist'));
alter table public.staff_private add column if not exists is_therapist boolean not null default false;
alter table public.staff_settings add column if not exists therapist_notify text;
alter table public.staff_settings drop constraint if exists staff_settings_therapist_notify_check;
alter table public.staff_settings add constraint staff_settings_therapist_notify_check check (therapist_notify is null or therapist_notify in ('now', 'daily', 'portal'));

create or replace function public.is_therapist(p_staff uuid default null) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id
                 where s.id = coalesce(p_staff, public.my_staff_id()) and s.active and (s.kind = 'therapist' or p.is_therapist))
$$;
revoke all on function public.is_therapist(uuid) from public, anon;
grant execute on function public.is_therapist(uuid) to authenticated;

-- ---- the responsible therapist of every child (roster.id = the child)
create table if not exists public.child_therapist (
  child_id     text primary key,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  institution  smallint not null default 1,
  assigned_by  uuid references public.staff(id) on delete set null,
  assigned_at  timestamptz not null default now()
);
create index if not exists child_therapist_staff on public.child_therapist (staff_id);
alter table public.child_therapist enable row level security;
drop policy if exists "see child therapist" on public.child_therapist;
create policy "see child therapist" on public.child_therapist for select to authenticated
  using (public.is_coordinator() or staff_id = public.my_staff_id());
drop policy if exists "assign child therapist" on public.child_therapist;
create policy "assign child therapist" on public.child_therapist for all to authenticated
  using (public.is_coordinator()) with check (public.is_coordinator() and public.is_therapist(staff_id));
grant select, insert, update, delete on public.child_therapist to authenticated;
revoke all on public.child_therapist from anon;

-- may this person see the treatment information of this child? (the admin: everything for now; a therapist: their own children)
create or replace function public.can_see_child_therapy(p_child text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.child_therapist t where t.child_id = p_child and t.staff_id = public.my_staff_id() and public.is_therapist())
$$;
revoke all on function public.can_see_child_therapy(text) from public, anon;
grant execute on function public.can_see_child_therapy(text) to authenticated;

-- the children of the therapist who asks (empty for anybody else)
create or replace function public.my_therapy_children() returns setof text language sql stable security definer set search_path = public as $$
  select t.child_id from public.child_therapist t where t.staff_id = public.my_staff_id() and public.is_therapist()
$$;
revoke all on function public.my_therapy_children() from public, anon;
grant execute on function public.my_therapy_children() to authenticated;

-- every change of a responsible therapist is written in the audit log
create or replace function public.audit_child_therapist() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (by_staff, what, detail)
    values (public.my_staff_id(), 'child_therapist_' || lower(tg_op),
            jsonb_build_object('child', coalesce(new.child_id, old.child_id), 'from', case when tg_op <> 'INSERT' then old.staff_id end, 'to', case when tg_op <> 'DELETE' then new.staff_id end));
  return coalesce(new, old);
end $$;
drop trigger if exists child_therapist_audit on public.child_therapist;
create trigger child_therapist_audit after insert or update or delete on public.child_therapist for each row execute function public.audit_child_therapist();
create or replace function public.child_therapist_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin new.assigned_by := public.my_staff_id(); new.assigned_at := now(); return new; end $$;
drop trigger if exists child_therapist_stamp on public.child_therapist;
create trigger child_therapist_stamp before insert or update on public.child_therapist for each row execute function public.child_therapist_stamp();

-- the profile tells the portal whether the person is a therapist
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('female', p.female, 'no_nights', p.no_nights, 'only_long', p.only_long_weekend, 'manual_only', p.manual_only, 'latest_end', p.latest_end_hour,
                            'kind', s.kind, 'ahmash', p.ahmash_rank, 'admin', public.is_admin(), 'control', public.can_control(),
                            'min_mid', p.min_mid, 'min_nights', p.min_nights, 'min_weekend', p.min_weekend, 'lang', public.lang_of(p.staff_id), 'leader', p.is_leader,
                            'therapist', (s.kind = 'therapist' or p.is_therapist))
  from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = public.my_staff_id()
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

select 'scheduling_v31' as part, 'ok' as result;
