
// ---------- THE PORTAL ON THE SERVER: the coordinator's schedule (the board, editing a shift, publishing, what needs her attention) ----------
// The schedule is built by the system once a month (the 25th, at night). From then on the coordinator edits it by hand; there is no "build" button.
const SRV_STATUS_WORD = { collecting:'בהגשת העדפות', draft:'טיוטה', sent:'נשלח אלייך', published:'פורסם' };
const SRV_FLAG_KIND = { ahmash:'אחמ"שית', night:'לילה', staffing:'איוש', composition:'הרכב', min:'מינימום אישי', pair:'שילוב', rest:'מנוחה', extension:'הארכה', from16:'מ-16:00', pull:'משיכה', double:'כפולה', partial:'שעות מותאמות', can:'"יכול"', ahmash2:'אחמ"שית שנייה', service:'בנות שירות', service_absent:'היעדרות בת שירות', vacation_conflict:'חופשה', nosubmit:'לא הגיש' };

// ---- the rest rules in the browser (the same two numbers as in the server: 7 hours, and 8 after more than 11 hours in a row)
const dayNum = date => Math.round(parseIso(date).getTime() / 86400000);
function rowParts(r){
  const base = dayNum(r.day) * 24, std = SRV_STD[r.shift] || ['07:00', '15:00'];
  if(r.shift === 'L') return [[base + 17, base + 22], [base + 31, base + 24 + (r.to ? parseInt(r.to, 10) || 20 : 20)]];
  const a = parseInt(r.from || std[0], 10), b0 = parseInt(r.to || std[1], 10) || 24, b = b0 <= a ? b0 + 24 : b0;
  return [[base + a, base + b]];
}
function partsConflict(u, v){
  for(const [a0, a1] of u) for(const [b0, b1] of v){
    let first, second;
    if(b0 >= a1){ first = [a0, a1]; second = [b0, b1]; } else if(a0 >= b1){ first = [b0, b1]; second = [a0, a1]; } else return 'חפיפה';
    const need = (first[1] - first[0]) > 11 ? 8 : 7;
    if(second[0] - first[1] < need) return `מנוחה של ${second[0] - first[1]} שעות בלבד (נדרשות ${need})`;
  }
  return null;
}
// what would be wrong if this person worked this row? -> list of texts (the coordinator may still go ahead)
function srvWarnings(pid, day, shift, from, to, ignoreId){
  const st = portalLoad(), p = (st.priv || {})[pid] || {}, m = portalMonth(monthKeyOf(day)), pr = m.prefs[pid] || { slots:{}, absent:[], fixed:[] };
  const out = [], key = SRV_SHIFT_UI[shift === 'S' ? 'M' : shift] || null, cand = { day, shift, from, to };
  const lvl = key && pr.slots[`${day}|${key}`];
  if(lvl === 'no') out.push('סימן/ה "לא" למשמרת הזו');
  else if(lvl === 'avoid') out.push('סימן/ה "יכול" למשמרת הזו');
  const fx = (pr.fixed || []).find(f => f.day === day);
  if(fx) out.push(`יום היעדרות (${FIXED_REASON[fx.reason] || 'היעדרות'})`);
  else if((pr.absent || []).includes(day)) out.push('סימן/ה היעדרות ביום הזה');
  if(shift === 'N' && p.no_nights) out.push('לא עושה לילות');
  if(p.manual_only) out.push('משובץ/ת ידנית בלבד');
  if(p.only_long_weekend && shift !== 'L') out.push('משובץ/ת רק לסופ"ש ארוך');
  if(p.latest_end_hour && parseInt(to || '22', 10) > p.latest_end_hour && shift !== 'N') out.push(`עובדת לכל המאוחר עד ${p.latest_end_hour}:00`);
  st.rows.filter(r => r.staff === pid && r.id !== ignoreId && Math.abs(dayNum(r.day) - dayNum(day)) <= 3).forEach(r => {
    const c = partsConflict(rowParts(r), rowParts(cand));
    if(c) out.push(`${c}: ${dayLabel(r.day)} ${SRV_SHIFT_WORD[r.shift]}`);
  });
  return out;
}
// the make-up of one shift after a change (what the rules ask of the team on that shift)
function srvShiftWarnings(day, shift, rows){
  const st = portalLoad(), out = [], on = rows.filter(r => r.day === day && r.shift === shift && ((st.priv || {})[r.staff] || true) && (st.instructors.find(x => x.id === r.staff) || {}).role === 'instructor');
  const priv = id => (st.priv || {})[id] || {};
  if(shift === 'N'){
    if(on.length !== 2) out.push(`בלילה צריך בדיוק 2 מדריכים (יש ${on.length})`);
    if(on.length && !on.some(r => priv(r.staff).female)) out.push('בלילה צריכה להיות לפחות אישה אחת');
    if(on.length === 2 && on.every(r => !priv(r.staff).female)) out.push('בלילה לא יכולים להיות שני גברים');
  }
  if(shift === 'A' && on.length && !on.some(r => (priv(r.staff).ahmash_rank || 0) > 0)) out.push('במשמרת הצהריים חייבת להיות אחמ"שית');
  if(shift === 'A' && !on.length) out.push('במשמרת הצהריים אין אף מדריך');
  return out;
}

// ---- the coordinator's data that only she may read
async function srvLoadCoord(){
  const st = portalLoad();
  // everything is read at the same time (one after the other made the coordinator's sign-in slow); a part that fails or is missing (an older database) is just empty
  const q = build => Promise.resolve().then(build).catch(e => ({ error:e }));
  const [priv, flags, vac, ph, pm, wm, sv, sr, br, orq] = await Promise.all([
    srvAll(() => sbPersonal.from('staff_private').select('staff_id,email,female,is_leader,ahmash_rank,leader_priority,no_nights,manual_only,only_long_weekend,latest_end_hour,auth_user_id')),
    srvAll(() => sbPersonal.from('coordinator_flags').select('id,month,day,kind,text,staff_id,resolved').eq('resolved', false).order('day', { nullsFirst:true })),
    srvAll(() => sbPersonal.from('vacation_requests').select('id,staff_id,from_day,to_day,note,status,created_at').order('created_at', { ascending:false }).limit(60)),
    q(() => sbPersonal.from('staff_private').select('staff_id,phone')),                                                        // (the phones: scheduling-v21.sql)
    q(() => sbPersonal.from('staff_private').select('staff_id,min_mid,min_nights,min_weekend,day_buddy,lang')),                // (personal minimums, the day colleague, the language: scheduling-v25.sql)
    q(() => sbPersonal.from('sched_settings').select('value').eq('key', 'wa_messages').maybeSingle()),                         // (the WhatsApp messages as the coordinator wrote them)
    q(() => sbPersonal.from('staff_settings').select('*')),                                                                     // (each person's voice, fixed preferences (v27) and language (v25))
    q(() => sbPersonal.from('sick_reports').select('assignment_id,note').order('created_at')),                                 // (the reason an instructor gave when she reported that she cannot come)
    q(() => sbPersonal.from('sched_requests').select('id,month,at,done_at,result').order('at', { ascending:false }).limit(12)),  // ("צור סידור אוטומטי": scheduling-v33.sql)
    q(() => sbPersonal.from('open_shift_requests').select('id,staff_id,day,shift,created_at').eq('status', 'pending').order('created_at')),  // (the requests to join an open shift: scheduling-v11.sql)
    srvOdLoad()                                                                                                                 // (the open days for sign-up and who took them: scheduling-v25.sql)
  ]);
  const rows = r => (r && !r.error && r.data) || [];
  st.priv = {}; priv.forEach(r => { st.priv[r.staff_id] = r; });
  rows(ph).forEach(r => { if(st.priv[r.staff_id]) st.priv[r.staff_id].phone = r.phone; });
  rows(pm).forEach(r => { if(st.priv[r.staff_id]) Object.assign(st.priv[r.staff_id], r); });
  st.waMsg = (wm && !wm.error && wm.data && wm.data.value) || {};
  st.voices = {}; st.fixedNo = {}; st.langs = {};
  rows(sv).forEach(r => { if(r.voice) st.voices[r.staff_id] = r.voice; if((r.fixed_no || []).length) st.fixedNo[r.staff_id] = r.fixed_no; if(r.lang) st.langs[r.staff_id] = r.lang; });
  st.flags = flags; st.vacations = vac;
  st.reasons = {}; rows(sr).forEach(x => { if(x.note) st.reasons[x.assignment_id] = x.note; });
  st.buildReqs = rows(br); st.openReqs = rows(orq);
}

