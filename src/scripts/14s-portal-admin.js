
// ---------- THE MANAGEMENT PORTAL (פורטל ניהול): what only the admin has, on top of everything the coordinator has ----------
// The staff's details, a look at the portal as somebody else sees it, the system settings (shift hours, the numbers of the rules),
// building a month again, and the full log. Only for the admin flag (scheduling-v18.sql / v19.sql).
const ADMIN_WEIGHTS = [          // the numbers of the rules: [key, words, the engine's own number] (the engine is the source; these are the defaults it uses)
  ['short_hour', 'מדריך חסר בשעה אחת', 220], ['over_hour', 'מדריך עודף בשעה אחת', 60], ['can', 'שיבוץ במשמרת שסומנה "יכול"', 60], ['neutral', 'שיבוץ במשמרת שלא סומנה', 90],
  ['weekly_mid', 'חסרה משמרת אמצע שבוע מהמינימום האישי', 150], ['weekly_night', 'חסר לילה מהמינימום האישי', 150], ['weekend_month', 'חסרה משמרת סופ"ש מהמינימום האישי', 150],
  ['pickone', '"רק אחד מאלה": לא שובץ באף אחד', 120], ['run8', 'כל יום מעבר ל-8 ימים ברצף', 400], ['five_run', '6 ימים ברצף ויותר', 30],
  ['night_then_day', 'משמרת יום מיד אחרי לילה', 130], ['rest_short', 'מנוחה קצרה', 45], ['night_run2', 'לילה שני ברצף', 10], ['night_run3', 'לילה שלישי ברצף (נוסף)', 10], ['night_run4', 'לילה רביעי ברצף (נוסף)', 20],
  ['double', 'משמרת כפולה (לא בשבת)', 220], ['ext', 'הארכת בוקר עד 16:00', 160], ['from16', 'צהריים שמתחילים ב-16:00', 110], ['pull', 'משיכה מלילה שבת עד 11:00', 90],
  ['leader_missing', 'בוקר בלי מוביל (לשעה)', 500], ['nonleader_over2', 'יותר משני מדריכים לא-מובילים במשמרת (לשעה)', 300], ['ahmash_rank2', 'שיבוץ אחמ"ש בדרגה שנייה', 40],
  ['night_spread', 'פער בחלוקת הלילות', 40], ['long_spread', 'פער בחלוקת הסופ"ש הארוך', 50], ['fifth_stay', 'מדריך חמישי שנשאר עד הסוף (בונוס, לשעה)', 12], ['third_morning', 'מדריך שלישי בבוקר בלי בנות שירות (בונוס, לשעה)', 8]
];
const ADMIN_SHIFT_WORD = { M:'בוקר', S:'בוקר קצר', A:'צהריים', N:'לילה', L:'סופ"ש ארוך' };

function srvRenderAdmin(body){
  portalUi.adminFold = portalUi.adminFold || {};
  const fold = (id, title) => `<details class="pfold" data-afold="${id}"${portalUi.adminFold[id] ? ' open' : ''}><summary><span>${title}</span></summary><div class="pfold-body" data-abody="${id}"></div></details>`;
  body.innerHTML = `<div class="pnote">כאן מה שרק למנהל יש: כל פרטי הצוות, צפייה בפורטל כמו שמדריך מסוים רואה אותו, הגדרות המערכת, בנייה מחדש של סידור ויומן מלא.</div>
    ${fold('problems', 'תקלות ודיווחים')}${fold('staff', 'פרטי הצוות')}${fold('viewas', 'צפייה כמו מדריך מסוים')}${fold('system', 'הגדרות מערכת')}${fold('rebuild', 'בנייה מחדש של סידור')}${fold('log', 'יומן מלא')}`;
  const fill = async id => {
    const box = body.querySelector(`[data-abody="${id}"]`); if(!box) return;
    box.innerHTML = '<div class="pnote">רק רגע...</div>';
    try { await ({ problems:adminProblems, staff:adminStaff, viewas:adminViewAs, system:adminSystem, rebuild:adminRebuild, log:adminLog })[id](box, body); }
    catch(e){ box.innerHTML = '<div class="pnote">הטעינה נכשלה. נסו לפתוח שוב.</div>'; }
  };
  body.querySelectorAll('details[data-afold]').forEach(d => d.addEventListener('toggle', () => { portalUi.adminFold[d.dataset.afold] = d.open; if(d.open) fill(d.dataset.afold); }));
  Object.keys(portalUi.adminFold).forEach(id => { if(portalUi.adminFold[id]) fill(id); });
}

