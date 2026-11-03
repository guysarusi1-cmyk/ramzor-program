// ---- a simpler way to fill the preferences, two settings of the instructor's own (Guy 2026-10-30, made for רעות; scheduling-v48.sql):
//   "שבוע אחרי שבוע": two opening questions (kinds of shifts / weekdays she does not do this month, both may be skipped), then one week at a time,
//     then submitting. Every tap is saved at once; coming back she goes on from the week she stopped at. Once handed in, the whole month is shown.
//   "בלי צבעים": taps instead of colours: a dot = not marked yet, the first tap = כן (bold), another tap = לא (faded), a long press = the dot again;
//     no "יכול". A week is done when it has no dots left.
//   "שעות אחרות": guided — which day, then a quick 12:00–20:00 or the start and the end on the phone's own time wheel.
// Only the screen changes: the marks are stored as everybody's, so the coordinator sees them as from everyone.
const prefPlainOn = () => portalServerOn && !!srv.prefPlain && !prefOther();
const prefWeekOn = (me, locked, submitted) => portalServerOn && !!srv.prefWeekly && me.role === 'instructor' && !prefOther() && !locked && !portalUi.prefsPast && !portalUi.prefsWholeMonth;          // (also after handing in: the switch decides, Guy 2026-11-03)
const prefFem = () => !(srv.profile && srv.profile.female === false);
const prefG = (f, m) => prefFem() ? f : m;
const PW_KINDS = [['m', 'בוקר'], ['e', 'צהריים'], ['n', 'לילה']];
const pwPosKey = mk => `ramzor-weekpos-${srv.me}-${mk}`;
const pwGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } };
const pwSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
// the weeks of a month, Sunday to Saturday; days of the next or the last month stay in the week, faded
function prefWeeksOf(mk){
  const days = daysOfMonth(mk), out = []; let start = addDays(days[0], -dowOf(days[0]));
  while(start <= days[days.length - 1]){ out.push(Array.from({ length:7 }, (_, i) => addDays(start, i))); start = addDays(start, 7); }
  return out;
}
// the shifts of a day that still wait for a mark (a dot)
function prefDotsOf(mk, prefs, dates){
  const inMonth = new Set(daysOfMonth(mk)), ks = [];
  dates.filter(d => inMonth.has(d)).forEach(date => {
    if(prefs.absent.includes(date) || (prefs.fixed || []).some(f => f.day === date)) return;
    prefShiftsFor(date).forEach(s => { const k = `${date}|${s.id}`; if(!prefs.slots[k] && !prefNoNight(k) && !prefInsideLong(prefs, k)) ks.push(k); });
  });
  return ks;
}
// a tap without colours: dot -> כן -> לא -> כן ...; a long press: the dot again
function prefPlainTap(prefs, key){ prefs.slots[key] = prefs.slots[key] === 'yes' || prefs.slots[key] === 'avoid' ? 'no' : prefs.slots[key] === 'no' ? 'yes' : 'yes'; portalSave(); }
function prefPlainReset(prefs, key){ delete prefs.slots[key]; portalSave(); }
function prefPlainHelp(force){
  const k = 'ramzor-plain-help'; if(!force){ try { if(localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch(e){ return; } }
  const sh = portalSheet(`<h2>איך מסמנים</h2><div class="pplain-help"><div><span class="pshift lv-neutral pplain-demo">בוקר</span> נקודה = עוד לא סימנת</div><div><span class="pshift lv-yes pplain-demo">בוקר</span> לחיצה אחת = כן</div><div><span class="pshift lv-no pplain-demo">בוקר</span> עוד לחיצה = לא</div><div>לחיצה ארוכה = חוזרים לנקודה</div></div>
    <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>הבנתי</button></div>`);
  sh.classList.add('pplain-sheet');
}
// taps and long presses on the shifts of a screen without colours
function prefWirePlain(root, prefs, redraw){
  root.querySelectorAll('[data-pslot], [data-plong]').forEach(b => {
    let timer = null, long = false;
    const key = () => b.dataset.pslot || `${b.dataset.plong}|l`;
    b.addEventListener('pointerdown', () => { long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; prefPlainReset(prefs, key()); if(navigator.vibrate) try { navigator.vibrate(20); } catch(e){} redraw(); }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => clearTimeout(timer)));
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('click', e => {
      e.stopImmediatePropagation(); if(long){ long = false; return; }
      const k = key(); if(prefInsideLong(prefs, k)){ toast(tx('long_inside')); return; }
      prefPlainTap(prefs, k); prefPlainHelp(false);
      if(b.dataset.plong && ['yes', 'avoid'].includes(prefs.slots[k])){ const fri = b.dataset.plong, sat = addDays(fri, 1); [`${fri}|e`, `${fri}|n`, `${sat}|m`, `${sat}|e`].forEach(x => delete prefs.slots[x]); portalSave(); }
      redraw();
    }, true);
  });
}
// the weekdays she never comes (her settings): marked "לא" once when a month opens, like "how the preferences start"
function prefFixedDaysFill(mk, prefs, days){
  const ds = srv.fixedDays || []; if(!portalServerOn || !ds.length || prefOther()) return 0;
  const key = `ramzor-fixeddays-${srv.me}-${mk}`; try { if(localStorage.getItem(key)) return 0; localStorage.setItem(key, '1'); } catch(e){ return 0; }
  let n = 0;
  days.filter(d => ds.includes(dowOf(d))).forEach(date => {
    if(prefs.absent.includes(date) || (prefs.fixed || []).some(f => f.day === date)) return;
    prefShiftsFor(date).forEach(s => { const k = `${date}|${s.id}`; if(!prefs.slots[k]){ prefs.slots[k] = 'no'; n++; } });
  });
  if(n) portalSave(); return n;
}
// "שעות אחרות", guided: which day (when there is a choice) -> 12:00–20:00 at once, or the start and the end on the time wheel
function prefHoursGuided(dates, prefs, done){
  const dayName = d => 'יום ' + DOW_NAMES[dowOf(d)];
  const toH = v => { const [h, m] = String(v || '').split(':').map(Number); if(isNaN(h)) return null; const x = h + ((m || 0) >= 30 ? 1 : 0); return x === 0 ? 24 : x; };
  const sh = portalSheet('<div id="phg"></div>'), box = sh.querySelector('#phg');
  let date = dates.length === 1 ? dates[0] : null, from = null;
  const fin = () => { portalSave(); sh.close(); done(); };
  const draw = step => {
    if(step === 'day') box.innerHTML = `<h2>באיזה יום?</h2><div class="phg-days">${dates.map(d => `<button type="button" class="btn ghost" data-hgday="${d}">${pEsc(dayName(d))} <small>${parseIso(d).getDate()}/${parseIso(d).getMonth() + 1}</small>${prefs.hours[d] ? ` <small class="phg-now"><bdi dir="ltr">${prefs.hours[d].map(([a, b]) => a + '–' + b).join(', ')}</bdi></small>` : ''}</button>`).join('')}</div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>ביטול</button></div>`;
    else if(step === 'how') box.innerHTML = `<h2>שעות אחרות ב${pEsc(dayName(date))}</h2>${prefs.hours[date] ? `<div class="pnote">כרגע: <bdi dir="ltr">${prefs.hours[date].map(([a, b]) => a + ':00–' + b + ':00').join(', ')}</bdi></div>` : ''}
      <button type="button" class="btn hours-mid phg-mid" data-hg="mid"><span>משמרת אמצע</span> <bdi dir="ltr">12:00–20:00</bdi></button>
      <button type="button" class="btn ghost phg-other" data-hg="other">שעות אחרות</button>
      <div class="confirm-actions">${prefs.hours[date] ? '<button type="button" class="btn ghost" data-hg="clear">מחיקה</button>' : ''}<button type="button" class="btn ghost" data-close>ביטול</button></div>`;
    else box.innerHTML = `<h2>${step === 'from' ? `מתי ${prefG('תוכלי', 'תוכל')} להתחיל ב${pEsc(dayName(date))}?` : `מתי ${prefG('תרצי', 'תרצה')} לסיים ב${pEsc(dayName(date))}?`}</h2>
      <input type="time" class="phg-time" id="phg-t" step="3600" value="${step === 'from' ? '08:00' : String(Math.min((from || 8) + 8, 23)).padStart(2, '0') + ':00'}">
      <div id="phg-err" class="pwarn" aria-live="polite"></div>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-hg="back">חזרה</button><button type="button" class="btn" data-hg="${step === 'from' ? 'next' : 'save'}">${step === 'from' ? 'המשך' : 'שמירה'}</button></div>`;
    box.querySelectorAll('[data-hgday]').forEach(b => b.addEventListener('click', () => { date = b.dataset.hgday; draw('how'); }));
    box.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => sh.close()));
    box.querySelectorAll('[data-hg]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.hg, err = t => { box.querySelector('#phg-err').textContent = t; };
      if(a === 'mid'){ prefs.hours[date] = [[12, 20]]; fin(); }
      else if(a === 'clear'){ delete prefs.hours[date]; fin(); }
      else if(a === 'other') draw('from');
      else if(a === 'back') draw(step === 'to' ? 'from' : 'how');
      else if(a === 'next'){ const h = toH(box.querySelector('#phg-t').value); if(h === null || h < 6 || h > 23){ err('אפשר להתחיל בין 06:00 ל-23:00'); return; } from = h; draw('to'); }
      else if(a === 'save'){ const h = toH(box.querySelector('#phg-t').value); if(h === null || h <= from){ err('השעה צריכה להיות אחרי ' + String(from).padStart(2, '0') + ':00'); return; } prefs.hours[date] = [[from, h]]; fin(); }
    }));
    const t = box.querySelector('#phg-t'); if(t) setTimeout(() => { try { t.focus(); } catch(e){} }, 50);
  };
  draw(date ? 'how' : 'day');
}
// the line under a screen without colours: "שעות אחרות" and the small "?"
function prefPlainBarHtml(){ return `<div class="plevelbar pplain-bar"><button type="button" class="lvbtn" id="pplain-hours">שעות אחרות</button><button type="button" class="lvbtn pplain-q" id="pplain-q" aria-label="איך מסמנים">?</button></div>`; }

