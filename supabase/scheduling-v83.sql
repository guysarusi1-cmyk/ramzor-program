-- ================================================================
-- Scheduling, part 83 — STAGE 1: THE ORGANISATION'S SETTINGS IN THE DATABASE. Run in the SQL Editor of the product's database,
-- after scheduling-v82.sql. Safe to run again. (Guy 2026-11-17, block 1 of the weekly plan; spec: reports\2026-11-17_stage1-settings_report.md)
-- Until now the shifts, how many people each needs and the rules were written inside the site's code, for one institution.
-- From here they are rows in the database, one set per organisation:
--   * houses: every organisation has a main house (more can be added later); a person may belong to more than one house;
--   * a settings VERSION per organisation, "valid from" a period start: a schedule is read with the version of its time, so an old
--     schedule keeps the rules it was built with (Guy: ask "from the next period / also the open one" at every change);
--   * shifts per day type (weekday, Friday, Saturday, holiday eve, holiday) and house: name, hours (may end on a later day), what it
--     counts in the quota, paid hours (decided at the meeting of 19.11; empty = the whole length);
--   * how many people each shift needs: a minimum + an extra place "when hands are free", per day of the week if needed, and a weekly
--     cap on the extra places per house;
--   * special days by date (a holiday changed, an event) for the whole organisation or one house, with their own needs;
--   * a fixed list of rules (hard, soft, warning) with a switch and numbers — the same list for everybody (tw_rule_catalog);
--   * Israel's holidays 2026–2028 (one calendar for all; a holiday is like Saturday, its eve like Friday);
--   * three ready templates (emergency centre, boarding / hostel, balancing home); the existing organisations get the balancing-home
--     template (the pilot), as a draft from the institution's form, corrected after the meeting of 19.11.
-- Who: every member of the organisation reads its settings; only an admin writes them. Global lists (rules, holidays, templates)
-- are read by every signed-in person and written by nobody from the site.
-- The building engine is NOT changed here (stage 2 reads these rows); tw_settings (queue, open / close days) keeps working.
-- ================================================================

do $$ begin
  if to_regprocedure('public.current_org()') is null then raise exception 'scheduling-v81.sql first'; end if;
  if to_regclass('public.tw_notice') is null then raise exception 'scheduling-v82.sql first'; end if;
end $$;

