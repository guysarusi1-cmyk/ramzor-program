
// ---------- THE PORTAL ON THE SERVER: the coordinator's other screens (who submitted, absences, vacation requests, settings) ----------
const ABSENCE_REASONS = [['sick', 'מחלה'], ['reserve', 'מילואים'], ['leave', 'חופשה מיוחדת / לידה'], ['other', 'אחר']];
const KIND_WORD = { instructor:'מדריך/ה', service:'בת שירות', teacher:'מורה / גננת', coordinator:'רכזת' };
const nameOf = id => { const p = portalPerson(id); return p ? instrName(p, portalLoad().instructors) : '?'; };
const shortDate = d => `${parseIso(d).getDate()}/${parseIso(d).getMonth() + 1}`;
// the days of one person as ranges: ['2026-12-03','2026-12-04','2026-12-05'] -> '3/12–5/12'
function dayRanges(days){
  const ds = [...new Set(days)].sort(), out = []; let s = null, prev = null;
  ds.forEach(d => { if(s && addDays(prev, 1) === d){ prev = d; return; } if(s) out.push([s, prev]); s = prev = d; });
  if(s) out.push([s, prev]);
  return out.map(([a, b]) => a === b ? shortDate(a) : `${shortDate(a)}–${shortDate(b)}`).join(', ');
}

