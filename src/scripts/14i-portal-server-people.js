
// ---------- THE PORTAL ON THE SERVER: what instructors, service girls and teachers see (my shifts, vacation requests, availability) ----------
// The voice: warm, respectful, "the system is here for you". Plural forms ("אתם", "תוכלו") fit everybody; the personal messages follow the person's gender.
const SRV_SHIFT_WORD = { M:'בוקר', S:'בוקר קצר', A:'צהריים', N:'לילה', L:'סופ"ש ארוך' };
const SRV_FLAG_WORD = { ok:'אישר/ה ✓', extension:'הארכה עד 16:00', pull:'המשך עד 11:00 ביום ראשון', double:'כפולה', from16:'מ-16:00', partial:'שעות מותאמות', long22:'עד 22:00' };
const SRV_VAC_STATUS = { pending:'מחכה לתשובה', approved:'אושרה', rejected:'הפעם לא אושרה', cancelled:'בוטלה' };
const srvToday = () => israelNow().date;

function srvRowLine(r){
  const flags = (r.flags || []).map(f => SRV_FLAG_WORD[f]).filter(Boolean);
  const hrs = r.from && r.to ? rangeHtml(r.from, r.to) : '';
  return `<b>${dayLabel(r.day)}</b><span>${SRV_SHIFT_WORD[r.shift] || r.shift} ${hrs}${flags.length ? ` · <em>${flags.join(', ')}</em>` : ''}</span>`;
}
// colleagues who could take a shift (the database answers; before scheduling-v5.sql it simply has nothing to add)
async function srvSwapCandidates(assignmentId){
  try { const r = await sbPersonal.rpc('swap_candidates', { p_assignment:assignmentId }); return r.error || !r.data ? [] : r.data.map(x => x.name); } catch(e){ return []; }
}
const srvCandidatesText = names => names.length ? tx('cands', names.join(', ')) : '';