// the shifts that are below the minimum number of instructors (the same standard numbers as the database): after publishing they are offered to the instructors who could fill them
function srvOpenShiftsOf(mk){
  const st = portalLoad(), isInstr = id => { const p = st.instructors.find(x => x.id === id); return p && p.role === 'instructor'; };
  const need = (d, sh) => sh === 'M' ? ([5, 6].includes(dowOf(d)) ? 5 : 1) : sh === 'A' ? ([4, 5, 6].includes(dowOf(d)) ? 5 : 4) : 2;
  const have = (d, sh) => st.rows.filter(r => isInstr(r.staff) && ((r.shift !== 'L' && r.day === d && (r.shift === 'S' ? 'M' : r.shift) === sh) || (r.shift === 'L' && ((r.day === d && sh === 'A') || (addDays(r.day, 1) === d && ['M', 'A'].includes(sh)))))).length;
  const out = [];
  daysOfMonth(mk).forEach(d => ['M', 'A', 'N'].forEach(sh => { const h = have(d, sh), n = need(d, sh); if(h < n) out.push({ day:d, shift:sh, missing:n - h }); }));
  return out;
}

// ---- the screen
function srvDefaultCoordMonth(){
  const st = portalLoad(), cur = monthKeyOf(srvToday()), next = addMonths(cur, 1);
  return st.months[next] && st.months[next].status ? next : (st.months[cur] && st.months[cur].status ? cur : next);
}
// the coordinator may hide the line of the service girls and the teachers in her calendar (remembered on this device)
function csHideOthers(){ try { return localStorage.getItem('ramzor-cs-hide-others') === '1'; } catch(e){ return false; } }
function srvRenderCoordSchedule(body){
  if(srvDragWho){ srvRenderAfterDrag = body; return; }          // (never redraw the calendar in the middle of a drag: the name being dragged would vanish and the drop would be lost; it redraws when the drag ends)
  if(!body.isConnected) return;                                   // (a screen that finished loading after the person left it must not draw)
  const st = portalLoad(), mk = portalUi.month || (portalUi.month = srvDefaultCoordMonth()), m = portalMonth(mk), ctx = portalCtx(mk);
  const flags = (st.flags || []).filter(f => f.month && f.month.slice(0, 7) === mk), has = !!m.status;
  const needLook = flags.filter(f => !SRV_FLAG_HIDDEN.includes(f.kind) && f.kind !== 'service');          // (what Guy took off the screen: the engine still writes them)
  const svcDays = [...new Set(flags.filter(f => f.kind === 'service' && f.day).map(f => f.day))].sort();          // (the days with fewer than two service girls: one line)
  const svcLine = svcDays.length ? `<div class="pflag"><span><b>בנות שירות</b> · ב-${svcDays.length} ימים יש פחות משתי בנות שירות: ${svcDays.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)).join(', ')}. כללי המדריכים שונו בהתאם.</span></div>` : '';
  const people = id => (st.instructors.find(p => p.id === id) || {}).first || '';
  const odAlerts = m.published ? srvOdAlerts(mk) : [], lookCount = needLook.length + odAlerts.length + (svcLine ? 1 : 0);
  body.innerHTML = `
    ${monthNavHtml(mk, `<span class="pchip ${m.published ? 'lv-yes' : 'lv-avoid'}">${has ? SRV_STATUS_WORD[m.status] : 'אין סידור'}</span>`)}
    ${srvBuildBoxHtml(mk)}
    ${has ? `<div class="pactions">
      <button type="button" class="btn" id="cs-publish"${m.published ? ' disabled' : ''}>${m.published ? 'הסידור פורסם' : 'פרסום הסידור'}</button>
      <button type="button" class="btn ghost" id="cs-xlsx">ייצוא לאקסל</button>
      <button type="button" class="btn ghost" id="cs-print">הדפסה / PDF</button>
      ${m.published ? '<button type="button" class="btn ghost" id="cs-openday">פתיחת יום לשיבוץ</button>' : ''}
    </div>
    ${lookCount ? `<details class="pissues"><summary>${lookCount} דברים שדורשים תשומת לב</summary>${odAlerts.map(a => `<div class="pflag"><span><b>יום פתוח לשיבוץ</b> · ${pEsc(a)}</span></div>`).join('')}${needLook.map(f => `<div class="pflag"><span><b>${SRV_FLAG_KIND[f.kind] || f.kind}</b> · ${pEsc(f.text)}</span><button type="button" class="btn ghost small" data-flag-done="${f.id}">טופל</button></div>`).join('')}${svcLine}</details>` : '<div class="pstatus ok">אין דברים שדורשים תשומת לב ✓</div>'}
    ${m.published ? srvOdFoldHtml(mk) : ''}
    ${srvCountFoldHtml(mk)}
    <div class="cs-note-row"><button type="button" class="btn ghost small" id="cs-others">${csHideOthers() ? 'הצגת בנות שירות ומורות' : 'הסתרת בנות שירות ומורות'}</button></div>
    <div class="cs-layout"><div class="cs-main">${monthCalHtml(ctx, m.assignments, { edit:true, colour:true, ahmash:srv.ahmash, sel:portalUi.csOpen ? portalUi.csPerson : null, others:false, othersInCells:!csHideOthers() })}</div>${srvSidePanelHtml(mk)}</div>` : ''}
    ${srvHelpFoldHtml(m, has)}`;
  wireMonthNav(body);
  srvBuildWire(body, mk);
  if(!has) return;
  { const cf = body.querySelector('#cs-count'); if(cf) cf.addEventListener('toggle', () => { portalUi.csCount = cf.open; }); }
  { const ob = body.querySelector('#cs-others'); if(ob) ob.addEventListener('click', () => { try { localStorage.setItem('ramzor-cs-hide-others', csHideOthers() ? '0' : '1'); } catch(e){} srvRenderCoordSchedule(body); }); }
  if(m.published) srvOdWire(body, mk);
  const csOpen = document.getElementById('cs-open'), csClose = document.getElementById('cs-close');
  if(csOpen) csOpen.addEventListener('click', () => { portalUi.csOpen = true; srvRenderCoordSchedule(body); });
  if(csClose) csClose.addEventListener('click', () => { portalUi.csOpen = false; portalUi.csPerson = null; srvRenderCoordSchedule(body); });
  // drag a name from the panel into a shift of the schedule
  body.querySelectorAll('.cs-name[data-cs-person]').forEach(b => {
    b.setAttribute('draggable', 'true');
    b.addEventListener('dragstart', e => { srvDragWho = b.dataset.csPerson; e.dataTransfer.setData('text/plain', b.dataset.csPerson); e.dataTransfer.effectAllowed = 'copy'; b.classList.add('dragging'); });
    b.addEventListener('dragend', () => { srvDragWho = null; b.classList.remove('dragging'); body.querySelectorAll('.mcal-cell[class*="drop-"]').forEach(c => srvDropClear(c)); if(srvRenderAfterDrag){ const rb = srvRenderAfterDrag; srvRenderAfterDrag = null; if(rb.isConnected) srvRenderCoordSchedule(rb); } });
  });
  body.querySelectorAll('.mcal-cell.editable').forEach(c => {
    c.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; srvDropShow(c); });
    c.addEventListener('dragleave', () => srvDropClear(c));
    c.addEventListener('drop', e => { e.preventDefault(); srvDropClear(c); const who = e.dataTransfer.getData('text/plain') || srvDragWho; if(who) srvAddToSlot(mk, c.dataset.key, who, body); });
  });
  body.querySelectorAll('[data-cs-person]').forEach(b => b.addEventListener('click', () => { portalUi.csPerson = portalUi.csPerson === b.dataset.csPerson ? null : b.dataset.csPerson; srvRenderCoordSchedule(body); }));
  body.querySelectorAll('.mcal-cell.editable').forEach(td => {
    const open = () => srvOpenSlot(mk, td.dataset.key, body);
    td.addEventListener('click', open); td.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
  });
  body.querySelectorAll('[data-flag-done]').forEach(b => b.addEventListener('click', async () => {
    const u = await sbPersonal.from('coordinator_flags').update({ resolved:true }).eq('id', b.dataset.flagDone);
    if(u.error) toast('העדכון נכשל'); else { st.flags = st.flags.filter(f => f.id !== b.dataset.flagDone); }
    srvRenderCoordSchedule(body);
  }));
  const pub = document.getElementById('cs-publish');
  if(pub) pub.addEventListener('click', async () => {
    const open = (st.flags || []).filter(f => f.month && f.month.slice(0, 7) === mk && !['service_absent', 'service'].includes(f.kind)).length;
    const openShifts = srvOpenShiftsOf(mk);
    if(!(await confirmSheet({ title:'לפרסם את הסידור?', text:`מרגע הפרסום כל המדריכים רואים אותו, ובכל מסך אישי מופיע הסעיף "איך הלכו הבקשות שלך"${open ? ` (עדיין יש ${open} דברים שדורשים תשומת לב)` : ''}.${openShifts.length ? ` יש ${openShifts.length} משמרות שעדיין לא הושלמו (חסרים בהן מדריכים). אחרי הפרסום הן יופיעו למדריכים כמשמרות פתוחות: רק מי שיכול לאייש אותן (לפי המנוחה, המקסימום של מי שאינם מובילים ועוד) יוכל לבקש להצטרף, וכל בקשה תגיע אלייך לאישור. מדריך ישובץ רק אחרי שתאשרי.` : ''} כל שינוי אחר כך שולח הודעה ומייל למי שהושפע.`, okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
    const u = await sbPersonal.from('schedule').update({ status:'published', published_at:new Date().toISOString() }).eq('month', firstOf(mk));
    if(u.error){ toast('הפרסום נכשל. נסו שוב.'); return; }
    await srvReloadSafe();
    toast(openShifts.length ? `הסידור פורסם. ${openShifts.length} משמרות פתוחות הופיעו למדריכים, ובקשות להצטרף יגיעו אלייך לאישור` : 'הסידור פורסם', openShifts.length ? 6000 : 0); srvRenderCoordSchedule(body);          // (each person sees how her requests went in her own schedule screen, so no separate message is sent)
  });
  document.getElementById('cs-xlsx').addEventListener('click', () => { downloadScheduleXlsx(ctx, m.assignments); toast('קובץ האקסל נוצר'); });
  document.getElementById('cs-print').addEventListener('click', () => printSchedule(ctx, m.assignments));
}

// what Guy took off the coordinator's screen (2026-10-23): composition, personal minimums, the day colleague, a service girl's day off
const SRV_FLAG_HIDDEN = ['composition', 'min', 'pair', 'service_absent'];
// the fixed explanations, folded away in one place
const srvHelpFoldHtml = (m, has) => `<details class="pfold cs-help"><summary><span>ℹ️ הסברים</span></summary><div class="pfold-body">
    ${has ? '' : '<div class="pnote">עוד אין סידור לחודש הזה. כשההגשה נסגרת, לוחצים על "צור סידור אוטומטי" והמערכת בונה אותו לפי ההעדפות והחוקים. מכאן אפשר לערוך אותו ידנית.</div>'}
    ${has ? (m.published ? '<div class="pnote">הסידור פורסם. כל שינוי בו שולח הודעה ומייל למי שהושפע ולכל מי שנמצא באותה משמרת.</div>' : '<div class="pnote">הסידור עוד לא נראה למדריכים. אחרי הפרסום הם יראו אותו, ויקבלו מייל על כל שינוי.</div>') : ''}
    ${has ? '<div class="pnote">לחיצה על משמרת בלוח פותחת עריכה.</div>' : ''}</div></details>`;
// ---- "צור סידור אוטומטי": the schedule is built only when the coordinator asks, after the submission closed (the hourly job builds it,
// within an hour; a published month is never built again). (scheduling-v33.sql; the engine's monthly build is off unless sched_settings.auto_build)
const srvBuildReqOf = mk => (portalLoad().buildReqs || []).find(r => r.month && r.month.slice(0, 7) === mk);
function srvBuildBoxHtml(mk){
  const m = portalMonth(mk); if(m.published) return '';
  const req = srvBuildReqOf(mk), waiting = req && !req.done_at, failed = req && req.done_at && /^נכשל/.test(req.result || '');
  if(waiting) return `<div class="cs-build waiting" id="cs-build"><span aria-hidden="true">⏳</span><div><b>הסידור בבנייה</b><small>בדרך כלל מוכן תוך כרבע שעה (לכל היותר שעה), ותקבלי הודעה. אפשר לסגור את הפורטל בינתיים.</small></div></div>`;
  if(!srvPrefsDeadlinePassed(mk)){
    const end = addMonths(mk, -1) + '-24';
    return `<div class="cs-build" id="cs-build"><button type="button" class="btn" disabled>צור סידור אוטומטי</button><small>אפשר מ-${pEsc(dayLabel(end))} בשעה 22:30. הלחיצה סוגרת את ההגשה לכולם.</small></div>`;
  }
  const missing = portalLoad().instructors.filter(p => p.active && p.role === 'instructor' && !m.submitted[p.id]).length;
  return `<div class="cs-build" id="cs-build"><button type="button" class="btn${m.status ? ' ghost' : ''}" id="cs-build-go">${m.status ? 'בנייה מחדש של הסידור' : 'צור סידור אוטומטי'}</button>
    <small>${failed ? `הבנייה הקודמת לא הצליחה (${pEsc(req.result.replace(/^נכשל:\s*/, '').slice(0, 80))}). אפשר לנסות שוב.` : m.status ? 'בונה סידור חדש במקום הנוכחי, כולל השינויים הידניים שנעשו בו.' : `הלחיצה סוגרת את ההגשה לכולם. בדרך כלל מוכן תוך כרבע שעה.${missing ? ` ${missing} מדריכים עוד לא הגישו העדפות.` : ''}`}</small></div>`;
}
function srvBuildWire(body, mk){
  const go = body.querySelector('#cs-build-go'); if(!go) return;
  go.addEventListener('click', async () => {
    const m = portalMonth(mk);
    if(m.status && !(await confirmSheet({ title:`לבנות מחדש את ${monthLabel(mk)}?`, text:'הסידור הנוכחי יוחלף בסידור חדש, כולל שינויים ידניים שנעשו בו.', okLabel:'כן, לבנות מחדש', cancelLabel:'חזרה', danger:true }))) return;
    if(!m.status && !(await confirmSheet({ title:`לבנות את הסידור של ${monthLabel(mk)}?`, text:'ההגשה תיסגר לכולם עכשיו: מי שעוד לא הגיש/ה לא יוכל/תוכל להגיש. הסידור יהיה מוכן בדרך כלל תוך כרבע שעה.', okLabel:'כן, לבנות', cancelLabel:'חזרה' }))) return;
    go.disabled = true;
    const r = await sbPersonal.from('sched_requests').insert({ month:firstOf(mk), requested_by:srv.me }).select('id,month,at,done_at,result').single();
    if(r.error){ go.disabled = false; toast('הבקשה לא נשלחה. אפשר לנסות שוב בעוד רגע'); return; }
    const st = portalLoad(); st.buildReqs = [r.data].concat(st.buildReqs || []); if(srv.prefsOpenSrv) srv.prefsOpenSrv[mk] = false;
    toast('הסידור בבנייה. בדרך כלל מוכן תוך כרבע שעה, ותקבלי הודעה.', 5000); srvRenderCoordSchedule(body);
  });
}
// ---- how many shifts each instructor got this month (folded: one short line; opened: everybody, with the kinds of shifts)
function srvCountFoldHtml(mk){
  const st = portalLoad(), people = st.instructors.filter(p => p.role === 'instructor'), c = {};
  (st.rows || []).forEach(r => { if(monthKeyOf(r.day) !== mk || !people.some(p => p.id === r.staff)) return;
    const x = c[r.staff] = c[r.staff] || { all:0, M:0, A:0, N:0, L:0, W:0 }; x.all++; x[r.shift === 'S' ? 'M' : r.shift] = (x[r.shift === 'S' ? 'M' : r.shift] || 0) + 1;
    if(r.shift !== 'L' && [5, 6].includes(dowOf(r.day))) x.W++; });          // (the weekend: from Friday morning to Saturday night, both included; the long weekend has its own column)
  const list = people.filter(p => p.active || c[p.id]).map(p => ({ p, x:c[p.id] || { all:0, M:0, A:0, N:0, L:0, W:0 } })).sort((a, b) => b.x.all - a.x.all || String(a.p.first).localeCompare(String(b.p.first), 'he'));
  if(!list.length) return '';
  const nums = list.map(r => r.x.all), lo = Math.min(...nums), hi = Math.max(...nums), total = nums.reduce((a, b) => a + b, 0);
  return `<details class="pissues cs-count" id="cs-count"${portalUi.csCount ? ' open' : ''}><summary>כמה משמרות לכל אחד · ${total} משמרות, ${lo === hi ? lo : `${lo}–${hi}`} לאדם</summary>
    <div class="cs-count-scroll"><table class="cs-count-table"><thead><tr><th>שם</th><th>סה"כ</th><th>בוקר</th><th>צהריים</th><th>לילה</th><th>סופ"ש</th><th>סופ"ש ארוך</th></tr></thead><tbody>
    ${list.map(({ p, x }) => `<tr${x.all ? '' : ' class="zero"'}><th>${pEsc(instrName(p, st.instructors))}</th><td><b>${x.all}</b></td><td>${x.M || ''}</td><td>${x.A || ''}</td><td>${x.N || ''}</td><td class="cs-count-w">${x.W || ''}</td><td>${x.L || ''}</td></tr>`).join('')}
    </tbody></table></div><div class="pnote">סופ"ש = המשמרות משישי בוקר עד שבת לילה (כולל), מתוך הסה"כ. סופ"ש ארוך לא נספר בו: הוא בעמודה משלו, כמשמרת אחת. בנות שירות ומורות לא נכללות.</div></details>`;
}

// ---- edit one shift: who is on it (with hours), remove, add (with warnings; the coordinator may override them)
// the colour key as small chips (for the list of instructors to add)
const mcalKeyChips = () => '<span class="mcal-name wish-yes">כן</span><span class="mcal-name wish-can">יכול</span><span class="mcal-name wish-no">לא</span><span class="mcal-name wish-none">לא סומן</span>';
function srvOpenSlot(mk, key, body){
  const st = portalLoad(), { date, shiftId } = splitKey(key), code = SRV_SHIFT_DB[shiftId], sh = st.shiftTypes.find(x => x.id === shiftId);
  const rowsHere = () => portalLoad().rows.filter(r => r.day === date && (r.shift === code || (code === 'M' && r.shift === 'S')) && ((portalLoad().instructors.find(x => x.id === r.staff) || {}).role === 'instructor'));
  const others = () => portalLoad().rows.filter(r => r.day === date && (r.shift === code || (code === 'M' && r.shift === 'S')) && ((portalLoad().instructors.find(x => x.id === r.staff) || {}).role !== 'instructor'));
  const nm = id => { const p = portalPerson(id); return p ? instrName(p, portalLoad().instructors) : '?'; };
  const wrap = portalSheet('<div id="slot-body"></div>');
  let editing = null, replacing = null;                          // (the row whose hours are being changed by hand; the row whose person is being replaced)
  const timeOpts = sel => Array.from({ length:48 }, (_, i) => { const v = String(Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00'); return `<option value="${v}"${v === sel ? ' selected' : ''}>${v}</option>`; }).join('');
  const draw = () => {
    if(!wrap.isConnected) return;                                   // (the sheet was closed while the data was reloading)
    const rows = rowsHere(), people = portalLoad().instructors.filter(p => p.active && p.role === 'instructor' && !rows.some(r => r.staff === p.id));
    // what each of them wrote for THIS shift: yes (green), can (yellow), not marked (blue), no / away (red); the list is ordered the same way
    const mprefs = portalMonth(monthKeyOf(date)).prefs || {}, LV = { yes:['yes', 'כן'], avoid:['can', 'יכול'], none:['none', 'לא סומן'], no:['no', 'לא'] }, RANK = { yes:0, avoid:1, none:2, no:3 };
    const levelFor = id => { const pr = mprefs[id] || { slots:{}, absent:[], fixed:[] }; if((pr.absent || []).includes(date) || (pr.fixed || []).some(f => f.day === date)) return 'no'; return (pr.slots || {})[key] || 'none'; };
    const prio = id => (((portalLoad().priv || {})[id] || {}).leader_priority) ?? 999;
    const rankOf = list => list.map((p, i) => ({ p, lv:levelFor(p.id), i })).sort((a, b) => RANK[a.lv] - RANK[b.lv] || prio(a.p.id) - prio(b.p.id) || a.i - b.i);          // (green first, then by the priority list)
    const ranked = rankOf(people);
    const warn = srvShiftWarnings(date, code, rows);
    wrap.querySelector('#slot-body').innerHTML = `<h2>${dayLabel(date)} · ${pEsc(sh.label)} ${rangeHtml(sh.start, sh.end)}</h2>
      ${warn.length ? `<div class="pwarn">${warn.map(w => `<div>⚠ ${pEsc(w)}</div>`).join('')}</div>` : ''}
      <div class="pedit-list">${rows.length ? rows.map(r => r.id === editing
        ? `<div class="pedit-row editing"><span>${pEsc(nm(r.staff))}</span><span class="phours-edit"><select data-hfrom aria-label="משעה">${timeOpts((r.from || sh.start).slice(0, 5))}</select><span>עד</span><select data-hto aria-label="עד שעה">${timeOpts((r.to || sh.end).slice(0, 5))}</select></span><span class="pedit-btns"><button type="button" class="btn small" data-hsave="${r.id}">שמירה</button><button type="button" class="btn ghost small" data-hcancel>ביטול</button></span></div><div id="hrs-warn" class="pwarn" aria-live="polite"></div>`
        : `<div class="pedit-row"><span>${pEsc(nm(r.staff))}</span><em>${r.from && r.to ? rangeHtml(r.from, r.to) : ''}${(r.flags || []).map(f => SRV_FLAG_WORD[f]).filter(Boolean).map(w => ' · ' + w).join('')}</em><span class="pedit-btns"><button type="button" class="btn ghost small" data-hrs="${r.id}">שינוי שעות</button><button type="button" class="btn ghost small" data-repl="${r.id}">החלפה</button><button type="button" class="btn ghost small" data-rm="${r.id}">הסרה</button></span></div>${replacing === r.id ? `<div class="cs-pick-list cs-repl-list" role="listbox"><div class="cs-pick-head"><span class="cs-pick-title">במקום ${pEsc(nm(r.staff))}:</span><span class="cs-pick-key">${mcalKeyChips()}</span></div>${ranked.map(({ p, lv }) => `<div class="cs-pick-row"><button type="button" class="cs-pick-item opt-${LV[lv][0]}" role="option" data-repl-to="${p.id}">${pEsc(instrName(p, portalLoad().instructors))}</button>${lv === 'no' || lv === 'none' ? waButtonHtml(p.id, key) : ''}</div>`).join('') || '<div class="pnote">אין מדריך פנוי.</div>'}<button type="button" class="btn ghost small" data-repl-cancel>ביטול</button></div>` : ''}`).join('') : '<div class="pnote">אין עדיין מדריכים במשמרת הזו.</div>'}</div>
      ${others().length ? `<div class="pnote">בנות שירות ומורות במשמרת: ${others().map(r => pEsc(nm(r.staff)) + ' ' + (r.from || '') + '–' + (r.to || '')).join(', ')}</div>` : ''}
      <h3 class="psec">הוספה</h3>
      <div class="phours-row"><div class="cs-pick">
        <select id="add-who" hidden aria-label="מי">${'<option value="">בחרו מדריך/ה</option>' + ranked.map(({ p, lv }) => `<option value="${p.id}" class="opt-${LV[lv][0]}">${pEsc(instrName(p, portalLoad().instructors))}</option>`).join('')}</select>
        <button type="button" class="cs-pick-btn" id="cs-pick-btn" aria-haspopup="listbox" aria-expanded="false"><span>בחרו מדריך/ה</span><i aria-hidden="true">⌄</i></button>
        <div class="cs-pick-list" id="cs-pick-list" role="listbox" hidden>
          <div class="cs-pick-head"><span class="cs-pick-title">בחרו מדריך/ה</span><span class="cs-pick-key">${mcalKeyChips()}</span></div>
          ${ranked.map(({ p, lv }) => `<div class="cs-pick-row"><button type="button" class="cs-pick-item opt-${LV[lv][0]}" role="option" data-val="${p.id}">${pEsc(instrName(p, portalLoad().instructors))}</button>${lv === 'no' || lv === 'none' ? waButtonHtml(p.id, key) : ''}</div>`).join('')}
        </div></div></div>
      <div class="phours-row"><select id="add-from" aria-label="משעה">${Array.from({ length:24 }, (_, h) => `<option value="${String(h).padStart(2, '0')}:00"${String(h).padStart(2, '0') + ':00' === sh.start ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select><span>עד</span><select id="add-to" aria-label="עד שעה">${Array.from({ length:24 }, (_, h) => `<option value="${String(h).padStart(2, '0')}:00"${String(h).padStart(2, '0') + ':00' === sh.end ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></div>
      <div id="add-warn" class="pwarn" aria-live="polite"></div>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>סגירה</button><button type="button" class="btn" id="add-go">הוספה</button></div>`;
    const who = wrap.querySelector('#add-who'), from = wrap.querySelector('#add-from'), to = wrap.querySelector('#add-to'), aw = wrap.querySelector('#add-warn');
    const upd = () => { const w = who.value ? srvWarnings(who.value, date, code, from.value, to.value) : []; aw.innerHTML = w.map(x => `<div>⚠ ${pEsc(x)}</div>`).join(''); };
    const pickBtn = wrap.querySelector('#cs-pick-btn'), pickList = wrap.querySelector('#cs-pick-list');
    const tint = () => { const o = who.selectedOptions[0]; pickBtn.className = 'cs-pick-btn' + (o && o.className ? ' sel-' + o.className.replace('opt-', '') : ''); pickBtn.firstElementChild.textContent = o ? o.textContent : 'בחרו מדריך/ה'; };          // (the closed button shows the chosen name in the same colour)
    pickBtn.addEventListener('click', e => { e.stopPropagation(); pickList.hidden = !pickList.hidden; pickBtn.setAttribute('aria-expanded', String(!pickList.hidden)); });
    pickList.querySelectorAll('.cs-pick-item').forEach(it => it.addEventListener('click', e => { e.stopPropagation(); who.value = it.dataset.val; pickList.hidden = true; pickBtn.setAttribute('aria-expanded', 'false'); who.dispatchEvent(new Event('change')); }));
    wrap.addEventListener('click', e => { if(!e.target.closest('.cs-pick')){ pickList.hidden = true; pickBtn.setAttribute('aria-expanded', 'false'); } });
    who.addEventListener('change', () => { tint(); upd(); }); from.addEventListener('change', upd); to.addEventListener('change', upd);
    wrap.querySelector('#add-go').addEventListener('click', async () => {
      if(!who.value){ toast('בחרו מדריך/ה'); return; }
      if(!(await srvAskBeforePlacing(who.value, key))) return;
      const w = srvWarnings(who.value, date, code, from.value, to.value);
      if(w.length && !(await confirmSheet({ title:'לשבץ למרות האזהרות?', text:w.join('. ') + '.', okLabel:'כן, לשבץ', cancelLabel:'חזרה', danger:true }))) return;
      const std = SRV_STD[code]; const flags = ['manual'];
      const ins = await sbPersonal.from('assignment').insert({ month:firstOf(mk), staff_id:who.value, day:date, shift:code, from_time:from.value, to_time:to.value, flags });
      if(ins.error){ toast('השיבוץ נכשל'); return; }
      await srvReloadSafe(); await srvLoadCoord(); draw(); srvRenderCoordSchedule(body);
    });
    wrap.querySelectorAll('[data-hrs]').forEach(b => b.addEventListener('click', () => { editing = b.dataset.hrs; draw(); }));
    wrap.querySelectorAll('[data-hcancel]').forEach(b => b.addEventListener('click', () => { editing = null; draw(); }));
    const hf = wrap.querySelector('[data-hfrom]'), ht = wrap.querySelector('[data-hto]');
    if(hf && ht){                                                    // the warnings of the new hours are shown while she chooses (she may still go ahead)
      const row = portalLoad().rows.find(x => x.id === editing), hw = wrap.querySelector('#hrs-warn');
      const upd = () => { const w = row ? srvWarnings(row.staff, date, code, hf.value, ht.value, row.id) : []; if(hw) hw.innerHTML = w.map(x => `<div>⚠ ${pEsc(x)}</div>`).join(''); };
      hf.addEventListener('change', upd); ht.addEventListener('change', upd); upd();
    }
    wrap.querySelectorAll('[data-hsave]').forEach(b => b.addEventListener('click', async () => {
      const row = portalLoad().rows.find(x => x.id === b.dataset.hsave); if(!row) return;
      const from = hf.value, to = ht.value;
      if(from === to){ toast('בדקו את השעות'); return; }
      const w = srvWarnings(row.staff, date, code, from, to, row.id);
      if(w.length && !(await confirmSheet({ title:'לשנות את השעות למרות האזהרות?', text:w.join('. ') + '.', okLabel:'כן, לשנות', cancelLabel:'חזרה', danger:true }))) return;
      const flags = Array.from(new Set((row.flags || []).concat('manual')));
      const u = await sbPersonal.from('assignment').update({ from_time:from, to_time:to, flags }).eq('id', row.id);
      if(u.error){ toast('השינוי נכשל'); return; }
      row.from = from; row.to = to; row.flags = flags; editing = null; draw(); toast('השעות עודכנו. מי שנוגע בעניין קיבל עדכון.');          // (the row is shown at once with its new hours; the reload follows)
      await srvReloadSafe(); await srvLoadCoord(); draw(); srvRenderCoordSchedule(body);
    }));
    wrap.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
      const r = portalLoad().rows.find(x => x.id === b.dataset.rm); if(!r) return;
      const after = portalLoad().rows.filter(x => x.id !== r.id);
      const w = srvShiftWarnings(date, code, after);
      if(w.length && !(await confirmSheet({ title:'להסיר למרות האזהרות?', text:w.join('. ') + '.', okLabel:'כן, להסיר', cancelLabel:'חזרה', danger:true }))) return;
      b.disabled = true;
      const d = await sbPersonal.from('assignment').delete().eq('id', r.id);
      if(d.error){ b.disabled = false; toast('ההסרה נכשלה'); return; }
      srvDropRow(portalLoad(), r.id); draw(); srvRenderCoordSchedule(body); toast(`${nm(r.staff)} הוסר/ה מהמשמרת. מי שנוגע בעניין קיבל עדכון.`);
      srvReloadSafe().then(() => srvLoadCoord()).then(() => { draw(); if(body.isConnected) srvRenderCoordSchedule(body); }).catch(() => {});
    }));
    // replacing: another instructor takes this row (the same hours); the list is ordered by her wish for this shift, then by the priority list
    wrap.querySelectorAll('[data-repl]').forEach(b => b.addEventListener('click', () => { replacing = replacing === b.dataset.repl ? null : b.dataset.repl; editing = null; draw(); }));
    wrap.querySelectorAll('[data-repl-cancel]').forEach(b => b.addEventListener('click', () => { replacing = null; draw(); }));
    wrap.querySelectorAll('[data-repl-to]').forEach(b => b.addEventListener('click', async () => {
      const r = portalLoad().rows.find(x => x.id === replacing); if(!r) return;
      const nw = b.dataset.replTo, from = r.from || sh.start, to = r.to || sh.end;
      if(!(await srvAskBeforePlacing(nw, key))) return;
      const w = srvWarnings(nw, date, code, from, to, r.id);
      if(w.length && !(await confirmSheet({ title:'להחליף למרות האזהרות?', text:w.join('. ') + '.', okLabel:'כן, להחליף', cancelLabel:'חזרה', danger:true }))) return;
      const flags = Array.from(new Set((r.flags || []).concat('manual')));
      const u = await sbPersonal.from('assignment').update({ staff_id:nw, flags }).eq('id', r.id);
      if(u.error){ toast('ההחלפה נכשלה'); return; }
      const st2 = portalLoad(), was = nm(r.staff);
      srvDropRow(st2, r.id); srvAddRow(st2, { id:r.id, staff_id:nw, day:r.day, shift:r.shift, from_time:r.from, to_time:r.to, flags });
      replacing = null; draw(); srvRenderCoordSchedule(body); toast(`${nm(nw)} במקום ${was}. מי שנוגע בעניין קיבל עדכון.`);
      srvReloadSafe().then(() => srvLoadCoord()).then(() => { draw(); if(body.isConnected) srvRenderCoordSchedule(body); }).catch(() => {});
    }));
    { const rl = wrap.querySelector('.cs-repl-list'); if(rl) rl.scrollIntoView({ block:'nearest' }); }          // (the opened list is shown, not left below the fold)
  };
  draw();
}


// ---------------------------------------------------------------- the panel at the side of the schedule: the instructors, and (after a tap on a name) her requests for the month that is shown
function srvPersonRequestsHtml(p, mk){
  const st = portalLoad(), m = portalMonth(mk), pr = (m.prefs[p.id] || { slots:{}, absent:[], hours:{}, fixed:[], pick:[], consent:{ extend:null, pull:null } });
  const shiftWord = id => ({ m:'בוקר', e:'צהריים', n:'לילה', l:'סופ"ש ארוך' })[id] || id;
  const by = { no:[], avoid:[], yes:[] };
  Object.keys(pr.slots || {}).sort().forEach(k => { const [d, id] = k.split('|'); if(by[pr.slots[k]] && daysOfMonth(mk).includes(d)) by[pr.slots[k]].push(`${shortDate(d)} ${shiftWord(id)}`); });
  const mine = st.rows.filter(r => r.staff === p.id && monthKeyOf(r.day) === mk);
  const counts = { yes:0, avoid:0, no:0, none:0 };
  mine.forEach(r => { const id = SRV_SHIFT_UI[r.shift === 'S' ? 'M' : r.shift]; if(!id) return; const lv = (pr.slots || {})[`${r.day}|${id}`]; counts[lv === 'avoid' ? 'avoid' : lv === 'no' ? 'no' : lv === 'yes' ? 'yes' : 'none']++; });
  const line = (cls, title, list) => `<div class="cs-req ${cls}"><b>${title}${list.length ? ` (${list.length})` : ''}</b><span>${list.length ? list.map(pEsc).join(' · ') : 'אין'}</span></div>`;
  const note = m.notes && m.notes[p.id], goal = (m.goals || {})[p.id], cons = pr.consent || {};
  const GOAL = { min:'רק את המינימום', max:'כמה שיותר', weekly45:'4-5 משמרות בשבוע' };
  const fixed = (pr.fixed || []).filter(f => daysOfMonth(mk).includes(f.day));
  return `<div class="cs-person">
    <div class="cs-person-head"><img src="${p.photo}" alt=""><div><b>${pEsc(instrName(p, st.instructors))}</b><small>${m.submitted[p.id] ? 'הגיש/ה ✓' : 'עוד לא הגיש/ה'} · ${monthLabel(mk)}</small></div></div>
    ${mine.length ? `<div class="cs-req"><b>שובצו ${mine.length} משמרות</b><span><span class="mcal-name wish-yes">כן ${counts.yes}</span> <span class="mcal-name wish-can">יכול ${counts.avoid}</span> <span class="mcal-name wish-no">לא ${counts.no}</span> <span class="mcal-name wish-none">לא סומן ${counts.none}</span></span></div>` : ''}
    ${line('no', 'לא', by.no)}${line('can', 'יכול', by.avoid)}${line('yes', 'כן', by.yes)}
    ${fixed.length ? `<div class="cs-req"><b>היעדרות</b><span>${[...new Set(fixed.map(f => FIXED_REASON[f.reason] || 'היעדרות'))].join(', ') + ': ' + dayRanges(fixed.map(f => f.day))}</span></div>` : ''}
    ${Object.keys(pr.hours || {}).length ? `<div class="cs-req"><b>שעות אחרות</b><span>${Object.keys(pr.hours).sort().map(d => `${shortDate(d)} ${pr.hours[d].map(([a, b]) => a + '–' + b).join(', ')}`).join(' · ')}</span></div>` : ''}
    ${(pr.pick || []).length ? `<div class="cs-req"><b>רק אחד מסופי השבוע</b><span>${pr.pick.map(shortDate).join(' · ')}</span></div>` : ''}
    <div class="cs-req"><b>הארכה עד 16:00</b><span>${cons.extend === true ? 'מסכים/ה' : cons.extend === false ? 'לא' : 'לא ענה/תה'}</span></div>
    <div class="cs-req"><b>משיכה משבת לילה עד 11:00</b><span>${cons.pull === true ? 'מסכים/ה' : cons.pull === false ? 'לא' : 'לא ענה/תה'}</span></div>
    ${goal ? `<div class="cs-req"><b>יעד</b><span>${GOAL[goal] || goal}</span></div>` : ''}
    ${note ? `<div class="cs-req"><b>הערה</b><span>${pEsc(note)}</span></div>` : ''}
  </div>`;
}
function srvSidePanelHtml(mk){
  const st = portalLoad(), m = portalMonth(mk), people = st.instructors.filter(p => p.active && p.role === 'instructor'), sel = people.find(p => p.id === portalUi.csPerson);
  if(!portalUi.csOpen) return `<button type="button" class="cs-tab" id="cs-open" aria-expanded="false"><span class="cs-tab-text">בקשות המדריכים</span>${mcalKeyHtml('tab')}</button>`;          // (folded: a slim tab, with the colour key as plain coloured words under the text)          // (folded: a slim tab at the left of the schedule)
  return `<aside class="cs-side" aria-label="בקשות המדריכים">
    <div class="cs-side-top"><h3 class="cs-side-title">בקשות המדריכים</h3>${sel ? '' : mcalKeyHtml(true)}<button type="button" class="cs-close" id="cs-close" aria-label="קיפול">✕</button></div>
    <div class="cs-names">${people.map(p => `<button type="button" class="cs-name${sel && sel.id === p.id ? ' on' : ''}${m.submitted[p.id] ? '' : ' missing'}" data-cs-person="${p.id}" title="${m.submitted[p.id] ? 'הגיש/ה' : 'עוד לא הגיש/ה'}"><img src="${p.photo}" alt=""><span>${pEsc(instrName(p, st.instructors))}</span></button>`).join('')}</div>
    ${sel ? srvPersonRequestsHtml(sel, mk) : '<div class="pnote">לחיצה על שם מציגה את הבקשות שלו/ה לחודש שמוצג, ומסמנת את השמות שלו/ה בסידור.</div>'}
  </aside>`;
}


// while a name is dragged, the shift under it is coloured by what that instructor wrote for it: yes = green, can = yellow, no (or away) = red, not marked = blue
let srvDragWho = null, srvRenderAfterDrag = null;
// what this instructor wrote for this shift (key = 'date|m/e/n'): yes / can / no (also when she is away that day) / none
function srvWishFor(staffId, key){
  const date = splitKey(key).date, pr = (portalMonth(monthKeyOf(date)).prefs || {})[staffId] || { slots:{}, absent:[], fixed:[] };
  if((pr.absent || []).includes(date) || (pr.fixed || []).some(f => f.day === date)) return 'no';
  const lv = (pr.slots || {})[key];
  if(!lv && /\|n$/.test(key) && ((portalLoad().priv || {})[staffId] || {}).no_nights) return 'no';          // (somebody who does not do nights: a night she did not mark counts as "no")
  if(!lv && ((portalLoad().fixedNo || {})[staffId] || []).includes(key.split('|')[1])) return 'no';          // (her fixed preferences: "does not do mornings / afternoons / nights")
  return lv === 'yes' ? 'yes' : lv === 'avoid' ? 'can' : lv === 'no' ? 'no' : 'none';
}
const srvDropLevel = cell => srvDragWho ? srvWishFor(srvDragWho, cell.dataset.key) : 'none';
function srvDropShow(cell){ const c = 'drop-' + srvDropLevel(cell); if(!cell.classList.contains(c)){ srvDropClear(cell); cell.classList.add('drop-ok', c); } }
function srvDropClear(cell){ cell.classList.remove('drop-ok', 'drop-yes', 'drop-can', 'drop-no', 'drop-none'); }

// put an instructor on a shift (a name dragged from the panel and dropped on the shift): the warnings are shown first, and the coordinator may go ahead anyway
async function srvAddToSlot(mk, key, staffId, body){
  const st = portalLoad(), { date, shiftId } = splitKey(key), code = SRV_SHIFT_DB[shiftId], sh = st.shiftTypes.find(x => x.id === shiftId), person = st.instructors.find(p => p.id === staffId);
  if(!person || person.role !== 'instructor' || !sh) return;
  const nm = instrName(person, st.instructors);
  if(st.rows.some(r => r.staff === staffId && r.day === date && (r.shift === code || (code === 'M' && r.shift === 'S')))){ toast(`${nm} כבר במשמרת הזו`); return; }
  const w = srvWarnings(staffId, date, code, sh.start, sh.end);
  // no question for "yes" or "can"; for "no" and for a shift she did not mark: ask her first on WhatsApp, or place anyway
  if(!(await srvAskBeforePlacing(staffId, key))) return;
  const ins = await sbPersonal.from('assignment').insert({ month:firstOf(monthKeyOf(date)), staff_id:staffId, day:date, shift:code, from_time:sh.start, to_time:sh.end, flags:['manual'] }).select('id,staff_id,day,shift,from_time,to_time,flags').single();
  if(ins.error){ toast('השיבוץ נכשל'); return; }
  srvAddRow(st, ins.data); srvRenderCoordSchedule(body);              // (it shows at once; the full reload follows in the background)
  toast(w.length ? `${nm} שובץ/ה. שימי לב: ${w.join('. ')}.` : `${nm} שובץ/ה. מי שנוגע בעניין קיבל עדכון.`, w.length ? 6000 : 0);          // (the warnings that are left, such as rest, do not stop her; she sees them)
  srvReloadSafe().then(() => srvLoadCoord()).then(() => { if(body.isConnected && portalServerOn) srvRenderCoordSchedule(body); }).catch(() => {});
}

// ---------------------------------------------------------------- WhatsApp: asking an instructor before placing her in a shift she marked "no" or did not mark
const WA_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z"/></svg>';
// the person's phone as WhatsApp wants it: 054-1234567 -> 972541234567
function waNumber(staffId){
  const raw = String(((portalLoad().priv || {})[staffId] || {}).phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if(!raw) return null;
  return raw.startsWith('972') ? raw : raw.startsWith('0') ? '972' + raw.slice(1) : raw.length >= 9 ? '972' + raw : null;
}
// the ready messages: one for "no" and one for "not marked", each for a man and for a woman; the coordinator edits them in the settings (sched_settings "wa_messages")
const WA_DEFAULT = {
  no:   { f:'היי, ראיתי שסימנת "לא" ל{משמרת} ב{יום} ({שעות}). יש לנו חוסר, יש מצב שבכל זאת תוכלי להגיע?',
          m:'היי, ראיתי שסימנת "לא" ל{משמרת} ב{יום} ({שעות}). יש לנו חוסר, יש מצב שבכל זאת תוכל להגיע?' },
  none: { f:'היי, יש לנו חוסר ב{משמרת} ב{יום} ({שעות}), ולא סימנת את המשמרת הזו. יש מצב שתוכלי להגיע?',
          m:'היי, יש לנו חוסר ב{משמרת} ב{יום} ({שעות}), ולא סימנת את המשמרת הזו. יש מצב שתוכל להגיע?' }
};
const waTemplate = (kind, female) => { const own = ((portalLoad().waMsg || {})[kind] || {})[female ? 'f' : 'm']; return (own && String(own).trim()) || WA_DEFAULT[kind][female ? 'f' : 'm']; };
// a ready message about this very shift (she can still change it in WhatsApp before sending)
function waText(staffId, key){
  const st = portalLoad(), { date, shiftId } = splitKey(key), sh = st.shiftTypes.find(x => x.id === shiftId) || {}, p = st.instructors.find(x => x.id === staffId) || {};
  const female = ((st.priv || {})[staffId] || {}).female !== false, kind = srvWishFor(staffId, key) === 'no' ? 'no' : 'none';
  return waTemplate(kind, female).replace(/\{שם\}/g, String(p.first || '').split(' ')[0]).replace(/\{משמרת\}/g, `משמרת ה${sh.label || ''}`)
    .replace(/\{יום\}/g, `יום ${dayLabel(date)}`).replace(/\{שעות\}/g, `${sh.start || ''}–${sh.end || ''}`);
}
function waLink(staffId, key){ const num = waNumber(staffId); return num ? `https://wa.me/${num}?text=${encodeURIComponent(waText(staffId, key))}` : null; }
const waButtonHtml = (staffId, key) => { const url = waLink(staffId, key); return url ? `<a class="wa-btn" href="${url}" target="_blank" rel="noopener" title="שאלה בוואטסאפ" aria-label="שאלה בוואטסאפ">${WA_SVG}</a>` : ''; };
// before placing somebody who marked "no" or did not mark this shift: WhatsApp first, place anyway, or back. -> true = place
function srvAskBeforePlacing(staffId, key){
  const lv = srvWishFor(staffId, key);
  if(lv === 'yes' || lv === 'can') return Promise.resolve(true);
  const st = portalLoad(), { date, shiftId } = splitKey(key), sh = st.shiftTypes.find(x => x.id === shiftId) || {}, p = st.instructors.find(x => x.id === staffId), nm = p ? instrName(p, st.instructors) : '';
  const url = waLink(staffId, key);
  return new Promise(resolve => {
    let done = false; const finish = v => { if(done) return; done = true; sh2.close(); resolve(v); };
    const sh2 = portalSheet(`<h2>${pEsc(nm)} ${lv === 'no' ? 'סימן/ה "לא" למשמרת הזו' : 'לא סימן/ה את המשמרת הזו'}</h2>
      <div class="pnote">${dayLabel(date)} · ${pEsc(sh.label || '')} ${sh.start || ''}–${sh.end || ''}. כדאי לשאול לפני שמשבצים.</div>
      <div class="wa-ask">${url ? `<a class="btn wa-go" id="wa-go" href="${url}" target="_blank" rel="noopener">${WA_SVG}<span>לשאול בוואטסאפ</span></a>` : '<div class="pnote">אין מספר טלפון. אפשר להוסיף אותו בהגדרות, ליד המייל.</div>'}
        <button type="button" class="btn ghost" id="wa-place">לשבץ בכל זאת</button>
        <button type="button" class="btn ghost" id="wa-back">חזרה</button></div>`);
    const go = sh2.querySelector('#wa-go'); if(go) go.addEventListener('click', () => { toast('נפתחה שיחה בוואטסאפ. אחרי התשובה אפשר לשבץ.'); finish(false); });
    sh2.querySelector('#wa-place').addEventListener('click', () => finish(true));
    sh2.querySelector('#wa-back').addEventListener('click', () => finish(false));
    sh2.addEventListener('click', e => { if(e.target === sh2) finish(false); });
  });
}