// ---------------------------------------------------------------- who submitted, the notes, who is away
function srvRenderSubmissions(body){
  if(!body.isConnected) return;                                   // (a screen that finished loading after the person left it must not draw)
  const st = portalLoad();
  if(!portalUi.smonth) portalUi.smonth = addMonths(monthKeyOf(srvToday()), 1);
  const mk = portalUi.smonth, m = portalMonth(mk), people = st.instructors.filter(p => p.active && p.role !== 'coordinator');
  const missing = people.filter(p => !m.submitted[p.id]), done = people.filter(p => m.submitted[p.id]);
  const subRow = p => { const pr = m.prefs[p.id] || { slots:{}, absent:[], hours:{} }, c = { avoid:0, no:0 }; Object.values(pr.slots).forEach(v => { if(c[v] !== undefined) c[v]++; });
    const note = m.notes && m.notes[p.id];
    return `<div class="psub-row ${m.submitted[p.id] ? 'ok' : 'bad'}"><img src="${p.photo}" alt=""><b>${pEsc(instrName(p, st.instructors))}</b><span>${m.submitted[p.id] ? 'הוגש ✓' : 'לא הוגש'}</span><small>${KIND_WORD[p.role] || ''}${p.role === 'instructor' ? ` · יכול ${c.avoid} · לא ${c.no} · היעדרות ${(pr.absent || []).length}${Object.keys(pr.hours || {}).length ? ' · שעות אחרות ' + Object.keys(pr.hours).length : ''}${pr.consent && pr.consent.extend ? ' · מסכים להארכה' : ''}${pr.consent && pr.consent.pull ? ' · מסכים למשיכה' : ''}` : ''}</small>${note ? `<div class="psub-note">הערה: ${pEsc(note)}</div>` : ''}</div>`; };
  const away = people.map(p => { const pr = m.prefs[p.id] || {}; const fx = (pr.fixed || []).filter(f => daysOfMonth(mk).includes(f.day)); return { p, fx }; }).filter(x => x.fx.length);
  body.innerHTML = `
    ${monthNavHtml(mk)}
    <div class="pnote">ההגשה נסגרת ב-24 בחודש הקודם בשעה 22:30. עד ה-23 נשלחת אלייך רשימה של מי שעוד לא הגיש.</div>
    <div class="pstatus ${missing.length ? 'bad' : 'ok'}">${missing.length ? `${missing.length} מתוך ${people.length} עוד לא הגישו` : 'כולם הגישו ✓'}</div>
    ${[['sdone', 'הגישו', done.map(subRow).join('') || '<div class="pnote">אין.</div>', done.length], ['smiss', 'לא הגישו', missing.map(subRow).join('') || '<div class="pnote">אין.</div>', missing.length], ['sabs', 'מי נעדר החודש', (away.length ? away.map(x => `<div class="pmine-row"><span><b>${pEsc(instrName(x.p, st.instructors))}</b><br><small>${[...new Set(x.fx.map(f => FIXED_REASON[f.reason] || 'היעדרות'))].join(', ')}${x.fx.length ? ': ' + dayRanges(x.fx.map(f => f.day)) : ''}</small></span></div>`).join('') : '<div class="pnote">אין היעדרויות החודש.</div>'), away.length]].map(([key, title, inner, count]) => `<details class="pfold" data-fold="${key}"${openFold(key) ? ' open' : ''}>
      <summary><span>${title}</span><span class="pcount">${count}</span></summary>
      <div class="pfold-body"><div class="psubs">${inner}</div></div>
    </details>`).join('')}
    <button type="button" class="btn ghost" id="abs-add">הוספת היעדרות (מחלה, מילואים, לידה...)</button>`;
  wireMonthNav(body, 'smonth'); wireFolds(body);
  document.getElementById('abs-add').addEventListener('click', () => srvAbsenceSheet(body));
}
function srvAbsenceSheet(body){
  const st = portalLoad(), people = st.instructors.filter(p => p.active && p.role !== 'coordinator'), today = srvToday();
  const sh = portalSheet(`<h2>הוספת היעדרות</h2>
    <label class="pfield">מי<select id="ab-who">${people.map(p => `<option value="${p.id}">${pEsc(instrName(p, st.instructors))}</option>`).join('')}</select></label>
    <label class="pfield">סיבה<select id="ab-why">${ABSENCE_REASONS.map(r => `<option value="${r[0]}">${r[1]}</option>`).join('')}</select></label>
    <label class="pfield">מתאריך<input type="date" id="ab-from" value="${today}"></label>
    <label class="pfield">עד תאריך<input type="date" id="ab-to" value="${today}"></label>
    <label class="pfield">הערה (לא חובה)<input type="text" id="ab-note" maxlength="200"></label>
    <div id="ab-err" class="pwarn" aria-live="polite"></div>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="ab-go">שמירה</button></div>`);
  sh.querySelector('#ab-go').addEventListener('click', async () => {
    const who = sh.querySelector('#ab-who').value, why = sh.querySelector('#ab-why').value, from = sh.querySelector('#ab-from').value, to = sh.querySelector('#ab-to').value, note = sh.querySelector('#ab-note').value.trim() || null;
    if(!from || !to || to < from){ sh.querySelector('#ab-err').textContent = 'בדקו את התאריכים'; return; }
    const days = []; for(let d = from; d <= to && days.length < 200; d = addDays(d, 1)) days.push(d);
    const u = await sbPersonal.from('prefs_absence').upsert(days.map(d => ({ staff_id:who, day:d, reason:why, note })), { onConflict:'staff_id,day' });
    if(u.error){ sh.querySelector('#ab-err').textContent = 'השמירה נכשלה'; return; }
    const clash = st.rows.filter(r => r.staff === who && r.day >= from && r.day <= to);                  // shifts already handed out in those days: she has to look at them
    if(clash.length) await sbPersonal.from('coordinator_flags').insert(clash.map(r => ({ month:firstOf(monthKeyOf(r.day)), day:r.day, kind:'vacation_conflict', text:`היעדרות חופפת למשמרת ${SRV_SHIFT_WORD[r.shift]} של ${nameOf(who)} ב${dayLabel(r.day)}`, staff_id:who })));
    sh.close(); toast(clash.length ? `נשמר. שימי לב: יש ${clash.length} משמרות באותם ימים (הן מופיעות ברשימת מה שדורש תשומת לב)` : 'ההיעדרות נשמרה');
    await srvReloadSafe(); srvRenderSubmissions(body);
  });
}

