-- scheduling v44 (2026-10-28): the therapy portal rebuilt from Guy's walkthrough (dist/mercury/walkthrough-2026-10-27.md). Run once, after v43,
-- on the TEST project (the therapy portal is hidden on the live site). Safe to run again. Changes no data.
--   * a therapist (or a service girl / teacher) with the personal sign-in can read the list of children (before: only instructors, coordinators, admins).
--   * a goal of the plan now has targets (each with a plain wording for the staff) and up to 3 interventions; the staff sees only the goals in
--     focus, the plain targets, the interventions with their approach, and the chosen sentences; never the thinking, the scale or the review.
--   * an observation is marked to a target; the staff marks 👍 / 👎 on an intervention (with an optional detail).
--   * a new video on request ("סרטון חדש"), not only on publishing; no e-mail to the staff in the therapy portal (portal notices only).
--   * "the goal was achieved": a notice to the staff.

-- ---- the list of children for every active staff person (the therapy portal needs the names; the Ramzor's writing rights are unchanged)
drop policy if exists "staff persons read" on public.roster;
create policy "staff persons read" on public.roster for select to authenticated using (public.is_staff_person());

-- ---- an observation marked to a target of a goal
alter table public.observations add column if not exists target_id text;

-- ---- 👍 / 👎 of the staff on an intervention (decision Q27): it feeds the spiral and shows the therapist what works on the floor
create table if not exists public.intervention_feedback (
  id              uuid primary key default gen_random_uuid(),
  child_id        text not null,
  goal_id         text not null,
  intervention_id text not null,
  staff_id        uuid not null default public.my_staff_id() references public.staff(id) on delete cascade,
  value           text not null check (value in ('up', 'down')),
  note            text,
  at              timestamptz not null default now()
);
alter table public.intervention_feedback enable row level security;
drop policy if exists "write feedback" on public.intervention_feedback;
create policy "write feedback" on public.intervention_feedback for insert to authenticated with check (public.is_staff_person() and staff_id = public.my_staff_id());
drop policy if exists "read feedback" on public.intervention_feedback;
create policy "read feedback" on public.intervention_feedback for select to authenticated using (staff_id = public.my_staff_id() or public.can_see_child_therapy(child_id));
grant select, insert on public.intervention_feedback to authenticated;

-- ---- what the staff sees: only the goals in focus; the targets in plain words; no thinking, scale, method list, review or bank details
create or replace function public.plan_guidance() returns table (child_id text, version int, published_at timestamptz, content jsonb) language sql stable security definer set search_path = public as $$
  select c.child_id, c.published_version, c.published_at,
         jsonb_build_object('summary', c.published -> 'summary', 'avoid', c.published -> 'avoid', 'calm', c.published -> 'calm', 'signs', c.published -> 'signs',
           'routine', c.published -> 'routine',
           'goals', coalesce((select jsonb_agg(
               case when g ? 'targets_list' then
                 jsonb_set(g - 'seen' - 'needs' - 'why' - 'scale' - 'methods' - 'bank' - 'review_months' - 'review_date' - 'stop_reason',
                   '{targets_list}', coalesce((select jsonb_agg(jsonb_build_object('id', t -> 'id', 'staff', t -> 'staff')) from jsonb_array_elements(g -> 'targets_list') t), '[]'::jsonb))
               else g - 'seen' - 'needs' - 'why' - 'targets' - 'scale' - 'methods' - 'bank' - 'review_months' end)
             from jsonb_array_elements(coalesce(c.published -> 'goals', '[]'::jsonb)) g
            where coalesce(g ->> 'status', case when coalesce((g ->> 'focus')::boolean, false) then 'focus' else 'waiting' end) = 'focus'), '[]'::jsonb))
  from public.child_plans c
  where c.published is not null and public.is_staff_person()
$$;
revoke all on function public.plan_guidance() from public, anon;
grant execute on function public.plan_guidance() to authenticated;

-- ---- videos: more than one per version (a new one on request); the newest of every state (the staff keeps the approved one while a new draft waits)
alter table public.plan_videos drop constraint if exists plan_videos_child_id_version_key;
create or replace function public.plan_videos_current() returns table (child_id text, video_id uuid, version int, status text, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (v.child_id, v.status) v.child_id, v.id, v.version, v.status, v.decided_at
  from public.plan_videos v where public.is_staff_person() order by v.child_id, v.status, v.version desc, v.created_at desc
$$;
revoke all on function public.plan_videos_current() from public, anon;
grant execute on function public.plan_videos_current() to authenticated;
-- publishing: when the goal in focus changed (the site says so: p_full), a draft video; no e-mail ever
create or replace function public.plan_publish(p_child text, p_important boolean default false, p_full boolean default true) returns int language plpgsql security definer set search_path = public as $$
declare p public.child_plans; v int; full_up boolean;
begin
  if not public.can_see_child_therapy(p_child) then raise exception 'not allowed'; end if;
  select * into p from public.child_plans where child_id = p_child;
  if p.child_id is null or p.draft is null then raise exception 'no draft'; end if;
  v := p.published_version + 1; full_up := coalesce(p_full, true) or v = 1;
  perform set_config('mercury.publishing', 'on', true);
  update public.child_plans set published = p.draft, published_version = v, published_at = now(), published_by = public.my_staff_id(),
         review_date = coalesce(review_date, (now() + interval '3 months')::date) where child_id = p_child;
  perform set_config('mercury.publishing', 'off', true);
  insert into public.child_plan_versions (child_id, version, content, published_by, full_update) values (p_child, v, p.draft, public.my_staff_id(), full_up);
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'plan_publish', jsonb_build_object('child', p_child, 'version', v, 'full', full_up));
  if full_up and not exists (select 1 from public.plan_videos where child_id = p_child and status = 'draft') then
    insert into public.plan_videos (child_id, version, important) values (p_child, v, false);
  end if;
  return v;
end $$;
revoke all on function public.plan_publish(text, boolean, boolean) from public, anon;
grant execute on function public.plan_publish(text, boolean, boolean) to authenticated;
-- "סרטון חדש" on request: a draft of the published version (one draft at a time)
create or replace function public.plan_video_request(p_child text) returns uuid language plpgsql security definer set search_path = public as $$
declare v int; id uuid;
begin
  if not public.can_see_child_therapy(p_child) then raise exception 'not allowed'; end if;
  select published_version into v from public.child_plans where child_id = p_child;
  if coalesce(v, 0) = 0 then raise exception 'not published'; end if;
  select pv.id into id from public.plan_videos pv where pv.child_id = p_child and pv.status = 'draft' limit 1;
  if id is not null then return id; end if;
  insert into public.plan_videos (child_id, version, important) values (p_child, v, false) returning plan_videos.id into id;
  return id;
end $$;
revoke all on function public.plan_video_request(text) from public, anon;
grant execute on function public.plan_video_request(text) to authenticated;
-- approving a video: portal notices only (decision 19: no e-mail to the staff from the therapy portal)
create or replace function public.plan_video_decide(p_video uuid, p_ok boolean) returns void language plpgsql security definer set search_path = public as $$
declare vd public.plan_videos; nm text; txt text; txa text; r record;
begin
  select * into vd from public.plan_videos where id = p_video;
  if vd.id is null or not public.can_see_child_therapy(vd.child_id) then raise exception 'not allowed'; end if;
  if vd.status <> 'draft' then raise exception 'already decided'; end if;
  update public.plan_videos set status = case when p_ok then 'approved' else 'rejected' end, decided_at = now(), decided_by = public.my_staff_id() where id = p_video;
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'plan_video', jsonb_build_object('child', vd.child_id, 'version', vd.version, 'ok', p_ok));
  if not p_ok then return; end if;
  nm := coalesce(public.child_name(vd.child_id), '');
  txt := 'התוכנית הטיפולית של ' || nm || ' עודכנה, עם סרטון חדש. הוא מחכה בפורטל הטיפול.';
  txa := 'تم تحديث الخطة العلاجية لـ' || nm || ' مع فيديو جديد. ينتظر في بوابة العلاج.';
  for r in select s.id from public.staff s where s.active and s.kind in ('instructor', 'service', 'teacher', 'coordinator') loop
    insert into public.notices (to_staff, text, kind) values (r.id, case when public.lang_of(r.id) = 'ar' then txa else txt end, 'plan');
  end loop;
end $$;
revoke all on function public.plan_video_decide(uuid, boolean) from public, anon;
grant execute on function public.plan_video_decide(uuid, boolean) to authenticated;

-- ---- "the goal was achieved" (Q16): a notice to the staff in the portal
create or replace function public.goal_achieved_notice(p_child text, p_goal text) returns void language plpgsql security definer set search_path = public as $$
declare nm text; r record;
begin
  if not public.can_see_child_therapy(p_child) then raise exception 'not allowed'; end if;
  nm := coalesce(public.child_name(p_child), '');
  for r in select s.id from public.staff s where s.active and s.kind in ('instructor', 'service', 'teacher', 'coordinator') loop
    insert into public.notices (to_staff, text, kind) values (r.id,
      case when public.lang_of(r.id) = 'ar' then '🎉 ' || nm || ' حقق/ت الهدف: ' || p_goal else '🎉 ' || nm || ' השיג/ה את המטרה: ' || p_goal || '. תודה לכל הצוות!' end, 'plan');
  end loop;
end $$;
revoke all on function public.goal_achieved_notice(text, text) from public, anon;
grant execute on function public.goal_achieved_notice(text, text) to authenticated;

select 'scheduling_v44' as part, 'ok' as result;
