// ---------- THE KIDS' SCREEN: WHAT IT SHOWS, AND THE BIRTHDAYS (Guy 2026-11-08; supabase/scheduling-v63.sql) ----------
//   * the admin hides or shows again every screen of the kids' TV and some parts of them: one list for all the screens in the room,
//     kept in the database (tv_display), reaching the TV at once (a 'display' command on the TV channel; checked again every minute too).
//     Everything is shown until the admin hides it. A screen with its own condition (birthdays: only on a birthday) keeps it.
//   * the old Mercury boards (the word planet, the climb up the mountain, the space journey) are off for now: Guy is designing a new
//     experience. Their code and the children's steps stay; delete them from the code when the new space journey goes up (Guy asked to be reminded).
//   * the children's birthdays: a real list kept by the admin and the secretary (until now the screen made the dates up). The TV gets today's only.

// [key, the words, parts]
const TVD_GROUPS = [
  ['מסכים בסבב', [
    ['bonuses', 'בונוסים', [['bonuses_daily', 'בונוסים יומיים'], ['bonuses_weekly', 'בונוסים שבועיים']]],
    ['stars', 'לוח הכוכבים'],
    ['duties', 'התורנויות השבוע'],
    ['timetable', 'הלו"ז של היום', [['timetable_title', 'כותרת הלו"ז'], ['timetable_events', 'חונכויות והתנדבויות']]],
    ['shifts', 'מי במשמרת היום', [['shifts_photos', 'התמונות (בלעדיהן: ציור)']]],
    ['birthdays', 'ימי הולדת'],
    ['walls', 'המקדשים שלנו']
  ]],
  ['מסכים מיוחדים', [
    ['morning', 'מסך הבוקר (05:30–07:30)'],
    ['night', 'מסך הלילה (19:30–05:30)'],
    ['celebration', 'חגיגה עם קול כשילד מקבל כוכב או לבנה'],
    ['summary', 'סיכום לילד שנשלח מהטלפון']
  ]],
  ['בפס העליון', [
    ['top_label', 'שם המסך'],
    ['top_dots', 'הנקודות של הסבב']
  ]]
];
const TVD_SLIDE = { 3:'bonuses', 5:'stars', 14:'duties', 10:'timetable', 9:'shifts', 12:'birthdays', 8:'walls' };
const TVD_GONE = [6, 7, 13];          // (the old Mercury boards: off for now, Guy 2026-11-08)
const TVD_PARENT = {};
TVD_GROUPS.forEach(([, items]) => items.forEach(([k, , parts]) => (parts || []).forEach(([p]) => { TVD_PARENT[p] = k; })));

let tvdOffSet = new Set();
const tvdOff = k => tvdOffSet.has(k) || (!!TVD_PARENT[k] && tvdOffSet.has(TVD_PARENT[k]));
const tvdSlideOff = id => TVD_GONE.includes(id) || (!!TVD_SLIDE[id] && tvdOff(TVD_SLIDE[id]));

// every board of the carousel: hidden by its own condition OR by the admin's list (the conditions keep setting .hidden as before)
function tvdWrapSlides(){
  if(typeof SLIDES === 'undefined') return;
  SLIDES.forEach(s => {
    const d = Object.getOwnPropertyDescriptor(s, 'hidden');
    if(d && d.get) return;
    let own = !!s.hidden;
    Object.defineProperty(s, 'hidden', { get(){ return own || tvdSlideOff(s.id); }, set(v){ own = !!v; }, configurable:true, enumerable:true });
  });
}
tvdWrapSlides();

