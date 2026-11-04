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
// the marker of the steps: the numbers are always there, each under a dot; reaching a step, its dot gives way to the egg of that stage, up to the hatching chick (drawn here: no files to load). Eight stages, spread over the steps of the month.
// Seven kinds of egg: each instructor gets another one every month, by chance (Guy 2026-11-04). s = the shell, l = its line, p = what peeks out,
// mark = the pattern on the shell, head = who hatches (drawn around 0,0 in a radius of about 5).
const PW_EGG_KINDS = {
  chick:{ s:'#FFF4DC', l:'#B89358', p:'#F08A24', mark:'',
    head:'<circle r="5" style="fill:#FFD84A;stroke:#C99A1E;stroke-width:.8"/><circle class="e" cx="-1.7" cy="-.9" r=".85"/><circle class="e" cx="1.7" cy="-.9" r=".85"/><path class="b" d="M-1.2.6L0 2.2 1.2.6z"/>' },
  dragon:{ s:'#BFE3A6', l:'#4E8A3A', p:'#5FAE4B', mark:'<path style="fill:none;stroke:#4E8A3A;stroke-width:.7" d="M9 6.5q1.2 1.2 2.4 0M12.6 6.5q1.2 1.2 2.4 0M7.6 16.5q1.2 1.2 2.4 0M11 16.5q1.2 1.2 2.4 0M14.4 16.5q1.2 1.2 2.4 0"/>',
    head:'<path style="fill:#F2D478;stroke:#B8902E;stroke-width:.5" d="M-3.6-3.6L-4.6-6.8-1.6-4.6zM3.6-3.6L4.6-6.8 1.6-4.6z"/><circle r="5" style="fill:#6FBF5A;stroke:#3F7F30;stroke-width:.8"/><circle cx="-1.8" cy="-1.1" r="1.1" style="fill:#FFE27A"/><circle cx="1.8" cy="-1.1" r="1.1" style="fill:#FFE27A"/><circle class="e" cx="-1.8" cy="-1.1" r=".55"/><circle class="e" cx="1.8" cy="-1.1" r=".55"/><path style="fill:none;stroke:#2F5F24;stroke-width:.8;stroke-linecap:round" d="M-2 2q2 1.6 4 0"/><circle class="e" cx="-.7" cy=".8" r=".3"/><circle class="e" cx=".7" cy=".8" r=".3"/>' },
  dino:{ s:'#EAD9B6', l:'#8A6A3A', p:'#49A58E', mark:'<g style="fill:#B08A52"><circle cx="9.4" cy="7.6" r="1.1"/><circle cx="14.8" cy="9.4" r="1.4"/><circle cx="8.6" cy="16" r="1.3"/><circle cx="13" cy="17.6" r="1"/><circle cx="16" cy="15" r=".9"/></g>',
    head:'<path style="fill:#F08A24" d="M-4-3.2l1-2.8 1.4 2.2zM-1.4-4.4L0-7.2 1.4-4.4zM1.6-3.8L3-6l1 2.8z"/><ellipse rx="5.2" ry="4.6" style="fill:#57BBA2;stroke:#2F8570;stroke-width:.8"/><circle class="e" cx="-1.8" cy="-1.1" r=".85"/><circle class="e" cx="1.8" cy="-1.1" r=".85"/><path style="fill:none;stroke:#205F50;stroke-width:.8;stroke-linecap:round" d="M-2.4 1.4q2.4 1.8 4.8 0"/>' },
  ostrich:{ s:'#FBF6E9', l:'#A89878', p:'#F0A040', mark:'<g style="fill:#CFC3A6"><circle cx="9" cy="8" r=".45"/><circle cx="12" cy="6" r=".45"/><circle cx="15" cy="9" r=".45"/><circle cx="10" cy="11.5" r=".45"/><circle cx="14" cy="13" r=".45"/><circle cx="8.5" cy="15" r=".45"/><circle cx="12" cy="17" r=".45"/><circle cx="15.6" cy="16" r=".45"/></g>',
    head:'<rect x="-1.1" y="-1" width="2.2" height="8" style="fill:#D8CCBC;stroke:#9A8C78;stroke-width:.5"/><circle cy="-3" r="3.2" style="fill:#CDBFAE;stroke:#8E8070;stroke-width:.7"/><circle class="e" cx="-1" cy="-3.6" r=".85"/><circle class="e" cx="1.4" cy="-3.6" r=".6"/><path class="b" d="M-1.2-2.2h3.8L.4-.6z"/>' },
  penguin:{ s:'#DDEEF8', l:'#6C94AE', p:'#2D2A24', mark:'<path style="fill:none;stroke:#A9C8DC;stroke-width:.8;stroke-linecap:round" d="M8 9l1.4-1.2M15 7.6l1 1.4M8.6 16.4l1.4 1M14.4 17l1.4-1"/>',
    head:'<circle r="5" style="fill:#2D2A24"/><ellipse cy=".9" rx="3.6" ry="3.5" style="fill:#FFFFFF"/><circle class="e" cx="-1.5" cy="-.5" r=".8"/><circle class="e" cx="1.5" cy="-.5" r=".8"/><path class="b" d="M-1.2.8h2.4L0 2.4z"/>' },
  alien:{ s:'#D9C7F5', l:'#7A4FC2', p:'#7ED957', mark:'<g style="fill:#9CF06A;stroke:#7A4FC2;stroke-width:.3"><circle cx="9" cy="8.4" r=".9"/><circle cx="14.6" cy="7.6" r=".7"/><circle cx="12" cy="16.6" r="1"/><circle cx="8.4" cy="15.2" r=".6"/><circle cx="15.6" cy="15.6" r=".7"/></g>',
    head:'<path style="fill:none;stroke:#4FA832;stroke-width:.8" d="M-2-4.4L-3.2-7M2-4.4L3.2-7"/><circle cx="-3.2" cy="-7.2" r=".8" style="fill:#FF5A9A"/><circle cx="3.2" cy="-7.2" r=".8" style="fill:#FF5A9A"/><path style="fill:#86E05C;stroke:#4FA832;stroke-width:.8" d="M0-5c3.2 0 5 2 5 4.4C5 2 2.2 5 0 5s-5-3-5-5.6C-5-3-3.2-5 0-5z"/><ellipse class="e" cx="-2" cy="-.7" rx="1.4" ry="2" transform="rotate(18 -2 -.7)"/><ellipse class="e" cx="2" cy="-.7" rx="1.4" ry="2" transform="rotate(-18 2 -.7)"/>' },
  cat:{ s:'#FBD9DF', l:'#C4728A', p:'#F2A65A', mark:'<g style="fill:#E9A3B3"><circle cx="11" cy="16" r="1.5"/><circle cx="8.8" cy="13.6" r=".7"/><circle cx="10.6" cy="12.8" r=".7"/><circle cx="12.6" cy="13" r=".7"/><circle cx="14.2" cy="14.4" r=".7"/></g><path style="fill:#D8325A" d="M17.4 2.4h2l-.5 5h-1zM18.4 8.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>',
    head:'<path style="fill:#F2A65A;stroke:#B9722A;stroke-width:.6" d="M-4.6-2L-4.6-6.6-1-4.2zM4.6-2L4.6-6.6 1-4.2z"/><circle r="5" style="fill:#F2A65A;stroke:#B9722A;stroke-width:.8"/><circle class="e" cx="-1.8" cy="-.9" r=".85"/><circle class="e" cx="1.8" cy="-.9" r=".85"/><path style="fill:#D8325A" d="M-.6.6h1.2L0 1.4z"/><path style="fill:none;stroke:#7A4A1A;stroke-width:.45;stroke-linecap:round" d="M-2 1.4l-3.4-.4M-2 2.2l-3.2.8M2 1.4l3.4-.4M2 2.2l3.2.8"/><path style="fill:#D8325A" d="M6.2-8.6h1.8l-.5 4.6h-.9zM7.1-3.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9z"/>' }
};
const PW_EGG_NAMES = Object.keys(PW_EGG_KINDS);
// by chance, but the same on all her devices and another one every month: her own number and the month, around the seven kinds
const pwEggOf = mk => { let h = 0; String(srv.me || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); const [y, m] = mk.split('-').map(Number); return PW_EGG_NAMES[(h + y * 12 + m) % PW_EGG_NAMES.length]; };
const PW_CRACK = ['', '<path class="k" d="M9 8l1.5 2-1.2 1.6"/>', '<path class="k" d="M6.6 12l2-1.4 1.6 2 2-1.8 1.4 1.6"/>', '<path class="k" d="M5.4 12.6l2.2-1.8 2 2 2.4-2 2 2 2.2-1.8 2.4 1.6"/>'];
function pwEggHtml(stage, kind){
  const k = PW_EGG_KINDS[kind] || PW_EGG_KINDS.chick, st = `style="fill:${k.s};stroke:${k.l}"`, hole = '<path class="h" d="M8 12.2l2-1.8 2 1.8 2-1.8 2 1.8-1 3.4h-6z"/>';
  const whole = `<path class="s" ${st} d="M12 2.4c3.9 0 7 6 7 11.2a7 7 0 0 1-14 0C5 8.4 8.1 2.4 12 2.4z"/>${k.mark}`;
  const head = (y, sc) => `<g class="c" style="stroke:none" transform="translate(12 ${y}) scale(${sc})">${k.head}</g>`;
  let in_ = '';
  if(stage < 4) in_ = whole + PW_CRACK[stage];
  else if(stage === 4) in_ = whole + hole + '<path class="k" d="M5.4 12.6l2.6-.4M16 12.2l2.6.4"/>';
  else if(stage === 5) in_ = whole + hole + `<path style="fill:${k.p}" d="M10.6 13.4l1.4 2 1.4-2z"/>`;
  else if(stage === 6) in_ = head(11, .92) + `<path class="s" ${st} d="M6 12.5l2.4 1.6 1.8-1.4 1.8 1.4 1.8-1.4 1.8 1.4 2.4-1.6c.4 5-2.4 9-6 9s-6.4-4-6-9z"/>`;
  else in_ = head(9, 1.04) + `<path class="s" ${st} d="M5.4 13.6l2.6 1.8 2-1.6 2 1.6 2-1.6 2 1.6 2.6-1.8c.3 4.4-2.6 8-6.6 8s-6.9-3.6-6.6-8z"/>`;
  return `<svg class="pw-egg" viewBox="0 0 24 24" aria-hidden="true" data-egg="${kind || 'chick'}">${in_}</svg>`;
}
const pwStage = (i, n) => n < 2 ? 0 : Math.round(i * 7 / (n - 1));
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
  const go = p => { pwSet(pwPosKey(mk), p); renderInstructorPrefs(body); window.scrollTo(0, 0); if(window.navRefresh) window.navRefresh(); };
  const steps = ['kinds', 'days'].concat(weeks.map((_, i) => i)).concat(['end']), at = steps.indexOf(pos);
  const head = `${prefViewBtnHtml()}<div class="pweek-head"><b>ההעדפות ל${pEsc(monthLabel(mk))}</b><span class="pweek-steps" role="img" aria-label="שלב ${at + 1} מתוך ${steps.length}">${steps.map((p, i) => `<i class="${i === at ? 'on' : i < at ? 'done' : ''}">${i <= at ? pwEggHtml(pwStage(i, steps.length), pwEggOf(mk)) : '<span class="pw-dot"></span>'}<b>${i + 1}</b></i>`).join('')}</span></div>`;
  // the opening questions: the kinds of shifts and the weekdays she does not do this month (both may be skipped)
  if(pos === 'kinds' || pos === 'days'){
    const isK = pos === 'kinds', chosenKey = `ramzor-week${isK ? 'kinds' : 'days'}-${srv.me}-${mk}`;
    const fixedK = isK ? prefFixedKinds() : new Set();
    const chosen = new Set(pwGet(chosenKey, isK ? [] : (srv.fixedDays || [])));
    const other = new Set(pwGet(`ramzor-week${isK ? 'days' : 'kinds'}-${srv.me}-${mk}`, isK ? (srv.fixedDays || []) : []));          // (what the other question keeps "לא")
    const opts = isK ? PW_KINDS : DOW_NAMES.map((d, i) => [i, d]);
    body.innerHTML = `${head}<div class="pweek-q"><h2>${isK ? `יש משמרות ש${prefG('את', 'אתה')} לא ${prefG('עושה', 'עושה')} החודש?` : `האם יש יום קבוע בשבוע שבו לא ${prefG('תגיעי', 'תגיע')} החודש?`}</h2>
      <div class="pnote">${isK ? 'אפשר לבחור יותר מאחת. הן יסומנו "לא" בכל החודש.' : 'כל המופעים של הימים שבחרת יסומנו מראש כ׳לא׳.'}</div>
      <div class="pweek-opts">${opts.map(([k, w]) => { const fx = isK && fixedK.has(k); return `<button type="button" class="pweek-opt${fx || chosen.has(k) ? ' on' : ''}" data-pwopt="${k}"${fx ? ' disabled' : ''}>${pEsc(w)}${fx ? '<small>קבוע בהגדרות</small>' : ''}</button>`; }).join('')}</div>
      <div class="pweek-nav">${isK ? '' : '<button type="button" class="btn ghost" id="pw-prev">→ הקודם</button>'}<button type="button" class="btn ghost" id="pw-skip">דלג</button><button type="button" class="btn" id="pw-next">המשך ←</button></div></div>`;
    // a choice is applied at once, so nothing is lost going back and forth; a shift the other question keeps "לא" stays so
    const match = (date, sid, k, kinds) => kinds ? sid === k : dowOf(date) === k, covered = (set, date, sid, kinds) => [...set].some(k => match(date, sid, k, kinds));
    const apply = was => {
      daysOfMonth(mk).forEach(date => {
        if(prefs.absent.includes(date) || (prefs.fixed || []).some(f => f.day === date)) return;
        prefShiftsFor(date).forEach(s => { const key = `${date}|${s.id}`;
          if(covered(chosen, date, s.id, isK)) prefs.slots[key] = 'no';
          else if(covered(was, date, s.id, isK) && !covered(other, date, s.id, !isK) && prefs.slots[key] === 'no') delete prefs.slots[key]; });          // (taken back from the list: those shifts wait for a mark again)
      });
      pwSet(chosenKey, [...chosen]); portalSave();
    };
    body.querySelectorAll('[data-pwopt]').forEach(b => b.addEventListener('click', () => { const k = isK ? b.dataset.pwopt : Number(b.dataset.pwopt), was = new Set(chosen); if(chosen.has(k)) chosen.delete(k); else chosen.add(k); b.classList.toggle('on', chosen.has(k)); apply(was); }));
    const next = isK ? 'days' : 0;
    body.querySelector('#pw-skip').addEventListener('click', () => go(next));
    body.querySelector('#pw-next').addEventListener('click', () => go(next));
    { const pv = body.querySelector('#pw-prev'); if(pv) pv.addEventListener('click', () => go('kinds')); }
    prefViewWire(body);          // (the small switch, on every screen of the weekly view)
    return;
  }
  // the end: the two small questions every instructor answers, and handing in
  if(pos === 'end'){
    const cons = prefs.consent || { extend:null, pull:null };
    const choice = name => `<div class="pchoice" role="group"><button type="button" class="${cons[name] === true ? 'on' : ''}" data-consent="${name}:1">כן</button><button type="button" class="${cons[name] === false ? 'on' : ''}" data-consent="${name}:0">לא</button><button type="button" class="${cons[name] === 'ask' ? 'on' : ''}" data-consent="${name}:ask">תבדקו איתי</button><button type="button" class="${cons[name] === 'na' ? 'on' : ''}" data-consent="${name}:na">לא רלוונטי</button></div>`;
    const left = prefDotsOf(mk, prefs, daysOfMonth(mk)).length;
    body.innerHTML = `${head}<div class="pweek-q"><h2>כמעט סיימנו</h2>
      <div class="pconsents"><div class="pconsent"><span>אם נצטרך, האם יהיה לך נוח להישאר עד 16:00 במשמרת בוקר?</span>${choice('extend')}</div>
      <div class="pconsent"><span>אם נצטרך, האם יהיה לך נוח להמשיך משבת בלילה עד יום ראשון ב-11:00?</span>${choice('pull')}</div></div>
      ${left ? `<div class="pnote pnote-soft">עוד ${left} משמרות עם נקודה</div>` : ''}
      ${prefPickLineHtml(mk, prefs)}
      <div class="pweek-nav"><button type="button" class="btn ghost" id="pw-prev">→ הקודם</button><button type="button" class="btn" id="pw-submit">הגשת ההעדפות</button></div></div>`;
    body.querySelectorAll('[data-consent]').forEach(b => b.addEventListener('click', () => { const [n, v] = b.dataset.consent.split(':'); prefConsentSet(mk, prefs, n, v); portalSave(); renderInstructorPrefs(body); }));
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
    return `<div class="pwday${out ? ' out' : ''}${away ? ' away' : ''}">${out || away ? '<div class="pwday-name">' : `<button type="button" class="pwday-name pwday-all" data-pwday="${date}" aria-label="כל ${pEsc(dayLabel(date))}">`}<b>${pEsc(DOW_NAMES[dowOf(date)])}</b> <small>${parseIso(date).getDate()}/${parseIso(date).getMonth() + 1}</small>${hrs ? ` <small class="pday-hrs"><bdi dir="ltr">${hrs.map(([a, b]) => a + '–' + b).join(', ')}</bdi></small>` : ''}${out || away ? '</div>' : '</button>'}
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
  // the day itself: its shifts all at once, as in the month with colours (here: dots / mixed -> כן, כן -> לא, לא -> כן); a shift still changes by itself
  body.querySelectorAll('[data-pwday]').forEach(b => b.addEventListener('click', () => {
    const date = b.dataset.pwday, keys = prefShiftsFor(date).map(s => `${date}|${s.id}`).filter(k => !prefFixedNo(k) && !prefInsideLong(prefs, k)); if(!keys.length) return;
    if(plain){ const to = keys.every(k => ['yes', 'avoid'].includes(prefs.slots[k])) ? 'no' : 'yes'; keys.forEach(k => { prefs.slots[k] = to; }); }
    else { const lv = portalUi.level || 'yes'; if(keys.every(k => prefs.slots[k] === lv)) keys.forEach(k => delete prefs.slots[k]); else keys.forEach(k => { prefs.slots[k] = lv; }); }
    portalSave(); if(plain) prefPlainHelp(false); redraw();
  }));
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
  // the month opened from the process: one button in the bar at the bottom, back to the very step it was opened from (the marks stay)
  if(portalServerOn && srv.prefWeekly && portalUi.prefsWholeMonth && !locked && !portalUi.prefsPast && !prefOther()){
    const bar = body.querySelector('.plevelbar'); if(bar) bar.outerHTML = '<div class="plevelbar pflow-bar"><button type="button" class="lvbtn" id="pw-back-flow">חזרה לתהליך</button></div>';
    const bw = body.querySelector('#pw-back-flow'); if(bw) bw.addEventListener('click', () => { portalUi.prefsWholeMonth = false; renderInstructorPrefs(body); if(window.navRefresh) window.navRefresh(); });
  }
}

// ---- the small switch of the preferences: "שלב שלב, בלי יכול" (the staged process) or "שבוע-שבוע" (with the colours and "יכול", one week of the calendar at a time).
// Only the instructor's screen changes: the marks are stored as always, and the coordinator sees them in her colours.
const prefViewBtnHtml = () => portalServerOn ? `<div class="pview-row"><div class="mx-seg pview-seg" role="group" aria-label="תצוגת ההעדפות"><button type="button" data-pview="week" aria-pressed="${!!srv.prefWeekly}">שלב שלב, בלי יכול</button><button type="button" data-pview="month" aria-pressed="${!srv.prefWeekly}">שבוע-שבוע</button></div></div>` : '';
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

// ---- "חזור" in the process: always one step back (15b-history.js asks here first). From the month opened in the process: back to the step it came from.
function prefFlowState(){
  if(typeof portalUi === 'undefined' || !portalServerOn || !srv.prefWeekly || portalUi.tab !== 'prefs' || portalUi.prefsPast || prefOther()) return null;
  if(!document.querySelector('#view-portal.active') || (portalMe() || {}).role !== 'instructor') return null;
  const mk = prefsMonthNow(); if(!srvPrefsOpen(mk)) return null;
  const weeks = prefWeeksOf(mk), steps = ['kinds', 'days'].concat(weeks.map((_, i) => i)).concat(['end']);
  return { mk, steps, at:Math.max(0, steps.indexOf(pwGet(pwPosKey(mk), 'kinds'))) };
}
function prefFlowCanBack(){ const f = prefFlowState(); return !!f && (!!portalUi.prefsWholeMonth || f.at > 0); }
function prefFlowBack(){
  const f = prefFlowState(), body = document.getElementById('portal-body'); if(!f || !body) return false;
  if(portalUi.prefsWholeMonth){ portalUi.prefsWholeMonth = false; renderInstructorPrefs(body); return true; }
  if(f.at === 0) return false;
  pwSet(pwPosKey(f.mk), f.steps[f.at - 1]); renderInstructorPrefs(body); window.scrollTo(0, 0); return true;
}
// ---- "לא רלוונטי" of the two small questions: marked by itself for who chose no morning at all / no Saturday night at all, and taken off (the question
// is open again) when such a shift is chosen. One pressed by hand stays. Which were marked by themselves is remembered on the device.
const prefConsentAutoKey = mk => `ramzor-consent-auto-${srv.me}-${mk}`;
function prefConsentSet(mk, prefs, name, v){
  prefs.consent[name] = v === 'na' ? 'na' : v === 'ask' ? 'ask' : v === '1';
  const a = pwGet(prefConsentAutoKey(mk), {}); delete a[name]; pwSet(prefConsentAutoKey(mk), a);
}
function prefConsentAuto(mk, prefs, submitted){
  const days = daysOfMonth(mk), chosen = k => ['yes', 'avoid', 'can'].includes(prefs.slots[k]);
  const none = {
    extend:!days.some(d => chosen(`${d}|m`) || (dowOf(d) === 6 && chosen(`${addDays(d, -1)}|l`))),          // (the long weekend holds a Saturday morning)
    pull:!days.some(d => dowOf(d) === 6 && chosen(`${d}|n`))
  };
  const auto = pwGet(prefConsentAutoKey(mk), {}); let changed = false;
  ['extend', 'pull'].forEach(n => {
    if(none[n] && prefs.consent[n] !== 'na' && (!submitted || prefs.consent[n] === null || prefs.consent[n] === undefined)){ prefs.consent[n] = 'na'; auto[n] = true; changed = true; }          // (an answer already handed in is not touched by just looking)
    else if(!none[n] && prefs.consent[n] === 'na' && auto[n]){ prefs.consent[n] = null; delete auto[n]; changed = true; }
  });
  if(changed){ pwSet(prefConsentAutoKey(mk), auto); portalSave(); }
}
