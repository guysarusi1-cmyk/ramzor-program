
// ---------- THE PORTAL ON THE SERVER: the coordinator's schedule (the board, editing a shift, publishing, what needs her attention) ----------
// The schedule is built by the system once a month (the 25th, at night). From then on the coordinator edits it by hand; there is no "build" button.
const SRV_STATUS_WORD = { collecting:'בהגשת העדפות', draft:'טיוטה', sent:'נשלח אלייך', published:'פורסם' };
const SRV_FLAG_KIND = { ahmash:'אחמ"שית', night:'לילה', staffing:'איוש', composition:'הרכב', min:'מינימום אישי', pair:'שילוב', rest:'מנוחה', extension:'הארכה', from16:'מ-16:00', pull:'משיכה', double:'כפולה', partial:'שעות מותאמות', can:'"יכול"', ahmash2:'אחמ"שית שנייה', service:'בנות שירות', service_absent:'היעדרות בת שירות', vacation_conflict:'חופשה' };

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
  const [priv, flags, vac] = await Promise.all([
    srvAll(() => sbPersonal.from('staff_private').select('staff_id,email,female,is_leader,ahmash_rank,leader_priority,no_nights,manual_only,only_long_weekend,latest_end_hour,auth_user_id')),
    srvAll(() => sbPersonal.from('coordinator_flags').select('id,month,day,kind,text,staff_id,resolved').eq('resolved', false).order('day', { nullsFirst:true })),
    srvAll(() => sbPersonal.from('vacation_requests').select('id,staff_id,from_day,to_day,note,status,created_at').order('created_at', { ascending:false }).limit(60))
  ]);
  st.priv = {}; priv.forEach(r => { st.priv[r.staff_id] = r; });
  st.voices = {}; try { const sv = await sbPersonal.from('staff_settings').select('staff_id,voice'); (sv.data || []).forEach(r => { if(r.voice) st.voices[r.staff_id] = r.voice; }); } catch(e){}          // (each person's chosen voice, so that her feedback is written in it)
  st.flags = flags; st.vacations = vac;
}

