
// ---------- THE INSTRUCTOR PORTAL: what an instructor sees (schedule, preferences, swaps, messages) ----------
// a time range always reads left-to-right (07:00–15:00), also inside Hebrew text
function rangeHtml(a, b){ return `<bdi dir="ltr">${a}–${b}</bdi>`; }
function slotLabel(key){
  const { date, shiftId } = splitKey(key), s = portalLoad().shiftTypes.find(x => x.id === shiftId);
  return `${dayLabel(date)} · ${s ? s.label + ' ' + rangeHtml(s.start, s.end) : shiftId}`;
}
const slotText = key => slotLabel(key).replace(/<[^>]+>/g, '');          // the same, as plain text (e-mails, questions)
function addNotice(to, text, kind){
  const st = portalLoad();
  st.notices.unshift({ id:'n' + Date.now() + Math.floor(Math.random() * 1000), to, at:new Date().toISOString(), text, kind:kind || 'info', seen:false });
  st.notices.length = Math.min(st.notices.length, 80);
}
// the shifts a person has in a month (from the published schedule)
function myShifts(me, mk){
  const m = portalMonth(mk), ctx = portalCtx(mk);
  if(!m.published) return [];
  return buildSlots(mk, ctx.shiftTypes).filter(s => (m.assignments[s.key] || []).includes(me.id));
}
// the next shift that has not ended yet (this month or next)
function nextShiftOf(me){
  const now = Date.now(), mk = monthKeyOf(isoDate(new Date()));
  return [...myShifts(me, mk), ...myShifts(me, addMonths(mk, 1))].filter(s => s.end > now).sort((a, b) => a.start - b.start)[0] || null;
}
function openFold(name){ return !!portalUi.fold[name]; }
function wireFolds(root){
  root.querySelectorAll('details[data-fold]').forEach(d => d.addEventListener('toggle', () => { portalUi.fold[d.dataset.fold] = d.open; }));
}

