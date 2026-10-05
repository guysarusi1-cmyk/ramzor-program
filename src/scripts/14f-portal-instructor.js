
// ---------- THE INSTRUCTOR PORTAL: what an instructor sees (schedule, preferences, swaps, messages) ----------
// a time range always reads left-to-right (07:00–15:00), also inside Hebrew text
function rangeHtml(a, b){ return `<bdi dir="ltr">${a}–${b}</bdi>`; }
function slotLabel(key){
  const { date, shiftId } = splitKey(key), s = portalLoad().shiftTypes.find(x => x.id === shiftId);
  return `${dayLabel(date)} · ${s ? s.label + ' ' + rangeHtml(s.start, s.end) : shiftId}`;
}
// the shifts a person has in a month (from the published schedule)
function myShifts(me, mk){
  const m = portalMonth(mk), ctx = portalCtx(mk);
  if(!m.published) return [];
  return buildSlots(mk, ctx.shiftTypes).filter(s => (m.assignments[s.key] || []).includes(me.id));
}

function renderInstructorSchedule(body){
  const me = portalMe(), mk = portalUi.month, m = portalMonth(mk), ctx = portalCtx(mk);
  const mine = myShifts(me, mk), today = isoDate(new Date());
  body.innerHTML = `
    ${monthNavHtml(mk)}
    ${!m.published ? `<div class="pnote">הסידור לחודש הזה עוד לא פורסם. ${m.deadline ? `ההעדפות נסגרות ב-${parseIso(m.deadline).getDate()}/${parseIso(m.deadline).getMonth() + 1}.` : ''}</div>` : `
    <h2 class="psec">המשמרות שלי</h2>
    <div class="pmine">${mine.length ? mine.map(s => `<div class="pmine-row${s.date < today ? ' past' : ''}"><b>${dayLabel(s.date)}</b><span>${pEsc(ctx.shiftTypes.find(x => x.id === s.shiftId).label)} ${rangeHtml(ctx.shiftTypes.find(x => x.id === s.shiftId).start, ctx.shiftTypes.find(x => x.id === s.shiftId).end)}</span></div>`).join('') : '<div class="pnote">אין לך משמרות בחודש הזה.</div>'}</div>
    <h2 class="psec">הצוות כולו</h2>
    ${boardHtml(ctx, m.assignments, { me:me.id })}`}`;
  wireMonthNav(body);
}