// ---- the screen
function srvDefaultCoordMonth(){
  const st = portalLoad(), cur = monthKeyOf(srvToday()), next = addMonths(cur, 1);
  return st.months[next] && st.months[next].status ? next : (st.months[cur] && st.months[cur].status ? cur : next);
}
function srvRenderCoordSchedule(body){
  if(!body.isConnected) return;                                   // (a screen that finished loading after the person left it must not draw)
  const st = portalLoad(), mk = portalUi.month || (portalUi.month = srvDefaultCoordMonth()), m = portalMonth(mk), ctx = portalCtx(mk);
  const flags = (st.flags || []).filter(f => f.month && f.month.slice(0, 7) === mk), has = !!m.status;
  const needLook = flags.filter(f => !['service_absent', 'service'].includes(f.kind)), info = flags.filter(f => ['service_absent', 'service'].includes(f.kind));
  const people = id => (st.instructors.find(p => p.id === id) || {}).first || '';
  body.innerHTML = `
    ${monthNavHtml(mk, `<span class="pchip ${m.published ? 'lv-yes' : 'lv-avoid'}">${has ? SRV_STATUS_WORD[m.status] : 'אין סידור'}</span>`)}
    ${has ? '' : '<div class="pnote">עוד אין סידור לחודש הזה. המערכת בונה אותו אוטומטית פעם אחת: טיוטה ב-24 בחודש ב-23:00, והסידור הסופי בלילה שבין ה-24 ל-25 (בין חצות ל-06:00), והוא נשלח אלייך. מכאן אפשר לערוך אותו ידנית.</div>'}
    ${has ? `<div class="pactions">
      <button type="button" class="btn" id="cs-publish"${m.published ? ' disabled' : ''}>${m.published ? 'הסידור פורסם' : 'פרסום הסידור'}</button>
      <button type="button" class="btn ghost" id="cs-xlsx">ייצוא לאקסל</button>
      <button type="button" class="btn ghost" id="cs-print">הדפסה / PDF</button>
    </div>
    ${m.published ? '<div class="pnote">הסידור פורסם. כל שינוי בו שולח הודעה ומייל למי שהושפע ולכל מי שנמצא באותה משמרת.</div>' : '<div class="pnote">הסידור עוד לא נראה למדריכים. אחרי הפרסום הם יראו אותו, ויקבלו מייל על כל שינוי.</div>'}
    ${needLook.length ? `<details class="pissues" open><summary>${needLook.length} דברים שדורשים תשומת לב</summary>${needLook.map(f => `<div class="pflag"><span><b>${SRV_FLAG_KIND[f.kind] || f.kind}</b> · ${pEsc(f.text)}</span><button type="button" class="btn ghost small" data-flag-done="${f.id}">טופל</button></div>`).join('')}</details>` : '<div class="pstatus ok">אין דברים שדורשים תשומת לב ✓</div>'}
    ${info.length ? `<details class="pissues"><summary>${info.length} הודעות על בנות שירות</summary>${info.map(f => `<div class="pflag"><span>${pEsc(f.text)}</span></div>`).join('')}</details>` : ''}
    <div class="pnote">לחיצה על משמרת בטבלה פותחת עריכה. בנות שירות ומורות מופיעות ברשימת המשמרות בעריכה, ולא בטבלה.</div>
    ${boardHtml(ctx, m.assignments, { edit:true, colour:true })}` : ''}`;
  wireMonthNav(body);
  if(!has) return;
  body.querySelectorAll('td.editable').forEach(td => {
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
    if(!(await confirmSheet({ title:'לפרסם את הסידור?', text:`מרגע הפרסום כל המדריכים רואים אותו, וכל אחד מקבל הודעה אישית על איך הלכו הבקשות שלו${open ? ` (עדיין יש ${open} דברים שדורשים תשומת לב)` : ''}. כל שינוי אחר כך שולח הודעה ומייל למי שהושפע.`, okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
    const u = await sbPersonal.from('schedule').update({ status:'published', published_at:new Date().toISOString() }).eq('month', firstOf(mk));
    if(u.error){ toast('הפרסום נכשל. נסו שוב.'); return; }
    await srvReloadSafe();
    const sent = await srvSendFeedback(mk).catch(() => ({ ok:0, failed:1 }));              // every instructor gets a personal, warm message about how the requests went
    toast(sent.ok ? `הסידור פורסם, וכל מדריך/ה קיבל/ה הודעה אישית על איך הלכו הבקשות` : 'הסידור פורסם. ההודעות האישיות על הבקשות עוד לא נשלחו, נטפל בזה'); srvRenderCoordSchedule(body);
  });
  document.getElementById('cs-xlsx').addEventListener('click', () => { downloadScheduleXlsx(ctx, m.assignments); toast('קובץ האקסל נוצר'); });
  document.getElementById('cs-print').addEventListener('click', () => printSchedule(ctx, m.assignments));
}

// ---- edit one shift: who is on it (with hours), remove, add (with warnings; the coordinator may override them)
function srvOpenSlot(mk, key, body){
  const st = portalLoad(), { date, shiftId } = splitKey(key), code = SRV_SHIFT_DB[shiftId], sh = st.shiftTypes.find(x => x.id === shiftId);
  const rowsHere = () => portalLoad().rows.filter(r => r.day === date && (r.shift === code || (code === 'M' && r.shift === 'S')) && ((portalLoad().instructors.find(x => x.id === r.staff) || {}).role === 'instructor'));
  const others = () => portalLoad().rows.filter(r => r.day === date && (r.shift === code || (code === 'M' && r.shift === 'S')) && ((portalLoad().instructors.find(x => x.id === r.staff) || {}).role !== 'instructor'));
  const nm = id => { const p = portalPerson(id); return p ? instrName(p, portalLoad().instructors) : '?'; };
  const wrap = portalSheet('<div id="slot-body"></div>');
  const draw = () => {
    if(!wrap.isConnected) return;                                   // (the sheet was closed while the data was reloading)
    const rows = rowsHere(), people = portalLoad().instructors.filter(p => p.active && p.role === 'instructor' && !rows.some(r => r.staff === p.id));
    const warn = srvShiftWarnings(date, code, rows);
    wrap.querySelector('#slot-body').innerHTML = `<h2>${dayLabel(date)} · ${pEsc(sh.label)} ${rangeHtml(sh.start, sh.end)}</h2>
      ${warn.length ? `<div class="pwarn">${warn.map(w => `<div>⚠ ${pEsc(w)}</div>`).join('')}</div>` : ''}
      <div class="pedit-list">${rows.length ? rows.map(r => `<div class="pedit-row"><span>${pEsc(nm(r.staff))}</span><em>${r.from && r.to ? rangeHtml(r.from, r.to) : ''}${(r.flags || []).map(f => SRV_FLAG_WORD[f]).filter(Boolean).map(w => ' · ' + w).join('')}</em><button type="button" class="btn ghost small" data-rm="${r.id}">הסרה</button></div>`).join('') : '<div class="pnote">אין עדיין מדריכים במשמרת הזו.</div>'}</div>
      ${others().length ? `<div class="pnote">בנות שירות ומורות במשמרת: ${others().map(r => pEsc(nm(r.staff)) + ' ' + (r.from || '') + '–' + (r.to || '')).join(', ')}</div>` : ''}
      <h3 class="psec">הוספה</h3>
      <div class="phours-row"><select id="add-who" aria-label="מי">${'<option value="">בחרו מדריך/ה</option>' + people.map(p => `<option value="${p.id}">${pEsc(instrName(p, portalLoad().instructors))}</option>`).join('')}</select></div>
      <div class="phours-row"><select id="add-from" aria-label="משעה">${Array.from({ length:24 }, (_, h) => `<option value="${String(h).padStart(2, '0')}:00"${String(h).padStart(2, '0') + ':00' === sh.start ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select><span>עד</span><select id="add-to" aria-label="עד שעה">${Array.from({ length:24 }, (_, h) => `<option value="${String(h).padStart(2, '0')}:00"${String(h).padStart(2, '0') + ':00' === sh.end ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></div>
      <div id="add-warn" class="pwarn" aria-live="polite"></div>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>סגירה</button><button type="button" class="btn" id="add-go">הוספה</button></div>`;
    const who = wrap.querySelector('#add-who'), from = wrap.querySelector('#add-from'), to = wrap.querySelector('#add-to'), aw = wrap.querySelector('#add-warn');
    const upd = () => { const w = who.value ? srvWarnings(who.value, date, code, from.value, to.value) : []; aw.innerHTML = w.map(x => `<div>⚠ ${pEsc(x)}</div>`).join(''); };
    who.addEventListener('change', upd); from.addEventListener('change', upd); to.addEventListener('change', upd);
    wrap.querySelector('#add-go').addEventListener('click', async () => {
      if(!who.value){ toast('בחרו מדריך/ה'); return; }
      const w = srvWarnings(who.value, date, code, from.value, to.value);
      if(w.length && !(await confirmSheet({ title:'לשבץ למרות האזהרות?', text:w.join('. ') + '.', okLabel:'כן, לשבץ', cancelLabel:'חזרה', danger:true }))) return;
      const std = SRV_STD[code]; const flags = ['manual'];
      const ins = await sbPersonal.from('assignment').insert({ month:firstOf(mk), staff_id:who.value, day:date, shift:code, from_time:from.value, to_time:to.value, flags });
      if(ins.error){ toast('השיבוץ נכשל'); return; }
      await srvReloadSafe(); await srvLoadCoord(); draw(); srvRenderCoordSchedule(body);
    });
    wrap.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
      const r = portalLoad().rows.find(x => x.id === b.dataset.rm); if(!r) return;
      const after = portalLoad().rows.filter(x => x.id !== r.id);
      const w = srvShiftWarnings(date, code, after);
      if(w.length && !(await confirmSheet({ title:'להסיר למרות האזהרות?', text:w.join('. ') + '.', okLabel:'כן, להסיר', cancelLabel:'חזרה', danger:true }))) return;
      const d = await sbPersonal.from('assignment').delete().eq('id', r.id);
      if(d.error){ toast('ההסרה נכשלה'); return; }
      await srvReloadSafe(); await srvLoadCoord(); draw(); srvRenderCoordSchedule(body);
    }));
  };
  draw();
}