-- 1. the global lists -----------------------------------------------------------------------------------------------------
create table if not exists public.tw_rule_catalog (
  key text primary key,
  kind text not null check (kind in ('hard', 'soft', 'warn')),
  label text not null,                       -- Hebrew, as the setup will show it
  params jsonb not null default '{}'::jsonb, -- the default numbers, for example {"hours":7}
  weight int,                                -- soft rules: how much it counts against the others
  templates text[] not null default '{}',    -- the templates in which it is on by default
  only_templates text[],                     -- shown only in these templates (the emergency centre's own rules); null = everybody
  sort int not null default 0
);
create table if not exists public.tw_holiday (
  day date primary key,
  kind text not null check (kind in ('eve', 'holiday')),
  name text not null
);
create table if not exists public.tw_template (
  key text primary key,
  name text not null,
  about text not null,
  data jsonb not null,
  sort int not null default 0
);

-- 2. the organisation's own -----------------------------------------------------------------------------------------------
create table if not exists public.tw_house (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  name text not null default 'הבית',
  is_main boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index if not exists tw_house_one_main on public.tw_house (org_id) where is_main;

create table if not exists public.tw_house_member (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  house uuid not null,
  person uuid not null,
  primary key (house, person),
  foreign key (org_id, house) references public.tw_house(org_id, id) on delete cascade,
  foreign key (org_id, person) references public.tw_people(org_id, id) on delete cascade
);

create table if not exists public.tw_cfg (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  valid_from date not null,                                        -- the first period it applies to
  template text references public.tw_template(key) on delete set null,
  cycle text not null default '2weeks' check (cycle in ('week', '2weeks', 'month')),
  open_days int not null default 10 check (open_days between 1 and 60),
  close_days int not null default 5 check (close_days between 0 and 59),
  remind_hours int not null default 24 check (remind_hours between 0 and 240),   -- the reminder, hours before the hand-in closes
  publish_days int not null default 3 check (publish_days between 0 and 30),     -- publish at least this many days before the period
  draft boolean not null default true,                             -- true until the institution confirms its numbers
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (org_id, id),
  unique (org_id, valid_from)
);

create table if not exists public.tw_cfg_house (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  cfg uuid not null,
  house uuid not null,
  extra_week_cap int not null default 2 check (extra_week_cap between 0 and 50),     -- extra places a week, at most
  primary key (cfg, house),
  foreign key (org_id, cfg) references public.tw_cfg(org_id, id) on delete cascade,
  foreign key (org_id, house) references public.tw_house(org_id, id) on delete cascade
);

create table if not exists public.tw_cfg_shift (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  cfg uuid not null,
  house uuid not null,
  day_type text not null check (day_type in ('weekday', 'fri', 'sat', 'eve', 'holiday')),
  code text not null check (code ~ '^[A-Z][A-Z0-9]{0,3}$'),        -- M, A, N, W ... (the same code on every day type = the same kind)
  name text not null,
  starts time not null,
  ends time not null,
  end_day int not null default 0 check (end_day between 0 and 3),   -- 0 = the same day, 1 = the next day ...
  weight numeric(4, 2) not null default 1 check (weight > 0),       -- what it counts in the quota (the long weekend shift: 2)
  paid_hours numeric(5, 2) check (paid_hours is null or paid_hours >= 0),   -- null = the whole length (decided at the meeting)
  sort int not null default 0,
  unique (org_id, id),
  unique (cfg, house, day_type, code),
  foreign key (org_id, cfg) references public.tw_cfg(org_id, id) on delete cascade,
  foreign key (org_id, house) references public.tw_house(org_id, id) on delete cascade,
  check (end_day > 0 or ends > starts)
);

create table if not exists public.tw_cfg_need (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  shift uuid not null,
  dow int not null default -1 check (dow between -1 and 6),        -- -1 = every day of this type; 0..6 = only this weekday
  min_people int not null default 1 check (min_people between 0 and 50),
  extra int not null default 0 check (extra between 0 and 20),     -- places "when hands are free"
  primary key (shift, dow),
  foreign key (org_id, shift) references public.tw_cfg_shift(org_id, id) on delete cascade
);

create table if not exists public.tw_cfg_rule (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  cfg uuid not null,
  rule text not null references public.tw_rule_catalog(key),
  is_on boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  weight int,
  primary key (cfg, rule),
  foreign key (org_id, cfg) references public.tw_cfg(org_id, id) on delete cascade
);

create table if not exists public.tw_special_day (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  house uuid,                                                       -- null = the whole organisation
  day date not null,
  day_type text check (day_type in ('weekday', 'fri', 'sat', 'eve', 'holiday')),   -- null = the usual type, only the needs change
  note text,
  unique (org_id, id),
  foreign key (org_id, house) references public.tw_house(org_id, id) on delete cascade
);
create unique index if not exists tw_special_day_one on public.tw_special_day (org_id, coalesce(house, '00000000-0000-0000-0000-000000000000'::uuid), day);

create table if not exists public.tw_special_need (
  org_id uuid not null default public.current_org() references public.org(id) on delete cascade,
  special uuid not null,
  code text not null,
  min_people int not null default 1 check (min_people between 0 and 50),
  extra int not null default 0 check (extra between 0 and 20),
  primary key (special, code),
  foreign key (org_id, special) references public.tw_special_day(org_id, id) on delete cascade
);

create index if not exists tw_cfg_shift_cfg_idx on public.tw_cfg_shift (org_id, cfg, house, day_type);
create index if not exists tw_special_day_day_idx on public.tw_special_day (org_id, day);

-- 3. rights ---------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tw_rule_catalog', 'tw_holiday', 'tw_template'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['tw_house', 'tw_house_member', 'tw_cfg', 'tw_cfg_house', 'tw_cfg_shift', 'tw_cfg_need', 'tw_cfg_rule', 'tw_special_day', 'tw_special_need'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "org only" on public.%I', t);
    execute format('create policy "org only" on public.%I as restrictive for all to authenticated using (org_id = (select public.current_org())) with check (org_id = (select public.current_org()))', t);
    execute format('drop policy if exists "settings read" on public.%I', t);
    execute format('create policy "settings read" on public.%I for select to authenticated using ((select public.tw_member()))', t);
    execute format('drop policy if exists "settings admin" on public.%I', t);
    execute format('create policy "settings admin" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- 4. reading helpers ------------------------------------------------------------------------------------------------------
-- the settings version of a period (the newest one that already applies on its first day)
create or replace function public.tw_cfg_for(p_day date) returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.tw_cfg c where c.org_id = public.current_org() and c.valid_from <= p_day order by c.valid_from desc limit 1
$$;
-- the main house of the organisation
create or replace function public.tw_main_house() returns uuid language sql stable security definer set search_path = public as $$
  select h.id from public.tw_house h where h.org_id = public.current_org() and h.is_main limit 1
$$;
-- the type of a day: a special day of the house, then of the whole organisation, then Israel's holidays, then the weekday
create or replace function public.tw_day_type(p_day date, p_house uuid default null) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.day_type from public.tw_special_day s where s.org_id = public.current_org() and s.day = p_day and p_house is not null and s.house = p_house and s.day_type is not null),
    (select s.day_type from public.tw_special_day s where s.org_id = public.current_org() and s.day = p_day and s.house is null and s.day_type is not null),
    (select h.kind from public.tw_holiday h where h.day = p_day),
    case extract(dow from p_day)::int when 5 then 'fri' when 6 then 'sat' else 'weekday' end)
