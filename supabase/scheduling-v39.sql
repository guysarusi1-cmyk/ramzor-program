-- scheduling v39 (2026-10-26): "תבדקו איתי", the names on the kids' TV, and the kids' duty board (Guy). Run once, after v38, on each project. Safe to run again. Changes no data.
--   * the two questions at the end of the preferences (staying until 16:00, going on from Saturday night until 11:00) get a third answer,
--     "תבדקו איתי": for the engine it is "no" (extend_morning / pull_to_sunday stay false), and the coordinator sees it and asks.
--   * the kids' TV writes everybody as the first name and the first letter of the family name ("שני מ'"), not the first name alone.
alter table public.prefs_consent add column if not exists extend_ask boolean not null default false;
alter table public.prefs_consent add column if not exists pull_ask boolean not null default false;

create or replace function public.tv_label(sid uuid) returns text language sql stable security definer set search_path = public as $$
  with me as (select display_name, split_part(trim(display_name), ' ', 1) f, left(split_part(trim(display_name), ' ', 2), 1) l from public.staff where id = sid)
  select case when me.l <> '' then me.f || ' ' || me.l || '''' else me.f end from me
$$;
revoke all on function public.tv_label(uuid) from public, anon;

-- ---- the kids' duty board (Guy 2026-10-26): the kids from age 5 share all the duties every week; on the night between Saturday and Sunday the
--      week is drawn again, and every kid goes through all the duties before doing one again. The ahmash control changes the duties and who does what.
create table if not exists public.duties (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 80),
  kids       int  not null default 1 check (kids between 1 and 10),          -- how many kids it takes (the extras, when there are more kids, are added)
  sort       int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.duty_assign (
  week     date not null,                                                     -- the Sunday of the week
  child_id text not null,
  duty_id  uuid not null references public.duties(id) on delete cascade,
  by_hand  boolean not null default false,
  primary key (week, child_id)
);
alter table public.duties enable row level security;
alter table public.duty_assign enable row level security;
drop policy if exists "control duties" on public.duties;
create policy "control duties" on public.duties for all to authenticated using (public.can_control()) with check (public.can_control());
drop policy if exists "control duty assign" on public.duty_assign;
create policy "control duty assign" on public.duty_assign for all to authenticated using (public.can_control()) with check (public.can_control());
grant select, insert, update, delete on public.duties, public.duty_assign to authenticated;

-- draws one week: the places of every duty (one each first, then up to its number; more kids than places: the extras are added in turn),
-- and every kid gets, of the duties with room, one she did the fewest times (so she goes through all of them before doing one again)
create or replace function public.duty_shuffle_do(p_week date, p_force boolean) returns int language plpgsql security definer set search_path = public as $$
declare d record; nk int; total int; extra int; added int; best uuid; kid text; n int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('duty_shuffle'));
  if exists (select 1 from public.duty_assign where week = p_week) then
    if not p_force then return 0; end if;
    delete from public.duty_assign where week = p_week;
  end if;
  create temp table if not exists duty_kids (child_id text primary key, r float) on commit drop; delete from duty_kids where true;
  insert into duty_kids select id, random() from public.roster where replace(substring(coalesce(age, '') from '[0-9]+(?:[.,][0-9]+)?'), ',', '.')::numeric >= 5;          -- (the age as written: "4.5" is 4.5, not 45)
  select count(*) into nk from duty_kids;
  select coalesce(sum(kids), 0) into total from public.duties where active;
  if nk = 0 or total = 0 then return 0; end if;
  create temp table if not exists duty_cap (duty_id uuid primary key, cap int, sort int, kids int, taken int) on commit drop; delete from duty_cap where true;
  insert into duty_cap select id, case when nk >= total then kids else 0 end, sort, kids, 0 from public.duties where active;
  if nk >= total then
    extra := nk - total;
    while extra > 0 loop
      for d in select duty_id from duty_cap order by sort, duty_id loop exit when extra = 0; update duty_cap set cap = cap + 1 where duty_id = d.duty_id; extra := extra - 1; end loop;
    end loop;
  else
    extra := nk;
    for d in select duty_id from duty_cap order by sort, duty_id loop exit when extra = 0; update duty_cap set cap = 1 where duty_id = d.duty_id; extra := extra - 1; end loop;
    loop
      added := 0;
      for d in select duty_id from duty_cap where cap < kids order by sort, duty_id loop exit when extra = 0; update duty_cap set cap = cap + 1 where duty_id = d.duty_id; extra := extra - 1; added := added + 1; end loop;
      exit when extra = 0 or added = 0;
    end loop;
  end if;
  -- how many times each kid did each duty before this week; her "round" is the fewest of them: the duties at that number are the new ones for her
  create temp table if not exists duty_cnt (child_id text, duty_id uuid, cnt int, primary key (child_id, duty_id)) on commit drop; delete from duty_cnt where true;
  insert into duty_cnt select k.child_id, c.duty_id, (select count(*) from public.duty_assign a where a.child_id = k.child_id and a.duty_id = c.duty_id and a.week < p_week) from duty_kids k, duty_cap c;
  loop          -- the kid with the fewest new duties that still have room goes first; she gets a new one if there is (the one with the most room left)
    select x.child_id into kid from (
      select k.child_id, k.r, (select count(*) from duty_cnt q join duty_cap c on c.duty_id = q.duty_id where q.child_id = k.child_id and c.taken < c.cap
                                 and q.cnt = (select min(z.cnt) from duty_cnt z where z.child_id = k.child_id)) opts
      from duty_kids k where not exists (select 1 from public.duty_assign a where a.week = p_week and a.child_id = k.child_id)) x order by x.opts, x.r limit 1;
    exit when kid is null;
    select c.duty_id into best from duty_cap c join duty_cnt q on q.duty_id = c.duty_id and q.child_id = kid where c.taken < c.cap
      order by q.cnt, (c.cap - c.taken) desc, random() limit 1;
    exit when best is null;
    insert into public.duty_assign (week, child_id, duty_id) values (p_week, kid, best);
    update duty_cap set taken = taken + 1 where duty_id = best; n := n + 1; kid := null;
  end loop;
  return n;
end $$;
revoke all on function public.duty_shuffle_do(date, boolean) from public, anon, authenticated;
-- the ahmash control: draw this week again
create or replace function public.duty_shuffle(p_week date) returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.can_control() then raise exception 'not allowed'; end if;
  return public.duty_shuffle_do(p_week, true);
end $$;
revoke all on function public.duty_shuffle(date) from public, anon;
grant execute on function public.duty_shuffle(date) to authenticated;
-- the board of this week (Israel time), drawn the first time somebody asks in a new week: for the kids' TV (not signed in) and the staff
create or replace function public.duty_board() returns jsonb language plpgsql security definer set search_path = public as $$
declare t date := (now() at time zone 'Asia/Jerusalem')::date; w date := t - extract(dow from t)::int;
begin
  perform public.duty_shuffle_do(w, false);
  return jsonb_build_object('week', w, 'duties', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kids', d.kids,
           'children', coalesce((select jsonb_agg(a.child_id order by a.child_id) from public.duty_assign a where a.week = w and a.duty_id = d.id), '[]'::jsonb)) order by d.sort, d.name)
         from public.duties d where d.active), '[]'::jsonb));
end $$;
revoke all on function public.duty_board() from public;
grant execute on function public.duty_board() to anon, authenticated;

select 'scheduling_v39' as part, 'ok' as result;
