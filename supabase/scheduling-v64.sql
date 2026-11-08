-- scheduling v64 (2026-11-08): the secretary's round (Alex card 59b4f012, Guy's answers of 8 Nov). Run once on each project, TEST first, AFTER scheduling-v63.sql. Safe to run again.
--   * the kids' screen: the secretary has all of the admin's "מסך הילדים" card — what the screen shows, the birthdays (already since v63), and connecting screens
--     (a code for a new screen, the list, disconnecting). Nothing else of the admin.
--   * the contact page: each contact is a mentor, a volunteer or both (roles). Everybody who is there now becomes a mentor (Guy 8 Nov).
--   * a new "how often" for mentoring and volunteering: every Sunday to Thursday (sun_thu) — one series, edited and removed as the others
--     ("רק הפעם" / "מהפעם הזאת והלאה"); like them it does not come on a holiday or its eve.

do $$ begin
  if to_regprocedure('public.tv_display_save(text[])') is null then raise exception 'scheduling-v63.sql first'; end if;
end $$;

-- ---------- the kids' screen: the secretary too ----------
create or replace function public.tv_display_save(p_off text[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not (public.is_admin() or public.is_secretary()) then raise exception 'not allowed'; end if;
  if coalesce(array_length(p_off, 1), 0) > 60 then raise exception 'too many'; end if;
  v := jsonb_build_object('off', to_jsonb(coalesce((select array_agg(distinct x order by x) from unnest(p_off) x where x ~ '^[a-z_]{1,30}$'), '{}'::text[])));
  insert into public.sched_settings (key, value) values ('tv_display', v)
    on conflict (key) do update set value = excluded.value;
  return v;
end $$;
revoke all on function public.tv_display_save(text[]) from public, anon;
grant execute on function public.tv_display_save(text[]) to authenticated;

create or replace function public.tv_code_new() returns boolean language plpgsql security definer set search_path = public as $$
declare code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if not (public.is_admin() or public.is_coordinator() or public.is_secretary()) or public.my_staff_id() is null then raise exception 'not allowed'; end if;
  delete from public.tv_codes where expires_at < now();
  insert into public.tv_codes (code_hash, expires_at, created_by) values (md5('tv:' || code), now() + interval '15 minutes', public.my_staff_id());
  perform public.tell_staff(public.my_staff_id(), 'קוד לחיבור מסך הילדים', 'הקוד לחיבור מסך הילדים: ' || code || '. מקלידים אותו במסך פעם אחת. הקוד תקף ל-15 דקות.', 'tv');
  return true;
end $$;

create or replace function public.tv_revoke(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_coordinator() or public.is_secretary()) then raise exception 'not allowed'; end if;
  update public.tv_devices set active = false where id = p_id;
  insert into public.audit_log (by_staff, what, detail) values (public.my_staff_id(), 'tv_revoke', jsonb_build_object('device', p_id));
end $$;

drop policy if exists "admin sees screens" on public.tv_devices;
create policy "admin sees screens" on public.tv_devices for select to authenticated using (public.is_coordinator() or public.is_secretary());

-- ---------- the contacts: mentor, volunteer or both ----------
alter table public.tt_contact add column if not exists roles text[] not null default '{mentor}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tt_contact_roles_ok') then
    alter table public.tt_contact add constraint tt_contact_roles_ok check (roles <@ array['mentor', 'volunteer']::text[] and cardinality(roles) between 1 and 2);
  end if;
end $$;

-- ---------- every Sunday to Thursday ----------
alter table public.tt_event add column if not exists sun_thu boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tt_event_sun_thu_alone') then
    alter table public.tt_event add constraint tt_event_sun_thu_alone check (not (sun_thu and (every_weeks is not null or monthly_nth is not null)));
  end if;
end $$;

create or replace function public.tt_occurrences(p_from date, p_to date) returns table (ev_id uuid, occ date) language sql stable security definer set search_path = public as $$
  select e.id, g.d::date
  from public.tt_event e
  cross join lateral generate_series(greatest(p_from, e.day)::timestamp, least(p_to, coalesce(e.until_day, p_to))::timestamp, interval '1 day') g(d)
  where case when e.sun_thu then extract(dow from g.d) between 0 and 4
             when e.every_weeks is not null then (g.d::date - e.day) % (7 * e.every_weeks) = 0
             when e.monthly_nth is not null then extract(dow from g.d) = extract(dow from e.day) and ceil(extract(day from g.d) / 7.0) = e.monthly_nth
             else g.d::date = e.day end
    and not exists (select 1 from public.tt_event_skip k where k.event_id = e.id and k.day = g.d::date)
    and (e.kind <> 'mentor' or exists (select 1 from public.roster r where r.id = e.child_id))
    and ((e.every_weeks is null and e.monthly_nth is null and not e.sun_thu)
         or not exists (select 1 from public.special_days s where s.day = g.d::date and s.kind in ('holiday', 'eve')))
$$;
revoke all on function public.tt_occurrences(date, date) from public, anon, authenticated;

create or replace function public.tt_events_between(p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_personal() or public.is_staff()) then raise exception 'not allowed'; end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'range'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'occ', o.occ, 'kind', e.kind, 't', to_char(e.start_time, 'HH24:MI'), 'end', to_char(e.end_time, 'HH24:MI'), 'i', e.icon,
                                                       'person', e.person_name, 'contact_id', e.contact_id, 'child_id', e.child_id, 'child', public.tt_child_label(e.child_id),
                                                       'activity', e.activity, 'group', e.group_kind, 'group_text', e.group_text, 'day', e.day,
                                                       'every_weeks', e.every_weeks, 'monthly_nth', e.monthly_nth, 'sun_thu', e.sun_thu, 'until_day', e.until_day)
                                    order by o.occ, e.start_time, e.kind, e.person_name), '[]')
          from public.tt_occurrences(p_from, p_to) o join public.tt_event e on e.id = o.ev_id);
