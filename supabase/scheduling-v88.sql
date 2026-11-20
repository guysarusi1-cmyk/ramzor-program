-- ================================================================
-- Scheduling, part 88 — run in the SQL Editor of the product's database, after scheduling-v87.sql. Safe to run again. (Guy 19.11.2026, ג1)
-- "הכול מותר חוץ מחפיפה בשעות": a placement by hand is refused on the site only when it overlaps in hours; a double in a row, a close pair
-- she did not agree to and short rest are allowed with a warning. So the check before publishing no longer STOPS on two shifts of one
-- person: it lists them as warnings (an overlap can still come from old data, and then it is shown). Nothing else changes.
-- ================================================================
do $$ begin
  if not exists (select 1 from public.schema_migrations where version = 'scheduling-v87') then raise exception 'scheduling-v87.sql first'; end if;
end $$;

create or replace function public.tw_publish_check(p_period date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare errs text[] := '{}'; warns text[] := '{}'; r record; o uuid := public.current_org();
  rest numeric := coalesce((select (value #>> '{}')::numeric from public.tw_settings where org_id = public.current_org() and key = 'rest_hours'), 8);
begin
  if o is null or not public.tw_builder(p_period) then raise exception 'only the builder of these two weeks'; end if;
  for r in select a.day, a.shift from public.tw_assignment a where a.org_id = o and a.period = p_period
           and not exists (select 1 from public.tw_slots(a.day) s where s.shift = a.shift) loop
    errs := errs || format('%s: אין משמרת %s ביום הזה', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift));
  end loop;
  -- two shifts of one person (Guy 19.11, ג1): never an error any more — overlapping, one right after the other, or short rest are warnings
  for r in with s as (select a.person, a.day, a.shift, coalesce(a.day + a.from_time, x.starts) as st,
                             case when a.to_time is null then x.ends when a.to_time > coalesce(a.from_time, time '00:00') then a.day + a.to_time else a.day + 1 + a.to_time end as en
                      from public.tw_assignment a cross join lateral public.tw_shift_span(a.day, a.shift) x where a.org_id = o and a.period = p_period)
           select p.name, s1.day as d1, s1.shift as sh1, s2.day as d2, s2.shift as sh2, extract(epoch from (s2.st - s1.en)) / 3600 as gap
           from s s1 join s s2 on s2.person = s1.person and s2.st >= s1.st and (s2.day, s2.shift) <> (s1.day, s1.shift) and s2.st < s1.en + make_interval(hours => rest::int, mins => ((rest - floor(rest)) * 60)::int)
           join public.tw_people p on p.id = s1.person order by s1.day loop
    if r.gap < 0 then
      warns := warns || format('%s: %s %s ו%s %s חופפות בשעות', r.name, public.tw_shift_name(r.sh1), to_char(r.d1, 'DD/MM'), public.tw_shift_name(r.sh2), to_char(r.d2, 'DD/MM'));
    elsif r.gap = 0 then
      warns := warns || format('%s: %s %s ו%s %s ברצף, בלי הפסקה', r.name, public.tw_shift_name(r.sh1), to_char(r.d1, 'DD/MM'), public.tw_shift_name(r.sh2), to_char(r.d2, 'DD/MM'));
    else
      warns := warns || format('%s: בין %s %s ל%s %s רק %s שעות מנוחה', r.name, public.tw_shift_name(r.sh1), to_char(r.d1, 'DD/MM'), public.tw_shift_name(r.sh2), to_char(r.d2, 'DD/MM'), trim(to_char(r.gap, 'FM990.0')));
    end if;
  end loop;
  for r in select p.name, (a.day - p_period) / 7 + 1 as wk, count(*) as n from public.tw_assignment a join public.tw_people p on p.id = a.person
           where a.org_id = o and a.period = p_period and a.shift = 'N' group by p.name, (a.day - p_period) / 7 having count(*) > 2 loop
    warns := warns || format('%s: %s לילות בשבוע %s', r.name, r.n, r.wk);          -- (by hand everything but an overlap is allowed: a warning)
  end loop;
  for r in select d::date as day, s.shift, s.need, (select count(*) from public.tw_assignment a where a.org_id = o and a.period = p_period and a.day = d::date and a.shift = s.shift) as got
           from generate_series(p_period, p_period + 13, interval '1 day') d cross join lateral public.tw_slots(d::date) s loop
    if r.got < r.need then warns := warns || format('%s %s: חסרים %s', to_char(r.day, 'DD/MM'), public.tw_shift_name(r.shift), r.need - r.got); end if;
  end loop;
  for r in select d::date as day, f.shift, p.name from generate_series(p_period, p_period + 13, interval '1 day') d
           join public.tw_fixed f on f.org_id = o and f.dow = extract(dow from d)::int join public.tw_people p on p.id = f.person and p.active
           where exists (select 1 from public.tw_slots(d::date) s where s.shift = f.shift)
             and not exists (select 1 from public.tw_assignment a where a.org_id = o and a.period = p_period and a.day = d::date and a.shift = f.shift and a.person = f.person) loop
    warns := warns || format('%s: המשמרת הקבועה של %s לא בסידור (%s)', to_char(r.day, 'DD/MM'), r.name, public.tw_shift_name(r.shift));
  end loop;
  -- nights: one a week for everybody, and two people of the two weeks get one more (Guy 19.11: once per two weeks, in turn)
  for r in select count(*) as n from (select a.person from public.tw_assignment a where a.org_id = o and a.period = p_period and a.shift = 'N'
           group by a.person, (a.day - p_period) / 7 having count(*) = 2) t having count(*) > 2 loop
    warns := warns || format('בשבועיים האלה %s אנשים עם שני לילות בשבוע (בדרך כלל 2)', r.n);
  end loop;
  return jsonb_build_object('errors', to_jsonb(errs), 'warnings', to_jsonb(warns));
end $$;

revoke all on function public.tw_publish_check(date) from public, anon;
grant execute on function public.tw_publish_check(date) to authenticated;

insert into public.schema_migrations(version) values ('scheduling-v88') on conflict (version) do nothing;
select 'scheduling_v88' as part, 'ok' as result;
