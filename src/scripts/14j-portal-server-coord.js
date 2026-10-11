
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
  st.reasons = {}; try { const sr = await sbPersonal.from('sick_reports').select('assignment_id,note').order('created_at'); (sr.data || []).forEach(x => { if(x.note) st.reasons[x.assignment_id] = x.note; }); } catch(e){}          // (the reason an instructor gave when she reported that she cannot come)
  st.openReqs = []; try { const r = await sbPersonal.from('open_shift_requests').select('id,staff_id,day,shift,created_at').eq('status', 'pending').order('created_at'); st.openReqs = r.error ? [] : (r.data || []); } catch(e){}          // (the requests to join an open shift; they come with scheduling-v11.sql)
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
    ${needLook.length ? `<details class="pissues"><summary>${needLook.length} דברים שדורשים תשומת לב</summary>${needLook.map(f => `<div class="pflag"><span><b>${SRV_FLAG_KIND[f.kind] || f.kind}</b> · ${pEsc(f.text)}</span><button type="button" class="btn ghost small" data-flag-done="${f.id}">טופל</button></div>`).join('')}</details>` : '<div class="pstatus ok">אין דברים שדורשים תשומת לב ✓</div>'}
    ${info.length ? `<details class="pissues"><summary>${info.length} הודעות על בנות שירות</summary>${info.map(f => `<div class="pflag"><span>${pEsc(f.text)}</span></div>`).join('')}</details>` : ''}
    <div class="pnote">לחיצה על משמרת בלוח פותחת עריכה. בנות שירות ומורות מופיעות ברשימת המשמרות בעריכה, ולא בלוח.</div>
    <div class="cs-layout"><div class="cs-main">${monthCalHtml(ctx, m.assignments, { edit:true, colour:true, ahmash:srv.ahmash, sel:portalUi.csOpen ? portalUi.csPerson : null })}</div>${srvSidePanelHtml(mk)}</div>` : ''}`;
  wireMonthNav(body);
  if(!has) return;
  const csOpen = document.getElementById('cs-open'), csClose = document.getElementById('cs-close');
  if(csOpen) csOpen.addEventListener('click', () => { portalUi.csOpen = true; srvRenderCoordSchedule(body); });
  if(csClose) csClose.addEventListener('click', () => { portalUi.csOpen = false; portalUi.csPerson = null; srvRenderCoordSchedule(body); });
  // drag a name from the panel into a shift of the schedule
  body.querySelectorAll('.cs-name[data-cs-person]').forEach(b => {
    b.setAttribute('draggable', 'true');
    b.addEventListener('dragstart', e => { srvDragWho = b.dataset.csPerson; e.dataTransfer.setData('text/plain', b.dataset.csPerson); e.dataTransfer.effectAllowed = 'copy'; b.classList.add('dragging'); });
    b.addEventListener('dragend', () => { srvDragWho = null; b.classList.remove('dragging'); body.querySelectorAll('.mcal-cell[class*="drop-"]').forEach(c => srvDropClear(c)); });
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

// ---- edit one shift: who is on it (with hours), remove, add (with warnings; the coordinator may override them)
// the colour key as small chips (for the list of instructors to add)
const mcalKeyChips = () => '<span class="mcal-name wish-yes">כן</span><span class="mcal-name wish-can">יכול</span><span class="mcal-name wish-no">לא</span><span class="mcal-name wish-none">לא סומן</span>';
function srvOpenSlot(mk, key, body){
  const st = portalLoad(), { date, shiftId } = splitKey(key), code = SRV_SHIFT_DB[shiftId], sh = st.shiftTypes.find(x => x.id === shiftId);
  const rowsHere = () => portalLoad().rows.filter(r => r.day === date && (r.shift === code || (code === 'M' && r.shift === 'S')) && ((portalLoad().instructors.find(x => x.id === r.staff) || {}).role === 'instructor'));
  const others = () => portalLoad().rows.filter(r => r.day === date && (r.shift === code || (code === 'M' && r.shift === 'S')) && ((portalLoad().instructors.find(x => x.id === r.staff) || {}).role !== 'instructor'));
  const nm = id => { const p = portalPerson(id); return p ? instrName(p, portalLoad().instructors) : '?'; };
  const wrap = portalSheet('<div id="slot-body"></div>');
  let editing = null;                                             // (the row whose hours are being changed by hand)
  const timeOpts = sel => Array.from({ length:48 }, (_, i) => { const v = String(Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00'); return `<option value="${v}"${v === sel ? ' selected' : ''}>${v}</option>`; }).join('');
  const draw = () => {
    if(!wrap.isConnected) return;                                   // (the sheet was closed while the data was reloading)
    const rows = rowsHere(), people = portalLoad().instructors.filter(p => p.active && p.role === 'instructor' && !rows.some(r => r.staff === p.id));
    // what each of them wrote for THIS shift: yes (green), can (yellow), not marked (blue), no / away (red); the list is ordered the same way
    const mprefs = portalMonth(monthKeyOf(date)).prefs || {}, LV = { yes:['yes', 'כן'], avoid:['can', 'יכול'], none:['none', 'לא סומן'], no:['no', 'לא'] }, RANK = { yes:0, avoid:1, none:2, no:3 };
    const levelFor = id => { const pr = mprefs[id] || { slots:{}, absent:[], fixed:[] }; if((pr.absent || []).includes(date) || (pr.fixed || []).some(f => f.day === date)) return 'no'; return (pr.slots || {})[key] || 'none'; };
    const ranked = people.map((p, i) => ({ p, lv:levelFor(p.id), i })).sort((a, b) => RANK[a.lv] - RANK[b.lv] || a.i - b.i);
    const warn = srvShiftWarnings(date, code, rows);
    wrap.querySelector('#slot-body').innerHTML = `<h2>${dayLabel(date)} · ${pEsc(sh.label)} ${rangeHtml(sh.start, sh.end)}</h2>
      ${warn.length ? `<div class="pwarn">${warn.map(w => `<div>⚠ ${pEsc(w)}</div>`).join('')}</div>` : ''}
      <div class="pedit-list">${rows.length ? rows.map(r => r.id === editing
        ? `<div class="pedit-row editing"><span>${pEsc(nm(r.staff))}</span><span class="phours-edit"><select data-hfrom aria-label="משעה">${timeOpts((r.from || sh.start).slice(0, 5))}</select><span>עד</span><select data-hto aria-label="עד שעה">${timeOpts((r.to || sh.end).slice(0, 5))}</select></span><span class="pedit-btns"><button type="button" class="btn small" data-hsave="${r.id}">שמירה</button><button type="button" class="btn ghost small" data-hcancel>ביטול</button></span></div><div id="hrs-warn" class="pwarn" aria-live="polite"></div>`
        : `<div class="pedit-row"><span>${pEsc(nm(r.staff))}</span><em>${r.from && r.to ? rangeHtml(r.from, r.to) : ''}${(r.flags || []).map(f => SRV_FLAG_WORD[f]).filter(Boolean).map(w => ' · ' + w).join('')}</em><span class="pedit-btns"><button type="button" class="btn ghost small" data-hrs="${r.id}">שינוי שעות</button><button type="button" class="btn ghost small" data-rm="${r.id}">הסרה</button></span></div>`).join('') : '<div class="pnote">אין עדיין מדריכים במשמרת הזו.</div>'}</div>
      ${others().length ? `<div class="pnote">בנות שירות ומורות במשמרת: ${others().map(r => pEsc(nm(r.staff)) + ' ' + (r.from || '') + '–' + (r.to || '')).join(', ')}</div>` : ''}
      <h3 class="psec">הוספה</h3>
      <div class="phours-row"><div class="cs-pick">
        <select id="add-who" hidden aria-label="מי">${'<option value="">בחרו מדריך/ה</option>' + ranked.map(({ p, lv }) => `<option value="${p.id}" class="opt-${LV[lv][0]}">${pEsc(instrName(p, portalLoad().instructors))}</option>`).join('')}</select>
        <button type="button" class="cs-pick-btn" id="cs-pick-btn" aria-haspopup="listbox" aria-expanded="false"><span>בחרו מדריך/ה</span><i aria-hidden="true">⌄</i></button>
        <div class="cs-pick-list" id="cs-pick-list" role="listbox" hidden>
          <div class="cs-pick-head"><span class="cs-pick-title">בחרו מדריך/ה</span><span class="cs-pick-key">${mcalKeyChips()}</span></div>
          ${ranked.map(({ p, lv }) => `<button type="button" class="cs-pick-item opt-${LV[lv][0]}" role="option" data-val="${p.id}">${pEsc(instrName(p, portalLoad().instructors))}</button>`).join('')}
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
      editing = null; toast('השעות עודכנו. מי שנוגע בעניין קיבל עדכון.');
      await srvReloadSafe(); await srvLoadCoord(); draw(); srvRenderCoordSchedule(body);
    }));
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
    ${(pr.absent || []).length || fixed.length ? `<div class="cs-req"><b>היעדרות</b><span>${[...(fixed.length ? [[...new Set(fixed.map(f => FIXED_REASON[f.reason] || 'היעדרות'))].join(', ') + ': ' + dayRanges(fixed.map(f => f.day))] : []), ...((pr.absent || []).length ? ['סומן על ידו/ה: ' + dayRanges(pr.absent)] : [])].join(' · ')}</span></div>` : ''}
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
  if(!portalUi.csOpen) return `<button type="button" class="cs-tab" id="cs-open" aria-expanded="false">בקשות המדריכים</button>`;          // (folded: a slim tab at the left of the schedule)
  return `<aside class="cs-side" aria-label="בקשות המדריכים">
    <div class="cs-side-top"><h3 class="cs-side-title">בקשות המדריכים</h3><button type="button" class="cs-close" id="cs-close" aria-label="קיפול">✕</button></div>
    <div class="cs-names">${people.map(p => `<button type="button" class="cs-name${sel && sel.id === p.id ? ' on' : ''}${m.submitted[p.id] ? '' : ' missing'}" data-cs-person="${p.id}" title="${m.submitted[p.id] ? 'הגיש/ה' : 'עוד לא הגיש/ה'}"><img src="${p.photo}" alt=""><span>${pEsc(instrName(p, st.instructors))}</span></button>`).join('')}</div>
    ${sel ? srvPersonRequestsHtml(sel, mk) : '<div class="pnote">לחיצה על שם מציגה את הבקשות שלו/ה לחודש שמוצג, ומסמנת את השמות שלו/ה בסידור.</div>'}
    ${mcalKeyHtml()}
  </aside>`;
}


// while a name is dragged, the shift under it is coloured by what that instructor wrote for it: yes = green, can = yellow, no (or away) = red, not marked = blue
let srvDragWho = null;
// what this instructor wrote for this shift (key = 'date|m/e/n'): yes / can / no (also when she is away that day) / none
function srvWishFor(staffId, key){
  const date = splitKey(key).date, pr = (portalMonth(monthKeyOf(date)).prefs || {})[staffId] || { slots:{}, absent:[], fixed:[] };
  if((pr.absent || []).includes(date) || (pr.fixed || []).some(f => f.day === date)) return 'no';
  const lv = (pr.slots || {})[key];
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
  // no question for an ordinary placement; a question only when the instructor wrote "no" for this shift (or is away that day)
  if(srvWishFor(staffId, key) === 'no' && !(await confirmSheet({ title:`${nm} סימן/ה "לא" למשמרת הזו`, text:`${dayLabel(date)} · ${sh.label} ${sh.start}–${sh.end}. לשבץ בכל זאת?`, okLabel:'כן, לשבץ', cancelLabel:'חזרה', danger:true }))) return;
  const ins = await sbPersonal.from('assignment').insert({ month:firstOf(monthKeyOf(date)), staff_id:staffId, day:date, shift:code, from_time:sh.start, to_time:sh.end, flags:['manual'] }).select('id,staff_id,day,shift,from_time,to_time,flags').single();
  if(ins.error){ toast('השיבוץ נכשל'); return; }
  srvAddRow(st, ins.data); srvRenderCoordSchedule(body);              // (it shows at once; the full reload follows in the background)
  toast(w.length ? `${nm} שובץ/ה. שימי לב: ${w.join('. ')}.` : `${nm} שובץ/ה. מי שנוגע בעניין קיבל עדכון.`, w.length ? 6000 : 0);          // (the warnings that are left, such as rest, do not stop her; she sees them)
  srvReloadSafe().then(() => srvLoadCoord()).then(() => { if(body.isConnected && portalServerOn) srvRenderCoordSchedule(body); }).catch(() => {});
}
