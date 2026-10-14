-- ================================================================
-- Scheduling, part 26 — run in the SQL Editor after scheduling-v25.sql. Safe to run again.
--   * Arabic for whoever chose it (or whom the admin set to Arabic): the notices in the portal are in Arabic, and every e-mail is in both
--     languages — the Arabic first, the same in Hebrew under it. Everybody else: exactly as before.
--   * the welcome e-mail and the "new day for sign-up" messages too
-- ================================================================

-- the details inside a message (days, shifts, what changed in a team) in Arabic
create or replace function public.ar_words(p text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p, ''),
    '(ראשון)', '(الأحد)'), '(שני)', '(الاثنين)'), '(שלישי)', '(الثلاثاء)'), '(רביעי)', '(الأربعاء)'), '(חמישי)', '(الخميس)'), '(שישי)', '(الجمعة)'), '(שבת)', '(السبت)'),
    'בוקר קצר', 'صباح قصير'), 'סופ"ש ארוך', 'نهاية أسبوع طويلة'), 'בוקר', 'صباح'), 'צהריים', 'ما بعد الظهر'), 'לילה', 'ليل'),
    ' הצטרף/ה למשמרת', ' انضم/ت إلى المناوبة'), ' לא במשמרת הזאת יותר', ' لم يعد/تعد في هذه المناوبة'), ' הוחלף/ה ב', ' استُبدل/ت بـ'), ': שעות המשמרת עודכנו', ': تم تحديث ساعات المناوبة')
$$;

-- one message to one person: the notice, and the e-mail (an Arabic speaker: the notice in Arabic, the e-mail in Arabic and then in Hebrew)
create or replace function public.tell_staff_ar(p_staff uuid, p_subject text, p_text text, p_kind text, p_subject_ar text, p_text_ar text) returns void
language plpgsql security definer set search_path = public as $$
declare mail text; nm text; url text; v text := public.voice_of(p_staff); ar boolean := public.lang_of(p_staff) = 'ar' and p_text_ar is not null; he text;
begin
  if p_staff is null then return; end if;
  insert into public.notices (to_staff, text, kind) values (p_staff, case when ar then p_text_ar else p_text end, coalesce(p_kind, 'info'));
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
-- the old way to call it stays (Hebrew only)
create or replace function public.tell_staff(p_staff uuid, p_subject text, p_text text, p_kind text default 'info') returns void
language plpgsql security definer set search_path = public as $$
begin perform public.tell_staff_ar(p_staff, p_subject, p_text, p_kind, null, null); end $$;
revoke all on function public.tell_staff(uuid, text, text, text) from public, anon, authenticated;

-- one message by its key, in the person's voice — and in Arabic for an Arabic speaker
create or replace function public.tell_key(p_staff uuid, p_key text, a text default null, b text default null, c text default null, p_kind text default 'info') returns void
language plpgsql security definer set search_path = public as $$
declare v text := public.voice_of(p_staff); subj text; txt text; sa text; ta text; aa text := public.ar_words(a); ba text := public.ar_words(b);
begin
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
    else
      subj := 'עדכון'; txt := coalesce(a, '');
  end case;
  perform public.tell_staff_ar(p_staff, subj, txt, p_kind, sa, ta);
end $$;
revoke all on function public.tell_key(uuid, text, text, text, text, text) from public, anon, authenticated;