$$;
revoke all on function public.tw_cfg_for(date), public.tw_main_house(), public.tw_day_type(date, uuid) from public, anon;
grant execute on function public.tw_cfg_for(date), public.tw_main_house(), public.tw_day_type(date, uuid) to authenticated;

-- 5. writing helpers (admin) ----------------------------------------------------------------------------------------------
-- (inside: the organisation is given; from the site: current_org(), and only an admin)
create or replace function public.tw_house_ensure_main(p_org uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from public.tw_house where org_id = p_org and is_main;
  if h is null then insert into public.tw_house(org_id, name, is_main) values (p_org, 'הבית', true) returning id into h; end if;
  insert into public.tw_house_member(org_id, house, person) select p_org, h, p.id from public.tw_people p where p.org_id = p_org on conflict do nothing;
  return h;
end $$;
revoke all on function public.tw_house_ensure_main(uuid) from public, anon, authenticated;

-- a template's settings as a new version of an organisation (p_valid_from = the first period it applies to)
create or replace function public.tw_cfg_from_template(p_org uuid, p_template text, p_valid_from date, p_draft boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare t jsonb; c uuid; h uuid; s jsonb; n jsonb; sid uuid; r record; dt text;
begin
  select data into t from public.tw_template where key = p_template;
  if t is null then raise exception 'אין תבנית בשם %', p_template; end if;
  if exists (select 1 from public.tw_cfg where org_id = p_org and valid_from = p_valid_from) then raise exception 'כבר יש הגדרות שחלות מ-%', p_valid_from; end if;
  h := public.tw_house_ensure_main(p_org);
  insert into public.tw_cfg(org_id, valid_from, template, cycle, open_days, close_days, remind_hours, publish_days, draft, created_by)
    values (p_org, p_valid_from, p_template, coalesce(t->>'cycle', '2weeks'), coalesce((t->>'open_days')::int, 10), coalesce((t->>'close_days')::int, 5),
            coalesce((t->>'remind_hours')::int, 24), coalesce((t->>'publish_days')::int, 3), p_draft, auth.uid())
    returning id into c;
  insert into public.tw_cfg_house(org_id, cfg, house, extra_week_cap) values (p_org, c, h, coalesce((t->>'extra_week_cap')::int, 2));
  -- shifts: each entry lists the day types it is on ("days"), the same shift on each of them
  for s in select * from jsonb_array_elements(t->'shifts') loop
    for dt in select jsonb_array_elements_text(s->'days') loop
      insert into public.tw_cfg_shift(org_id, cfg, house, day_type, code, name, starts, ends, end_day, weight, paid_hours, sort)
        values (p_org, c, h, dt, s->>'code', s->>'name', (s->>'starts')::time, (s->>'ends')::time, coalesce((s->>'end_day')::int, 0),
                coalesce((s->>'weight')::numeric, 1), nullif(s->>'paid_hours', '')::numeric, coalesce((s->>'sort')::int, 0))
        returning id into sid;
      for n in select * from jsonb_array_elements(coalesce(s->'needs', '[{"dow":-1,"min":1}]'::jsonb)) loop
        insert into public.tw_cfg_need(org_id, shift, dow, min_people, extra)
          values (p_org, sid, coalesce((n->>'dow')::int, -1), coalesce((n->>'min')::int, 1), coalesce((n->>'extra')::int, 0));
      end loop;
    end loop;
  end loop;
  -- rules: every rule of the list that this template may show; on as the list says for this template; numbers from the template if given
  for r in select * from public.tw_rule_catalog k where k.only_templates is null or p_template = any(k.only_templates) loop
    insert into public.tw_cfg_rule(org_id, cfg, rule, is_on, params, weight)
      values (p_org, c, r.key, p_template = any(r.templates), r.params || coalesce(t->'rules'->r.key, '{}'::jsonb), r.weight);
  end loop;
  return c;
end $$;
revoke all on function public.tw_cfg_from_template(uuid, text, date, boolean) from public, anon, authenticated;

-- the admin: start the organisation's settings from a template (only when it has none yet; the setup flow, stage 3, will call it)
create or replace function public.tw_cfg_start(p_template text) returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid := public.current_org();
begin
  if o is null or not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.tw_cfg where org_id = o) then raise exception 'למוסד כבר יש הגדרות'; end if;
  return public.tw_cfg_from_template(o, p_template, date '2000-01-02', true);
end $$;

-- the admin: a new version from a period on, copied from the one in force then (later changes are made on the copy)
create or replace function public.tw_cfg_new_version(p_valid_from date) returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid := public.current_org(); src uuid; c uuid; r record; sid uuid;
begin
  if o is null or not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_valid_from is null then raise exception 'from which period?'; end if;
  if exists (select 1 from public.tw_cfg where org_id = o and valid_from = p_valid_from) then
    return (select id from public.tw_cfg where org_id = o and valid_from = p_valid_from);
  end if;
  src := public.tw_cfg_for(p_valid_from);
  if src is null then raise exception 'אין הגדרות להעתיק'; end if;
  insert into public.tw_cfg(org_id, valid_from, template, cycle, open_days, close_days, remind_hours, publish_days, draft, note, created_by)
    select o, p_valid_from, template, cycle, open_days, close_days, remind_hours, publish_days, draft, note, auth.uid() from public.tw_cfg where id = src
    returning id into c;
  insert into public.tw_cfg_house(org_id, cfg, house, extra_week_cap) select o, c, house, extra_week_cap from public.tw_cfg_house where cfg = src;
  insert into public.tw_cfg_rule(org_id, cfg, rule, is_on, params, weight) select o, c, rule, is_on, params, weight from public.tw_cfg_rule where cfg = src;
  for r in select * from public.tw_cfg_shift where cfg = src loop
    insert into public.tw_cfg_shift(org_id, cfg, house, day_type, code, name, starts, ends, end_day, weight, paid_hours, sort)
      values (o, c, r.house, r.day_type, r.code, r.name, r.starts, r.ends, r.end_day, r.weight, r.paid_hours, r.sort) returning id into sid;
    insert into public.tw_cfg_need(org_id, shift, dow, min_people, extra) select o, sid, dow, min_people, extra from public.tw_cfg_need where shift = r.id;
  end loop;
  return c;
end $$;
revoke all on function public.tw_cfg_start(text), public.tw_cfg_new_version(date) from public, anon;
grant execute on function public.tw_cfg_start(text), public.tw_cfg_new_version(date) to authenticated;

-- everything one screen needs, in one answer: the version of a day, its houses, shifts with needs, rules, special days, holidays
create or replace function public.tw_cfg_view(p_day date default current_date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o uuid := public.current_org(); c uuid;
begin
  if o is null or not public.tw_member() then return null; end if;
  c := public.tw_cfg_for(p_day);
  if c is null then return jsonb_build_object('cfg', null); end if;
  return jsonb_build_object(
    'cfg', (select to_jsonb(x) - 'org_id' - 'created_by' from public.tw_cfg x where x.id = c),
    'versions', (select jsonb_agg(jsonb_build_object('id', v.id, 'valid_from', v.valid_from, 'draft', v.draft) order by v.valid_from) from public.tw_cfg v where v.org_id = o),
    'houses', (select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'main', h.is_main,
                 'extra_week_cap', (select ch.extra_week_cap from public.tw_cfg_house ch where ch.cfg = c and ch.house = h.id),
                 'people', (select count(*) from public.tw_house_member m join public.tw_people p on p.id = m.person where m.house = h.id and p.active)) order by h.is_main desc, h.sort, h.name)
               from public.tw_house h where h.org_id = o),
    'shifts', (select jsonb_agg(jsonb_build_object('house', s.house, 'day_type', s.day_type, 'code', s.code, 'name', s.name,
                 'starts', to_char(s.starts, 'HH24:MI'), 'ends', to_char(s.ends, 'HH24:MI'), 'end_day', s.end_day, 'weight', s.weight, 'paid_hours', s.paid_hours,
                 'needs', (select jsonb_agg(jsonb_build_object('dow', n.dow, 'min', n.min_people, 'extra', n.extra) order by n.dow) from public.tw_cfg_need n where n.shift = s.id))
                 order by s.house, array_position(array['weekday', 'fri', 'sat', 'eve', 'holiday'], s.day_type), s.sort, s.starts)
               from public.tw_cfg_shift s where s.cfg = c),
    'rules', (select jsonb_agg(jsonb_build_object('key', k.key, 'kind', k.kind, 'label', k.label, 'on', r.is_on, 'params', r.params, 'weight', r.weight)
                 order by array_position(array['hard', 'soft', 'warn'], k.kind), k.sort)
              from public.tw_cfg_rule r join public.tw_rule_catalog k on k.key = r.rule where r.cfg = c),
    'special', (select jsonb_agg(jsonb_build_object('day', d.day, 'house', d.house, 'day_type', d.day_type, 'note', d.note,
                  'needs', (select jsonb_agg(jsonb_build_object('code', n.code, 'min', n.min_people, 'extra', n.extra)) from public.tw_special_need n where n.special = d.id)) order by d.day)
                from public.tw_special_day d where d.org_id = o and d.day >= p_day - 31),
    'holidays', (select jsonb_agg(jsonb_build_object('day', h.day, 'kind', h.kind, 'name', h.name) order by h.day)
                 from public.tw_holiday h where h.day between p_day - 7 and p_day + 400));