async function tvdLoad(){
  try {
    const r = await sb.rpc('tv_display');
    if(!r.error && r.data) tvdOffSet = new Set((r.data.off || []).filter(x => typeof x === 'string'));
  } catch(e){ /* keep the last one */ }
  tvdApply();
}
// what changes on the TV at once
function tvdApply(){
  tvdWrapSlides();
  document.body.classList.toggle('tvd-no-label', tvdOff('top_label'));
  document.body.classList.toggle('tvd-no-dots', tvdOff('top_dots'));
  const view = document.getElementById('view-display');
  if(!view || !view.classList.contains('active') || typeof SLIDES === 'undefined') return;
  if(typeof tvQuietShown !== 'undefined'){ tvQuietShown = undefined; if(typeof tvQuietTick === 'function') tvQuietTick(); }
  if(typeof renderDots === 'function') renderDots();
  const cur = SLIDES[carouselIndex];
  if(cur && cur.hidden){ const ids = visibleSlideIds(); if(ids.length) showSlide(ids.find(id => id > carouselIndex) ?? ids[0]); }
  else if(cur) cur.render();
}
let tvdTimer = null;
function tvdStart(){ tvdLoad(); clearInterval(tvdTimer); tvdTimer = setInterval(tvdLoad, 60 * 1000); }

// the admin: tell the screens in the room to read the list again (the open remote channel, or a short one of its own)
// One channel that stays open while the page is open: a short channel per change lost the second of two quick changes (checked 2026-11-08)
let tvdSender = null, tvdSenderReady = false, tvdSenderQueue = [];
function tvdTellScreens(cmd){
  if(typeof sendTvCommand === 'function' && sendTvCommand(cmd)) return;
  try {
    if(tvdSenderReady && tvdSender){ tvdSender.send({ type:'broadcast', event:'cmd', payload:{ cmd } }); return; }
    tvdSenderQueue.push(cmd);
    if(tvdSender) return;
    tvdSender = sb.channel(TV_CHANNEL, { config:{ broadcast:{ self:false } } });
    tvdSender.subscribe(st => {
      if(st === 'SUBSCRIBED'){ tvdSenderReady = true; tvdSenderQueue.splice(0).forEach(c => tvdSender.send({ type:'broadcast', event:'cmd', payload:{ cmd:c } })); }
      else if(st === 'CLOSED' || st === 'CHANNEL_ERROR' || st === 'TIMED_OUT'){ try { sb.removeChannel(tvdSender); } catch(e){} tvdSender = null; tvdSenderReady = false; }
    });
  } catch(e){ /* the screens read it again within a minute anyway */ }
}

// ---- the admin's switches (the portal settings, "מסכי הילדים בחדר"; admin only)
async function tvdAdminHtml(){
  let off = [];
  try { const r = await sbPersonal.rpc('tv_display'); if(r.error) return '<div class="pnote">כדי לבחור מה מוצג במסך צריך להריץ את SQL 63.</div>'; off = (r.data && r.data.off) || []; } catch(e){ return ''; }
  tvdOffSet = new Set(off);
  const sw = (k, label, part) => `<label class="tvd-row${part ? ' tvd-part' : ''}"><input type="checkbox" data-tvd="${k}"${off.includes(k) ? '' : ' checked'}><span>${label}</span></label>`;
  return `<h3 class="psec">מה מוצג במסך הילדים</h3>
    <div class="pnote">מה שמסומן מוצג בכל מסכי הילדים בחדר. מורידים סימון כדי להסתיר, ומסמנים שוב כדי להחזיר. השינוי מגיע למסך מיד.</div>
    <div class="tvd-list" id="tvd-list">${TVD_GROUPS.map(([title, items]) => `<div class="tvd-group"><div class="tvd-gtitle">${title}</div>${items.map(([k, label, parts]) =>
      sw(k, label) + (parts || []).map(([p, pl]) => sw(p, pl, true)).join('')).join('')}</div>`).join('')}</div>`;
}
function tvdAdminWire(box){
  const list = box.querySelector('#tvd-list'); if(!list) return;
  const sync = () => list.querySelectorAll('.tvd-part input').forEach(i => { const on = list.querySelector(`[data-tvd="${TVD_PARENT[i.dataset.tvd]}"]`).checked; i.disabled = !on; i.closest('label').classList.toggle('off', !on); });
  sync();
  list.addEventListener('change', async e => {
    const inp = e.target.closest('[data-tvd]'); if(!inp) return;
    const off = [...list.querySelectorAll('[data-tvd]')].filter(i => !i.checked).map(i => i.dataset.tvd);
    const slidesOn = Object.values(TVD_SLIDE).filter(k => !off.includes(k));
    if(!slidesOn.length){ inp.checked = true; toast('צריך להשאיר לפחות מסך אחד בסבב'); return; }
    sync();
    const r = await sbPersonal.rpc('tv_display_save', { p_off:off });
    if(r.error){ inp.checked = !inp.checked; sync(); toast('השמירה נכשלה'); return; }
    tvdOffSet = new Set(off);
    tvdTellScreens('display');
    toast(inp.checked ? 'מוצג שוב במסך הילדים' : 'הוסתר ממסך הילדים');
  });
}

