-- ================================================================
-- Scheduling, part 17 — run in the SQL Editor after scheduling-v16.sql. Safe to run again.
--   * a "welcome" e-mail to a person whose sign-in the coordinator just created: what the system is, the address, and how to enter
--     (sent by the hourly job, like the other e-mails). The address is the one of the site the coordinator works in.
-- ================================================================
create or replace function public.welcome_staff(p_staff uuid, p_url text) returns boolean language plpgsql security definer set search_path = public as $$
declare who text; mail text; url text := regexp_replace(coalesce(p_url, ''), '[#?].*$', '');
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  if url !~ '^https://[a-z0-9.-]+(/[A-Za-z0-9._/-]*)?$' then url := ''; end if;
  select s.display_name, p.email into who, mail from public.staff s join public.staff_private p on p.staff_id = s.id where s.id = p_staff and s.active;
  if mail is null then return false; end if;
  if exists (select 1 from public.email_outbox where kind = 'welcome-' || p_staff::text and error is null) then return false; end if;          -- (once per person)
  insert into public.email_outbox (to_email, subject, body, kind) values (mail, 'ברוכים הבאים למערכת של מרכז החירום',
    'שלום ' || split_part(who, ' ', 1) || ',' || E'\n\n' ||
    'שמחים לבשר שנפתח לך חשבון אישי במערכת של מרכז החירום: פורטל המשמרות ותכנית הרמזור, בכניסה אחת.' || E'\n\n' ||
    'איך נכנסים (פעם אחת בכל מכשיר):' || E'\n' ||
    '1. נכנסים לכתובת: ' || coalesce(nullif(url, ''), 'האתר של מרכז החירום') || E'\n' ||
    '2. בוחרים "כניסה אישית (מייל וקוד)".' || E'\n' ||
    '3. מקלידים את כתובת המייל הזו (' || mail || ') ולוחצים "שלחו לי קוד".' || E'\n' ||
    '4. למייל הזה יגיע קוד בן 6 ספרות. מקלידים אותו, ונכנסים.' || E'\n\n' ||
    'מאותו רגע המכשיר זוכר אותך, ואין צורך בסיסמה. כדאי גם להוסיף את האתר למסך הבית של הטלפון.' || E'\n\n' ||
    'אנחנו כאן בשבילך לכל שאלה.' || E'\n\n' || 'בהוקרה,' || E'\n' || 'הצוות שלך במרכז חירום',
    'welcome-' || p_staff::text);
  return true;
end $$;
revoke all on function public.welcome_staff(uuid, text) from public, anon;
grant execute on function public.welcome_staff(uuid, text) to authenticated;

-- ---------- the kids' TV: THE ahmash of today's shifts, the same one the schedule marks (the afternoon every day, the morning on Friday and Saturday) ----------
-- The same rule as the portal (14e-portal-core.js, ahmashPicks), going through the month in order: a main ahmash before a second-rank one; then somebody
-- who was not the ahmash the day before; then the one who has been the ahmash the fewest times this month; then by id.
create or replace function public.tv_ahmash_picks(p_day date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := date_trunc('month', p_day)::date; code text; cand record; best int; picked uuid; cnt jsonb := '{}'; seen jsonb := '{}'; out jsonb := '{}';
begin
  while d <= p_day loop
    foreach code in array (case when extract(dow from d) in (5, 6) then array['M', 'A'] else array['A'] end) loop
      select min(p.ahmash_rank) into best
        from public.assignment a join public.staff s on s.id = a.staff_id join public.staff_private p on p.staff_id = s.id join public.schedule sc on sc.month = a.month and sc.status = 'published'
        where s.active and p.ahmash_rank > 0 and (
          (code = 'M' and ((a.day = d and a.shift in ('M', 'S')) or (a.shift = 'L' and a.day = d - 1))) or
          (code = 'A' and ((a.day = d and a.shift = 'A') or (a.shift = 'L' and (a.day = d or a.day = d - 1)))));
      picked := null;
      if best is not null then
        select x.staff_id into picked from (
          select distinct a.staff_id from public.assignment a join public.staff s on s.id = a.staff_id join public.staff_private p on p.staff_id = s.id join public.schedule sc on sc.month = a.month and sc.status = 'published'
          where s.active and p.ahmash_rank = best and (
            (code = 'M' and ((a.day = d and a.shift in ('M', 'S')) or (a.shift = 'L' and a.day = d - 1))) or
            (code = 'A' and ((a.day = d and a.shift = 'A') or (a.shift = 'L' and (a.day = d or a.day = d - 1)))))) x
          order by seen ? (x.staff_id::text || '|' || (d - 1)::text), coalesce((cnt ->> x.staff_id::text)::int, 0), x.staff_id::text
          limit 1;
        cnt := jsonb_set(cnt, array[picked::text], to_jsonb(coalesce((cnt ->> picked::text)::int, 0) + 1));
        seen := seen || jsonb_build_object(picked::text || '|' || d::text, true);
      end if;
      if d = p_day then out := out || jsonb_build_object(code, picked); end if;
    end loop;
    d := d + 1;
  end loop;
  return out;
end $$;
revoke all on function public.tv_ahmash_picks(date) from public, anon;
-- who is on shift today, now with THE ahmash of each shift (see above)
create or replace function public.tv_shifts_today() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Jerusalem')::date; sh jsonb;
begin
  select value into sh from public.sched_settings where key = 'shifts';
  return jsonb_build_object(
    'day', d,
    'ahmash', public.tv_ahmash_picks(d),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('staff', a.staff_id, 'shift', a.shift, 'day', a.day,
                        'from', to_char(coalesce(a.from_time, (sh -> a.shift ->> 'from')::time), 'HH24:MI'), 'to', to_char(coalesce(a.to_time, (sh -> a.shift ->> 'to')::time), 'HH24:MI')))
                      from public.assignment a join public.staff s on s.id = a.staff_id join public.schedule sc on sc.month = a.month and sc.status = 'published'
                      where s.active and (a.day = d or (a.shift = 'L' and a.day = d - 1))), '[]'),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('staff', c.staff_id, 'shift', c.shift, 'action', c.action)) from public.tv_day_changes c where c.day = d), '[]'),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', public.tv_label(s.id), 'photo', s.photo_url, 'female', coalesce(p.female, true), 'kind', s.kind, 'ahmash', coalesce(p.ahmash_rank, 0)))
                        from public.staff s left join public.staff_private p on p.staff_id = s.id
                        where s.active and (s.id in (select a.staff_id from public.assignment a join public.schedule sc on sc.month = a.month and sc.status = 'published' where a.day = d or (a.shift = 'L' and a.day = d - 1))
                                            or s.id in (select c.staff_id from public.tv_day_changes c where c.day = d))), '[]'));
end $$;
revoke all on function public.tv_shifts_today() from public;
grant execute on function public.tv_shifts_today() to anon, authenticated;

select 'scheduling_v17' as part, 'ok' as result;
