-- ================================================================
-- Scheduling, part 45 (the e-mail rules only) — for the LIVE project before the big release. Safe to run again; the full
-- scheduling-v45.sql later includes all of this. Nothing here changes what the site calls (Guy 2026-10-28):
--   * confirmations, a change in the team of a shift, "someone offered to swap", a swap / join request not approved and the built schedule:
--     in the portal only, no e-mail (a vacation not approved: by e-mail)
--   * "a shift looks for a replacement": only to who marked yes / can for it and is free that day
--   * "הסידור פורסם": an e-mail to everybody with shifts, when a month is published
--   * staff_settings.mail_off: the coordinator's choices (the gear comes with the release)
-- ================================================================

alter table public.staff_settings add column if not exists mail_off text[] not null default '{}';          -- (keys of tell_key that come to the portal only)

-- the mail rules: tell_staff_ar knows which message it sends (tell_key says it), and some stay in the portal
create or replace function public.tell_staff_ar(p_staff uuid, p_subject text, p_text text, p_kind text, p_subject_ar text, p_text_ar text) returns void
language plpgsql security definer set search_path = public as $$
declare k text; mail text; nm text; url text; v text := public.voice_of(p_staff); ar boolean := public.lang_of(p_staff) = 'ar' and p_text_ar is not null; he text;
begin
  if p_staff is null then return; end if;
  insert into public.notices (to_staff, text, kind) values (p_staff, case when ar then p_text_ar else p_text end, coalesce(p_kind, 'info'));
  -- which messages come by e-mail too (Guy 2026-10-28): confirmations, a change in the team of a shift, "someone offered to swap", a swap or a
  -- join request that was not approved and the schedule that was built stay in the portal (a vacation that was not approved: by e-mail); a coordinator may switch off the e-mail of her own kinds of messages (the gear)
  k := coalesce(current_setting('sched.mail_key', true), '');
  if k in ('team_change', 'swap_found', 'swap_thanks', 'cant_reporter', 'open_self', 'open_req_self', 'built', 'swap_rej_req', 'swap_rej_take', 'open_no') then return; end if;
  if k <> '' and exists (select 1 from public.staff_settings ss where ss.staff_id = p_staff and k = any(coalesce(ss.mail_off, '{}'))) then return; end if;
  select p.email, s.display_name into mail, nm from public.staff_private p join public.staff s on s.id = p.staff_id where p.staff_id = p_staff;
  select value #>> '{}' into url from public.sched_settings where key = 'portal_url';
  if mail is null then return; end if;
  he := case when ar then 'שלום ' || nm || E',\n\n' || p_text || coalesce(E'\nהפורטל שלך: ' || url, '') || E'\n\nבהוקרה,\nהצוות שלך במרכז חירום'
        else case v
          when 'light' then 'היי ' || nm || E',\n\n' || p_text || E'\n\nשאלה? בקשה? סתם רצון לדבר? אנחנו כאן.' || coalesce(E'\nהפורטל: ' || url, '') || E'\n\nשלך,\nהצוות במרכז חירום'
          when 'brief' then nm || E',\n\n' || p_text || coalesce(E'\n\nהפורטל: ' || url, '')
          else 'שלום ' || nm || E',\n\n' || p_text || E'\n\nאנחנו כאן בשבילך, ואפשר לפנות אלינו בכל שאלה או בקשה.' || coalesce(E'\nהפורטל שלך: ' || url, '') || E'\n\nבהוקרה,\nהצוות שלך במרכז חירום'
        end end;
  insert into public.email_outbox (to_email, subject, body, kind) values (mail,
    case when ar then coalesce(p_subject_ar, p_subject) || ' | ' || p_subject else p_subject end,
    case when ar then 'مرحبًا ' || nm || E'،\n\n' || p_text_ar || E'\n\nنحن هنا من أجلك، ويمكن التوجه إلينا بأي سؤال أو طلب.' || coalesce(E'\nبوابتك: ' || url, '') || E'\n\nمع التقدير،\nطاقمك في مركز الطوارئ'
              || E'\n\n— בעברית —\n\n' || he
         else he end, coalesce(p_kind, 'info'));
