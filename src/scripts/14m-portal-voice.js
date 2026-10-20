
// ---------- THE PORTAL ON THE SERVER: three voices for everything the system says to a person, and the settings (gear) screen ----------
//   warm  : a soft, caring voice (the default)
//   light : a light, humorous voice (kind, never at anybody's expense)
//   brief : short and to the point
// The person picks one in the settings; the same choice is used by the e-mails and notices the server writes (supabase/scheduling-v6.sql) and by the reminders.
const VOICE_NAMES = { warm:'חמה ורכה', light:'קלילה והומוריסטית', brief:'קצרה ועניינית' };
const VOICE_SAMPLE = {
  warm:'"תודה ששיתפת אותנו. זה עוזר לנו לבנות סידור שמתאים לך."',
  light:'"הסידור לא יכתוב את עצמו (עדיין). נשמח להעדפות שלך!"',
  brief:'"נא להגיש העדפות עד ה-24."'
};
// each key: a function of its arguments for every voice (a, b, c are the arguments of tx)
const VOICES = {
  // ---- the preferences screen
  st_unsub:   { warm:() => 'נשמח לקבל את ההעדפות שלך. זה עוזר לנו לבנות סידור שמתאים לך.', light:() => 'הסידור לא יכתוב את עצמו (עדיין). נשמח להעדפות שלך!', brief:() => 'נא להגיש העדפות.' },
  st_sub:     { warm:() => 'ההעדפות שלך אצלנו, תודה! אפשר לעדכן עד סגירת ההגשה.', light:() => 'קיבלנו, ושמנו במקום בטוח. אפשר לעדכן עד סגירת ההגשה.', brief:() => 'ההעדפות הוגשו. אפשר לעדכן עד הסגירה.' },
  locked:     { warm:() => 'ההגשה לחודש הזה סגורה כרגע (היא נפתחת ב-1 בחודש הקודם ונסגרת ב-24 בו בשעה 22:30). לשינוי אפשר לפנות לרכזת, והיא תשמח לעזור.', light:() => 'ההגשה לחודש הזה סגורה כרגע (נפתחת ב-1 בחודש הקודם ונסגרת ב-24 ב-22:30). לשינויים הרכזת היא הכתובת, והיא מבטיחה לא לנשוך.', brief:() => 'ההגשה סגורה. לשינוי: הרכזת.' },
  submit_ok:  { warm:() => 'תודה! ההעדפות שלך הוגשו ✓', light:() => 'הוגש! שמנו על זה חותמת ✓', brief:() => 'הוגש ✓' },
  consent_needed:{ warm:() => 'נשמח אם תענו על שתי השאלות הקטנות לפני ההגשה. זה עוזר לנו לתכנן', light:() => 'עוד שתי שאלות קטנטנות ואנחנו שם. נשמח לתשובות לפני ההגשה', brief:() => 'יש לענות על שתי השאלות לפני ההגשה' },
  save_later: { warm:() => 'לא הצלחנו לשמור כרגע, ננסה שוב אוטומטית בעוד רגע', light:() => 'השמירה נתקעה לרגע. ננסה שוב לבד, בלי לקחת ללב', brief:() => 'השמירה נכשלה. ננסה שוב' },
  submit_fail:{ warm:() => 'לא הצלחנו לשמור את ההגשה כרגע. אפשר לנסות שוב בעוד רגע', light:() => 'ההגשה לא עברה הפעם. נסו שוב בעוד רגע, בטח היה גל באינטרנט', brief:() => 'ההגשה נכשלה. נסו שוב' },
  clear_text: { warm:(a) => `כל הסימונים שלך בחודש הזה (כן, יכול, לא${a}) יחזרו ל"כן", כלומר זמינים. אפשר תמיד לסמן שוב.`, light:(a) => `כל הסימונים (כן, יכול, לא${a}) יחזרו ל"כן". דף חלק, התחלה חדשה. אפשר תמיד לסמן שוב.`, brief:(a) => `כל הסימונים יימחקו (כן, יכול, לא${a}) ויחזרו ל"כן".` },
  clear_done: { warm:() => 'ניקינו הכול. הכל "כן" שוב', light:() => 'הכול נוקה, הכל "כן" שוב. דף חדש!', brief:() => 'נוקה. הכל "כן"' },
  hint_low:   { warm:(f, m) => `שמנו לב שבסימונים הנוכחיים נשארו ${f} משמרות שמתאימות לך. כדי שנצליח לשבץ אותך במינימום (בערך ${m} משמרות) כדאי להשאיר קצת יותר גמישות. אם משהו מגביל אותך, נשמח לשמוע ולמצוא פתרון יחד.`, light:(f, m) => `ספרנו, ונשארו ${f} משמרות שמתאימות לך, והמינימום הוא בערך ${m}. קצת יותר גמישות והחשבון יסתדר. ואם משהו באמת מגביל, ספרו לנו.`, brief:(f, m) => `נשארו ${f} משמרות זמינות, והמינימום הוא ${m}. כדאי להוסיף גמישות.` },
  neutral_note:{ warm:(n) => `נשארו ${n} משמרות שעוד לא סימנתם. נשמח אם תעברו על כל החודש ותסמנו לכל משמרת "כן", "יכול" או "לא", כדי שנוכל לבנות סידור שמתאים לכם. משמרת שלא סומנה נשבץ רק אם לא תהיה ברירה אחרת.`, light:(n) => `נשארו ${n} משמרות בלי סימון. כל אחת מחכה ל"כן", ל"יכול" או ל"לא", ואז הסידור כבר יידע מה לעשות איתכם.`, brief:(n) => `${n} משמרות ללא סימון. יש למלא את כל החודש.` },
  submit_neutral:{ warm:(n) => `תודה, ההעדפות נשמרו. אבל ההגשה עדיין לא הושלמה: נשארו ${n} משמרות בלי סימון. נשמח מאוד שתשלימו אותן עד סגירת ההגשה`, light:(n) => `שמרנו, אבל עוד לא סיימנו: ${n} משמרות מחכות לסימון, וההגשה לא שלמה בלעדיהן. כדאי להשלים לפני הסגירה`, brief:(n) => `ההגשה לא שלמה: ${n} משמרות ללא סימון. יש להשלים עד הסגירה` },
  long_levels:{ warm:() => 'לסופ"ש ארוך אפשר לבחור "כן", "יכול" או "לא"', light:() => 'לסופ"ש ארוך בוחרים "כן", "יכול" או "לא". בלי שעות מיוחדות', brief:() => 'כאן: כן, יכול או לא' },
  long_setting:{ warm:() => 'סופ"ש ארוך (שישי אחר הצהריים עד אחרי צאת שבת) לא מוצג כברירת מחדל. כשמפעילים, מופיע מתחת לכל שישי ושבת כפתור אחד שמסומן בו אם מתאים לכם. לא נשבץ אתכם אליו בלי שסימנתם.', light:() => 'סופ"ש ארוך לא מופיע כברירת מחדל. מפעילים, ומתחת לכל שישי ושבת מופיע כפתור אחד. בלי סימון שלכם אנחנו לא נוגעים בו.', brief:() => 'מציג סופ"ש ארוך מתחת לשישי ולשבת. בלי סימון: לא משבצים.' },
  pick_setting:{ warm:() => 'כשהאפשרות פעילה, בכל סופ"ש במסך ההעדפות מופיע כפתור קטן "רק אחד מאלה". מסמנים כמה סופי שבוע שמתאימים לכם, והמערכת תשבץ אתכם באחד מהם בלבד.', light:() => 'כשזה פעיל, כל סופ"ש מקבל כפתור קטן "רק אחד מאלה". פותחים למערכת כמה אפשרויות, והיא בוחרת אחת בלבד.', brief:() => 'מוסיף כפתור "רק אחד מאלה" בסופי שבוע. המערכת תשבץ אחד מהם בלבד.' },
  // ---- the schedule tab
  sch_unpub:  { warm:() => 'הסידור לחודש הזה עוד בהכנה. ברגע שהוא יפורסם נעדכן אותך כאן ובמייל.', light:() => 'הסידור עוד בתנור. כשהוא יצא נעדכן כאן ובמייל.', brief:() => 'הסידור טרם פורסם.' },
  sch_none:   { warm:() => 'בחודש הזה עדיין לא שובצו לך משמרות. אם זה לא מה שציפיתם, נשמח לשמוע ולעזור.', light:() => 'החודש אין לך משמרות (בינתיים). אם זה לא מה שציפית, תגיד לנו ונבדוק.', brief:() => 'אין משמרות החודש.' },
  sch_help:   { warm:() => 'צריך לשנות משהו? לחצו על "בקשת החלפה": שם אפשר לבקש החלפה, או לדווח "לא יכול/ה להגיע" אם קרה משהו. בקשת החלפה מפרסמת את המשמרת בלוח ההחלפות, ועמיתים יכולים להציע לעזור. אי הגעה מעדכנת את הרכזת ופותחת את המשמרת להחלפה מיד. אנחנו כאן בשבילכם.', light:() => 'צריך שינוי? "בקשת החלפה" מציע החלפה (עמיתים יוכלו להציל את המצב) או דיווח שהפעם אי אפשר להגיע (הרכזת מקבלת הודעה והמשמרת נפתחת מיד). קורה לכולם.', brief:() => 'שינוי: "בקשת החלפה".' },
  change_title:{ warm:() => 'מה נוכל לעשות בשבילך?', light:() => 'מה משנים?', brief:() => 'סוג השינוי' },
  change_swap_sub:{ warm:() => 'מפרסמים את המשמרת בלוח ההחלפות, ועמיתים יכולים להציע לעזור', light:() => 'המשמרת עולה ללוח, ומישהו מציל את המצב', brief:() => 'פרסום בלוח ההחלפות' },
  change_cant_sub:{ warm:() => 'מעדכנים את הרכזת ופותחים את המשמרת להחלפה מיד', light:() => 'הרכזת מקבלת הודעה והמשמרת נפתחת מיד. קורה לכולם', brief:() => 'הרכזת מעודכנת, המשמרת נפתחת' },
  pick_swap_q:{ warm:(f) => f ? 'איזו משמרת תרצי להחליף?' : 'איזו משמרת תרצה להחליף?', light:(f) => f ? 'איזו משמרת תרצי להעביר הלאה?' : 'איזו משמרת תרצה להעביר הלאה?', brief:() => 'איזו משמרת להחליף?' },
  pick_cant_q:{ warm:(f) => f ? 'לאיזו משמרת לא תוכלי להגיע?' : 'לאיזו משמרת לא תוכל להגיע?', light:(f) => f ? 'לאיזו משמרת לא תוכלי להגיע?' : 'לאיזו משמרת לא תוכל להגיע?', brief:() => 'לאיזו משמרת אי אפשר להגיע?' },
  change_none:{ warm:() => 'כרגע אין משמרות עתידיות שאפשר לשנות מכאן. אם צריך, אפשר לפנות לרכזת.', light:() => 'אין משמרות עתידיות לשנות. ואם יש בכל זאת בעיה, הרכזת תעזור.', brief:() => 'אין משמרות לשינוי.' },
  swap_confirm:{ warm:(d, s, c) => `נפרסם את המשמרת ${d} (${s}) בלוח ההחלפות, ועמיתים יוכלו להציע לעזור.${c}`, light:(d, s, c) => `נעלה את המשמרת ${d} (${s}) ללוח ההחלפות, ומי שיכול ירים יד.${c}`, brief:(d, s, c) => `המשמרת ${d} (${s}) תפורסם בלוח ההחלפות.${c}` },
  swap_posted:{ warm:() => 'פרסמנו את המשמרת בלוח ההחלפות, ונעדכן אותך כשיימצא מחליף/ה', light:() => 'המשמרת בלוח. כשמישהו ירים יד, נעדכן', brief:() => 'פורסם בלוח ההחלפות' },
  swap_fail:  { warm:() => 'לא הצלחנו לפרסם כרגע. אפשר לנסות שוב בעוד רגע', light:() => 'לא הצלחנו להעלות עכשיו. עוד ניסיון בעוד רגע?', brief:() => 'הפרסום נכשל. נסו שוב' },
  cant_title: { warm:() => 'קורה, ואנחנו כאן. לדווח שלא תוכלו להגיע?', light:() => 'קורה לטובים ביותר. לדווח שלא תגיעו?', brief:() => 'לדווח על אי הגעה?' },
  cant_text:  { warm:(d, s, c) => `נעדכן עכשיו את הרכזת ונפתח את המשמרת ${d} (${s}) להחלפה, וגם המדריכים האחרים יקבלו הודעה. ההחלפה עצמה תחכה לאישור הרכזת.${c}`, light:(d, s, c) => `נעדכן את הרכזת ונפתח את המשמרת ${d} (${s}) להחלפה, וגם הצוות יקבל הודעה. ההחלפה תחכה לאישור הרכזת.${c}`, brief:(d, s, c) => `הרכזת והצוות יקבלו הודעה, והמשמרת ${d} (${s}) תיפתח להחלפה.${c}` },
  cant_reason_label:{ warm:(f) => f ? 'מה קרה? נשמח שתכתבי לנו את הסיבה (חובה)' : 'מה קרה? נשמח שתכתוב לנו את הסיבה (חובה)', light:(f) => f ? 'מה הסיפור? כתבי כאן את הסיבה (חובה)' : 'מה הסיפור? כתוב כאן את הסיבה (חובה)', brief:() => 'סיבה (חובה)' },
  cant_reason_hint:{ warm:() => 'למשל: לא מרגיש טוב, אירוע משפחתי...', light:() => 'למשל: הצטננות, ילד חולה, אירוע בלתי צפוי...', brief:() => 'סיבה קצרה' },
  cant_done:  { warm:() => 'עדכנו את הרכזת ופתחנו את המשמרת להחלפה. אין לכם מה לדאוג', light:() => 'עדכנו את הרכזת ופתחנו את המשמרת. תנוחו, אנחנו על זה', brief:() => 'דווח. המשמרת נפתחה להחלפה' },
  cant_fail:  { warm:() => 'לא הצלחנו לשלוח את העדכון כרגע. אפשר לנסות שוב בעוד רגע', light:() => 'העדכון לא יצא. עוד ניסיון בעוד רגע?', brief:() => 'השליחה נכשלה. נסו שוב' },
  cands:      { warm:(n) => ` עמיתים שזמינים למשמרת הזאת ולא שובצו אליה: ${n}. אפשר גם לפנות אליהם ישירות.`, light:(n) => ` עמיתים שפנויים למשמרת הזאת: ${n}. אפשר גם להרים טלפון ישירות.`, brief:(n) => ` זמינים: ${n}.` },
  // ---- swaps tab
  swaps_intro:{ warm:() => 'עמיתים שמחפשים מחליף/ה למשמרת. אם יש לכם אפשרות לעזור, לחצו על הכפתור והבקשה תעבור לרכזת. תודה שאתם שם אחד בשביל השני. כדי לבקש החלפה בעצמכם, פתחו "הסידור" ← "המשמרות שלי" ← "בקשת החלפה".', light:() => 'עמיתים שמחפשים מחליף/ה. אם אתם יכולים להציל משמרת, לחצו על הכפתור והבקשה תעבור לרכזת. גיבורים אנונימיים מקבלים תודה בקול. כדי לבקש החלפה בעצמכם: "הסידור" ← "המשמרות שלי" ← "בקשת החלפה".', brief:() => 'בקשות של עמיתים. לחיצה על הכפתור מעבירה לרכזת. לבקשה משלכם: "הסידור" ← "המשמרות שלי".' },
  swaps_none: { warm:() => 'כרגע אין בקשות החלפה פתוחות. תודה שאכפת לכם!', light:() => 'אין בקשות החלפה פתוחות. שקט ורגוע', brief:() => 'אין בקשות פתוחות.' },
  take_ok:    { warm:() => 'תודה! הבקשה הועברה לרכזת, ונעדכן את שניכם', light:() => 'תודה, גיבור/ה! הבקשה אצל הרכזת, ונעדכן את שניכם', brief:() => 'הועבר לרכזת' },
  take_fail:  { warm:() => 'לא הצלחנו כרגע, ייתכן שהמשמרת כבר נתפסה. תודה על הנכונות!', light:() => 'מישהו הקדים אותך, או שהמערכת התבלבלה. תודה על הנכונות!', brief:() => 'לא הצליח. ייתכן שנתפסה' },
  cancel_ok:  { warm:() => 'ביטלנו את הבקשה', light:() => 'הבקשה בוטלה', brief:() => 'בוטל' },
  cancel_fail:{ warm:() => 'לא הצלחנו לבטל כרגע. אפשר לנסות שוב בעוד רגע', light:() => 'הביטול לא עבר. עוד ניסיון בעוד רגע?', brief:() => 'הביטול נכשל. נסו שוב' },
  // ---- vacation
  vac_guide:  { warm:() => 'כדי שנצליח לתכנן את הצוות ולאשר את החופשה בקלות, נשמח לקבל בקשה של שבוע עד שלושה שבועות לפחות 30 יום מראש, ובקשה של שלושה שבועות ומעלה לפחות חודשיים מראש. אחרי שהרכזת מאשרת, הימים נכנסים אוטומטית כהיעדרות. (ליום או יומיים אפשר פשוט לסמן "היעדרות" בהעדפות.)', light:() => 'חופש זה חשוב, ותכנון זה עוד יותר: בקשה של שבוע עד שלושה שבועות כדאי להגיש 30 יום מראש, ושל שלושה שבועות ומעלה חודשיים מראש. אחרי שהרכזת מאשרת, הימים נכנסים לבד כהיעדרות.', brief:() => 'חופשה של 1-3 שבועות: 30 יום מראש. מעל 3 שבועות: חודשיים מראש. אחרי אישור הרכזת הימים נרשמים.' },
  vac_hint:   { warm:(d, k) => `זו חופשה של ${d} ימים. בדרך כלל כדאי להגיש חופשה כזו ${k}. אפשר לשלוח גם עכשיו, והרכזת תעשה כל מה שאפשר.`, light:(d, k) => `${d} ימים, וואו! בדרך כלל מגישים חופשה כזו ${k}, אבל אפשר לשלוח גם עכשיו והרכזת תעשה מאמץ.`, brief:(d, k) => `${d} ימים. מומלץ להגיש ${k}.` },
  vac_sent:   { warm:() => 'הבקשה נשלחה, תודה! הרכזת תחזור אליכם', light:() => 'הבקשה בדרך! הרכזת תחזור אליכם', brief:() => 'הבקשה נשלחה' },
  vac_fail:   { warm:() => 'לא הצלחנו לשלוח כרגע. אפשר לנסות שוב בעוד רגע', light:() => 'הבקשה לא יצאה. עוד ניסיון בעוד רגע?', brief:() => 'השליחה נכשלה. נסו שוב' },
  vac_none:   { warm:() => 'עדיין לא שלחתם בקשות.', light:() => 'עוד לא שלחתם בקשות. החופשה מחכה!', brief:() => 'אין בקשות.' },
  // ---- open shifts, availability, teachers
  open_intro: { warm:() => 'כאן מופיעות משמרות שעדיין חסר בהן מישהו, ורק אלה שאפשר לשבץ אליהן אתכם. תודה שאכפת לכם מהצוות! אפשר לבקש להצטרף למשמרת שנוחה לכם, הבקשה עוברת לרכזת, ותשובצו אחרי שתאשר.', light:() => 'כאן משמרות שעדיין מחפשות מישהו, ורק כאלה שמתאימות לכם. מבקשים להצטרף, הרכזת מאשרת, ורק אז אתם משובצים. כל משמרת שתיקחו מקבלת תודה אישית.', brief:() => 'משמרות חסרות שמתאימות לכם. בקשה עוברת לרכזת, ושיבוץ רק אחרי אישורה.' },
  open_waiting:{ warm:() => 'ממתין לאישור הרכזת', light:() => 'אצל הרכזת, מחכים לתשובה', brief:() => 'ממתין לאישור' },
  open_confirm_title:{ warm:() => 'לבקש להצטרף למשמרת?', light:() => 'מצטרפים?', brief:() => 'לבקש להצטרף?' },
  open_confirm:{ warm:(d, s) => `נשלח לרכזת בקשה שתצטרפו למשמרת ${d} (${s}). תשובצו אליה רק אחרי שתאשר, ונעדכן אתכם. תודה על העזרה!`, light:(d, s) => `הבקשה למשמרת ${d} (${s}) עוברת לרכזת. אחרי שתאשר, אתם בפנים, ונעדכן.`, brief:(d, s) => `בקשה למשמרת ${d} (${s}) תישלח לרכזת. שיבוץ רק אחרי אישורה.` },
  open_none:  { warm:() => 'כרגע אין משמרות חסרות. תודה שבדקת!', light:() => 'אין משמרות חסרות כרגע. הצוות מסודר!', brief:() => 'אין משמרות חסרות.' },
  open_ok:    { warm:() => 'הבקשה נשלחה לרכזת, ונעדכן אותך ברגע שתאשר. תודה על הרצון לעזור!', light:() => 'הבקשה אצל הרכזת. תודה, גיבורים!', brief:() => 'הבקשה נשלחה לרכזת' },
  open_fail:  { warm:() => 'לא הצלחנו לשלוח את הבקשה כרגע, ייתכן שהמשמרת כבר נתפסה. תודה על הנכונות!', light:() => 'מישהו הקדים אותך, או שהמערכת התבלבלה. תודה על הנכונות!', brief:() => 'השליחה נכשלה. ייתכן שנתפסה' },
  avail_ok:   { warm:() => 'תודה! הזמינות שלכן הוגשה ✓', light:() => 'הוגש! תודה ✓', brief:() => 'הוגש ✓' },
  retry:      { warm:() => 'לא הצלחנו לשמור כרגע. אפשר לנסות שוב בעוד רגע', light:() => 'השמירה נתקעה. עוד ניסיון בעוד רגע?', brief:() => 'השמירה נכשלה. נסו שוב' },
  // ---- inbox
  inbox_none: { warm:() => 'אין עדכונים חדשים כרגע.', light:() => 'אין חדש תחת השמש.', brief:() => 'אין עדכונים.' },
  inbox_nomsg:{ warm:() => 'אין הודעות חדשות כרגע.', light:() => 'אין הודעות, שקט.', brief:() => 'אין הודעות.' },
  // ---- the feedback after a schedule is published
  fb_intro:   { warm:(m) => `הסידור של ${m} פורסם, ורצינו לשתף אותך כבר עכשיו איך הלכו הבקשות שלך.`, light:(m) => `הסידור של ${m} יצא מהתנור! הנה סיכום קצר של איך הלכו הבקשות שלך.`, brief:(m) => `הסידור של ${m} פורסם. סיכום הבקשות:` },
  fb_nothing: { warm:(t) => `החודש לא סימנת בקשות מיוחדות, וניסינו לתת לך סידור נוח ככל האפשר. קיבלת ${t} משמרות.`, light:(t) => `לא סימנת בקשות מיוחדות, אז נתנו לך סידור נוח ככל האפשר: ${t} משמרות.`, brief:(t) => `לא סומנו בקשות. ${t} משמרות.` },
  fb_count:   { warm:(a, h) => `מתוך ${a} הבקשות שסימנת הצלחנו להיענות ל-${h}, ותודה ששיתפת אותנו. זה עוזר לנו לבנות סידור שמתאים לכולם.`, light:(a, h) => `מתוך ${a} בקשות, הצלחנו לכבד ${h}. תודה ששיתפת, זה עוזר לנו לבנות סידור שמתאים לכולם.`, brief:(a, h) => `${h} מתוך ${a} בקשות כובדו.` },
  fb_unmet:   { warm:(l) => `אלה הבקשות שהפעם לא הצלחנו לקיים, למרות שבאמת ניסינו:\n${l}\nלפעמים צריך להשלים צוות או לשמור על כללי הבטיחות והמנוחה. נמשיך לעשות כמיטב יכולתנו בחודשים הבאים.`, light:(l) => `את אלה הפעם לא הצלחנו לקיים, למרות שהתאמצנו (באמת):\n${l}\nלפעמים צריך להשלים צוות או לשמור על כללי בטיחות ומנוחה. בחודש הבא ננסה שוב.`, brief:(l) => `לא כובדו:\n${l}\nסיבה: השלמת צוות או כללי בטיחות.` },
  fb_close:   { warm:(g) => `אם משהו לא יושב לך טוב, אפשר לבקש החלפה בפורטל או לדבר עם הרכזת. אנחנו כאן בשבילך, ${g}.`, light:(g) => `אם משהו לא יושב טוב, אפשר לבקש החלפה בפורטל או לדבר עם הרכזת. ${g}!`, brief:() => `לשינוי: בקשת החלפה בפורטל או הרכזת.` },
  fb_thanks:  { warm:(f) => f ? 'תודה שאת חלק מהצוות' : 'תודה שאתה חלק מהצוות', light:(f) => f ? 'מי היה מאמין שיהיה צוות כל כך טוב בלעדייך' : 'מי היה מאמין שיהיה צוות כל כך טוב בלעדיך', brief:() => '' },
  fb_g_min_ok:{ warm:(t, c) => `ביקשת ${t}, וקיבלת ${c} משמרות, בדיוק במקום שרצית. תודה על השיתוף!`, light:(t, c) => `ביקשת ${t}, וקיבלת ${c} משמרות. בול!`, brief:(t, c) => `יעד: מינימום. התקבלו ${c} משמרות. הושג.` },
  fb_g_min_low:{ warm:(t, c) => `ביקשת ${t}. הפעם קיבלת ${c} משמרות, קצת מתחת למינימום, וזה לא קשור אלייך. נשמח להשלים את זה יחד.`, light:(t, c) => `ביקשת ${t}. קיבלת ${c} משמרות, קצת פחות מהמינימום, וזה לא באשמתך. נסדר יחד.`, brief:(t, c) => `יעד: מינימום. התקבלו ${c}, מתחת למינימום. נשלים מול הרכזת.` },
  fb_g_min_high:{ warm:(t, c) => `ביקשת ${t}. הפעם קיבלת ${c} משמרות, יותר מהמינימום, כי היינו צריכים עוד ידיים. אנחנו מודים לך על הגמישות.`, light:(t, c) => `ביקשת ${t}. קיבלת ${c} משמרות, יותר מהמינימום, כי חיפשנו עוד ידיים. תודה על הגמישות!`, brief:(t, c) => `יעד: מינימום. התקבלו ${c}, מעל המינימום (השלמת צוות).` },
  fb_g_max_ok:{ warm:(t, c) => `ביקשת ${t}, וקיבלת ${c} משמרות. תודה על הנכונות!`, light:(t, c) => `ביקשת ${t}, וקיבלת ${c} משמרות. עבודה יפה!`, brief:(t, c) => `יעד: מקסימום. התקבלו ${c} משמרות.` },
  fb_g_max_no:{ warm:(t, c) => `ביקשת ${t}. ניסינו לתת לך כמה שיותר, והפעם הגענו ל-${c} משמרות. לא הצלחנו לתת יותר בלי לפגוע בכללים ובצוות.`, light:(t, c) => `ביקשת ${t}. התאמצנו, והגענו ל-${c} משמרות. יותר מזה היה פוגע בכללים ובצוות.`, brief:(t, c) => `יעד: מקסימום. התקבלו ${c}. מעבר לכך לא היה אפשרי.` },
  fb_g_wk_ok: { warm:(t) => `ביקשת ${t}, ובכל שבוע קיבלת 4 או 5 משמרות. נהדר!`, light:(t) => `ביקשת ${t}, ובכל שבוע קיבלת 4 או 5. מושלם!`, brief:() => `יעד 4-5 בשבוע: הושג.` },
  fb_g_wk_no: { warm:(t, w, x) => `ביקשת ${t}. ניסינו, ובשבוע של ${w} יצא ${x}. לא תמיד הצלחנו להתאים את זה, ותודה על ההבנה.`, light:(t, w, x) => `ביקשת ${t}. בשבוע של ${w} יצא ${x}. לא תמיד זה מסתדר, ותודה על ההבנה.`, brief:(t, w, x) => `יעד 4-5 בשבוע: לא הושג (${w}: ${x}).` },
  fb_min_ok:  { warm:(t) => `וגם: עמדת במינימום של החודש (${t}). תודה על ההשקעה!`, light:(t) => `וגם עמדת במינימום של החודש (${t}). כל הכבוד!`, brief:() => 'המינימום הושלם.' },
  fb_min_gap: { warm:(t, g) => `לגבי המינימום (${t}): נשארו כמה משמרות שלא הצלחנו להשלים בשבילך:\n${g}\nזה לא קשור אלייך, ואין צורך להילחץ. אם נוח לך, אפשר לפנות לרכזת ונמצא יחד פתרון.`, light:(t, g) => `לגבי המינימום (${t}): כמה משמרות עוד לא השלמנו:\n${g}\nזה לא קשור אלייך, וגם אין סיבה להילחץ. אפשר לפנות לרכזת ולסדר יחד.`, brief:(t, g) => `המינימום לא הושלם:\n${g}\nלפנייה: הרכזת.` }
};
// the voice of the person now: the setting, else what the browser remembers, else the warm one
function portalVoice(){
  if(typeof arOn === 'function' && arOn()) return 'warm';          // (in Arabic there is one voice, the warm one)
  if(typeof srv !== 'undefined' && srv.voice) return srv.voice;
  try { const v = localStorage.getItem('ramzor-portal-voice'); if(v && VOICES.st_unsub[v]) return v; } catch(e){}
  return 'warm';
}
const tx = (key, ...args) => { if(typeof arOn === 'function' && arOn()){ const a = arVoice(key, args); if(a != null) return a; } const k = VOICES[key]; if(!k) return key; return (k[portalVoice()] || k.warm)(...args); };
// the same, for somebody else's voice (the coordinator writes the feedback in each person's own voice)
const txFor = (voice, key, ...args) => { if(voice === 'ar'){ const a = arVoice(key, args); if(a != null) return a; } const k = VOICES[key]; return (k && (k[voice] || k.warm))(...args); };          // (voice 'ar': the Arabic of an Arabic speaker)

