
// ---------- THE AHMASH CONTROL (בקרת אחמ"ש): who the kids' TV shows today, today's timetable, today's bonuses, a log ----------
// Only after the personal sign-in, for an ahmash (rank 1 or 2), the coordinator and the admin (supabase/scheduling-v15.sql: can_control()).
// Nothing here changes the real schedule: the people changes are for the kids' TV of today only.
const ctl = { fold:{ shifts:true }, shifts:null, tt:null, ttEdit:null, ttFixedDay:null, log:null };
const canControl = () => typeof ramzorPersonal !== 'undefined' && ramzorPersonal && !!(srv.profile && srv.profile.control);
const ctlIsCoord = () => !!(srv.profile && (srv.profile.kind === 'coordinator' || srv.profile.kind === 'manager' || srv.profile.kind === 'secretary' || srv.profile.admin));          // (the manager edits the fixed timetable too: scheduling-v52.sql)
const CTL_SHIFTS = [['M', 'בוקר'], ['A', 'צהריים'], ['N', 'לילה']];
const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const ctlToday = () => isoDate(new Date());

// the activities of the timetable: an id (the picture on the kids' TV), a word and an emoji for the staff screens
// (only emoji that every screen shows: the newest ones, like the toothbrush, are empty boxes on older TVs and Windows 10)
const TT_ICON_LIST = [
  ['wake', 'השכמה', '⏰'], ['wash', 'התארגנות', '🦷'], ['breakfast', 'ארוחת בוקר', '🥣'], ['school', 'גן / בית ספר', '🎒'], ['lunch', 'ארוחת צהריים', '🍽️'],
  ['rest', 'מנוחה', '😴'], ['snack', 'ארוחת ארבע', '🍎'], ['yard', 'חצר ומשחק', '🤸'], ['art', 'יצירה', '🎨'], ['music', 'מוזיקה', '🎵'], ['sport', 'ספורט', '⚽'],
  ['class', 'חוג', '🧩'], ['park', 'טיול', '🌳'], ['movie', 'סרט', '📺'], ['shower', 'מקלחות', '🛁'], ['dinner', 'ארוחת ערב', '🍲'], ['story', 'סיפור', '📖'],
  ['cleanup', 'סידור החדר', '🧹'], ['candles', 'קבלת שבת', '🕯️'], ['meeting', 'מפגש', '🤝'], ['bedtime', 'השכבה', '🌙']
];
// more pictures, behind "עוד תמונות": five subjects, ten in each (Guy 2026-11-04)
const TT_ICON_MORE = [
  ['אוכל', [['pizza', 'פיצה', '🍕'], ['pasta', 'פסטה', '🍝'], ['sandwich', 'כריך', '🥪'], ['salad', 'סלט', '🥗'], ['soup', 'מרק', '🍜'], ['cake', 'עוגה', '🍰'], ['icecream', 'גלידה', '🍦'], ['fruit', 'פירות', '🍉'], ['cook', 'בישול', '🍳'], ['drink', 'שתייה', '🧃']]],
  ['לימוד ויצירה', [['homework', 'שיעורי בית', '✏️'], ['reading', 'קריאה', '📚'], ['computer', 'מחשב', '💻'], ['science', 'מדע', '🔬'], ['math', 'חשבון', '🔢'], ['paint', 'ציור', '🖌️'], ['crafts', 'מלאכה', '✂️'], ['clay', 'קדרות', '🏺'], ['theater', 'תיאטרון', '🎭'], ['guitar', 'נגינה', '🎸']]],
  ['ספורט ומשחק', [['basket', 'כדורסל', '🏀'], ['swim', 'שחייה', '🏊'], ['bike', 'אופניים', '🚲'], ['dance', 'ריקוד', '💃'], ['yoga', 'יוגה', '🧘'], ['run', 'ריצה', '🏃'], ['tennis', 'טניס', '🎾'], ['boardgame', 'משחק קופסה', '🎲'], ['cards', 'קלפים', '🃏'], ['blocks', 'קוביות', '🧱']]],
  ['טבע ויציאה', [['beach', 'ים', '🏖️'], ['garden', 'גינון', '🌻'], ['animals', 'בעלי חיים', '🐶'], ['horse', 'רכיבה', '🐴'], ['picnic', 'פיקניק', '🧺'], ['camp', 'מחנאות', '⛺'], ['bus', 'הסעה', '🚌'], ['shop', 'קניות', '🛒'], ['doctor', 'רופא', '🩺'], ['visit', 'ביקור', '🏠']]],
  ['בית וחגים', [['laundry', 'כביסה', '🧦'], ['handwash', 'רחיצת ידיים', '🧼'], ['haircut', 'תספורת', '💇'], ['birthday', 'יום הולדת', '🎂'], ['party', 'מסיבה', '🎉'], ['prayer', 'תפילה', '🙏'], ['kiddush', 'קידוש', '🍷'], ['holiday', 'חג', '🕎'], ['talk', 'שיחה', '💬'], ['phone', 'שיחת טלפון', '📞']]]
];
const TT_ICON_ALL = TT_ICON_LIST.concat(...TT_ICON_MORE.map(g => g[1]));
const ttIcon = id => TT_ICON_ALL.find(x => x[0] === id) || (typeof ttEmojiOk === 'function' && ttEmojiOk(id) ? [id, ttEmojiWord(id), id] : ['other', 'פעילות', '⭐']);          // (an emoji kept as it is: 14na-emoji.js — and only an emoji)

// who is on which of today's shifts: the schedule's rows, then today's changes (removed / added); the order: teachers first, then the instructors
// with the (best) ahmash in the first place, the service girls last. Used by the control and by the kids' TV.
function shiftPeople(data){
  const byId = {}; (data.people || []).forEach(p => { byId[p.id] = p; });
  const codesOf = r => r.shift === 'M' || r.shift === 'S' ? ['M'] : r.shift === 'A' ? ['A'] : r.shift === 'N' ? ['N'] : r.shift === 'D' ? ['M', 'A'] : r.shift === 'L' ? (r.day === data.day ? ['A', 'N'] : ['M', 'A']) : [];
  const out = { M:new Map(), A:new Map(), N:new Map() };
  (data.rows || []).forEach(r => codesOf(r).forEach(c => { if(byId[r.staff] && !out[c].has(r.staff)) out[c].set(r.staff, Object.assign({}, byId[r.staff], { scheduled:true })); }));
  (data.changes || []).forEach(ch => {
    const m = out[ch.shift]; if(!m) return;
    if(ch.action === 'remove' && m.has(ch.staff)) m.get(ch.staff).removed = true;
    if(ch.action === 'add' && byId[ch.staff] && !m.has(ch.staff)) m.set(ch.staff, Object.assign({}, byId[ch.staff], { added:true }));
  });
  const marked = data.ahmash && typeof data.ahmash === 'object' ? data.ahmash : null;          // (scheduling-v17.sql: THE ahmash of the shift, the one the schedule marks)
  const order = (list, code) => {
    const rank = p => p.kind === 'teacher' ? 0 : p.kind === 'service' ? 3 : 1;
    const sorted = list.slice().sort((a, b) => rank(a) - rank(b) || String(a.label).localeCompare(String(b.label), 'he'));
    const able = sorted.filter(p => !p.removed && p.kind !== 'teacher' && p.kind !== 'service' && p.ahmash > 0);
    const ahm = marked ? (able.find(p => p.id === marked[code]) || (marked[code] ? able.sort((a, b) => a.ahmash - b.ahmash)[0] : null))          // (the marked one; if the control took him off the screen today, the next ahmash on the shift)
                       : able.sort((a, b) => a.ahmash - b.ahmash)[0];
    if(!ahm) return sorted;
    const rest = sorted.filter(p => p !== ahm), firstNonTeacher = rest.findIndex(p => p.kind !== 'teacher');
    rest.splice(firstNonTeacher < 0 ? rest.length : firstNonTeacher, 0, ahm);
    return rest;
  };
  return { M:order([...out.M.values()], 'M'), A:order([...out.A.values()], 'A'), N:order([...out.N.values()], 'N') };
}