// ---------------------------------------------------------------- swaps (the coordinator decides; an urgent one is marked)
function srvRenderCoordSwaps(body){
  if(!body.isConnected) return;                                   // (a screen that finished loading after the person left it must not draw)
  const st = portalLoad();
  const agreed = st.swaps.filter(s => s.status === 'offered'), waiting = st.swaps.filter(s => s.status === 'open');
  const oreqs = st.openReqs || [];
  body.innerHTML = `
    ${oreqs.length ? `<h2 class="psec">בקשות להצטרף למשמרות פתוחות</h2>${oreqs.map(o => `<div class="preq"><div><b>${pEsc(nameOf(o.staff_id))}</b> מבקש/ת להצטרף למשמרת<br>${dayLabel(o.day)} · ${SRV_SHIFT_WORD[o.shift]}</div><div class="preq-actions"><button type="button" class="btn" data-oapprove="${o.id}">אישור</button><button type="button" class="btn ghost" data-oreject="${o.id}">דחייה</button></div></div>`).join('')}` : ''}
    <h2 class="psec">ממתינות לאישורך</h2>
    ${agreed.length ? agreed.map(s => `<div class="preq">${s.urgent ? `<span class="pchip missing">⚠ דווח: לא יכול/ה להגיע</span> ${(st.reasons || {})[s.aid] ? `<small class="preason">הסיבה: ${pEsc(st.reasons[s.aid])}</small> ` : ''}` : ''}<div><b>${pEsc(nameOf(s.from))}</b> מבקש/ת החלפה, <b>${pEsc(nameOf(s.to))}</b> מוכן/ה להחליף<br>${slotLabel(s.key)}</div><div class="preq-actions"><button type="button" class="btn" data-approve="${s.id}">אישור</button><button type="button" class="btn ghost" data-reject="${s.id}">דחייה</button></div></div>`).join('') : '<div class="pnote">אין החלפות שממתינות לאישור.</div>'}
    <h2 class="psec">בקשות פתוחות (עדיין אין מחליף/ה)</h2>
    ${waiting.length ? waiting.map(s => `<div class="pmine-row"><span>${s.urgent ? `<span class="pchip missing">⚠ דווח: לא יכול/ה להגיע</span> ${(st.reasons || {})[s.aid] ? `<small class="preason">הסיבה: ${pEsc(st.reasons[s.aid])}</small> ` : ''}` : ''}${pEsc(nameOf(s.from))} · ${slotLabel(s.key)}</span><em class="pst pst-open">${SWAP_STATUS.open}</em></div>`).join('') : '<div class="pnote">אין.</div>'}`;
  body.querySelectorAll('[data-oapprove], [data-oreject]').forEach(b => b.addEventListener('click', async () => {
    const approve = !!b.dataset.oapprove, id = b.dataset.oapprove || b.dataset.oreject;
    const was = (st.openReqs || []).slice();
    st.openReqs = was.filter(x => x.id !== id);          // (the answer shows at once; the server is asked right after, and the screen goes back if that fails)
    srvRenderCoordSwaps(body);
    const r = await sbPersonal.rpc('decide_open_shift', { p_id:id, p_approve:approve });
    if(r.error){ st.openReqs = was; toast(/covered/.test(r.error.message || '') ? 'המשמרת כבר מלאה, אי אפשר לאשר' : /already working/.test(r.error.message || '') ? 'המדריך כבר משובץ באותו יום' : 'הפעולה לא הצליחה. נסו שוב.'); if(body.isConnected) srvRenderCoordSwaps(body); return; }
    toast(approve ? 'אושר. המדריך שובץ למשמרת וקיבל עדכון.' : 'נדחה. המדריך קיבל עדכון.');
    srvReloadSafe().then(() => { if(body.isConnected && portalServerOn) srvRenderCoordSwaps(body); });
  }));
  body.querySelectorAll('[data-approve], [data-reject]').forEach(b => b.addEventListener('click', async () => {
    const approve = !!b.dataset.approve, s = st.swaps.find(x => x.id === (b.dataset.approve || b.dataset.reject));
    if(approve && s){                                              // a rest problem only warns; the answer stays hers
      const row = st.rows.find(r => r.id === s.aid), w = row ? srvWarnings(s.to, row.day, row.shift, row.from, row.to, row.id) : [];
      if(w.length && !(await confirmSheet({ title:'לאשר למרות האזהרות?', text:w.join('. ') + '.', okLabel:'כן, לאשר', cancelLabel:'חזרה', danger:true }))) return;
    }
    const row = s && st.rows.find(x => x.id === s.aid), was = st.swaps.slice(), wasStaff = row && row.staff;
    if(s){ st.swaps = st.swaps.filter(x => x.id !== s.id); if(approve && row) row.staff = s.to; }          // (the answer shows at once; the server is asked right after, and the screen goes back if that fails)
    srvRenderCoordSwaps(body); toast(approve ? 'ההחלפה אושרה, והמשמרת עברה. כל מי שנוגע בעניין קיבל עדכון.' : 'ההחלפה נדחתה. שני האנשים קיבלו עדכון.');
    const r = await sbPersonal.rpc('decide_swap', { p_swap:b.dataset.approve || b.dataset.reject, p_approve:approve });
    if(r.error){
      st.swaps = was; if(row) row.staff = wasStaff;
      toast(/ahmash/.test(String(r.error.message)) ? 'ההחלפה חסומה: המשמרת תישאר בלי אחמ"שית' : 'הפעולה לא הצליחה. ההחלפה חזרה לרשימה.');
      if(body.isConnected) srvRenderCoordSwaps(body); return;
    }
    srvReloadSafe().then(() => { if(body.isConnected && portalServerOn) srvRenderCoordSwaps(body); });
  }));
}

