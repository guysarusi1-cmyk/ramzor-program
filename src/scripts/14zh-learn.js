// ---------- THE LEARNING AREA ("לומדה"): training videos of the portal (Guy 2026-10-28) ----------
// A video is the real portal, drawn with made-up people inside a phone, with a finger that taps, captions and the computer voice (when the
// device has a Hebrew one). The phone is the site itself in a frame ("#learnframe"): nothing in it talks to a server, and the screens are the
// real ones, so a video stays right when a screen changes. "#learn:<id>" plays one video and needs no sign-in, so a link can be sent in
// WhatsApp to a group or to one person; "#learn" lists them all. The admin has a "לומדה" tab with the list, a share button and a watch button.
// More content will be added here later (the coordinator's portal is next).
const learnOn = () => /^#learn(:|$)/.test(location.hash);
const learnFrameOn = () => /^#learnframe/.test(location.hash) && !!sbPersonal;

// ---------------------------------------------------------------- the videos
// A step: scene (a fresh screen in the phone: a new chapter starts with one), card (a title over the phone), say (the caption and the voice),
// hl (a selector to light up), type [selector, text], tap (a selector the finger presses: a real click in the phone), act (a change in the phone first)
const LEARN_ITEMS = [
  { id:'overview', group:'מבט על', icon:'🚦', title:'המערכת במבט על', sub:'הרמזור, מסך הילדים, מערכת הסידור ופורטל הטיפול, בפחות מדקה', who:'הצגה',
    end:'הכל במקום אחד: מהטלפון, מהמחשב ועל המסך בחדר.',
    chapters:[
      { title:'פתיחה', steps:[
        { scene:'ramzor', card:{ ic:'🚦', title:'מרכז החירום<br>המערכת במבט על', sub:'הרמזור · מסך הילדים · הסידור · הטיפול' }, say:'המערכת של מרכז החירום: כלי אחד לצוות, לילדים ולטיפול.' }]},
      { title:'הרמזור ומסך הילדים', steps:[
        { scene:'ramzor', say:'הרמזור: לכל התנהגות צבע, ולכל צבע פרוטוקול ברור, צעד אחרי צעד.', hl:'#quick-light-rows' },
        { scene:'tv', device:'wide', say:'במסך שבחדר, הילדים רואים כוכבים, בונוסים ואת המסע בחלל, בזמן אמת.' }]},
      { title:'מערכת הסידור', steps:[
        { scene:'prefs-filled', say:'בסידור העבודה, כל מדריך מסמן מהטלפון מתי נוח לו לעבוד.', hl:'.pcal' },
        { scene:'coord', device:'wide', say:'הרכזת בונה בלחיצה סידור חודשי, לפי ההעדפות, המנוחה וכללי הבטיחות.', hl:'#portal-body .cs-layout' },
        { scene:'swaps', say:'החלפות ומשמרות פתוחות מתנהלות במערכת, והרכזת רק מאשרת.', hl:'details[data-fold="swopen"] .pfold-body' }]},
      { title:'פורטל הטיפול', steps:[
        { scene:'therapy-plan', say:'בפורטל הטיפול בונים לכל ילד תוכנית: מטרות, יעדים ודרכי התערבות.' },
        { scene:'therapy-staff', say:'והמדריכים רואים לכל ילד מה עושים, וממה להימנע.' }]},
      { title:'סיום', steps:[
        { card:{ ic:'✨', title:'הכל במקום אחד', sub:'מהטלפון, מהמחשב ועל המסך בחדר' }, say:'הכל במקום אחד: בטלפון, במחשב ועל המסך בחדר.' }]}
    ]},
  { id:'inst-login', group:'פורטל המדריך', icon:'👋', title:'כניסה לפורטל', sub:'כניסה ראשונה עם קוד במייל, סיסמה אישית ומסך הבית', who:'מדריכים',
    end:'עכשיו אתם יודעים להיכנס. בסרטון הבא: הסידור שלי.',
    chapters:[
      { title:'פתיחה', steps:[
        { scene:'login', card:{ ic:'👋', title:'כניסה לפורטל', sub:'סרטון הדרכה למדריכים' }, say:'בסרטון הזה נלמד איך נכנסים לפורטל המדריך, בפעם הראשונה ובפעמים הבאות.' }]},
      { title:'כניסה ראשונה', steps:[
        { scene:'login', say:'בכניסה הראשונה מקלידים את כתובת המייל שלכם, זו שמסרתם לרכזת.', type:['#plogin-email', 'noa@example.com'] },
        { say:'ולוחצים על "שלחו לי קוד למייל".', tap:'#plogin-send' },
        { say:'תוך דקה מגיע למייל קוד של שש ספרות. אם הוא לא מגיע, כדאי לבדוק גם בתיקיית הספאם.', hl:'.plogin .pnote' },
        { say:'מקלידים את הקוד, ולוחצים "כניסה".', type:['#plogin-code', '482915'], tap:'#plogin-verify' },
        { say:'עכשיו בוחרים סיסמה אישית, לפחות שמונה תווים.', type:['#plogin-new', 'noa12345'] },
        { say:'מקלידים אותה שוב, ולוחצים "שמירה וכניסה".', type:['#plogin-new2', 'noa12345'], tap:'#plogin-setpw' },
        { scene:'login', say:'מהפעם הבאה נכנסים עם המייל והסיסמה, בלי לחכות לקוד. שכחתם את הסיסמה? לוחצים שוב "שלחו לי קוד למייל".', hl:'#plogin-pw' }]},
      { title:'מסך הבית', steps:[
        { scene:'home', say:'אחרי הכניסה מגיעים למסך הבית. בוחרים "פורטל המדריך".', hl:'#apphome-portal', tap:'#apphome-portal' }]},
      { title:'סיום', steps:[
        { card:{ ic:'✅', title:'זהו!', sub:'בסרטון הבא: הסידור שלי' }, say:'זהו, נכנסתם. בסרטון הבא נראה את הסידור שלכם.' }]}
    ]},
  { id:'inst-schedule', group:'פורטל המדריך', icon:'📅', title:'הסידור שלי', sub:'ההודעות, המשמרת הבאה, המשמרות שלי וסידור הצוות', who:'מדריכים',
    end:'עכשיו אתם יודעים לקרוא את הסידור. בסרטון הבא: מילוי העדפות.',
    chapters:[
      { title:'פתיחה', steps:[
        { scene:'schedule', card:{ ic:'📅', title:'הסידור שלי', sub:'סרטון הדרכה למדריכים' }, say:'בסרטון הזה נלמד איך רואים את סידור העבודה: שלכם, ושל כל הצוות.' }]},
      { title:'הסידור שלי', steps:[
        { scene:'schedule', say:'זה פורטל המדריך. למעלה יש לשוניות: הסידור, העדפות, החלפות, חופשה והודעות. עכשיו אנחנו בלשונית "הסידור".', hl:'.portal-tabs' },
        { say:'הודעות חדשות מחכות כאן, למעלה. לוחצים כדי לפתוח אותן.', hl:'details[data-fold="notices"] > summary', tap:'details[data-fold="notices"] > summary' },
        { say:'אחרי שקוראים, לוחצים "הבנתי, תודה", וההודעה יורדת.', hl:'[data-notice-ok]', tap:'[data-notice-ok]' },
        { say:'בשורה הזו תמיד רואים את המשמרת הבאה שלכם: היום, סוג המשמרת והשעות.', hl:'#pnext-line' },
        { say:'עם החצים עוברים בין החודשים.', hl:'#portal-body .pmonth' },
        { say:'לחיצה על "המשמרות שלי" פותחת את כל המשמרות שלכם בחודש.', tap:'details[data-fold="mine"] > summary' },
        { say:'המשמרת הבאה מסומנת, ומשמרות שכבר עברו מופיעות בצבע חלש יותר.', hl:'details[data-fold="mine"] .pmine' }]},
      { title:'סידור הצוות', steps:[
        { scene:'schedule', act:'markMine', say:'מתחת נמצא הסידור של כל הצוות, לפי ימים ומשמרות.', hl:'#ln-team-week' },
        { say:'השם שלכם מודגש. לחיצה עליו, במשמרת שעוד לא עברה, פותחת בקשת החלפה או דיווח שלא תוכלו להגיע.', hl:'#ln-next-me', tap:'#ln-next-me' },
        { say:'על החלפות יש סרטון נפרד. בינתיים, "חזרה".', hl:'.psheet [data-close]', tap:'.psheet [data-close]' }]},
      { title:'סיום', steps:[
        { card:{ ic:'✅', title:'זהו!', sub:'בסרטון הבא: מילוי העדפות' }, say:'זהו. בסרטון הבא נלמד למלא העדפות לחודש הבא.' }]}
    ]},
  { id:'inst-prefs', group:'פורטל המדריך', icon:'🗓️', title:'מילוי העדפות', sub:'לשונית ההעדפות וסימון כן, יכול ולא', who:'מדריכים',
    end:'עכשיו אתם יודעים לסמן העדפות. בסרטון הבא: יעד והגשה.',
    chapters:[
      { title:'פתיחה', steps:[
        { scene:'schedule', card:{ ic:'🗓️', title:'מילוי העדפות', sub:'סרטון הדרכה למדריכים' }, say:'בסרטון הזה נלמד איך מסמנים את ההעדפות לחודש הבא.' }]},
      { title:'לשונית ההעדפות', steps:[
        { scene:'schedule', say:'את ההעדפות לחודש הבא ממלאים בלשונית "העדפות".', hl:'[data-ptab="prefs"]', tap:'[data-ptab="prefs"]' },
        { say:'בשורה הזו רואים אם כבר הגשתם, ועד מתי אפשר להגיש: עד ה-24 בחודש, בעשר וחצי בלילה. כל סימון נשמר מיד.', hl:'#portal-body .pstatus' },
        { say:'אם משהו לא ברור, "איך ממלאים?" פותח הסבר קצר.', hl:'details[data-fold="prefhelp"] > summary' },
        { say:'יש לכם העדפה קבועה, למשל שאתם לא עושים לילות? מגדירים אותה ב"שינוי", והיא תסומן לבד בכל חודש.', hl:'#prefs-fixed-line' },
        { say:'וכאן רואים את השעות של כל משמרת: בוקר, צהריים ולילה.', hl:'.pshift-key' }]},
      { title:'סימון המשמרות', steps:[
        { scene:'prefs', act:'markPrefs', say:'בלוח, בכל יום יש שלוש משמרות: בוקר, צהריים ולילה. בהתחלה אף משמרת לא מסומנת.', hl:'#ln-week1' },
        { say:'בתחתית בוחרים רמה. "כן": אשמח לקבל. "יכול": אפשר, אבל פחות נוח. "לא": לא מתאים.', hl:'.plevelbar' },
        { say:'נבחר "כן"...', tap:'.plevelbar [data-plevel="yes"]' },
        { act:'markPrefs', say:'ונלחץ על המספר של היום, כדי לסמן את כל המשמרות שלו.', tap:'#ln-day1' },
        { act:'markPrefs', say:'אפשר גם ללחוץ על משמרת אחת. נבחר "לא"...', tap:'.plevelbar [data-plevel="no"]' },
        { act:'markPrefs', say:'ונלחץ על הלילה של אותו יום.', tap:'#ln-night1' },
        { act:'markPrefs', say:'"יכול" מסמנים באותה דרך: בוחרים "יכול"...', tap:'.plevelbar [data-plevel="avoid"]' },
        { act:'markPrefs', say:'ולוחצים על יום, או על משמרת.', tap:'#ln-day2' },
        { act:'markPrefs', say:'לחיצה נוספת עם אותה רמה מחזירה את המשמרות למצב שלא סומן.', tap:'#ln-day2' },
        { say:'"שעות אחרות" מתאים כשאתם זמינים רק בחלק מהשעות: בוחרים אותו, לוחצים על היום, ומסמנים את השעות.', hl:'.plevelbar [data-plevel="hours"]' },
        { say:'ו"נקה הכל" מוחק את כל הסימונים, אם רוצים להתחיל מחדש.', hl:'#prefs-clear-all' }]},
      { title:'סיום', steps:[
        { card:{ ic:'✅', title:'זהו!', sub:'בסרטון הבא: יעד והגשה' }, say:'זהו. בסרטון הבא נלמד איך מגישים את ההעדפות.' }]}
    ]},
  { id:'inst-submit', group:'פורטל המדריך', icon:'📨', title:'יעד והגשה', sub:'יעד חודשי, שתי השאלות, הערה לרכזת והגשת ההעדפות', who:'מדריכים',
    end:'עכשיו אתם יודעים להגיש העדפות. בסרטון הבא: בקשת החלפה.',
    chapters:[
      { title:'פתיחה', steps:[
        { scene:'prefs-filled', card:{ ic:'📨', title:'יעד והגשה', sub:'סרטון הדרכה למדריכים' }, say:'בסרטון הזה נלמד איך מסיימים את ההעדפות ומגישים אותן.' }]},
      { title:'יעד ושתי שאלות', steps:[
        { scene:'prefs-filled', say:'אחרי שעוברים על כל החודש, גוללים למטה. כאן אפשר לספר כמה משמרות ירגישו לכם נכון החודש. זה לא חובה.', hl:'.pgoal' },
        { say:'למשל, ארבע עד חמש משמרות בכל שבוע.', tap:'.pgoal [data-goal="weekly45"]' },
        { say:'ועוד שתי שאלות קצרות לכל חודש. עונים "כן", "לא", או "תבדקו איתי".', hl:'.pconsents' },
        { say:'בשאלה הראשונה נבחר "כן"...', tap:'[data-consent="extend:1"]' },
        { say:'ובשנייה, "תבדקו איתי".', tap:'[data-consent="pull:ask"]' },
        { say:'יש משהו שחשוב לכם שהרכזת תדע? כותבים אותו כאן.', type:['#prefs-note', 'ב-14 בחודש יום הולדת במשפחה, אשמח לא לעבוד בערב'] }]},
      { title:'הגשה', steps:[
        { scene:'prefs-filled', act:'answerAll', say:'בסוף לוחצים "הגשת ההעדפות".', hl:'#prefs-submit', tap:'#prefs-submit' },
        { say:'אם נשארו משמרות שלא סימנתם, המערכת שואלת מה לעשות איתן: לסמן "יכול", לסמן "לא", או לחזור ולסמן.', hl:'.unmarked-choices' },
        { say:'נבחר "יכול".', tap:'[data-um="can"]' },
        { say:'זהו, ההעדפות הוגשו. עד מועד הסגירה אפשר לשנות, וללחוץ "עדכון והגשה מחדש".', hl:'#portal-body .pstatus' }]},
      { title:'סיום', steps:[
        { card:{ ic:'✅', title:'זהו!', sub:'בסרטון הבא: בקשת החלפה' }, say:'זהו, ההעדפות אצל הרכזת. בסרטון הבא נלמד לבקש החלפה.' }]}
    ]},
  { id:'inst-swaps', group:'פורטל המדריך', icon:'🔄', title:'בקשת החלפה', sub:'בקשת החלפה, ומה עושים כשלא יכולים להגיע', who:'מדריכים',
    end:'עכשיו אתם יודעים לבקש החלפה. בסרטון הבא: עזרה לצוות ומשמרות פתוחות.',
    chapters:[
      { title:'פתיחה', steps:[
        { scene:'schedule-mine', card:{ ic:'🔄', title:'בקשת החלפה', sub:'סרטון הדרכה למדריכים' }, say:'בסרטון הזה נלמד מה עושים כשצריכים שמישהו יחליף אתכם.' }]},
      { title:'בקשת החלפה', steps:[
        { scene:'schedule-mine', say:'צריכים שמישהו יחליף אתכם? בלשונית "הסידור", ב"המשמרות שלי", לוחצים "בקשת החלפה".', hl:'#want-change', tap:'#want-change' },
        { say:'בוחרים "בקשת החלפה"...', tap:'.psheet [data-change="swap"]' },
        { say:'ובוחרים את המשמרת.', tap:'.psheet [data-pick-shift]' },
        { say:'המערכת מראה מי מהצוות פנוי למשמרת, ושואלת אם לפרסם. לוחצים "כן, לפרסם".', hl:'.confirm-sheet .sheet-card', tap:'.confirm-sheet .confirm-ok' },
        { say:'הבקשה פורסמה לכל המדריכים. ליד המשמרת רואים מה המצב שלה.', hl:'details[data-fold="mine"] .pst' }]},
      { title:'לא יכול/ה להגיע', steps:[
        { scene:'schedule-mine', say:'ואם פתאום אי אפשר להגיע? לוחצים שוב "בקשת החלפה"...', tap:'#want-change' },
        { say:'בוחרים "לא יכולה להגיע"...', tap:'.psheet [data-change="cant"]' },
        { say:'ואת המשמרת.', tap:'.psheet [data-pick-shift]' },
        { say:'כותבים בקצרה את הסיבה.', type:['#cant-reason', 'חולה, עם חום'] },
        { say:'ולוחצים "כן, לדווח". הדיווח מגיע מיד לרכזת, ומתפרסם לצוות כבקשה דחופה.', tap:'#cant-go' }]},
      { title:'סיום', steps:[
        { card:{ ic:'✅', title:'זהו!', sub:'בסרטון הבא: עזרה לצוות' }, say:'זהו. בסרטון הבא נלמד איך עוזרים לחברי הצוות.' }]}
    ]},
  { id:'inst-help', group:'פורטל המדריך', icon:'🤝', title:'עזרה לצוות ומשמרות פתוחות', sub:'לשונית ההחלפות, החלפה של חבר צוות והצטרפות למשמרת חסרה', who:'מדריכים',
    end:'עכשיו אתם יודעים לעזור לצוות ולהצטרף למשמרות פתוחות.',
    chapters:[
      { title:'פתיחה', steps:[
        { scene:'swaps', card:{ ic:'🤝', title:'עזרה לצוות<br>ומשמרות פתוחות', sub:'סרטון הדרכה למדריכים' }, say:'בסרטון הזה נלמד איך עוזרים לחברי הצוות, ואיך מצטרפים למשמרת שחסר בה מישהו.' }]},
      { title:'לשונית ההחלפות', steps:[
        { scene:'swaps', say:'בלשונית "החלפות" רואים את הבקשות שלכם, ומה המצב של כל אחת.', hl:'details[data-fold="swmine"]' },
        { say:'ומתחת, בקשות של חברי צוות שמחפשים מחליף. בקשה דחופה מסומנת.', hl:'details[data-fold="swopen"] .pfold-body' },
        { say:'רוצים לעזור? לוחצים "אני יכול/ה להחליף".', tap:'[data-swap-take]' },
        { say:'ההצעה עוברת לרכזת. אחרי שהיא מאשרת, הסידור מתעדכן, ושניכם מקבלים הודעה.', hl:'details[data-fold="swmine"]' },
        { say:'ובבקשה שלכם, "מי זמין/ה?" מראה עמיתים פנויים למשמרת. אפשר לפנות אליהם ישירות.', tap:'[data-cands]' },
        { say:'"תודה" סוגר.', tap:'.psheet [data-close]' }]},
      { title:'משמרות פתוחות', steps:[
        { scene:'schedule', say:'לפעמים יש משמרת שחסר בה מישהו. רואים את זה בלשונית "הסידור", ב"משמרות פתוחות".', tap:'details[data-fold="openshifts"] > summary' },
        { say:'הרשימה מסודרת לפי ימים, וליד כל משמרת כתוב כמה חסרים.', hl:'#open-fold-body' },
        { say:'רוצים להצטרף? לוחצים "אשמח להצטרף"...', tap:'[data-ojoin]' },
        { say:'ומאשרים. הבקשה נשלחת לרכזת.', tap:'.confirm-sheet .confirm-ok' },
        { say:'עד שהרכזת מאשרת, כתוב "מחכה לאישור". אפשר גם לבטל.', hl:'#open-fold-body .pst' }]},
      { title:'סיום', steps:[
        { card:{ ic:'✅', title:'זהו!', sub:'תודה שאתם עוזרים זה לזה' }, say:'זהו. תודה שאתם עוזרים זה לזה.' }]}
    ]},
];
const learnItem = id => LEARN_ITEMS.find(x => x.id === id);
const learnSteps = v => { const out = []; v.chapters.forEach((c, ci) => c.steps.forEach((s, si) => out.push(Object.assign({}, s, { ci, first:si === 0 })))); return out; };
const learnReadMs = t => Math.max(2600, String(t || '').length * 62 + 900);
const learnMinutes = v => Math.max(1, Math.round(learnSteps(v).reduce((a, s) => a + learnReadMs(s.say) + (s.tap ? 1300 : 0) + (s.type ? s.type[1].length * 90 : 0), 0) / 60000));
const learnUrl = id => location.origin + location.pathname + '#learn:' + id;

