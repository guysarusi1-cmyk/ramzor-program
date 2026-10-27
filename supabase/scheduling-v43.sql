-- scheduling v43 (2026-10-27): the therapy portal, deeper and fitted to emergency centers and residential homes (Mercury decisions 119-130).
-- Run once, after v42, on the TEST project (the therapy portal is hidden on the live site). Safe to run again. Changes no data.
--   * the marks of a goal: a yes / no at the end of a shift (every staff member, one screen), an observation marked to a goal (success / difficulty),
--     the therapist's monthly 1-5 scale; with the journey steps and the bricks they make the progress graph (therapists and the admin only).
--   * the incident log: every staff member, 30 seconds by taps; intensity 3 or self harm -> the therapist is told at once; patterns for her.
--   * the stay of a child: the intake (what is known, what to avoid and what calms until there is a plan, a task list), the first plan's due date,
--     the exit (date, preparation, handover, the book), the archive (only the admin sees it; restore or delete).
--   * the family contact log: every staff member records; the therapist, the coordinator and the admin read it; the staff sees the next meeting only.
--   * letters for the book: every staff member writes a sentence, the therapist approves.
-- Who may read what: can_see_child_therapy (the responsible therapist, her substitute, the admin) or is_coordinator where said.

-- ---- the end-of-shift marks
create table if not exists public.goal_marks (
  child_id   text not null,
  goal_id    text not null,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  day        date not null,
  value      text not null check (value in ('yes', 'no', 'na')),
  at         timestamptz not null default now(),
  primary key (child_id, goal_id, staff_id, day)
);
alter table public.goal_marks enable row level security;
drop policy if exists "own marks" on public.goal_marks;
create policy "own marks" on public.goal_marks for all to authenticated using (staff_id = public.my_staff_id()) with check (staff_id = public.my_staff_id() and public.is_staff_person());
drop policy if exists "see marks" on public.goal_marks;
create policy "see marks" on public.goal_marks for select to authenticated using (public.can_see_child_therapy(child_id));
grant select, insert, update, delete on public.goal_marks to authenticated;

-- ---- an observation marked to a goal: a success or a difficulty
alter table public.observations add column if not exists valence text check (valence in ('success', 'difficulty'));

-- ---- the therapist's monthly scale (1-5) per goal
create table if not exists public.goal_scale (
  child_id   text not null,
  goal_id    text not null,
  rated_on   date not null default (now() at time zone 'Asia/Jerusalem')::date,
  value      int  not null check (value between 1 and 5),
  by_staff   uuid default public.my_staff_id() references public.staff(id) on delete set null,
  primary key (child_id, goal_id, rated_on)
);
alter table public.goal_scale enable row level security;
drop policy if exists "therapist scale" on public.goal_scale;
create policy "therapist scale" on public.goal_scale for all to authenticated using (public.can_see_child_therapy(child_id)) with check (public.can_see_child_therapy(child_id));
grant select, insert, update, delete on public.goal_scale to authenticated;