// ---- week by week
function renderWeekPrefs(body, mk, m, prefs){
  const me = portalMe(), weeks = prefWeeksOf(mk), inMonth = new Set(daysOfMonth(mk)), plain = prefPlainOn();
  let pos = pwGet(pwPosKey(mk), 'kinds'); if(typeof pos === 'number' && (pos < 0 || pos >= weeks.length)) pos = 0;
  if((pos === 'end' || (typeof pos === 'number' && pos > 0)) && !Object.keys(prefs.slots || {}).length && !(prefs.absent || []).length && !Object.keys(prefs.hours || {}).length){ pos = 'kinds'; pwSet(pwPosKey(mk), pos); }          // (nothing is marked for this month any more, e.g. cleared on TEST: start again from the first question)
  const go = p => { pwSet(pwPosKey(mk), p); renderInstructorPrefs(body); };
  const head = `${prefViewBtnHtml()}<div class="pweek-head"><b>ההעדפות ל${pEsc(monthLabel(mk))}</b><span class="pweek-steps" aria-hidden="true">${['kinds', 'days'].concat(weeks.map((_, i) => i)).concat(['end']).map(p => `<i class="${p === pos ? 'on' : ''}"></i>`).join('')}</span></div>`;
  // the opening questions: the kinds of shifts and the weekdays she does not do this month (both may be skipped)
  if(pos === 'kinds' || pos === 'days'){
    const isK = pos === 'kinds', chosenKey = `ramzor-week${isK ? 'kinds' : 'days'}-${srv.me}-${mk}`;
    const fixedK = isK ? prefFixedKinds() : new Set();
    let chosen = new Set(pwGet(chosenKey, isK ? [] : (srv.fixedDays || [])));
    const opts = isK ? PW_KINDS : DOW_NAMES.map((d, i) => [i, d]);
    body.innerHTML = `${head}<div class="pweek-q"><h2>${isK ? `יש משמרות ש${prefG('את', 'אתה')} לא ${prefG('עושה', 'עושה')} החודש?` : `יש יום בשבוע ש${prefG('את', 'אתה')} לא ${prefG('באה', 'בא')} בו החודש?`}</h2>
      <div class="pnote">${isK ? 'אפשר לבחור יותר מאחת. הן יסומנו "לא" בכל החודש.' : 'אפשר לבחור יותר מיום אחד. כל המשמרות בימים האלה יסומנו "לא".'}</div>
      <div class="pweek-opts">${opts.map(([k, w]) => { const fx = isK && fixedK.has(k); return `<button type="button" class="pweek-opt${fx || chosen.has(k) ? ' on' : ''}" data-pwopt="${k}"${fx ? ' disabled' : ''}>${pEsc(w)}${fx ? '<small>קבוע בהגדרות</small>' : ''}</button>`; }).join('')}</div>
      <div class="pweek-nav"><button type="button" class="btn ghost" id="pw-skip">דלג</button><button type="button" class="btn" id="pw-next">המשך ←</button></div></div>`;
    body.querySelectorAll('[data-pwopt]').forEach(b => b.addEventListener('click', () => { const k = isK ? b.dataset.pwopt : Number(b.dataset.pwopt); if(chosen.has(k)) chosen.delete(k); else chosen.add(k); b.classList.toggle('on', chosen.has(k)); }));
    const next = isK ? 'days' : 0;
    body.querySelector('#pw-skip').addEventListener('click', () => go(next));
    body.querySelector('#pw-next').addEventListener('click', () => {
      const was = new Set(pwGet(chosenKey, isK ? [] : (srv.fixedDays || []))), match = (date, sid, k) => isK ? sid === k : dowOf(date) === k;
      daysOfMonth(mk).forEach(date => {
        if(prefs.absent.includes(date) || (prefs.fixed || []).some(f => f.day === date)) return;
        prefShiftsFor(date).forEach(s => { const key = `${date}|${s.id}`;
          if([...chosen].some(k => match(date, s.id, k))){ if(!prefs.slots[key] || prefs.slots[key] !== 'no') prefs.slots[key] = 'no'; }
          else if([...was].some(k => match(date, s.id, k)) && prefs.slots[key] === 'no') delete prefs.slots[key]; });          // (taken back from the list: those shifts wait for a mark again)
      });
      pwSet(chosenKey, [...chosen]); portalSave(); go(next);
    });
    prefViewWire(body);          // (the small switch, on every screen of the weekly view)
    return;
  }
  // the end: the two small questions every instructor answers, and handing in
  if(pos === 'end'){
    const cons = prefs.consent || { extend:null, pull:null };
    const choice = name => `<div class="pchoice" role="group"><button type="button" class="${cons[name] === true ? 'on' : ''}" data-consent="${name}:1">כן</button><button type="button" class="${cons[name] === false ? 'on' : ''}" data-consent="${name}:0">לא</button><button type="button" class="${cons[name] === 'ask' ? 'on' : ''}" data-consent="${name}:ask">תבדקו איתי</button></div>`;
    const left = prefDotsOf(mk, prefs, daysOfMonth(mk)).length;
    body.innerHTML = `${head}<div class="pweek-q"><h2>כמעט סיימנו</h2>
      <div class="pconsents"><div class="pconsent"><span>אם נצטרך, האם יהיה לך נוח להישאר עד 16:00 במשמרת בוקר?</span>${choice('extend')}</div>
      <div class="pconsent"><span>אם נצטרך, האם יהיה לך נוח להמשיך משבת בלילה עד יום ראשון ב-11:00?</span>${choice('pull')}</div></div>
      ${left ? `<div class="pnote pnote-soft">עוד ${left} משמרות עם נקודה</div>` : ''}
      ${prefPickLineHtml(mk, prefs)}
      <div class="pweek-nav"><button type="button" class="btn ghost" id="pw-prev">→ הקודם</button><button type="button" class="btn" id="pw-submit">הגשת ההעדפות</button></div></div>`;
    body.querySelectorAll('[data-consent]').forEach(b => b.addEventListener('click', () => { const [n, v] = b.dataset.consent.split(':'); prefs.consent[n] = v === 'ask' ? 'ask' : v === '1'; portalSave(); renderInstructorPrefs(body); }));
    body.querySelector('#pw-prev').addEventListener('click', () => go(weeks.length - 1));
    body.querySelector('#pw-submit').addEventListener('click', async () => {
      const c = prefs.consent || {}; if(c.extend === null || c.extend === undefined || c.pull === null || c.pull === undefined){ toast(tx('consent_needed')); return; }
      const um = prefUnmarkedKeys(mk, prefs);
      if(um.length){ const w = weeks.findIndex(wk => wk.includes(um[0].split('|')[0])); toast(`עוד ${um.length} משמרות עם נקודה`); go(w < 0 ? 0 : w); return; }
      try { await srvSubmit(mk, (m.notes && m.notes[me.id]) || '', m.goals[me.id] || null); } catch(e){ toast(tx('submit_fail')); return; }
      toast(tx('submit_ok')); renderInstructorPrefs(body);
    });
    prefViewWire(body);          // (the small switch, on every screen of the weekly view)
    return;
  }
  // one week
  const wk = weeks[pos], dots = prefDotsOf(mk, prefs, wk).length, fixedOn = d => (prefs.fixed || []).find(f => f.day === d);
  const lvOf = key => prefInsideLong(prefs, key) ? prefs.slots[`${prefLongFri(key)}|l`] : prefLevelOf(prefs, key);
  const rows = wk.map(date => {
    const out = !inMonth.has(date), fx = !out && fixedOn(date), away = !out && (fx || prefs.absent.includes(date)), hrs = !out && prefs.hours[date];
    return `<div class="pwday${out ? ' out' : ''}${away ? ' away' : ''}"><div class="pwday-name"><b>${pEsc(DOW_NAMES[dowOf(date)])}</b> <small>${parseIso(date).getDate()}/${parseIso(date).getMonth() + 1}</small>${hrs ? ` <small class="pday-hrs"><bdi dir="ltr">${hrs.map(([a, b]) => a + '–' + b).join(', ')}</bdi></small>` : ''}</div>
      ${out ? '' : away ? `<span class="pwday-away">${pEsc(fx ? FIXED_REASON[fx.reason] || 'היעדרות' : 'לא באה')}</span>` : `<div class="pwday-shifts">${prefShiftsFor(date).map(s => { const key = `${date}|${s.id}`, inLong = prefInsideLong(prefs, key);
        return `<button type="button" class="pshift pwshift lv-${lvOf(key) || 'neutral'}${inLong ? ' in-long' : ''}" data-pslot="${key}">${inLong ? '🕯️ ' : ''}${pEsc(s.label)}</button>`; }).join('')}</div>`}</div>`;
  }).join('');
  const last = pos === weeks.length - 1, blocked = plain && dots > 0;
  const range = `${parseIso(wk[0]).getDate()}/${parseIso(wk[0]).getMonth() + 1}–${parseIso(wk[6]).getDate()}/${parseIso(wk[6]).getMonth() + 1}`;
  body.innerHTML = `${head}<div class="pweek${plain ? ' plain' : ''}"><h2 class="pweek-title">שבוע ${pos + 1} מתוך ${weeks.length} <small><bdi dir="ltr">${range}</bdi></small></h2>
    ${plain ? '' : `<div class="plevelbar pweek-levels">${SRV_LEVEL_BUTTONS.filter(b => b[0] !== 'hours').map(b => `<button type="button" class="lvbtn lv-${b[0]}${(portalUi.level || 'yes') === b[0] ? ' active' : ''}" data-plevel="${b[0]}">${b[1]}</button>`).join('')}</div>`}
    <div class="pwdays">${rows}</div>
    ${prefWeekendBarHtml(wk, inMonth, prefs)}
    <div class="pweek-bottom">${plain ? prefPlainBarHtml() : '<div class="plevelbar pplain-bar"><button type="button" class="lvbtn" id="pplain-hours">שעות אחרות</button></div>'}</div>
    ${dots ? `<div class="pweek-left">עוד ${dots} ${dots === 1 ? 'נקודה' : 'נקודות'}</div>` : ''}
    <div class="pweek-nav"><button type="button" class="btn ghost" id="pw-prev">→ הקודם</button><button type="button" class="btn" id="pw-next"${blocked ? ' disabled' : ''}>${last ? 'לסיום ←' : 'השבוע הבא ←'}</button></div>
    <button type="button" class="btn ghost small pweek-month" id="pw-month">לראות את כל החודש</button></div>`;
  const redraw = () => renderInstructorPrefs(body);
  if(plain) prefWirePlain(body, prefs, redraw);
  else {
    if(!portalUi.level || portalUi.level === 'hours') portalUi.level = 'yes';
    body.querySelectorAll('[data-plevel]').forEach(b => b.addEventListener('click', () => { portalUi.level = b.dataset.plevel; redraw(); }));
    body.querySelectorAll('[data-pslot]').forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.pslot, lv = portalUi.level; if(prefInsideLong(prefs, key)){ toast(tx('long_inside')); return; }
      if(prefs.slots[key] === lv) delete prefs.slots[key]; else prefs.slots[key] = lv; portalSave(); redraw();
    }));
  }
  prefWeekendWire(body, prefs, plain, redraw);
  body.querySelector('#pplain-hours').addEventListener('click', () => prefHoursGuided(wk.filter(d => inMonth.has(d) && !fixedOn(d) && !prefs.absent.includes(d)), prefs, redraw));
  { const q = body.querySelector('#pplain-q'); if(q) q.addEventListener('click', () => prefPlainHelp(true)); }
  body.querySelector('#pw-prev').addEventListener('click', () => go(pos === 0 ? 'days' : pos - 1));
  body.querySelector('#pw-next').addEventListener('click', () => { if(blocked) return; go(last ? 'end' : pos + 1); });
  body.querySelector('#pw-month').addEventListener('click', () => { portalUi.prefsWholeMonth = true; redraw(); });
  prefViewWire(body);
  if(plain) prefPlainHelp(false);
}
// the whole month without colours: the same calendar, with dots, bold and faded; "שעות אחרות" asks which day
function prefPlainMonth(body, mk, prefs){
  const cal = body.querySelector('.pcal'); if(cal) cal.classList.add('plain');
  const bar = body.querySelector('.plevelbar'); if(bar) bar.outerHTML = prefPlainBarHtml();
  const redraw = () => renderInstructorPrefs(body);
  prefWirePlain(body, prefs, redraw);
  body.querySelectorAll('[data-pday]').forEach(b => b.addEventListener('click', e => e.stopImmediatePropagation(), true));          // (no "the whole day" without colours)
  const h = body.querySelector('#pplain-hours'); if(h) h.addEventListener('click', () => prefHoursGuided(daysOfMonth(mk).filter(d => !(prefs.fixed || []).some(f => f.day === d) && !prefs.absent.includes(d)), prefs, redraw));
  const q = body.querySelector('#pplain-q'); if(q) q.addEventListener('click', () => prefPlainHelp(true));
}
// after the month screen is drawn: without colours its own taps; and, for "שבוע אחרי שבוע" seen as a whole month, the way back
function prefMonthExtras(body, mk, prefs, locked, submitted){
  if(prefPlainOn() && !locked) prefPlainMonth(body, mk, prefs);
  if(portalServerOn && !locked && !prefOther() && !portalUi.prefsPast && portalMe().role === 'instructor'){ const t = body.querySelector('.pmonth, .pstatus'); if(t){ t.insertAdjacentHTML('beforebegin', prefViewBtnHtml()); prefViewWire(body); } }
  if(portalServerOn && srv.prefWeekly && portalUi.prefsWholeMonth && !locked && !submitted && !portalUi.prefsPast && !prefOther()){
    const s = body.querySelector('.pstatus'); if(s) s.insertAdjacentHTML('afterend', '<button type="button" class="btn ghost small" id="pw-back-week">חזרה לשבוע אחרי שבוע</button>');
    const bw = body.querySelector('#pw-back-week'); if(bw) bw.addEventListener('click', () => { portalUi.prefsWholeMonth = false; renderInstructorPrefs(body); });
  }
}

