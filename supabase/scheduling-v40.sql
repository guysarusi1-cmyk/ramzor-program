-- scheduling v40 (2026-10-26): the therapy portal — the plan and the templates (Mercury decisions 77-95). Run once, after v39, on the TEST project
-- (the therapy portal is hidden on the live site). Safe to run again. Changes no data.
--   * the library: templates for every part of a plan (what to avoid, what calms, early signs, a special routine, what to do) and whole-plan
--     templates; a category for every template (search by category); a whole-plan template keeps its content.
--   * a substitute therapist until a date: sees and approves like the responsible one; it ends by itself.
--   * a therapist sees the published plans of every child (read only, like an instructor).
--   * publishing chooses "a small update" (no notice) or "a full update".
--   * "שאלה למטפלת": an observation marked as a question.

-- ---- the library
alter table public.mercury_library drop constraint if exists mercury_library_kind_check;
alter table public.mercury_library add constraint mercury_library_kind_check
  check (kind in ('goal', 'skill', 'strength', 'avoid', 'calm', 'signs', 'routine', 'todo', 'plan'));
alter table public.mercury_library add column if not exists category text;
alter table public.mercury_library add column if not exists content jsonb;          -- (a whole-plan template: the plan as it was saved, without the thinking)
alter table public.mercury_library alter column title type text;

-- ---- a substitute therapist until a date
create table if not exists public.therapist_subs (
  id          uuid primary key default gen_random_uuid(),
  therapist   uuid not null references public.staff(id) on delete cascade,          -- the one who is away
  substitute  uuid not null references public.staff(id) on delete cascade,
  until       date not null,
  created_by  uuid default public.my_staff_id(),
  created_at  timestamptz not null default now(),
  check (therapist <> substitute)
);
alter table public.therapist_subs enable row level security;
drop policy if exists "assign subs" on public.therapist_subs;
create policy "assign subs" on public.therapist_subs for all to authenticated using (public.is_coordinator() or public.is_admin()) with check (public.is_coordinator() or public.is_admin());
drop policy if exists "see own subs" on public.therapist_subs;
create policy "see own subs" on public.therapist_subs for select to authenticated using (substitute = public.my_staff_id() or therapist = public.my_staff_id());
grant select, insert, update, delete on public.therapist_subs to authenticated;

-- the children a therapist may work on: her own, and those of a therapist she stands in for (until the date, Israel time)
create or replace function public.can_see_child_therapy(p_child text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_therapist() and exists (
    select 1 from public.child_therapist t where t.child_id = p_child and (t.staff_id = public.my_staff_id() or exists (
      select 1 from public.therapist_subs s where s.therapist = t.staff_id and s.substitute = public.my_staff_id() and s.until >= (now() at time zone 'Asia/Jerusalem')::date))))
$$;
revoke all on function public.can_see_child_therapy(text) from public, anon;
grant execute on function public.can_see_child_therapy(text) to authenticated;
create or replace function public.my_therapy_children() returns setof text language sql stable security definer set search_path = public as $$
  select t.child_id from public.child_therapist t where public.is_therapist() and (t.staff_id = public.my_staff_id() or exists (
    select 1 from public.therapist_subs s where s.therapist = t.staff_id and s.substitute = public.my_staff_id() and s.until >= (now() at time zone 'Asia/Jerusalem')::date))
