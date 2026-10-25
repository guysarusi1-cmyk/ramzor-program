
// ---------- THE COORDINATOR: what needs her attention, worked out in the browser from the schedule as it is now (Guy, 2026-10-25) ----------
// Staffing, the night, the ahmash, rest and two shifts on one day are checked again after every change she makes by hand: a problem she fixed
// disappears at once, and a new one shows at once. The same rules as the engine (model.py: morn_cov / aft_cov, the nights, the ahmash).
// The engine's own notes of these kinds are not shown any more (they were true only when the schedule was built); its other notes stay as they were.
const CS_LIVE_KINDS = ['staffing', 'night', 'ahmash', 'rest', 'double'];
const CS_ISSUE_KIND = { staffing:'איוש', night:'לילה', ahmash:'אחמ"ש', rest:'מנוחה', double:'שתי משמרות ביום', no:'שובץ/ה ב"לא"' };

// the usual holidays (the engine's calendar_il.py): Tishrei / Nisan / Sivan by the browser's Hebrew calendar; the coordinator's special days come first
const CS_HEB_HOLIDAY = { 'Tishri|1':'holiday', 'Tishri|2':'holiday', 'Tishri|10':'holiday', 'Tishri|15':'holiday', 'Tishri|22':'holiday', 'Nisan|15':'holiday', 'Nisan|21':'holiday', 'Sivan|6':'holiday',
  'Elul|29':'eve', 'Tishri|9':'eve', 'Tishri|14':'eve', 'Tishri|21':'eve', 'Nisan|14':'eve', 'Nisan|20':'eve', 'Sivan|5':'eve' };
function csHebKind(date){
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', { month:'long', day:'numeric', timeZone:'UTC' }).formatToParts(new Date(date + 'T12:00:00Z'));
    const mo = (parts.find(p => p.type === 'month') || {}).value, dy = (parts.find(p => p.type === 'day') || {}).value;
    return CS_HEB_HOLIDAY[`${mo}|${parseInt(dy, 10)}`] || null;
  } catch(e){ return null; }
}
const csSpecial = date => { const sp = (portalLoad().specialDays || {})[date]; if(sp) return sp; const k = csHebKind(date); return k ? { kind:k } : null; };
function csDayType(date, sp){
  const dow = dowOf(date), natural = ['sun', 'mid', 'mid', 'mid', 'thu', 'fri', 'sat'][dow];
  if(sp && sp.kind === 'holiday' && dow <= 4) return 'sat';
  if(sp && sp.kind === 'eve' && dow <= 4) return 'fri';
  return natural;
}
const csHourOf = (t, up) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) + (up && m ? 1 : 0); };          // ('14:30' -> 14 as a start, 15 as an end)
// the hours of the morning (7..14) and of the afternoon (14..21) a row of the schedule covers: [date|M|h, ...]
function csRowCover(r){
  const out = [], add = (date, chan, a, b) => { for(let h = Math.max(a, chan === 'M' ? 7 : 14); h < Math.min(b, chan === 'M' ? 15 : 22); h++) out.push(`${date}|${chan}|${h}`); };
  if(r.shift === 'N') return out;
  if(r.shift === 'L'){ const sat = addDays(r.day, 1); add(r.day, 'A', 17, 22); add(sat, 'M', 7, 15); add(sat, 'A', 14, r.to ? csHourOf(r.to, true) || 20 : 20); return out; }
  const std = SRV_STD[r.shift] || ['07:00', '15:00'], a = csHourOf(r.from || std[0]), b0 = csHourOf(r.to || std[1], true), b = b0 <= a ? b0 + 24 : b0;
  if(r.shift === 'M' || r.shift === 'S'){ add(r.day, 'M', a, Math.min(b, 15)); if(b > 15) add(r.day, 'A', Math.max(a, 14), b); }
  else { if(a < 14) add(r.day, 'M', a, 14); add(r.day, 'A', Math.max(a, 14), b); }
  return out;
}
// the service girls of a day as the engine counts them: [in the morning 07-15, in the afternoon 14-22 (Sunday: 11-19)], or null on other days
function csServiceOf(date, rows, role){
  const dtp = csDayType(date, csSpecial(date)); if(!['sun', 'mid', 'thu'].includes(dtp)) return null;
  let early = 0, late = 0;
  rows.filter(r => r.day === date && role(r.staff) === 'service').forEach(r => {
    const a = csHourOf(r.from || '07:00'), b = csHourOf(r.to || '15:00', true), ov = (x, y) => Math.min(b, y) - Math.max(a, x) >= 2 ? 1 : 0;
    if(dowOf(date) === 0) late += ov(11, 19); else { early += ov(7, 15); late += ov(14, 22); }
  });
  return [dowOf(date) === 0 ? 2 : early, late];
}
function csSpecialHit(sp, chan, h){
  if(!sp || sp.kind !== 'special' || sp.min == null) return false;
  const scope = sp.scope || 'all';
  return scope === 'all' || (scope === 'morning' && chan === 'M') || (scope === 'afternoon' && chan === 'A') || (scope === 'hours' && sp.from != null && sp.to != null && sp.from <= h && h < sp.to);
}
// the fewest instructors an hour needs (model.py morn_cov / aft_cov)
function csNeed(date, chan, h, sc){
  const sp = csSpecial(date), dtp = csDayType(date, sp);
  if(csSpecialHit(sp, chan, h)) return sp.min;
  if(chan === 'M'){
    if(dtp === 'fri' || dtp === 'sat') return 5;
    const [early, late] = sc || [2, 2];
    let lo = dtp === 'sun' ? (h < 11 ? 2 : 1) : (early < 2 ? 2 : 1);
    const here = dtp === 'sun' ? late : early;
    if(h >= 11 && h <= 13 && here < 2) lo = Math.max(lo, here === 1 ? 2 : 3);
    return lo;
  }
  if(dtp === 'sun' || dtp === 'mid') return sc && sc[1] < 2 ? (h < 19 ? 5 : 4) : 4;
  if(dtp === 'thu' || dtp === 'fri') return 5;
  return h >= 20 ? 4 : 5;
}