end $$;
revoke all on function public.tell_staff_ar(uuid, text, text, text, text, text) from public, anon, authenticated;

-- the messages that are sent by subject only (the engine's, the open day that filled up) get a key too
create or replace function public.tell_staff(p_staff uuid, p_subject text, p_text text, p_kind text default 'info') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('sched.mail_key', case when p_subject like 'הסידור לחודש הבא מוכן%' then 'built'
                                            when p_subject = 'מי עוד לא הגיש העדפות' then 'not_submitted'
                                            when p_subject = 'היום הנוסף התמלא' then 'open_full' else '' end, true);
  perform public.tell_staff_ar(p_staff, p_subject, p_text, p_kind, null, null);
  perform set_config('sched.mail_key', '', true);
end $$;
revoke all on function public.tell_staff(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.tell_key(p_staff uuid, p_key text, a text default null, b text default null, c text default null, p_kind text default 'info') returns void
language plpgsql security definer set search_path = public as $$
declare v text := public.voice_of(p_staff); subj text; txt text; sa text; ta text; aa text := public.ar_words(a); ba text := public.ar_words(b);
begin
  perform set_config('sched.mail_key', coalesce(p_key, ''), true);          -- (the mail rules of tell_staff_ar know which message this is)
  case p_key
    when 'shift_added' then
      subj := case v when 'light' then 'משמרת חדשה בדרך אלייך' when 'brief' then 'נוספה משמרת' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'שובצת למשמרת: ' || a || '. אם זה לא מסתדר, אפשר לבקש החלפה בפורטל, ואנחנו נעזור.' when 'brief' then 'נוספה משמרת: ' || a || '.' else 'שובצת למשמרת: ' || a || '. אם זה לא מסתדר לך, אפשר לבקש החלפה בפורטל, ונשמח לעזור.' end;
      sa := 'تحديث صغير في جدولك'; ta := 'جُدولت لمناوبة: ' || aa || '. إذا لم يناسبك ذلك، يمكن طلب استبدال في البوابة، ويسعدنا أن نساعد.';
    when 'shift_removed' then
      subj := case v when 'brief' then 'הוסרה משמרת' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'המשמרת ' || a || ' הוסרה מהסידור שלך. יום חופשי! (ותודה על הגמישות.)' when 'brief' then 'הוסרה משמרת: ' || a || '.' else 'המשמרת ' || a || ' הוסרה מהסידור שלך. תודה על הגמישות.' end;
      sa := 'تحديث صغير في جدولك'; ta := 'المناوبة ' || aa || ' أُزيلت من جدولك. شكرًا على المرونة.';
    when 'shift_moved' then
      subj := case v when 'brief' then 'המשמרת עברה' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'המשמרת ' || a || ' עברה למישהו אחר. תודה על הגמישות!' when 'brief' then 'המשמרת ' || a || ' עברה לאחר.' else 'המשמרת ' || a || ' עברה למישהו אחר. תודה על הגמישות.' end;
      sa := 'تحديث صغير في جدولك'; ta := 'المناوبة ' || aa || ' انتقلت لشخص آخر. شكرًا على المرونة.';
    when 'shift_taken' then
      subj := case v when 'brief' then 'נוספה משמרת' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'שובצת למשמרת: ' || a || '. תודה שאת/ה שם/ה בשביל הצוות!' when 'brief' then 'שובצת: ' || a || '.' else 'שובצת למשמרת: ' || a || '. תודה שאת/ה שם/ה בשביל הצוות.' end;
      sa := 'تحديث صغير في جدولك'; ta := 'جُدولت لمناوبة: ' || aa || '. شكرًا لأنك موجود/ة من أجل الطاقم.';
    when 'shift_changed' then
      subj := case v when 'brief' then 'שעות המשמרת עודכנו' else 'עדכון קטן בסידור שלך' end;
      txt  := case v when 'light' then 'עדכנו את המשמרת ' || a || ' ל-' || b || '. אם זה לא מסתדר, דברו איתנו.' when 'brief' then 'עודכן: ' || a || ' ← ' || b || '.' else 'עדכנו את המשמרת ' || a || ' ל-' || b || '. נשמח אם זה מסתדר לך, ואם לא, דברו איתנו.' end;
      sa := 'تحديث صغير في جدولك'; ta := 'حدّثنا المناوبة ' || aa || ' إلى ' || ba || '. يسعدنا إن كان ذلك يناسبك، وإن لم يكن، تحدّث/ي معنا.';
    when 'team_change' then
      subj := case v when 'brief' then 'שינוי בצוות' else 'עדכון בצוות המשמרת שלך' end;
      txt  := case v when 'brief' then a || ': ' || b || '.' else 'עדכון קטן בצוות של המשמרת ' || a || ': ' || b || '.' end;
      sa := 'تحديث في طاقم مناوبتك'; ta := 'تحديث صغير في طاقم المناوبة ' || aa || ': ' || ba || '.';
    when 'swap_found' then
      subj := case v when 'light' then 'נמצא גיבור/ה להחלפה' when 'brief' then 'נמצא מחליף/ה' else 'יש חדשות טובות לגבי ההחלפה' end;
      txt  := case v when 'light' then 'עמית מוכן/ה להחליף אותך במשמרת ' || a || '. העברנו לרכזת לאישור, ונעדכן ברגע שתהיה תשובה.' when 'brief' then 'נמצא מחליף/ה למשמרת ' || a || '. ממתין לאישור הרכזת.' else 'עמית מוכן/ה להחליף אותך במשמרת ' || a || '. העברנו את זה לרכזת לאישור, ונעדכן אותך ברגע שתהיה תשובה.' end;
      sa := 'أخبار جيدة بخصوص الاستبدال'; ta := 'زميل/ة مستعد/ة لاستبدالك في المناوبة ' || aa || '. نقلنا ذلك للمركّزة للموافقة، وسنبلغك حالما يصل الرد.';
    when 'swap_thanks' then
      subj := case v when 'brief' then 'ההצעה הועברה' else 'תודה שהצעת להחליף' end;
      txt  := case v when 'light' then 'תודה שהצעת להחליף במשמרת ' || a || '! הבקשה אצל הרכזת, ונעדכן כשתאשר.' when 'brief' then 'ההצעה למשמרת ' || a || ' הועברה לרכזת.' else 'תודה שהצעת להחליף במשמרת ' || a || '. הבקשה אצל הרכזת, ונעדכן אותך כשהיא תאשר.' end;
      sa := 'شكرًا لعرضك الاستبدال'; ta := 'شكرًا لعرضك الاستبدال في المناوبة ' || aa || '. الطلب عند المركّزة، وسنبلغك عندما توافق.';
    when 'swap_waiting' then
      subj := 'בקשת החלפה מחכה לך'; txt := 'יש בקשת החלפה שמחכה לאישור שלך: ' || a || '.';
    when 'swap_rej_req' then
      subj := case v when 'brief' then 'ההחלפה לא אושרה' else 'לגבי בקשת ההחלפה שלך' end;
      txt  := case v when 'light' then 'הפעם לא הצלחנו לאשר את ההחלפה, והמשמרת נשארת אצלך. אפשר לדבר איתנו על פתרון אחר.' when 'brief' then 'ההחלפה לא אושרה. המשמרת נשארת אצלך.' else 'הפעם לא הצלחנו לאשר את ההחלפה, והמשמרת נשארת אצלך. אנחנו מבינים שזה לא תמיד נוח, ואפשר לדבר איתנו על פתרון אחר.' end;
      sa := 'بخصوص طلب الاستبدال'; ta := 'هذه المرة لم ننجح في الموافقة على الاستبدال، والمناوبة تبقى عندك. نتفهم أن هذا ليس مريحًا دائمًا، ويمكن التحدث معنا عن حل آخر.';
    when 'swap_rej_take' then
      subj := case v when 'brief' then 'ההחלפה לא אושרה' else 'לגבי ההחלפה שהצעת' end;
      txt  := case v when 'light' then 'תודה על הנכונות! הפעם ההחלפה לא אושרה, אבל ההצעה שלך מוערכת מאוד.' when 'brief' then 'ההחלפה שהצעת לא אושרה. תודה.' else 'תודה על הנכונות! הפעם לא הצלחנו לאשר את ההחלפה, אבל ההצעה שלך מוערכת מאוד.' end;
      sa := 'بخصوص الاستبدال الذي عرضته'; ta := 'شكرًا على الاستعداد! هذه المرة لم ننجح في الموافقة على الاستبدال، لكن عرضك مقدَّر جدًا.';
    when 'cant_reporter' then
      subj := case v when 'brief' then 'העדכון התקבל' else 'קיבלנו את העדכון שלך' end;
      txt  := case v when 'light' then 'תודה שעדכנת. פתחנו את המשמרת ' || a || ' להחלפה ועדכנו את הרכזת, אז אין לך מה לדאוג. תרגיש/י טוב!' when 'brief' then 'המשמרת ' || a || ' נפתחה להחלפה והרכזת עודכנה.' else 'תודה שעדכנת אותנו. פתחנו את המשמרת ' || a || ' להחלפה ועדכנו את הרכזת, אז אין לך מה לדאוג. תרגיש/י טוב, ובריאות שלמה אם צריך.' end;
      sa := 'استلمنا تحديثك'; ta := 'شكرًا لأنك أبلغتنا. فتحنا المناوبة ' || aa || ' للاستبدال وأبلغنا المركّزة، فلا داعي للقلق. نتمنى لك الصحة.';
    when 'cant_team' then
      subj := case v when 'light' then 'קריאה לעזרה (קטנה)' when 'brief' then 'משמרת מחפשת מחליף/ה' else 'מישהו מהצוות זקוק לעזרה' end;
      txt  := case v when 'light' then 'משמרת מחפשת מחליף/ה: ' || a || '. אם יש לך אפשרות להציל אותה, הציע/י בלוח ההחלפות. תודה, אתם צוות!' when 'brief' then 'משמרת מחפשת מחליף/ה: ' || a || '. הצעה בלוח ההחלפות.' else 'נפתחה משמרת שמחפשת מחליף/ה: ' || a || '. אם יש לך אפשרות, נשמח אם תציע/י להחליף בלוח ההחלפות. תודה שאתם שם אחד בשביל השני.' end;
      sa := 'أحد أفراد الطاقم يحتاج مساعدة'; ta := 'فُتحت مناوبة تبحث عن بديل/ة: ' || aa || '. إذا كان بإمكانك، يسعدنا أن تعرض/ي الاستبدال في لوحة الاستبدالات. شكرًا لأنكم سند لبعضكم.';
    when 'cant_coord' then
      subj := 'עדכון: משמרת שנפתחה להחלפה';
      txt  := a || ' עדכנ/ה שלא יהיה אפשר להגיע למשמרת ' || b || '. פתחנו אותה להחלפה, וכשיימצא מחליף/ה היא תחכה לאישורך.';
    when 'vac_ok' then
      subj := case v when 'brief' then 'החופשה אושרה' else 'החופשה שלך אושרה' end;
      txt  := case v when 'light' then 'בשורה טובה: בקשת החופשה שלך (' || a || ') אושרה. חופשה נעימה, ותיהנו (מגיע לך)!' when 'brief' then 'חופשה אושרה: ' || a || '.' else 'שמחים לעדכן שבקשת החופשה שלך (' || a || ') אושרה. חופשה נעימה ומרעננת!' end;
      sa := 'تمت الموافقة على إجازتك'; ta := 'يسعدنا إبلاغك أنه تمت الموافقة على طلب إجازتك (' || aa || '). إجازة سعيدة ومنعشة!';
    when 'vac_no' then
      subj := case v when 'brief' then 'החופשה לא אושרה' else 'לגבי בקשת החופשה שלך' end;
      txt  := case v when 'light' then 'הפעם לא הצלחנו לאשר את בקשת החופשה (' || a || '). בואו נתאם מועד אחר שיתאים גם לכם וגם לצוות.' when 'brief' then 'חופשה לא אושרה: ' || a || '. נא לתאם מועד אחר מול הרכזת.' else 'הפעם לא הצלחנו לאשר את בקשת החופשה (' || a || '). נשמח לתאם איתך מועד אחר שיתאים גם לך וגם לצוות.' end;
      sa := 'بخصوص طلب إجازتك'; ta := 'هذه المرة لم ننجح في الموافقة على طلب الإجازة (' || aa || '). يسعدنا تنسيق موعد آخر يناسبك ويناسب الطاقم.';
    when 'open_coord' then
      subj := 'מישהי מילאה משמרת חסרה'; txt := a || ' שיבצה את עצמה למשמרת ' || b || '.';
    when 'open_self' then
      subj := case v when 'brief' then 'שובצת' else 'תודה שמילאת משמרת חסרה' end;
      txt  := case v when 'light' then 'שיבצנו אותך למשמרת ' || a || '. תודה, הצלת את היום!' when 'brief' then 'שובצת למשמרת ' || a || '.' else 'שיבצנו אותך למשמרת ' || a || '. תודה שאכפת לך מהצוות!' end;
      sa := 'شكرًا لأنك ملأت مناوبة ناقصة'; ta := 'جدولناك للمناوبة ' || aa || '. شكرًا لاهتمامك بالطاقم!';
    when 'open_req_coord' then
      subj := 'בקשה להצטרף למשמרת פתוחה'; txt := a || ' מבקש/ת להצטרף למשמרת ' || b || '. הבקשה מחכה לאישורך.';
    when 'open_req_self' then
      subj := case v when 'brief' then 'הבקשה נשלחה' else 'קיבלנו את הבקשה שלך' end;
      txt  := case v when 'light' then 'תודה על האומץ! הבקשה להצטרף למשמרת ' || a || ' אצל הרכזת, ונעדכן ברגע שתאשר.' when 'brief' then 'הבקשה למשמרת ' || a || ' נשלחה לרכזת.' else 'תודה שרצית להצטרף! הבקשה למשמרת ' || a || ' נשלחה לרכזת, ונעדכן אותך ברגע שתאשר.' end;
      sa := 'استلمنا طلبك'; ta := 'شكرًا لرغبتك في الانضمام! طلب المناوبة ' || aa || ' أُرسل للمركّزة، وسنبلغك حالما توافق.';
    when 'open_no' then
      subj := case v when 'brief' then 'הבקשה לא אושרה' else 'לגבי הבקשה להצטרף למשמרת' end;
      txt  := case v when 'light' then 'תודה על הנכונות! הפעם לא הצלחנו לאשר את המשמרת ' || a || ', אבל הרצון לעזור מוערך מאוד.' when 'brief' then 'המשמרת ' || a || ' לא אושרה. תודה.' else 'תודה על הנכונות להצטרף! הפעם לא הצלחנו לאשר את המשמרת ' || a || ', ואנחנו מעריכים מאוד את הרצון לעזור.' end;
      sa := 'بخصوص طلب الانضمام للمناوبة'; ta := 'شكرًا على الاستعداد للانضمام! هذه المرة لم ننجح في الموافقة على المناوبة ' || aa || '، ونقدّر جدًا رغبتك في المساعدة.';
    when 'updates' then
      subj := case v when 'brief' then 'עדכון בסידור' else 'עדכון בסידור שלך' end;
      txt  := case v when 'brief' then 'עדכונים בסידור:' when 'light' then 'יש כמה עדכונים בסידור שלך:' else 'יש עדכונים בסידור שלך:' end || E'\n' || a;
      sa := 'تحديث في جدولك'; ta := 'هناك تحديثات في جدولك:' || E'\n' || coalesce(b, aa);
    when 'sched_published' then
      subj := 'הסידור ל' || a || ' פורסם';
      txt  := case v when 'light' then 'הסידור ל' || a || ' באוויר! יש לך ' || b || ' משמרות בחודש הזה, ואפשר לראות אותן בפורטל.' when 'brief' then 'הסידור ל' || a || ' פורסם. ' || b || ' משמרות.' else 'הסידור ל' || a || ' פורסם. יש לך ' || b || ' משמרות בחודש הזה, ואפשר לראות אותן בפורטל.' end;
      sa := 'تم نشر جدول ' || coalesce(c, a); ta := 'تم نشر جدول ' || coalesce(c, a) || '. لديك ' || b || ' مناوبات في هذا الشهر، ويمكن رؤيتها في البوابة.';
    else
      subj := 'עדכון'; txt := coalesce(a, '');
  end case;
  if p_key = 'vac_ok' and b is not null then txt := txt || E'
' || b; ta := ta || E'
' || coalesce(c, b); end if;
  perform public.tell_staff_ar(p_staff, subj, txt, p_kind, sa, ta);
  perform set_config('sched.mail_key', '', true);
end $$;
revoke all on function public.tell_key(uuid, text, text, text, text, text) from public, anon, authenticated;

-- "I cannot come": the call for help goes only to who could take the shift AND marked "yes" or "can" for it (an instructor; Guy 2026-10-28)
create or replace function public.report_cannot_come(p_assignment uuid, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_staff_id(); k text := public.my_kind(); a public.assignment; rid uuid; c record; i record; who text; st text; why text := trim(coalesce(p_note, ''));
begin
  if me is null or k not in ('instructor', 'service') then raise exception 'not allowed'; end if;
  if length(why) < 2 then raise exception 'a reason is required'; end if;
  select * into a from public.assignment where id = p_assignment and staff_id = me and day >= current_date; if not found then raise exception 'not your upcoming shift'; end if;
  if exists (select 1 from public.swap_requests where assignment_id = p_assignment and status in ('open', 'offered')) then raise exception 'already reported'; end if;
  select display_name into who from public.staff where id = me;
  st := public.shift_text(a.day, a.shift, a.from_time, a.to_time);
  insert into public.sick_reports (assignment_id, staff_id, note, status, decided_at) values (p_assignment, me, why, 'approved', now()) returning id into rid;
  insert into public.swap_requests (assignment_id, from_staff, urgent) values (p_assignment, me, true);
  for c in select s.id from public.staff s where s.kind = 'coordinator' and s.active loop perform public.tell_key(c.id, 'cant_coord', who, st || ' (הסיבה: ' || why || ')', null, 'warn'); end loop;
  for i in select s.id from public.staff s where s.kind = k and s.active and s.id <> me and public.can_replace(s.id, a)
             and (s.kind <> 'instructor' or exists (select 1 from public.prefs_slot f where f.staff_id = s.id and f.day = a.day
                                                     and f.shift = case a.shift when 'S' then 'M' else a.shift end and f.level in ('yes', 'can'))) loop
    perform public.tell_key(i.id, 'cant_team', st);
  end loop;
  perform public.tell_key(me, 'cant_reporter', st);
  return rid;
end $$;
revoke all on function public.report_cannot_come(uuid, text) from public, anon;
grant execute on function public.report_cannot_come(uuid, text) to authenticated;

-- ---------------------------------------------------------------- "הסידור פורסם": to everybody with shifts in that month
create or replace function public.month_he(p date) returns text language sql immutable as $$
  select (array['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'])[extract(month from p)::int] || ' ' || extract(year from p)::int
$$;
create or replace function public.month_ar(p date) returns text language sql immutable as $$
  select (array['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'])[extract(month from p)::int] || ' ' || extract(year from p)::int
$$;
create or replace function public.notify_schedule_published() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    for r in select x.staff_id, count(*) as n from public.assignment x join public.staff s on s.id = x.staff_id and s.active
             where x.month = new.month group by x.staff_id loop
      perform public.tell_key(r.staff_id, 'sched_published', public.month_he(new.month), r.n::text, public.month_ar(new.month), 'ok');
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.notify_schedule_published() from public, anon, authenticated;
drop trigger if exists schedule_published_notify on public.schedule;
create trigger schedule_published_notify after update of status on public.schedule for each row execute function public.notify_schedule_published();

select 'scheduling_v45_mail' as part, 'ok' as result;