// ---- 1. the staff's details: every flag the system uses, for every person
async function adminStaff(box, body){
  const [staff, priv] = await Promise.all([
    sbPersonal.from('staff').select('id,display_name,kind,active,sort_order').order('kind').order('display_name'),
    sbPersonal.from('staff_private').select('staff_id,email,female,is_leader,ahmash_rank,no_nights,manual_only,only_long_weekend,latest_end_hour,is_admin')
  ]);
  if(staff.error || priv.error) throw staff.error || priv.error;
  const pv = {}; (priv.data || []).forEach(p => { pv[p.staff_id] = p; });
  const lr = await sbPersonal.from('sched_settings').select('value').eq('key', 'leopard_people').maybeSingle(), leoList = (lr.data && Array.isArray(lr.data.value)) ? lr.data.value.slice() : [];
  const KIND = { instructor:'מדריך/ה', service:'בת שירות', teacher:'מורה / גננת', coordinator:'רכזת', admin:'מנהל' };
  const flags = (s, p) => [p.is_admin ? 'מנהל' : '', p.is_leader ? 'מוביל/ה' : '', p.ahmash_rank ? `אחמ"ש ${p.ahmash_rank}` : '', p.no_nights ? 'בלי לילות' : '', p.latest_end_hour ? `עד ${p.latest_end_hour}:00` : '', p.manual_only ? 'שיבוץ ידני בלבד' : '', p.only_long_weekend ? 'רק סופ"ש ארוך' : '', p.female === false ? 'גבר' : '', leoList.includes(s.id) ? '🐆' : ''].filter(Boolean).join(' · ');
  box.innerHTML = (staff.data || []).map(s => { const p = pv[s.id] || {}; return `<div class="pmine-row adm-row${s.active ? '' : ' inactive'}"><span><b>${pEsc(s.display_name)}</b> <small>${KIND[s.kind] || s.kind}${s.active ? '' : ' · לא פעיל/ה'}</small><br><small>${pEsc(flags(s, p)) || '—'}</small></span><button type="button" class="btn ghost small" data-adm-edit="${s.id}">✏️ עריכה</button></div>`; }).join('');
  box.querySelectorAll('[data-adm-edit]').forEach(b => b.addEventListener('click', () => {
    const s = staff.data.find(x => x.id === b.dataset.admEdit), p = pv[s.id] || {};
    const yes = (id, label, on) => `<label class="adm-check"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${label}</label>`;
    const sh = portalSheet(`<h2>עריכת ${pEsc(s.display_name)}</h2>
      <label class="pfield">השם (כפי שמוצג)<input type="text" id="ae-name" maxlength="40" value="${pEsc(s.display_name)}"></label>
      <label class="pfield">תפקיד<select id="ae-kind">${Object.keys(KIND).filter(k => k !== 'admin').map(k => `<option value="${k}"${s.kind === k ? ' selected' : ''}>${KIND[k]}</option>`).join('')}</select></label>
      <div class="adm-checks">${yes('ae-active', 'פעיל/ה', s.active)}${yes('ae-female', 'אישה', p.female !== false)}${yes('ae-leader', 'מוביל/ה', p.is_leader)}${yes('ae-nonights', 'לא עושה לילות', p.no_nights)}${yes('ae-manual', 'שיבוץ ידני בלבד', p.manual_only)}${yes('ae-long', 'רק סופ"ש ארוך', p.only_long_weekend)}${yes('ae-admin', 'מנהל (פורטל ניהול)', p.is_admin)}${yes('ae-leo', 'מצב מנומר (אפשרות בהגדרות)', leoList.includes(s.id))}</div>
      <label class="pfield">אחמ"ש<select id="ae-ahm"><option value="0"${!p.ahmash_rank ? ' selected' : ''}>לא</option><option value="1"${p.ahmash_rank === 1 ? ' selected' : ''}>כן, דרגה 1</option><option value="2"${p.ahmash_rank === 2 ? ' selected' : ''}>כן, דרגה 2 (רק כשאין אחר)</option></select></label>
      <label class="pfield">שעת סיום קבועה<select id="ae-end"><option value="">אין</option>${[19, 20, 21].map(h => `<option value="${h}"${p.latest_end_hour === h ? ' selected' : ''}>${h}:00</option>`).join('')}</select></label>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="ae-save">שמירה</button></div>`);
    sh.querySelector('#ae-save').addEventListener('click', async () => {
      const v = id => sh.querySelector('#' + id), name = v('ae-name').value.trim(); if(!name){ toast('צריך שם'); return; }
      const a = await sbPersonal.from('staff').update({ display_name:name, kind:v('ae-kind').value, active:v('ae-active').checked }).eq('id', s.id);
      const row = { female:v('ae-female').checked, is_leader:v('ae-leader').checked, no_nights:v('ae-nonights').checked, manual_only:v('ae-manual').checked, only_long_weekend:v('ae-long').checked,
                    is_admin:v('ae-admin').checked, ahmash_rank:+v('ae-ahm').value, latest_end_hour:v('ae-end').value ? +v('ae-end').value : null };
      const c = pv[s.id] ? await sbPersonal.from('staff_private').update(row).eq('staff_id', s.id) : await sbPersonal.from('staff_private').insert(Object.assign({ staff_id:s.id }, row));
      if(a.error || c.error){ toast('השמירה נכשלה: ' + ((a.error || c.error).message || '')); return; }
      const wantLeo = v('ae-leo').checked; if(wantLeo !== leoList.includes(s.id)){ const next = wantLeo ? leoList.concat(s.id) : leoList.filter(x => x !== s.id); const l = await sbPersonal.from('sched_settings').upsert({ key:'leopard_people', value:next }); if(!l.error){ leoList.length = 0; next.forEach(x => leoList.push(x)); } }
      sh.close(); toast('נשמר'); adminStaff(box, body); srvReloadSafe();
    });
  }));
}