// -> [{ day, kind, text, goto:'date|m/e/n', id }] for the month (in the current month: from today on)
function csLiveIssues(mk){
  const st = portalLoad(), today = srvToday(), rows = (st.rows || []).filter(r => monthKeyOf(r.day) === mk || monthKeyOf(addDays(r.day, 1)) === mk);
  const person = id => st.instructors.find(p => p.id === id), role = id => (person(id) || {}).role, priv = id => (st.priv || {})[id] || {};
  const nm = id => { const p = person(id); return p ? instrName(p, st.instructors) : '?'; };
  const instr = rows.filter(r => role(r.staff) === 'instructor'), out = [];
  const days = daysOfMonth(mk).filter(d => d >= today);
  const add = (day, kind, text, sid) => out.push({ day, kind, text, goto:sid ? `${day}|${sid}` : null, id:`${kind}|${day}|${text}` });
  // staffing, hour by hour
  const cov = {}; instr.forEach(r => csRowCover(r).forEach(k => { (cov[k] = cov[k] || []).push(r); }));
  days.forEach(date => {
    const sc = csServiceOf(date, rows, role), dtp = csDayType(date, csSpecial(date));
    [['M', 'm', 'בוקר', 7, 15], ['A', 'e', 'צהריים', 14, 22]].forEach(([chan, sid, word, h0, h1]) => {
      let run = null; const flush = () => { if(run){ add(date, 'staffing', `${word}: ${run.miss === 1 ? 'חסר מדריך' : `חסרים ${run.miss} מדריכים`} בין ${String(run.a).padStart(2, '0')}:00 ל-${String(run.b).padStart(2, '0')}:00`, sid); run = null; } };
      for(let h = h0; h < h1; h++){
        let have = (cov[`${date}|${chan}|${h}`] || []).length;
        if(chan === 'A' && h === 21) have += (cov[`${date}|A|20`] || []).filter(r => priv(r.staff).latest_end_hour === 21 && !(cov[`${date}|A|21`] || []).includes(r)).length;          // (whoever leaves at 21:00 by her own limit)
        if(chan === 'A' && dtp === 'fri' && h < 17) have += instr.filter(r => r.shift === 'L' && r.day === date).length;          // (a long-weekend instructor counts as the fifth from 14:00)
        const miss = Math.max(0, csNeed(date, chan, h, sc) - have);
        if(miss && run && run.miss === miss) run.b = h + 1;
        else { flush(); if(miss) run = { a:h, b:h + 1, miss }; }
      }
      flush();
    });
    // the night: exactly two (a special day may have its own number), at least one woman, never two men
    const ns = instr.filter(r => r.shift === 'N' && r.day === date), sp = csSpecial(date);
    const need = sp && sp.kind === 'special' && sp.min != null && sp.scope === 'night' ? sp.min : 2;
    if(ns.length < need) add(date, 'night', `בלילה ${ns.length ? `יש רק ${ns.length === 1 ? 'מדריך אחד' : ns.length + ' מדריכים'}` : 'אין מדריכים'} (צריך ${need})`, 'n');
    if(ns.length && !ns.some(r => priv(r.staff).female !== false)) add(date, 'night', 'בלילה אין אישה', 'n');
    if(ns.filter(r => priv(r.staff).female === false).length >= 2) add(date, 'night', 'בלילה שני גברים', 'n');
    // an ahmash on every afternoon, and on Friday and Saturday mornings (the long weekend of Friday counts for Saturday morning)
    const ahm = r => (priv(r.staff).ahmash_rank || 0) > 0;
    if(!instr.some(r => r.day === date && r.shift === 'A' && ahm(r))) add(date, 'ahmash', 'אין אחמ"ש במשמרת הצהריים', 'e');
    if((dtp === 'fri' || dtp === 'sat') && !instr.some(r => ((r.day === date && (r.shift === 'M' || r.shift === 'S')) || (dowOf(date) === 6 && r.shift === 'L' && addDays(r.day, 1) === date)) && ahm(r))) add(date, 'ahmash', 'אין אחמ"ש במשמרת הבוקר', 'm');
  });
  // per person: two shifts that start on the same day, rest that is too short, a shift she marked "no"
  const sidOf = r => r.shift === 'L' ? 'e' : SRV_SHIFT_UI[r.shift === 'S' ? 'M' : r.shift];
  const byPerson = {}; instr.forEach(r => { (byPerson[r.staff] = byPerson[r.staff] || []).push(r); });
  Object.entries(byPerson).forEach(([pid, list]) => {
    list.sort((a, b) => rowParts(a)[0][0] - rowParts(b)[0][0]);
    const byDay = {}; list.forEach(r => { (byDay[r.day] = byDay[r.day] || []).push(r); });
    Object.entries(byDay).forEach(([day, same]) => { if(same.length > 1 && days.includes(day)) add(day, 'double', `${nm(pid)}: ${same.map(r => SRV_SHIFT_WORD[r.shift]).join(' וגם ')} באותו יום`, sidOf(same[1])); });
    for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length && j <= i + 2; j++){
      const a = list[i], b = list[j]; if(a.day === b.day || !days.includes(b.day)) continue;
      const c = partsConflict(rowParts(a), rowParts(b));
      if(c) add(b.day, 'rest', `${nm(pid)}: ${c}, בין ${SRV_SHIFT_WORD[a.shift]} ${shortDate(a.day)} ל${SRV_SHIFT_WORD[b.shift]} ${shortDate(b.day)}`, sidOf(b));
    }
    list.forEach(r => {
      if(!days.includes(r.day) || (r.flags || []).includes('ok')) return;
      const key = r.shift === 'L' ? `${r.day}|l` : `${r.day}|${sidOf(r)}`;
      if(srvWishFor(pid, key) === 'no') add(r.day, 'no', `${nm(pid)} שובץ/ה ב${SRV_SHIFT_WORD[r.shift]} ומסומן/ת "לא" או היעדרות`, sidOf(r));
    });
  });
  return out;
}