// ---- the birthdays (a part of the admin's "מסך הילדים" card; the database lets the secretary too, her place comes later)
if(typeof PS_ICON !== 'undefined' && !PS_ICON.cake) PS_ICON.cake = 'M4 20.5h16M5 20.5v-7h14v7M5 16c2.3 1.6 4.7 1.6 7 0s4.7-1.6 7 0M12 13.5V10M12 7.5c-1.2-1-1.2-2.2 0-3.5 1.2 1.3 1.2 2.5 0 3.5z';
const bdApi = {
  list:async () => { const r = await sbPersonal.from('kid_birthday').select('child_id,born'); if(r.error) throw r.error; const m = {}; (r.data || []).forEach(x => { m[x.child_id] = x.born; }); return m; },
  set:async (id, born) => { const r = await sbPersonal.from('kid_birthday').upsert({ child_id:id, born, updated_at:new Date().toISOString() }); if(r.error) throw r.error; },
  clear:async id => { const r = await sbPersonal.from('kid_birthday').delete().eq('child_id', id); if(r.error) throw r.error; }
};
// age on a day, and the days until the next birthday (29 Feb: on 28 Feb in a year without it)
function bdInfo(born, todayIso){
  const [by, bm, bd] = born.split('-').map(Number), [ty, tm, td] = todayIso.split('-').map(Number);
  const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const on = y => (bm === 2 && bd === 29 && !leap(y)) ? [2, 28] : [bm, bd];
  const [m1, d1] = on(ty), passed = tm > m1 || (tm === m1 && td >= d1);
  const age = ty - by - (passed ? 0 : 1);
  const today = Date.UTC(ty, tm - 1, td);
  let [m2, d2] = on(ty), next = Date.UTC(ty, m2 - 1, d2);
  if(next < today){ [m2, d2] = on(ty + 1); next = Date.UTC(ty + 1, m2 - 1, d2); }
  return { age, days:Math.round((next - today) / 86400000) };
}
async function renderBirthdays(box){
  const today = typeof israelNow === 'function' ? israelNow().date : isoDate(new Date());
  if(typeof roster !== 'undefined' && !roster.length && typeof getRoster === 'function') roster = await getRoster();
  let dates;
  try { dates = await bdApi.list(); } catch(e){ box.innerHTML = `<div class="pnote">${/kid_birthday|does not exist|schema cache/i.test(String(e && e.message)) ? 'צריך להריץ את SQL 63.' : 'הטעינה נכשלה. נסו שוב.'}</div>`; return; }
  const kids = secKids(), word = (born) => { if(!born) return '<span class="bd-none">אין תאריך</span>'; const i = bdInfo(born, today);
    return `גיל ${i.age}${i.days === 0 ? ' · <b class="bd-today">🎂 יום הולדת היום!</b>' : i.days <= 30 ? ` · בעוד ${i.days} ימים` : ''}`; };
  const soon = kids.filter(c => dates[c.id]).map(c => ({ c, i:bdInfo(dates[c.id], today) })).filter(x => x.i.days <= 30).sort((a, b) => a.i.days - b.i.days);
  box.innerHTML = `<div class="pnote">ילד עם תאריך מופיע במסך הילדים ביום ההולדת שלו, עם הגיל. ילד שיוצא מהרשימה של המסגרת יוצא גם מכאן.</div>
    ${soon.length ? `<h3 class="psec">בחודש הקרוב</h3>${soon.map(({ c, i }) => `<div class="pmine-row"><span><b>${pEsc(displayName(c))}</b> · ${i.days === 0 ? `היום! 🎂 · חוגג/ת ${i.age}` : `${i.days === 1 ? 'מחר' : `בעוד ${i.days} ימים`} · יהיה/תהיה בן/בת ${i.age + 1}`}</span></div>`).join('')}` : ''}
    <h3 class="psec">כל הילדים</h3>
    ${kids.map(c => `<div class="pmine-row bd-row" data-bd="${pEsc(c.id)}"><span><b>${pEsc(displayName(c))}</b><br><small data-bd-word>${word(dates[c.id])}</small></span>
      <span class="bd-edit"><input type="date" max="${today}" min="1990-01-02" value="${dates[c.id] || ''}" aria-label="תאריך הלידה של ${pEsc(displayName(c))}">${dates[c.id] ? '<button type="button" class="btn ghost small" data-bd-clear>מחיקה</button>' : ''}</span></div>`).join('') || '<div class="pnote">אין ילדים ברשימה.</div>'}`;
  box.querySelectorAll('[data-bd]').forEach(row => {
    const id = row.dataset.bd, inp = row.querySelector('input[type=date]');
    // saved when the typing is over (leaving the field, Enter, or a date chosen in the phone's picker): while a year is typed digit by digit
    // the field already holds a "date" like 0002-05-03, which is not a mistake yet (Guy 2026-11-08)
    let busy = false;
    const done = async () => {
      const v = inp.value;
      if(busy || !v || v === (dates[id] || '')) return;
      if(v > today || v < '1990-01-02'){ toast('התאריך לא נראה נכון. בודקים את היום, החודש והשנה'); return; }
      busy = true;
      try { await bdApi.set(id, v); } catch(e){ busy = false; toast('השמירה נכשלה'); return; }
      busy = false; dates[id] = v; toast('נשמר'); tvdTellScreens('tt'); renderBirthdays(box);
    };
    inp.addEventListener('change', () => { if(document.activeElement !== inp) done(); });
    inp.addEventListener('blur', done);
    inp.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); done(); } });
    const del = row.querySelector('[data-bd-clear]');
    if(del) del.addEventListener('click', async () => {
      if(!(await confirmSheet({ title:'למחוק את התאריך?', text:`התאריך של ${displayName(roster.find(c => c.id === id) || { firstName:'' })} יימחק, ויום ההולדת לא יופיע במסך הילדים.`, okLabel:'כן, למחוק', cancelLabel:'חזרה', danger:true }))) return;
      try { await bdApi.clear(id); } catch(e){ toast('המחיקה נכשלה'); return; }
      toast('נמחק'); tvdTellScreens('tt'); renderBirthdays(box);
    });
  });
}