-- ---- the incident log
create table if not exists public.incidents (
  id         uuid primary key default gen_random_uuid(),
  child_id   text not null,
  author     uuid default public.my_staff_id() references public.staff(id) on delete set null,
  at         timestamptz not null default now(),
  shift      text,
  kind       text not null check (kind in ('aggression', 'self_harm', 'runaway', 'flooding', 'damage', 'other')),
  intensity  int  not null check (intensity between 1 and 3),
  before     text[] not null default '{}',
  helped     text[] not null default '{}',
  goal_id    text,
  note       text,
  audio_path text,
  seen_at    timestamptz
);
alter table public.incidents enable row level security;
drop policy if exists "write incidents" on public.incidents;
create policy "write incidents" on public.incidents for insert to authenticated with check (public.is_staff_person() and author = public.my_staff_id());
drop policy if exists "read incidents" on public.incidents;
create policy "read incidents" on public.incidents for select to authenticated using (author = public.my_staff_id() or public.can_see_child_therapy(child_id) or public.is_coordinator());
drop policy if exists "therapist marks incidents" on public.incidents;
create policy "therapist marks incidents" on public.incidents for update to authenticated using (public.can_see_child_therapy(child_id)) with check (public.can_see_child_therapy(child_id));
grant select, insert, update on public.incidents to authenticated;
-- intensity 3, or any self harm: the therapist (and her substitute) is told at once, by e-mail too (decision 123)
create or replace function public.incident_tell() returns trigger language plpgsql security definer set search_path = public as $$
declare nm text; w text;
begin
  if new.intensity < 3 and new.kind <> 'self_harm' then return new; end if;
  nm := coalesce(public.child_name(new.child_id), '');
  w := case new.kind when 'aggression' then 'תוקפנות' when 'self_harm' then 'פגיעה עצמית' when 'runaway' then 'בריחה' when 'flooding' then 'הצפה' when 'damage' then 'שבירת רכוש' else 'אירוע' end;
  perform public.tell_staff(ct.staff_id, 'אירוע חמור: ' || nm, 'דווח אירוע (' || w || ', עוצמה ' || new.intensity || ') של ' || nm || '. הפרטים בפורטל הטיפול.', 'therapy')
    from public.child_therapist ct where ct.child_id = new.child_id;
  perform public.tell_staff(s.substitute, 'אירוע חמור: ' || nm, 'דווח אירוע (' || w || ', עוצמה ' || new.intensity || ') של ' || nm || '. הפרטים בפורטל הטיפול.', 'therapy')
    from public.child_therapist ct join public.therapist_subs s on s.therapist = ct.staff_id
   where ct.child_id = new.child_id and s.until >= (now() at time zone 'Asia/Jerusalem')::date;
  return new;
end $$;
drop trigger if exists incident_tell on public.incidents;
create trigger incident_tell after insert on public.incidents for each row execute function public.incident_tell();

-- ---- the family contact log
create table if not exists public.family_contacts (
  id          uuid primary key default gen_random_uuid(),
  child_id    text not null,
  author      uuid default public.my_staff_id() references public.staff(id) on delete set null,
  at          timestamptz not null default now(),
  kind        text not null check (kind in ('visit', 'call', 'cancelled', 'other')),
  with_whom   text,
  came_back   text check (came_back in ('calm', 'mixed', 'upset')),
  note        text,
  next_at     date,
  next_prep   text
);
alter table public.family_contacts enable row level security;
drop policy if exists "write family" on public.family_contacts;
create policy "write family" on public.family_contacts for insert to authenticated with check (public.is_staff_person() and author = public.my_staff_id());
drop policy if exists "read family" on public.family_contacts;
create policy "read family" on public.family_contacts for select to authenticated using (public.can_see_child_therapy(child_id) or public.is_coordinator());
grant select, insert on public.family_contacts to authenticated;
-- the staff: only when the next meeting is and what to prepare
create or replace function public.family_next() returns table (child_id text, next_at date, next_prep text) language sql stable security definer set search_path = public as $$
  select distinct on (f.child_id) f.child_id, f.next_at, f.next_prep from public.family_contacts f
   where public.is_staff_person() and f.next_at is not null and f.next_at >= (now() at time zone 'Asia/Jerusalem')::date
   order by f.child_id, f.at desc
$$;
revoke all on function public.family_next() from public, anon;
grant execute on function public.family_next() to authenticated;

-- ---- the stay of a child: intake, exit, archive
create table if not exists public.child_stays (
  child_id    text primary key,
  name        text,
  admitted    date,
  intake      jsonb not null default '{}'::jsonb,          -- { known, avoid, calm, tasks:[{ t, done }] }
  exit_date   date,
  exit        jsonb not null default '{}'::jsonb,          -- { prep:[{ t, done }], handover, letter, moments }
  archived    boolean not null default false,
  archived_at timestamptz,
  updated_at  timestamptz not null default now()
);
alter table public.child_stays enable row level security;
drop policy if exists "therapist stays" on public.child_stays;
create policy "therapist stays" on public.child_stays for all to authenticated using (public.can_see_child_therapy(child_id) or public.is_coordinator()) with check (public.can_see_child_therapy(child_id) or public.is_coordinator());
grant select, insert, update on public.child_stays to authenticated;
-- the staff: what the intake says (until there is a plan) and the open tasks; whether the child is leaving (for the letter); who is archived
create or replace function public.stay_guidance() returns table (child_id text, admitted date, avoid text, calm text, tasks jsonb, exit_date date, archived boolean) language sql stable security definer set search_path = public as $$
  select s.child_id, s.admitted, s.intake ->> 'avoid', s.intake ->> 'calm', coalesce(s.intake -> 'tasks', '[]'::jsonb), s.exit_date, s.archived
    from public.child_stays s where public.is_staff_person()