// ---- the screen
function showControl(){
  if(!canControl()){ showHub(); return; }
  stopCarousel();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-control').classList.add('active');
  document.body.classList.remove('portal-mode');
  window.scrollTo(0, 0);
  renderControl();
}
function renderControl(){
  const view = document.getElementById('view-control'), today = ctlToday();
  const fold = (id, title, sub) => `<details class="pfold ctl-fold" data-cfold="${id}"${ctl.fold[id] ? ' open' : ''}><summary><span>${title}</span>${sub ? `<small class="ctl-sub">${sub}</small>` : ''}</summary><div class="pfold-body" data-cbody="${id}"><div class="pnote">רק רגע...</div></div></details>`;
  view.innerHTML = `<div class="ctl">
    <div class="ctl-top"><button type="button" class="back-btn" id="ctl-back">→ חזרה</button><h1 class="ctl-title">בקרת אחמ"ש</h1><div class="ctl-date">${dayLabel(today)}</div></div>
    ${fold('shifts', 'מי מוצג היום במסך הילדים', 'רק במסך הילדים, ורק להיום')}
    ${fold('tt', 'הלו"ז של היום')}
    ${typeof secOn === 'function' && secOn() ? fold('ev', 'חונכויות והתנדבויות היום') : ''}
    ${fold('diary', 'יומן הילדים היום', 'יציאות, שיחות ופגישות')}
    ${fold('bonus', 'בונוסים היום')}
    ${fold('duties', 'לוח התורנויות')}
    ${fold('log', 'יומן שינויים')}
  </div>`;
  document.getElementById('ctl-back').addEventListener('click', showHub);
  view.querySelectorAll('details[data-cfold]').forEach(d => d.addEventListener('toggle', () => { ctl.fold[d.dataset.cfold] = d.open; if(d.open) ctlFill(d.dataset.cfold); }));
  Object.keys(ctl.fold).forEach(id => { if(ctl.fold[id]) ctlFill(id); });
}
async function ctlFill(id){
  const box = document.querySelector(`[data-cbody="${id}"]`); if(!box) return;
  try {
    if(id === 'shifts') await ctlShifts(box);
    if(id === 'tt') await ctlTimetable(box);
    if(id === 'ev') await ctlEvents(box);
    if(id === 'diary'){ if(liveCut()){ box.closest('details') ? box.closest('details').remove() : box.remove(); return; } await ctlDiary(box); }
    if(id === 'bonus') await ctlBonuses(box);
    if(id === 'duties') await ctlDuties(box);
    if(id === 'log') await ctlLog(box);
  } catch(e){ box.innerHTML = '<div class="pnote">הטעינה נכשלה. נסו לפתוח שוב.</div>'; }
}

// ---- 1. who the kids' TV shows today
async function ctlShifts(box){
  const r = await sb.rpc('tv_shifts_today'); if(r.error) throw r.error;
  ctl.shifts = r.data;
  const groups = shiftPeople(r.data), st = portalLoad();
  const chip = (p, code) => `<span class="ctl-chip${p.removed ? ' removed' : ''}${p.added ? ' added' : ''}">${ctlFace(p)}<span>${pEsc(p.label)}</span>${p.removed
      ? `<button type="button" class="ctl-x" data-restore="${p.id}|${code}" title="להחזיר">↺</button>`
      : `<button type="button" class="ctl-x" data-remove="${p.id}|${code}" title="להסיר מהמסך היום" aria-label="להסיר את ${pEsc(p.label)}">✕</button>`}</span>`;
  box.innerHTML = `<div class="pnote">השינויים כאן משנים רק את מה שמסך הילדים מציג היום. הסידור עצמו לא משתנה, ומחר הכול חוזר לפי הסידור.</div>
    ${CTL_SHIFTS.map(([code, word]) => `<div class="ctl-shift"><div class="ctl-shift-head"><b>${word}</b><button type="button" class="btn ghost small" data-add="${code}">+ הוספה</button></div>
      <div class="ctl-chips">${groups[code].map(p => chip(p, code)).join('') || '<span class="pnote">אין אף אחד</span>'}</div></div>`).join('')}`;
  const day = r.data.day, changes = r.data.changes || [];
  const has = (sid, code, action) => changes.some(c => c.staff === sid && c.shift === code && c.action === action);
  const done = async q => { const res = await q; if(res.error){ toast('השינוי לא נשמר. נסו שוב.'); } ctlShifts(box); };
  box.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    const [sid, code] = b.dataset.remove.split('|');
    done(has(sid, code, 'add') ? sb.from('tv_day_changes').delete().eq('day', day).eq('staff_id', sid).eq('shift', code)
                               : sb.from('tv_day_changes').upsert({ day, staff_id:sid, shift:code, action:'remove' }));
  }));
  box.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', () => {
    const [sid, code] = b.dataset.restore.split('|');
    done(sb.from('tv_day_changes').delete().eq('day', day).eq('staff_id', sid).eq('shift', code));
  }));
  box.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
    const code = b.dataset.add, here = new Set(groups[code].filter(p => !p.removed).map(p => p.id));
    const people = st.instructors.filter(p => p.active && !['coordinator', 'therapist', 'secretary'].includes(p.role) && !here.has(p.id)).sort((a, c) => String(a.first).localeCompare(String(c.first), 'he'));
    const sh = portalSheet(`<h2>הוספה למשמרת ה${CTL_SHIFTS.find(x => x[0] === code)[1]}</h2>
      <input type="search" class="ctl-search" id="ctl-search" placeholder="חיפוש שם" autocomplete="off">
      <div class="ctl-pick">${people.map(p => `<button type="button" class="ctl-pick-item" data-pick="${p.id}" data-name="${pEsc(p.first)}"><img src="${p.photo}" alt=""><span>${pEsc(instrName(p, st.instructors))}</span><small>${KIND_WORD[p.role] || ''}</small></button>`).join('')}</div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div>`);
    const search = sh.querySelector('#ctl-search');
    search.addEventListener('input', () => { const q = search.value.trim(); sh.querySelectorAll('[data-pick]').forEach(x => { x.hidden = !!q && !x.dataset.name.includes(q); }); });
    sh.querySelectorAll('[data-pick]').forEach(x => x.addEventListener('click', () => {
      const sid = x.dataset.pick; sh.close();
      done(has(sid, code, 'remove') ? sb.from('tv_day_changes').delete().eq('day', day).eq('staff_id', sid).eq('shift', code)
                                    : sb.from('tv_day_changes').upsert({ day, staff_id:sid, shift:code, action:'add' }));
    }));
  }));
}
// a face for a person without a photo: a gentle character by gender, a different one for each person
const CTL_FACES = { f:['👩', '👩‍🦰', '👩‍🦱', '👱‍♀️', '👩‍🦳', '🧕'], m:['👨', '👨‍🦰', '👨‍🦱', '👱‍♂️', '🧔', '👨‍🦳'] };
function personFace(p){
  const set = CTL_FACES[p.female === false ? 'm' : 'f'];
  let h = 0; String(p.id).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
  return set[h % set.length];
}
const ctlFace = p => p.photo ? `<img class="ctl-face" src="${p.photo}" alt="">` : `<span class="ctl-face ctl-face-art">${personArt(p)}</span>`;