// ---------------------------------------------------------------- the settings (the gear)
async function srvLoadSettings(){
  let hasCols = false; srv.pickOne = false; srv.showLong = false;
  try {
    let r = await sbPersonal.from('staff_settings').select('voice,reminders,pick_one,show_long').eq('staff_id', srv.me).maybeSingle();
    if(!r.error) hasCols = true; else r = await sbPersonal.from('staff_settings').select('voice,reminders').eq('staff_id', srv.me).maybeSingle();          // (before scheduling-v8.sql / v12.sql the columns do not exist)
    if(!r.error && r.data){ srv.voice = r.data.voice || null; srv.reminders = r.data.reminders !== false; srv.pickOne = !!r.data.pick_one; srv.showLong = !!r.data.show_long; }
  } catch(e){}
  srv.portalTheme = null;
  try { const t = await sbPersonal.from('staff_settings').select('portal_theme').eq('staff_id', srv.me).maybeSingle(); if(!t.error && t.data) srv.portalTheme = t.data.portal_theme || null; } catch(e){}          // (comes with scheduling-v16.sql)
  if(!srv.voice){ try { srv.voice = localStorage.getItem('ramzor-portal-voice') || null; } catch(e){} }
  srv.fixedNo = [];          // (fixed preferences: scheduling-v27.sql)
  try { const fx = await sbPersonal.from('staff_settings').select('fixed_no').eq('staff_id', srv.me).maybeSingle(); if(!fx.error && fx.data && Array.isArray(fx.data.fixed_no)) srv.fixedNo = fx.data.fixed_no; } catch(e){}
  srv.lang = (srv.profile && srv.profile.lang) || null;          // (the language: her own choice, else the admin's default; scheduling-v25.sql)
  try { const lg = await sbPersonal.from('staff_settings').select('lang').eq('staff_id', srv.me).maybeSingle(); if(!lg.error && lg.data && lg.data.lang) srv.lang = lg.data.lang; } catch(e){}
  if(!srv.lang){ try { srv.lang = localStorage.getItem('ramzor-portal-lang') || 'he'; } catch(e){ srv.lang = 'he'; } }
  try { localStorage.setItem('ramzor-portal-lang', srv.lang); } catch(e){}
  if(typeof arApply === 'function') arApply();
  if(!hasCols){ try { srv.pickOne = localStorage.getItem('ramzor-portal-pickone') === '1'; srv.showLong = localStorage.getItem('ramzor-portal-showlong') === '1'; } catch(e){} }          // (only until the columns exist)
}
async function srvSaveSetting(patch){
  Object.assign(srv, patch);
  if(patch.voice){ try { localStorage.setItem('ramzor-portal-voice', patch.voice); } catch(e){} }
  if('pickOne' in patch){ try { localStorage.setItem('ramzor-portal-pickone', patch.pickOne ? '1' : '0'); } catch(e){} }
  if('showLong' in patch){ try { localStorage.setItem('ramzor-portal-showlong', patch.showLong ? '1' : '0'); } catch(e){} }
  try {
    const row = { staff_id:srv.me }; if('voice' in patch) row.voice = patch.voice; if('reminders' in patch) row.reminders = patch.reminders; if('pickOne' in patch) row.pick_one = !!patch.pickOne; if('showLong' in patch) row.show_long = !!patch.showLong; if('portalTheme' in patch) row.portal_theme = patch.portalTheme;
    const r = await sbPersonal.from('staff_settings').upsert(row);
    return !r.error;
  } catch(e){ return false; }
}
function openPortalSettings(){
  const coord = leopardAllowed(), leo = coord && portalThemeNow() === 'leopard';          // (the leopard look: exclusive — the coordinator, the admin, and whom the admin chose; never the default)          // (the leopard look: only the coordinator's portal)
  const st = portalLoad(), v = portalVoice(), dark = st.settings.theme === 'dark', big = (() => { try { return localStorage.getItem('ramzor-portal-big') || '0'; } catch(e){ return '0'; } })();          // ('0' usual, '1' large, '2' very large)
  const sh = portalSheet(`<h2>העדפות מערכת</h2>
    ${portalAsCoord(portalMe()) ? '' : `<h3 class="psec">שפה · اللغة</h3>
    <div class="pchoice wrap ar-keep"><button type="button" class="${srv.lang === 'ar' ? '' : 'on'}" data-set-lang="he">עברית</button><button type="button" class="${srv.lang === 'ar' ? 'on' : ''}" data-set-lang="ar">العربية</button></div>`}
    ${arOn() ? '' : `<h3 class="psec">באיזו שפה נדבר איתך?</h3>
    <div class="pgoal-list" role="group" aria-label="שפת המערכת">${Object.keys(VOICE_NAMES).map(k => `<button type="button" class="pgoal-opt${v === k ? ' on' : ''}" data-voice="${k}"><b>${VOICE_NAMES[k]}</b><small>${VOICE_SAMPLE[k]}</small></button>`).join('')}</div>`}
    <h3 class="psec">מראה</h3>
    <div class="pchoice wrap"><button type="button" class="${dark && !leo ? 'on' : ''}" data-set-theme="dark">מצב כהה</button><button type="button" class="${dark || leo ? '' : 'on'}" data-set-theme="light">מצב בהיר</button>${coord ? `<button type="button" class="${leo ? 'on' : ''}" data-set-theme="leopard">מצב מנומר 🐆</button>` : ''}</div>
    <div class="pchoice wrap" style="margin-top:8px"><button type="button" class="${big === '0' ? 'on' : ''}" data-set-big="0">טקסט רגיל</button><button type="button" class="${big === '1' ? 'on' : ''}" data-set-big="1">טקסט גדול</button><button type="button" class="${big === '2' ? 'on' : ''}" data-set-big="2">טקסט גדול מאוד</button></div>
    ${srv.meRow && srv.meRow.role === 'instructor' ? `<h3 class="psec">העדפות קבועות</h3>
    <div class="pnote">מה שמסמנים כאן מופיע אצלך "לא" בכל חודש. אפשר לבחור יותר מאחד, ואפשר תמיד לשנות משמרת מסוימת בלחיצה עליה.</div>
    <div class="pchoice wrap fixed-no">${[['m', 'לא עושה בקרים'], ['e', 'לא עושה צהריים'], ['n', 'לא עושה לילות']].map(([k, w]) => { const admin = k === 'n' && srv.profile && srv.profile.no_nights; return `<button type="button" class="${admin || (srv.fixedNo || []).includes(k) ? 'on' : ''}" data-fixed-no="${k}"${admin ? ' disabled title="הוגדר בפורטל הניהול"' : ''}>${w}</button>`; }).join('')}</div>
    <h3 class="psec">סופי שבוע</h3>
    <div class="pchoice wrap"><button type="button" class="${srv.showLong ? 'on' : ''}" data-set-long="1">להציג סופ"ש ארוך: כן</button><button type="button" class="${srv.showLong ? '' : 'on'}" data-set-long="0">לא</button></div>
    <div class="pnote">${tx('long_setting')}</div>
    <div class="pchoice wrap" style="margin-top:8px"><button type="button" class="${srv.pickOne ? 'on' : ''}" data-set-pick="1">להציג "רק אחד מאלה": כן</button><button type="button" class="${srv.pickOne ? '' : 'on'}" data-set-pick="0">לא</button></div>
    <div class="pnote">${tx('pick_setting')}</div>` : ''}
    <button type="button" class="btn ghost" id="gear-problem" style="margin-top:14px;width:100%">משהו לא עובד? דיווח על תקלה</button>
    <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>סיום</button></div>`);
  sh.querySelector('#gear-problem').addEventListener('click', () => { sh.close(); openProblemReport(); });
  sh.querySelectorAll('[data-fixed-no]').forEach(b => b.addEventListener('click', async () => {
    const k = b.dataset.fixedNo, cur = new Set(srv.fixedNo || []); if(cur.has(k)) cur.delete(k); else cur.add(k);
    const next = ['m', 'e', 'n'].filter(x => cur.has(x)), was = srv.fixedNo; srv.fixedNo = next; b.classList.toggle('on', cur.has(k));
    let ok = false; try { const r = await sbPersonal.from('staff_settings').upsert({ staff_id:srv.me, fixed_no:next }); ok = !r.error; } catch(e){}
    if(!ok){ srv.fixedNo = was; b.classList.toggle('on', (was || []).includes(k)); toast('לא הצלחנו לשמור כרגע. אפשר לנסות שוב בעוד רגע'); return; }
    toast('נשמר. ההעדפה תופיע בכל חודש');
    if(portalUi.tab === 'prefs'){ const body = document.getElementById('portal-body'); if(body) renderInstructorPrefs(body); }
  }));
  sh.querySelectorAll('[data-set-lang]').forEach(b => b.addEventListener('click', async () => {
    const lang = b.dataset.setLang; if(lang === srv.lang) return;
    await srvSaveLang(lang); sh.close(); arApply(); showPortal(); toast(lang === 'ar' ? 'تم تغيير اللغة إلى العربية' : 'השפה הוחלפה לעברית');
  }));
  sh.querySelectorAll('[data-voice]').forEach(b => b.addEventListener('click', async () => {
    await srvSaveSetting({ voice:b.dataset.voice }); sh.close(); toast(({ warm:'בחרנו בשפה החמה והרכה', light:'עברנו לשפה הקלילה. נתראה בבדיחות!', brief:'עברנו לשפה קצרה ועניינית' })[b.dataset.voice]); showPortal();
  }));
  sh.querySelectorAll('[data-set-theme]').forEach(b => b.addEventListener('click', async () => {
    const th = b.dataset.setTheme;
    if(th === 'leopard'){ srv.portalTheme = 'leopard'; sh.close(); showPortal(); await srvSaveSetting({ portalTheme:'leopard' }); return; }
    st.settings.theme = th; try { localStorage.setItem('ramzor-portal-theme', th); } catch(e){}
    srv.portalTheme = th; sh.close(); showPortal();          // (her own choice is kept, so the coordinator's default leopard does not come back)
    await srvSaveSetting({ portalTheme:th });
  }));
  sh.querySelectorAll('[data-set-long]').forEach(b => b.addEventListener('click', async () => {
    const on = b.dataset.setLong === '1';
    if(!on){ Object.keys(st.months).forEach(mk => { if(srvPrefsOpen(mk)){ const p = srvPrefsOf(st.months[mk], srv.me); Object.keys(p.slots).filter(k => k.endsWith('|l')).forEach(k => { delete p.slots[k]; }); } }); portalSave(); }          // (hiding it takes its marks back, so the system does not act on what is no longer shown)
    await srvSaveSetting({ showLong:on }); sh.close(); showPortal();
  }));
  sh.querySelectorAll('[data-set-pick]').forEach(b => b.addEventListener('click', async () => {
    const on = b.dataset.setPick === '1';
    if(!on){ Object.keys(st.months).forEach(mk => { if(srvPrefsOpen(mk)) srvPrefsOf(st.months[mk], srv.me).pick = []; }); portalSave(); }          // (switching the option off takes the marks back, so the system does not act on what is no longer shown)
    await srvSaveSetting({ pickOne:on }); sh.close(); showPortal();
  }));
  sh.querySelectorAll('[data-set-big]').forEach(b => b.addEventListener('click', () => { try { localStorage.setItem('ramzor-portal-big', b.dataset.setBig); } catch(e){} applyPortalSize(); sh.close(); openPortalSettings(); }));
}
function applyPortalSize(){
  let big = '0'; try { big = localStorage.getItem('ramzor-portal-big') || '0'; } catch(e){}
  document.body.classList.toggle('portal-big', big === '1');
  document.body.classList.toggle('portal-huge', big === '2');
}
