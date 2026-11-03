-- ================================================================
-- Scheduling, part 52 — run in the SQL Editor after scheduling-v51.sql. Safe to run again. (Guy 2026-11-03)
-- "מנהלת מסגרת": a role of its own (not the admin, not the coordinator). The spec: Mercury-Work-Manager plans/MANAGER-ROLE-SPEC.md.
--   * the schedule: read only (the existing rules already keep the assignments to the coordinator)
--   * the general timetable: she may change it; every change of hers tells the coordinators (a notice in the portal)
--   * the therapeutic information and the children's diary: read only — added here as SELECT rules only
--   * a log of who opened a child's therapeutic detail; only the admin reads it
--   * conversations (one-to-one and groups) between the manager, the coordinator and the social workers; a child may be linked as the topic
--     (that does not open the child's information to anybody)
--   * messages to the staff: everybody or chosen people, the portal or also e-mail, and who saw / who confirmed "קראתי"
-- ================================================================

alter table public.staff drop constraint if exists staff_kind_check;
alter table public.staff add constraint staff_kind_check check (kind in ('instructor', 'service', 'teacher', 'coordinator', 'admin', 'therapist', 'manager'));

create or replace function public.is_director() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s join public.staff_private p on p.staff_id = s.id where p.auth_user_id = auth.uid() and s.active and s.kind = 'manager')
$$;
revoke all on function public.is_director() from public, anon;
grant execute on function public.is_director() to authenticated;