// ---- 2. the portal as one person sees it (only to look: nothing can be changed there)
function adminViewAs(box){
  const st = portalLoad(), people = st.instructors.filter(p => p.active && p.id !== srv.me).sort((a, b) => String(a.first).localeCompare(String(b.first), 'he'));
  box.innerHTML = `<div class="pnote">בחירה באדם פותחת את הפורטל בדיוק כמו שהוא רואה אותו: הסידור, ההעדפות, ההחלפות. רק לצפייה, בלי אפשרות לשנות דבר.</div>
    <div class="adm-people">${people.map(p => `<button type="button" class="cs-name" data-view-as="${p.id}"><img src="${p.photo}" alt=""><span>${pEsc(instrName(p, st.instructors))}</span></button>`).join('')}</div>`;
  box.querySelectorAll('[data-view-as]').forEach(b => b.addEventListener('click', () => { portalUi.viewAs = b.dataset.viewAs; portalUi.persona = b.dataset.viewAs; portalUi.manager = false; portalUi.tab = null; showPortal(); }));
}
function adminViewAsEnd(){ portalUi.viewAs = null; portalUi.persona = srv.me; portalUi.manager = true; portalUi.tab = 'admin'; showPortal('admin'); }

// ---- 3. the system settings: the hours of the shifts, how early a long vacation is asked for, the numbers of the rules
async function adminSystem(box){
  const r = await sbPersonal.from('sched_settings').select('key,value'); if(r.error) throw r.error;
  const val = k => ((r.data || []).find(x => x.key === k) || {}).value;
  const shifts = val('shifts') || {}, weights = val('weights') || {}, vac = val('vacation_min_days') ?? 30;
  box.innerHTML = `
    <h3 class="psec">שעות המשמרות</h3>
    ${['M', 'S', 'A', 'N', 'L'].filter(k => shifts[k]).map(k => `<div class="adm-shift"><b>${ADMIN_SHIFT_WORD[k]}</b><label>משעה <input type="time" data-sh-from="${k}" value="${pEsc(shifts[k].from || '')}"></label><label>עד <input type="time" data-sh-to="${k}" value="${pEsc(shifts[k].to || '')}"></label></div>`).join('')}
    <label class="pfield">בקשת חופשה ארוכה: לפחות כמה ימים מראש<input type="number" id="adm-vac" min="0" max="120" value="${pEsc(vac)}"></label>
    <h3 class="psec">המספרים של חוקי השיבוץ</h3>
    <div class="pnote">ככל שהמספר גבוה יותר, המערכת נמנעת מזה יותר. מספר שלא שונה מסומן כרגיל. השינוי חל מהבנייה הבאה של סידור.</div>
    <div class="adm-weights">${ADMIN_WEIGHTS.map(([k, words, def]) => `<label class="adm-weight${weights[k] != null && weights[k] !== def ? ' changed' : ''}"><span>${words}</span><input type="number" min="0" max="100000" data-w="${k}" value="${weights[k] ?? def}" data-def="${def}"></label>`).join('')}</div>
    <div class="ctl-actions"><button type="button" class="btn" id="adm-sys-save">שמירת ההגדרות</button><button type="button" class="btn ghost" id="adm-w-reset">החזרת כל המספרים לרגיל</button></div>`;
  const save = async resetWeights => {
    const nextShifts = JSON.parse(JSON.stringify(shifts));
    box.querySelectorAll('[data-sh-from]').forEach(i => { nextShifts[i.dataset.shFrom].from = i.value; });
    box.querySelectorAll('[data-sh-to]').forEach(i => { nextShifts[i.dataset.shTo].to = i.value; });
    const w = {}; if(!resetWeights) box.querySelectorAll('[data-w]').forEach(i => { const n = Number(i.value); if(i.value !== '' && Number.isFinite(n) && n !== Number(i.dataset.def)) w[i.dataset.w] = n; });
    const vacDays = Math.max(0, Math.min(120, parseInt(box.querySelector('#adm-vac').value, 10) || 0));
    const res = await sbPersonal.from('sched_settings').upsert([{ key:'shifts', value:nextShifts }, { key:'weights', value:w }, { key:'vacation_min_days', value:vacDays }]);
    toast(res.error ? 'השמירה נכשלה' : resetWeights ? 'המספרים חזרו לרגיל' : 'ההגדרות נשמרו'); if(!res.error) adminSystem(box);
  };
  box.querySelector('#adm-sys-save').addEventListener('click', () => save(false));
  box.querySelector('#adm-w-reset').addEventListener('click', async () => { if(await confirmSheet({ title:'להחזיר את כל המספרים לרגיל?', text:'כל השינויים במספרי החוקים יימחקו.', okLabel:'כן', cancelLabel:'חזרה' })) save(true); });
}