end $$;
revoke all on function public.tw_cfg_view(date) from public, anon;
grant execute on function public.tw_cfg_view(date) to authenticated;

-- a new organisation gets its main house at once; a new person joins the main house
create or replace function public.tw_org_new_house() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.tw_house_ensure_main(new.id); return null; end $$;
drop trigger if exists tw_org_new_house on public.org;
create trigger tw_org_new_house after insert on public.org for each row execute function public.tw_org_new_house();
create or replace function public.tw_person_main_house() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tw_house_member(org_id, house, person)
    select new.org_id, h.id, new.id from public.tw_house h where h.org_id = new.org_id and h.is_main on conflict do nothing;
  return null;
end $$;
drop trigger if exists tw_person_main_house on public.tw_people;
create trigger tw_person_main_house after insert on public.tw_people for each row execute function public.tw_person_main_house();
revoke all on function public.tw_org_new_house(), public.tw_person_main_house() from public, anon, authenticated;

-- 6. the fixed rule list (Albert 17.11; the final list is decided at the meeting of 19.11 — the numbers here are the proposal) -------
insert into public.tw_rule_catalog(key, kind, label, params, weight, templates, only_templates, sort) values
  ('rest_hours',        'hard', 'מנוחה מינימלית בין משמרות',                         '{"hours":7}',                 null, '{emergency,boarding,balancing}', null, 1),
  ('rest_after_long',   'hard', 'מנוחה אחרי משמרת ארוכה',                            '{"hours":8,"long_from":11}',  null, '{emergency,boarding,balancing}', null, 2),
  ('one_per_day',       'hard', 'משמרת אחת ביום',                                    '{}',                          null, '{emergency,boarding,balancing}', null, 3),
  ('max_days_row',      'hard', 'לכל היותר ימים ברצף',                               '{"days":11}',                 null, '{emergency,boarding,balancing}', null, 4),
  ('max_month',         'hard', 'לכל היותר משמרות בחודש',                            '{"shifts":27}',               null, '{emergency,boarding,balancing}', null, 5),
  ('max_nights_week',   'hard', 'לכל היותר לילות בשבוע',                             '{"nights":2}',                null, '{emergency,boarding,balancing}', null, 6),
  ('two_nights_people', 'hard', 'כמה עובדים בשבוע מקבלים את המספר המרבי של לילות',   '{"people":2}',                null, '{boarding,balancing}',           null, 7),
  ('week_flex',         'hard', 'גמישות שבועית במכסה',                               '{"over":1}',                  null, '{emergency,boarding,balancing}', null, 8),
  ('personal_min',      'soft', 'מינימום אישי',                                      '{"midweek":2,"nights":1,"weekends":4}', 5, '{emergency}',         null, 9),
  ('yes_before_can',    'soft', 'קודם "כן", ורק אחר כך "אפשרי"',                     '{}',                          8,    '{emergency,boarding,balancing}', null, 10),
  ('fixed_first',       'soft', 'משמרת קבועה מקבלת עדיפות',                          '{}',                          9,    '{emergency,boarding,balancing}', null, 11),
  ('balance_kinds',     'soft', 'איזון בין סוגי המשמרות',                            '{"gap":2}',                   4,    '{boarding,balancing}',           null, 12),
  ('fair_rotation',     'soft', 'סבב הוגן של לילות ושבתות',                          '{"periods":3}',               4,    '{emergency,boarding,balancing}', null, 13),
  ('day_night_balance', 'soft', 'איזון יום ולילה בין השבועות',                       '{}',                          3,    '{boarding,balancing}',           null, 14),
  ('options_factor',    'warn', 'בהגשה: לפחות פי X אופציות מהמכסה',                 '{"factor":2}',                null, '{boarding,balancing}',           null, 15),
  ('day_buddy',         'soft', 'עמיתה למשמרות יום',                                 '{}',                          3,    '{emergency}', '{emergency}', 16),
  ('one_of_weekends',   'hard', '"רק אחד מסופי השבוע האלה"',                         '{}',                          null, '{emergency}', '{emergency}', 17),
  ('service_mon_wed',   'hard', 'בנות שירות: שני עד רביעי',                          '{}',                          null, '{emergency}', '{emergency}', 18),
  ('weekend_oncall',    'hard', 'כוננות סוף שבוע',                                   '{}',                          null, '{emergency}', '{emergency}', 19)