-- the general timetable: the manager may change it too; a change of hers is told to the coordinators
drop policy if exists "fixed: director" on public.timetable_fixed;
create policy "fixed: director" on public.timetable_fixed for all to authenticated using (public.is_director()) with check (public.is_director());
drop policy if exists "day: director" on public.timetable_day;
create policy "day: director" on public.timetable_day for all to authenticated using (public.is_director()) with check (public.is_director());
create or replace function public.director_timetable_notice() returns trigger language plpgsql security definer set search_path = public as $$
declare who text; what text;
begin
  if not public.is_director() then return null; end if;
  select display_name into who from public.staff where id = public.my_staff_id();
  what := case when tg_table_name = 'timetable_fixed' then 'הלו"ז הקבוע של יום ' || (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[coalesce(new.weekday, old.weekday) + 1]
               else 'הלו"ז של ' || to_char(coalesce(new.day, old.day), 'DD/MM') end;
  insert into public.notices (to_staff, text, kind)
    select s.id, coalesce(who, 'המנהלת') || ' עדכנה את ' || what || '.', 'info' from public.staff s where s.active and s.kind = 'coordinator';
  return null;
end $$;
drop trigger if exists timetable_fixed_director on public.timetable_fixed;
create trigger timetable_fixed_director after insert or update or delete on public.timetable_fixed for each row execute function public.director_timetable_notice();
drop trigger if exists timetable_day_director on public.timetable_day;
create trigger timetable_day_director after insert or update or delete on public.timetable_day for each row execute function public.director_timetable_notice();

-- the therapeutic information and the diary: the manager reads, never writes (SELECT rules only, on every table that exists)
do $$
declare t text;
begin
  foreach t in array array['child_plans', 'child_plan_versions', 'observations', 'goal_marks', 'goal_scale', 'child_stays', 'family_contacts', 'incidents', 'staff_letters',
                           'intervention_feedback', 'child_journeys', 'child_strengths', 'child_therapist', 'child_diary', 'child_diary_skip', 'plan_videos', 'video_views'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "director reads" on public.%I', t);
      execute format('create policy "director reads" on public.%I for select to authenticated using (public.is_director())', t);
    end if;
  end loop;
end $$;

-- who opened a child's therapeutic detail, and when (written by the page as it opens; read by the admin only)
create table if not exists public.therapy_access (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  by_staff uuid default public.my_staff_id(),
  child_id text not null,
  what     text not null check (length(what) <= 80)
);
alter table public.therapy_access enable row level security;
drop policy if exists "access write own" on public.therapy_access;
drop policy if exists "access admin reads" on public.therapy_access;
create policy "access write own" on public.therapy_access for insert to authenticated with check (by_staff = public.my_staff_id());
create policy "access admin reads" on public.therapy_access for select to authenticated using (public.is_admin());

-- conversations: the manager, the coordinator and the social workers (one-to-one or a group); a child may be the topic
create or replace function public.can_converse(p_staff uuid default null) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s left join public.staff_private p on p.staff_id = s.id
                 where s.id = coalesce(p_staff, public.my_staff_id()) and s.active and (s.kind in ('manager', 'coordinator', 'admin', 'therapist') or coalesce(p.is_therapist, false) or coalesce(p.is_admin, false)))
$$;
revoke all on function public.can_converse(uuid) from public, anon;
grant execute on function public.can_converse(uuid) to authenticated;
create table if not exists public.conv (
  id         uuid primary key default gen_random_uuid(),
  title      text check (title is null or length(title) <= 80),
  child_id   text,
  created_by uuid default public.my_staff_id(),
  created_at timestamptz not null default now()
);
create table if not exists public.conv_member (
  conv_id   uuid not null references public.conv(id) on delete cascade,
  staff_id  uuid not null references public.staff(id) on delete cascade,
  last_read timestamptz,
  primary key (conv_id, staff_id)
);
create table if not exists public.conv_msg (
  id         uuid primary key default gen_random_uuid(),
  conv_id    uuid not null references public.conv(id) on delete cascade,
  from_staff uuid default public.my_staff_id(),
  text       text not null check (length(text) between 1 and 2000),
  at         timestamptz not null default now()
);
create index if not exists conv_msg_conv on public.conv_msg (conv_id, at);
create or replace function public.in_conv(p_conv uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conv_member m where m.conv_id = p_conv and m.staff_id = public.my_staff_id())
$$;
revoke all on function public.in_conv(uuid) from public, anon;
grant execute on function public.in_conv(uuid) to authenticated;
alter table public.conv enable row level security;
alter table public.conv_member enable row level security;
alter table public.conv_msg enable row level security;
drop policy if exists "conv read" on public.conv;
drop policy if exists "conv members read" on public.conv_member;
drop policy if exists "conv my read mark" on public.conv_member;
drop policy if exists "conv msg read" on public.conv_msg;
drop policy if exists "conv msg write" on public.conv_msg;
create policy "conv read" on public.conv for select to authenticated using (public.in_conv(id));
create policy "conv members read" on public.conv_member for select to authenticated using (public.in_conv(conv_id));
create policy "conv my read mark" on public.conv_member for update to authenticated using (staff_id = public.my_staff_id()) with check (staff_id = public.my_staff_id());
create policy "conv msg read" on public.conv_msg for select to authenticated using (public.in_conv(conv_id));
create policy "conv msg write" on public.conv_msg for insert to authenticated with check (public.in_conv(conv_id) and from_staff = public.my_staff_id());
-- a new conversation: who opens it and every member must be among those who may converse
create or replace function public.open_conversation(p_members uuid[], p_title text, p_child text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; m uuid;
begin
  if not public.can_converse() then raise exception 'not allowed'; end if;
  foreach m in array coalesce(p_members, '{}') loop if not public.can_converse(m) then raise exception 'member not allowed'; end if; end loop;
  insert into public.conv (title, child_id) values (nullif(trim(coalesce(p_title, '')), ''), nullif(p_child, '')) returning id into cid;
  insert into public.conv_member (conv_id, staff_id) select cid, x from (select unnest(coalesce(p_members, '{}') || public.my_staff_id()) as x) u group by x;
  return cid;
end $$;
revoke all on function public.open_conversation(uuid[], text, text) from public, anon;
grant execute on function public.open_conversation(uuid[], text, text) to authenticated;

-- messages to the staff: everybody or chosen people; portal or also e-mail; seen / "קראתי"
alter table public.announcements add column if not exists audience uuid[];          -- (null = everybody)
alter table public.announcements add column if not exists need_ack boolean not null default false;
drop policy if exists "see announcements" on public.announcements;
create policy "see announcements" on public.announcements for select to authenticated
  using (public.is_coordinator() or public.is_director() or from_staff = public.my_staff_id() or (public.is_personal() and (audience is null or public.my_staff_id() = any(audience))));
create table if not exists public.announcement_read (
  ann_id   uuid not null references public.announcements(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  seen_at  timestamptz not null default now(),
  ack_at   timestamptz,
  primary key (ann_id, staff_id)
);
alter table public.announcement_read enable row level security;
drop policy if exists "read marks own" on public.announcement_read;
drop policy if exists "read marks own change" on public.announcement_read;
drop policy if exists "read marks seen by senders" on public.announcement_read;
create policy "read marks own" on public.announcement_read for insert to authenticated with check (staff_id = public.my_staff_id());
create policy "read marks own change" on public.announcement_read for update to authenticated using (staff_id = public.my_staff_id()) with check (staff_id = public.my_staff_id());
create policy "read marks seen by senders" on public.announcement_read for select to authenticated
  using (staff_id = public.my_staff_id() or public.is_coordinator() or public.is_director() or exists (select 1 from public.announcements a where a.id = ann_id and a.from_staff = public.my_staff_id()));
create or replace function public.post_staff_message(p_text text, p_via text, p_to uuid[], p_need_ack boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); r record; url text; aid uuid;
begin
  if not (public.is_coordinator() or public.is_director()) then raise exception 'not allowed'; end if;
  if p_via not in ('portal', 'email', 'both') or coalesce(trim(p_text), '') = '' then raise exception 'bad input'; end if;
  insert into public.announcements (from_staff, text, via, audience, need_ack) values (me, p_text, p_via, case when coalesce(array_length(p_to, 1), 0) = 0 then null else p_to end, coalesce(p_need_ack, false)) returning id into aid;
  if p_via in ('email', 'both') then
    select value #>> '{}' into url from public.sched_settings where key = 'portal_url';
    for r in select p.email, s.display_name from public.staff s join public.staff_private p on p.staff_id = s.id
             where s.active and p.email is not null and s.id is distinct from me and (coalesce(array_length(p_to, 1), 0) = 0 or s.id = any(p_to)) loop
      insert into public.email_outbox (to_email, subject, body, kind) values (r.email, 'הודעה בפורטל', 'שלום ' || r.display_name || E',\n' || p_text || coalesce(E'\n\nלפורטל: ' || url, ''), 'announcement');
    end loop;
  end if;
  return aid;
end $$;
revoke all on function public.post_staff_message(text, text, uuid[], boolean) from public, anon;
grant execute on function public.post_staff_message(text, text, uuid[], boolean) to authenticated;

select 'scheduling_v52' as part, 'ok' as result;