// ---- preferences: choose a level at the bottom, then tap days (the whole day) or shifts
const LEVEL_BUTTONS = [['yes', 'כן'], ['avoid', 'מעדיף שלא'], ['no', 'ממש לא'], ['absent', 'היעדרות'], ['clear', 'ניקוי']];
function renderInstructorPrefs(body){
  const me = portalMe(), st = portalLoad();
  if(!portalUi.pmonth) portalUi.pmonth = addMonths(monthKeyOf(isoDate(new Date())), 1);
  const mk = portalUi.pmonth, m = portalMonth(mk), prefs = portalPrefsOf(mk, me.id), submitted = !!m.submitted[me.id];
  const days = daysOfMonth(mk), lead = dowOf(days[0]);
  const marked = Object.keys(prefs.slots).length + prefs.absent.length;
  const dl = m.deadline ? parseIso(m.deadline) : null;
  let cells = '';
  for(let i = 0; i < lead; i++) cells += '<div class="pday blank"></div>';
  days.forEach(date => {
    const absent = prefs.absent.includes(date);
    cells += `<div class="pday${absent ? ' absent' : ''}${[5, 6].includes(dowOf(date)) ? ' weekend' : ''}">
      <button type="button" class="pday-num" data-pday="${date}" aria-label="${dayLabel(date)}">${parseIso(date).getDate()}</button>
      <div class="pday-shifts">${st.shiftTypes.map(s => { const lv = absent ? 'no' : (prefs.slots[`${date}|${s.id}`] || 'neutral'); return `<button type="button" class="pshift lv-${lv}" data-pslot="${date}|${s.id}" aria-label="${pEsc(s.label)}">${pEsc(s.label.charAt(0))}</button>`; }).join('')}</div>
    </div>`;
  });
  body.innerHTML = `
    ${monthNavHtml(mk)}
    <div class="pstatus ${submitted ? 'ok' : 'bad'}">${submitted ? 'ההעדפות הוגשו ✓ (אפשר לעדכן עד סגירת ההגשה)' : 'ההעדפות טרם הוגשו. ההגשה חובה.'}${dl ? ` · נסגר ב-${dl.getDate()}/${dl.getMonth() + 1}` : ''}</div>
    <div class="pnote">בחרו רמה למטה, ואז לחצו על יום (כל המשמרות שלו) או על משמרת בודדת. ${st.shiftTypes.map(s => s.label.charAt(0) + ' = ' + s.label).join(' · ')}</div>
    <div class="pcal">${DOW_SHORT.map(d => `<div class="pcal-head">${d}</div>`).join('')}${cells}</div>
    <div class="pprefs-actions"><button type="button" class="btn" id="prefs-submit">${submitted ? 'עדכון והגשה מחדש' : 'הגשת העדפות'}</button><span class="pnote">${marked} סימונים</span></div>
    <div class="plevelbar" role="group" aria-label="בחירת רמה">${LEVEL_BUTTONS.map(b => `<button type="button" class="lvbtn lv-${b[0]}${portalUi.level === b[0] ? ' active' : ''}" data-plevel="${b[0]}">${b[1]}</button>`).join('')}</div>`;
  wireMonthNav(body, 'pmonth');
  body.querySelectorAll('[data-plevel]').forEach(b => b.addEventListener('click', () => { portalUi.level = b.dataset.plevel; renderInstructorPrefs(body); }));
  body.querySelectorAll('[data-pslot]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.pslot, date = key.split('|')[0], lv = portalUi.level;
    if(lv === 'absent'){ toggleAbsent(prefs, date); }
    else if(lv === 'clear'){ delete prefs.slots[key]; }
    else if(prefs.slots[key] === lv){ delete prefs.slots[key]; } else { prefs.slots[key] = lv; }
    portalSave(); renderInstructorPrefs(body);
  }));
  body.querySelectorAll('[data-pday]').forEach(b => b.addEventListener('click', () => {
    const date = b.dataset.pday, lv = portalUi.level, keys = st.shiftTypes.map(s => `${date}|${s.id}`);
    if(lv === 'absent'){ toggleAbsent(prefs, date); }
    else if(lv === 'clear'){ keys.forEach(k => delete prefs.slots[k]); prefs.absent = prefs.absent.filter(d => d !== date); }
    else if(keys.every(k => prefs.slots[k] === lv)){ keys.forEach(k => delete prefs.slots[k]); } else { keys.forEach(k => { prefs.slots[k] = lv; }); }
    portalSave(); renderInstructorPrefs(body);
  }));
  document.getElementById('prefs-submit').addEventListener('click', () => {
    m.submitted[me.id] = true; portalSave(); toast('ההעדפות הוגשו ✓'); renderInstructorPrefs(body);
  });
}
function toggleAbsent(prefs, date){ prefs.absent = prefs.absent.includes(date) ? prefs.absent.filter(d => d !== date) : prefs.absent.concat(date); }

