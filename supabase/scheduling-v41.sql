-- scheduling v41 (2026-10-26): the plan videos (Mercury decisions 66-76, 84, 89, 90, 93). Run once, after v40, on the TEST project
-- (the therapy portal is hidden on the live site). Safe to run again. Changes no data.
--   * a full update of a plan makes a draft video; the responsible therapist approves or rejects it. The staff is told only when it is approved
--     (one notice, leading to the video); a rejected or still-draft video is not shown at all (the written plan is, from publishing).
--   * the video itself is built in the browser from the published plan (no file); here: which version, its state, and who watched it (80%).

create table if not exists public.plan_videos (
  id          uuid primary key default gen_random_uuid(),
  child_id    text not null,
  version     int  not null,                                                     -- the plan version it was made for
  status      text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  important   boolean not null default false,                                    -- (the e-mail to the staff, when approved)
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.staff(id) on delete set null,
  unique (child_id, version)
);
alter table public.plan_videos enable row level security;
drop policy if exists "therapist videos" on public.plan_videos;
create policy "therapist videos" on public.plan_videos for select to authenticated using (public.can_see_child_therapy(child_id) or public.is_coordinator());
grant select on public.plan_videos to authenticated;

create table if not exists public.video_views (
  video_id    uuid not null references public.plan_videos(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  pct         int  not null default 0 check (pct between 0 and 100),
  watched_at  timestamptz not null default now(),
  primary key (video_id, staff_id)
);
alter table public.video_views enable row level security;
drop policy if exists "own views" on public.video_views;
create policy "own views" on public.video_views for all to authenticated using (staff_id = public.my_staff_id()) with check (staff_id = public.my_staff_id());
drop policy if exists "see views" on public.video_views;
create policy "see views" on public.video_views for select to authenticated using (public.is_coordinator()
  or exists (select 1 from public.plan_videos v where v.id = video_id and public.can_see_child_therapy(v.child_id)));
grant select, insert, update on public.video_views to authenticated;

-- the current video of every child (the one of the last full update), for everybody on the staff: its state decides whether it is shown
create or replace function public.plan_videos_current() returns table (child_id text, video_id uuid, version int, status text, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (v.child_id) v.child_id, v.id, v.version, v.status, v.decided_at
  from public.plan_videos v where public.is_staff_person() order by v.child_id, v.version desc
$$;
revoke all on function public.plan_videos_current() from public, anon;
grant execute on function public.plan_videos_current() to authenticated;

-- publishing: a full update (and the first publish) makes a draft video; nobody on the staff is told yet (they are, when it is approved)
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
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'plan_publish', jsonb_build_object('child', p_child, 'version', v, 'important', p_important, 'full', full_up));
  if full_up then insert into public.plan_videos (child_id, version, important) values (p_child, v, coalesce(p_important, false)) on conflict (child_id, version) do nothing; end if;
  return v;
end $$;
revoke all on function public.plan_publish(text, boolean, boolean) from public, anon;
grant execute on function public.plan_publish(text, boolean, boolean) to authenticated;

-- the therapist decides: approved -> the staff is told ("סרטון חדש על …"; by e-mail too when the update was marked important); rejected -> nothing is shown
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
  txt := case when vd.version = 1 then 'פורסמה תוכנית טיפולית ל' || nm || ', עם סרטון קצר. הוא מחכה בפורטל הטיפול.' else 'התוכנית הטיפולית של ' || nm || ' עודכנה, עם סרטון חדש. הוא מחכה בפורטל הטיפול.' end;
  txa := case when vd.version = 1 then 'نُشرت خطة علاجية لـ' || nm || ' مع فيديو قصير. ينتظر في بوابة العلاج.' else 'تم تحديث الخطة العلاجية لـ' || nm || ' مع فيديو جديد. ينتظر في بوابة العلاج.' end;
  for r in select s.id from public.staff s where s.active and s.kind in ('instructor', 'service', 'teacher', 'coordinator') loop
    if vd.important then perform public.tell_staff_ar(r.id, 'סרטון חדש: ' || nm, txt, 'plan', 'فيديو جديد: ' || nm, txa);
    else insert into public.notices (to_staff, text, kind) values (r.id, case when public.lang_of(r.id) = 'ar' then txa else txt end, 'plan'); end if;
  end loop;
end $$;
revoke all on function public.plan_video_decide(uuid, boolean) from public, anon;
grant execute on function public.plan_video_decide(uuid, boolean) to authenticated;

select 'scheduling_v41' as part, 'ok' as result;