$$;
revoke all on function public.my_therapy_children() from public, anon;
grant execute on function public.my_therapy_children() to authenticated;
-- the therapist hears about her children; while somebody stands in for her, the substitute hears too
create or replace function public.tell_therapist(p_child text, p_subject text, p_text text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid; pref text; r record;
begin
  select ct.staff_id into t from public.child_therapist ct where ct.child_id = p_child;
  if t is null then return; end if;
  for r in select t as id union select s.substitute from public.therapist_subs s where s.therapist = t and s.until >= (now() at time zone 'Asia/Jerusalem')::date loop
    select coalesce(ss.therapist_notify, 'daily') into pref from public.staff_settings ss where ss.staff_id = r.id;
    if coalesce(pref, 'daily') = 'now' then perform public.tell_staff(r.id, p_subject, p_text, 'therapy');
    else insert into public.notices (to_staff, text, kind) values (r.id, p_text, 'therapy'); end if;
  end loop;
end $$;
revoke all on function public.tell_therapist(text, text, text) from public, anon, authenticated;

-- ---- what the staff (and every therapist, read only) sees: the published plan without the therapist's thinking and the file
create or replace function public.plan_guidance() returns table (child_id text, version int, published_at timestamptz, content jsonb) language sql stable security definer set search_path = public as $$
  select c.child_id, c.published_version, c.published_at,
         jsonb_build_object('summary', c.published -> 'summary', 'avoid', c.published -> 'avoid', 'calm', c.published -> 'calm', 'signs', c.published -> 'signs',
           'routine', c.published -> 'routine',
           'goals', coalesce((select jsonb_agg(g - 'seen' - 'needs' - 'why') from jsonb_array_elements(coalesce(c.published -> 'goals', '[]'::jsonb)) g), '[]'::jsonb))
  from public.child_plans c
  where c.published is not null and public.is_staff_person()
$$;
revoke all on function public.plan_guidance() from public, anon;
grant execute on function public.plan_guidance() to authenticated;

-- ---- publishing: "a full update" tells the staff; "a small update" (a word corrected) is kept as a version and tells nobody
alter table public.child_plan_versions add column if not exists full_update boolean not null default true;
drop function if exists public.plan_publish(text, boolean);          -- (replaced by the one with p_full: two of them would confuse the call)
create or replace function public.plan_publish(p_child text, p_important boolean default false, p_full boolean default true) returns int language plpgsql security definer set search_path = public as $$
declare p public.child_plans; v int; nm text; txt text; txa text; r record;
begin
  if not public.can_see_child_therapy(p_child) then raise exception 'not allowed'; end if;
  select * into p from public.child_plans where child_id = p_child;
  if p.child_id is null or p.draft is null then raise exception 'no draft'; end if;
  v := p.published_version + 1;
  perform set_config('mercury.publishing', 'on', true);
  update public.child_plans set published = p.draft, published_version = v, published_at = now(), published_by = public.my_staff_id(),
         review_date = coalesce(review_date, (now() + interval '3 months')::date) where child_id = p_child;
  perform set_config('mercury.publishing', 'off', true);
  insert into public.child_plan_versions (child_id, version, content, published_by, full_update) values (p_child, v, p.draft, public.my_staff_id(), coalesce(p_full, true) or v = 1);
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'plan_publish', jsonb_build_object('child', p_child, 'version', v, 'important', p_important, 'full', p_full));
  if not (coalesce(p_full, true) or v = 1) then return v; end if;          -- (a small update: nobody is told)
  nm := coalesce(public.child_name(p_child), '');
  txt := case when v = 1 then 'פורסמה תוכנית טיפולית ל' || nm || '. ההכוונה מחכה בפורטל הטיפול.' else 'התוכנית הטיפולית של ' || nm || ' עודכנה. ההכוונה החדשה מחכה בפורטל הטיפול.' end;
  txa := case when v = 1 then 'نُشرت خطة علاجية لـ' || nm || '. التوجيه ينتظر في بوابة العلاج.' else 'تم تحديث الخطة العلاجية لـ' || nm || '. التوجيه الجديد ينتظر في بوابة العلاج.' end;
  for r in select s.id from public.staff s where s.active and s.kind in ('instructor', 'service', 'teacher', 'coordinator') and s.id <> coalesce(public.my_staff_id(), '00000000-0000-0000-0000-000000000000'::uuid) loop
    if p_important then perform public.tell_staff_ar(r.id, 'עדכון חשוב בתוכנית של ' || nm, txt, 'plan', 'تحديث مهم في خطة ' || nm, txa);
    else insert into public.notices (to_staff, text, kind) values (r.id, case when public.lang_of(r.id) = 'ar' then txa else txt end, 'plan'); end if;
  end loop;
  return v;
end $$;
revoke all on function public.plan_publish(text, boolean, boolean) from public, anon;
grant execute on function public.plan_publish(text, boolean, boolean) to authenticated;

-- ---- "שאלה למטפלת": an observation marked as a question (the therapist answers; the instructor is told, as with an observation)
alter table public.observations add column if not exists kind text not null default 'obs';
alter table public.observations drop constraint if exists observations_kind_check;
alter table public.observations add constraint observations_kind_check check (kind in ('obs', 'question'));
create or replace function public.observation_told() returns trigger language plpgsql security definer set search_path = public as $$
declare nm text := coalesce(public.child_name(new.child_id), ''); who text; q boolean := new.kind = 'question';
begin
  if tg_op = 'INSERT' then
    select display_name into who from public.staff where id = new.author;
    perform public.tell_therapist(new.child_id, case when q then 'שאלה חדשה על ' else 'תצפית חדשה על ' end || nm,
      coalesce(who, 'מישהו מהצוות') || case when q then ' שאל/ה שאלה על ' else ' שלח/ה תצפית על ' end || nm || '. היא מחכה בפורטל הטיפול.');
  elsif new.reply is distinct from old.reply and new.author is not null then
    insert into public.notices (to_staff, text, kind) values (new.author, case when q then 'איש/אשת הטיפול ענו על השאלה שלך על ' else 'איש/אשת הטיפול ראו את התצפית שלך על ' end || nm || ': ' || coalesce(nullif(new.reply, ''), 'ראיתי, תודה'), 'therapy');
  end if;
  return new;
end $$;

select 'scheduling_v40' as part, 'ok' as result;