-- the welcome e-mail: an Arabic speaker gets it in Arabic, and the Hebrew under it
create or replace function public.welcome_staff(p_staff uuid, p_url text) returns boolean language plpgsql security definer set search_path = public as $$
declare who text; mail text; url text := regexp_replace(coalesce(p_url, ''), '[#?].*$', ''); he text; ar text;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  if url !~ '^https://[a-z0-9.-]+(/[A-Za-z0-9._/-]*)?$' then url := ''; end if;
  select s.display_name, p.email into who, mail from public.staff s join public.staff_private p on p.staff_id = s.id where s.id = p_staff and s.active;
  if mail is null then return false; end if;
  if exists (select 1 from public.email_outbox where kind = 'welcome-' || p_staff::text and error is null) then return false; end if;          -- (once per person)
  he := 'שלום ' || split_part(who, ' ', 1) || ',' || E'\n\n' ||
    'שמחים לבשר שנפתח לך חשבון אישי במערכת של מרכז החירום: פורטל המשמרות ותכנית הרמזור, בכניסה אחת.' || E'\n\n' ||
    'הכניסה הראשונה:' || E'\n' ||
    '1. נכנסים לכתובת: ' || coalesce(nullif(url, ''), 'האתר של מרכז החירום') || E'\n' ||
    '2. בוחרים "כניסה אישית".' || E'\n' ||
    '3. מקלידים את כתובת המייל הזו (' || mail || ') ולוחצים "שלחו לי קוד למייל".' || E'\n' ||
    '4. למייל הזה יגיע קוד. מקלידים אותו.' || E'\n' ||
    '5. בוחרים סיסמה אישית. מהפעם הבאה נכנסים עם המייל והסיסמה, בלי קוד.' || E'\n\n' ||
    'שכחת את הסיסמה? אפשר תמיד לבקש קוד חדש למייל. כדאי גם להוסיף את האתר למסך הבית של הטלפון.' || E'\n\n' ||
    'אנחנו כאן בשבילך לכל שאלה.' || E'\n\n' || 'בהוקרה,' || E'\n' || 'הצוות שלך במרכז חירום';
  if public.lang_of(p_staff) = 'ar' then
    ar := 'مرحبًا ' || split_part(who, ' ', 1) || '،' || E'\n\n' ||
      'يسعدنا إبلاغك أنه فُتح لك حساب شخصي في نظام مركز الطوارئ: بوابة المناوبات وبرنامج الإشارة الضوئية، بدخول واحد. البوابة متوفرة باللغة العربية.' || E'\n\n' ||
      'الدخول الأول:' || E'\n' ||
      '1. ادخلوا إلى العنوان: ' || coalesce(nullif(url, ''), 'موقع مركز الطوارئ') || E'\n' ||
      '2. اختاروا "دخول شخصي" (כניסה אישית).' || E'\n' ||
      '3. اكتبوا عنوان البريد الإلكتروني هذا (' || mail || ') واضغطوا "أرسلوا لي رمزًا للبريد الإلكتروني".' || E'\n' ||
      '4. سيصل رمز إلى هذا البريد. اكتبوه.' || E'\n' ||
      '5. اختاروا كلمة مرور شخصية. من المرة القادمة يكون الدخول بالبريد الإلكتروني وكلمة المرور، بدون رمز.' || E'\n\n' ||
      'نسيت كلمة المرور؟ يمكن دائمًا طلب رمز جديد للبريد الإلكتروني. يُستحسن أيضًا إضافة الموقع إلى الشاشة الرئيسية للهاتف.' || E'\n\n' ||
      'نحن هنا من أجلك لأي سؤال.' || E'\n\n' || 'مع التقدير،' || E'\n' || 'طاقمك في مركز الطوارئ';
  end if;
  insert into public.email_outbox (to_email, subject, body, kind) values (mail,
    case when ar is not null then 'أهلًا وسهلًا في نظام مركز الطوارئ | ברוכים הבאים למערכת של מרכז החירום' else 'ברוכים הבאים למערכת של מרכז החירום' end,
    case when ar is not null then ar || E'\n\n— בעברית —\n\n' || he else he end, 'welcome-' || p_staff::text);
  return true;
end $$;
revoke all on function public.welcome_staff(uuid, text) from public, anon;
grant execute on function public.welcome_staff(uuid, text) to authenticated;

-- a new day for sign-up: the words in Arabic, and the messages through the bilingual sender
create or replace function public.open_day_text_ar(o public.open_days) returns text language sql immutable as $$
  select 'يوم ' || (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from o.day)::int + 1] || ' ' || to_char(o.day, 'FMDD/FMMM') || '، ' ||
    case o.scope when 'day' then 'اليوم كله (07:00–22:00)' when 'morning' then 'صباح (07:00–15:00)' when 'afternoon' then 'ما بعد الظهر (14:00–22:00)'
                 when 'night' then 'ليل (22:00–08:00)' else 'في الساعات ' || to_char(o.from_time, 'HH24:MI') || '–' || to_char(o.to_time, 'HH24:MI') end
$$;
create or replace function public.open_day_publish(p_day date, p_scope text, p_from time, p_to time, p_min int, p_max int, p_audience text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.open_days; r record; txt text; txa text;
begin
  if not public.is_coordinator() then raise exception 'not allowed'; end if;
  if p_day < current_date then raise exception 'the day has passed'; end if;
  if not exists (select 1 from public.schedule where month = date_trunc('month', p_day::timestamp)::date and status = 'published') then raise exception 'the month is not published'; end if;
  insert into public.open_days (day, scope, from_time, to_time, min_staff, max_staff, audience, note)
    values (p_day, p_scope, case when p_scope = 'hours' then p_from end, case when p_scope = 'hours' then p_to end, p_min, p_max, coalesce(p_audience, 'all'), nullif(trim(p_note), ''))
    returning * into o;
  txt := 'נפתח יום נוסף לשיבוץ: ' || public.open_day_text(o) || '. יש ' || o.max_staff || ' מקומות, ומי שרוצה יכול/ה להשתבץ בעצמו/ה בפורטל, בלשונית הסידור.' || coalesce(' ' || o.note, '');
  txa := 'فُتح يوم إضافي للجدولة: ' || public.open_day_text_ar(o) || '. يوجد ' || o.max_staff || ' أماكن، ومن يرغب يمكنه الانضمام بنفسه في البوابة، في تبويب الجدول.' || coalesce(' ' || o.note, '');
  for r in select s.id from public.staff s where s.kind = 'instructor' and s.active loop
    if public.open_day_fits(o, r.id) then
      if coalesce(o.note, '') like 'בדיקה אוטומטית%' then insert into public.notices (to_staff, text, kind) values (r.id, case when public.lang_of(r.id) = 'ar' then txa else txt end, 'open');          -- (the automatic checks of the test site: no e-mails)
      else perform public.tell_staff_ar(r.id, 'נפתח יום נוסף לשיבוץ', txt, 'open', 'فُتح يوم إضافي للجدولة', txa); end if;
    end if;
  end loop;
  return o.id;
end $$;
revoke all on function public.open_day_publish(date, text, time, time, int, int, text, text) from public, anon;
grant execute on function public.open_day_publish(date, text, time, time, int, int, text, text) to authenticated;

select 'scheduling_v26' as part, 'ok' as result;