// ---- 2. today's timetable (and, for the coordinator, the fixed timetable of each weekday)
// an ahmash changes the timetable and the events only during the shift (Guy 5 Nov; the database keeps it: scheduling-v62.sql). Before v62 nothing changes
const ctlMayEdit = async () => typeof secOn !== 'function' || !secOn() || ctlIsCoord() || (await secApi.canEdit()) !== false;
async function ctlEvents(box){
  const today = secToday(), [r, evs, may] = await Promise.all([sb.rpc('tv_timetable_today'), secApi.between(today, today).catch(() => null), ctlMayEdit()]);
  if(evs === null){ box.innerHTML = '<div class="pnote">האירועים עוד לא זמינים כאן.</div>'; return; }
  const items = ((r.data && r.data.items) || []).filter(x => ttOn(x, today));
  box.innerHTML = `${evs.length ? ttAlignedHtml(items, evs) : '<div class="pnote">אין היום חונכויות או התנדבויות.</div>'}
    ${may ? '<div class="ctl-actions"><button type="button" class="btn ghost" id="ctl-ev-manage">ניהול חונכויות והתנדבויות</button></div>' : '<div class="pnote">אפשר לשנות רק בזמן המשמרת שלך.</div>'}`;
  { const b = box.querySelector('#ctl-ev-manage'); if(b) b.addEventListener('click', () => showSecScreen('ev', 'control')); }
}
async function ctlTimetable(box){
  const r = await sb.rpc('tv_timetable_today'); if(r.error) throw r.error;
  r.data.items = (r.data.items || []).filter(x => ttOn(x, r.data.day));          // (what repeats every few weeks or once a month: only on its days)
  if(!(await ctlMayEdit())){ box.innerHTML = `<div class="pnote">אפשר לשנות את הלו"ז רק בזמן המשמרת שלך.</div>${r.data.items.length ? ttAlignedHtml(r.data.items, []) : '<div class="pnote">אין לו"ז להיום.</div>'}`; return; }
  ctl.tt = r.data;
  if(!ctl.ttEdit || ctl.ttEdit.day !== r.data.day) ctl.ttEdit = { day:r.data.day, items:(r.data.items || []).map(x => Object.assign({}, x)) };          // (what was kept: its end is never suggested over)
  ctlTimetableDraw(box);
}
// how often an activity comes (Guy 2026-11-04): once (today only), every week, every N weeks from a day, or a month's first / second ... weekday. Kept on the activity itself
const TT_REP = [['once', 'חד-פעמי'], ['week', 'שבועי'], ['sunthu', 'בכל יום ראשון עד חמישי'], ['nw', 'כל כמה שבועות'], ['month', 'חודשי']];          // (ראשון עד חמישי: Guy 2026-11-08 — in the timetable it goes into the fixed timetable of Sunday to Thursday)
function ttOn(x, day){
  const r = x.rep; if(!r || !day) return true;
  if(r.k === 'nw'){ const w = Math.round((parseIso(day) - parseIso(r.from)) / (7 * 864e5)); return w >= 0 && w % (r.n || 2) === 0; }
  if(r.k === 'month') return Math.ceil(parseIso(day).getDate() / 7) === r.nth;
  if(r.k === 'sunthu') return dowOf(day) <= 4;
  return true;
}
const ttRepOf = (x, fixed) => (x.rep && x.rep.k) || (x.fresh && !fixed ? 'once' : 'week');
// the hour of an activity: two short lists, the hours 00–23 and the minutes (a time box would show AM/PM on a phone set that way: Guy 2026-11-03)
function ttTimeHtml(t, i, end){          // (end: the hour it ends — Guy 2026-11-04, SCHEDULE-SPEC: every activity has a start and an end)
  const [h, m] = String(t || '').split(':'), mins = Array.from({ length:12 }, (_, k) => String(k * 5).padStart(2, '0'));
  if(m && !mins.includes(m)){ mins.push(m); mins.sort(); }          // (an hour kept before, not on the 5 minutes, stays as it was)
  return `<span class="ctl-tt-time" ${end ? 'data-tt-end' : 'data-tt-time'}="${i}" dir="ltr"><select data-tt-h aria-label="${end ? 'שעת סיום' : 'שעת התחלה'}"><option value="">${end ? 'סיום' : '--'}</option>${Array.from({ length:24 }, (_, k) => String(k).padStart(2, '0')).map(x => `<option${x === h ? ' selected' : ''}>${x}</option>`).join('')}</select>:<select data-tt-m aria-label="דקות">${mins.map(x => `<option${x === (m || '00') ? ' selected' : ''}>${x}</option>`).join('')}</select></span>`;
}
const ttTimeOf = el => { const h = el.querySelector('[data-tt-h]').value; return h ? h + ':' + el.querySelector('[data-tt-m]').value : ''; };
// "בכל יום ראשון עד חמישי" in the timetable: the activity goes into the fixed timetable of each of these days (the same name and hour replaced, the rest kept).
// skip: the weekday already saved (-1: none). Removing it later is done day by day, as any fixed activity
async function ttSunThuSpread(items, skip){
  const st = items.filter(x => x.rep && x.rep.k === 'sunthu'); if(!st.length) return;
  const r = await sb.from('timetable_fixed').select('weekday,items').lte('weekday', 4); if(r.error){ toast('"ראשון עד חמישי" לא נשמר בכל הימים. נסו שוב.'); return; }
  const rows = [0, 1, 2, 3, 4].filter(wd => wd !== skip).map(wd => { const have = ((r.data || []).find(x => x.weekday === wd) || {}).items || [];
    return { weekday:wd, items:have.filter(h => !st.some(x => x.n === h.n && x.t === h.t)).concat(st).sort((a, b) => a.t.localeCompare(b.t)) }; });
  const w = await sb.from('timetable_fixed').upsert(rows); if(w.error) toast('"ראשון עד חמישי" לא נשמר בכל הימים. נסו שוב.');
}
// an activity of Sunday to Thursday deleted "from today on": out of the fixed timetable of each of these days (skip: the weekday already saved)
async function ttSunThuDrop(gone, skip){
  if(!gone.length) return;
  const r = await sb.from('timetable_fixed').select('weekday,items').lte('weekday', 4); if(r.error){ toast('המחיקה לא נשמרה בכל הימים. נסו שוב.'); return; }
  const rows = (r.data || []).filter(x => x.weekday !== skip).map(x => ({ weekday:x.weekday, items:(x.items || []).filter(h => !gone.some(g => g.n === h.n && g.t === h.t)) }));
  if(rows.length){ const w = await sb.from('timetable_fixed').upsert(rows); if(w.error) toast('המחיקה לא נשמרה בכל הימים. נסו שוב.'); }
}
function ctlTimetableDraw(box){
  const tt = ctl.tt, coord = ctlIsCoord(), fixedDay = ctl.ttFixedDay;
  const editing = fixedDay != null ? ctl.ttFixed : ctl.ttEdit;
  const rows = editing.items.map((x, i) => `<div class="ctl-tt-row" data-row="${i}">
      <span class="ctl-tt-times"><span class="ctl-tt-cap"><small>התחלה</small>${ttTimeHtml(x.t, i)}</span><span class="ctl-tt-dash" aria-hidden="true">–</span><span class="ctl-tt-cap"><small>סיום</small>${ttTimeHtml(x.end, i, true)}</span></span>          <!-- (a small title over each hour: Guy 2026-11-09) -->
      <button type="button" class="ctl-tt-icon" data-tt-icon="${i}" title="${pEsc(ttIcon(x.i)[1])}">${ttIcon(x.i)[2]}</button>
      <input type="text" value="${pEsc(x.n || '')}" data-tt-name="${i}" placeholder="שם הפעילות" maxlength="40">
      <button type="button" class="ctl-x" data-tt-del="${i}" aria-label="מחיקה">✕</button>
      ${coord ? `<span class="ctl-tt-rep"><select data-tt-rep="${i}" aria-label="תדירות">${TT_REP.filter(r => fixedDay == null || r[0] !== 'once').map(([k, w]) => `<option value="${k}"${ttRepOf(x, fixedDay != null) === k ? ' selected' : ''}>${w}</option>`).join('')}</select>${ttRepOf(x, fixedDay != null) === 'nw' ? `<label>כל <input type="number" min="2" max="12" value="${(x.rep && x.rep.n) || 2}" data-tt-n="${i}" aria-label="כל כמה שבועות"> שבועות</label>` : ''}</span>` : ''}</div>`).join('');
  box.innerHTML = `
    ${fixedDay == null ? `<div class="pnote">${tt.title ? `<b>${pEsc(tt.title)}</b> · ` : ''}${coord ? `כל פעילות נשמרת לפי התדירות שלה: "חד-פעמי" רק להיום, וכל השאר גם בלו"ז הקבוע של יום ${WEEKDAY_NAMES[tt.weekday]}.` : tt.changed ? 'הלו"ז של היום שונה מהלו"ז הקבוע.' : `זה הלו"ז הקבוע של יום ${WEEKDAY_NAMES[tt.weekday]}. שינוי כאן ישנה רק את היום.`}</div>`
                       : `<div class="pnote">עריכת <b>הלו"ז הקבוע של יום ${WEEKDAY_NAMES[fixedDay]}</b>. השינוי יחול מהשבוע הזה והלאה.</div>`}
    <div class="ctl-tt">${rows || '<div class="pnote">אין פעילויות.</div>'}</div>
    <button type="button" class="btn ghost small" id="tt-add">+ פעילות</button>
    <div class="ctl-actions">${fixedDay == null
      ? `<button type="button" class="btn" id="tt-save">${coord ? 'שמירה' : 'שמירה להיום'}</button>${tt.changed ? '<button type="button" class="btn ghost" id="tt-reset">חזרה ללו"ז הקבוע</button>' : ''}`          // (no "שמירה גם כקבוע": each activity is saved by its "how often" — Guy 2026-11-09)
      : `<button type="button" class="btn" id="tt-fixed-save">שמירת הלו"ז הקבוע</button><button type="button" class="btn ghost" id="tt-fixed-close">חזרה להיום</button>`}</div>
    ${coord && fixedDay == null ? `<div class="ctl-fixed-pick"><span>עריכת הלו"ז הקבוע של:</span>${WEEKDAY_NAMES.map((n, i) => `<button type="button" class="btn ghost small" data-fixed="${i}">${n}</button>`).join('')}</div>` : ''}`;
  // the end is offered, never asked for: the start of the next activity, until somebody sets it or empties it by hand (Guy 2026-11-04)
  const suggest = () => editing.items.forEach((x, i) => { if(!x.endAuto) return; const nx = editing.items.slice(i + 1).find(b => b.t && b.t > x.t); x.end = nx ? nx.t : ''; });
  const sync = () => box.querySelectorAll('[data-row]').forEach(row => { const i = +row.dataset.row; editing.items[i].t = ttTimeOf(row.querySelector('[data-tt-time]')); editing.items[i].end = ttTimeOf(row.querySelector('[data-tt-end]')); editing.items[i].n = row.querySelector('[data-tt-name]').value.trim(); });
  // a changed hour: the activity glides to its place in the day, and the others make room (Guy 2026-11-03)
  box.querySelectorAll('[data-tt-end] select').forEach(sel => sel.addEventListener('change', () => { sync(); const x = editing.items[+sel.closest('[data-row]').dataset.row]; x.endAuto = false; x.endSet = true; }));
  box.querySelectorAll('[data-tt-time] select').forEach(sel => sel.addEventListener('change', () => {
    sync();
    { const x = editing.items[+sel.closest('[data-row]').dataset.row]; if(!x.end && !x.endSet) x.endAuto = true; }
    const sorted = editing.items.slice().sort((a, b) => (a.t || '99').localeCompare(b.t || '99'));
    { const at = sorted.indexOf(editing.items[+sel.closest('[data-row]').dataset.row]), before = sorted[at - 1]; if(before && !before.end && !before.endSet) before.endAuto = true; }
    if(sorted.every((x, k) => x === editing.items[k])){ suggest(); ctlTimetableDraw(box); return; }
    const tops = new Map([...box.querySelectorAll('[data-row]')].map(r => [editing.items[+r.dataset.row], r.getBoundingClientRect().top]));
    const moved = editing.items[+sel.closest('[data-row]').dataset.row];
    editing.items.splice(0, editing.items.length, ...sorted);
    suggest(); ctlTimetableDraw(box);
    // the screen follows the activity to its new place. Before the glide starts: during it the row is still drawn at its old place, and the screen would stay there (Guy 2026-11-04)
    { const row = [...box.querySelectorAll('[data-row]')].find(r => editing.items[+r.dataset.row] === moved); if(row) row.scrollIntoView({ block:'center', behavior:'smooth' }); }
    box.querySelectorAll('[data-row]').forEach(r => {
      const it = editing.items[+r.dataset.row], d = (tops.get(it) || 0) - r.getBoundingClientRect().top;
      if(it === moved) r.classList.add('ctl-tt-moved');
      if(d && r.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) r.animate([{ transform:`translateY(${d}px)` }, { transform:'none' }], { duration:450, easing:'cubic-bezier(.2,.8,.2,1)' });
    });
  }));
  box.querySelectorAll('[data-tt-rep]').forEach(sel => sel.addEventListener('change', () => {
    sync(); const x = editing.items[+sel.dataset.ttRep], k = sel.value, day = fixedDay != null ? (() => { const t = ctl.tt.day; return addDays(t, (fixedDay - dowOf(t) + 7) % 7); })() : ctl.tt.day;
    x.rep = k === 'nw' ? { k, n:2, from:day } : k === 'month' ? { k, nth:Math.ceil(parseIso(day).getDate() / 7) } : { k }; ctlTimetableDraw(box);
  }));
  box.querySelectorAll('[data-tt-n]').forEach(inp => inp.addEventListener('change', () => { const x = editing.items[+inp.dataset.ttN]; x.rep.n = Math.max(2, Math.min(12, +inp.value || 2)); }));
  const strip = x => Object.assign({ t:x.t, n:x.n, i:x.i || 'other' }, x.end && x.end > x.t ? { end:x.end } : {}, x.rep ? { rep:x.rep } : x.fresh && fixedDay == null ? { rep:{ k:'once' } } : {});          // (an end before the start is left out; a new activity with no "how often" chosen is "חד-פעמי", as its list shows)
  const clean = () => { sync(); return editing.items.filter(x => x.t && x.n).sort((a, b) => a.t.localeCompare(b.t)).map(strip); };
  // ✕ on an activity that comes again (the coordinator, the manager, the secretary, on today's timetable): only today, or from today on (Guy 2026-11-09)
  box.querySelectorAll('[data-tt-del]').forEach(b => b.addEventListener('click', async () => {
    sync(); const x = editing.items[+b.dataset.ttDel];
    if(coord && fixedDay == null && !x.fresh && ttRepOf(x, false) !== 'once' && x.t && x.n){
      const sc = await new Promise(res => { const q = portalSheet(`<h2>מחיקת ${pEsc(x.n)}</h2><div class="pnote">זו פעילות חוזרת. ממתי למחוק אותה?</div><div class="confirm-actions dg-scope"><button type="button" class="btn ghost" data-sc="today">רק היום</button><button type="button" class="btn" data-sc="on">מהיום והלאה</button></div>`);
        q.querySelectorAll('[data-sc]').forEach(o => o.addEventListener('click', () => { q.close(); res(o.dataset.sc); })); q.addEventListener('click', e => { if(e.target === q) res(null); }); });
      if(!sc) return;
      if(sc === 'today') (editing.keepFixed = editing.keepFixed || []).push(strip(x));          // (stays in the fixed timetable)
      else if(x.rep && x.rep.k === 'sunthu') (editing.goneSunThu = editing.goneSunThu || []).push({ n:x.n, t:x.t });          // (Sunday to Thursday: out of all five days)
    }
    editing.items.splice(editing.items.indexOf(x), 1); ctlTimetableDraw(box);
  }));
  box.querySelector('#tt-add').addEventListener('click', () => { sync(); editing.items.push({ t:'', n:'', i:'other', endAuto:true, fresh:true }); ctlTimetableDraw(box); const last = box.querySelector('.ctl-tt-row:last-child [data-tt-h]'); if(last) last.focus(); });
  box.querySelectorAll('[data-tt-icon]').forEach(b => b.addEventListener('click', () => {
    sync(); const i = +b.dataset.ttIcon, opt = ([id, word, e]) => `<button type="button" class="ctl-icon-opt${editing.items[i].i === id ? ' on' : ''}" data-icon="${id}"><span>${e}</span><small>${word}</small></button>`;
    const sh = portalSheet(`<h2>תמונה לפעילות</h2><div class="ctl-icons">${TT_ICON_LIST.map(opt).join('')}</div>
      <details class="ctl-icons-more"${TT_ICON_MORE.some(g => g[1].some(x => x[0] === editing.items[i].i)) || ttEmojiOk(editing.items[i].i) ? ' open' : ''}><summary>עוד תמונות</summary>${TT_ICON_MORE.map(([w, l]) => `<h3 class="psec">${w}</h3><div class="ctl-icons">${l.map(opt).join('')}</div>`).join('')}${ttEmojiHtml(editing.items[i].i)}</details>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div>`);
    ttEmojiWire(sh);
    sh.querySelectorAll('[data-icon]').forEach(o => o.addEventListener('click', () => {
      if(!o.dataset.icon) return;
      const it = editing.items[i]; it.i = o.dataset.icon; if(!it.n) it.n = ttIcon(it.i)[1]; sh.close(); ctlTimetableDraw(box);
    }));
  }));
  const saved = (res, msg) => { if(res.error){ toast('השמירה נכשלה. נסו שוב.'); return false; } toast(msg); if(typeof ttNudgeTv === 'function') ttNudgeTv(); return true; };
  const on = (id, fn) => { const b = box.querySelector('#' + id); if(b) b.addEventListener('click', fn); };
  // one saving at a time: a second tap while saving does nothing (no doubles); a failed saving leaves everything on the screen as it was typed
  const once = fn => async e => { const b = e.currentTarget; if(b.disabled) return; b.disabled = true; try { await fn(); } finally { if(b.isConnected) b.disabled = false; } };
  // one "שמירה" (Guy 2026-11-09): each activity by its "how often" — "חד-פעמי" for today only, everything else into the fixed timetable of this weekday too
  // (a changed hour or name of a fixed activity included; Sunday to Thursday into all five days). What is not due today stays in the fixed timetable.
  // An ahmash on shift saves today only, as before
  on('tt-save', once(async () => {
    const items = clean();
    if(!coord){ if(saved(await sb.from('timetable_day').upsert({ day:ctl.tt.day, items }), 'נשמר. מסך הילדים יתעדכן תוך רגע.')){ ctl.ttEdit = null; ctlTimetable(box); } return; }
    const wd = ctl.tt.weekday, keep = editing.keepFixed || [], same = (a, b) => a.n === b.n && a.t === b.t;
    const f0 = await sb.from('timetable_fixed').select('items').eq('weekday', wd).maybeSingle();
    if(f0.error){ toast('השמירה נכשלה. נסו שוב.'); return; }
    const notToday = ((f0.data && f0.data.items) || []).filter(x => !ttOn(x, ctl.tt.day) && !items.some(a => same(a, x)) && !keep.some(a => same(a, x)));
    const fixed = items.filter(x => !x.rep || x.rep.k !== 'once').concat(keep, notToday).sort((a, b) => a.t.localeCompare(b.t));
    const w = await sb.from('timetable_fixed').upsert({ weekday:wd, items:fixed });
    if(w.error){ toast('השמירה נכשלה. נסו שוב.'); return; }
    await ttSunThuSpread(fixed, wd); await ttSunThuDrop(editing.goneSunThu || [], wd);
    const onlyToday = items.some(x => x.rep && x.rep.k === 'once') || keep.length;          // (today differs from the fixed timetable: kept as today's)
    if(saved(onlyToday ? await sb.from('timetable_day').upsert({ day:ctl.tt.day, items }) : await sb.from('timetable_day').delete().eq('day', ctl.tt.day), 'נשמר. מסך הילדים יתעדכן תוך רגע.')){ ctl.ttEdit = null; ctlTimetable(box); }
  }));
  on('tt-reset', async () => { if(saved(await sb.from('timetable_day').delete().eq('day', ctl.tt.day), 'חזרנו ללו"ז הקבוע של היום.')){ ctl.ttEdit = null; ctlTimetable(box); } });
  box.querySelectorAll('[data-fixed]').forEach(b => b.addEventListener('click', async () => {
    const wd = +b.dataset.fixed, r = await sb.from('timetable_fixed').select('items').eq('weekday', wd).maybeSingle();
    ctl.ttFixedDay = wd; ctl.ttFixed = { items:((r.data && r.data.items) || []).map(x => Object.assign({}, x)) }; ctlTimetableDraw(box);
  }));
  on('tt-fixed-save', once(async () => { const items = clean(); if(saved(await sb.from('timetable_fixed').upsert({ weekday:ctl.ttFixedDay, items }), 'הלו"ז הקבוע נשמר.')){ await ttSunThuSpread(items, ctl.ttFixedDay); ctl.ttFixedDay = null; ctlTimetable(box); } }));
  on('tt-fixed-close', () => { ctl.ttFixedDay = null; ctlTimetableDraw(box); });
}

// ---- 2b. the children's diary of today, to read only (Guy 2026-11-04; SCHEDULE-SPEC update of 02.11): the outings, calls and meetings that
// should happen — straight from the social workers' diary (scheduling-v57.sql: diary_for_control), never its technical note, nothing to change.
// The whole day, and "רק המשמרת שלי": by the clock's shift (an event with no hour belongs to the morning)
const CTL_SHIFT_SPAN = { M:['07:00', '15:00'], A:['14:00', '22:00'], N:['22:00', '32:00'] };
async function ctlDiary(box){
  const day = ctlToday(), r = await sb.rpc('diary_for_control', { p_day:day });
  if(r.error){ box.innerHTML = '<div class="pnote">היומן עוד לא זמין כאן (חסר עדכון במסד: scheduling-v57.sql).</div>'; return; }
  const rows = r.data || [], skips = rows.filter(x => x.skipped).map(x => ({ event_id:x.id, day }));
  const occ = typeof dgOccurrences === 'function' ? dgOccurrences(rows, skips, day, day) : [];
  const n = nowMin(), cur = n >= hm('22:00') || n < hm('07:00') ? 'N' : n >= hm('14:00') ? 'A' : 'M', [a, b] = CTL_SHIFT_SPAN[cur].map(hm);
  const inShift = o => { const e = o.e, t = e.start_time ? hm(String(e.start_time).slice(0, 5)) : null, back = e.kind === 'outing' && e.return_day === day && e.return_time ? hm(String(e.return_time).slice(0, 5)) : null;
    const fit = x => x !== null && ((x >= a && x < b) || (cur === 'N' && x + 24 * 60 >= a && x + 24 * 60 < b));
    return t === null ? cur === 'M' : fit(t) || fit(back); };
  const list = ctl.diaryMine ? occ.filter(inShift) : occ;
  const nm = id => { const c = (typeof roster !== 'undefined' ? roster : []).find(x => x.id === id); return c ? displayName(c) : '?'; };
  const T = x => x ? String(x).slice(0, 5) : '';
  box.innerHTML = `<div class="mx-seg ctl-dg-seg" role="group" aria-label="מה להציג"><button type="button" data-cdg="all" aria-pressed="${!ctl.diaryMine}">כל היום</button><button type="button" data-cdg="mine" aria-pressed="${!!ctl.diaryMine}">רק המשמרת שלי</button></div>
    ${list.length ? `<div class="ctl-dg">${list.map(o => { const e = o.e, k = (typeof DG_KIND !== 'undefined' && DG_KIND[e.kind]) || ['', ''];
      return `<div class="ctl-dg-row"><span class="ctl-dg-time"><bdi dir="ltr">${e.start_time ? T(e.start_time) + (e.end_time ? '–' + T(e.end_time) : '') : 'בלי שעה'}</bdi></span><span class="ctl-dg-what"><b class="ar-keep">${escapeHtml(nm(e.child_id))}</b> · ${k[1]} ${escapeHtml(e.kind === 'other' && e.kind_text ? e.kind_text : k[0])}${e.with_whom ? ` עם ${escapeHtml(e.with_whom)}` : ''}${e.place ? ` · ${escapeHtml(e.place)}` : ''}${e.kind === 'outing' && e.return_day ? `<small>חזרה ${e.return_day === day ? 'היום' : dayLabel(e.return_day)}${e.return_time ? ' ב-' + T(e.return_time) : ''}</small>` : ''}</span></div>`; }).join('')}</div>`
      : `<div class="pnote">${ctl.diaryMine ? 'אין אירועים במשמרת הזו.' : 'אין אירועים היום.'}</div>`}
    <div class="pnote ctl-dg-note">לקריאה בלבד. העו"סית האחראית מעדכנת את היומן.</div>`;
  box.querySelectorAll('[data-cdg]').forEach(x => x.addEventListener('click', () => { ctl.diaryMine = x.dataset.cdg === 'mine'; ctlDiary(box); }));
}
// ---- 3. today's bonuses: hide one for today, add a special one with hours; the coordinator can make a special one permanent or delete a permanent one
async function ctlBonuses(box){
  await loadBonusDay();
  const coord = ctlIsCoord(), wd = new Date().getDay();
  const hidden = new Set(bonusDay.filter(x => x.kind === 'hide').map(x => x.bonus_id));
  const hours = b => b.startTime && b.endTime ? ` <small>${b.startTime}–${b.endTime}</small>` : '';
  const row = (b, key) => `<div class="ctl-bonus${hidden.has(b.id) ? ' hidden-today' : ''}"><span class="ctl-bonus-icon">${bonusIcon(b)}</span><span class="ctl-bonus-text">${pEsc(b.text)}${hours(b)}${hidden.has(b.id) ? ' <em>מוסתר היום</em>' : ''}</span>
      <span class="ctl-bonus-btns"><button type="button" class="btn ghost small" data-${hidden.has(b.id) ? 'show' : 'hide'}="${b.id}">${hidden.has(b.id) ? 'החזרה' : 'הסתרה להיום'}</button>${coord ? `<button type="button" class="btn ghost small" data-perm-edit="${key}|${b.id}" title="עריכת הבונוס הקבוע">✏️</button><button type="button" class="btn ghost small" data-perm-del="${key}|${b.id}" title="מחיקה מהרשימה הקבועה">🗑</button>` : ''}</span></div>`;
  const daily = bonusesDaily.filter(bonusAppliesToday), weekly = bonusesWeekly.filter(bonusAppliesToday), specials = bonusDay.filter(x => x.kind === 'special');
  box.innerHTML = `
    <h3 class="psec">הבונוסים של היום</h3>
    ${daily.map(b => row(b, 'bonusesDaily')).join('') || '<div class="pnote">אין בונוסים יומיים להיום.</div>'}
    ${weekly.length ? '<h3 class="psec">שבועיים</h3>' + weekly.map(b => row(b, 'bonusesWeekly')).join('') : ''}
    <h3 class="psec">בונוסים מיוחדים להיום</h3>
    ${specials.map(x => `<div class="ctl-bonus special"><span class="ctl-bonus-icon">${x.icon || '🎁'}</span><span class="ctl-bonus-text">${pEsc(x.name)}${x.from_time ? ` <small>${x.from_time.slice(0, 5)}–${(x.to_time || '').slice(0, 5)}</small>` : ''}</span>
        <span class="ctl-bonus-btns">${coord ? `<button type="button" class="btn ghost small" data-perm="${x.id}">להפוך לקבוע</button>` : ''}<button type="button" class="btn ghost small" data-sp-del="${x.id}" aria-label="מחיקה">✕</button></span></div>`).join('') || '<div class="pnote">אין בונוסים מיוחדים היום.</div>'}
    <div class="ctl-sp-add">
      <button type="button" class="ctl-tt-icon" id="sp-icon">🎁</button>
      <input type="text" id="sp-name" placeholder="שם הבונוס" maxlength="40">
      <label>משעה <input type="time" id="sp-from"></label><label>עד <input type="time" id="sp-to"></label>
      <button type="button" class="btn small" id="sp-go">הוספה</button>
    </div>
    <div class="pnote">בונוס מיוחד מופיע מיד במסך הילדים ובמסך הבונוסים של הצוות, ונעלם לבד בסוף היום.</div>
    ${coord ? `<details class="pfold ctl-all-bonus"><summary><span>כל הבונוסים הקבועים</span><span class="pcount">${bonusesDaily.length + bonusesWeekly.length}</span></summary><div class="pfold-body">
      ${[['bonusesDaily', 'יומיים', bonusesDaily], ['bonusesWeekly', 'שבועיים', bonusesWeekly]].map(([key, title, list]) => `<h3 class="psec">${title}</h3>${list.map(b => `<div class="ctl-bonus"><span class="ctl-bonus-icon">${bonusIcon(b)}</span><span class="ctl-bonus-text">${pEsc(b.text)}${hours(b)}${b.days && b.days.length ? ` <small>· ${b.days.map(d => WEEKDAY_NAMES[d]).join(', ')}</small>` : ''}</span>
        <span class="ctl-bonus-btns"><button type="button" class="btn ghost small" data-perm-edit="${key}|${b.id}" title="עריכה">✏️</button><button type="button" class="btn ghost small" data-perm-del="${key}|${b.id}" title="מחיקה">🗑</button></span></div>`).join('') || '<div class="pnote">אין.</div>'}`).join('')}
    </div></details>` : ''}`;
  const today = ctlToday(), redo = () => ctlBonuses(box);
  const ok = (res, msg) => { if(res.error){ toast('השינוי לא נשמר. נסו שוב.'); return false; } if(msg) toast(msg); return true; };
  box.querySelectorAll('[data-hide]').forEach(b => b.addEventListener('click', async () => { if(ok(await sb.from('bonus_day').insert({ day:today, kind:'hide', bonus_id:b.dataset.hide }), 'הבונוס מוסתר להיום.')) redo(); }));
  box.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', async () => { if(ok(await sb.from('bonus_day').delete().eq('day', today).eq('kind', 'hide').eq('bonus_id', b.dataset.show))) redo(); }));
  box.querySelectorAll('[data-sp-del]').forEach(b => b.addEventListener('click', async () => { if(ok(await sb.from('bonus_day').delete().eq('id', b.dataset.spDel))) redo(); }));
  let icon = '🎁';
  box.querySelector('#sp-icon').addEventListener('click', () => {
    const sh = portalSheet(`<h2>תמונה לבונוס</h2><div class="ctl-icons">${BONUS_ICONS.map(e => `<button type="button" class="ctl-icon-opt" data-bicon="${e}"><span>${e}</span></button>`).join('')}</div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div>`);
    sh.querySelectorAll('[data-bicon]').forEach(o => o.addEventListener('click', () => { icon = o.dataset.bicon; box.querySelector('#sp-icon').textContent = icon; sh.close(); }));
  });
  box.querySelector('#sp-go').addEventListener('click', async () => {
    const name = box.querySelector('#sp-name').value.trim(), from = box.querySelector('#sp-from').value || null, to = box.querySelector('#sp-to').value || null;
    if(!name){ toast('כתבו שם לבונוס'); return; }
    if((from && !to) || (!from && to) || (from && to && to <= from)){ toast('בדקו את השעות'); return; }
    if(ok(await sb.from('bonus_day').insert({ day:today, kind:'special', name, from_time:from, to_time:to, icon }), 'הבונוס נוסף להיום.')) redo();
  });
  box.querySelectorAll('[data-perm]').forEach(b => b.addEventListener('click', async () => {
    const x = specials.find(s => s.id === b.dataset.perm); if(!x) return;
    const sh = portalSheet(`<h2>להפוך לבונוס קבוע</h2><div class="pnote">${pEsc(x.name)}</div>
      <div class="pchange-opts"><button type="button" class="btn" data-perm-kind="daily"><b>כל יום</b><small>יופיע ברשימת הבונוסים היומיים</small></button>
      <button type="button" class="btn ghost" data-perm-kind="weekly"><b>פעם בשבוע, ביום ${WEEKDAY_NAMES[wd]}</b><small>יופיע ברשימת הבונוסים השבועיים</small></button></div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>חזרה</button></div>`);
    sh.querySelectorAll('[data-perm-kind]').forEach(o => o.addEventListener('click', async () => {
      sh.close();
      const weeklyKind = o.dataset.permKind === 'weekly', key = weeklyKind ? 'bonusesWeekly' : 'bonusesDaily', list = (weeklyKind ? bonusesWeekly : bonusesDaily).slice();
      const item = { id:'b' + Date.now().toString(36), text:x.name, icon:x.icon || undefined };
      if(x.from_time && x.to_time){ item.startTime = x.from_time.slice(0, 5); item.endTime = x.to_time.slice(0, 5); }
      if(weeklyKind) item.days = [wd];
      list.push(item);
      if(!(await ctlSaveList(key, list))) return;
      await sb.from('bonus_day').delete().eq('id', x.id);
      toast('הבונוס נוסף לרשימה הקבועה.'); redo();
    }));
  }));
  // the coordinator edits a permanent bonus: the words, the hours, the picture, and on which days it is given
  box.querySelectorAll('[data-perm-edit]').forEach(b => b.addEventListener('click', () => {
    const [key, id] = b.dataset.permEdit.split('|'), list = (key === 'bonusesWeekly' ? bonusesWeekly : bonusesDaily).slice(), it = list.find(x => x.id === id); if(!it) return;
    let icon = bonusIcon(it); const days = new Set(it.days || []);
    const sh = portalSheet(`<h2>עריכת בונוס קבוע</h2>
      <label class="pfield">שם הבונוס<input type="text" id="pe-text" maxlength="60" value="${pEsc(it.text)}"></label>
      <div class="ctl-sp-add"><button type="button" class="ctl-tt-icon" id="pe-icon">${icon}</button><label>משעה <input type="time" id="pe-from" value="${pEsc(it.startTime || '')}"></label><label>עד <input type="time" id="pe-to" value="${pEsc(it.endTime || '')}"></label></div>
      <div class="pnote">באילו ימים (בלי סימון = כל יום):</div>
      <div class="pchoice wrap" id="pe-days">${WEEKDAY_NAMES.map((n, i) => `<button type="button" class="${days.has(i) ? 'on' : ''}" data-pe-day="${i}">${n}</button>`).join('')}</div>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="pe-save">שמירה</button></div>`);
    sh.querySelectorAll('[data-pe-day]').forEach(x => x.addEventListener('click', () => { const d = +x.dataset.peDay; if(days.has(d)) days.delete(d); else days.add(d); x.classList.toggle('on', days.has(d)); }));
    sh.querySelector('#pe-icon').addEventListener('click', () => {
      const ic = portalSheet(`<h2>תמונה לבונוס</h2><div class="ctl-icons">${BONUS_ICONS.map(e => `<button type="button" class="ctl-icon-opt" data-bicon="${e}"><span>${e}</span></button>`).join('')}</div><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div>`);
      ic.querySelectorAll('[data-bicon]').forEach(o => o.addEventListener('click', () => { icon = o.dataset.bicon; sh.querySelector('#pe-icon').textContent = icon; ic.close(); }));
    });
    sh.querySelector('#pe-save').addEventListener('click', async () => {
      const text = sh.querySelector('#pe-text').value.trim(), from = sh.querySelector('#pe-from').value, to = sh.querySelector('#pe-to').value;
      if(!text){ toast('כתבו שם לבונוס'); return; }
      if((from && !to) || (!from && to) || (from && to && to <= from)){ toast('בדקו את השעות'); return; }
      const next = Object.assign({}, it, { text, icon });
      if(from && to){ next.startTime = from; next.endTime = to; } else { delete next.startTime; delete next.endTime; }
      if(days.size) next.days = [...days].sort(); else delete next.days;
      if(await ctlSaveList(key, list.map(x => x.id === id ? next : x))){ sh.close(); toast('הבונוס עודכן.'); redo(); }
    });
  }));
  box.querySelectorAll('[data-perm-del]').forEach(b => b.addEventListener('click', async () => {
    const [key, id] = b.dataset.permDel.split('|'), list = (key === 'bonusesWeekly' ? bonusesWeekly : bonusesDaily), it = list.find(x => x.id === id);
    if(!it || !(await confirmSheet({ title:'למחוק מהרשימה הקבועה?', text:`"${it.text}" לא יופיע יותר בימים הבאים.`, okLabel:'כן, למחוק', cancelLabel:'חזרה', danger:true }))) return;
    if(await ctlSaveList(key, list.filter(x => x.id !== id))){ toast('נמחק מהרשימה הקבועה.'); redo(); }
  }));
}
// the coordinator / admin save a bonus list directly (scheduling-v15.sql lets them); the shared logins keep using the manager code
async function ctlSaveList(key, list){
  const r = await sb.from('mini_lists').upsert({ key, items:list });
  if(r.error){ toast('השמירה נכשלה. נסו שוב.'); return false; }
  if(key === 'bonusesDaily') bonusesDaily = list; else bonusesWeekly = list;
  return true;
}

