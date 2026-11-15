-- ================================================================
-- Drill for the pilot (Guy 2026-11-15): "as if everybody already handed in" — run in the SQL Editor of mercury-shibutzim.
-- Fills made-up preferences (כן / אפשרי / לא) for every active person of the open two weeks who has NOT handed in yet, and marks
-- them as handed in (note 'תרגיל'). What somebody really marked stays as is. Nothing is built: the build button stays for the builder.
--   * a realistic mix: each person opens about their need (twice the shifts a week, the weekend shift as two) plus a few more,
--     about two thirds "כן" and a third "אפשרי"; every fourth person never opens nights;
--   * data only, no change in tables or rules. Safe to run again (people already handed in are skipped).
-- ================================================================

do $drill$
declare o uuid; pr date; st text; p record; s record; got int; need int; n_people int := 0; n_opts int := 0; k int := 0;
begin
  if to_regclass('public.org') is null then raise exception 'עצירה: זה לא מסד השיבוצים (אין טבלת org). לא שונה דבר.'; end if;
  select id into o from public.org where slug = 'demo';
  if o is null then raise exception 'עצירה: לא נמצא הארגון demo. לא שונה דבר.'; end if;
  select start, status into pr, st from public.tw_period where org_id = o and status = 'open' order by start desc limit 1;
  if pr is null then          -- none open: the next two weeks are opened (by the queue when there is one, else right after the last ones, with no builder: the admin builds)
    pr := public.tw_auto_open_org(o);
    if pr is null then
      select max(start) into pr from public.tw_period where org_id = o;
      if pr is null then pr := current_date + ((7 - extract(dow from current_date)::int) % 7); else pr := pr + 14; end if;
      while pr + 13 < current_date loop pr := pr + 14; end loop;
      insert into public.tw_period(org_id, start, status) values (o, pr, 'open') on conflict do nothing;
    end if;
    select status into st from public.tw_period where org_id = o and start = pr;
    if st is distinct from 'open' then raise exception 'עצירה: לא הצלחתי לפתוח שבועיים להגשה. לא שונה דבר.'; end if;
  end if;

  for p in select id, per_week from public.tw_people t where t.org_id = o and t.active and t.per_week > 0 order by t.sort, t.name loop
    k := k + 1;
    if exists (select 1 from public.tw_submission x where x.org_id = o and x.period = pr and x.person = p.id) then continue; end if;
    delete from public.tw_option where org_id = o and period = pr and person = p.id;
    need := p.per_week * 2 + 3; got := 0;
    for s in
      select d::date as day, sh.shift, sh.w
      from generate_series(pr, pr + 13, interval '1 day') d
      cross join lateral (values ('M', 1), ('A', 1), ('N', 1), ('W', 2)) sh(shift, w)
      where case extract(dow from d)::int
              when 5 then sh.shift in ('M', 'W')
              when 6 then sh.shift = 'N'
              else sh.shift in ('M', 'A', 'N') end
        and not (k % 4 = 0 and sh.shift = 'N')
      order by random()
    loop
      exit when got >= need;
      insert into public.tw_option(org_id, period, person, day, shift, level)
        values (o, pr, p.id, s.day, s.shift, case when random() < 0.67 then 'yes' else 'can' end);
      got := got + s.w; n_opts := n_opts + 1;
    end loop;
    insert into public.tw_submission(org_id, period, person, submitted_at, by_staff, note) values (o, pr, p.id, now(), null, 'תרגיל');
    n_people := n_people + 1;
  end loop;
  raise notice 'drill: % people, % options, two weeks from %', n_people, n_opts, pr;
end $drill$;

select 'drill_prefs' as part, 'ok' as result,
       (select start from public.tw_period where org_id = (select id from public.org where slug = 'demo') and status = 'open' order by start desc limit 1) as two_weeks_from,
       (select count(*) from public.tw_people where org_id = (select id from public.org where slug = 'demo') and active and per_week > 0) as active_people,
       (select count(*) from public.tw_submission s join public.tw_period t on t.org_id = s.org_id and t.start = s.period
          where t.org_id = (select id from public.org where slug = 'demo') and t.status = 'open') as handed_in,
       (select count(*) from public.tw_option s join public.tw_period t on t.org_id = s.org_id and t.start = s.period
          where t.org_id = (select id from public.org where slug = 'demo') and t.status = 'open') as options;