on conflict (key) do update set kind = excluded.kind, label = excluded.label, params = excluded.params, weight = excluded.weight,
  templates = excluded.templates, only_templates = excluded.only_templates, sort = excluded.sort;

-- 7. Israel's holidays 2026–2028 (a holiday = like Saturday, its eve = like Friday). To check against the official calendar. -----
insert into public.tw_holiday(day, kind, name) values
  ('2026-04-01', 'eve', 'ערב פסח'), ('2026-04-02', 'holiday', 'פסח'), ('2026-04-07', 'eve', 'ערב שביעי של פסח'), ('2026-04-08', 'holiday', 'שביעי של פסח'),
  ('2026-04-21', 'eve', 'ערב יום העצמאות'), ('2026-04-22', 'holiday', 'יום העצמאות'), ('2026-05-21', 'eve', 'ערב שבועות'), ('2026-05-22', 'holiday', 'שבועות'),
  ('2026-09-11', 'eve', 'ערב ראש השנה'), ('2026-09-12', 'holiday', 'ראש השנה'), ('2026-09-13', 'holiday', 'ראש השנה'), ('2026-09-20', 'eve', 'ערב יום כיפור'),
  ('2026-09-21', 'holiday', 'יום כיפור'), ('2026-09-25', 'eve', 'ערב סוכות'), ('2026-09-26', 'holiday', 'סוכות'), ('2026-10-02', 'eve', 'ערב שמיני עצרת'),
  ('2026-10-03', 'holiday', 'שמיני עצרת'),
  ('2027-04-21', 'eve', 'ערב פסח'), ('2027-04-22', 'holiday', 'פסח'), ('2027-04-27', 'eve', 'ערב שביעי של פסח'), ('2027-04-28', 'holiday', 'שביעי של פסח'),
  ('2027-05-11', 'eve', 'ערב יום העצמאות'), ('2027-05-12', 'holiday', 'יום העצמאות'), ('2027-06-10', 'eve', 'ערב שבועות'), ('2027-06-11', 'holiday', 'שבועות'),
  ('2027-10-01', 'eve', 'ערב ראש השנה'), ('2027-10-02', 'holiday', 'ראש השנה'), ('2027-10-03', 'holiday', 'ראש השנה'), ('2027-10-10', 'eve', 'ערב יום כיפור'),
  ('2027-10-11', 'holiday', 'יום כיפור'), ('2027-10-15', 'eve', 'ערב סוכות'), ('2027-10-16', 'holiday', 'סוכות'), ('2027-10-22', 'eve', 'ערב שמיני עצרת'),
  ('2027-10-23', 'holiday', 'שמיני עצרת'),
  ('2028-04-10', 'eve', 'ערב פסח'), ('2028-04-11', 'holiday', 'פסח'), ('2028-04-16', 'eve', 'ערב שביעי של פסח'), ('2028-04-17', 'holiday', 'שביעי של פסח'),
  ('2028-05-01', 'eve', 'ערב יום העצמאות'), ('2028-05-02', 'holiday', 'יום העצמאות'), ('2028-05-30', 'eve', 'ערב שבועות'), ('2028-05-31', 'holiday', 'שבועות'),
  ('2028-09-20', 'eve', 'ערב ראש השנה'), ('2028-09-21', 'holiday', 'ראש השנה'), ('2028-09-22', 'holiday', 'ראש השנה'), ('2028-09-29', 'eve', 'ערב יום כיפור'),
  ('2028-09-30', 'holiday', 'יום כיפור'), ('2028-10-04', 'eve', 'ערב סוכות'), ('2028-10-05', 'holiday', 'סוכות'), ('2028-10-11', 'eve', 'ערב שמיני עצרת'),
  ('2028-10-12', 'holiday', 'שמיני עצרת')