// the schedule tab (everybody): how the requests went, my shifts, and the whole team's board
function srvRenderSchedule(body){
  if(!body.isConnected || !portalServerOn || !portalState || !portalState.serverMode) return;                                   // (a screen that finished loading after the person left it, or signed out, must not draw)
  const me = portalMe(), st = portalLoad(), mk = portalUi.month || (portalUi.month = monthKeyOf(srvToday())), m = portalMonth(mk), ctx = portalCtx(mk);
  const today = srvToday(), isInstr = me.role === 'instructor', canChange = isInstr || me.role === 'service';          // (a service girl can ask for a swap or report she cannot come too)
  const mine = st.rows.filter(r => r.staff === me.id && monthKeyOf(r.day) === mk).sort((a, b) => (a.day + (a.from || '')).localeCompare(b.day + (b.from || '')));
  const next = st.rows.filter(r => r.staff === me.id && r.day >= today).sort((a, b) => (a.day + (a.from || '')).localeCompare(b.day + (b.from || '')))[0];
  const notices = st.notices.filter(n => !n.seen);
  const openByAid = {}; st.swaps.filter(s => s.from === me.id && ['open', 'offered'].includes(s.status)).forEach(s => { openByAid[s.aid] = s; });
  const fb = (isInstr && m.published && !(srv.profile && srv.profile.manual_only)) ? srvFeedbackFor(me, mk, { prefs:srvPrefsOf(m, me.id), rows:st.rows.filter(r => r.staff === me.id), profile:srv.profile, goal:(m.goals || {})[me.id] || null }) : null;
  body.innerHTML = `
    ${notices.length ? `<details class="pfold pnotices" data-fold="notices"${openFold('notices') ? ' open' : ''}><summary><span>הודעות חדשות</span><span class="pcount">${notices.length}</span></summary><div class="pfold-body">
      ${notices.length > 1 ? '<div class="pnotices-top"><button type="button" class="btn ghost small" id="notices-all-ok">סימון של כולן כנקראו</button></div>' : ''}
      ${notices.map(n => `<div class="pnotice ${n.kind}" role="status"><span>${pEsc(n.text)}</span><button type="button" class="btn small" data-notice-ok="${n.id}">הבנתי, תודה</button></div>`).join('')}
      </div></details>` : ''}
    ${isInstr ? '<div id="od-cards" class="od-cards"></div>' : ''}
    ${monthNavHtml(mk)}
    ${!m.published ? `<div class="pnote">${tx('sch_unpub')}</div>` : `
    <details class="pfold" data-fold="mine"${openFold('mine') ? ' open' : ''}>
      <summary><span>המשמרות שלי</span><span class="pcount">${mine.length}</span></summary>
      <div class="pfold-body">${canChange && mine.length ? `<div class="pchange"><button type="button" class="btn ghost small" id="want-change">בקשת החלפה</button></div>` : ''}<div class="pmine">${mine.length ? mine.map(r => {
        const upcoming = r.day >= today, isNext = next && next.id === r.id, req = openByAid[r.id];
        return `<div class="pmine-row${upcoming ? '' : ' past'}${isNext ? ' next' : ''}">
          <div class="pmine-main">${isNext ? '<span class="pnext-badge">המשמרת הבאה שלך</span>' : ''}${srvRowLine(r)}</div>
          ${req ? `<em class="pst pst-${req.status}">${SWAP_STATUS[req.status]}</em>` : ''}
        </div>`; }).join('') : `<div class="pnote">${tx('sch_none')}</div>`}</div>
        ${canChange ? `<div class="pnote">${tx('sch_help')}</div>` : ''}</div>
    </details>
    <details class="pfold" data-fold="team"${openFold('team') ? ' open' : ''}>
      <summary><span>הצוות כולו</span></summary>
      <div class="pfold-body">${isInstr ? '<div class="pnote">לחיצה על השם שלך במשמרת שעוד לא עברה פותחת בקשת החלפה או דיווח שלא תוכל/י להגיע.</div>' : ''}${monthCalHtml(ctx, m.assignments, { me:me.id, ahmash:srv.ahmash, othersInCells:true })}</div>
    </details>
    ${fb ? `<details class="pfold" data-fold="fb"${openFold('fb') ? ' open' : ''}><summary><span>איך הלכו הבקשות שלך</span></summary><div class="pfold-body"><div class="pfb">${pEsc(fb.text)}</div></div></details>` : ''}
    ${isInstr ? `<details class="pfold" data-fold="openshifts"${openFold('openshifts') ? ' open' : ''}>
      <summary><span>משמרות פתוחות</span><span class="pcount" id="open-count"></span></summary>
      <div class="pfold-body" id="open-fold-body"><div class="pnote">רק רגע...</div></div>
    </details>` : ''}`}`;
  wireMonthNav(body); wireFolds(body);
  if(isInstr && !portalUi.viewAs) srvFillOpenDays(body);          // (a new day for sign-up, at the top)
  if(isInstr && m.published) srvFillOpenFold(body, mk); else { const ob = document.getElementById('open-fold-body'); if(ob) ob.innerHTML = `<div class="pnote">${tx('open_none')}</div>`; }
  body.querySelectorAll('[data-notice-ok]').forEach(b => b.addEventListener('click', () => { const n = st.notices.find(x => x.id === b.dataset.noticeOk); if(n) n.seen = true; portalSave(); srvRenderSchedule(body); }));
  const allOk = document.getElementById('notices-all-ok'); if(allOk) allOk.addEventListener('click', () => { st.notices.forEach(n => { n.seen = true; }); portalSave(); srvRenderSchedule(body); });
  // "רוצה שינוי": one button, then the kind of change, then the question "which shift?" with the person's own upcoming shifts
  const wantBtn = document.getElementById('want-change');
  if(wantBtn) wantBtn.addEventListener('click', () => {
    const fem = !(srv.profile && srv.profile.female === false);
    const sh = portalSheet(`<h2>${tx('change_title')}</h2>
      <div class="pchange-opts"><button type="button" class="btn" data-change="swap"><b>בקשת החלפה</b><small>${tx('change_swap_sub')}</small></button>
      <button type="button" class="btn ghost" data-change="cant"><b>${fem ? 'לא יכולה להגיע' : 'לא יכול להגיע'}</b><small>${tx('change_cant_sub')}</small></button></div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>חזרה</button></div>`);
    sh.querySelectorAll('[data-change]').forEach(opt => opt.addEventListener('click', () => {
      const kind = opt.dataset.change; sh.close();
      const cur = portalLoad(), pickable = cur.rows.filter(r => r.staff === me.id && r.day >= today && r.shift !== 'L' && cur.assignmentIds[r.id] && !cur.swaps.some(s => s.aid === r.id && ['open', 'offered'].includes(s.status))).sort((a, b) => (a.day + (a.from || '')).localeCompare(b.day + (b.from || '')));
      const q = tx(kind === 'swap' ? 'pick_swap_q' : 'pick_cant_q', fem);
      const ps = portalSheet(`<h2>${q}</h2>${pickable.length ? `<div class="pchange-list">${pickable.map(r => `<button type="button" class="pmine-row pick" data-pick-shift="${r.id}" data-day="${r.day}"><div class="pmine-main">${srvRowLine(r)}</div></button>`).join('')}</div>` : `<div class="pnote">${tx('change_none')}</div>`}
        <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>חזרה</button></div>`);
      ps.querySelectorAll('[data-pick-shift]').forEach(pb => pb.addEventListener('click', () => {
        const r = cur.rows.find(x => x.id === pb.dataset.pickShift); ps.close(); if(r) srvDoChange(kind, r, body, fem);
      }));
    }));
  });
  // the team calendar: a tap on one's own name (an upcoming shift) offers the same two changes for that shift
  const team = body.querySelector('[data-fold="team"] .pfold-body');
  if(team && isInstr) team.addEventListener('click', ev => {
    const nm = ev.target.closest('.mcal-name.me'), cell = nm && nm.closest('.mcal-cell'); if(!cell) return;
    const cur = portalLoad(), r = cur.rows.find(x => x.staff === me.id && x.day === cell.dataset.day && x.shift !== 'L' && SRV_SHIFT_UI[x.shift === 'S' ? 'M' : x.shift] === cell.dataset.shift);
    if(!r || r.day < today) return;
    const fem = !(srv.profile && srv.profile.female === false), pending = cur.swaps.find(s => s.aid === r.id && ['open', 'offered'].includes(s.status));
    if(pending){ toast(`כבר יש בקשה פתוחה למשמרת הזו (${SWAP_STATUS[pending.status]})`); return; }
    const sh = portalSheet(`<h2>${dayLabel(r.day)} · ${SRV_SHIFT_WORD[r.shift]}</h2><div class="pnote">${srvRowLine(r)}</div>
      <div class="pchange-opts"><button type="button" class="btn" data-change="swap"><b>בקשת החלפה</b><small>${tx('change_swap_sub')}</small></button>
      <button type="button" class="btn ghost" data-change="cant"><b>${fem ? 'לא יכולה להגיע' : 'לא יכול להגיע'}</b><small>${tx('change_cant_sub')}</small></button></div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>חזרה</button></div>`);
    sh.querySelectorAll('[data-change]').forEach(opt => opt.addEventListener('click', () => { sh.close(); srvDoChange(opt.dataset.change, r, body, fem); }));
  });
}