// ---- the small switch of the preferences (Guy 2026-11-03): "שבועי, בלי צבעים" or "חודשי, עם צבעים" ("יכול" comes back with the colours).
// Only the instructor's screen changes: the marks are stored as always, and the coordinator sees them in her colours.
const prefViewBtnHtml = () => portalServerOn ? `<div class="pview-row"><div class="mx-seg pview-seg" role="group" aria-label="תצוגת ההעדפות"><button type="button" data-pview="week" aria-pressed="${!!srv.prefWeekly}">שבועי, בלי צבעים</button><button type="button" data-pview="month" aria-pressed="${!srv.prefWeekly}">חודשי, עם צבעים</button></div></div>` : '';
function prefViewWire(body){
  body.querySelectorAll('[data-pview]').forEach(b => b.addEventListener('click', async () => {
    const week = b.dataset.pview === 'week';
    if(b.getAttribute('aria-pressed') === 'true' && !portalUi.prefsWholeMonth) return;
    portalUi.prefsWholeMonth = false; if(!week) portalUi.level = 'yes';
    await srvSaveSimplePrefs({ prefWeekly:week, prefPlain:week });
    renderInstructorPrefs(document.getElementById('portal-body'));
  }));
}
// the long weekend and "רק אחד מאלה" in the week of the weekend (approved by Guy 2026-11-03): shown only to who switched them on, as in the month screen
function prefWeekendBarHtml(wk, inMonth, prefs){
  if(!portalServerOn || !(srv.showLong || srv.pickOne)) return '';
  const fri = wk.find(d => dowOf(d) === 5 && inMonth.has(d)); if(!fri) return '';
  const gone = (prefs.fixed || []).some(f => f.day === fri) || prefs.absent.includes(fri), lv = gone ? 'no' : (prefs.slots[`${fri}|l`] || 'neutral'), picked = (prefs.pick || []).includes(fri);
  return `<div class="pwlong">${srv.showLong ? `<button type="button" class="pshift pwshift pwlong-btn lv-${lv}" data-plongw="${fri}"${gone ? ' disabled' : ''}>🕯️ סופ"ש ארוך <small>שישי–שבת</small></button>` : ''}${srv.pickOne ? `<button type="button" class="ppick${picked ? ' on' : ''}" data-ppickw="${fri}" aria-pressed="${picked}">⭐ רק אחד מאלה</button>` : ''}</div>`;
}
function prefWeekendWire(body, prefs, plain, redraw){
  body.querySelectorAll('[data-plongw]').forEach(b => b.addEventListener('click', () => {
    const fri = b.dataset.plongw, key = `${fri}|l`, cur = prefs.slots[key];
    const next = plain ? (cur === 'yes' ? 'no' : cur === 'no' ? null : 'yes') : (cur === (portalUi.level || 'yes') ? null : (portalUi.level || 'yes'));          // (it may stay unmarked: no dot to clear)
    if(next) prefs.slots[key] = next; else delete prefs.slots[key];
    if(['yes', 'avoid'].includes(next)){          // (the shifts inside the long weekend give way to it, as in the month screen)
      const sat = addDays(fri, 1), inside = [`${fri}|e`, `${fri}|n`, `${sat}|m`, `${sat}|e`].filter(k => prefs.slots[k]);
      inside.forEach(k => delete prefs.slots[k]); if(inside.length) toast(tx('long_replaced'));
    }
    portalSave(); redraw();
  }));
  body.querySelectorAll('[data-ppickw]').forEach(b => b.addEventListener('click', () => {
    const fri = b.dataset.ppickw; prefs.pick = (prefs.pick || []).includes(fri) ? prefs.pick.filter(f => f !== fri) : (prefs.pick || []).concat(fri);
    portalSave(); redraw();
  }));
}
function prefPickLineHtml(mk, prefs){          // the end screen: what "רק אחד מאלה" means for her, in one line
  if(!portalServerOn || !srv.pickOne) return '';
  const picks = (prefs.pick || []).filter(f => monthKeyOf(f) === mk).sort(), d = f => { const t = parseIso(f); return t.getDate() + '/' + (t.getMonth() + 1); };
  if(!picks.length) return '';
  return picks.length >= 2 ? `<div class="pnote pnote-soft">⭐ סימנת ${picks.length} סופי שבוע ב"רק אחד מאלה" (${picks.map(d).join(', ')}): נשבץ אותך רק באחד מהם.</div>`
    : `<div class="pnote pnote-soft">⭐ ב"רק אחד מאלה" צריך לפחות שני סופי שבוע. סימנת אחד (${d(picks[0])}).</div>`;
}