$$;
revoke all on function public.stay_guidance() from public, anon;
grant execute on function public.stay_guidance() to authenticated;
-- a staff member ticks an intake task
create or replace function public.intake_task_done(p_child text, p_index int, p_done boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_person() then raise exception 'not allowed'; end if;
  update public.child_stays set intake = jsonb_set(intake, array['tasks', p_index::text, 'done'], to_jsonb(p_done)), updated_at = now()
   where child_id = p_child and jsonb_array_length(coalesce(intake -> 'tasks', '[]'::jsonb)) > p_index;
end $$;
revoke all on function public.intake_task_done(text, int, boolean) from public, anon;
grant execute on function public.intake_task_done(text, int, boolean) to authenticated;
-- the exit date is set: the staff is invited to write a sentence for the child's book
create or replace function public.exit_invite(p_child text) returns void language plpgsql security definer set search_path = public as $$
declare nm text; r record;
begin
  if not public.can_see_child_therapy(p_child) then raise exception 'not allowed'; end if;
  nm := coalesce(public.child_name(p_child), '');
  for r in select s.id from public.staff s where s.active and s.kind in ('instructor', 'service', 'teacher', 'coordinator') loop
    insert into public.notices (to_staff, text, kind) values (r.id, nm || ' עומד/ת לעזוב את המרכז. אפשר לכתוב משפט טוב לספר של ' || nm || ' בפורטל הטיפול.', 'plan');
  end loop;
end $$;
revoke all on function public.exit_invite(text) from public, anon;
grant execute on function public.exit_invite(text) to authenticated;

-- ---- letters for the book
create table if not exists public.staff_letters (
  id         uuid primary key default gen_random_uuid(),
  child_id   text not null,
  author     uuid default public.my_staff_id() references public.staff(id) on delete set null,
  text       text not null check (length(text) between 1 and 400),
  approved   boolean not null default false,
  at         timestamptz not null default now()
);
alter table public.staff_letters enable row level security;
drop policy if exists "write letters" on public.staff_letters;
create policy "write letters" on public.staff_letters for insert to authenticated with check (public.is_staff_person() and author = public.my_staff_id());
drop policy if exists "read letters" on public.staff_letters;
create policy "read letters" on public.staff_letters for select to authenticated using (author = public.my_staff_id() or public.can_see_child_therapy(child_id));
drop policy if exists "approve letters" on public.staff_letters;
create policy "approve letters" on public.staff_letters for update to authenticated using (public.can_see_child_therapy(child_id)) with check (public.can_see_child_therapy(child_id));
grant select, insert, update on public.staff_letters to authenticated;

-- ---- the staff's encouraging sentence: how many days this week a focus goal was practised (a journey step or a "yes"), never the numbers of the graph
create or replace function public.goal_week() returns table (child_id text, goal_id text, days int) language sql stable security definer set search_path = public as $$
  select m.child_id, m.goal_id, count(distinct m.day)::int from public.goal_marks m
   where public.is_staff_person() and m.value = 'yes' and m.day > (now() at time zone 'Asia/Jerusalem')::date - 7
   group by m.child_id, m.goal_id
$$;
revoke all on function public.goal_week() from public, anon;
grant execute on function public.goal_week() to authenticated;

-- ---- the archive (decision 33, 129): only the admin; delete removes every therapy record of the child (the list of children is managed elsewhere)
create or replace function public.therapy_purge(p_child text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from public.goal_marks where child_id = p_child;
  delete from public.goal_scale where child_id = p_child;
  delete from public.incidents where child_id = p_child;
  delete from public.family_contacts where child_id = p_child;
  delete from public.staff_letters where child_id = p_child;
  delete from public.observations where child_id = p_child;
  delete from public.plan_videos where child_id = p_child;
  delete from public.child_plan_versions where child_id = p_child;
  delete from public.child_plans where child_id = p_child;
  delete from public.child_stays where child_id = p_child;
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'therapy_purge', jsonb_build_object('child', p_child));
end $$;
revoke all on function public.therapy_purge(text) from public, anon;
grant execute on function public.therapy_purge(text) to authenticated;

select 'scheduling_v43' as part, 'ok' as result;