// ---- 4. the log
async function ctlLog(box){
  const r = await sb.from('control_log').select('at,by_staff,what,detail').order('at', { ascending:false }).limit(60); if(r.error) throw r.error;
  const who = id => { const p = id && portalPerson(id); return p ? p.first : 'המערכת'; };
  const words = l => {
    const n = (l.detail && (l.detail.new || l.detail.old)) || {}, [table, op] = l.what.split(' ');
    if(table === 'tv_day_changes') return `${op === 'delete' ? 'ביטל/ה שינוי: ' : ''}${n.action === 'add' ? 'הוספה' : 'הסרה'} של ${who(n.staff_id)} ממשמרת ה${(CTL_SHIFTS.find(x => x[0] === n.shift) || [0, ''])[1]} במסך הילדים`;
    if(table === 'timetable_day') return op === 'delete' ? 'החזיר/ה את הלו"ז הקבוע להיום' : 'שינה/תה את הלו"ז של היום';
    if(table === 'timetable_fixed') return `שינה/תה את הלו"ז הקבוע של יום ${WEEKDAY_NAMES[n.weekday] || ''}`;
    if(table === 'bonus_day') return n.kind === 'hide' ? (op === 'delete' ? 'החזיר/ה בונוס שהוסתר' : 'הסתיר/ה בונוס להיום') : (op === 'delete' ? `מחק/ה את הבונוס המיוחד "${n.name}"` : `הוסיף/ה בונוס מיוחד: "${n.name}"`);
    return l.what;
  };
  box.innerHTML = (r.data || []).map(l => `<div class="pmine-row"><span><small>${new Date(l.at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })} · ${pEsc(who(l.by_staff))}</small><br>${pEsc(words(l))}</span></div>`).join('') || '<div class="pnote">עוד אין שינויים.</div>';
}
