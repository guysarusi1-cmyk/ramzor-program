
// ---------- ALL THE EMOJI, behind "עוד תמונות" (Alex card 59b4f012, Guy 2026-11-08) ----------
// In the timetable, mentoring and volunteering: about 400 emoji in subjects, a search in Hebrew, and a box to type or paste any emoji from the keyboard (a phone's too).
// What is kept is the emoji itself, in place of a picture's name; the staff screens and the kids' TV show it as it is.
// Only an emoji is ever kept or drawn (ttEmojiOk): nothing else typed there reaches a screen.
// (Emoji up to Unicode 12 here, which the TVs in the room show; a newer one typed by hand may be an empty box on an old TV — said under the box.)
const TT_EMOJI = [
  ['פרצופים', '😀 חיוך שמח|😃 שמח|😄 צוחק|😁 חיוך רחב|😆 צחוק|😅 הקלה|😂 דמעות צחוק|🤣 מתגלגל מצחוק|😊 מחייך|😇 מלאך|🙂 חיוך קטן|😉 קריצה|😌 רגוע|😍 מאוהב|🥰 אהבה|😘 נשיקה|😋 טעים|😛 לשון|😜 מצחיק|🤪 משוגע|🤓 חנון|😎 מגניב|🥳 מסיבה חגיגה|🤩 מוקסם כוכבים|🤗 חיבוק|🤔 חושב|🤫 שקט|🤭 אופס|😐 רגיל|😶 בלי מילים|🙄 גלגול עיניים|😏 מחוייך|😴 ישן שינה|😪 עייף|🤤 מזיל ריר|😷 מסכה חולה|🤒 חום חולה|🤕 פצוע|🤢 בחילה|🤧 מתעטש|🥵 חם|🥶 קר|😵 מסוחרר|🤯 מפוצץ|🤠 בוקר|😕 מבולבל|😟 מודאג|🙁 עצוב קצת|😮 מופתע|😲 נדהם|😳 נבוך|🥺 מתחנן|😢 בוכה|😭 בכי|😱 מפוחד|😖 מתוסכל|😣 מתאמץ|😞 מאוכזב|😓 זיעה|😩 מותש|😤 כועס קיטור|😡 כועס|🤬 צועק|😈 שובב|👻 רוח רפאים|💀 גולגולת|🤖 רובוט|👽 חייזר|💩 קקי|🤡 ליצן|😺 חתול מחייך'],
  ['אנשים וידיים', '👋 שלום נפנוף|👍 לייק אגודל|👎 לא אגודל למטה|👏 מחיאות כפיים|🙌 הידד|🙏 תודה בבקשה|🤝 לחיצת יד|✌️ ניצחון שלום|🤞 בהצלחה|👌 בסדר|🤙 תתקשר|💪 שריר כוח|✋ יד עצור|👊 אגרוף|✍️ כותב|👀 עיניים|👂 אוזן|👃 אף|👄 פה|🧠 מוח|🦷 שן|👶 תינוק|🧒 ילד|👦 בן|👧 בת|🧑 אדם|👩 אישה|👨 איש|🧓 מבוגר|👵 סבתא|👴 סבא|👮 שוטר|👩‍⚕️ רופאה|👨‍⚕️ רופא|👩‍🏫 מורה|👨‍🍳 שף טבח|👩‍🎨 ציירת|👨‍🚒 כבאי|🧙 קוסם|🦸 גיבור על|🧚 פיה|👸 נסיכה|🤴 נסיך|👪 משפחה|💏 זוג|🗣️ מדבר|👥 קבוצה אנשים|🚶 הולך|🏃 רץ|💃 רוקדת|🕺 רוקד|🧘 יוגה מדיטציה|🛀 אמבטיה|🛌 במיטה|🤸 התעמלות|🧗 טיפוס'],
  ['חיות', '🐶 כלב|🐱 חתול|🐭 עכבר|🐹 אוגר|🐰 ארנב|🦊 שועל|🐻 דוב|🐼 פנדה|🐨 קואלה|🐯 נמר|🦁 אריה|🐮 פרה|🐷 חזיר|🐸 צפרדע|🐵 קוף|🐔 תרנגולת|🐧 פינגווין|🐦 ציפור|🐤 אפרוח|🦆 ברווז|🦉 ינשוף|🦄 חד קרן|🐝 דבורה|🐛 זחל|🦋 פרפר|🐌 חילזון|🐞 פרת משה רבנו|🐢 צב|🐍 נחש|🦖 דינוזאור|🐙 תמנון|🦀 סרטן|🐠 דג טרופי|🐟 דג|🐬 דולפין|🐳 לוויתן|🦈 כריש|🐊 תנין|🐘 פיל|🦒 ג׳ירפה|🦓 זברה|🐪 גמל|🐴 סוס|🐑 כבשה|🐐 עז|🦔 קיפוד|🐾 עקבות'],
  ['טבע ומזג אוויר', '🌞 שמש|☀️ שמש בהירה|🌤️ שמש ועננים|⛅ מעונן חלקית|☁️ ענן|🌧️ גשם|⛈️ סערה|🌩️ ברק|❄️ שלג פתית|☃️ איש שלג|⛄ בובת שלג|🌈 קשת|☔ מטריה גשם|💧 טיפה מים|🌊 גל ים|🔥 אש|⭐ כוכב|🌟 כוכב נוצץ|✨ ניצוצות|🌙 ירח|🌛 חצי ירח|🌍 כדור הארץ|🪐 כוכב לכת|☄️ שביט|🌸 פרח דובדבן|🌹 ורד|🌻 חמנייה|🌷 צבעוני|🌼 פרח|🌱 נבט|🌿 עלה|🍀 תלתן|🍁 עלה שלכת|🍂 שלכת|🌲 עץ אורן|🌳 עץ|🌴 דקל|🌵 קקטוס|🍄 פטרייה|🐚 צדף|⛰️ הר|🏔️ הר מושלג|🏝️ אי|🏖️ חוף ים|🏜️ מדבר'],
  ['אוכל ושתייה', '🍎 תפוח|🍏 תפוח ירוק|🍐 אגס|🍊 תפוז|🍋 לימון|🍌 בננה|🍉 אבטיח|🍇 ענבים|🍓 תות|🍒 דובדבן|🍑 אפרסק|🥭 מנגו|🍍 אננס|🥥 קוקוס|🥝 קיווי|🍅 עגבנייה|🥑 אבוקדו|🥦 ברוקולי|🥒 מלפפון|🌽 תירס|🥕 גזר|🥔 תפוח אדמה|🧅 בצל|🍞 לחם|🥐 קרואסון|🥖 באגט|🥨 בייגלה|🧀 גבינה|🥚 ביצה|🍳 ביצה מטוגנת בישול|🥞 פנקייק|🧇 וופל|🥓 בייקון|🍗 עוף|🍖 בשר|🌭 נקניקייה|🍔 המבורגר|🍟 צ׳יפס|🍕 פיצה|🥪 כריך|🌮 טאקו|🌯 בוריטו|🥙 פיתה פלאפל|🧆 פלאפל|🥗 סלט|🍝 פסטה|🍜 מרק|🍲 תבשיל|🍛 אורז קארי|🍣 סושי|🍚 אורז|🥟 כיסונים|🍿 פופקורן|🧂 מלח|🍦 גלידה|🍧 ברד|🍨 גלידה בכוס|🍩 סופגנייה|🍪 עוגייה|🎂 עוגת יום הולדת|🍰 עוגה|🧁 קאפקייק|🍫 שוקולד|🍬 סוכרייה|🍭 סוכרייה על מקל|🍯 דבש|🥛 חלב|🍼 בקבוק תינוק|☕ קפה|🍵 תה|🧃 מיץ שתייה|🥤 שתייה קרה|🧊 קרח|🍴 סכו״ם|🥄 כפית|🍽️ צלחת'],
  ['ספורט ומשחק', '⚽ כדורגל|🏀 כדורסל|🏈 פוטבול|⚾ בייסבול|🎾 טניס|🏐 כדורעף|🏉 רוגבי|🎱 ביליארד|🏓 פינג פונג|🏸 בדמינטון|🥅 שער|⛳ גולף|🏹 קשת וחץ|🎣 דיג|🤿 צלילה|🥊 איגרוף|🥋 קראטה ג׳ודו|⛸️ החלקה|🛹 סקייטבורד|🛼 גלגיליות|🎿 סקי|🏊 שחייה|🚴 אופניים רכיבה|🏆 גביע|🥇 מדליה ראשון|🥈 מקום שני|🥉 מקום שלישי|🏅 מדליה|🎯 מטרה|🎮 משחק מחשב|🕹️ ג׳ויסטיק|🎲 קובייה משחק קופסה|🧩 פאזל|♟️ שחמט|🃏 קלפים|🀄 מהג׳ונג|🪁 עפיפון|🪀 יו יו|🧸 דובי|🎳 באולינג|🤹 להטוטן|🎪 קרקס|🎠 קרוסלה|🎡 גלגל ענק|🎢 רכבת הרים'],
  ['יצירה, מוזיקה ולימוד', '🎨 צבעים ציור|🖌️ מכחול|🖍️ צבעונים|✏️ עיפרון|✒️ עט|📝 כתיבה|✂️ מספריים|📏 סרגל|📐 משולש|📎 אטב|📌 נעץ|📚 ספרים|📖 ספר פתוח קריאה|📕 ספר|📓 מחברת|🎒 תיק בית ספר|🏫 בית ספר|🧮 חשבונייה|🔢 מספרים חשבון|🔤 אותיות|💻 מחשב|🖥️ מסך|📱 טלפון|⌨️ מקלדת|🔬 מיקרוסקופ מדע|🔭 טלסקופ|🧪 מבחנה ניסוי|🧲 מגנט|🌐 אינטרנט|🗺️ מפה|🎵 תו מוזיקה|🎶 מוזיקה שירים|🎤 מיקרופון שירה|🎧 אוזניות|🎸 גיטרה|🎹 פסנתר|🥁 תוף|🎺 חצוצרה|🎻 כינור|🪕 בנג׳ו|🎷 סקסופון|🎭 תיאטרון|🎬 סרט צילום|📺 טלוויזיה|📷 מצלמה|🎞️ סרט|🖼️ תמונה|🧶 צמר סריגה|🧵 חוט תפירה|🏺 כד קדרות'],
  ['בית ויומיום', '🏠 בית|🏡 בית עם גינה|🛏️ מיטה|🛋️ ספה|🚪 דלת|🚿 מקלחת|🛁 אמבטיה|🚽 שירותים|🧼 סבון|🧽 ספוג|🧹 מטאטא ניקיון|🧺 סל כביסה|🧴 קרם|👕 חולצה|👖 מכנסיים|👗 שמלה|👟 נעלי ספורט|👞 נעל|🧦 גרביים|🧢 כובע|🎩 כובע צילינדר|🧣 צעיף|🧤 כפפות|🧥 מעיל|👓 משקפיים|🕶️ משקפי שמש|⌚ שעון יד|⏰ שעון מעורר השכמה|⏳ שעון חול|📅 לוח שנה|🗓️ יומן|🔑 מפתח|🔒 מנעול|💡 נורה רעיון|🔦 פנס|🕯️ נר|🧯 מטף|🧸 בובה|🎈 בלון|🎁 מתנה|🎀 סרט מתנה|🛒 עגלת קניות|💊 תרופה|🩹 פלסטר|🩺 סטטוסקופ רופא|🌡️ מדחום|💰 כסף|✉️ מכתב|📦 חבילה|🧳 מזוודה|☂️ מטרייה'],
  ['מקומות ותחבורה', '🚗 מכונית|🚕 מונית|🚌 אוטובוס|🚎 טרוליבוס|🚓 ניידת משטרה|🚑 אמבולנס|🚒 כבאית|🚚 משאית|🚜 טרקטור|🚲 אופניים|🛴 קורקינט|🏍️ אופנוע|🚂 רכבת|🚆 רכבת מהירה|🚇 רכבת תחתית|✈️ מטוס|🚁 מסוק|🚀 טיל חללית|🛸 צלחת מעופפת|⛵ סירת מפרש|🚤 סירה|🚢 אונייה|⚓ עוגן|🚦 רמזור|🚧 עבודות|⛽ דלק|🗺️ מפה|🏥 בית חולים|🏦 בנק|🏪 מכולת|🏬 קניון|🏛️ מוזיאון|🏟️ אצטדיון|🏰 טירה|⛺ אוהל קמפינג|🏕️ קמפינג|🎡 לונה פארק|⛲ מזרקה|🌉 גשר|🏙️ עיר|🌃 לילה בעיר|🌅 זריחה|🌄 שקיעה הרים|🕍 בית כנסת|🕌 מסגד|⛪ כנסייה'],
  ['חגים ושמחות', '🎉 מסיבה|🎊 קונפטי|🎂 יום הולדת|🎁 מתנה|🎈 בלונים|🥳 חגיגה|🕎 חנוכייה חנוכה|🍩 סופגנייה|🎭 פורים מסכות|🍷 יין קידוש|🍞 חלה שבת|🕯️ נרות שבת|🍎 תפוח בדבש ראש השנה|🍯 דבש|🌿 סוכה|🍋 אתרוג|🌾 שבועות|🇮🇱 דגל ישראל|🎆 זיקוקים|🎇 זיקוק|🏮 פנס|🎃 דלעת|🎄 עץ אשוח|❤️ לב אהבה|🧡 לב כתום|💛 לב צהוב|💚 לב ירוק|💙 לב כחול|💜 לב סגול|🤍 לב לבן|💖 לב נוצץ|💕 לבבות|👑 כתר|💎 יהלום|🏆 גביע|🎖️ עיטור|🎗️ סרט'],
  ['סמלים', '✅ וי בוצע|☑️ סימון|❌ איקס|❗ סימן קריאה|❓ סימן שאלה|⚠️ זהירות|⛔ אסור כניסה|🚫 אסור|🔴 עיגול אדום|🟠 עיגול כתום|🟡 עיגול צהוב|🟢 עיגול ירוק|🔵 עיגול כחול|🟣 עיגול סגול|⚫ עיגול שחור|⚪ עיגול לבן|🟥 ריבוע אדום|🟩 ריבוע ירוק|🔺 משולש|💯 מאה|🔔 פעמון|🔕 בלי צלצול|📣 מגאפון הודעה|📢 כריזה|💬 בועת דיבור|💭 מחשבה|🗯️ צעקה|♻️ מיחזור|⬆️ למעלה|⬇️ למטה|➡️ ימינה|⬅️ שמאלה|🔄 חזרה|➕ פלוס|➖ מינוס|✖️ כפול|➗ חילוק|🔟 עשר|#️⃣ סולמית|*️⃣ כוכבית|1️⃣ אחת|2️⃣ שתיים|3️⃣ שלוש|🆗 בסדר|🆕 חדש|🆒 מגניב|🔝 למעלה|💤 שינה|♾️ אינסוף|☮️ שלום|☯️ יין יאנג|🎵 תו']
].map(([w, l]) => [w, l.split('|').map(x => { const at = x.indexOf(' '); return [x.slice(0, at), x.slice(at + 1)]; })]);
const TT_EMOJI_ALL = TT_EMOJI.flatMap(([, l]) => l);
// an emoji, and only an emoji: the first one of what was typed or pasted (with its skin tone, flag, keycap or joined family), or ''
function ttEmojiOf(s){
  s = String(s || '').trim(); if(!s || s.length > 30) return '';
  let first = s;
  try { if(typeof Intl !== 'undefined' && Intl.Segmenter){ const seg = new Intl.Segmenter('he', { granularity:'grapheme' }).segment(s)[Symbol.iterator]().next(); first = seg.done ? '' : seg.value.segment; } } catch(e){}
  return ttEmojiOk(first) ? first : '';
}
function ttEmojiOk(s){
  if(typeof s !== 'string' || !s || s.length > 30) return false;
  try {
    if(!/^[\p{Extended_Pictographic}\p{Emoji_Component}\p{Regional_Indicator}‍︎️⃣\u{E0020}-\u{E007F}]+$/u.test(s)) return false;
    return /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(s);
  } catch(e){ return false; }          // (a browser without these letters' classes: no free emoji, the pictures as before)
}
const ttEmojiWord = e => (TT_EMOJI_ALL.find(x => x[0] === e) || [e, ''])[1];
// the part under "עוד תמונות": subjects, the search, and the box for the keyboard. The buttons carry data-icon, as the pictures do, so each sheet picks them the same way
function ttEmojiHtml(cur){
  const opt = ([e, w]) => `<button type="button" class="ctl-icon-opt emj-opt${cur === e ? ' on' : ''}" data-icon="${pEsc(e)}" data-emj-words="${pEsc(w)}" aria-label="${pEsc(w.split(' ')[0])}"><span>${e}</span></button>`;
  return `<div class="emj">
    <h3 class="psec">כל האימוג׳ים</h3>
    <input type="search" class="emj-search" placeholder="חיפוש: כדור, עוגה, שמש..." aria-label="חיפוש אימוג׳י" maxlength="30">
    <div class="emj-cats" role="group" aria-label="נושאים">${TT_EMOJI.map(([w], i) => `<button type="button" class="btn ghost small" data-emj-cat="${i}" aria-pressed="${i === 0}">${pEsc(w)}</button>`).join('')}</div>
    ${TT_EMOJI.map(([, l], i) => `<div class="ctl-icons emj-grid" data-emj-group="${i}"${i === 0 ? '' : ' hidden'}>${l.map(opt).join('')}</div>`).join('')}
    <div class="pnote emj-none" hidden>לא נמצא. אפשר להקליד או להדביק אימוג׳י בתיבה שלמטה.</div>
    <div class="emj-own"><label class="pfield">או להקליד / להדביק אימוג׳י מהמקלדת<input type="text" class="emj-type" maxlength="30" inputmode="text" autocomplete="off" aria-label="אימוג׳י מהמקלדת"></label>
      <button type="button" class="btn small emj-use" data-icon="" disabled>בחירה</button></div>
    <small class="pnote">אימוג׳י חדש מאוד עלול להופיע כריבוע ריק בטלוויזיה ישנה.</small>
  </div>`;
}
function ttEmojiWire(sh){
  const box = sh.querySelector('.emj'); if(!box) return;
  const q = box.querySelector('.emj-search'), none = box.querySelector('.emj-none'), groups = [...box.querySelectorAll('[data-emj-group]')], cats = [...box.querySelectorAll('[data-emj-cat]')];
  let cat = 0;
  const show = () => {
    const t = q.value.trim();
    groups.forEach((g, i) => { let n = 0; g.querySelectorAll('.emj-opt').forEach(b => { const hit = t ? b.dataset.emjWords.includes(t) || b.dataset.icon === t : true; b.hidden = !hit; if(hit) n++; }); g.hidden = t ? !n : i !== cat; });
    none.hidden = !t || groups.some(g => !g.hidden);
    box.querySelector('.emj-cats').hidden = !!t;
  };
  cats.forEach(b => b.addEventListener('click', () => { cat = +b.dataset.emjCat; cats.forEach(x => x.setAttribute('aria-pressed', String(x === b))); show(); }));
  q.addEventListener('input', show);
  const type = box.querySelector('.emj-type'), use = box.querySelector('.emj-use');
  type.addEventListener('input', () => { const e = ttEmojiOf(type.value); use.dataset.icon = e; use.disabled = !e; use.textContent = e ? `בחירה ${e}` : 'בחירה'; });
  type.addEventListener('keydown', e => { if(e.key === 'Enter' && !use.disabled){ e.preventDefault(); use.click(); } });
  { const on = groups.findIndex(g => g.querySelector('.emj-opt.on')); if(on > 0) cats[on].click(); }          // (the subject of the emoji chosen before)
}
