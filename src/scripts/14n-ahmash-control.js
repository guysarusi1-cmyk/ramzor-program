
// ---------- THE AHMASH CONTROL (בקרת אחמ"ש): who the kids' TV shows today, today's timetable, today's bonuses, a log ----------
// Only after the personal sign-in, for an ahmash (rank 1 or 2), the coordinator and the admin (supabase/scheduling-v15.sql: can_control()).
// Nothing here changes the real schedule: the people changes are for the kids' TV of today only.
const ctl = { fold:{ shifts:true }, shifts:null, tt:null, ttEdit:null, ttFixedDay:null, log:null };
const canControl = () => typeof ramzorPersonal !== 'undefined' && ramzorPersonal && !!(srv.profile && srv.profile.control);
const ctlIsCoord = () => !!(srv.profile && (srv.profile.kind === 'coordinator' || srv.profile.admin));
const CTL_SHIFTS = [['M', 'בוקר'], ['A', 'צהריים'], ['N', 'לילה']];
const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const ctlToday = () => isoDate(new Date());

// the activities of the timetable: an id (the picture on the kids' TV), a word and an emoji for the staff screens
const TT_ICON_LIST = [
  ['wake', 'השכמה', '⏰'], ['wash', 'התארגנות', '🪥'], ['breakfast', 'ארוחת בוקר', '🥣'], ['school', 'גן / בית ספר', '🎒'], ['lunch', 'ארוחת צהריים', '🍽️'],
  ['rest', 'מנוחה', '😴'], ['snack', 'ארוחת ארבע', '🍎'], ['yard', 'חצר ומשחק', '🛝'], ['art', 'יצירה', '🎨'], ['music', 'מוזיקה', '🎵'], ['sport', 'ספורט', '⚽'],
  ['class', 'חוג', '🧩'], ['park', 'טיול', '🌳'], ['movie', 'סרט', '📺'], ['shower', 'מקלחות', '🛁'], ['dinner', 'ארוחת ערב', '🍲'], ['story', 'סיפור', '📖'],
  ['cleanup', 'סידור החדר', '🧹'], ['candles', 'קבלת שבת', '🕯️'], ['meeting', 'מפגש', '🫶'], ['bedtime', 'השכבה', '🌙']
];
const ttIcon = id => TT_ICON_LIST.find(x => x[0] === id) || ['other', 'פעילות', '⭐'];

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
  const order = list => {
    const rank = p => p.kind === 'teacher' ? 0 : p.kind === 'service' ? 3 : 1;
    const sorted = list.slice().sort((a, b) => rank(a) - rank(b) || String(a.label).localeCompare(String(b.label), 'he'));
    const ahm = sorted.filter(p => !p.removed && p.kind !== 'teacher' && p.kind !== 'service' && p.ahmash > 0).sort((a, b) => a.ahmash - b.ahmash)[0];
    if(!ahm) return sorted;
    const rest = sorted.filter(p => p !== ahm), firstNonTeacher = rest.findIndex(p => p.kind !== 'teacher');
    rest.splice(firstNonTeacher < 0 ? rest.length : firstNonTeacher, 0, ahm);
    return rest;
  };
  return { M:order([...out.M.values()]), A:order([...out.A.values()]), N:order([...out.N.values()]) };
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
    ${fold('bonus', 'בונוסים היום')}
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
    if(id === 'bonus') await ctlBonuses(box);
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
    const people = st.instructors.filter(p => p.active && p.role !== 'coordinator' && !here.has(p.id)).sort((a, c) => String(a.first).localeCompare(String(c.first), 'he'));
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
async function ctlTimetable(box){
  const r = await sb.rpc('tv_timetable_today'); if(r.error) throw r.error;
  ctl.tt = r.data;
  if(!ctl.ttEdit || ctl.ttEdit.day !== r.data.day) ctl.ttEdit = { day:r.data.day, items:(r.data.items || []).map(x => Object.assign({}, x)) };
  ctlTimetableDraw(box);
}
function ctlTimetableDraw(box){
  const tt = ctl.tt, coord = ctlIsCoord(), fixedDay = ctl.ttFixedDay;
  const editing = fixedDay != null ? ctl.ttFixed : ctl.ttEdit;
  const rows = editing.items.map((x, i) => `<div class="ctl-tt-row" data-row="${i}">
      <input type="time" value="${pEsc(x.t || '')}" data-tt-time="${i}" aria-label="שעה">
      <button type="button" class="ctl-tt-icon" data-tt-icon="${i}" title="${pEsc(ttIcon(x.i)[1])}">${ttIcon(x.i)[2]}</button>
      <input type="text" value="${pEsc(x.n || '')}" data-tt-name="${i}" placeholder="שם הפעילות" maxlength="40">
      <button type="button" class="ctl-x" data-tt-del="${i}" aria-label="מחיקה">✕</button></div>`).join('');
  box.innerHTML = `
    ${fixedDay == null ? `<div class="pnote">${tt.title ? `<b>${pEsc(tt.title)}</b> · ` : ''}${tt.changed ? 'הלו"ז של היום שונה מהלו"ז הקבוע.' : `זה הלו"ז הקבוע של יום ${WEEKDAY_NAMES[tt.weekday]}. שינוי כאן ישנה רק את היום.`}</div>`
                       : `<div class="pnote">עריכת <b>הלו"ז הקבוע של יום ${WEEKDAY_NAMES[fixedDay]}</b>. השינוי יחול מהשבוע הזה והלאה.</div>`}
    <div class="ctl-tt">${rows || '<div class="pnote">אין פעילויות.</div>'}</div>
    <button type="button" class="btn ghost small" id="tt-add">+ פעילות</button>
    <div class="ctl-actions">${fixedDay == null
      ? `<button type="button" class="btn" id="tt-save">שמירה להיום</button>${tt.changed ? '<button type="button" class="btn ghost" id="tt-reset">חזרה ללו"ז הקבוע</button>' : ''}${coord ? `<button type="button" class="btn ghost" id="tt-save-fixed">שמירה גם כקבוע של יום ${WEEKDAY_NAMES[tt.weekday]}</button>` : ''}`
      : `<button type="button" class="btn" id="tt-fixed-save">שמירת הלו"ז הקבוע</button><button type="button" class="btn ghost" id="tt-fixed-close">חזרה להיום</button>`}</div>
    ${coord && fixedDay == null ? `<div class="ctl-fixed-pick"><span>עריכת הלו"ז הקבוע של:</span>${WEEKDAY_NAMES.map((n, i) => `<button type="button" class="btn ghost small" data-fixed="${i}">${n}</button>`).join('')}</div>` : ''}`;
  const sync = () => box.querySelectorAll('[data-row]').forEach(row => { const i = +row.dataset.row; editing.items[i].t = row.querySelector('[data-tt-time]').value; editing.items[i].n = row.querySelector('[data-tt-name]').value.trim(); });
  const clean = () => { sync(); return editing.items.filter(x => x.t && x.n).sort((a, b) => a.t.localeCompare(b.t)).map(x => ({ t:x.t, n:x.n, i:x.i || 'other' })); };
  box.querySelectorAll('[data-tt-del]').forEach(b => b.addEventListener('click', () => { sync(); editing.items.splice(+b.dataset.ttDel, 1); ctlTimetableDraw(box); }));
  box.querySelector('#tt-add').addEventListener('click', () => { sync(); editing.items.push({ t:'', n:'', i:'other' }); ctlTimetableDraw(box); const last = box.querySelector('.ctl-tt-row:last-child input[type=time]'); if(last) last.focus(); });
  box.querySelectorAll('[data-tt-icon]').forEach(b => b.addEventListener('click', () => {
    sync(); const i = +b.dataset.ttIcon;
    const sh = portalSheet(`<h2>תמונה לפעילות</h2><div class="ctl-icons">${TT_ICON_LIST.map(([id, word, e]) => `<button type="button" class="ctl-icon-opt${editing.items[i].i === id ? ' on' : ''}" data-icon="${id}"><span>${e}</span><small>${word}</small></button>`).join('')}</div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div>`);
    sh.querySelectorAll('[data-icon]').forEach(o => o.addEventListener('click', () => {
      const it = editing.items[i]; it.i = o.dataset.icon; if(!it.n) it.n = ttIcon(it.i)[1]; sh.close(); ctlTimetableDraw(box);
    }));
  }));
  const saved = (res, msg) => { if(res.error){ toast('השמירה נכשלה. נסו שוב.'); return false; } toast(msg); return true; };
  const on = (id, fn) => { const b = box.querySelector('#' + id); if(b) b.addEventListener('click', fn); };
  on('tt-save', async () => { const items = clean(); if(saved(await sb.from('timetable_day').upsert({ day:ctl.tt.day, items }), 'נשמר. מסך הילדים יתעדכן תוך רגע.')){ ctl.ttEdit = null; ctlTimetable(box); } });
  on('tt-reset', async () => { if(saved(await sb.from('timetable_day').delete().eq('day', ctl.tt.day), 'חזרנו ללו"ז הקבוע של היום.')){ ctl.ttEdit = null; ctlTimetable(box); } });
  on('tt-save-fixed', async () => {
    const items = clean();
    if(!(await confirmSheet({ title:`לשמור כלו"ז הקבוע של יום ${WEEKDAY_NAMES[ctl.tt.weekday]}?`, text:'מעכשיו כל יום כזה יתחיל מהלו"ז הזה.', okLabel:'כן, לשמור', cancelLabel:'חזרה' }))) return;
    if(saved(await sb.from('timetable_fixed').upsert({ weekday:ctl.tt.weekday, items }), 'נשמר כלו"ז הקבוע.')){ await sb.from('timetable_day').delete().eq('day', ctl.tt.day); ctl.ttEdit = null; ctlTimetable(box); }
  });
  box.querySelectorAll('[data-fixed]').forEach(b => b.addEventListener('click', async () => {
    const wd = +b.dataset.fixed, r = await sb.from('timetable_fixed').select('items').eq('weekday', wd).maybeSingle();
    ctl.ttFixedDay = wd; ctl.ttFixed = { items:((r.data && r.data.items) || []).map(x => Object.assign({}, x)) }; ctlTimetableDraw(box);
  }));
  on('tt-fixed-save', async () => { const items = clean(); if(saved(await sb.from('timetable_fixed').upsert({ weekday:ctl.ttFixedDay, items }), 'הלו"ז הקבוע נשמר.')){ ctl.ttFixedDay = null; ctlTimetable(box); } });
  on('tt-fixed-close', () => { ctl.ttFixedDay = null; ctlTimetableDraw(box); });
}