// ---- 4. building a month again (the hourly job does it; never a published month)
async function adminRebuild(box){
  const r = await sbPersonal.from('sched_requests').select('month,at,done_at,result,requested_by').order('at', { ascending:false }).limit(10);
  const months = [0, 1, 2].map(n => addMonths(monthKeyOf(srvToday()), n));
  box.innerHTML = `<div class="pnote">המערכת תבנה את הסידור של החודש מחדש, לפי ההעדפות והחוקים העדכניים, ותשלח אותו לרכזת. זה קורה בשליחה השעתית, תוך שעה לכל היותר. סידור שכבר פורסם לא נבנה מחדש.</div>
    <div class="ctl-actions">${months.map(mk => `<button type="button" class="btn ghost" data-rebuild="${mk}">לבנות מחדש את ${monthLabel(mk)}</button>`).join('')}</div>
    <h3 class="psec">בקשות אחרונות</h3>${r.error ? '<div class="pnote">נדרש scheduling-v19.sql</div>' : ((r.data || []).map(x => `<div class="pmine-row"><span>${monthLabel(x.month.slice(0, 7))} · <small>${new Date(x.at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })}</small><br><small>${x.done_at ? pEsc(x.result || 'בוצע') : 'ממתין לשליחה השעתית'}</small></span></div>`).join('') || '<div class="pnote">אין.</div>')}`;
  box.querySelectorAll('[data-rebuild]').forEach(b => b.addEventListener('click', async () => {
    const mk = b.dataset.rebuild, m = portalMonth(mk);
    if(m.published){ toast('הסידור הזה כבר פורסם, ולכן לא נבנה מחדש'); return; }
    if(!(await confirmSheet({ title:`לבנות מחדש את ${monthLabel(mk)}?`, text:'הסידור הנוכחי של החודש (אם יש) יוחלף בסידור חדש, כולל שינויים ידניים שנעשו בו.', okLabel:'כן, לבנות מחדש', cancelLabel:'חזרה', danger:true }))) return;
    const res = await sbPersonal.from('sched_requests').insert({ month:firstOf(mk), requested_by:srv.me });
    toast(res.error ? 'הבקשה נכשלה' : 'הבקשה נשלחה. הסידור ייבנה בשליחה השעתית הקרובה.'); adminRebuild(box);
  }));
}

