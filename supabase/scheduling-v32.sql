-- scheduling v32 (2026-10-21): Mercury, stages 2-6 — everything the database needs, in one file. Run once, after v31. Safe to run again.
--   2. treatment plans: a draft and a published version per child, every publish kept, a guidance view for the staff without the
--      therapist's thinking, notices (an e-mail too when marked "important"), the two libraries (Mercury's and the center's) with a starter set
--   3. the strengths of every child (the temple): chosen twice by two different instructors -> the child's main suggestions
--   4. the space journey: planets by skill, the route of every child, one step a day (the day starts at 05:00), the therapist's approval
--      to move on (the child never waits: more adventures meanwhile), the admin's tool to place a child
--   5. observations (text or a recording), the therapist's "ראיתי, תודה", the therapist told by their choice (now / daily summary / portal)
--   6. the kids' TV without the staff password: a code by e-mail, a device token, disconnected from afar
--   files (plan documents, recordings, videos): one private storage bucket, opened only to who may see them
-- The therapist's information is opened only by can_see_child_therapy() (v31): the responsible therapist, and the admin.

-- ======================================================================= helpers
create or replace function public.child_name(p_child text) returns text language sql stable security definer set search_path = public as $$
  select r.first_name || case when coalesce(r.last_initial, '') <> '' then ' ' || r.last_initial || '''' else '' end from public.roster r where r.id = p_child
$$;
revoke all on function public.child_name(text) from public, anon, authenticated;

-- a person of the staff signed in personally (not the shared staff password, not a TV)
create or replace function public.is_staff_person() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s where s.id = public.my_staff_id() and s.active)
$$;
revoke all on function public.is_staff_person() from public, anon;
grant execute on function public.is_staff_person() to authenticated;

-- the day of a space step: a new day starts at 05:00, so a night shift counts for the day before (decision 50)
create or replace function public.journey_day() returns date language sql stable as $$
  select ((now() at time zone 'Asia/Jerusalem') - interval '5 hours')::date
$$;

-- tell the responsible therapist of a child, the way they chose: 'now' = e-mail + notice, otherwise a notice (the daily summary e-mail is sent by the hourly job)
create or replace function public.tell_therapist(p_child text, p_subject text, p_text text) returns void language plpgsql security definer set search_path = public as $$
declare t uuid; pref text;
begin
  select ct.staff_id into t from public.child_therapist ct where ct.child_id = p_child;
  if t is null then return; end if;
  select coalesce(ss.therapist_notify, 'daily') into pref from public.staff_settings ss where ss.staff_id = t;
  if coalesce(pref, 'daily') = 'now' then perform public.tell_staff(t, p_subject, p_text, 'therapy');
  else insert into public.notices (to_staff, text, kind) values (t, p_text, 'therapy'); end if;
end $$;
revoke all on function public.tell_therapist(text, text, text) from public, anon, authenticated;

-- ======================================================================= 2. the libraries
create table if not exists public.mercury_library (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('mercury', 'center')),
  institution  smallint not null default 1,
  kind         text not null check (kind in ('goal', 'skill', 'strength')),
  title        text not null,
  description  text,
  tags         text[] not null default '{}',
  active       boolean not null default true,
  created_by   uuid references public.staff(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (scope, institution, kind, title)
);
alter table public.mercury_library enable row level security;
drop policy if exists "read library" on public.mercury_library;
create policy "read library" on public.mercury_library for select to authenticated using (true);
drop policy if exists "add to library" on public.mercury_library;
create policy "add to library" on public.mercury_library for insert to authenticated
  with check ((scope = 'center' and (public.is_therapist() or public.is_admin())) or (scope = 'mercury' and public.is_admin()));
drop policy if exists "change library" on public.mercury_library;
create policy "change library" on public.mercury_library for update to authenticated
  using (public.is_admin() or (scope = 'center' and created_by = public.my_staff_id())) with check (public.is_admin() or (scope = 'center' and created_by = public.my_staff_id()));
drop policy if exists "remove from library" on public.mercury_library;
create policy "remove from library" on public.mercury_library for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.mercury_library to authenticated;
revoke all on public.mercury_library from anon;
create or replace function public.library_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin if tg_op = 'INSERT' then new.created_by := public.my_staff_id(); end if; return new; end $$;
drop trigger if exists library_stamp on public.mercury_library;
create trigger library_stamp before insert on public.mercury_library for each row execute function public.library_stamp();

-- the starter library of Mercury (trauma informed; Guy and the therapists edit it)
insert into public.mercury_library (scope, kind, title, description, tags) values
  ('mercury', 'goal', 'ויסות רגשי', 'לזהות רגש חזק ולהירגע בעזרת דרך שהילד בחר, לבד או עם מבוגר', '{רגש,ויסות}'),
  ('mercury', 'goal', 'התמודדות עם מעברים', 'לעבור בין פעילויות ומקומות בלי הצפה, בעזרת הכנה מראש', '{מעברים,שגרה}'),
  ('mercury', 'goal', 'בקשת עזרה', 'לפנות למבוגר או לחבר כשקשה, במילים או בסימן מוסכם', '{קשר,תקשורת}'),
  ('mercury', 'goal', 'הבעה במילים', 'לומר במילים מה מרגישים ומה צריכים, במקום להראות זאת בגוף', '{תקשורת,רגש}'),
  ('mercury', 'goal', 'שפה מכבדת', 'לדבר בלי קללות וכינויים פוגעים, גם ברגע של כעס', '{שפה,קשר}'),
  ('mercury', 'goal', 'קשר עם מבוגר משמעותי', 'לבנות אמון ולהיעזר במבוגר קבוע', '{קשר,ביטחון}'),
  ('mercury', 'goal', 'משחק משותף', 'לשחק עם ילדים אחרים, לחכות לתור ולשתף', '{חברתי}'),
  ('mercury', 'goal', 'התמודדות עם תסכול', 'להמשיך או לבקש עזרה כשמשהו לא מצליח, בלי לוותר או להתפרץ', '{רגש,התמדה}'),
  ('mercury', 'goal', 'שמירה על גבולות הגוף', 'לשמור על הגוף שלי ועל הגוף של אחרים', '{בטיחות,חברתי}'),
  ('mercury', 'goal', 'שגרת שינה רגועה', 'להירדם ולישון בתחושת ביטחון, בעזרת טקס קבוע', '{שינה,ביטחון}'),
  ('mercury', 'goal', 'דימוי עצמי', 'לזהות דברים טובים בעצמי ולהגיד אותם', '{ערך עצמי}'),
  ('mercury', 'goal', 'השתתפות בלמידה', 'להשתתף בפעילות לימודית לזמן שמתאים לגיל', '{לימודים}'),
  ('mercury', 'skill', 'יום נקי מקללות', 'יום שלם בלי קללות', '{שפה}'),
  ('mercury', 'skill', 'מציאת מילים ברגע של קושי', 'אמר/ה במילים מה קשה, ברגע שהיה קשה', '{תקשורת}'),
  ('mercury', 'skill', 'הירגעות בעזרת כלי', 'השתמש/ה בכלי הרגעה שבחר/ה (נשימה, פינה שקטה, חפץ)', '{ויסות}'),
  ('mercury', 'skill', 'בקשת עזרה', 'פנה/תה למבוגר כשהיה קשה', '{קשר}'),
  ('mercury', 'skill', 'מעבר בלי התפרצות', 'עבר/ה בין פעילויות בלי התפרצות', '{מעברים}'),
  ('mercury', 'skill', 'פתרון בעיה במילים', 'פתר/ה מחלוקת עם ילד אחר במילים', '{חברתי}'),
  ('mercury', 'skill', 'המתנה לתור', 'חיכה/תה לתור בלי לדחוף או לצעוק', '{חברתי}'),
  ('mercury', 'skill', 'שמירה על הגוף', 'שמר/ה על הגוף שלו/ה ושל אחרים כל היום', '{בטיחות}'),
  ('mercury', 'strength', 'אומץ', null, '{}'), ('mercury', 'strength', 'התמדה', null, '{}'), ('mercury', 'strength', 'גמישות', null, '{}'),
  ('mercury', 'strength', 'בקשת עזרה', null, '{}'), ('mercury', 'strength', 'סבלנות', null, '{}'), ('mercury', 'strength', 'נדיבות', null, '{}'),
  ('mercury', 'strength', 'קבלה', null, '{}'), ('mercury', 'strength', 'אכפתיות', null, '{}'), ('mercury', 'strength', 'שיתוף', null, '{}'),
  ('mercury', 'strength', 'כנות', null, '{}'), ('mercury', 'strength', 'הקשבה', null, '{}'), ('mercury', 'strength', 'יצירתיות', null, '{}'),
  ('mercury', 'strength', 'אחריות', null, '{}'), ('mercury', 'strength', 'חברות', null, '{}'), ('mercury', 'strength', 'שליטה עצמית', null, '{}'),
  ('mercury', 'strength', 'סקרנות', null, '{}'), ('mercury', 'strength', 'הומור', null, '{}'), ('mercury', 'strength', 'עזרה לחבר', null, '{}'),
  ('mercury', 'strength', 'אמירת סליחה', null, '{}'), ('mercury', 'strength', 'אמונה בעצמי', null, '{}')
on conflict (scope, institution, kind, title) do nothing;

-- ======================================================================= 2. the plans
-- content (jsonb): { summary, avoid, goals:[{ id, title, library_id, focus, targets, interventions, seen, needs, why, planet_id, strengths:[…] }], file:{path,name} }
create table if not exists public.child_plans (
  child_id           text primary key,
  institution        smallint not null default 1,
  draft              jsonb,
  draft_by           uuid references public.staff(id) on delete set null,
  draft_at           timestamptz,
  published          jsonb,
  published_version  int not null default 0,
  published_at       timestamptz,
  published_by       uuid references public.staff(id) on delete set null,
  review_date        date
);
alter table public.child_plans enable row level security;
drop policy if exists "therapist plans" on public.child_plans;
create policy "therapist plans" on public.child_plans for all to authenticated
  using (public.can_see_child_therapy(child_id)) with check (public.can_see_child_therapy(child_id));
grant select, insert, update on public.child_plans to authenticated;
revoke all on public.child_plans from anon;
create or replace function public.plan_draft_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.draft is distinct from old.draft then new.draft_by := public.my_staff_id(); new.draft_at := now(); end if;
  if tg_op = 'UPDATE' and (new.published is distinct from old.published or new.published_version is distinct from old.published_version) and current_setting('mercury.publishing', true) is distinct from 'on' then
    raise exception 'a plan is published only with plan_publish()';
  end if;
  if tg_op = 'INSERT' and (new.published is not null or new.published_version <> 0) then raise exception 'a plan is published only with plan_publish()'; end if;
  return new;
end $$;
drop trigger if exists plan_draft_stamp on public.child_plans;
create trigger plan_draft_stamp before insert or update on public.child_plans for each row execute function public.plan_draft_stamp();

create table if not exists public.child_plan_versions (
  id            bigint generated always as identity primary key,
  child_id      text not null,
  institution   smallint not null default 1,
  version       int not null,
  content       jsonb not null,
  published_at  timestamptz not null default now(),
  published_by  uuid references public.staff(id) on delete set null,
  unique (child_id, version)
);
alter table public.child_plan_versions enable row level security;
drop policy if exists "therapist versions" on public.child_plan_versions;
create policy "therapist versions" on public.child_plan_versions for select to authenticated using (public.can_see_child_therapy(child_id));
grant select on public.child_plan_versions to authenticated;
revoke all on public.child_plan_versions from anon;

-- publish the draft: it is in force at once, every version is kept, the staff is told (by e-mail too when "important")
create or replace function public.plan_publish(p_child text, p_important boolean default false) returns int language plpgsql security definer set search_path = public as $$
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
  insert into public.child_plan_versions (child_id, version, content, published_by) values (p_child, v, p.draft, public.my_staff_id());
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'plan_publish', jsonb_build_object('child', p_child, 'version', v, 'important', p_important));
  nm := coalesce(public.child_name(p_child), '');
  txt := case when v = 1 then 'פורסמה תוכנית טיפולית ל' || nm || '. ההכוונה מחכה בפורטל הטיפול.' else 'התוכנית הטיפולית של ' || nm || ' עודכנה. ההכוונה החדשה מחכה בפורטל הטיפול.' end;
  txa := case when v = 1 then 'نُشرت خطة علاجية لـ' || nm || '. التوجيه ينتظر في بوابة العلاج.' else 'تم تحديث الخطة العلاجية لـ' || nm || '. التوجيه الجديد ينتظر في بوابة العلاج.' end;
  for r in select s.id from public.staff s where s.active and s.kind in ('instructor', 'service', 'teacher', 'coordinator') and s.id <> coalesce(public.my_staff_id(), '00000000-0000-0000-0000-000000000000'::uuid) loop
    if p_important then perform public.tell_staff_ar(r.id, 'עדכון חשוב בתוכנית של ' || nm, txt, 'plan', 'تحديث مهم في خطة ' || nm, txa);
    else insert into public.notices (to_staff, text, kind) values (r.id, case when public.lang_of(r.id) = 'ar' then txa else txt end, 'plan'); end if;
  end loop;
  return v;
end $$;
revoke all on function public.plan_publish(text, boolean) from public, anon;
grant execute on function public.plan_publish(text, boolean) to authenticated;

-- what the staff sees: the published plans, without the therapist's own thinking ("what we see / what may be needed / why") and the attached file;
-- somebody who is only a therapist: only their children; the admin: everything
create or replace function public.plan_guidance() returns table (child_id text, version int, published_at timestamptz, content jsonb) language sql stable security definer set search_path = public as $$
  select c.child_id, c.published_version, c.published_at,
         jsonb_build_object('summary', c.published -> 'summary', 'avoid', c.published -> 'avoid',
           'goals', coalesce((select jsonb_agg(g - 'seen' - 'needs' - 'why') from jsonb_array_elements(coalesce(c.published -> 'goals', '[]'::jsonb)) g), '[]'::jsonb))
  from public.child_plans c
  where c.published is not null and public.is_staff_person()
    and (public.is_admin() or public.can_see_child_therapy(c.child_id)
         or exists (select 1 from public.staff s where s.id = public.my_staff_id() and s.kind <> 'therapist'))
$$;
revoke all on function public.plan_guidance() from public, anon;
grant execute on function public.plan_guidance() to authenticated;

-- ======================================================================= 4. the space journey
create table if not exists public.journey_planets (
  id           text primary key,
  institution  smallint not null default 1,
  name         text not null,
  skill        text not null,
  question     text not null,
  preset       boolean not null default false,
  art          text,
  active       boolean not null default true,
  created_by   uuid references public.staff(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.journey_planets enable row level security;
drop policy if exists "read planets" on public.journey_planets;
create policy "read planets" on public.journey_planets for select to authenticated using (true);
drop policy if exists "add planets" on public.journey_planets;
create policy "add planets" on public.journey_planets for insert to authenticated with check ((public.is_therapist() or public.is_admin()) and not preset);
drop policy if exists "change planets" on public.journey_planets;
create policy "change planets" on public.journey_planets for update to authenticated
  using (public.is_admin() or (not preset and created_by = public.my_staff_id())) with check (public.is_admin() or (not preset and created_by = public.my_staff_id()));
grant select, insert, update on public.journey_planets to authenticated;
revoke all on public.journey_planets from anon;
insert into public.journey_planets (id, name, skill, question, preset, art) values
  ('moon', 'הירח', 'יום נקי מקללות', 'היום היה יום נקי מקללות?', true, 'moon'),
  ('mercury', 'כוכב המילים', 'מציאת מילים ברגע של קושי', 'היום הילד/ה מצא/ה מילים ברגע של קושי?', true, 'mercury')
on conflict (id) do nothing;

-- where every child is: the route (planets in order), the planet, the stage and the step in it
--   climb = up the mountain (7, the moon route only) · fly = to the planet (7) · adventure = on the planet (10) · extra = more adventures until the therapist approves the next planet (10, again and again)
create table if not exists public.child_journeys (
  child_id       text primary key,
  institution    smallint not null default 1,
  route          text[] not null default '{moon,mercury}',
  planet_idx     int not null default 0,
  stage          text not null default 'climb' check (stage in ('climb', 'fly', 'adventure', 'extra')),
  step           int not null default 0,
  ship           text,
  symbols        text[] not null default '{}',
  next_approved  boolean not null default false,
  last_step_day  date,
  updated_at     timestamptz not null default now()
);
alter table public.child_journeys enable row level security;
drop policy if exists "read journeys" on public.child_journeys;
create policy "read journeys" on public.child_journeys for select to authenticated using (true);
grant select on public.child_journeys to authenticated;
revoke all on public.child_journeys from anon;

create table if not exists public.journey_steps (
  id           bigint generated always as identity primary key,
  child_id     text not null,
  institution  smallint not null default 1,
  planet_id    text not null,
  stage        text not null,
  step         int not null,
  day          date not null,
  by_staff     uuid references public.staff(id) on delete set null,
  at           timestamptz not null default now(),
  unique (child_id, day)
);
alter table public.journey_steps enable row level security;
drop policy if exists "see steps" on public.journey_steps;
create policy "see steps" on public.journey_steps for select to authenticated using (public.can_see_child_therapy(child_id) or public.is_coordinator());
grant select on public.journey_steps to authenticated;
revoke all on public.journey_steps from anon;

create table if not exists public.journey_choices (
  id         bigint generated always as identity primary key,
  child_id   text not null,
  planet_id  text not null,
  point      text not null,
  choice     text not null,
  by_staff   uuid references public.staff(id) on delete set null,
  at         timestamptz not null default now()
);
alter table public.journey_choices enable row level security;
drop policy if exists "see choices" on public.journey_choices;
create policy "see choices" on public.journey_choices for select to authenticated using (true);
grant select on public.journey_choices to authenticated;
revoke all on public.journey_choices from anon;

create or replace function public.stage_length(p_stage text) returns int language sql immutable as $$
  select case p_stage when 'climb' then 7 when 'fly' then 7 else 10 end
$$;

-- one step: at most one a day (from 05:00); the stage ends -> the next one; after the adventure the next planet only with the therapist's approval,
-- otherwise more adventures (the child never waits and never sees a failure). Returns where the child is now and the milestone reached, if any.
create or replace function public.journey_step(p_child text) returns jsonb language plpgsql security definer set search_path = public as $$
declare j public.child_journeys; d date := public.journey_day(); planet text; milestone text := null; nm text;
begin
  if not public.is_staff_person() then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.roster where id = p_child) then raise exception 'no such child'; end if;
  insert into public.child_journeys (child_id) values (p_child) on conflict (child_id) do nothing;
  select * into j from public.child_journeys where child_id = p_child for update;
  if j.last_step_day = d then raise exception 'already today'; end if;
  planet := j.route[j.planet_idx + 1];
  insert into public.journey_steps (child_id, planet_id, stage, step, day, by_staff) values (p_child, planet, j.stage, j.step + 1, d, public.my_staff_id());
  j.step := j.step + 1;
  if j.step >= public.stage_length(j.stage) then
    nm := coalesce(public.child_name(p_child), '');
    if j.stage = 'climb' then j.stage := 'fly'; j.step := 0; milestone := 'ship';
    elsif j.stage = 'fly' then j.stage := 'adventure'; j.step := 0; milestone := 'arrive'; j.symbols := array_append(j.symbols, planet);
    else
      if j.next_approved and j.planet_idx + 1 < coalesce(array_length(j.route, 1), 0) then
        j.planet_idx := j.planet_idx + 1; j.stage := 'fly'; j.step := 0; j.next_approved := false; milestone := 'next';
      else
        milestone := case when j.stage = 'adventure' then 'adventure_done' else 'extra_done' end; j.stage := 'extra'; j.step := 0;
        perform public.tell_therapist(p_child, nm || ' סיים/ה את ההרפתקה', nm || ' סיים/ה את ההרפתקה ב' || coalesce((select name from public.journey_planets where id = planet), planet) || '. המסע ממשיך בהרפתקאות נוספות עד שתאשר/י מעבר לכוכב הבא, בפורטל הטיפול.');
      end if;
    end if;
  end if;
  update public.child_journeys set planet_idx = j.planet_idx, stage = j.stage, step = j.step, symbols = j.symbols, next_approved = j.next_approved, last_step_day = d, updated_at = now() where child_id = p_child;
  return jsonb_build_object('planet', j.route[j.planet_idx + 1], 'stage', j.stage, 'step', j.step, 'milestone', milestone);
end $$;
revoke all on function public.journey_step(text) from public, anon;
grant execute on function public.journey_step(text) to authenticated;

create or replace function public.journey_set_ship(p_child text, p_ship text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_person() then raise exception 'not allowed'; end if;
  insert into public.child_journeys (child_id, ship) values (p_child, p_ship) on conflict (child_id) do update set ship = excluded.ship, updated_at = now();
end $$;
create or replace function public.journey_choose(p_child text, p_point text, p_choice text) returns void language plpgsql security definer set search_path = public as $$
declare j public.child_journeys;
begin
  if not public.is_staff_person() then raise exception 'not allowed'; end if;
  select * into j from public.child_journeys where child_id = p_child;
  insert into public.journey_choices (child_id, planet_id, point, choice, by_staff) values (p_child, coalesce(j.route[j.planet_idx + 1], 'moon'), p_point, p_choice, public.my_staff_id());
end $$;
-- the therapist (or the admin): the route of a child, and the approval to move on to the next planet
create or replace function public.journey_set_route(p_child text, p_route text[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_child_therapy(p_child) then raise exception 'not allowed'; end if;
  if exists (select 1 from unnest(p_route) x where not exists (select 1 from public.journey_planets pl where pl.id = x and pl.active)) then raise exception 'no such planet'; end if;
  insert into public.child_journeys (child_id, route) values (p_child, p_route) on conflict (child_id) do update set route = excluded.route, updated_at = now();
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'journey_route', jsonb_build_object('child', p_child, 'route', p_route));
end $$;
create or replace function public.journey_approve_next(p_child text, p_ok boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_child_therapy(p_child) then raise exception 'not allowed'; end if;
  insert into public.child_journeys (child_id, next_approved) values (p_child, p_ok) on conflict (child_id) do update set next_approved = excluded.next_approved, updated_at = now();
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'journey_approve', jsonb_build_object('child', p_child, 'ok', p_ok));
end $$;
-- the admin: put a child where they really are (the children on the way to Mercury, from the board on the wall)
create or replace function public.journey_place(p_child text, p_planet_idx int, p_stage text, p_step int) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_stage not in ('climb', 'fly', 'adventure', 'extra') or p_step < 0 or p_step >= public.stage_length(p_stage) then raise exception 'bad place'; end if;
  insert into public.child_journeys (child_id, planet_idx, stage, step) values (p_child, p_planet_idx, p_stage, p_step)
    on conflict (child_id) do update set planet_idx = excluded.planet_idx, stage = excluded.stage, step = excluded.step, updated_at = now();
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'journey_place', jsonb_build_object('child', p_child, 'planet_idx', p_planet_idx, 'stage', p_stage, 'step', p_step));
end $$;
revoke all on function public.journey_set_ship(text, text), public.journey_choose(text, text, text), public.journey_set_route(text, text[]), public.journey_approve_next(text, boolean), public.journey_place(text, int, text, int) from public, anon;
grant execute on function public.journey_set_ship(text, text), public.journey_choose(text, text, text), public.journey_set_route(text, text[]), public.journey_approve_next(text, boolean), public.journey_place(text, int, text, int) to authenticated;

-- ======================================================================= 3. the strengths of every child (the temple)
create table if not exists public.child_strengths (
  child_id     text not null,
  strength     text not null,
  institution  smallint not null default 1,
  status       text not null default 'extra' check (status in ('extra', 'main', 'removed')),
  pickers      uuid[] not null default '{}',
  picks        int not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (child_id, strength)
);
alter table public.child_strengths enable row level security;
drop policy if exists "read strengths" on public.child_strengths;
create policy "read strengths" on public.child_strengths for select to authenticated using (true);
grant select on public.child_strengths to authenticated;
revoke all on public.child_strengths from anon;

-- a brick was given for a strength: count it for the child; chosen by two different instructors -> the child's main suggestions (the therapist is told)
create or replace function public.note_strength(p_child text, p_strength text) returns text language plpgsql security definer set search_path = public as $$
declare s public.child_strengths; me uuid := public.my_staff_id(); st text := btrim(left(coalesce(p_strength, ''), 20)); nm text;
begin
  if st = '' or not exists (select 1 from public.roster where id = p_child) then return null; end if;
  insert into public.child_strengths (child_id, strength) values (p_child, st) on conflict (child_id, strength) do nothing;
  select * into s from public.child_strengths where child_id = p_child and strength = st for update;
  if s.status = 'removed' then update public.child_strengths set picks = picks + 1, updated_at = now() where child_id = p_child and strength = st; return 'removed'; end if;
  if me is not null and not (me = any(s.pickers)) then s.pickers := array_append(s.pickers, me); end if;
  update public.child_strengths set pickers = s.pickers, picks = picks + 1, updated_at = now(),
         status = case when status = 'extra' and coalesce(array_length(s.pickers, 1), 0) >= 2 then 'main' else status end
   where child_id = p_child and strength = st returning status into s.status;
  if s.status = 'main' and coalesce(array_length(s.pickers, 1), 0) = 2 then
    nm := coalesce(public.child_name(p_child), '');
    perform public.tell_therapist(p_child, 'חוזקה חדשה אצל ' || nm, 'החוזקה "' || st || '" נבחרה אצל ' || nm || ' על ידי שני מדריכים, ועלתה להצעות המרכזיות שלו/ה. אפשר להוריד אותה בפורטל הטיפול.');
  end if;
  return s.status;
end $$;
create or replace function public.strength_set(p_child text, p_strength text, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_child_therapy(p_child) then raise exception 'not allowed'; end if;
  if p_status not in ('extra', 'main', 'removed') then raise exception 'bad status'; end if;
  insert into public.child_strengths (child_id, strength, status) values (p_child, btrim(left(p_strength, 20)), p_status)
    on conflict (child_id, strength) do update set status = excluded.status, updated_at = now();
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'strength_' || p_status, jsonb_build_object('child', p_child, 'strength', p_strength));
end $$;
-- the strengths offered when giving a brick: the plan's and the child's own (main + extra), or null when the child has no published plan (then the general list)
create or replace function public.brick_strengths(p_child text) returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.published is null then null else jsonb_build_object(
    'plan', coalesce((select jsonb_agg(distinct x) from jsonb_array_elements(coalesce(c.published -> 'goals', '[]'::jsonb)) g, jsonb_array_elements_text(coalesce(g -> 'strengths', '[]'::jsonb)) x), '[]'::jsonb),
    'main', coalesce((select jsonb_agg(s.strength order by s.picks desc) from public.child_strengths s where s.child_id = p_child and s.status = 'main'), '[]'::jsonb),
    'extra', coalesce((select jsonb_agg(s.strength order by s.picks desc) from public.child_strengths s where s.child_id = p_child and s.status = 'extra'), '[]'::jsonb)) end
  from (select (select published from public.child_plans where child_id = p_child) as published) c
$$;
revoke all on function public.note_strength(text, text), public.strength_set(text, text, text), public.brick_strengths(text) from public, anon;
grant execute on function public.note_strength(text, text), public.strength_set(text, text, text), public.brick_strengths(text) to authenticated;

-- ======================================================================= 5. observations
create table if not exists public.observations (
  id           uuid primary key default gen_random_uuid(),
  child_id     text not null,
  institution  smallint not null default 1,
  author       uuid references public.staff(id) on delete set null,
  text         text,
  audio_path   text,
  goal_id      text,
  created_at   timestamptz not null default now(),
  seen_at      timestamptz,
  reply        text,
  replied_at   timestamptz,
  replied_by   uuid references public.staff(id) on delete set null,
  check (coalesce(btrim(text), '') <> '' or audio_path is not null)
);
create index if not exists observations_child on public.observations (child_id, created_at desc);
alter table public.observations enable row level security;
drop policy if exists "see observations" on public.observations;
create policy "see observations" on public.observations for select to authenticated using (author = public.my_staff_id() or public.can_see_child_therapy(child_id));
drop policy if exists "write observations" on public.observations;
create policy "write observations" on public.observations for insert to authenticated with check (public.is_staff_person() and author = public.my_staff_id());
drop policy if exists "answer observations" on public.observations;
create policy "answer observations" on public.observations for update to authenticated using (public.can_see_child_therapy(child_id)) with check (public.can_see_child_therapy(child_id));
grant select, insert, update on public.observations to authenticated;
revoke all on public.observations from anon;
create or replace function public.observation_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.author := public.my_staff_id(); new.created_at := now(); new.seen_at := null; new.reply := null; new.replied_at := null; new.replied_by := null;
  else
    new.child_id := old.child_id; new.author := old.author; new.text := old.text; new.audio_path := old.audio_path; new.created_at := old.created_at;
    if new.reply is distinct from old.reply then new.replied_at := now(); new.replied_by := public.my_staff_id(); end if;
  end if;
  return new;
end $$;
drop trigger if exists observation_stamp on public.observations;
create trigger observation_stamp before insert or update on public.observations for each row execute function public.observation_stamp();
create or replace function public.observation_told() returns trigger language plpgsql security definer set search_path = public as $$
declare nm text := coalesce(public.child_name(new.child_id), ''); who text;
begin
  if tg_op = 'INSERT' then
    select display_name into who from public.staff where id = new.author;
    perform public.tell_therapist(new.child_id, 'תצפית חדשה על ' || nm, coalesce(who, 'מישהו מהצוות') || ' שלח/ה תצפית על ' || nm || '. היא מחכה בפורטל הטיפול.');
  elsif new.reply is distinct from old.reply and new.author is not null then
    insert into public.notices (to_staff, text, kind) values (new.author, 'איש/אשת הטיפול ראו את התצפית שלך על ' || nm || ': ' || coalesce(nullif(new.reply, ''), 'ראיתי, תודה'), 'therapy');
  end if;
  return new;
end $$;
drop trigger if exists observation_told on public.observations;
create trigger observation_told after insert or update on public.observations for each row execute function public.observation_told();

-- ======================================================================= files: one private bucket, opened by path
--   plans/<child>/…  the therapist's documents (therapist + admin) · audio/<child>/…  recorded observations (therapist + admin + the one who recorded)
--   videos/<child>/… the plan videos (made by the therapist; seen by the staff)
insert into storage.buckets (id, name, public, file_size_limit) values ('mercury', 'mercury', false, 26214400) on conflict (id) do nothing;
drop policy if exists "mercury read" on storage.objects;
create policy "mercury read" on storage.objects for select to authenticated using (bucket_id = 'mercury' and (
  ((storage.foldername(name))[1] = 'plans' and public.can_see_child_therapy((storage.foldername(name))[2]))
  or ((storage.foldername(name))[1] = 'audio' and (public.can_see_child_therapy((storage.foldername(name))[2]) or owner = auth.uid()))
  or ((storage.foldername(name))[1] = 'videos' and public.is_staff_person())));
drop policy if exists "mercury write" on storage.objects;
create policy "mercury write" on storage.objects for insert to authenticated with check (bucket_id = 'mercury' and (
  ((storage.foldername(name))[1] in ('plans', 'videos') and public.can_see_child_therapy((storage.foldername(name))[2]))
  or ((storage.foldername(name))[1] = 'audio' and public.is_staff_person())));
drop policy if exists "mercury delete" on storage.objects;
create policy "mercury delete" on storage.objects for delete to authenticated using (bucket_id = 'mercury' and (
  ((storage.foldername(name))[1] in ('plans', 'videos') and public.can_see_child_therapy((storage.foldername(name))[2])) or public.is_admin()));

-- ======================================================================= 6. the kids' TV without the staff password
create table if not exists public.tv_devices (
  id           uuid primary key default gen_random_uuid(),
  institution  smallint not null default 1,
  name         text not null default 'מסך',
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.staff(id) on delete set null,
  active       boolean not null default true,
  last_seen    timestamptz
);
alter table public.tv_devices enable row level security;
drop policy if exists "admin sees screens" on public.tv_devices;
create policy "admin sees screens" on public.tv_devices for select to authenticated using (public.is_coordinator());
grant select on public.tv_devices to authenticated;
revoke all on public.tv_devices from anon;
create table if not exists public.tv_codes (
  code_hash   text primary key,
  expires_at  timestamptz not null,
  created_by  uuid references public.staff(id) on delete set null
);
alter table public.tv_codes enable row level security;
revoke all on public.tv_codes from anon, authenticated;

-- a short code for a new screen, sent by e-mail to the admin or coordinator who asked (valid for 15 minutes)
create or replace function public.tv_code_new() returns boolean language plpgsql security definer set search_path = public as $$
declare code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if not (public.is_admin() or public.is_coordinator()) or public.my_staff_id() is null then raise exception 'not allowed'; end if;
  delete from public.tv_codes where expires_at < now();
  insert into public.tv_codes (code_hash, expires_at, created_by) values (md5('tv:' || code), now() + interval '15 minutes', public.my_staff_id());
  perform public.tell_staff(public.my_staff_id(), 'קוד לחיבור מסך הילדים', 'הקוד לחיבור מסך הילדים: ' || code || '. מקלידים אותו במסך פעם אחת. הקוד תקף ל-15 דקות.', 'tv');
  return true;
end $$;
-- the screen sends the code; back comes its own token (kept on the screen); the code is used once
create or replace function public.tv_pair(p_code text, p_name text default null) returns text language plpgsql security definer set search_path = public as $$
declare c public.tv_codes; tok text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  select * into c from public.tv_codes where code_hash = md5('tv:' || btrim(coalesce(p_code, ''))) and expires_at > now();
  if c.code_hash is null then return null; end if;
  delete from public.tv_codes where code_hash = c.code_hash;
  insert into public.tv_devices (name, token_hash, created_by) values (coalesce(nullif(btrim(p_name), ''), 'מסך הילדים'), md5('tvtok:' || tok), c.created_by);
  return tok;
end $$;
create or replace function public.tv_check(p_token text) returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update public.tv_devices set last_seen = now() where token_hash = md5('tvtok:' || coalesce(p_token, '')) and active returning true into ok;
  return coalesce(ok, false);
end $$;
create or replace function public.tv_revoke(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_coordinator()) then raise exception 'not allowed'; end if;
  update public.tv_devices set active = false where id = p_id;
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'tv_revoke', jsonb_build_object('device', p_id));
end $$;
-- what the TV shows of the space journey: positions and pictures only (no skill names), for a connected screen or a signed-in person
create or replace function public.tv_journeys(p_token text default null) returns table (child_id text, planet text, art text, stage text, step int, ship text, symbols text[]) language sql stable security definer set search_path = public as $$
  select j.child_id, j.route[j.planet_idx + 1], pl.art, j.stage, j.step, j.ship, j.symbols
  from public.child_journeys j left join public.journey_planets pl on pl.id = j.route[j.planet_idx + 1]
  where auth.uid() is not null or exists (select 1 from public.tv_devices d where d.token_hash = md5('tvtok:' || coalesce(p_token, '')) and d.active)
$$;
revoke all on function public.tv_code_new(), public.tv_revoke(uuid) from public, anon;
grant execute on function public.tv_code_new(), public.tv_revoke(uuid) to authenticated;
revoke all on function public.tv_pair(text, text), public.tv_check(text), public.tv_journeys(text) from public;
grant execute on function public.tv_pair(text, text), public.tv_check(text), public.tv_journeys(text) to anon, authenticated;

-- the realtime of the kids' TV also hears the journeys
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'child_journeys') then
    execute 'alter publication supabase_realtime add table public.child_journeys';
  end if;
exception when others then null; end $$;

select 'scheduling_v32' as part, 'ok' as result;