on conflict (day) do update set kind = excluded.kind, name = excluded.name;

-- 8. the three templates (drafts; the balancing home = the pilot, from the institution's form; to correct after 19.11) -------
insert into public.tw_template(key, name, about, sort, data) values
('balancing', 'בית מאזן', 'סידור לשבועיים. בוקר, צהריים ולילה בימי חול; בשישי בוקר קצר ומשמרת סוף שבוע ארוכה עד מוצאי שבת; כל עובד פותח פי 2 אופציות, ומישהו מהצוות בונה.', 1,
 '{"cycle":"2weeks","open_days":10,"close_days":5,"remind_hours":24,"publish_days":3,"extra_week_cap":2,
   "shifts":[
     {"code":"M","name":"בוקר","days":["weekday"],"starts":"07:30","ends":"15:30","sort":1,"needs":[{"dow":-1,"min":2,"extra":1},{"dow":2,"min":3,"extra":0}]},
     {"code":"A","name":"צהריים","days":["weekday"],"starts":"15:00","ends":"23:00","sort":2,"needs":[{"dow":-1,"min":2,"extra":1}]},
     {"code":"N","name":"לילה","days":["weekday"],"starts":"22:30","ends":"08:00","end_day":1,"sort":3,"needs":[{"dow":-1,"min":2}]},
     {"code":"M","name":"בוקר","days":["fri","eve"],"starts":"07:30","ends":"14:30","sort":1,"needs":[{"dow":-1,"min":1}]},
     {"code":"W","name":"סוף שבוע","days":["fri","eve"],"starts":"14:00","ends":"20:30","end_day":1,"weight":2,"sort":2,"needs":[{"dow":-1,"min":2}]},
     {"code":"N","name":"לילה","days":["sat","holiday"],"starts":"20:30","ends":"08:00","end_day":1,"sort":3,"needs":[{"dow":-1,"min":2}]}
   ]}'::jsonb),
('boarding', 'פנימייה / הוסטל', 'כמו בית מאזן: סידור לשבועיים, אופציות פי 2, ומישהו מהצוות בונה. טיוטה: השעות והמספרים ישתנו לפי המוסד.', 2,
 '{"cycle":"2weeks","open_days":10,"close_days":5,"remind_hours":24,"publish_days":3,"extra_week_cap":2,
   "shifts":[
     {"code":"M","name":"בוקר","days":["weekday"],"starts":"07:00","ends":"15:00","sort":1,"needs":[{"dow":-1,"min":2,"extra":1}]},
     {"code":"A","name":"צהריים","days":["weekday"],"starts":"14:30","ends":"22:30","sort":2,"needs":[{"dow":-1,"min":2,"extra":1}]},
     {"code":"N","name":"לילה","days":["weekday"],"starts":"22:00","ends":"07:30","end_day":1,"sort":3,"needs":[{"dow":-1,"min":1}]},
     {"code":"M","name":"בוקר","days":["fri","eve"],"starts":"07:00","ends":"14:00","sort":1,"needs":[{"dow":-1,"min":1}]},
     {"code":"W","name":"סוף שבוע","days":["fri","eve"],"starts":"13:30","ends":"21:00","end_day":1,"weight":2,"sort":2,"needs":[{"dow":-1,"min":2}]},
     {"code":"N","name":"לילה","days":["sat","holiday"],"starts":"21:00","ends":"07:30","end_day":1,"sort":3,"needs":[{"dow":-1,"min":1}]}
   ]}'::jsonb),
('emergency', 'מרכז חירום', 'סידור חודשי. בוקר, צהריים ולילה כל יום, וסופ"ש ארוך משישי בצהריים עד שבת בערב; אחמ"ש בכל משמרת; רכזת בונה. טיוטה לפי הרמזור.', 3,
 '{"cycle":"month","open_days":20,"close_days":10,"remind_hours":48,"publish_days":5,"extra_week_cap":3,
   "rules":{"rest_hours":{"hours":7}},
   "shifts":[
     {"code":"M","name":"בוקר","days":["weekday","fri","sat","eve","holiday"],"starts":"07:00","ends":"15:00","sort":1,"needs":[{"dow":-1,"min":3,"extra":1}]},
     {"code":"A","name":"צהריים","days":["weekday"],"starts":"14:00","ends":"22:00","sort":2,"needs":[{"dow":-1,"min":3,"extra":1}]},
     {"code":"N","name":"לילה","days":["weekday","fri","sat","eve","holiday"],"starts":"22:00","ends":"08:00","end_day":1,"sort":4,"needs":[{"dow":-1,"min":2}]},
     {"code":"L","name":"סופ\"ש ארוך","days":["fri","eve"],"starts":"14:00","ends":"22:00","end_day":1,"weight":1,"sort":3,"needs":[{"dow":-1,"min":2}]},
     {"code":"A","name":"צהריים","days":["sat","holiday"],"starts":"14:00","ends":"22:00","sort":2,"needs":[{"dow":-1,"min":1}]}
   ]}'::jsonb)
on conflict (key) do update set name = excluded.name, about = excluded.about, data = excluded.data, sort = excluded.sort;

-- 9. the organisations that are here: a main house, and the pilot's settings (balancing home) as a draft from the start ------
do $$
declare g record;
begin
  for g in select id from public.org loop
    perform public.tw_house_ensure_main(g.id);
    if not exists (select 1 from public.tw_cfg where org_id = g.id) then
      perform public.tw_cfg_from_template(g.id, 'balancing', date '2000-01-02', true);
    end if;
  end loop;
end $$;

-- 10. the 12-month purge keeps the settings (they are not personal); nothing to add there.
insert into public.schema_migrations(version) values ('scheduling-v83') on conflict (version) do nothing;
select 'scheduling_v83' as part, 'ok' as result,
       (select count(*) from public.tw_house where is_main) as main_houses,
       (select count(*) from public.tw_cfg) as settings_versions,
       (select count(*) from public.tw_cfg_shift) as shifts,
       (select count(*) from public.tw_rule_catalog) as rules_in_list,
       (select count(*) from public.tw_holiday) as holidays,
       (select count(*) from public.tw_template) as templates;