// ---------------------------------------------------------------- long vacation requests
function srvRenderCoordVacations(body){
  if(!body.isConnected) return;                                   // (a screen that finished loading after the person left it must not draw)
  const st = portalLoad(), list = st.vacations || [], pending = list.filter(v => v.status === 'pending'), rest = list.filter(v => v.status !== 'pending').slice(0, 15);
  const clashOf = v => st.rows.filter(r => r.staff === v.staff_id && r.day >= v.from_day && r.day <= v.to_day).length;
  const line = v => `<b>${pEsc(nameOf(v.staff_id))}</b> · ${shortDate(v.from_day)}–${shortDate(v.to_day)} (${Math.round((parseIso(v.to_day) - parseIso(v.from_day)) / 86400000) + 1} ימים)${v.note ? `<br><small>${pEsc(v.note)}</small>` : ''}`;
  body.innerHTML = `
    <h2 class="psec">בקשות חופשה שממתינות לאישורך</h2>
    ${pending.length ? pending.map(v => `<div class="preq"><div>${line(v)}${clashOf(v) ? `<br><small class="pwarn-inline">⚠ יש ${clashOf(v)} משמרות באותם ימים</small>` : ''}</div><div class="preq-actions"><button type="button" class="btn" data-vac-ok="${v.id}">אישור</button><button type="button" class="btn ghost" data-vac-no="${v.id}">דחייה</button></div></div>`).join('') : '<div class="pnote">אין בקשות שממתינות.</div>'}
    <h2 class="psec">בקשות קודמות</h2>
    ${rest.length ? rest.map(v => `<div class="pmine-row"><span>${line(v)}</span><em class="pst pst-${v.status === 'approved' ? 'approved' : 'rejected'}">${SRV_VAC_STATUS[v.status]}</em></div>`).join('') : '<div class="pnote">אין.</div>'}`;
  body.querySelectorAll('[data-vac-ok], [data-vac-no]').forEach(b => b.addEventListener('click', async () => {
    const approve = !!b.dataset.vacOk, id = b.dataset.vacOk || b.dataset.vacNo, v = (st.vacations || []).find(x => x.id === id), was = v && v.status;
    if(v) v.status = approve ? 'approved' : 'rejected';          // (the answer shows at once; the server is asked right after, and the screen goes back if that fails)
    srvRenderCoordVacations(body); toast(approve ? 'החופשה אושרה, והימים נכנסו כהיעדרות' : 'הבקשה נדחתה');
    const r = await sbPersonal.rpc('decide_vacation', { p_id:id, p_approve:approve });
    if(r.error){ if(v) v.status = was; toast('הפעולה לא הצליחה, הבקשה חזרה לרשימה'); if(body.isConnected) srvRenderCoordVacations(body); return; }
    srvReloadSafe().then(() => { if(body.isConnected && portalServerOn) srvRenderCoordVacations(body); });
  }));
}

