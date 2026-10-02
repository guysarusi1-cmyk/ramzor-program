-- ================================================================
-- Test project setup for "תכנית הרמזור" — paste ONCE into the SQL Editor of the NEW test project.
-- Builds the same tables / permissions / realtime as the live project, and loads FICTIONAL children.
-- ================================================================

-- ---------- tables ----------
create table roster (
  id            text primary key,
  first_name    text not null,
  last_initial  text not null default '',
  age           text,
  sw_name       text,
  sw_phone      text,
  therapy_plan  jsonb
);

create table child_state (
  child_id         text primary key,
  stars            int  not null default 0,
  moon_steps       int  not null default 0,
  moon_gifts       int  not null default 0,
  mercury_steps    int  not null default 0,
  moon_day_date    text,
  moon_day_status  text,
  last_light       text,
  last_light_ts    bigint not null default 0
);

create table mini_lists (
  key    text primary key,
  items  jsonb not null default '[]'::jsonb
);

create table feedback_events (
  id          uuid primary key default gen_random_uuid(),
  child_id    text,
  type        text,
  message     text,
  created_at  timestamptz not null default now()
);

create table bonus_revocations (
  id          uuid primary key default gen_random_uuid(),
  child_id    text not null,
  bonus_id    text not null,
  revoked_at  timestamptz not null default now()
);

-- ---------- permissions: everyone can read (the kids' TV screen has no login), only logged-in staff can write ----------
alter table roster            enable row level security;
alter table child_state       enable row level security;
alter table mini_lists        enable row level security;
alter table feedback_events   enable row level security;
alter table bonus_revocations enable row level security;

create policy "public read"   on roster            for select using (true);
create policy "public read"   on child_state       for select using (true);
create policy "public read"   on mini_lists        for select using (true);
create policy "public read"   on feedback_events   for select using (true);
create policy "public read"   on bonus_revocations for select using (true);

create policy "staff write"   on roster            for all to authenticated using (true) with check (true);
create policy "staff write"   on child_state       for all to authenticated using (true) with check (true);
create policy "staff write"   on mini_lists        for all to authenticated using (true) with check (true);
create policy "staff insert"  on feedback_events   for insert to authenticated with check (true);
create policy "staff insert"  on bonus_revocations for insert to authenticated with check (true);

grant select on roster, child_state, mini_lists, feedback_events, bonus_revocations to anon, authenticated;
grant insert, update, delete on roster, child_state, mini_lists to authenticated;
grant insert on feedback_events, bonus_revocations to authenticated;

-- ---------- live updates for the TV screen ----------
alter publication supabase_realtime add table feedback_events, bonus_revocations;

-- ---------- FICTIONAL children (same ids c1..c14 as the live site, so every ship/avatar mapping behaves the same) ----------
insert into roster (id, first_name, last_initial, age, sw_name, sw_phone) values
  ('c1',  'נועם',  'א', '6.5', 'דנה',   '972500000001'),
  ('c2',  'מאיה',  'ב', '7',   'רונית', '972500000002'),
  ('c3',  'יובל',  'ג', '5.5', 'דנה',   '972500000001'),
  ('c4',  'שירה',  'ד', '5',   'דנה',   '972500000001'),
  ('c5',  'איתי',  'ה', '3.5', 'דנה',   '972500000001'),
  ('c6',  'תמר',   '',  '3',   'דנה',   '972500000001'),
  ('c7',  'אורי',  'ו', '6',   'רונית', '972500000002'),
  ('c8',  'לילך',  'ז', '3.5', 'רונית', '972500000002'),
  ('c9',  'גיל',   'ח', '3.5', 'רונית', '972500000002'),
  ('c10', 'רוני',  'ט', '7',   'רונית', '972500000002'),
  ('c11', 'דור',   'י', '6',   'רונית', '972500000002'),
  ('c12', 'ענבר',  'כ', '5',   'רונית', '972500000002'),
  ('c13', 'אלון',  'ל', '3.5', 'דנה',   '972500000001'),
  ('c14', 'הילה',  'מ', '5',   'רונית', '972500000002');

-- everyone already finished the moon journey; a spread of Mercury steps incl. a crowded start position
insert into child_state (child_id, moon_steps, mercury_steps, stars) values
  ('c1', 7, 0, 0), ('c2', 7, 3, 2), ('c3', 7, 0, 0), ('c4', 7, 0, 1), ('c5', 7, 0, 0),
  ('c6', 7, 0, 0), ('c7', 7, 6, 0), ('c8', 7, 0, 0), ('c9', 7, 0, 0), ('c10', 7, 1, 4),
  ('c11', 7, 0, 0), ('c12', 7, 0, 0), ('c13', 7, 7, 0), ('c14', 7, 1, 0);

-- ---------- lists: bonuses (with their days / hours) and the duty roster ----------
insert into mini_lists (key, items) values
 ('bonusesDaily', '[
    {"id":"bd1","text":"סבב מיץ פטל — רק למי שעשה תורנות חצר","startTime":"13:30","endTime":"15:30"},
    {"id":"bd2","text":"בארוחת ארבע — משהו מתוק קטן","startTime":"15:30","endTime":"17:00"},
    {"id":"bd3","text":"בפארק (לפני זמן מקלחות) — שלוקים בקיץ / משהו טעים בחורף","startTime":"17:00","endTime":"18:00"},
    {"id":"bd4","text":"אחרי ארוחת הערב — תה מרגיע ועדין (נענע/קמומיל)","startTime":"18:00","endTime":"20:00"},
    {"id":"bd5","text":"אחרי ארוחת הערב — זמן טלוויזיה (לבדוק אם מתקיים היום)","startTime":"18:00","endTime":"20:00"}
  ]'::jsonb),
 ('bonusesWeekly', '[
    {"id":"bw1","text":"תורנויות מהנות — לפי לוח התורנויות המהנות"},
    {"id":"bw2","text":"בשישי — אבא/אמא של שבת (נקבע באסיף שישי צהריים)","days":[5]},
    {"id":"bw3","text":"בשישי — עוזרי אפייה (אם יש, נקבע באסיף צהריים)","days":[5]}
  ]'::jsonb),
 ('dutyRoster', '[]'::jsonb);