// ---- swaps and approvals
const SWAP_STATUS = { asked:'ממתין לקולגה', agreed:'הקולגה הסכים/ה — ממתין לאישור הרכזת', approved:'אושר', rejected:'נדחה על ידי הרכזת', declined:'הקולגה סירב/ה' };
function renderInstructorSwaps(body){
  const me = portalMe(), st = portalLoad(), today = isoDate(new Date());
  const name = id => { const p = portalPerson(id); return p ? instrName(p, st.instructors) : '?'; };
  const incoming = st.swaps.filter(s => s.to === me.id && s.status === 'asked');
  const approvalsForMe = [];
  Object.keys(st.months).forEach(mk => Object.keys(st.months[mk].approvals || {}).forEach(k => { const [key, iid] = [k.slice(0, k.lastIndexOf('|')), k.slice(k.lastIndexOf('|') + 1)]; if(iid === me.id && st.months[mk].approvals[k] === 'pending') approvalsForMe.push({ mk, k, key }); }));
  const mineReq = st.swaps.filter(s => s.from === me.id).slice(0, 8);
  const upcoming = [];
  [monthKeyOf(today), addMonths(monthKeyOf(today), 1)].forEach(mk => myShifts(me, mk).filter(s => s.date >= today).forEach(s => upcoming.push(s)));
  body.innerHTML = `
    ${incoming.length || approvalsForMe.length ? '<h2 class="psec">בקשות אליי</h2>' : ''}
    ${incoming.map(s => `<div class="preq"><div><b>${pEsc(name(s.from))}</b> מבקש/ת שתחליף/י אותו/ה במשמרת:<br>${slotLabel(s.key)}</div><div class="preq-actions"><button type="button" class="btn" data-swap-agree="${s.id}">מסכים/ה</button><button type="button" class="btn ghost" data-swap-decline="${s.id}">לא מתאים</button></div></div>`).join('')}
    ${approvalsForMe.map(a => `<div class="preq warn"><div>הרכזת שיבצה אותך למשמרת שסימנת עליה "ממש לא":<br><b>${slotLabel(a.key)}</b><br>האם את/ה מאשר/ת?</div><div class="preq-actions"><button type="button" class="btn" data-appr-ok="${a.mk}|${a.k}">מאשר/ת</button><button type="button" class="btn ghost" data-appr-no="${a.mk}|${a.k}">לא מאשר/ת</button></div></div>`).join('')}
    <h2 class="psec">המשמרות הקרובות שלי</h2>
    ${upcoming.length ? upcoming.slice(0, 10).map(s => `<div class="pmine-row"><b>${slotLabel(s.key)}</b><button type="button" class="btn ghost small" data-swap-ask="${s.key}">בקשת החלפה</button></div>`).join('') : '<div class="pnote">אין משמרות קרובות שפורסמו.</div>'}
    <h2 class="psec">הבקשות שלי</h2>
    ${mineReq.length ? mineReq.map(s => `<div class="pmine-row"><span>${slotLabel(s.key)} ← ${pEsc(name(s.to))}</span><em class="pst pst-${s.status}">${SWAP_STATUS[s.status]}</em></div>`).join('') : '<div class="pnote">עוד לא ביקשת החלפות.</div>'}`;
  body.querySelectorAll('[data-swap-agree], [data-swap-decline]').forEach(b => b.addEventListener('click', () => {
    const sw = st.swaps.find(x => x.id === (b.dataset.swapAgree || b.dataset.swapDecline));
    sw.status = b.dataset.swapAgree ? 'agreed' : 'declined';
    queueEmail('c1', b.dataset.swapAgree ? 'בקשת החלפה ממתינה לאישורך' : 'בקשת החלפה נדחתה', `${name(sw.from)} ↔ ${name(sw.to)} · ${slotLabel(sw.key)}`);
    portalSave(); toast(b.dataset.swapAgree ? 'ההסכמה נשלחה לרכזת' : 'הבקשה נדחתה'); renderInstructorSwaps(body);
  }));
  body.querySelectorAll('[data-appr-ok], [data-appr-no]').forEach(b => b.addEventListener('click', () => {
    const [mk, k] = (b.dataset.apprOk || b.dataset.apprNo).split(/\|(.+)/).filter(Boolean), m = portalMonth(mk), key = k.slice(0, k.lastIndexOf('|'));
    if(b.dataset.apprOk){ m.approvals[k] = 'ok'; toast('האישור נשלח לרכזת'); }
    else { delete m.approvals[k]; m.assignments[key] = (m.assignments[key] || []).filter(id => id !== me.id); queueEmail('c1', 'מדריך לא אישר שיבוץ', `${name(me.id)} לא אישר/ה את ${slotLabel(key)}. המשמרת חסרה כעת.`); toast('השיבוץ בוטל, הרכזת תעודכן'); }
    portalSave(); renderInstructorSwaps(body);
  }));
  body.querySelectorAll('[data-swap-ask]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.swapAsk, { date } = splitKey(key), mk = monthKeyOf(date), m = portalMonth(mk);
    const busy = new Set(Object.keys(m.assignments).filter(k => k.startsWith(date + '|')).flatMap(k => m.assignments[k]));
    const options = st.instructors.filter(p => p.active && p.role === 'instructor' && p.id !== me.id && !busy.has(p.id));
    const sh = portalSheet(`<h2>בקשת החלפה</h2><p class="confirm-text">${slotLabel(key)}</p>
      <label class="pfield">מי יחליף אותך?<select id="swap-to">${options.map(p => `<option value="${p.id}">${pEsc(instrName(p, st.instructors))}</option>`).join('')}</select></label>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="swap-send">שליחת בקשה</button></div>`);
    sh.querySelector('#swap-send').addEventListener('click', () => {
      const to = sh.querySelector('#swap-to').value; if(!to) return;
      st.swaps.unshift({ id:'s' + Date.now(), key, from:me.id, to, status:'asked', at:new Date().toISOString() });
      queueEmail(to, 'בקשת החלפת משמרת', `${name(me.id)} מבקש/ת שתחליף/י אותו/ה: ${slotLabel(key)}`);
      portalSave(); sh.close(); toast('הבקשה נשלחה לקולגה'); renderInstructorSwaps(body);
    });
  }));
}

// ---- messages from the coordinator and the e-mails that were (in the real system: will be) sent
function renderInstructorInbox(body){
  const me = portalMe(), st = portalLoad();
  const mails = st.outbox.filter(e => e.to === me.id || e.to === 'all').slice(0, 12);
  body.innerHTML = `
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