// ---- the admin's "מסך הילדים" card on the home screen (Guy 2026-11-08): everything about controlling the kids' screen, in folded parts, one open at a time.
//   1. what the screen shows now + a child's summary (the same card the instructors have in the Ramzor, moved here while this part is open)
//   2. what is shown on the screen (the switches)   3. the birthdays   4. the screens in the room (also in the coordinator's settings)
// The admin only for now; the secretary's place for the birthdays, the timetable and the duties comes in a later version.
if(typeof PS_ICON !== 'undefined' && !PS_ICON.tv) PS_ICON.tv = 'M3 5.5h18v11.5H3zM8.5 21h7M12 17v4';
const kidsOk = () => typeof secOn === 'function' && secOn() && (!!secMe().admin || !!(srv.profile && srv.profile.admin));
const KIDS_PARTS = [
  ['remote', 'מה המסך מציג עכשיו', 'בחירת לוח, השהיה, תצוגה מקדימה וסיכום לילד'],
  ['show', 'מה מוצג במסך', 'להסתיר מסכים וחלקים, או להחזיר אותם'],
  ['birthdays', 'ימי הולדת', 'תאריכי הלידה של הילדים'],
  ['screens', 'חיבור מסכים', 'קוד למסך חדש וניתוק']
];
const kidsUi = { open:null };
// the remote card lives in the Ramzor's control area; while "מה המסך מציג עכשיו" is open it is moved here, and it goes back afterwards
let kidsRemoteHome = null;
function kidsRemoteBack(){
  const card = document.getElementById('tv-remote-card');
  if(card && kidsRemoteHome && card.parentNode !== kidsRemoteHome.parent){ kidsRemoteHome.parent.insertBefore(card, kidsRemoteHome.next); if(typeof disconnectTvRemote === 'function') disconnectTvRemote(); }
}
function kidsRemoteHere(box){
  const card = document.getElementById('tv-remote-card'); if(!card) return;
  if(!kidsRemoteHome) kidsRemoteHome = { parent:card.parentNode, next:card.nextSibling };
  box.innerHTML = ''; box.appendChild(card);
  const body = document.getElementById('tv-remote-body'), tgl = document.getElementById('tv-remote-toggle');
  if(body){ body.hidden = false; tgl.setAttribute('aria-expanded', 'true'); }
  if(typeof connectTvRemote === 'function') connectTvRemote();
}
{ const v = document.getElementById('view-sec');          // (leaving the screen in any way puts the card back and closes the connection)
  if(v) new MutationObserver(() => { if(!v.classList.contains('active') || !document.getElementById('kids-parts')) kidsRemoteBack(); }).observe(v, { attributes:true, attributeFilter:['class'], childList:true }); }