// ---------------------------------------------------------------- settings: staff, special days, announcements, the log
function srvRenderCoordSettings(body){
  // the screen opens at once with the four folded parts; a part is loaded and drawn only when it is opened, and opening one folds the others
  const st = portalLoad(); portalUi.setFold = portalUi.setFold || {};
  const today = srvToday();
  const SCOPE_WORD = { morning:'בוקר', afternoon:'צהריים', night:'לילה', hours:'שעות' };
  const KIND_DAY = { holiday:'חג (כמו שבת)', eve:'ערב חג (כמו שישי)', special:'יום מיוחד' };
  const again = async () => { await srvReloadSafe(); srvRenderCoordSettings(body); };
  const sections = {
    staff: [() => 'הצוות, מיילים וסדר עדיפות', async () => {
      const priv = st.priv || {};
      const instr = st.instructors.filter(p => p.role === 'instructor').sort((a, b) => ((priv[a.id] || {}).leader_priority ?? 999) - ((priv[b.id] || {}).leader_priority ?? 999));
      const html = `
      <div class="pnote">כאן מזינים כתובת מייל לכל אחד ויוצרים לו התחברות. סדר המדריכים הוא סדר העדיפות בחלוקת המשמרות מעבר למינימום (למעלה = עדיפות גבוהה). המדריכים לא רואים אותו.</div>
      ${instr.map((p, i) => `<div class="pstaff-row" data-sid="${p.id}"><label class="pstaff-photo" title="החלפת תמונה"><img src="${p.photo}" alt=""><input type="file" accept="image/*" data-photo="${p.id}" hidden></label><span class="pstaff-name">${pEsc(p.first)}${(priv[p.id] || {}).is_leader ? ' <small>מוביל/ה</small>' : ''}</span>
        <span class="pstaff-order"><button type="button" class="btn ghost small" data-up="${p.id}"${i === 0 ? ' disabled' : ''} aria-label="למעלה">↑</button><button type="button" class="btn ghost small" data-down="${p.id}"${i === instr.length - 1 ? ' disabled' : ''} aria-label="למטה">↓</button></span>
        <input type="email" dir="ltr" placeholder="מייל" value="${pEsc((priv[p.id] || {}).email || '')}" data-mail="${p.id}">
        ${(priv[p.id] || {}).auth_user_id ? '<em class="pst pst-approved">מחובר/ת</em>' : `<button type="button" class="btn ghost small" data-login="${p.id}">יצירת התחברות</button>`}</div>`).join('')}
      <h3 class="psec">בנות שירות, מורות ואחרים</h3>
      ${st.instructors.filter(p => p.role !== 'instructor').map(p => `<div class="pstaff-row" data-sid="${p.id}"><label class="pstaff-photo" title="החלפת תמונה"><img src="${p.photo}" alt=""><input type="file" accept="image/*" data-photo="${p.id}" hidden></label><span class="pstaff-name">${pEsc(p.first)} <small>${KIND_WORD[p.role]}</small></span>
        <input type="email" dir="ltr" placeholder="מייל" value="${pEsc((priv[p.id] || {}).email || '')}" data-mail="${p.id}">
        ${(priv[p.id] || {}).auth_user_id ? '<em class="pst pst-approved">מחובר/ת</em>' : `<button type="button" class="btn ghost small" data-login="${p.id}">יצירת התחברות</button>`}</div>`).join('')}
      <h3 class="psec">הוספת איש צוות</h3>
      <div class="pstaff-add"><input type="text" id="new-name" placeholder="שם (כפי שיוצג)"><select id="new-kind"><option value="instructor">מדריך/ה</option><option value="service">בת שירות</option><option value="teacher">מורה / גננת</option></select><select id="new-role" aria-label="סוג המדריך"><option value="plain">מדריך/ה</option><option value="leader">מוביל/ה</option><option value="ahmash">אחמ"ש</option></select><input type="email" dir="ltr" id="new-mail" placeholder="מייל"><button type="button" class="btn small" id="new-go">הוספה</button></div>`;
      const wire = box => {
        box.querySelectorAll('[data-mail]').forEach(inp => inp.addEventListener('change', async () => {
          const mail = inp.value.trim().toLowerCase() || null;
          const u = await sbPersonal.from('staff_private').update({ email:mail }).eq('staff_id', inp.dataset.mail);
          toast(u.error ? 'המייל לא נשמר (אולי הוא כבר בשימוש)' : 'המייל נשמר'); if(!u.error) (st.priv[inp.dataset.mail] = st.priv[inp.dataset.mail] || {}).email = mail;
        }));
        box.querySelectorAll('[data-photo]').forEach(inp => inp.addEventListener('change', async () => {
          const file = inp.files && inp.files[0]; if(!file) return;
          try {
            const uri = await resizePhoto(file, 200);
            const u = await sbPersonal.from('staff').update({ photo_url:uri }).eq('id', inp.dataset.photo);
            if(u.error) throw u.error;
            if(srv.photos) srv.photos[inp.dataset.photo] = uri; const pp = portalPerson(inp.dataset.photo); if(pp) pp.photo = uri;
            toast('התמונה נשמרה');
          } catch(e){ toast('התמונה לא נשמרה'); }
          srvRenderCoordSettings(body);
        }));
        box.querySelectorAll('[data-login]').forEach(b => b.addEventListener('click', async () => {
          const mail = (st.priv[b.dataset.login] || {}).email; if(!mail){ toast('קודם מזינים כתובת מייל'); return; }
          b.disabled = true; const r = await sbPersonal.functions.invoke('create-staff-user', { body:{ staff_id:b.dataset.login } });
          toast(r.error || (r.data && r.data.error) ? 'יצירת ההתחברות נכשלה' : 'ההתחברות נוצרה. אפשר להיכנס עם קוד שנשלח למייל.'); again();
        }));
        const move = async (id, dir) => {
          const ids = instr.map(p => p.id), i = ids.indexOf(id), j = i + dir; if(j < 0 || j >= ids.length) return;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          const changed = ids.filter((x, k) => (st.priv[x] || {}).leader_priority !== k + 1);          // (usually only the two who traded places)
          ids.forEach((x, k) => { (st.priv[x] = st.priv[x] || {}).leader_priority = k + 1; });
          srvRenderCoordSettings(body);          // (the list moves at once; the server is told right after)
          const res = await Promise.all(changed.map(x => sbPersonal.from('staff_private').update({ leader_priority:st.priv[x].leader_priority }).eq('staff_id', x)));
          if(res.some(r => r.error)){ toast('הסדר לא נשמר. נסו שוב.'); again(); }
        };
        box.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => move(b.dataset.up, -1)));
        box.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => move(b.dataset.down, 1)));
        const kindSel = box.querySelector('#new-kind'), roleSel = box.querySelector('#new-role');
        kindSel.addEventListener('change', () => { roleSel.hidden = kindSel.value !== 'instructor'; });          // (the type - instructor, leader, ahmash - only for an instructor)
        box.querySelector('#new-go').addEventListener('click', async () => {
          const name = box.querySelector('#new-name').value.trim(), kind = box.querySelector('#new-kind').value, mail = box.querySelector('#new-mail').value.trim().toLowerCase() || null;
          if(!name){ toast('צריך שם'); return; }
          const maxOrder = Math.max(0, ...st.instructors.map((p, i) => i + 1));
          const s = await sbPersonal.from('staff').insert({ display_name:name, kind, sort_order:maxOrder + 1 }).select('id').single();
          if(s.error){ toast('ההוספה נכשלה'); return; }
          const role = kind === 'instructor' ? roleSel.value : 'plain';
          const pr = await sbPersonal.from('staff_private').insert({ staff_id:s.data.id, email:mail, female:true, is_leader:role === 'leader', ahmash_rank:role === 'ahmash' ? 1 : 0, leader_priority:kind === 'instructor' ? instr.length + 1 : null });
          toast(pr.error ? 'האדם נוסף, אבל המייל לא נשמר' : 'נוסף. אפשר ליצור לו התחברות.'); again();
        });
      };
      return { html, wire };
    }],
    days: [() => 'חגים וימים מיוחדים', async () => {
      let days = await sbPersonal.from('special_days').select('day,kind,label,min_staff,max_staff,scope,from_time,to_time').gte('day', today).order('day').limit(60);
      if(days.error) days = await sbPersonal.from('special_days').select('day,kind,label,min_staff,max_staff').gte('day', today).order('day').limit(60);          // (a project without scheduling-v14.sql yet)
      const html = `
      <div class="pnote">חגים וערבי חג מסומנים אוטומטית. כאן אפשר לערוך, למחוק או להוסיף יום מיוחד (עם מספר מדריכים משלו).</div>
      ${(days.data || []).map(d => `<div class="pmine-row"><span><b>${dayLabel(d.day)}</b> · ${KIND_DAY[d.kind] || d.kind}${d.label ? ' · ' + pEsc(d.label) : ''}${d.min_staff ? ` · ${d.min_staff}–${d.max_staff || d.min_staff + 1} מדריכים${SCOPE_WORD[d.scope] ? ' (' + SCOPE_WORD[d.scope] + (d.scope === 'hours' && d.from_time ? ' ' + String(d.from_time).slice(0, 5) + '–' + String(d.to_time).slice(0, 5) : '') + ')' : ''}` : ''}</span><button type="button" class="btn ghost small" data-day-del="${d.day}">מחיקה</button></div>`).join('') || '<div class="pnote">אין ימים מיוחדים קרובים.</div>'}
      <h3 class="psec">הוספה</h3>
      <div class="pstaff-add"><input type="date" id="sd-day" min="${today}"><select id="sd-kind"><option value="special">יום מיוחד</option><option value="holiday">חג (כמו שבת)</option><option value="eve">ערב חג (כמו שישי)</option></select><input type="text" id="sd-label" placeholder="שם"><input type="number" id="sd-min" min="1" max="12" placeholder="מינימום"><input type="number" id="sd-max" min="1" max="12" placeholder="מקסימום"></div>
      <div class="pstaff-add" id="sd-scope-row"><label class="pfield">המספר הזה רלוונטי ל<select id="sd-scope"><option value="all">כל היום</option><option value="morning">משמרת בוקר</option><option value="afternoon">משמרת צהריים</option><option value="night">לילה</option><option value="hours">שעות אחרות</option></select></label><span id="sd-hours" hidden><label class="pfield">משעה<input type="time" id="sd-from" value="10:00"></label><label class="pfield">עד שעה<input type="time" id="sd-to" value="14:00"></label></span><button type="button" class="btn small" id="sd-go">הוספה</button></div>`;
      const wire = box => {
        box.querySelectorAll('[data-day-del]').forEach(b => b.addEventListener('click', async () => { await sbPersonal.from('special_days').delete().eq('day', b.dataset.dayDel); srvRenderCoordSettings(body); }));
        const scopeSel = box.querySelector('#sd-scope'), kindSel = box.querySelector('#sd-kind'), showScope = () => { box.querySelector('#sd-scope-row').querySelector('label').hidden = kindSel.value !== 'special'; box.querySelector('#sd-hours').hidden = kindSel.value !== 'special' || scopeSel.value !== 'hours'; };
        scopeSel.addEventListener('change', showScope); kindSel.addEventListener('change', showScope); showScope();          // (the hours only for a special day with its own number, and only for "other hours")
        box.querySelector('#sd-go').addEventListener('click', async () => {
          const day = box.querySelector('#sd-day').value; if(!day){ toast('בחרו תאריך'); return; }
          const mn = parseInt(box.querySelector('#sd-min').value, 10) || null, mx = parseInt(box.querySelector('#sd-max').value, 10) || null;
          const scope = kindSel.value === 'special' && mn ? scopeSel.value : 'all', from = box.querySelector('#sd-from').value, to = box.querySelector('#sd-to').value;
          if(scope === 'hours' && (!from || !to || to <= from)){ toast('בדקו את השעות: "עד" צריך להיות אחרי "משעה"'); return; }
          const rec = { day, kind:kindSel.value, label:box.querySelector('#sd-label').value.trim() || null, min_staff:mn, max_staff:mx };
          let u = await sbPersonal.from('special_days').upsert(Object.assign({ scope, from_time:scope === 'hours' ? from : null, to_time:scope === 'hours' ? to : null }, rec));
          if(u.error && scope === 'all') u = await sbPersonal.from('special_days').upsert(rec);          // (a project without scheduling-v14.sql yet)
          toast(u.error ? 'השמירה נכשלה' : 'נשמר'); srvRenderCoordSettings(body);
        });
      };
      return { html, wire };
    }],
    ann: [() => 'הודעה לצוות', async () => {
      const ann = await sbPersonal.from('announcements').select('created_at,text,via').order('created_at', { ascending:false }).limit(8);
      const html = `
      <label class="pfield">הודעה<textarea id="an-text" rows="3" maxlength="800"></textarea></label>
      <div class="an-actions"><div class="pchoice wrap" id="an-via"><button type="button" class="on" data-via="portal">בפורטל</button><button type="button" data-via="email">במייל</button><button type="button" data-via="both">בשניהם</button></div>
      <button type="button" class="btn" id="an-send">שליחה</button></div>
      <h3 class="psec">הודעות אחרונות</h3>
      ${(ann.data || []).map(a => `<div class="pannounce"><small>${new Date(a.created_at).toLocaleString('he-IL')} · ${a.via === 'portal' ? 'בפורטל' : a.via === 'email' ? 'במייל' : 'בפורטל ובמייל'}</small><div>${pEsc(a.text)}</div></div>`).join('') || '<div class="pnote">עוד לא נשלחו הודעות.</div>'}`;
      const wire = box => {
        let via = 'portal';
        box.querySelectorAll('[data-via]').forEach(b => b.addEventListener('click', () => { via = b.dataset.via; box.querySelectorAll('[data-via]').forEach(x => x.classList.toggle('on', x === b)); }));
        box.querySelector('#an-send').addEventListener('click', async () => {
          const text = box.querySelector('#an-text').value.trim(); if(!text){ toast('כתבו הודעה'); return; }
          if(!(await confirmSheet({ title:'לשלוח את ההודעה?', text:via === 'portal' ? 'ההודעה תופיע בפורטל של כל הצוות.' : via === 'email' ? 'ההודעה תישלח במייל לכל הצוות.' : 'ההודעה תופיע בפורטל ותישלח במייל לכל הצוות.', okLabel:'כן, לשלוח', cancelLabel:'חזרה' }))) return;
          const r = await sbPersonal.rpc('post_announcement', { p_text:text, p_via:via });
          toast(r.error ? 'השליחה נכשלה' : 'ההודעה נשלחה'); srvRenderCoordSettings(body);
        });
      };
      return { html, wire };
    }],
    log: [() => 'יומן שינויים בסידור', async () => {
      const log = await sbPersonal.from('audit_log').select('at,by_staff,what,detail').order('at', { ascending:false }).limit(40);
      const html = `
      <div class="pnote">מי שינה משמרת ומתי (שינויים ידניים, החלפות והבנייה האוטומטית).</div>
      ${(log.data || []).map(l => { const d = (l.detail && (l.detail.new || l.detail.old)) || {}; const who = l.by_staff ? nameOf(l.by_staff) : 'המערכת / המנהל'; return `<div class="pmine-row"><span><small>${new Date(l.at).toLocaleString('he-IL')}</small><br>${pEsc(who)}: ${l.what === 'insert shift' ? 'נוספה' : l.what === 'delete shift' ? 'הוסרה' : 'עודכנה'} משמרת ${d.day ? dayLabel(d.day) : ''} ${SRV_SHIFT_WORD[d.shift] || ''} · ${pEsc(nameOf(d.staff_id))}</span></div>`; }).join('') || '<div class="pnote">אין שינויים.</div>'}`;
      return { html, wire:() => {} };
    }]
  };
  const fill = async id => {
    const box = body.querySelector(`[data-sbody="${id}"]`); if(!box || box.dataset.filled) return;
    box.dataset.filled = '1'; box.innerHTML = '<div class="pnote">טוען…</div>';
    try { const r = await sections[id][1](); if(!body.isConnected) return; box.innerHTML = r.html; r.wire(box); }
    catch(e){ box.dataset.filled = ''; box.innerHTML = '<div class="pnote">הטעינה נכשלה. נסו לפתוח שוב.</div>'; }
  };
  body.innerHTML = Object.keys(sections).map(id => `<details class="pfold" data-sfold="${id}"${portalUi.setFold[id] ? ' open' : ''}><summary><span>${sections[id][0]()}</span></summary><div class="pfold-body" data-sbody="${id}"></div></details>`).join('');
  body.querySelectorAll('details[data-sfold]').forEach(d => d.addEventListener('toggle', () => {
    portalUi.setFold[d.dataset.sfold] = d.open;
    if(!d.open) return;
    body.querySelectorAll('details[data-sfold]').forEach(o => { if(o !== d && o.open){ o.open = false; portalUi.setFold[o.dataset.sfold] = false; } });          // (one part open at a time)
    fill(d.dataset.sfold);
  }));
  Object.keys(sections).forEach(id => { if(portalUi.setFold[id]) fill(id); });
}

// a photo from the phone or computer -> a small square JPEG (centre cut), so that it stays light for everybody
function resizePhoto(file, size){
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}