end $$;
revoke all on function public.tt_events_between(date, date) from public, anon;
grant execute on function public.tt_events_between(date, date) to authenticated;

create or replace function public.tt_event_save(p_id uuid, p_scope text, p_day date, p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare
  old public.tt_event; r public.tt_event; who text; new_id uuid; series boolean; me uuid := public.my_staff_id();
begin
  if not public.can_edit_timetable() then raise exception 'not allowed'; end if;
  r := jsonb_populate_record(null::public.tt_event, p);
  r.sun_thu := coalesce(r.sun_thu, false);
  if r.sun_thu then r.every_weeks := null; r.monthly_nth := null; end if;
  select c.name into who from public.tt_contact c where c.id = r.contact_id;
  if who is null then raise exception 'contact'; end if;
  r.person_name := who;
  if r.kind = 'volunteer' then r.child_id := null; else r.activity := null; r.group_kind := null; r.group_text := null; end if;
  if r.group_kind is distinct from 'other' then r.group_text := null; end if;
  if p_id is null then
    insert into public.tt_event (kind, child_id, activity, contact_id, person_name, icon, group_kind, group_text, day, start_time, end_time, every_weeks, monthly_nth, sun_thu, series_id, created_by, updated_by)
    values (r.kind, r.child_id, r.activity, r.contact_id, r.person_name, coalesce(r.icon, 'other'), r.group_kind, r.group_text, r.day, r.start_time, r.end_time, r.every_weeks, r.monthly_nth, r.sun_thu,
            case when r.every_weeks is not null or r.monthly_nth is not null or r.sun_thu then gen_random_uuid() end, me, me)
    returning id into new_id;
    return new_id;
  end if;
  select * into old from public.tt_event where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  series := old.every_weeks is not null or old.monthly_nth is not null or old.sun_thu;
  if not series or p_scope = 'all' or (p_scope = 'on' and p_day <= old.day) then
    update public.tt_event set kind = r.kind, child_id = r.child_id, activity = r.activity, contact_id = r.contact_id, person_name = r.person_name, icon = coalesce(r.icon, 'other'),
      group_kind = r.group_kind, group_text = r.group_text, day = r.day, start_time = r.start_time, end_time = r.end_time, every_weeks = r.every_weeks, monthly_nth = r.monthly_nth, sun_thu = r.sun_thu,
      series_id = case when r.every_weeks is not null or r.monthly_nth is not null or r.sun_thu then coalesce(old.series_id, gen_random_uuid()) end, updated_by = me, updated_at = now()
    where id = p_id;
    return p_id;
  end if;
  if p_scope = 'one' then
    insert into public.tt_event_skip (event_id, day) values (p_id, p_day) on conflict do nothing;
    insert into public.tt_event (kind, child_id, activity, contact_id, person_name, icon, group_kind, group_text, day, start_time, end_time, series_id, orig_day, created_by, updated_by)
    values (r.kind, r.child_id, r.activity, r.contact_id, r.person_name, coalesce(r.icon, 'other'), r.group_kind, r.group_text, r.day, r.start_time, r.end_time, coalesce(old.series_id, old.id), p_day, me, me)
    returning id into new_id;
    return new_id;
  end if;
  if p_scope <> 'on' then raise exception 'scope'; end if;
  update public.tt_event set until_day = p_day - 1, updated_by = me, updated_at = now() where id = p_id;
  insert into public.tt_event (kind, child_id, activity, contact_id, person_name, icon, group_kind, group_text, day, start_time, end_time, every_weeks, monthly_nth, sun_thu, until_day, series_id, created_by, updated_by)
  values (r.kind, r.child_id, r.activity, r.contact_id, r.person_name, coalesce(r.icon, 'other'), r.group_kind, r.group_text, r.day, r.start_time, r.end_time, r.every_weeks, r.monthly_nth, r.sun_thu, old.until_day, coalesce(old.series_id, old.id), me, me)
  returning id into new_id;
  insert into public.tt_event_skip (event_id, day) select new_id, k.day from public.tt_event_skip k where k.event_id = p_id and k.day >= p_day;          -- (what was cancelled ahead stays cancelled)
  return new_id;
end $$;
revoke all on function public.tt_event_save(uuid, text, date, jsonb) from public, anon;
grant execute on function public.tt_event_save(uuid, text, date, jsonb) to authenticated;

create or replace function public.tt_event_remove(p_id uuid, p_scope text, p_day date) returns void language plpgsql security definer set search_path = public as $$
declare old public.tt_event;
begin
  if not public.can_edit_timetable() then raise exception 'not allowed'; end if;
  select * into old from public.tt_event where id = p_id for update;
  if not found then return; end if;
  if old.every_weeks is null and old.monthly_nth is null and not old.sun_thu then delete from public.tt_event where id = p_id; return; end if;
  if p_scope = 'one' then insert into public.tt_event_skip (event_id, day) values (p_id, p_day) on conflict do nothing; return; end if;
  if p_scope <> 'on' then raise exception 'scope'; end if;
  delete from public.tt_event c where c.series_id = coalesce(old.series_id, old.id) and c.orig_day >= p_day;          -- (the single changes ahead go with it)
  if p_day <= old.day then delete from public.tt_event where id = p_id;
  else update public.tt_event set until_day = p_day - 1, updated_by = public.my_staff_id(), updated_at = now() where id = p_id; end if;
end $$;
revoke all on function public.tt_event_remove(uuid, text, date) from public, anon;
grant execute on function public.tt_event_remove(uuid, text, date) to authenticated;

create or replace function public.tt_contact_remove(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jerusalem')::date; ahead jsonb;
begin
  if not public.can_edit_timetable() then raise exception 'not allowed'; end if;
  select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'day', e.day, 't', to_char(e.start_time, 'HH24:MI'), 'child', public.tt_child_label(e.child_id), 'activity', e.activity,
                                      'every_weeks', e.every_weeks, 'monthly_nth', e.monthly_nth, 'sun_thu', e.sun_thu) order by e.day, e.start_time) into ahead
  from public.tt_event e
  where e.contact_id = p_id and ((e.every_weeks is null and e.monthly_nth is null and not e.sun_thu and e.day >= today)
                                 or ((e.every_weeks is not null or e.monthly_nth is not null or e.sun_thu) and (e.until_day is null or e.until_day >= today)));
  if ahead is not null then return jsonb_build_object('ok', false, 'ahead', ahead); end if;
  delete from public.tt_contact where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.tt_contact_remove(uuid) from public, anon;
grant execute on function public.tt_contact_remove(uuid) to authenticated;

select 'scheduling_v64' as part, 'ok' as result,
  (select count(*) from public.tt_contact) as contacts,
  (select count(*) from public.tt_event where sun_thu) as sun_thu_events;