// ---- 3. today's bonuses: hide one for today, add a special one with hours; the coordinator can make a special one permanent or delete a permanent one
async function ctlBonuses(box){
  await loadBonusDay();
  const coord = ctlIsCoord(), wd = new Date().getDay();
  const hidden = new Set(bonusDay.filter(x => x.kind === 'hide').map(x => x.bonus_id));
  const hours = b => b.startTime && b.endTime ? ` <small>${b.startTime}–${b.endTime}</small>` : '';
  const row = (b, key) => `<div class="ctl-bonus${hidden.has(b.id) ? ' hidden-today' : ''}"><span class="ctl-bonus-icon">${bonusIcon(b)}</span><span class="ctl-bonus-text">${pEsc(b.text)}${hours(b)}${hidden.has(b.id) ? ' <em>מוסתר היום</em>' : ''}</span>
      <span class="ctl-bonus-btns"><button type="button" class="btn ghost small" data-${hidden.has(b.id) ? 'show' : 'hide'}="${b.id}">${hidden.has(b.id) ? 'החזרה' : 'הסתרה להיום'}</button>${coord ? `<button type="button" class="btn ghost small" data-perm-del="${key}|${b.id}" title="מחיקה מהרשימה הקבועה">🗑</button>` : ''}</span></div>`;
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
    <div class="pnote">בונוס מיוחד מופיע מיד במסך הילדים ובמסך הבונוסים של הצוות, ונעלם לבד בסוף היום.</div>`;
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
  box.innerHTML = (r.data || []).map(l => `<div class="pmine-row"><span><small>${new Date(l.at).toLocaleString('he-IL')} · ${pEsc(who(l.by_staff))}</small><br>${pEsc(words(l))}</span></div>`).join('') || '<div class="pnote">עוד אין שינויים.</div>';
}