// a swap request or a "cannot come" report for one of the person's own shifts (asks first; a report needs a reason)
async function srvDoChange(kind, r, body, fem){
  const cand = await srvSwapCandidates(r.id);
  if(kind === 'swap'){
    if(!(await confirmSheet({ title:'לבקש החלפה?', text:tx('swap_confirm', dayLabel(r.day), SRV_SHIFT_WORD[r.shift], srvCandidatesText(cand)), okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
    try { await srvSwapAction('request_swap', { p_assignment:r.id }); toast(tx('swap_posted')); } catch(e){ toast(tx('swap_fail')); }
  } else {
    const why = await srvAskReason(dayLabel(r.day), SRV_SHIFT_WORD[r.shift], srvCandidatesText(cand), fem); if(why === null) return;
    try { await srvSwapAction('report_cannot_come', { p_assignment:r.id, p_note:why }); toast(tx('cant_done')); } catch(e){ toast(tx('cant_fail')); }
  }
  if(body.isConnected) srvRenderSchedule(body);
}

// ---------------------------------------------------------------- long vacation requests (instructors and service girls)
async function srvRenderVacation(body){
  body.innerHTML = '<div class="pnote">רק רגע...</div>';
  const r = await sbPersonal.from('vacation_requests').select('id,from_day,to_day,note,status,created_at').eq('staff_id', srv.me).order('created_at', { ascending:false });
  if(!body.isConnected) return;
  const list = r.data || [], today = srvToday();
  body.innerHTML = `
    <h2 class="psec">בקשת חופשה</h2>
    <div class="pnote">${tx('vac_guide')}</div>
    <div class="pvac">
      <label class="pfield">מתאריך<input type="date" id="vac-from" min="${today}"></label>
      <label class="pfield">עד תאריך<input type="date" id="vac-to" min="${today}"></label>
      <label class="pfield">יש משהו שחשוב לנו לדעת? (לא חובה)<textarea id="vac-note" rows="2" maxlength="300"></textarea></label>
      <div id="vac-hint" class="pwarn" aria-live="polite"></div>
      <button type="button" class="btn" id="vac-send">שליחת הבקשה</button>
    </div>
    <h2 class="psec">הבקשות שלי</h2>
    ${list.length ? list.map(v => `<div class="pmine-row"><span><b>${parseIso(v.from_day).getDate()}/${parseIso(v.from_day).getMonth() + 1} – ${parseIso(v.to_day).getDate()}/${parseIso(v.to_day).getMonth() + 1}</b>${v.note ? `<br><small>${pEsc(v.note)}</small>` : ''}</span><span class="pmine-actions"><em class="pst pst-${v.status === 'approved' ? 'approved' : v.status === 'pending' ? 'offered' : 'rejected'}">${SRV_VAC_STATUS[v.status]}</em>${v.status === 'pending' ? `<button type="button" class="btn ghost small" data-vac-cancel="${v.id}">ביטול</button>` : ''}</span></div>`).join('') : `<div class="pnote">${tx('vac_none')}</div>`}`;
  const from = body.querySelector('#vac-from'), to = body.querySelector('#vac-to'), hint = body.querySelector('#vac-hint');
  const days = () => from.value && to.value ? Math.round((parseIso(to.value) - parseIso(from.value)) / 86400000) + 1 : 0;
  const ahead = () => from.value ? Math.round((parseIso(from.value) - parseIso(today)) / 86400000) : 0;
  const update = () => {
    const d = days(), a = ahead();
    hint.textContent = !d ? '' : d >= 21 && a < 60 ? tx('vac_hint', d, 'חודשיים מראש') : d >= 7 && a < 30 ? tx('vac_hint', d, '30 יום מראש') : '';
  };
  from.addEventListener('change', () => { if(to.value && to.value < from.value) to.value = from.value; to.min = from.value || today; update(); }); to.addEventListener('change', update);
  body.querySelector('#vac-send').addEventListener('click', async () => {
    const d = days();
    if(!from.value || !to.value || d < 1){ toast('נשמח לדעת מאיזה תאריך ועד איזה תאריך'); return; }
    if(d > 119){ toast('אפשר לבקש עד 4 חודשים בבקשה אחת'); return; }
    if(!(await confirmSheet({ title:'לשלוח את הבקשה?', text:`בקשת חופשה של ${d} ימים תישלח לרכזת, והיא תחזור אליכם.`, okLabel:'כן, לשלוח', cancelLabel:'חזרה' }))) return;
    const ins = await sbPersonal.from('vacation_requests').insert({ staff_id:srv.me, from_day:from.value, to_day:to.value, note:(body.querySelector('#vac-note').value || '').trim() || null });
    if(ins.error){ toast(tx('vac_fail')); return; }
    toast(tx('vac_sent')); srvRenderVacation(body);
  });
  body.querySelectorAll('[data-vac-cancel]').forEach(b => b.addEventListener('click', async () => {
    const u = await sbPersonal.from('vacation_requests').update({ status:'cancelled' }).eq('id', b.dataset.vacCancel);
    toast(u.error ? 'לא הצלחנו לבטל כרגע' : 'ביטלנו את הבקשה'); srvRenderVacation(body);
  }));
}

// ---------------------------------------------------------------- service girls: availability for every day (Sunday-Thursday)
// the hours of the service girls (Guy 2026-10-17): Sunday 11:00-19:00; Monday-Wednesday the morning (07:00-15:00), the afternoon (14:00-22:00) or both; Thursday only the morning
const SVC_OPTS = [['early', '07:00–15:00'], ['late', '14:00–22:00'], ['both', 'שתיהן'], ['none', 'לא זמינה']];
const SVC_HOURS = ['hours', 'שעות אחרות'];          // (hours of her own that day, like the instructors: Guy 2026-10-25; scheduling-v37.sql)
const svcOptsFor = d => (dowOf(d) === 0 ? [['late', '11:00–19:00'], ['none', 'לא זמינה']] : dowOf(d) === 4 ? SVC_OPTS.filter(o => o[0] === 'early' || o[0] === 'none') : SVC_OPTS).concat([SVC_HOURS]);
async function srvRenderAvailability(body){          // (also the admin or the coordinator filling it for a service girl: srvWho())
  const mk = (portalUi.pmonth = prefsMonthNow()), m = portalMonth(mk), locked = !srvPrefsOpen(mk);          // (next month only)
  body.innerHTML = '<div class="pnote">רק רגע...</div>';
  const days = daysOfMonth(mk).filter(d => dowOf(d) <= 4);
  const [r, rh] = await Promise.all([sbPersonal.from('prefs_service').select('day,opt').eq('staff_id', srvWho()).gte('day', days[0]).lte('day', days[days.length - 1]),
    sbPersonal.from('prefs_hours').select('day,from_time,to_time').eq('staff_id', srvWho()).gte('day', days[0]).lte('day', days[days.length - 1])]);
  if(!body.isConnected) return;
  const have = {}, hrs = {}; (r.data || []).forEach(x => { have[x.day] = x.opt; }); (rh.data || []).forEach(x => { hrs[x.day] = `${String(x.from_time).slice(0, 5)}–${String(x.to_time).slice(0, 5)}`; });
  const fixed = srvPrefsOf(m, srvWho()).fixed.map(f => f.day);
  const submitted = !!m.submitted[srvWho()], left = days.filter(d => !have[d] && !fixed.includes(d)).length;
  body.innerHTML = `
    ${monthFixedHtml(mk)}
    <div class="pstatus ${submitted ? 'ok' : 'bad'}">${submitted ? 'הזמינות שלכן אצלנו, תודה! אפשר לעדכן עד סגירת ההגשה.' : 'נשמח לדעת מתי אתן זמינות, ככה נוכל לסדר לכן את החודש.'} · אפשר להגיש עד 24/${addMonths(mk, -1).slice(5)} בשעה 22:30</div>
    ${locked ? '<div class="pnote">ההגשה לחודש הזה סגורה כרגע. לשינוי אפשר לפנות לרכזת, והיא תשמח לעזור.</div>' : ''}
    <div class="pnote">לכל יום נשמח שתבחרו מתי נוח לכן. ביום ראשון 11:00–19:00; בשני עד רביעי בוקר (07:00–15:00), צהריים (14:00–22:00) או שתיהן; ביום חמישי רק בוקר (07:00–15:00).</div>
    <div class="psvc">${days.map(d => { const fx = fixed.includes(d); return `<div class="psvc-row${have[d] || fx ? '' : ' empty'}"><b>${dayLabel(d)}</b>${fx ? '<em>היעדרות שאושרה</em>' : `<div class="pchoice wrap">${svcOptsFor(d).map(o => `<button type="button" class="${have[d] === o[0] || (have[d] === 'both' && svcOptsFor(d).length === 2 && o[0] !== 'none') ? 'on' : ''}" data-svc="${d}|${o[0]}"${locked ? ' disabled' : ''}>${o[0] === 'hours' && have[d] === 'hours' && hrs[d] ? hrs[d] : o[1]}</button>`).join('')}</div>`}</div>`; }).join('')}</div>
    <div class="pprefs-actions"><button type="button" class="btn" id="svc-submit"${locked ? ' disabled' : ''}>${submitted ? 'עדכון והגשה מחדש' : 'הגשה'}</button><span class="pnote">${left ? `נשארו ${left} ימים לבחירה` : 'כל הימים נבחרו, תודה!'}</span></div>`;
  wireMonthNav(body, 'pmonth');
  body.querySelectorAll('[data-svc]').forEach(b => b.addEventListener('click', async () => {
    const [d, opt] = b.dataset.svc.split('|');
    if(opt === 'hours'){ svcHoursSheet(d, hrs[d], body); return; }
    await sbPersonal.from('prefs_hours').delete().eq('staff_id', srvWho()).eq('day', d);          // (another choice: her own hours of that day are gone)
    const u = await sbPersonal.from('prefs_service').upsert({ staff_id:srvWho(), day:d, opt });
    if(u.error) toast('לא הצלחנו לשמור כרגע. אפשר לנסות שוב'); srvRenderAvailability(body);
  }));
  body.querySelector('#svc-submit').addEventListener('click', async () => {
    if(left){ toast('נשמח שתבחרו לכל יום לפני ההגשה, ככה נוכל לתכנן'); return; }
    const u = await sbPersonal.from('prefs_submission').upsert({ staff_id:srvWho(), month:firstOf(mk), submitted_at:new Date().toISOString() });
    if(u.error){ toast('לא הצלחנו לשמור כרגע. אפשר לנסות שוב בעוד רגע'); return; }
    m.submitted[srvWho()] = true; toast(tx('avail_ok')); srvRenderAvailability(body);
  });
}

// hours of her own on one day (whole hours, 07:00-22:00): saved in prefs_hours, the day's choice becomes 'hours'
function svcHoursSheet(d, cur, body){
  const [a0, b0] = (cur || '09:00–17:00').split('–').map(x => parseInt(x, 10));
  const opts = sel => { let o = ''; for(let h = 7; h <= 22; h++) o += `<option value="${h}"${h === sel ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`; return o; };
  const sh = portalSheet(`<h2>שעות אחרות · ${pEsc(dayLabel(d))}</h2><div class="adm-mins"><label class="pfield">משעה<select id="svh-from">${opts(a0)}</select></label><label class="pfield">עד שעה<select id="svh-to">${opts(b0)}</select></label></div>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="svh-go">שמירה</button></div>`);
  sh.querySelector('#svh-go').addEventListener('click', async () => {
    const a = +sh.querySelector('#svh-from').value, b = +sh.querySelector('#svh-to').value;
    if(b - a < 2){ toast('צריך לפחות שעתיים'); return; }
    const who = srvWho(), pad = h => String(h).padStart(2, '0') + ':00';
    await sbPersonal.from('prefs_hours').delete().eq('staff_id', who).eq('day', d);
    const h = await sbPersonal.from('prefs_hours').insert({ staff_id:who, day:d, from_time:pad(a), to_time:pad(b) });
    const u = h.error ? h : await sbPersonal.from('prefs_service').upsert({ staff_id:who, day:d, opt:'hours' });
    if(u.error){ toast('לא הצלחנו לשמור כרגע. אפשר לנסות שוב'); return; }
    sh.close(); srvRenderAvailability(body);
  });
}

// ---------------------------------------------------------------- teachers: the fixed hours, confirmed with one press
async function srvRenderTeacherHours(body){
  const mk = (portalUi.pmonth = prefsMonthNow()), m = portalMonth(mk), locked = !srvPrefsOpen(mk);          // (next month only)
  const fx = await sbPersonal.rpc('my_fixed_hours');
  if(!body.isConnected) return;
  const spans = fx.data || {}, submitted = !!m.submitted[srv.me];
  body.innerHTML = `
    ${monthFixedHtml(mk)}
    <div class="pstatus ${submitted ? 'ok' : 'bad'}">${submitted ? 'השעות שלכן אושרו, תודה!' : 'נשמח שתאשרו את השעות הקבועות שלכן.'} · אם לא תספיקו עד ה-24 בשעה 22:30, לא נורא: השעות הקבועות יישלחו בשבילכן אוטומטית.</div>
    <div class="pnote">הימים והשעות הקבועים שלכן:</div>
    <div class="psvc">${[0, 1, 2, 3, 4, 5].filter(d => spans[String(d)]).map(d => `<div class="psvc-row"><b>${DOW_NAMES[d]}</b><span>${rangeHtml(spans[String(d)][0], spans[String(d)][1])}</span></div>`).join('') || '<div class="pnote">עוד לא הוגדרו שעות קבועות. נשמח אם תפנו לרכזת.</div>'}</div>
    <div class="pnote">לחופשה או להיעדרות אפשר לפנות לרכזת, והיא תסמן.</div>
    <div class="pprefs-actions"><button type="button" class="btn" id="th-submit"${locked ? ' disabled' : ''}>${submitted ? 'אישור מחדש' : 'אישור'}</button></div>`;
  wireMonthNav(body, 'pmonth');
  body.querySelector('#th-submit').addEventListener('click', async () => {
    const u = await sbPersonal.from('prefs_submission').upsert({ staff_id:srv.me, month:firstOf(mk), submitted_at:new Date().toISOString() });
    if(u.error){ toast('לא הצלחנו לשמור כרגע. אפשר לנסות שוב בעוד רגע'); return; }
    m.submitted[srv.me] = true; toast(tx('avail_ok')); srvRenderTeacherHours(body);
  });
}

// ---------------------------------------------------------------- open shifts: shifts that are still below the minimum after the publishing.
// The database offers each instructor only the ones she could fill; she sends a request, and she is placed only after the coordinator approves.
async function srvOpenShiftList(mk){
  try { const r = await sbPersonal.rpc('open_shifts', { p_month:firstOf(mk) }); return r.error || !r.data ? [] : r.data; } catch(e){ return []; }
}
function srvOpenShiftsHtml(list){
  return list.length ? list.map(o => `<div class="pmine-row"><span><b>${dayLabel(o.day)}</b> · ${SRV_SHIFT_WORD[o.shift]} <small>(חסר/ים ${o.need - o.have})</small></span>${o.req
    ? `<span class="pmine-actions"><em class="pst pst-offered">${tx('open_waiting')}</em><button type="button" class="btn ghost small" data-ocancel="${o.req}">ביטול</button></span>`
    : `<button type="button" class="btn small" data-ojoin="${o.day}|${o.shift}">אשמח להצטרף</button>`}</div>`).join('') : `<div class="pnote">${tx('open_none')}</div>`;
}
function srvWireOpenShifts(root, refresh){
  root.querySelectorAll('[data-ojoin]').forEach(b => b.addEventListener('click', async () => {
    const [day, shift] = b.dataset.ojoin.split('|');
    if(!(await confirmSheet({ title:tx('open_confirm_title'), text:tx('open_confirm', dayLabel(day), SRV_SHIFT_WORD[shift]), okLabel:'כן, לשלוח', cancelLabel:'חזרה' }))) return;
    const r = await sbPersonal.rpc('request_open_shift', { p_day:day, p_shift:shift });
    toast(r.error ? tx('open_fail') : tx('open_ok')); refresh();
  }));
  root.querySelectorAll('[data-ocancel]').forEach(b => b.addEventListener('click', async () => {
    const r = await sbPersonal.rpc('cancel_open_request', { p_id:b.dataset.ocancel });
    toast(r.error ? tx('cancel_fail') : tx('cancel_ok')); refresh();
  }));
}
// the fold in the schedule screen (filled after the screen is drawn, because the list comes from the database)
async function srvFillOpenFold(body, mk){
  const list = await srvOpenShiftList(mk), box = document.getElementById('open-fold-body');
  if(!box || !body.isConnected || !portalServerOn || portalUi.month !== mk) return;
  box.innerHTML = `<div class="pnote">${tx('open_intro')}</div>${srvOpenShiftsHtml(list)}`;
  const cnt = document.getElementById('open-count'); if(cnt) cnt.textContent = list.length;
  srvWireOpenShifts(box, async () => { await srvReloadSafe(); srvFillOpenFold(body, mk); });
}
// the same list as a screen of its own (for an instructor who is not scheduled automatically)
async function srvRenderOpenShifts(body){
  body.innerHTML = '<div class="pnote">רק רגע...</div>';
  const st = portalLoad(), cur = monthKeyOf(srvToday()), months = [cur, addMonths(cur, 1)].filter(mk => st.months[mk] && st.months[mk].status === 'published');
  const lists = [];
  for(const mk of months) lists.push(...(await srvOpenShiftList(mk)));
  if(!body.isConnected || !portalServerOn) return;
  body.innerHTML = `
    <h2 class="psec">משמרות שמחכות לעזרה שלך</h2>
    <div class="pnote">${tx('open_intro')}</div>
    ${srvOpenShiftsHtml(lists)}`;
  srvWireOpenShifts(body, async () => { await srvReloadSafe(); srvRenderOpenShifts(body); });
}


// "I cannot come" needs a reason: the report cannot be sent without one (the database refuses it too). -> the reason, or null when she goes back
function srvAskReason(dayText, shiftText, candText, fem){
  return new Promise(resolve => {
    const sh = portalSheet(`<h2>${tx('cant_title')}</h2>
      <div class="pnote">${tx('cant_text', dayText, shiftText, candText)}</div>
      <label class="pfield">${tx('cant_reason_label', fem)}<textarea id="cant-reason" rows="3" maxlength="300" placeholder="${pEsc(tx('cant_reason_hint'))}"></textarea></label>
      <div class="confirm-actions"><button type="button" class="btn ghost" id="cant-back">חזרה</button><button type="button" class="btn danger" id="cant-go" disabled>כן, לדווח</button></div>`);
    const box = sh.querySelector('#cant-reason'), go = sh.querySelector('#cant-go');
    box.addEventListener('input', () => { go.disabled = box.value.trim().length < 2; });
    go.addEventListener('click', () => { const v = box.value.trim(); if(v.length < 2) return; sh.remove(); resolve(v); });
    const back = () => { sh.remove(); resolve(null); };
    sh.querySelector('#cant-back').addEventListener('click', back); sh.addEventListener('click', e => { if(e.target === sh) back(); });
  });
}