// ---------------------------------------------------------------- the admin's tab: the list, watch, share
function learnAdminRender(body){
  body.innerHTML = `<div class="pnote">סרטוני הדרכה קצרים. כל סרטון נפתח מקישור, בלי כניסה לפורטל, אז אפשר לשלוח אותו בוואטסאפ לקבוצה או למדריך מסוים. אין בסרטונים שמות אמיתיים.</div>
    ${[...new Set(LEARN_ITEMS.map(v => v.group))].map(g => `<h2 class="psec">${pEsc(g)}</h2>${LEARN_ITEMS.filter(v => v.group === g).map(v => `<div class="learn-row"><span class="learn-ic" aria-hidden="true">${v.icon}</span><span class="learn-txt"><b>${pEsc(v.title)}</b><small>${pEsc(v.sub)} · כ-${learnMinutes(v)} דק'</small></span>
      <span class="learn-acts"><a class="btn ghost small" href="#learn:${v.id}" target="_blank" rel="noopener">▶ צפייה</a><a class="btn small" href="${pEsc(waUrl('', `סרטון הדרכה: ${v.title}\n${learnUrl(v.id)}`))}"${waTarget()}>שיתוף בוואטסאפ</a></span></div>`).join('')}`).join('')}
    <div class="pnote pnote-soft">בוואטסאפ בוחרים למי לשלוח: קבוצה או אדם אחד.</div>`;
}