async function renderKidsScreen(box){
  if(typeof roster !== 'undefined' && !roster.length && typeof getRoster === 'function') roster = await getRoster();
  box.innerHTML = `<div id="kids-parts">${KIDS_PARTS.map(([id, title, sub]) => `<details class="pfold" data-kfold="${id}"${kidsUi.open === id ? ' open' : ''}><summary><span>${title}<small class="kids-sub">${sub}</small></span></summary><div class="pfold-body" data-kbody="${id}"></div></details>`).join('')}</div>`;
  const fill = async id => {
    const b = box.querySelector(`[data-kbody="${id}"]`); if(!b) return;
    if(id === 'remote') return kidsRemoteHere(b);
    b.innerHTML = '<div class="pnote">רק רגע...</div>';
    try {
      if(id === 'show'){ b.innerHTML = await tvdAdminHtml(); tvdAdminWire(b); }
      else if(id === 'birthdays') await renderBirthdays(b);
      else if(id === 'screens'){ const again = async () => { if(b.isConnected){ const r2 = await tvScreensSection(again); b.innerHTML = r2.html; r2.wire(b); } }; const r = await tvScreensSection(again); b.innerHTML = r.html; r.wire(b); }
    } catch(e){ b.innerHTML = '<div class="pnote">הטעינה נכשלה. נסו לפתוח שוב.</div>'; }
  };
  box.querySelectorAll('details[data-kfold]').forEach(d => d.addEventListener('toggle', () => {
    const id = d.dataset.kfold;
    if(!d.open){ if(kidsUi.open === id) kidsUi.open = null; if(id === 'remote') kidsRemoteBack(); return; }
    kidsUi.open = id;
    box.querySelectorAll('details[data-kfold]').forEach(o => { if(o !== d && o.open) o.open = false; });          // (one part open at a time)
    fill(id);
  }));
  if(kidsUi.open) fill(kidsUi.open);
}