// ---- 5. everything that happened, in one list: the schedule's changes, the ahmash control, the rebuild requests
async function adminLog(box){
  const [a, c, q, s, pv] = await Promise.all([
    sbPersonal.from('audit_log').select('at,by_staff,what,detail').order('at', { ascending:false }).limit(150),
    sbPersonal.from('control_log').select('at,by_staff,what,detail').order('at', { ascending:false }).limit(150),
    sbPersonal.from('sched_requests').select('at,requested_by,month,result,done_at').order('at', { ascending:false }).limit(30),
    sbPersonal.from('staff').select('id,kind'),
    sbPersonal.from('staff_private').select('staff_id,is_admin,ahmash_rank')
  ]);
  // who did it decides the group: the admin, the coordinator, an ahmash, an instructor (and what the system did by itself)
  const kind = {}, flag = {}; (s.data || []).forEach(x => { kind[x.id] = x.kind; }); (pv.data || []).forEach(x => { flag[x.staff_id] = x; });
  const group = id => !id ? 'system' : (flag[id] && flag[id].is_admin) || kind[id] === 'admin' ? 'admin' : kind[id] === 'coordinator' ? 'coord' : flag[id] && flag[id].ahmash_rank > 0 ? 'ahmash' : 'instr';
  const who = id => id ? nameOf(id) : 'המערכת';
  const items = [
    ...(a.data || []).map(l => { const d = (l.detail && (l.detail.new || l.detail.old)) || {}; return { at:l.at, by:l.by_staff, text:`סידור: ${l.what === 'insert shift' ? 'נוספה' : l.what === 'delete shift' ? 'הוסרה' : 'עודכנה'} משמרת ${d.day ? dayLabel(d.day) : ''} ${SRV_SHIFT_WORD[d.shift] || ''} · ${nameOf(d.staff_id)}` }; }),
    ...(c.data || []).map(l => ({ at:l.at, by:l.by_staff, text:'בקרת אחמ"ש: ' + l.what.replace('tv_day_changes', 'מי במסך היום').replace('timetable_day', 'הלו"ז של היום').replace('timetable_fixed', 'הלו"ז הקבוע').replace('bonus_day', 'בונוסים היום').replace(' insert', ' (הוספה)').replace(' delete', ' (מחיקה)').replace(' update', ' (עדכון)') })),
    ...(q.data || []).map(l => ({ at:l.at, by:l.requested_by, text:`בקשה לבנות מחדש את ${monthLabel(l.month.slice(0, 7))}${l.done_at ? ' · ' + (l.result || '') : ''}` }))
  ].sort((x, y) => String(y.at).localeCompare(String(x.at)));
  const GROUPS = [['admin', 'מנהל'], ['coord', 'רכזת'], ['ahmash', 'אחמ"ש'], ['instr', 'מדריך'], ['system', 'המערכת (אוטומטי)']];
  box.innerHTML = GROUPS.map(([g, title]) => { const list = items.filter(x => group(x.by) === g).slice(0, 100); return `<details class="pfold pfold-in"><summary><span>${title}</span><span class="pcount">${list.length}</span></summary><div class="pfold-body">
    ${list.map(x => `<div class="pmine-row"><span><small>${new Date(x.at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })} · ${pEsc(who(x.by))}</small><br>${pEsc(x.text)}</span></div>`).join('') || '<div class="pnote">אין.</div>'}</div></details>`; }).join('');
}