// ---------------------------------------------------------------- inside the phone: the portal with made-up people, no server
const learnFx = { open:{}, nextId:1 };
function learnFakeClient(client){
  const ok = v => ({ data:v, error:null });
  // a query of a table: the made-up rows of that table, filtered by eq / in; single / maybeSingle give one row (a write simply succeeds)
  const chain = (v, table) => { const f = [], st = { one:false }; let p = null;
    const run = () => p || (p = Promise.resolve(ok((() => { if(typeof v !== 'function') return v; let rows = v();
      f.forEach(([op, c, x]) => { rows = rows.filter(r => op === 'eq' ? r[c] === x : (x || []).includes(r[c])); }); return st.one ? rows[0] || null : rows; })())));
    const q = new Proxy(function(){}, { apply:() => q, get:(t, k) => k === 'then' ? (a, b) => run().then(a, b) : k === 'catch' ? e => run().catch(e) : k === 'finally' ? e => run().finally(e)
      : (...a) => { if(k === 'eq' || k === 'in') f.push([k, a[0], a[1]]); if(k === 'single' || k === 'maybeSingle') st.one = true; if(['insert', 'update', 'upsert', 'delete'].includes(k)) v = null; return q; } });
    return q; };
  client.from = table => chain(() => (LEARN_TABLES[table] || (() => []))(), table);
  client.rpc = (name, args) => chain(learnRpc(name, args || {}));
  client.channel = () => { const c = new Proxy({}, { get:(t, k) => k === 'then' ? undefined : () => c }); return c; };          // (realtime: every call answers quietly)
  client.removeChannel = () => Promise.resolve();
  if(client.auth){
    try { client.auth.stopAutoRefresh(); } catch(e){}
    const none = async () => ({ data:{}, error:null });
    Object.assign(client.auth, { getSession:async () => ({ data:{ session:null }, error:null }), getUser:async () => ({ data:{ user:{ user_metadata:{} } }, error:null }),
      signInWithOtp:none, verifyOtp:none, updateUser:none, signInWithPassword:none, signOut:none, onAuthStateChange:() => ({ data:{ subscription:{ unsubscribe(){} } } }) });
  }
}
// the Ramzor's made-up data: children, their stars and journey, the bonus lists (for the overview video)
const LEARN_KIDS = ['נועם', 'מאיה', 'איתן', 'שירה', 'עידו', 'ליה', 'יואב', 'תמר'];
const LEARN_TABLES = {
  roster:() => LEARN_KIDS.map((n, i) => ({ id:'k' + i, first_name:n, last_initial:'', age:String(5 + i % 6), sw_name:'', sw_phone:'' })),
  child_state:() => LEARN_KIDS.map((n, i) => ({ child_id:'k' + i, stars:[3, 5, 1, 4, 2, 6, 0, 3][i], moon_steps:[4, 2, 6, 1, 5, 3, 2, 8][i], moon_gifts:0, mercury_steps:i === 7 ? 1 : 0, bricks:0 })),
  mini_lists:() => [
    { key:'bonusesDaily', items:[{ id:'bd1', text:'סבב מיץ פטל, למי שעשה תורנות חצר', startTime:'13:30', endTime:'15:30' }, { id:'bd2', text:'בארוחת ארבע: משהו מתוק קטן', startTime:'15:30', endTime:'17:00' }, { id:'bd3', text:'אחרי ארוחת הערב: זמן טלוויזיה', startTime:'18:00', endTime:'20:00' }] },
    { key:'bonusesWeekly', items:[{ id:'bw1', text:'תורנויות מהנות, לפי הלוח' }, { id:'bw2', text:'בשישי: עוזרי אפייה', days:[5] }] },
    { key:'dutyRoster', items:[] }, { key:'childSettings', items:[] }]
};
// what the made-up database answers; a request changes the made-up portal, so the screen shows what really happens
function learnRpc(name, a){
  const st = portalState, today = srvToday();
  const find = aid => st.rows.find(r => r.id === aid);
  if(name === 'prefs_open') return true;
  if(name === 'open_days_for_me') return [];
  if(name === 'swap_candidates') return [{ name:'מיכל' }, { name:'עומר' }];
  if(name === 'open_shifts'){ const mk = String(a.p_month || '').slice(0, 7), days = daysOfMonth(mk).filter(d => d > today);
    return days.length < 6 ? [] : [[days[2], 'A', 2, 1], [days[2], 'N', 1, 0], [days[5], 'M', 2, 1]].map(([day, shift, need, have]) => ({ day, shift, need, have, req:learnFx.open[day + '|' + shift] || null })); }
  if(name === 'request_open_shift'){ learnFx.open[a.p_day + '|' + a.p_shift] = 'o' + learnFx.nextId++; return null; }
  if(name === 'cancel_open_request'){ Object.keys(learnFx.open).forEach(k => { if(learnFx.open[k] === a.p_id) delete learnFx.open[k]; }); return null; }
  if(name === 'request_swap' || name === 'report_cannot_come'){ const r = find(a.p_assignment); if(r) st.swaps.unshift({ id:'s' + learnFx.nextId++, key:st.assignmentIds[r.id].key, aid:r.id, urgent:name === 'report_cannot_come', from:srv.me, to:null, status:'open', at:new Date().toISOString() }); return null; }
  if(name === 'offer_swap'){ const s = st.swaps.find(x => x.id === a.p_swap); if(s){ s.to = srv.me; s.status = 'offered'; } return null; }
  if(name === 'cancel_swap'){ const s = st.swaps.find(x => x.id === a.p_swap); if(s) s.status = 'cancelled'; return null; }
  return null;
}
// the made-up month: "today" is the 1st; this month is published, the preferences of next month are open
function learnDemoState(dense){
  const cur = monthKeyOf(srvToday()), next = addMonths(cur, 1), today = srvToday();
  const names = ['נועה', 'יוסי', 'מיכל', 'אלי', 'תמר', 'רן', 'שירה', 'עומר', 'ליאת', 'גיא'].concat(dense ? ['דנה', 'אורי', 'נוי', 'בן', 'הדר', 'עדי', 'אסף', 'מור'] : []);
  const people = names.map((n, i) => ({ id:i ? 'p' + i : 'me', first:n, last:'', role:'instructor', admin:false, active:true, photo:samplePhoto(i + 1) }));
  people.push({ id:'c1', first:'רותם', last:'', role:'coordinator', admin:false, active:true, photo:samplePhoto(20) });
  const st = { version:2, serverMode:true, instructors:people, shiftTypes:JSON.parse(JSON.stringify(SRV_SHIFTS)), rules:Object.assign({}, RULES_DEFAULT), months:{}, swaps:[], assignmentIds:{}, announcements:[], timetable:{}, birthdays:{}, outbox:[], rows:[],
    notices:[{ id:'n1', to:'me', at:new Date().toISOString(), text:`הסידור של ${monthLabel(cur)} פורסם. אפשר לראות את המשמרות שלך כאן, בלשונית "הסידור".`, kind:'info', seen:false, sent:true, fromServer:false }],
    settings:{ theme:'dark' }, pending:{ waiting:0, discarded:0 } };
  [-1, 0, 1].forEach(n => { const mk = addMonths(cur, n); st.months[mk] = { deadline:addMonths(mk, -1) + '-24', deadlineTime:'22:30', prefs:{}, submitted:{}, notes:{}, goals:{}, assignments:{}, annot:{}, approvals:{}, published:n < 1, status:n < 1 ? 'published' : null }; });
  let k = 0, at = 0;
  if(dense) daysOfMonth(cur).forEach(d => [['M', '07:00', '15:00'], ['A', '14:00', '22:00'], ['N', '22:00', '08:00']].forEach(([s, f, t]) => {          // (the coordinator's month: as many as the standard numbers ask for)
    const n = s === 'M' ? ([5, 6].includes(dowOf(d)) ? 5 : 1) : s === 'A' ? ([4, 5, 6].includes(dowOf(d)) ? 5 : 4) : 2;
    for(let i = 0; i < n; i++){ const id = people[at++ % names.length].id; srvAddRow(st, { id:'a' + k++, staff_id:id, day:d, shift:s, from_time:f, to_time:t, flags:[] }); }
  }));
  else daysOfMonth(cur).forEach((d, di) => [['M', '07:00', '15:00'], ['A', '14:00', '22:00'], ['N', '22:00', '08:00']].forEach(([s, f, t], si) => {
    const mine = di % 3 === 1 && si === Math.floor(di / 3) % 3 % 2;          // (about every third day, a morning or an afternoon)
    srvAddRow(st, { id:'a' + k++, staff_id:mine ? 'me' : 'p' + (1 + (di * 3 + si) % 9), day:d, shift:s, from_time:f, to_time:t, flags:[] });
  }));
  // two requests of others that wait for somebody (one is urgent), on days when "me" is free
  const free = r => r.day > today && !st.rows.some(x => x.staff === 'me' && x.day === r.day);
  const r1 = st.rows.find(r => r.staff === 'p3' && free(r)), r2 = st.rows.find(r => r.staff === 'p6' && r.shift !== 'N' && free(r) && r !== r1);
  [[r1, false], [r2, true]].forEach(([r, urgent], i) => { if(r) st.swaps.push({ id:'x' + i, key:st.assignmentIds[r.id].key, aid:r.id, urgent, from:r.staff, to:null, status:'open', at:new Date().toISOString() }); });
  srvPrefsOf(st.months[next], 'me');
  return st;
}
function learnFrameStart(){
  learnFakeClient(sbPersonal); learnFakeClient(sbShared);
  // the clock of the phone stands on the 1st of next month, 10:00: the whole month on the screen is still ahead (Guy: a full month, not a half-gone one),
  // the preferences of the month after it are open and the deadline is ahead
  const Real = Date, n = new Real(), off = new Real(n.getFullYear(), n.getMonth() + 1, 1, 10).getTime() - Real.now();
  window.Date = class extends Real { constructor(...a){ if(a.length) super(...a); else super(Real.now() + off); } static now(){ return Real.now() + off; } };
  srvLoad = async () => true; srvReload = async () => {}; srvLoadPrefsOpen = async () => {}; srvSignOut = async () => {}; srvPrefsDeadlinePassed = () => false;
  personalEnter = async () => { document.getElementById('login-screen').style.display = 'none'; document.getElementById('protected-app').style.display = ''; showAppHome(); return true; };
  ramzorPersonal = true; window.__portalNoHome = true;
  document.getElementById('login-screen').style.display = 'none'; document.getElementById('protected-app').style.display = '';
  document.body.classList.add('learn-frame'); document.documentElement.classList.add('learn-frame');
  window.learnFrame = { scene:learnScene, act:learnAct, ready:true };
}
async function learnScene(name){
  document.querySelectorAll('.sheet, .toast').forEach(x => x.remove());
  learnFx.open = {};
  try { stopCarousel(); } catch(e){}
  document.getElementById('protected-app').style.display = ''; document.getElementById('view-display').classList.remove('active');
  document.body.classList.remove('leopard-bg');
  if(name === 'ramzor' || name === 'tv'){          // (the Ramzor and the kids' screen: the made-up children)
    portalServerOn = false; await initRoster(); await initMiniLists();
    if(name === 'ramzor'){ showHub(); document.getElementById('hub-daily-btn').click(); window.scrollTo(0, 0); return; }
    roster.forEach((c, i) => { childSettings[c.id] = Object.assign({}, childSettings[c.id], { id:c.id, character:CHARACTER_KEYS[i % CHARACTER_KEYS.length] }); });          // (every child with a character, like the real screen)
    document.getElementById('protected-app').style.display = 'none'; activateDisplayView(); pauseRotation(); await showSlide(5); return;
  }
  if(/^therapy/.test(name)){ simplicityData(); portalActivateView('view-therapy'); simplicityShow(name === 'therapy-staff' ? 'staff' : 'plan'); window.scrollTo(0, 0); return; }
  portalState = learnDemoState(name === 'coord'); portalServerOn = true;
  Object.assign(srv, { me:'me', meRow:portalState.instructors[0], profile:{ kind:'instructor', female:true, manual_only:false, admin:false }, profileFor:'me', ahmash:{ p1:1, p4:2 }, photos:{},
    prefsOpenSrv:{ [prefsMonthNow()]:true }, showLong:false, pickOne:false, fixedNo:[], failed:false, busy:false, portalTheme:null });
  srvResnap();
  Object.assign(portalUi, { persona:'me', tab:null, month:monthKeyOf(srvToday()), pmonth:null, level:'yes', viewAs:null, actAs:false, editPrefs:false, manager:false, prefsPast:false, fold:{ mine:false, team:true, swap:false } });
  if(name === 'login'){ srvShowLogin('email'); window.scrollTo(0, 0); return; }
  if(name === 'home'){ showAppHome(); return; }
  if(name === 'coord'){ const c = portalState.instructors.find(p => p.id === 'c1'); Object.assign(srv, { me:'c1', meRow:c, profile:{ kind:'coordinator', female:true, admin:false } }); portalUi.persona = 'c1'; await srvLoadCoord(); showPortal('schedule'); window.scrollTo(0, 0); return; }
  if(name === 'schedule-mine') portalUi.fold = { mine:true, team:false, swap:false };
  if(name === 'swaps'){ portalUi.fold = { mine:false, team:true, swap:false, swmine:true, swopen:true };          // (one request of "me" that still waits for somebody)
    const r = portalState.rows.filter(x => x.staff === 'me' && x.day > srvToday())[2]; if(r) learnRpc('request_swap', { p_assignment:r.id }); }
  if(name === 'prefs-filled') learnFillPrefs();
  showPortal(name === 'swaps' ? 'swaps' : /^prefs/.test(name) ? 'prefs' : 'schedule');
  window.scrollTo(0, 0);
}
// most of next month marked (a few shifts left, so that the question about them comes up)
function learnFillPrefs(){
  const mk = prefsMonthNow(), p = srvPrefsOf(portalMonth(mk), 'me');
  daysOfMonth(mk).forEach((d, i) => { if(i > 24) return; ['m', 'e', 'n'].forEach((s, j) => { p.slots[`${d}|${s}`] = s === 'n' ? (i % 4 ? 'no' : 'avoid') : (i + j) % 5 === 0 ? 'avoid' : 'yes'; }); });
  srvResnap();
}
function learnAct(name){
  const ids = (el, id) => { document.querySelectorAll('#' + id).forEach(x => x.removeAttribute('id')); if(el) el.id = id; };
  if(name === 'markMine'){          // (the team calendar: the week of the next shift, and "me" in it)
    const today = srvToday(), names = [...document.querySelectorAll('.mcal-name.me')].filter(n => { const c = n.closest('.mcal-cell'); return c && c.dataset.day > today; });
    ids(names[0] || null, 'ln-next-me');
    const row = names[0] && (names[0].closest('.mcal-week, tr, .mcal-row') || names[0].closest('.mcal-cell')); ids(row, 'ln-team-week');
  }
  if(name === 'markPrefs'){          // (the first full week of the month, its Sunday and Monday)
    const days = [...document.querySelectorAll('.pcal [data-pday]')], sun = days.find(b => dowOf(b.dataset.pday) === 0) || days[0], mon = days[days.indexOf(sun) + 1];
    ids(sun, 'ln-day1'); ids(mon, 'ln-day2');
    ids(sun ? document.querySelector(`[data-pslot="${sun.dataset.pday}|n"]`) : null, 'ln-night1');
    const cells = [...document.querySelectorAll('.pcal > .pday')], i = sun ? cells.indexOf(sun.closest('.pday')) : -1;
    document.querySelectorAll('#ln-week1').forEach(x => x.remove());
    if(i >= 0){ const r1 = cells[i].getBoundingClientRect(), r2 = cells[Math.min(i + 6, cells.length - 1)].getBoundingClientRect(), box = document.createElement('div'); box.id = 'ln-week1';          // (a box around the week, to light up)
      const left = Math.min(r1.left, r2.left), right = Math.max(r1.right, r2.right);
      Object.assign(box.style, { position:'absolute', pointerEvents:'none', left:left + scrollX + 'px', top:r1.top + scrollY + 'px', width:right - left + 'px', height:Math.max(r1.height, r2.height) + 'px' });
      document.body.appendChild(box); }
  }
  if(name === 'answerAll'){ const p = srvPrefsOf(portalMonth(prefsMonthNow()), 'me'); p.consent = { extend:true, pull:'ask' }; portalRefresh(); }
}