// all that needs her attention for the month, by date (the date first; the ones with no date at the end): the engine's notes that are still
// open, the live checks (minus those she marked as handled), the open days and the service-girls line
function csAllIssues(mk){
  const st = portalLoad(), flags = (st.flags || []).filter(f => f.month && f.month.slice(0, 7) === mk);
  const handled = new Set((st.flagsDone || []).filter(f => f.month && f.month.slice(0, 7) === mk).map(f => f.text));
  const out = flags.filter(f => !SRV_FLAG_HIDDEN.includes(f.kind) && f.kind !== 'service' && !CS_LIVE_KINDS.includes(f.kind))
    .map(f => ({ day:f.day || null, kind:f.kind, word:SRV_FLAG_KIND[f.kind] || f.kind, text:f.text, goto:f.day ? `${f.day}|` : null, flagId:f.id }));
  csLiveIssues(mk).filter(x => !handled.has(x.id)).forEach(x => out.push(Object.assign({ word:CS_ISSUE_KIND[x.kind], liveId:x.id }, x)));
  const m = portalMonth(mk);
  if(m.published) srvOdAlerts(mk).forEach(a => out.push({ day:null, kind:'od', word:'יום פתוח לשיבוץ', text:a }));
  const svcDays = [...new Set(flags.filter(f => f.kind === 'service' && f.day).map(f => f.day))].sort();
  if(svcDays.length) out.push({ day:null, kind:'service', word:'בנות שירות', text:`ב-${svcDays.length} ימים יש פחות משתי בנות שירות: ${svcDays.map(shortDate).join(', ')}. כללי המדריכים שונו בהתאם.` });
  return out.sort((a, b) => (a.day ? 0 : 1) - (b.day ? 0 : 1) || String(a.day || '').localeCompare(String(b.day || '')) || String(a.goto || '').localeCompare(String(b.goto || '')));
}
const csIssueHtml = x => `<div class="pflag cs-issue">${x.day ? `<span class="cs-issue-date">${pEsc(dayLabel(x.day))}</span>` : ''}<span class="cs-issue-body">${x.goto ? `<button type="button" class="cs-issue-kind" data-goto="${x.goto}" title="מעבר ליום בלוח">${pEsc(x.word)}</button>` : `<b class="cs-issue-kind">${pEsc(x.word)}</b>`} · ${pEsc(x.text)}</span>${x.flagId ? `<button type="button" class="btn ghost small" data-flag-done="${x.flagId}">טופל</button>` : x.liveId ? `<button type="button" class="btn ghost small" data-live-done="${pEsc(x.liveId)}">טופל</button>` : ''}</div>`;
// the short list in the panel at the side: the next three, from the start of the month shown (in the current month: from today); "הבאים" moves on by three
function csIssuesPanelHtml(mk, all){
  if(!all.length) return `<div class="cs-issues-panel"><h4>דורש תשומת לב</h4><div class="pnote">אין דברים שדורשים תשומת לב ✓</div></div>`;
  const off = (portalUi.csIssueOff || 0) % all.length, three = all.slice(off, off + 3);
  return `<div class="cs-issues-panel"><h4>דורש תשומת לב <small>${off + 1}–${off + three.length} מתוך ${all.length}</small></h4>${three.map(csIssueHtml).join('')}
    ${all.length > 3 ? `<button type="button" class="btn ghost small" id="cs-issues-next">${off + 3 >= all.length ? 'חזרה להתחלה' : 'שלושת הבאים ›'}</button>` : ''}</div>`;
}
// a tap on the kind of a note: the calendar scrolls to that day (that shift when it is known) and it lights up for a moment
function csGotoDay(body, goto){
  const [date, sid] = goto.split('|');
  const cell = (sid && body.querySelector(`.mcal-cell[data-day="${date}"][data-shift="${sid}"]`)) || body.querySelector(`.mcal-cell[data-day="${date}"]`);
  if(!cell){ toast('היום הזה לא מוצג בלוח'); return; }
  cell.scrollIntoView({ block:'center', inline:'center', behavior:'smooth' });
  const cells = sid ? [cell] : [...body.querySelectorAll(`.mcal-cell[data-day="${date}"]`)];
  cells.forEach(c => { c.classList.remove('cs-flash'); void c.offsetWidth; c.classList.add('cs-flash'); });
  setTimeout(() => cells.forEach(c => c.classList.remove('cs-flash')), 2600);
}
function csIssuesWire(body, mk){
  body.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); csGotoDay(body, b.dataset.goto); }));
  const nx = body.querySelector('#cs-issues-next'); if(nx) nx.addEventListener('click', () => { portalUi.csIssueOff = (portalUi.csIssueOff || 0) + 3; srvRenderCoordSchedule(body); });
  body.querySelectorAll('[data-live-done]').forEach(b => b.addEventListener('click', async () => {          // (a live note she handled another way: kept as handled, also on her other devices)
    b.disabled = true; const st = portalLoad();
    const r = await sbPersonal.from('coordinator_flags').insert({ month:firstOf(mk), day:b.dataset.liveDone.split('|')[1] || null, kind:'handled', text:b.dataset.liveDone, resolved:true }).select('month,text').single();
    if(r.error){ b.disabled = false; toast('העדכון נכשל'); return; }
    st.flagsDone = (st.flagsDone || []).concat(r.data); srvRenderCoordSchedule(body);
  }));
}
