
// ---------- THE PORTAL ON THE SERVER: what instructors, service girls and teachers see (my shifts, vacation requests, availability) ----------
const SRV_SHIFT_WORD = { M:'בוקר', S:'בוקר קצר', A:'צהריים', N:'לילה', L:'סופ"ש ארוך' };
const SRV_FLAG_WORD = { extension:'הארכה עד 16:00', pull:'משיכה עד 11:00 ביום ראשון', double:'כפולה', from16:'מ-16:00', partial:'שעות מותאמות', long22:'עד 22:00' };
const SRV_VAC_STATUS = { pending:'ממתינה לאישור', approved:'אושרה', rejected:'לא אושרה', cancelled:'בוטלה' };
const srvToday = () => israelNow().date;

function srvRowLine(r){
  const flags = (r.flags || []).map(f => SRV_FLAG_WORD[f]).filter(Boolean);
  const hrs = r.from && r.to ? rangeHtml(r.from, r.to) : '';
  return `<b>${dayLabel(r.day)}</b><span>${SRV_SHIFT_WORD[r.shift] || r.shift} ${hrs}${flags.length ? ` · <em>${flags.join(', ')}</em>` : ''}</span>`;
}

// the schedule tab (everybody): my shifts, and the whole team's board
function srvRenderSchedule(body){
  if(!body.isConnected) return;                                   // (a screen that finished loading after the person left it must not draw)
  const me = portalMe(), st = portalLoad(), mk = portalUi.month || (portalUi.month = monthKeyOf(srvToday())), m = portalMonth(mk), ctx = portalCtx(mk);
  const today = srvToday(), isInstr = me.role === 'instructor';
  const mine = st.rows.filter(r => r.staff === me.id && monthKeyOf(r.day) === mk).sort((a, b) => (a.day + (a.from || '')).localeCompare(b.day + (b.from || '')));
  const next = st.rows.filter(r => r.staff === me.id && r.day >= today).sort((a, b) => (a.day + (a.from || '')).localeCompare(b.day + (b.from || '')))[0];
  const notices = st.notices.filter(n => !n.seen);
  const openByAid = {}; st.swaps.filter(s => s.from === me.id && ['open', 'offered'].includes(s.status)).forEach(s => { openByAid[s.aid] = s; });
  body.innerHTML = `
    ${notices.map(n => `<div class="pnotice ${n.kind}" role="status"><span>${pEsc(n.text)}</span><button type="button" class="btn small" data-notice-ok="${n.id}">הבנתי</button></div>`).join('')}
    ${monthNavHtml(mk)}
    ${!m.published ? `<div class="pnote">הסידור לחודש הזה עוד לא פורסם.</div>` : `
    <details class="pfold" data-fold="mine"${openFold('mine') ? ' open' : ''}>
      <summary><span>המשמרות שלי</span><span class="pcount">${mine.length}</span></summary>
      <div class="pfold-body"><div class="pmine">${mine.length ? mine.map(r => {
        const upcoming = r.day >= today, isNext = next && next.id === r.id, req = openByAid[r.id];
        const canAct = isInstr && upcoming && r.shift !== 'L' && st.assignmentIds[r.id];
        return `<div class="pmine-row${upcoming ? '' : ' past'}${isNext ? ' next' : ''}">
          <div class="pmine-main">${isNext ? '<span class="pnext-badge">המשמרת הבאה</span>' : ''}${srvRowLine(r)}</div>
          ${req ? `<em class="pst pst-${req.status}">${SWAP_STATUS[req.status]}</em>` : canAct ? `<span class="pmine-actions"><button type="button" class="btn ghost small" data-said="${r.id}">בקשת החלפה</button><button type="button" class="btn ghost small" data-cant="${r.id}">לא יכול/ה להגיע</button></span>` : ''}
        </div>`; }).join('') : '<div class="pnote">אין לך משמרות בחודש הזה.</div>'}</div>
        ${isInstr ? '<div class="pnote">"בקשת החלפה" מפרסמת את המשמרת ללוח ההחלפות. "לא יכול/ה להגיע" (למשל מחלה) שולח הודעה לרכזת ופותח את המשמרת להחלפה מיד.</div>' : ''}</div>
    </details>
    <details class="pfold" data-fold="team"${openFold('team') ? ' open' : ''}>
      <summary><span>הצוות כולו</span></summary>
      <div class="pfold-body">${boardHtml(ctx, m.assignments, { me:me.id, nextDate:next ? next.day : null })}</div>
    </details>`}`;
  wireMonthNav(body); wireFolds(body);
  body.querySelectorAll('[data-notice-ok]').forEach(b => b.addEventListener('click', () => { const n = st.notices.find(x => x.id === b.dataset.noticeOk); if(n) n.seen = true; portalSave(); srvRenderSchedule(body); }));
  body.querySelectorAll('[data-said]').forEach(b => b.addEventListener('click', async () => {
    const r = st.rows.find(x => x.id === b.dataset.said); if(!r) return;
    if(!(await confirmSheet({ title:'לבקש החלפה?', text:`המשמרת ${dayLabel(r.day)} (${SRV_SHIFT_WORD[r.shift]}) תפורסם בלוח ההחלפות, ועמיתים יוכלו להציע להחליף אותך.`, okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
    try { await srvSwapAction('request_swap', { p_assignment:r.id }); toast('המשמרת פורסמה בלוח ההחלפות'); } catch(e){ toast('לא הצלחנו לפרסם את הבקשה. נסו שוב.'); }
    srvRenderSchedule(body);
  }));
  body.querySelectorAll('[data-cant]').forEach(b => b.addEventListener('click', async () => {
    const r = st.rows.find(x => x.id === b.dataset.cant); if(!r) return;
    if(!(await confirmSheet({ title:'לא יכול/ה להגיע?', text:`נשלח עכשיו עדכון לרכזת, והמשמרת ${dayLabel(r.day)} (${SRV_SHIFT_WORD[r.shift]}) תיפתח מיד להחלפה, וכל המדריכים יקבלו הודעה. ההחלפה עצמה תחכה לאישור הרכזת.`, okLabel:'כן, לדווח', cancelLabel:'חזרה', danger:true }))) return;
    try { await srvSwapAction('report_cannot_come', { p_assignment:r.id, p_note:null }); toast('הדיווח נשלח, והמשמרת נפתחה להחלפה'); } catch(e){ toast('הדיווח לא נשלח. נסו שוב.'); }
    srvRenderSchedule(body);
  }));
}

// ---------------------------------------------------------------- long vacation requests (instructors and service girls)
async function srvRenderVacation(body){
  body.innerHTML = '<div class="pnote">טוען...</div>';
  const r = await sbPersonal.from('vacation_requests').select('id,from_day,to_day,note,status,created_at').eq('staff_id', srv.me).order('created_at', { ascending:false });
  if(!body.isConnected) return;
  const list = r.data || [], today = srvToday();
  body.innerHTML = `
    <h2 class="psec">בקשת חופשה</h2>
    <div class="pnote">חופשה של שבוע עד שלושה שבועות: מגישים לפחות 30 יום מראש. חופשה של שלושה שבועות ומעלה: מגישים לפחות חודשיים מראש. אחרי שהרכזת מאשרת, הימים נכנסים אוטומטית כהיעדרות. (לימים בודדים סמנו "היעדרות" במסך ההעדפות.)</div>
    <div class="pvac">
      <label class="pfield">מתאריך<input type="date" id="vac-from" min="${today}"></label>
      <label class="pfield">עד תאריך<input type="date" id="vac-to" min="${today}"></label>
      <label class="pfield">הערה (לא חובה)<textarea id="vac-note" rows="2" maxlength="300"></textarea></label>
      <div id="vac-hint" class="pwarn" aria-live="polite"></div>
      <button type="button" class="btn" id="vac-send">שליחת בקשה</button>
    </div>
    <h2 class="psec">הבקשות שלי</h2>
    ${list.length ? list.map(v => `<div class="pmine-row"><span><b>${parseIso(v.from_day).getDate()}/${parseIso(v.from_day).getMonth() + 1} – ${parseIso(v.to_day).getDate()}/${parseIso(v.to_day).getMonth() + 1}</b>${v.note ? `<br><small>${pEsc(v.note)}</small>` : ''}</span><span class="pmine-actions"><em class="pst pst-${v.status === 'approved' ? 'approved' : v.status === 'pending' ? 'offered' : 'rejected'}">${SRV_VAC_STATUS[v.status]}</em>${v.status === 'pending' ? `<button type="button" class="btn ghost small" data-vac-cancel="${v.id}">ביטול</button>` : ''}</span></div>`).join('') : '<div class="pnote">אין בקשות.</div>'}`;
  const from = body.querySelector('#vac-from'), to = body.querySelector('#vac-to'), hint = body.querySelector('#vac-hint');
  const days = () => from.value && to.value ? Math.round((parseIso(to.value) - parseIso(from.value)) / 86400000) + 1 : 0;
  const ahead = () => from.value ? Math.round((parseIso(from.value) - parseIso(today)) / 86400000) : 0;
  const update = () => {
    const d = days(), a = ahead();
    hint.textContent = !d ? '' : d >= 21 && a < 60 ? `זו חופשה של ${d} ימים. לפי ההנחיה צריך להגיש חופשה כזו חודשיים מראש, וייתכן שהרכזת לא תוכל לאשר.` : d >= 7 && a < 30 ? `זו חופשה של ${d} ימים. לפי ההנחיה צריך להגיש חופשה כזו 30 יום מראש, וייתכן שהרכזת לא תוכל לאשר.` : '';
  };
  from.addEventListener('change', () => { if(to.value && to.value < from.value) to.value = from.value; to.min = from.value || today; update(); }); to.addEventListener('change', update);
  body.querySelector('#vac-send').addEventListener('click', async () => {
    const d = days();
    if(!from.value || !to.value || d < 1){ toast('בחרו תאריך התחלה ותאריך סיום'); return; }
    if(d > 119){ toast('אפשר לבקש עד 4 חודשים בבקשה אחת'); return; }
    if(!(await confirmSheet({ title:'לשלוח את הבקשה?', text:`בקשת חופשה של ${d} ימים תישלח לרכזת.`, okLabel:'כן, לשלוח', cancelLabel:'חזרה' }))) return;
    const ins = await sbPersonal.from('vacation_requests').insert({ staff_id:srv.me, from_day:from.value, to_day:to.value, note:(body.querySelector('#vac-note').value || '').trim() || null });
    if(ins.error){ toast('הבקשה לא נשלחה. נסו שוב.'); return; }
    toast('הבקשה נשלחה לרכזת'); srvRenderVacation(body);
  });
  body.querySelectorAll('[data-vac-cancel]').forEach(b => b.addEventListener('click', async () => {
    const u = await sbPersonal.from('vacation_requests').update({ status:'cancelled' }).eq('id', b.dataset.vacCancel);
    toast(u.error ? 'הביטול נכשל' : 'הבקשה בוטלה'); srvRenderVacation(body);
  }));
}

// ---------------------------------------------------------------- service girls: availability for every day (Sunday-Thursday), Mandatory
const SVC_OPTS = [['early', '07:00–16:00'], ['late', '11:00–19:00'], ['both', 'שתיהן'], ['none', 'לא זמינה']];
async function srvRenderAvailability(body){
  const mk = portalUi.pmonth || (portalUi.pmonth = addMonths(monthKeyOf(srvToday()), 1)), m = portalMonth(mk), locked = !srvPrefsOpen(mk);
  body.innerHTML = '<div class="pnote">טוען...</div>';
  const days = daysOfMonth(mk).filter(d => dowOf(d) <= 4);
  const r = await sbPersonal.from('prefs_service').select('day,opt').eq('staff_id', srv.me).gte('day', days[0]).lte('day', days[days.length - 1]);
  if(!body.isConnected) return;
  const have = {}; (r.data || []).forEach(x => { have[x.day] = x.opt; });
  const fixed = srvPrefsOf(m, srv.me).fixed.map(f => f.day);
  const submitted = !!m.submitted[srv.me], left = days.filter(d => !have[d] && !fixed.includes(d)).length;
  body.innerHTML = `
    ${monthNavHtml(mk)}
    <div class="pstatus ${submitted ? 'ok' : 'bad'}">${submitted ? 'הזמינות הוגשה ✓ (אפשר לעדכן עד סגירת ההגשה)' : 'הזמינות טרם הוגשה. צריך לבחור לכל יום, וההגשה חובה.'} · נסגר ב-24/${addMonths(mk, -1).slice(5)} בשעה 22:30</div>
    ${locked ? '<div class="pnote">ההגשה לחודש הזה סגורה כרגע. לשינוי פנו לרכזת.</div>' : ''}
    <div class="pnote">לכל יום בחרו מתי אתן זמינות. ביום ראשון מגיעות ב-11:00. ביום חמישי אין בנות שירות אחרי 16:00.</div>
    <div class="psvc">${days.map(d => { const fx = fixed.includes(d); return `<div class="psvc-row${have[d] || fx ? '' : ' empty'}"><b>${dayLabel(d)}</b>${fx ? '<em>היעדרות שאושרה</em>' : `<div class="pchoice wrap">${SVC_OPTS.map(o => `<button type="button" class="${have[d] === o[0] ? 'on' : ''}" data-svc="${d}|${o[0]}"${locked ? ' disabled' : ''}>${o[1]}</button>`).join('')}</div>`}</div>`; }).join('')}</div>
    <div class="pprefs-actions"><button type="button" class="btn" id="svc-submit"${locked ? ' disabled' : ''}>${submitted ? 'עדכון והגשה מחדש' : 'הגשה'}</button><span class="pnote">${left ? `נשארו ${left} ימים לבחירה` : 'כל הימים נבחרו'}</span></div>`;
  wireMonthNav(body, 'pmonth');
  body.querySelectorAll('[data-svc]').forEach(b => b.addEventListener('click', async () => {
    const [d, opt] = b.dataset.svc.split('|');
    const u = await sbPersonal.from('prefs_service').upsert({ staff_id:srv.me, day:d, opt });
    if(u.error) toast('השמירה נכשלה. נסו שוב.'); srvRenderAvailability(body);
  }));
  body.querySelector('#svc-submit').addEventListener('click', async () => {
    if(left){ toast('צריך לבחור לכל יום לפני ההגשה'); return; }
    const u = await sbPersonal.from('prefs_submission').upsert({ staff_id:srv.me, month:firstOf(mk), submitted_at:new Date().toISOString() });
    if(u.error){ toast('ההגשה נכשלה. נסו שוב.'); return; }
    m.submitted[srv.me] = true; toast('הזמינות הוגשה ✓'); srvRenderAvailability(body);
  });
}

// ---------------------------------------------------------------- teachers: the fixed hours, confirmed with one press
async function srvRenderTeacherHours(body){
  const mk = portalUi.pmonth || (portalUi.pmonth = addMonths(monthKeyOf(srvToday()), 1)), m = portalMonth(mk), locked = !srvPrefsOpen(mk);
  const fx = await sbPersonal.rpc('my_fixed_hours');
  if(!body.isConnected) return;
  const spans = fx.data || {}, submitted = !!m.submitted[srv.me];
  body.innerHTML = `
    ${monthNavHtml(mk)}
    <div class="pstatus ${submitted ? 'ok' : 'bad'}">${submitted ? 'השעות אושרו ✓' : 'השעות הקבועות טרם אושרו.'} · אם לא תאשרו עד ה-24 בשעה 22:30, השעות הקבועות יישלחו אוטומטית.</div>
    <div class="pnote">הימים והשעות הקבועים שלכן:</div>
    <div class="psvc">${[0, 1, 2, 3, 4, 5].filter(d => spans[String(d)]).map(d => `<div class="psvc-row"><b>${DOW_NAMES[d]}</b><span>${rangeHtml(spans[String(d)][0], spans[String(d)][1])}</span></div>`).join('') || '<div class="pnote">עוד לא הוגדרו שעות קבועות. פנו לרכזת.</div>'}</div>
    <div class="pnote">לחופשה או היעדרות פנו לרכזת, והיא תסמן.</div>
    <div class="pprefs-actions"><button type="button" class="btn" id="th-submit"${locked ? ' disabled' : ''}>${submitted ? 'אישור מחדש' : 'אישור והגשה'}</button></div>`;
  wireMonthNav(body, 'pmonth');
  body.querySelector('#th-submit').addEventListener('click', async () => {
    const u = await sbPersonal.from('prefs_submission').upsert({ staff_id:srv.me, month:firstOf(mk), submitted_at:new Date().toISOString() });
    if(u.error){ toast('האישור נכשל. נסו שוב.'); return; }
    m.submitted[srv.me] = true; toast('השעות אושרו ✓'); srvRenderTeacherHours(body);
  });
}
