
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
const SRV_LEVEL_BUTTONS = [['yes', 'כן'], ['avoid', 'יכול'], ['no', 'לא'], ['absent', 'היעדרות'], ['hours', 'שעות אחרות']];
const SRV_LONG = { id:'l', label:'סופ"ש ארוך', letter:'ס' };               // the long weekend: one more button on Fridays
const prefShiftsFor = date => portalServerOn && dowOf(date) === 5 ? portalLoad().shiftTypes.concat([SRV_LONG]) : portalLoad().shiftTypes;
const FIXED_REASON = { vacation:'חופשה', sick:'מחלה', reserve:'מילואים', leave:'חופשה מיוחדת', other:'היעדרות', self:'היעדרות' };
function renderInstructorPrefs(body){
  const me = portalMe(), st = portalLoad();
  if(!portalUi.pmonth) portalUi.pmonth = addMonths(monthKeyOf(isoDate(new Date())), 1);
  const mk = portalUi.pmonth, m = portalMonth(mk), prefs = portalServerOn ? srvPrefsOf(m, me.id) : portalPrefsOf(mk, me.id), submitted = !!m.submitted[me.id];
  const days = daysOfMonth(mk), lead = dowOf(days[0]);
  const locked = portalServerOn && !srvPrefsOpen(mk);                                  // the database refuses changes after the closing time, so the screen does not offer them
  const marked = Object.keys(prefs.slots).length + prefs.absent.length + (portalServerOn ? Object.keys(prefs.hours).length : 0);
  const dl = m.deadline ? parseIso(m.deadline) : null;
  const fixedOn = date => portalServerOn ? prefs.fixed.find(f => f.day === date) : null;
  let cells = '';
  for(let i = 0; i < lead; i++) cells += '<div class="pday blank"></div>';
  days.forEach(date => {
    const fx = fixedOn(date), absent = !!fx || prefs.absent.includes(date), hrs = portalServerOn && prefs.hours[date];
    cells += `<div class="pday${absent ? ' absent' : ''}${fx ? ' fixed' : ''}${hrs ? ' has-hours' : ''}${[5, 6].includes(dowOf(date)) ? ' weekend' : ''}"${fx ? ` title="${pEsc(FIXED_REASON[fx.reason] || 'היעדרות')}"` : ''}>
      <button type="button" class="pday-num" data-pday="${date}" aria-label="${dayLabel(date)}">${parseIso(date).getDate()}</button>
      ${hrs ? `<span class="pday-hrs" title="שעות אחרות">${hrs.map(([a, b]) => a + '–' + b).join(', ')}</span>` : ''}
      <div class="pday-shifts">${prefShiftsFor(date).map(s => { const lv = absent ? 'no' : (prefs.slots[`${date}|${s.id}`] || 'yes'); return `<button type="button" class="pshift lv-${lv}" data-pslot="${date}|${s.id}" aria-label="${pEsc(s.label)}">${pEsc(s.letter || s.label.charAt(0))}</button>`; }).join('')}</div>
    </div>`;
  });
  const fixedList = portalServerOn ? prefs.fixed.filter(f => daysOfMonth(mk).includes(f.day)) : [];
  const cons = prefs.consent || { extend:null, pull:null };
  const choice = (name, v) => `<div class="pchoice" role="group"><button type="button" class="${cons[name] === true ? 'on' : ''}" data-consent="${name}:1"${locked ? ' disabled' : ''}>כן</button><button type="button" class="${cons[name] === false ? 'on' : ''}" data-consent="${name}:0"${locked ? ' disabled' : ''}>לא</button></div>`;
  const levels = portalServerOn ? SRV_LEVEL_BUTTONS : LEVEL_BUTTONS;
  body.innerHTML = `
    ${monthNavHtml(mk)}
    <div class="pstatus ${submitted ? 'ok' : 'bad'}">${submitted ? 'ההעדפות הוגשו ✓ (אפשר לעדכן עד סגירת ההגשה)' : 'ההעדפות טרם הוגשו. ההגשה חובה.'}${dl ? ` · נסגר ב-${dl.getDate()}/${dl.getMonth() + 1}${m.deadlineTime ? ' בשעה ' + m.deadlineTime : ''}` : ''}${portalServerOn && !locked ? ' · <span id="srv-save-state">נשמר ✓</span>' : ''}</div>
    ${locked ? '<div class="pnote">ההגשה לחודש הזה סגורה כרגע (היא נפתחת ב-1 בחודש הקודם ונסגרת ב-24 בו בשעה 22:30). לשינוי פנו לרכזת.</div>' : ''}
    ${fixedList.length ? `<div class="pnote">ימים שהרכזת סימנה או שאושרו לך: ${fixedList.map(f => dayLabel(f.day) + ' (' + (FIXED_REASON[f.reason] || 'היעדרות') + ')').join(', ')}.</div>` : ''}
    <div class="pnote">כל המשמרות מסומנות "כן" כברירת מחדל. סמנו רק מה שאתם לא רוצים: בחרו רמה למטה, ואז לחצו על יום (כל המשמרות שלו) או על משמרת בודדת. ${prefShiftsFor(days[0]).map(s => (s.letter || s.label.charAt(0)) + ' = ' + s.label).join(' · ')}${portalServerOn ? ' · ס = סופ"ש ארוך (שישי 17:00 עד מוצאי שבת), מסומן ביום שישי. "שעות אחרות": בחרו את הרמה, ואז לחצו על יום, כדי לציין שאתם זמינים רק בחלק מהשעות.' : ''}</div>
    <div class="pcal">${DOW_SHORT.map(d => `<div class="pcal-head">${d}</div>`).join('')}${cells}</div>
    ${portalServerOn ? `
    <div class="pconsents${cons.extend === null || cons.pull === null ? ' unanswered' : ''}">
      <h2 class="psec">ההסכמות שלי לחודש הזה</h2>
      <div class="pconsent"><span>מוכן/ה להישאר עד 16:00 במשמרת בוקר, כשצריך?</span>${choice('extend')}<small>עד 4 הארכות בחודש</small></div>
      <div class="pconsent"><span>מוכן/ה להמשיך משבת בלילה עד יום ראשון ב-11:00, כשצריך?</span>${choice('pull')}</div>
    </div>
    <label class="pfield">הערה לרכזת (לא חובה)<textarea id="prefs-note" rows="2" maxlength="400"${locked ? ' disabled' : ''}>${pEsc(m.notes && m.notes[me.id] || '')}</textarea></label>` : ''}
    <div class="pprefs-actions"><button type="button" class="btn" id="prefs-submit">${submitted ? 'עדכון והגשה מחדש' : 'הגשת העדפות'}</button><span class="pnote">${marked ? marked + ' סימונים שאינם "כן"' : 'הכל "כן"'}</span></div>
    <div class="plevelbar" role="group" aria-label="בחירת רמה">${levels.map(b => `<button type="button" class="lvbtn lv-${b[0]}${portalUi.level === b[0] ? ' active' : ''}" data-plevel="${b[0]}">${b[1]}</button>`).join('')}<button type="button" class="lvbtn lv-clear" id="prefs-clear-all">${portalServerOn ? 'זמין לכל החודש' : 'נקה הכל'}</button></div>`;
  wireMonthNav(body, 'pmonth');
  body.querySelectorAll('[data-plevel]').forEach(b => b.addEventListener('click', () => { portalUi.level = b.dataset.plevel; renderInstructorPrefs(body); }));
  body.querySelectorAll('[data-consent]').forEach(b => b.addEventListener('click', () => {
    if(locked) return;
    const [name, v] = b.dataset.consent.split(':'); prefs.consent[name] = v === '1'; portalSave(); renderInstructorPrefs(body);
  }));
  body.querySelectorAll('[data-pslot]').forEach(b => b.addEventListener('click', () => {
    if(locked) return;
    const key = b.dataset.pslot, date = key.split('|')[0], lv = portalUi.level;
    if(fixedOn(date)) return;
    if(lv === 'hours'){ openHoursSheet(date, prefs, () => renderInstructorPrefs(body)); return; }
    if(lv === 'absent'){ toggleAbsent(prefs, date); }
    else if(lv === 'yes'){ delete prefs.slots[key]; }                      // "כן" is the default, so nothing needs to be stored
    else if(prefs.slots[key] === lv){ delete prefs.slots[key]; } else { prefs.slots[key] = lv; }
    portalSave(); renderInstructorPrefs(body);
  }));
  body.querySelectorAll('[data-pday]').forEach(b => b.addEventListener('click', () => {
    if(locked) return;
    const date = b.dataset.pday, lv = portalUi.level, keys = prefShiftsFor(date).map(s => `${date}|${s.id}`);
    if(fixedOn(date)) return;
    if(lv === 'hours'){ openHoursSheet(date, prefs, () => renderInstructorPrefs(body)); return; }
    if(lv === 'absent'){ toggleAbsent(prefs, date); }
    else if(lv === 'yes'){ keys.forEach(k => delete prefs.slots[k]); prefs.absent = prefs.absent.filter(d => d !== date); if(portalServerOn) delete prefs.hours[date]; }
    else if(keys.every(k => prefs.slots[k] === lv)){ keys.forEach(k => delete prefs.slots[k]); } else { keys.forEach(k => { prefs.slots[k] = lv; }); }
    portalSave(); renderInstructorPrefs(body);
  }));
  document.getElementById('prefs-clear-all').addEventListener('click', async () => {
    if(locked) return;
    if(!(await confirmSheet({ title:portalServerOn ? 'לסמן זמינות לכל החודש?' : 'לנקות את כל ההעדפות?', text:'כל הסימונים של החודש הזה יחזרו ל"כן" (ברירת המחדל), כולל היעדרויות' + (portalServerOn ? ' ושעות אחרות' : '') + '. אי אפשר לבטל.', okLabel:portalServerOn ? 'כן, זמין/ה לכל החודש' : 'כן, לנקות הכל', cancelLabel:'חזרה', danger:true }))) return;
    prefs.slots = {}; prefs.absent = []; if(portalServerOn) prefs.hours = {}; portalSave(); toast(portalServerOn ? 'סומנת כזמין/ה לכל החודש' : 'כל ההעדפות נוקו'); renderInstructorPrefs(body);
  });
  document.getElementById('prefs-submit').addEventListener('click', async () => {
    if(locked) return;
    if(portalServerOn){
      if(cons.extend === null || cons.pull === null){ toast('צריך לענות על שתי שאלות ההסכמה לפני ההגשה'); const box = body.querySelector('.pconsents'); if(box) box.scrollIntoView({ block:'center' }); return; }
      try { await srvSubmit(mk, (document.getElementById('prefs-note').value || '').trim()); } catch(e){ toast('ההגשה לא נשמרה. נסו שוב.'); return; }
      toast('ההעדפות הוגשו ✓'); renderInstructorPrefs(body); return;
    }
    m.submitted[me.id] = true; portalSave(); toast('ההעדפות הוגשו ✓'); renderInstructorPrefs(body);
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
const SWAP_STATUS = { open:'מחכה למחליף/ה', offered:'הועברה לרכזת — ממתינה לאישור', approved:'אושרה', rejected:'לא אושרה', cancelled:'בוטלה' };
function canTakeShift(pid, key){
  const { date } = splitKey(key), mk = monthKeyOf(date), m = portalMonth(mk), ctx = portalCtx(mk);
  const slot = buildSlots(mk, ctx.shiftTypes).find(s => s.key === key);
  if(!slot || slot.end <= Date.now()) return false;
  if(Object.keys(m.assignments).some(k => k.startsWith(date + '|') && (m.assignments[k] || []).includes(pid))) return false;      // already working that day
  return portalServerOn || levelOf(ctx.prefs, pid, slot) !== 'no';          // (on the real system any instructor may offer to take a shift)
}
function renderInstructorSwaps(body){
  const me = portalMe(), st = portalLoad();
  const name = id => { const p = portalPerson(id); return p ? instrName(p, st.instructors) : '?'; };
  const approvalsForMe = [];
  Object.keys(st.months).forEach(mk => Object.keys(st.months[mk].approvals || {}).forEach(k => { const key = k.slice(0, k.lastIndexOf('|')), iid = k.slice(k.lastIndexOf('|') + 1); if(iid === me.id && st.months[mk].approvals[k] === 'pending') approvalsForMe.push({ mk, k, key }); }));
  const open = st.swaps.filter(s => s.status === 'open').sort((a, b) => a.key.localeCompare(b.key));
  const mineReq = st.swaps.filter(s => s.from === me.id || s.to === me.id).slice(0, 10);
  body.innerHTML = `
    ${approvalsForMe.length ? '<h2 class="psec">בקשות אליי</h2>' : ''}
    ${approvalsForMe.map(a => `<div class="preq warn"><div>הרכזת שיבצה אותך למשמרת שסימנת עליה "לא":<br><b>${slotLabel(a.key)}</b><br>האם את/ה מאשר/ת?</div><div class="preq-actions"><button type="button" class="btn" data-appr-ok="${a.mk}|${a.k}">מאשר/ת</button><button type="button" class="btn ghost" data-appr-no="${a.mk}|${a.k}">לא מאשר/ת</button></div></div>`).join('')}
    <h2 class="psec">בקשות החלפה פתוחות</h2>
    <div class="pnote">מי מבקש החלפה, ולאיזו משמרת. מי שיכול/ה להחליף לוחץ/ת על הכפתור, והבקשה עוברת לרכזת. כדי לבקש החלפה בעצמך, פתחו "הסידור" ← "המשמרות שלי" ← "בקשת החלפה".</div>
    ${open.length ? open.map(s => {
      const own = s.from === me.id, can = !own && canTakeShift(me.id, s.key);
      return `<div class="preq swap"><div>${s.urgent ? '<span class="pchip missing">⚠ דחוף</span> ' : ''}<b>${pEsc(name(s.from))}</b> מבקש/ת החלפה<br>${slotLabel(s.key)}</div><div class="preq-actions">${own ? `<button type="button" class="btn ghost" data-swap-cancel="${s.id}">ביטול הבקשה שלי</button>` : can ? `<button type="button" class="btn" data-swap-take="${s.id}">אני יכול/ה להחליף</button>` : '<em class="pst">לא זמין/ה למשמרת הזו</em>'}</div></div>`;
    }).join('') : '<div class="pnote">אין כרגע בקשות החלפה פתוחות.</div>'}
    <h2 class="psec">הבקשות שלי</h2>
    ${mineReq.length ? mineReq.map(s => `<div class="pmine-row"><span>${slotLabel(s.key)}<br><small>${s.from === me.id ? 'ביקשת החלפה' + (s.to ? ' · הציע/ה: ' + pEsc(name(s.to)) : '') : 'הצעת להחליף את ' + pEsc(name(s.from))}</small></span><em class="pst pst-${s.status}">${SWAP_STATUS[s.status]}</em></div>`).join('') : '<div class="pnote">אין בקשות.</div>'}`;
  body.querySelectorAll('[data-swap-take]').forEach(b => b.addEventListener('click', async () => {
    const sw = st.swaps.find(x => x.id === b.dataset.swapTake); if(!sw || sw.status !== 'open') return;
    if(portalServerOn){
      try { await srvSwapAction('offer_swap', { p_swap:sw.id }); toast('הבקשה הועברה לרכזת'); } catch(e){ toast('לא הצלחנו. אולי המשמרת כבר נתפסה.'); }
      renderInstructorSwaps(body); return;
    }
    sw.to = me.id; sw.status = 'offered';
    queueEmail('c1', 'בקשת החלפה ממתינה לאישורך', `${name(sw.from)} מבקש/ת החלפה במשמרת ${slotText(sw.key)}. ${name(me.id)} מוכן/ה להחליף.`);
    addNotice(sw.from, `${name(me.id)} הציע/ה להחליף אותך ב-${slotText(sw.key)}. הבקשה הועברה לרכזת.`, 'info');
    addNotice(me.id, `הבקשה להחליף את ${name(sw.from)} ב-${slotText(sw.key)} הועברה לרכזת.`, 'info');
    portalSave(); toast('הבקשה הועברה לרכזת'); renderInstructorSwaps(body);
  }));
  body.querySelectorAll('[data-swap-cancel]').forEach(b => b.addEventListener('click', async () => {
    if(portalServerOn){ try { await srvSwapAction('cancel_swap', { p_swap:b.dataset.swapCancel }); toast('הבקשה בוטלה'); } catch(e){ toast('הביטול נכשל. נסו שוב.'); } renderInstructorSwaps(body); return; }
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
    ${mine.length ? mine.map(n => `<div class="pannounce ${n.kind}"><small>${new Date(n.at).toLocaleString('he-IL')}${n.seen ? '' : ' · חדש'}</small><div>${pEsc(n.text)}</div></div>`).join('') : '<div class="pnote">אין עדכונים.</div>'}
    <h2 class="psec">הודעות מהרכזת</h2>
    ${st.announcements.length ? st.announcements.map(a => `<div class="pannounce"><small>${a.date} · ${pEsc(a.from)}</small><div>${pEsc(a.text)}</div></div>`).join('') : '<div class="pnote">אין הודעות.</div>'}
    <h2 class="psec">אימיילים (תצוגה מקדימה)</h2>
    <div class="pnote">בגרסה המחוברת לשרת ההודעות האלה יישלחו במייל אמיתי. כאן רואים איך הן ייראו.</div>
    ${mails.length ? mails.map(e => `<button type="button" class="pmail" data-mail="${e.id}"><b>${pEsc(e.subject)}</b><small>${new Date(e.at).toLocaleString('he-IL')}</small></button>`).join('') : '<div class="pnote">עוד לא נשלחו אליך הודעות.</div>'}`;
  body.querySelectorAll('[data-mail]').forEach(b => b.addEventListener('click', () => showMailPreview(st.outbox.find(e => e.id === b.dataset.mail))));
}
function showMailPreview(e){
  if(!e) return;
  const st = portalLoad(), to = e.to === 'all' ? 'כל המדריכים' : (portalPerson(e.to) ? instrName(portalPerson(e.to), st.instructors) : e.to);
  portalSheet(`<h2>תצוגה מקדימה של אימייל</h2><div class="pmail-view"><div><small>אל:</small> ${pEsc(to)}</div><div><small>נושא:</small> <b>${pEsc(e.subject)}</b></div><p>${pEsc(e.body).replace(/\n/g, '<br>')}</p><p class="pnote">קישור לפורטל: (יפעל כשהמערכת תחובר לשרת)</p></div><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>סגירה</button></div>`);
}
