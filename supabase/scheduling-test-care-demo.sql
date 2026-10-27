-- TEST project only: examples for the therapist portal of therapist-test@ (her children c6-c9), so that "מה דורש אותי" shows every kind of item.
-- Safe to run again (it adds a few more examples). Run after scheduling-v43.sql.
do $$
declare ins uuid; ins2 uuid; v int;
begin
  select id into ins from public.staff where kind = 'instructor' and active order by sort_order nulls last limit 1;
  select id into ins2 from public.staff where kind = 'instructor' and active and id <> ins order by sort_order nulls last limit 1;
  -- a new observation (c6) and a question waiting for an answer (c7)
  insert into public.observations (child_id, author, text, goal_id, valence) values ('c6', ins, 'דוגמה: נרגע לבד בפינה השקטה אחרי ויכוח, בלי שביקשנו', null, null);
  insert into public.observations (child_id, author, text, kind) values ('c7', ins2, 'דוגמה: מה עושים כשהיא מסרבת להיכנס למקלחת בערב?', 'question');
  -- new incidents: a severe one (c6) and a light one (c8)
  insert into public.incidents (child_id, author, at, shift, kind, intensity, before, helped, note)
    values ('c6', ins, now() - interval '3 hours', 'צהריים', 'aggression', 3, '{מעבר,גבול או סירוב}', '{מבוגר קרוב,זמן}', 'דוגמה: זרק כיסא כשנאמר לו לסיים את המשחק'),
           ('c8', ins2, now() - interval '1 day', 'בוקר', 'flooding', 1, '{רעש או עומס}', '{פינה שקטה}', null);
  -- the stays: c7 arrived 12 days ago (the first plan is due soon, if it has no published plan); c8 leaves in 9 days
  insert into public.child_stays (child_id, name, admitted, intake) values ('c7', 'c7', current_date - 12, '{"avoid":"דוגמה: לא להרים את הקול","calm":"דוגמה: שמיכה וחפץ מעבר","tasks":[{"t":"סיור במרכז עם מבוגר קבוע","done":true},{"t":"להכיר את לוח היום","done":false}]}')
    on conflict (child_id) do update set admitted = excluded.admitted, intake = excluded.intake;
  insert into public.child_stays (child_id, name, admitted, exit_date, exit) values ('c8', 'c8', current_date - 60, current_date + 9, '{"next_place":"דוגמה: משפחת אומנה","moments":"ניצח בטורניר הכדורגל\nבנה מגדל ענק מקוביות"}')
    on conflict (child_id) do update set exit_date = excluded.exit_date, exit = excluded.exit;
  -- sentences for c8's book, waiting for approval
  insert into public.staff_letters (child_id, author, text) values ('c8', ins, 'דוגמה: תמיד ידעת להצחיק את כולם בארוחת הערב'), ('c8', ins2, 'דוגמה: היה כיף לבנות איתך את המגדל');
  -- a plan whose review date is close (c6), changes not published yet (c9)
  update public.child_plans set review_date = current_date + 5 where child_id = 'c6' and published_version > 0;
  update public.child_plans set draft = jsonb_set(coalesce(published, draft), '{summary}', to_jsonb('דוגמה: תקציר מעודכן שעוד לא פורסם'::text)) where child_id = 'c9' and published is not null;
  -- a video waiting for her approval (c9's last version)
  select published_version into v from public.child_plans where child_id = 'c9';
  if coalesce(v, 0) > 0 then
    insert into public.plan_videos (child_id, version, status) values ('c9', v, 'draft') on conflict (child_id, version) do update set status = 'draft', decided_at = null, decided_by = null;
  end if;
  -- a strength that rose to the temple (c9)
  insert into public.child_strengths (child_id, strength, status, picks, updated_at) values ('c9', 'סבלנות', 'main', 2, now())
    on conflict (child_id, strength) do update set status = 'main', updated_at = now();
end $$;
select 'care demo' as part, 'ok' as result;