// ---------------------------------------------------------------- the player page (no sign-in)
// the device the video shows: a phone, or a wide screen (the kids' TV, the coordinator's computer). A chapter's scene step says which one.
const LEARN_DEV = { phone:{ w:380, h:780 }, wide:{ w:1040, h:640 } };
const learnDevAt = i => { for(let k = i; k >= 0; k--){ const s = LP.steps[k]; if(s.device) return s.device; if(s.scene) return 'phone'; } return 'phone'; };
function learnSetDevice(d){
  if(LP.dev === d) return false; LP.dev = d;
  const ph = document.getElementById('ln-phone'); if(!ph) return false;
  ph.classList.toggle('wide', d === 'wide'); ph.style.width = LEARN_DEV[d].w + 'px'; ph.style.height = LEARN_DEV[d].h + 'px'; learnFit(); return true;
}
const learnRateGet = () => { try { const r = parseFloat(localStorage.getItem('ramzor-learn-rate')); return [1, 1.25, 1.5].includes(r) ? r : 1; } catch(e){ return 1; } };
const LP = { v:null, steps:[], idx:0, playing:false, run:0, voice:null, voiceOn:true, scale:1, frame:null, finger:null, hl:null };
function learnStart(){
  document.getElementById('login-screen').style.display = 'none'; document.getElementById('protected-app').style.display = 'none';
  document.body.classList.add('learn-page');
  window.addEventListener('hashchange', () => { if(learnOn()) learnRoute(); });
  if('speechSynthesis' in window){ learnPickVoice(); speechSynthesis.onvoiceschanged = learnPickVoice; }
  window.addEventListener('resize', () => { if(LP.v) learnFit(); });
  learnRoute();
}
function learnRoot(){ let r = document.getElementById('learn-root'); if(!r){ r = document.createElement('div'); r.id = 'learn-root'; r.className = 'learn'; document.body.appendChild(r); } return r; }
function learnRoute(){
  LP.run++; LP.playing = false; learnStopSound();
  const id = location.hash.split(':')[1], v = id && learnItem(id);
  if(v) return learnOpen(v);
  LP.v = null; document.title = 'סרטוני הדרכה · מרכז חירום';
  learnRoot().innerHTML = `<section class="ln-menu"><div class="ln-eyebrow">מרכז חירום · לומדה</div><h1>🎬 סרטוני הדרכה</h1>
    <p>הדרכה קצרה שמראה, צעד אחרי צעד, איך עובדים עם הפורטל. בוחרים סרטון.</p>
    <div class="ln-grid">${LEARN_ITEMS.map(v => `<a class="ln-card-btn" href="#learn:${v.id}"><span class="ln-ic">${v.icon}</span><b>${pEsc(v.title)}</b><small>${pEsc(v.sub)}</small><em>⏱ כ-${learnMinutes(v)} דקות · ${pEsc(v.who)}</em></a>`).join('')}</div></section>`;
}
function learnOpen(v){
  LP.v = v; LP.steps = learnSteps(v); LP.idx = 0; LP.lastDone = -1; LP.dev = null; document.title = v.title + ' · סרטון הדרכה';
  const voiceOk = learnCanSpeak();
  learnRoot().innerHTML = `<section class="ln-player">
    <header class="ln-top"><span class="ln-title"><b>${pEsc(v.title)}</b><small>סרטון הדרכה · ${pEsc(v.who)}</small></span>
      <button type="button" class="ln-ibtn" id="ln-rate" aria-label="מהירות">⏩ ×${learnRateGet()}</button>
      <button type="button" class="ln-ibtn" id="ln-voice" aria-pressed="${LP.voiceOn && voiceOk}"${voiceOk ? '' : ' disabled title="אין קול עברי בדפדפן הזה. הכתוביות מספרות הכל"'}>🔊 קריינות</button></header>
    <div class="ln-main"><div class="ln-stage" id="ln-stage">
      <div class="ln-slot" id="ln-slot"><div class="ln-phone" id="ln-phone"><div class="ln-scr">
        <div class="ln-status"></div>
        <iframe id="ln-frame" title="הדגמה של הפורטל" tabindex="-1" aria-hidden="true" src="${pEsc(location.pathname + location.search)}#learnframe"></iframe>
        <div class="ln-layer" id="ln-layer"></div>
        <div class="ln-cardover" id="ln-cardover"></div>
        <div class="ln-cover on" id="ln-cover"><span class="ln-big">${v.icon}</span><b>${pEsc(v.title)}</b><small>⏱ כ-${learnMinutes(v)} דקות</small><button type="button" class="ln-play-big" id="ln-start" disabled>טוען…</button></div>
        <div class="ln-cover" id="ln-end"><span class="ln-big">🎉</span><b>הסרטון הסתיים</b><small>${pEsc(v.end)}</small><button type="button" class="ln-play-big" id="ln-replay">↻ צפייה חוזרת</button></div>
      </div></div></div>
      <div class="ln-caption" id="ln-cap" aria-live="polite"></div>
      <div class="ln-voice-note" id="ln-voice-note"${voiceOk ? ' hidden' : ''}>אין בדפדפן הזה קול בעברית, אז אין קריינות. הכתוביות מספרות הכל. (בדרך כלל עובד בכרום או בספארי)</div>
      <div class="ln-controls"><button type="button" class="ln-ctrl" id="ln-prev" aria-label="שלב קודם">→</button><button type="button" class="ln-ctrl main" id="ln-play" aria-label="הפעלה או עצירה">▶</button><button type="button" class="ln-ctrl" id="ln-next" aria-label="שלב הבא">←</button>
        <div class="ln-bar" id="ln-bar"><i id="ln-fill"></i></div><span class="ln-count" id="ln-count"></span></div>
    </div>
    <aside class="ln-chaps"><h3>פרקים</h3>${v.chapters.map((c, k) => `<button type="button" class="ln-chap" data-ci="${k}"><span class="n">${k + 1}</span><span>${pEsc(c.title)}</span></button>`).join('')}</aside></div></section>`;
  const $ = id => document.getElementById(id);
  LP.frame = $('ln-frame'); LP.finger = null; LP.hl = null;
  learnSetDevice('phone');
  const ready = () => { const w = LP.frame.contentWindow; return w && w.learnFrame && w.learnFrame.ready; };
  const wait = setInterval(() => { if(!document.body.contains(LP.frame)){ clearInterval(wait); return; } if(ready()){ clearInterval(wait); learnSetDevice(learnDevAt(0)); learnFW().learnFrame.scene(LP.steps[0].scene || 'schedule'); $('ln-start').disabled = false; $('ln-start').textContent = '▶ הפעלה'; } }, 200);
  $('ln-start').addEventListener('click', () => { learnUnlock(); $('ln-cover').classList.remove('on'); LP.playing = true; learnGo(0); });
  $('ln-replay').addEventListener('click', () => { learnUnlock(); $('ln-end').classList.remove('on'); LP.playing = true; learnGo(0); });
  $('ln-play').addEventListener('click', learnToggle);
  LP.rate = learnRateGet();
  $('ln-rate').addEventListener('click', () => { LP.rate = LP.rate === 1 ? 1.25 : LP.rate === 1.25 ? 1.5 : 1; $('ln-rate').textContent = '⏩ ×' + LP.rate; if(LP.audio) LP.audio.playbackRate = LP.rate; try { localStorage.setItem('ramzor-learn-rate', String(LP.rate)); } catch(e){} });
  $('ln-prev').addEventListener('click', () => learnGo(Math.max(0, LP.idx - 1)));
  $('ln-next').addEventListener('click', () => learnGo(Math.min(LP.steps.length - 1, LP.idx + 1)));
  $('ln-bar').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); learnGo(Math.round((r.right - e.clientX) / r.width * (LP.steps.length - 1))); });
  $('ln-layer').addEventListener('click', learnToggle);
  $('ln-voice').addEventListener('click', () => { LP.voiceOn = !LP.voiceOn; $('ln-voice').setAttribute('aria-pressed', LP.voiceOn); if(LP.voiceOn) learnUnlock(); else learnStopSound(); });
  document.querySelectorAll('.ln-chap').forEach(b => b.addEventListener('click', () => learnGo(LP.steps.findIndex(s => s.ci === +b.dataset.ci))));
}
// the voice: a Hebrew one of the device. Some phones list no voices at all and still read Hebrew by the language alone, so then it is tried that way
function learnPickVoice(){
  const all = speechSynthesis.getVoices(), vs = all.filter(v => /^(he|iw)/i.test(v.lang));
  LP.voice = vs.find(v => /natural|online|neural/i.test(v.name)) || vs[0] || null; LP.byLang = !all.length;
  const b = document.getElementById('ln-voice'), n = document.getElementById('ln-voice-note'), ok = learnCanSpeak();
  if(b){ b.disabled = !ok; if(ok) b.removeAttribute('title'); b.setAttribute('aria-pressed', LP.voiceOn && ok); }
  if(n) n.hidden = ok;
}
// the narration is recorded (tools\learn-voice.ps1, 14zi-learn-voice.js): it plays on every phone. Only a sentence with no recording uses the device's voice
const learnClip = text => typeof LEARN_VOICE !== 'undefined' && LEARN_VOICE[text] ? 'learn/' + LEARN_VOICE[text] : null;
const learnCanSpeak = () => (typeof LEARN_VOICE !== 'undefined' && Object.keys(LEARN_VOICE).length > 0) || ('speechSynthesis' in window && (!!LP.voice || !!LP.byLang));
// a phone plays sound only after a sound that started inside a tap: the "הפעלה" tap plays the first recording silently (and a silent speech)
function learnUnlock(){
  if(!LP.audio){ LP.audio = new Audio(); LP.audio.preload = 'auto'; }
  const a = LP.audio, first = learnClip((LP.steps[0] || {}).say);
  if(first){ a.muted = true; a.src = first; const p = a.play(); LP.unlocking = (p && p.then ? p : Promise.resolve()).then(() => { a.pause(); }, () => {}).then(() => { a.muted = false; }); }
  if(!('speechSynthesis' in window)) return;
  try { learnPickVoice(); speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(' '); u.lang = 'he-IL'; if(LP.voice) u.voice = LP.voice; u.volume = 0; speechSynthesis.speak(u); speechSynthesis.resume(); } catch(e){}
}
function learnStopSound(){ if(LP.audio) try { LP.audio.pause(); } catch(e){} try { speechSynthesis.cancel(); } catch(e){} }
function learnFit(){
  const stage = document.getElementById('ln-stage'), phone = document.getElementById('ln-phone'), slot = document.getElementById('ln-slot'); if(!stage) return;
  const narrow = innerWidth <= 860, availH = narrow ? innerHeight - 250 : stage.clientHeight - 170, availW = stage.clientWidth - 24;          // (on a phone: the phone fills the screen, the chapters are below)
  const dv = LEARN_DEV[LP.dev || 'phone'];
  LP.scale = Math.max(.25, Math.min(1, availH / dv.h, availW / dv.w));
  phone.style.transform = `scale(${LP.scale})`; slot.style.width = dv.w * LP.scale + 'px'; slot.style.height = dv.h * LP.scale + 'px';
}
// waits ms of playing time; false when another step started meanwhile
function learnWait(ms, my){
  ms = ms / (LP.rate || 1);
  return new Promise(res => { let el = 0, last = performance.now();
    (function tick(){ const now = performance.now(); if(my !== LP.run) return res(false); if(LP.playing) el += now - last; last = now; if(el >= ms) return res(true); setTimeout(tick, 40); })(); });          // (a timer, not animation frames: those stop when the page is not on the screen)
}
function learnSpeak(text, my){
  const clip = learnClip(text);
  if(LP.voiceOn && clip && LP.audio) return (async () => {
    await LP.unlocking; if(my !== LP.run) return;
    const a = LP.audio;
    await new Promise(res => { let iv, t; const done = () => { clearInterval(iv); clearTimeout(t); a.onended = a.onerror = null; res(); };
      a.onended = done; a.onerror = done; t = setTimeout(done, learnReadMs(text) * 4);
      iv = setInterval(() => { if(my !== LP.run){ a.pause(); done(); } }, 200);
      a.muted = false; a.src = clip; a.playbackRate = LP.rate || 1; const p = a.play(); if(p && p.catch) p.catch(done); });
  })();
  if(!LP.voiceOn || !('speechSynthesis' in window) || !(LP.voice || LP.byLang) || !text) return Promise.resolve();
  let busy = false; try { busy = speechSynthesis.speaking || speechSynthesis.pending; if(busy) speechSynthesis.cancel(); } catch(e){ return Promise.resolve(); }
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text.replace(/[„”"׳]/g, '')); u.lang = LP.voice ? LP.voice.lang : 'he-IL'; if(LP.voice) u.voice = LP.voice; u.rate = 1.02;
    let iv; const done = () => { clearInterval(iv); res(); }; u.onend = done; u.onerror = done;
    setTimeout(done, learnReadMs(text) * 3); iv = setInterval(() => { if(my !== LP.run) done(); }, 200);
    setTimeout(() => { if(my !== LP.run) return done(); try { speechSynthesis.resume(); speechSynthesis.speak(u); } catch(e){ done(); } }, busy ? 120 : 0);          // (Chrome drops a speech that comes right after a cancel)
  });
}
const learnFW = () => LP.frame && LP.frame.contentWindow;
const learnFind = sel => { try { const d = LP.frame.contentDocument, all = [...d.querySelectorAll(sel)]; return all.find(el => el.getClientRects().length) || all[0] || null; } catch(e){ return null; } };
function learnLayer(){ return document.getElementById('ln-layer'); }
function learnClear(){ if(LP.hl){ LP.hl.remove(); LP.hl = null; } if(LP.finger) LP.finger.style.opacity = 0; }
async function learnScrollTo(sel, my, fast){
  const el = learnFind(sel); if(!el) return;
  const h = LP.frame.clientHeight, r = el.getBoundingClientRect();
  if(r.top >= 50 && r.bottom <= h - 70) return;
  el.scrollIntoView({ block:'center', behavior:fast ? 'auto' : 'smooth' });
  if(!fast) await learnWait(420, my);
}
function learnHighlight(sel){
  const el = learnFind(sel); if(!el) return;
  const r = el.getBoundingClientRect(), pad = 5;
  if(!LP.hl){ LP.hl = document.createElement('div'); LP.hl.className = 'ln-hl'; learnLayer().appendChild(LP.hl); }
  Object.assign(LP.hl.style, { left:r.left - pad + 'px', top:r.top - pad + 'px', width:r.width + pad * 2 + 'px', height:Math.min(r.height, LP.frame.clientHeight - r.top) + pad * 2 + 'px' });
}
async function learnTap(sel, my, fast){
  const el = learnFind(sel); if(!el) return;
  await learnScrollTo(sel, my, fast); if(my !== LP.run) return;
  if(!fast){
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if(!LP.finger){ LP.finger = document.createElement('div'); LP.finger.className = 'ln-finger'; LP.finger.style.left = x + 60 + 'px'; LP.finger.style.top = y + 120 + 'px'; learnLayer().appendChild(LP.finger); void LP.finger.offsetWidth; }
    LP.finger.style.opacity = 1; LP.finger.style.left = x + 'px'; LP.finger.style.top = y + 'px';
    if(!await learnWait(520, my)) return;
    LP.finger.classList.add('press'); const rp = document.createElement('div'); rp.className = 'ln-ripple'; rp.style.left = x + 'px'; rp.style.top = y + 'px'; learnLayer().appendChild(rp); setTimeout(() => rp.remove(), 700);
    await learnWait(180, my); LP.finger.classList.remove('press');
  }
  if(my !== LP.run) return;
  el.click();
  await learnWait(fast ? 0 : 300, my); if(fast) await new Promise(r => setTimeout(r, 120));          // (the screen answers: a sheet opens, a list draws)
}
async function learnType(sel, text, my, fast){
  const el = learnFind(sel); if(!el) return;
  await learnScrollTo(sel, my, fast);
  el.classList.add('ln-typing');
  for(let k = fast ? text.length : 1; k <= text.length; k++){ el.value = text.slice(0, k); if(!fast && !await learnWait(55, my)) return; }
  el.dispatchEvent(new Event('input', { bubbles:true })); el.classList.remove('ln-typing');
}
// a step's screen: a fresh scene at its chapter start; jumping into the middle of a chapter replays the steps before it quickly
async function learnPrepare(i, my){
  let s = i; while(s > 0 && !LP.steps[s].scene) s--;
  const fw = learnFW(); if(!fw || !fw.learnFrame) return;
  if(learnSetDevice(learnDevAt(i))) await new Promise(r => setTimeout(r, 150));          // (the page in the frame takes the new size first)
  await fw.learnFrame.scene(LP.steps[s].scene || 'schedule');
  for(let k = s; k < i; k++){ const st = LP.steps[k]; if(my !== LP.run) return;
    if(st.act) fw.learnFrame.act(st.act); if(st.type) await learnType(st.type[0], st.type[1], my, true); if(st.tap) await learnTap(st.tap, my, true); }
}
function learnShow(i){
  const st = LP.steps[i], card = document.getElementById('ln-cardover');
  card.classList.toggle('on', !!st.card); card.innerHTML = st.card ? `<span class="ln-big">${st.card.ic}</span><b>${st.card.title}</b><small>${pEsc(st.card.sub || '')}</small>` : '';
  document.getElementById('ln-cap').innerHTML = `<span>${pEsc(st.say || '')}</span>`;
  document.getElementById('ln-fill').style.width = (LP.steps.length > 1 ? i / (LP.steps.length - 1) * 100 : 0) + '%';
  document.getElementById('ln-count').textContent = `${i + 1}/${LP.steps.length}`;
  document.getElementById('ln-play').textContent = LP.playing ? '⏸' : '▶';
  document.querySelectorAll('.ln-chap').forEach(b => { b.classList.toggle('cur', +b.dataset.ci === st.ci); b.classList.toggle('done', +b.dataset.ci < st.ci); });
}
async function learnGo(i){
  const my = ++LP.run; LP.idx = i; learnStopSound();
  document.getElementById('ln-end').classList.remove('on'); document.getElementById('ln-cover').classList.remove('on');
  learnClear(); learnShow(i);
  const st = LP.steps[i], fw = learnFW();
  if(st.scene || i === 0 || !LP.lastDone || LP.lastDone !== i - 1){ try { await learnPrepare(i, my); } catch(e){ console.warn('learn scene', e); } }          // (a screen that fails to draw must not stop the video)
  if(my !== LP.run) return;
  if(st.act && fw && fw.learnFrame) fw.learnFrame.act(st.act);
  const target = st.hl || (st.type && st.type[0]) || st.tap;
  if(st.hl && fw && fw.document.querySelector('.toast')){ if(!await learnWait(1200, my)) return; fw.document.querySelectorAll('.toast').forEach(t => t.remove()); }          // (the message of the last tap is read first, then it leaves the light free)
  if(target) await learnScrollTo(target, my);
  if(my !== LP.run) return;
  if(st.hl) learnHighlight(st.hl);
  const spoken = learnSpeak(st.say, my);
  if(st.type) await learnType(st.type[0], st.type[1], my);
  if(my !== LP.run) return;
  const recorded = LP.voiceOn && !!learnClip(st.say) && !!LP.audio;          // (with a recording: on as soon as it ends; without: the time to read the caption)
  await Promise.all([learnWait(recorded ? 250 : learnReadMs(st.say) - (st.type ? st.type[1].length * 85 : 0), my), spoken]);
  if(my !== LP.run) return;
  while(!LP.playing){ if(!await learnWait(100, my)) return; }
  if(st.tap){ learnClear(); await learnTap(st.tap, my); }
  if(my !== LP.run) return;
  LP.lastDone = i;
  if(i + 1 < LP.steps.length) learnGo(i + 1);
  else { LP.playing = false; learnClear(); document.getElementById('ln-play').textContent = '▶'; document.getElementById('ln-end').classList.add('on'); }
}
function learnToggle(){
  if(document.getElementById('ln-cover').classList.contains('on')) return;
  if(document.getElementById('ln-end').classList.contains('on')){ document.getElementById('ln-end').classList.remove('on'); LP.playing = true; learnGo(0); return; }
  LP.playing = !LP.playing;
  if(LP.audio && LP.audio.src && !LP.audio.ended){ try { LP.playing ? LP.audio.play() : LP.audio.pause(); } catch(e){} }
  try { LP.playing ? speechSynthesis.resume() : speechSynthesis.pause(); } catch(e){}
  document.getElementById('ln-play').textContent = LP.playing ? '⏸' : '▶';
}
