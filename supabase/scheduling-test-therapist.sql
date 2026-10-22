-- TEST project only: two test therapists (only therapists, no shifts), each with four children of her own, to see the therapist portal as they see it.
-- Before running: Authentication -> Users -> Add user -> Create new user (tick "Auto Confirm User"), the same password as the other test accounts:
--     therapist-test@merkaz-cherum.local    therapist2-test@merkaz-cherum.local
-- Safe to run again. (The automatic checks use c1, c2, c15 for their own therapist; these are c6-c9 and c10-c13.)
do $$
declare t record; sid uuid; uid uuid; author uuid;
begin
  for t in select * from (values ('therapist-test@merkaz-cherum.local', 'מטפלת בדיקה', array['c6', 'c7', 'c8', 'c9']),
                                 ('therapist2-test@merkaz-cherum.local', 'מטפלת בדיקה 2', array['c10', 'c11', 'c12', 'c13'])) v(email, name, kids) loop
    select id into uid from auth.users where email = t.email;
    if uid is null then raise exception 'first add the user % (Authentication -> Users)', t.email; end if;
    select staff_id into sid from public.staff_private where email = t.email;
    if sid is null then
      insert into public.staff (display_name, kind, active, sort_order) values (t.name, 'therapist', true, 900) returning id into sid;
      insert into public.staff_private (staff_id, email, auth_user_id, female) values (sid, t.email, uid, true);
    else
      update public.staff_private set auth_user_id = uid where staff_id = sid;
    end if;
    insert into public.child_therapist (child_id, staff_id) select k, sid from unnest(t.kids) k
      on conflict (child_id) do update set staff_id = excluded.staff_id;
  end loop;
  -- something waiting in "מה דורש אותי": observations from the test instructor, and plans to review soon
  select staff_id into author from public.staff_private where email = 'instructor-test@merkaz-cherum.local';
  if not exists (select 1 from public.observations where text like 'דוגמה:%' and seen_at is null) then
    insert into public.observations (child_id, author, text) values
      ('c6', author, 'דוגמה: ביקש עזרה כשנתקע בפאזל, בלי לצעוק'),
      ('c7', author, 'דוגמה: היה קשה במעבר לארוחת הערב, נרגע בפינת השקט אחרי כמה דקות'),
      ('c11', author, 'דוגמה: שיחק עם ילד אחר וחיכה לתור שלו');
  end if;
  update public.child_plans set review_date = current_date + 5 where child_id in ('c8', 'c12');
end $$;
select s.display_name, s.kind, p.email, (p.auth_user_id is not null) as linked, (select string_agg(child_id, ',' order by child_id) from public.child_therapist where staff_id = s.id) as children
  from public.staff s join public.staff_private p on p.staff_id = s.id where p.email like 'therapist%-test@merkaz-cherum.local' order by p.email;