function renderInstructorSchedule(body){
  const me = portalMe(), st = portalLoad(), mk = portalUi.month, m = portalMonth(mk), ctx = portalCtx(mk);
  const mine = myShifts(me, mk), now = Date.now(), next = nextShiftOf(me);
  const notices = st.notices.filter(n => n.to === me.id && !n.seen);
  const openByKey = {}; st.swaps.filter(s => s.from === me.id && ['open', 'offered'].includes(s.status)).forEach(s => { openByKey[s.key] = s; });
  const shiftOf = id => ctx.shiftTypes.find(x => x.id === id);
  body.innerHTML = `
    ${notices.map(n => `<div class="pnotice ${n.kind}" role="status"><span>${pEsc(n.text)}</span><button type="button" class="btn small" data-notice-ok="${n.id}">הבנתי</button></div>`).join('')}
    ${monthNavHtml(mk)}
    ${!m.published ? `<div class="pnote">הסידור לחודש הזה עוד לא פורסם. ${m.deadline ? `ההעדפות נסגרות ב-${parseIso(m.deadline).getDate()}/${parseIso(m.deadline).getMonth() + 1}.` : ''}</div>` : `
    <details class="pfold" data-fold="mine"${openFold('mine') ? ' open' : ''}>
      <summary><span>המשמרות שלי</span><span class="pcount">${mine.length}</span></summary>
      <div class="pfold-body">
        <details class="pfold sub" data-fold="swap"${openFold('swap') ? ' open' : ''}>
          <summary><span>בקשת החלפה</span></summary>
          <div class="pnote">ליד כל משמרת עתידית מופיע כפתור. לחיצה עליו מפרסמת את המשמרת במסך ההחלפות, ושם עמיתים יכולים להציע להחליף אותך.</div>
        </details>
        <div class="pmine">${mine.length ? mine.map(s => {
          const sh = shiftOf(s.shiftId), isNext = next && next.key === s.key, past = s.end <= now, req = openByKey[s.key];
          return `<div class="pmine-row${past ? ' past' : ''}${isNext ? ' next' : ''}">
            <div class="pmine-main">${isNext ? '<span class="pnext-badge">המשמרת הבאה</span>' : ''}<b>${dayLabel(s.date)}</b><span>${pEsc(sh.label)} ${rangeHtml(sh.start, sh.end)}</span></div>
            ${past ? '' : req ? `<em class="pst pst-${req.status}">${SWAP_STATUS[req.status]}</em>` : `<button type="button" class="btn ghost small swap-btn" data-swap-open="${s.key}">בקשת החלפה</button>`}
          </div>`; }).join('') : '<div class="pnote">אין לך משמרות בחודש הזה.</div>'}</div>
      </div>
    </details>
    <details class="pfold" data-fold="team"${openFold('team') ? ' open' : ''}>
      <summary><span>הצוות כולו</span></summary>
      <div class="pfold-body">${boardHtml(ctx, m.assignments, { me:me.id, nextDate:next ? next.date : null })}</div>
    </details>`}`;
  wireMonthNav(body); wireFolds(body);
  body.querySelectorAll('[data-notice-ok]').forEach(b => b.addEventListener('click', () => { const n = st.notices.find(x => x.id === b.dataset.noticeOk); if(n) n.seen = true; portalSave(); renderInstructorSchedule(body); }));
  body.querySelectorAll('[data-swap-open]').forEach(b => b.addEventListener('click', async () => {
    const key = b.dataset.swapOpen;
    if(!(await confirmSheet({ title:'לבקש החלפה?', text:`המשמרת ${slotText(key)} תפורסם במסך ההחלפות, ועמיתים יוכלו להציע להחליף אותך.`, okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
    if(portalServerOn){
      try { await srvSwapAction('request_swap', { p_assignment:st.assignmentIds[key + '|' + me.id] }); toast('המשמרת פורסמה במסך ההחלפות'); } catch(e){ toast('לא הצלחנו לפרסם את הבקשה. נסו שוב.'); }
      renderInstructorSchedule(body); return;
    }
    st.swaps.unshift({ id:'s' + Date.now(), key, from:me.id, to:null, status:'open', at:new Date().toISOString() });
    portalSave(); toast('המשמרת פורסמה במסך ההחלפות'); renderInstructorSchedule(body);
  }));
}

// ---- preferences: every shift is "כן" until you mark otherwise; choose a level at the bottom, then tap days or shifts
const LEVEL_BUTTONS = [['yes', 'כן'], ['avoid', 'יכול'], ['no', 'לא'], ['absent', 'היעדרות']];
const SRV_LEVEL_BUTTONS = [['yes', 'כן'], ['avoid', 'יכול'], ['no', 'לא'], ['hours', 'שעות אחרות']];
const SRV_LONG = { id:'l', label:'סופ"ש ארוך', letter:'🕯️', sub:'שישי לפני כניסת שבת, לינה במרכז החירום, שבת בוקר עד צאת שבת' };            // the long weekend: ONE button across the Friday and the Saturday (under them), kept on the Friday; it has nothing to do with what is chosen for the Friday or Saturday shifts
const prefShiftsFor = date => portalLoad().shiftTypes;
const prefKeyOf = key => key;
// fixed preferences (the gear: "does not do mornings / afternoons / nights"; and the admin's "does not do nights"): those shifts start as "no".
// She can still change one of them by pressing that shift; pressing the whole day leaves them as they are.
const prefOther = () => portalServerOn && typeof srvEditingFor === 'function' && srvEditingFor() ? portalUi.viewAs : null;          // (the admin fills somebody's preferences: that person's fixed preferences and minimums)
const prefFixedKinds = () => { const o = prefOther(), st = portalLoad(), prof = o ? (st.priv || {})[o] : srv.profile; const k = new Set(portalServerOn ? (o ? (st.fixedNo || {})[o] || [] : srv.fixedNo || []) : []); if(portalServerOn && prof && prof.no_nights) k.add('n'); return k; };
const prefFixedNo = key => portalServerOn && prefFixedKinds().has(String(key).split('|')[1]);
const prefNoNight = prefFixedNo;
// the long weekend is one package (Guy, 2026-10-22): with "כן" or "יכול" on it, Friday afternoon and night and Saturday morning and afternoon are
// inside it and are not chosen one by one (the engine places them only as the whole weekend); Friday morning and Saturday night stay free
const LONG_INSIDE = { 5:['e', 'n'], 6:['m', 'e'] };
const prefLongFri = key => { const [d, s] = key.split('|'), w = dowOf(d); return (LONG_INSIDE[w] || []).includes(s) ? (w === 5 ? d : addDays(d, -1)) : null; };
const prefInsideLong = (prefs, key) => { const fri = portalServerOn && prefLongFri(key); return !!fri && ['yes', 'can', 'avoid'].includes(prefs.slots[`${fri}|l`]); };
const prefLevelOf = (prefs, key) => prefs.slots[key] || (portalServerOn ? (prefNoNight(key) ? 'no' : 'neutral') : 'yes');          // (on the server a shift nobody marked is "neutral": the person did not say)
const DEFAULT_SHIFT_LEGEND = types => types.map(s => (s.letter || s.label.charAt(0)) + ' = ' + s.label);
const FIXED_REASON = { vacation:'חופשה', sick:'מחלה', reserve:'מילואים', leave:'חופשה מיוחדת', other:'היעדרות', self:'היעדרות' };
// how the preferences start: whoever chose "all yes" / "all no" in the gear gets a month she opens for the first time (nothing marked yet) filled
// that way, as real marks (the fixed "no" ones stay "no"; days away stay away). Once per month on this device, so "נקה הכל" stays clean. (scheduling-v30.sql)
function prefStartFill(mk, id, prefs, days){
  const lv = srv.prefStart; if(lv !== 'yes' && lv !== 'no') return false;
  const key = `ramzor-prefstart-${id}-${mk}`; try { if(localStorage.getItem(key)) return false; } catch(e){}
  if(Object.keys(prefs.slots).length) return false;
  days.forEach(date => {
    if(prefs.absent.includes(date) || prefs.fixed.some(f => f.day === date)) return;
    prefShiftsFor(date).forEach(s => { const k = `${date}|${s.id}`; if(!prefNoNight(k)) prefs.slots[k] = lv; });
  });
  try { localStorage.setItem(key, '1'); } catch(e){}
  portalSave(); return true;
}
function renderInstructorPrefs(body){
  if(!body.isConnected) return;                                   // (a screen that finished loading after the person left it must not draw)
  const me = portalMe(), st = portalLoad();
  if(portalServerOn) portalUi.pmonth = prefsMonthNow(); else if(!portalUi.pmonth) portalUi.pmonth = addMonths(monthKeyOf(isoDate(new Date())), 1);          // (on the server: next month only)
  const mk = portalUi.pmonth, m = portalMonth(mk), prefs = portalServerOn ? srvPrefsOf(m, me.id) : portalPrefsOf(mk, me.id), submitted = !!m.submitted[me.id];
  const days = daysOfMonth(mk), lead = dowOf(days[0]);
  const locked = portalServerOn && !srvPrefsOpen(mk);                                  // the database refuses changes after the closing time, so the screen does not offer them
  if(portalServerOn && me.role === 'instructor' && !locked && !submitted && prefStartFill(mk, me.id, prefs, days))
    toast(srv.prefStart === 'yes' ? 'כל המשמרות סומנו "כן", לפי ההגדרות שלך. משנים רק את מה שצריך' : 'כל המשמרות סומנו "לא", לפי ההגדרות שלך. משנים רק את מה שצריך');
  const dl = m.deadline ? parseIso(m.deadline) : null;
  const fixedOn = date => portalServerOn ? prefs.fixed.find(f => f.day === date) : null;
  // the long weekend: one button under the Friday and the Saturday of a weekend (and, when the person switched it on in the settings, the small "only one of these" next to it)
  const barOn = portalServerOn && (srv.showLong || srv.pickOne);          // (the long weekend is shown only when the person asked for it in the settings; so is "only one of these")
  const longBar = fri => {
    if(!barOn) return '';
    const gone = !!fixedOn(fri) || prefs.absent.includes(fri), lv = gone ? 'no' : prefLevelOf(prefs, `${fri}|l`), picked = prefs.pick.includes(fri);
    // a slim bridge under the Friday and the Saturday: one line, coloured by the choice like every shift (what it is: in "איך ממלאים")
    return `<div class="plong-row">${srv.showLong ? `<button type="button" class="plong lv-${lv}" data-plong="${fri}" aria-label="${pEsc(SRV_LONG.label)} של ${dayLabel(fri)} והשבת שאחריו: ${pEsc(SRV_LONG.sub)}">${SRV_LONG.letter} ${pEsc(SRV_LONG.label)}</button>` : ''}${srv.pickOne ? `<button type="button" class="ppick${picked ? ' on' : ''}" data-ppick="${fri}" aria-pressed="${picked}" title="רק אחד מאלה">רק אחד</button>` : ''}</div>`;
  };
  let cells = '', neutral = 0;
  for(let i = 0; i < lead; i++) cells += '<div class="pday blank"></div>';
  days.forEach(date => {
    const fx = fixedOn(date), absent = !!fx || prefs.absent.includes(date), hrs = portalServerOn && prefs.hours[date];
    if(portalServerOn && !absent) neutral += prefShiftsFor(date).filter(s => !prefs.slots[`${date}|${s.id}`] && !prefNoNight(`${date}|${s.id}`) && !prefInsideLong(prefs, `${date}|${s.id}`)).length;
    cells += `<div class="pday${absent ? ' absent' : ''}${fx ? ' fixed' : ''}${hrs ? ' has-hours' : ''}${[5, 6].includes(dowOf(date)) ? ' weekend' : ''}${barOn && [5, 6].includes(dowOf(date)) && days.includes(dowOf(date) === 5 ? date : addDays(date, -1)) ? ' linked' : ''}"${fx ? ` title="${pEsc(FIXED_REASON[fx.reason] || 'היעדרות')}"` : ''}>
      <button type="button" class="pday-num" data-pday="${date}" aria-label="${dayLabel(date)}">${parseIso(date).getDate()}</button>
      ${fx ? `<span class="pday-fixed">${pEsc(FIXED_REASON[fx.reason] || 'היעדרות')}</span>` : ''}
      ${hrs ? `<span class="pday-hrs" title="שעות אחרות">${hrs.map(([a, b]) => a + '–' + b).join(', ')}</span>` : ''}
      <div class="pday-shifts">${prefShiftsFor(date).map(s => { const key = `${date}|${s.id}`, inLong = !absent && prefInsideLong(prefs, key), lv = absent ? 'no' : inLong ? prefs.slots[`${prefLongFri(key)}|l`] : prefLevelOf(prefs, key);
        return `<button type="button" class="pshift lv-${lv}${inLong ? ' in-long' : ''}" data-pslot="${key}" aria-label="${pEsc(s.label)}${inLong ? ' (בתוך הסופ&quot;ש הארוך)' : ''}">${inLong ? '🕯️' : pEsc(s.letter || s.label.charAt(0))}</button>`; }).join('')}</div>
    </div>`;
    if(portalServerOn && dowOf(date) === 6 && days.includes(addDays(date, -1))) cells += longBar(addDays(date, -1));
    else if(portalServerOn && dowOf(date) === 5 && date === days[days.length - 1]) cells += longBar(date);
  });
  const marked = Object.keys(prefs.slots).length + prefs.absent.length + (portalServerOn ? Object.keys(prefs.hours).length : 0);
  const fixedList = portalServerOn ? prefs.fixed.filter(f => daysOfMonth(mk).includes(f.day)) : [];
  const cons = prefs.consent || { extend:null, pull:null };
  const choice = (name, v) => `<div class="pchoice" role="group"><button type="button" class="${cons[name] === true ? 'on' : ''}" data-consent="${name}:1"${locked ? ' disabled' : ''}>כן</button><button type="button" class="${cons[name] === false ? 'on' : ''}" data-consent="${name}:0"${locked ? ' disabled' : ''}>לא</button></div>`;
  const levels = portalServerOn ? SRV_LEVEL_BUTTONS : LEVEL_BUTTONS;
  const goal = portalServerOn ? ((m.goals || {})[me.id] || null) : null, minInfo = portalServerOn ? fbMinimum(prefOther() ? (portalLoad().priv || {})[prefOther()] || {} : srv.profile, mk) : null;
  let availHint = '';
  if(portalServerOn && minInfo && minInfo.total){                  // a gentle word when the marks leave little room for the minimum
    const free = days.filter(d => !fixedOn(d) && !prefs.absent.includes(d)).reduce((n, d) => n + ['m', 'e', 'n'].filter(id => ['yes', 'avoid'].includes(prefs.slots[`${d}|${id}`])).length, 0);          // (only "yes" and "can": a shift that was not marked is used only when there is no other way)
    if(free < minInfo.total * 2) availHint = `<div class="pnote pnote-soft">${tx('hint_low', free, minInfo.total)}</div>`;
  }
  const neutralHint = portalServerOn && !locked && neutral > 0 ? `<div class="pnote pnote-soft" id="neutral-note">${tx('neutral_note', neutral)}</div>` : '';
  const goalBtn = (v, label, sub) => `<button type="button" class="pgoal-opt${(goal || '') === (v || '') ? ' on' : ''}" data-goal="${v || ''}"${locked ? ' disabled' : ''}><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
  body.innerHTML = `
    ${portalServerOn ? monthFixedHtml(mk) : monthNavHtml(mk)}
    <div class="pstatus ${submitted ? 'ok' : 'bad'}">${submitted ? tx('st_sub') : tx('st_unsub')}${dl ? ` · אפשר להגיש עד ${dl.getDate()}/${dl.getMonth() + 1}${m.deadlineTime ? ' בשעה ' + m.deadlineTime : ''}` : ''}${portalServerOn && !locked ? ' · <span id="srv-save-state">נשמר ✓</span>' : ''}</div>
    ${locked ? `<div class="pnote">${tx('locked')}</div>` : ''}
    ${fixedList.length ? `<div class="pnote">הימים שאושרו לך או שהרכזת סימנה: ${fixedList.map(f => dayLabel(f.day) + ' (' + (FIXED_REASON[f.reason] || 'היעדרות') + ')').join(', ')}.</div>` : ''}
    <details class="pfold" data-fold="prefhelp"${openFold('prefhelp') ? ' open' : ''}><summary><span>איך ממלאים? (לחצו להסבר)</span></summary><div class="pfold-body"><div class="pnote">${portalServerOn ? 'בהתחלה אף משמרת לא מסומנת. נשמח שתעברו על כל החודש: בחרו למטה רמה, ואז לחצו על יום (לכל המשמרות שלו) או על משמרת בודדת. "כן" אומר שתשמחו לקבל אותה, "יכול" אומר שאפשר, אבל פחות נוח, ו"לא" אומר שלא מתאים. לחיצה נוספת על אותו סימון מחזירה את המשמרת למצב שלא סומן. משמרת שלא תסמנו נשבץ רק אם לא תהיה שום ברירה אחרת, אז כדאי לסמן "כן" או "יכול" בכל מה שמתאים לכם.' : 'כל המשמרות מסומנות "כן", כלומר שאתם זמינים. נשמח לדעת אם יש משמרות שפחות מתאימות לכם: בחרו למטה רמה, ואז לחצו על יום (לכל המשמרות שלו) או על משמרת בודדת. "יכול" אומר שאפשר, אבל פחות נוח, ו"לא" אומר שלא מתאים.'} ${[...DEFAULT_SHIFT_LEGEND(st.shiftTypes)].join(' · ')}${portalServerOn ? ` · 🕯️ = סופ"ש ארוך (${SRV_LONG.sub}). הוא כפתור אחד לכל סופ"ש, מתחת לשישי ולשבת, ולא תלוי בסימונים של שישי או של שבת. אם לא סימנתם אותו, לא נשבץ אתכם אליו. אם אתם זמינים רק בחלק מהשעות, בחרו "שעות אחרות" ולחצו על היום.` : ''}</div></div></details>
    ${availHint}${neutralHint}${portalServerOn && prefFixedKinds().size && !locked ? `<div class="pnote pnote-soft" id="nonight-note">${prefFixedNote()}</div>` : ''}
    <div class="pcal">${DOW_SHORT.map(d => `<div class="pcal-head">${d}</div>`).join('')}${cells}</div>
    ${portalServerOn ? `
    <div class="pgoal">
      <h2 class="psec">כמה משמרות ירגישו לך נכון החודש?</h2>
      <div class="pnote">לא חובה בכלל. נשתדל להתחשב בזה ככל האפשר, בכפוף לצרכי הצוות ולכללי הבטיחות והמנוחה.</div>
      <div class="pgoal-list" role="group" aria-label="יעד חודשי">
        ${goalBtn('min', 'אני רוצה לעשות החודש את המינימום הנדרש', minInfo && minInfo.text ? 'המינימום שלך: ' + pEsc(minInfo.text) : '')}
        ${goalBtn('weekly45', 'אני רוצה לעשות 4-5 משמרות בכל שבוע', '')}
        ${goalBtn('max', 'אני רוצה לעבוד כמה שיותר החודש', 'מתוך המשמרות שסימנת "כן" או "יכול"')}
        ${goalBtn('', 'אין לי העדפה מיוחדת', '')}
      </div>
      ${goal !== null || !locked ? '<div class="pnote">הבחירה נשמרת כשמגישים את ההעדפות.</div>' : ''}
    </div>
    <div class="pconsents${cons.extend === null || cons.pull === null ? ' unanswered' : ''}">
      <h2 class="psec">עוד שתי שאלות קטנות לחודש הזה</h2>
      <div class="pconsent"><span>אם נצטרך, האם יהיה לך נוח להישאר עד 16:00 במשמרת בוקר?</span>${choice('extend')}<small>עד 4 הארכות בחודש</small></div>
      <div class="pconsent"><span>אם נצטרך, האם יהיה לך נוח להמשיך משבת בלילה עד יום ראשון ב-11:00?</span>${choice('pull')}</div>
    </div>
    <label class="pfield">יש משהו שחשוב לך שנדע? (לא חובה)<textarea id="prefs-note" rows="2" maxlength="400"${locked ? ' disabled' : ''}>${pEsc(m.notes && m.notes[me.id] || '')}</textarea></label>` : ''}
    <div class="pprefs-actions"><button type="button" class="btn" id="prefs-submit">${submitted ? 'עדכון והגשה מחדש' : 'הגשת ההעדפות'}</button><span class="pnote">${portalServerOn ? (neutral > 0 ? 'עוד ' + neutral + ' משמרות לסימון' : 'כל המשמרות מסומנות') : (marked ? marked + ' סימונים שאינם "כן"' : 'הכל "כן"')}</span></div>
    <div class="plevelbar" role="group" aria-label="בחירת רמה">${levels.map(b => `<button type="button" class="lvbtn lv-${b[0]}${portalUi.level === b[0] ? ' active' : ''}" data-plevel="${b[0]}">${b[1]}</button>`).join('')}<button type="button" class="lvbtn lv-clear" id="prefs-clear-all">נקה הכל</button></div>`;
  wireMonthNav(body, 'pmonth'); wireFolds(body);
  body.querySelectorAll('[data-plevel]').forEach(b => b.addEventListener('click', () => { portalUi.level = b.dataset.plevel; renderInstructorPrefs(body); }));
  body.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => {
    if(locked) return;
    const v = b.dataset.goal || null; if(v) m.goals[me.id] = v; else delete m.goals[me.id]; renderInstructorPrefs(body);
  }));
  body.querySelectorAll('[data-consent]').forEach(b => b.addEventListener('click', () => {
    if(locked) return;
    const [name, v] = b.dataset.consent.split(':'); prefs.consent[name] = v === '1'; portalSave(); renderInstructorPrefs(body);
  }));
  body.querySelectorAll('[data-pslot]').forEach(b => b.addEventListener('click', () => {
    if(locked) return;
    const shown = b.dataset.pslot.split('|')[0], key = prefKeyOf(b.dataset.pslot), date = key.split('|')[0], lv = portalUi.level;
    if(fixedOn(date) || fixedOn(shown)) return;
    if(prefInsideLong(prefs, key) && lv !== 'absent'){ toast(tx('long_inside')); return; }
    if(lv === 'hours'){ openHoursSheet(shown, prefs, () => renderInstructorPrefs(body)); return; }
    if(lv === 'absent'){ toggleAbsent(prefs, date); }
    else if(lv === 'yes' && !portalServerOn){ delete prefs.slots[key]; }                      // (the demo: "כן" is the default, so nothing needs to be stored; on the server "כן" is a mark like the others)
    else if(prefs.slots[key] === lv){ delete prefs.slots[key]; } else { prefs.slots[key] = lv; }
    portalSave(); renderInstructorPrefs(body);
  }));
  body.querySelectorAll('[data-plong]').forEach(b => b.addEventListener('click', () => {          // the long weekend: kept on the Friday, independent of the other shifts
    if(locked) return;
    const fri = b.dataset.plong, key = `${fri}|l`, lv = portalUi.level;
    if(fixedOn(fri) || prefs.absent.includes(fri)) return;
    if(lv === 'hours' || lv === 'absent'){ toast(tx('long_levels')); return; }
    if(prefs.slots[key] === lv) delete prefs.slots[key]; else prefs.slots[key] = lv;
    if(['yes', 'can', 'avoid'].includes(prefs.slots[key])){          // (the shifts inside the long weekend: their own marks give way to it)
      const sat = addDays(fri, 1), inside = [`${fri}|e`, `${fri}|n`, `${sat}|m`, `${sat}|e`].filter(k => prefs.slots[k]);
      inside.forEach(k => delete prefs.slots[k]); if(inside.length) toast(tx('long_replaced'));
    }
    portalSave(); renderInstructorPrefs(body);
  }));
  body.querySelectorAll('[data-ppick]').forEach(b => b.addEventListener('click', () => {          // "only one of these weekends": the Fridays that belong to the group
    if(locked) return;
    const fri = b.dataset.ppick; prefs.pick = prefs.pick.includes(fri) ? prefs.pick.filter(f => f !== fri) : prefs.pick.concat(fri);
    portalSave(); renderInstructorPrefs(body);
  }));
  body.querySelectorAll('[data-pday]').forEach(b => b.addEventListener('click', () => {
    if(locked) return;
    const date = b.dataset.pday, lv = portalUi.level, keys = prefShiftsFor(date).map(s => prefKeyOf(`${date}|${s.id}`)).filter(k => !prefFixedNo(k) && !prefInsideLong(prefs, k));          // (a shift of a fixed preference changes only when it is pressed by itself)
    if(fixedOn(date)) return;
    if(lv === 'hours'){ openHoursSheet(date, prefs, () => renderInstructorPrefs(body)); return; }
    if(lv === 'absent'){ toggleAbsent(prefs, date); }
    else if(lv === 'yes' && !portalServerOn){ keys.forEach(k => delete prefs.slots[k]); prefs.absent = prefs.absent.filter(d => d !== date); }
    else if(keys.every(k => prefs.slots[k] === lv)){ keys.forEach(k => delete prefs.slots[k]); } else { keys.forEach(k => { prefs.slots[k] = lv; }); }
    portalSave(); renderInstructorPrefs(body);
  }));
  document.getElementById('prefs-clear-all').addEventListener('click', async () => {
    if(locked) return;
    if(!(await confirmSheet({ title:'לנקות את כל ההעדפות?', text:tx('clear_text', portalServerOn ? ' ושעות אחרות' : ', היעדרויות'), okLabel:'כן, לנקות הכל', cancelLabel:'חזרה', danger:true }))) return;
    prefs.slots = {}; prefs.absent = []; if(portalServerOn){ prefs.hours = {}; prefs.pick = []; } portalSave(); toast(tx('clear_done')); renderInstructorPrefs(body);
  });
  document.getElementById('prefs-submit').addEventListener('click', async () => {
    if(locked) return;
    if(portalServerOn){
      if(cons.extend === null || cons.pull === null){ toast(tx('consent_needed')); const box = body.querySelector('.pconsents'); if(box) box.scrollIntoView({ block:'center' }); return; }
      try { await srvSubmit(mk, (document.getElementById('prefs-note').value || '').trim(), m.goals[me.id] || null); } catch(e){ toast(tx('submit_fail')); return; }
      if(neutral > 0) toast(tx('submit_neutral', neutral), 8000); else toast(tx('submit_ok'));          // (the "not complete yet" message stays long enough to be read)
      renderInstructorPrefs(body); return;
    }
    m.submitted[me.id] = true; portalSave(); toast(tx('submit_ok')); renderInstructorPrefs(body);
  });
}
// custom hours for one day: up to two ranges (whole hours); used only when they complete a full shift
function openHoursSheet(date, prefs, done){
  const cur = (prefs.hours[date] || []).slice(0, 2);
  const opts = (from, to, sel) => { let o = '<option value="">—</option>'; for(let h = from; h <= to; h++) o += `<option value="${h}"${sel === h ? ' selected' : ''}>${String(h % 24).padStart(2, '0')}:00</option>`; return o; };
  const row = i => `<div class="phours-row"><select data-hfrom="${i}" aria-label="משעה">${opts(6, 23, cur[i] && cur[i][0])}</select><span>עד</span><select data-hto="${i}" aria-label="עד שעה">${opts(7, 24, cur[i] && cur[i][1])}</select></div>`;
  const sh = portalSheet(`<h2>שעות אחרות ב${dayLabel(date)}</h2><div class="pnote">אפשר לציין עד שני טווחים שבהם אתם זמינים. המערכת תשתמש בהם רק כשהם משלימים משמרת שלמה.</div>${row(0)}${row(1)}<div id="hours-err" class="pwarn" aria-live="polite"></div>
    <div class="confirm-actions"><button type="button" class="btn ghost" id="hours-clear">מחיקה</button><button type="button" class="btn" id="hours-save">שמירה</button></div>`);
  sh.querySelector('#hours-clear').addEventListener('click', () => { delete prefs.hours[date]; portalSave(); sh.close(); done(); });
  sh.querySelector('#hours-save').addEventListener('click', () => {
    const rs = [0, 1].map(i => [sh.querySelector(`[data-hfrom="${i}"]`).value, sh.querySelector(`[data-hto="${i}"]`).value]).filter(r => r[0] !== '' || r[1] !== '');
    const bad = rs.some(r => r[0] === '' || r[1] === '' || Number(r[0]) >= Number(r[1])) || (rs.length === 2 && Number(rs[0][0]) < Number(rs[1][1]) && Number(rs[1][0]) < Number(rs[0][1]));
    if(bad){ sh.querySelector('#hours-err').textContent = 'בדקו שהשעות נכונות: "מ" לפני "עד", והטווחים לא חופפים.'; return; }
    if(rs.length) prefs.hours[date] = rs.map(r => [Number(r[0]), Number(r[1])]).sort((a, b) => a[0] - b[0]); else delete prefs.hours[date];
    portalSave(); sh.close(); done();
  });
}function toggleAbsent(prefs, date){ prefs.absent = prefs.absent.includes(date) ? prefs.absent.filter(d => d !== date) : prefs.absent.concat(date); }

// ---- swaps: an instructor publishes a shift (from the schedule tab); anyone who can take it presses "אני יכול/ה להחליף";
// the request then goes to the coordinator, whose answer changes the schedule and is sent to both people
const SWAP_STATUS = { open:'מחפשים מחליף/ה', offered:'נמצא מחליף/ה, מחכים לאישור הרכזת', approved:'אושרה', rejected:'הפעם לא אושרה', cancelled:'בוטלה' };
function canTakeShift(pid, key){
  const { date } = splitKey(key), mk = monthKeyOf(date), m = portalMonth(mk), ctx = portalCtx(mk);
  const slot = buildSlots(mk, ctx.shiftTypes).find(s => s.key === key);
  if(!slot || slot.end <= Date.now()) return false;
  if(Object.keys(m.assignments).some(k => k.startsWith(date + '|') && (m.assignments[k] || []).includes(pid))) return false;      // already working that day
  return portalServerOn || levelOf(ctx.prefs, pid, slot) !== 'no';          // (on the real system any instructor may offer to take a shift)
}
function renderInstructorSwaps(body){
  if(!body.isConnected) return;                                   // (a screen that finished loading after the person left it must not draw)
  const me = portalMe(), st = portalLoad();
  const name = id => { const p = portalPerson(id); return p ? instrName(p, st.instructors) : '?'; };
  const approvalsForMe = [];
  Object.keys(st.months).forEach(mk => Object.keys(st.months[mk].approvals || {}).forEach(k => { const key = k.slice(0, k.lastIndexOf('|')), iid = k.slice(k.lastIndexOf('|') + 1); if(iid === me.id && st.months[mk].approvals[k] === 'pending') approvalsForMe.push({ mk, k, key }); }));
  const roleOf = id => (portalPerson(id) || {}).role, svc = me.role === 'service';
  const open = st.swaps.filter(s => s.status === 'open' && (!portalServerOn || roleOf(s.from) === me.role)).sort((a, b) => a.key.localeCompare(b.key));          // (service girls among themselves, instructors among themselves)
  const mineReq = st.swaps.filter(s => s.from === me.id || s.to === me.id).slice(0, 10);
  body.innerHTML = `
    ${approvalsForMe.length ? '<h2 class="psec">בקשות אליי</h2>' : ''}
    ${approvalsForMe.map(a => `<div class="preq warn"><div>הרכזת שיבצה אותך למשמרת שסימנת עליה "לא":<br><b>${slotLabel(a.key)}</b><br>האם את/ה מאשר/ת?</div><div class="preq-actions"><button type="button" class="btn" data-appr-ok="${a.mk}|${a.k}">מאשר/ת</button><button type="button" class="btn ghost" data-appr-no="${a.mk}|${a.k}">לא מאשר/ת</button></div></div>`).join('')}
    <details class="pfold" data-fold="swmine"${openFold('swmine') ? ' open' : ''}>
      <summary><span>הבקשות שלי</span><span class="pcount">${mineReq.length}</span></summary>
      <div class="pfold-body">${mineReq.length ? mineReq.map(s => `<div class="pmine-row"><span>${slotLabel(s.key)}<br><small>${s.from === me.id ? 'ביקשתם החלפה' + (s.to ? ' · מוכן/ה לעזור: ' + pEsc(name(s.to)) : '') : 'הצעתם להחליף את ' + pEsc(name(s.from))}</small></span><span class="pmine-actions">${portalServerOn && s.from === me.id && s.status === 'open' ? `<button type="button" class="btn ghost small" data-cands="${s.aid}">מי זמין/ה?</button>` : ''}<em class="pst pst-${s.status}">${SWAP_STATUS[s.status]}</em></span></div>`).join('') : '<div class="pnote">אין בקשות.</div>'}</div>
    </details>
    <details class="pfold" data-fold="swopen"${openFold('swopen') ? ' open' : ''}>
      <summary><span>בקשות החלפה פתוחות</span><span class="pcount">${open.length}</span></summary>
      <div class="pfold-body"><div class="pnote">${tx('swaps_intro')}</div>
      ${open.length ? open.map(s => {
        const own = s.from === me.id, can = !own && (svc ? !st.rows.some(r => r.staff === me.id && r.day === s.key.split('|')[0]) : canTakeShift(me.id, s.key));          // (a service girl: free that day)
        return `<div class="preq swap"><div>${s.urgent ? '<span class="pchip missing">⚠ דחוף: דווח שלא יכול/ה להגיע</span> ' : ''}<b>${pEsc(name(s.from))}</b> מחפש/ת מחליף/ה<br>${slotLabel(s.key)}</div><div class="preq-actions">${own ? `<button type="button" class="btn ghost" data-swap-cancel="${s.id}">ביטול הבקשה שלי</button>` : can ? `<button type="button" class="btn" data-swap-take="${s.id}">אני יכול/ה להחליף</button>` : '<em class="pst">אי אפשר לשבץ אותך כרגע</em>'}</div></div>`;
      }).join('') : `<div class="pnote">${tx('swaps_none')}</div>`}</div>
    </details>`;
  wireFolds(body);
  body.querySelectorAll('[data-swap-take]').forEach(b => b.addEventListener('click', async () => {
    const sw = st.swaps.find(x => x.id === b.dataset.swapTake); if(!sw || sw.status !== 'open') return;
    if(portalServerOn){
      try { await srvSwapAction('offer_swap', { p_swap:sw.id }); toast(tx('take_ok')); } catch(e){ toast(tx('take_fail')); }
      renderInstructorSwaps(body); return;
    }
    sw.to = me.id; sw.status = 'offered';
    queueEmail('c1', 'בקשת החלפה ממתינה לאישורך', `${name(sw.from)} מבקש/ת החלפה במשמרת ${slotText(sw.key)}. ${name(me.id)} מוכן/ה להחליף.`);
    addNotice(sw.from, `${name(me.id)} הציע/ה להחליף אותך ב-${slotText(sw.key)}. הבקשה הועברה לרכזת.`, 'info');
    addNotice(me.id, `הבקשה להחליף את ${name(sw.from)} ב-${slotText(sw.key)} הועברה לרכזת.`, 'info');
    portalSave(); toast('הבקשה הועברה לרכזת'); renderInstructorSwaps(body);
  }));
  body.querySelectorAll('[data-cands]').forEach(b => b.addEventListener('click', async () => {
    const names = await srvSwapCandidates(b.dataset.cands);
    portalSheet(`<h2>עמיתים שזמינים למשמרת</h2><div class="pnote">${names.length ? 'אלה העמיתים שזמינים למשמרת הזאת ולא שובצו אליה. אפשר לפנות אליהם ישירות ולבקש עזרה: ' + names.map(pEsc).join(', ') + '.' : 'כרגע לא מצאנו עמיתים פנויים למשמרת הזאת. נשמח לעזור, ואפשר גם לדבר עם הרכזת.'}</div><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>תודה</button></div>`);
  }));
  body.querySelectorAll('[data-swap-cancel]').forEach(b => b.addEventListener('click', async () => {
    if(portalServerOn){ try { await srvSwapAction('cancel_swap', { p_swap:b.dataset.swapCancel }); toast(tx('cancel_ok')); } catch(e){ toast(tx('cancel_fail')); } renderInstructorSwaps(body); return; }
    const sw = st.swaps.find(x => x.id === b.dataset.swapCancel); if(sw){ sw.status = 'cancelled'; portalSave(); toast('הבקשה בוטלה'); renderInstructorSwaps(body); } }));
  body.querySelectorAll('[data-appr-ok], [data-appr-no]').forEach(b => b.addEventListener('click', () => {
    const [mk, k] = (b.dataset.apprOk || b.dataset.apprNo).split(/\|(.+)/).filter(Boolean), m = portalMonth(mk), key = k.slice(0, k.lastIndexOf('|'));
    if(b.dataset.apprOk){ m.approvals[k] = 'ok'; toast('האישור נשלח לרכזת'); }
    else { delete m.approvals[k]; m.assignments[key] = (m.assignments[key] || []).filter(id => id !== me.id); queueEmail('c1', 'מדריך לא אישר שיבוץ', `${name(me.id)} לא אישר/ה את ${slotText(key)}. המשמרת חסרה כעת.`); toast('השיבוץ בוטל, הרכזת תעודכן'); }
    portalSave(); renderInstructorSwaps(body);
  }));
}

// ---- messages: personal notices (changes to my shifts), announcements from the coordinator, and the e-mails (preview)
function renderInstructorInbox(body){
  const me = portalMe(), st = portalLoad();
  const mine = st.notices.filter(n => n.to === me.id).slice(0, 15), mails = st.outbox.filter(e => e.to === me.id || e.to === 'all').slice(0, 12);
  body.innerHTML = `
    <h2 class="psec">עדכונים אישיים</h2>
    ${mine.length ? mine.map(n => `<div class="pannounce ${n.kind}"><small>${new Date(n.at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })}${n.seen ? '' : ' · חדש'}</small><div>${pEsc(n.text)}</div></div>`).join('') : '<div class="pnote">אין עדכונים.</div>'}
    <h2 class="psec">הודעות מהרכזת</h2>
    ${st.announcements.length ? st.announcements.map(a => `<div class="pannounce"><small>${a.date} · ${pEsc(a.from)}</small><div>${pEsc(a.text)}</div></div>`).join('') : '<div class="pnote">אין הודעות.</div>'}
    <h2 class="psec">אימיילים (תצוגה מקדימה)</h2>
    <div class="pnote">בגרסה המחוברת לשרת ההודעות האלה יישלחו במייל אמיתי. כאן רואים איך הן ייראו.</div>
    ${mails.length ? mails.map(e => `<button type="button" class="pmail" data-mail="${e.id}"><b>${pEsc(e.subject)}</b><small>${new Date(e.at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })}</small></button>`).join('') : '<div class="pnote">עוד לא נשלחו אליך הודעות.</div>'}`;
  body.querySelectorAll('[data-mail]').forEach(b => b.addEventListener('click', () => showMailPreview(st.outbox.find(e => e.id === b.dataset.mail))));
}
function showMailPreview(e){
  if(!e) return;
  const st = portalLoad(), to = e.to === 'all' ? 'כל המדריכים' : (portalPerson(e.to) ? instrName(portalPerson(e.to), st.instructors) : e.to);
  portalSheet(`<h2>תצוגה מקדימה של אימייל</h2><div class="pmail-view"><div><small>אל:</small> ${pEsc(to)}</div><div><small>נושא:</small> <b>${pEsc(e.subject)}</b></div><p>${pEsc(e.body).replace(/\n/g, '<br>')}</p><p class="pnote">קישור לפורטל: (יפעל כשהמערכת תחובר לשרת)</p></div><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>סגירה</button></div>`);
}

// the sentence over the calendar: which kinds start as "no", and how to change one
function prefFixedNote(){
  const k = prefFixedKinds(), words = [['m', 'הבקרים'], ['e', 'הצהריים'], ['n', 'הלילות']].filter(x => k.has(x[0])).map(x => x[1]);
  const list = words.length === 1 ? words[0] : words.slice(0, -1).join(', ') + ' ו' + words[words.length - 1];
  return `${list} מסומנים אצלך "לא", לפי ההעדפות הקבועות שלך. כדי לשנות משמרת מסוימת, לוחצים על המשמרת עצמה (לחיצה על היום כולו לא משנה אותה).`;
}
