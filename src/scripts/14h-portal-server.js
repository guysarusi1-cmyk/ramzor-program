
// ---------- THE PORTAL CONNECTED TO THE SERVER (personal login, preferences kept in the database) ----------
// Reached with #portal (only when "portal" is on in the config). Every person signs in with their own account
// (e-mail + a 6-digit code); the database decides what each one may see (supabase\scheduling.sql).
// The regular staff session of the רמזור is not touched: this uses a second Supabase client with its own storage key.
const sbPersonal = PORTAL_ENABLED ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth:{ storageKey:'ramzor-personal-auth', persistSession:true, autoRefreshToken:true } }) : null;
const SRV_SHIFT_DB = { m:'M', e:'A', n:'N' };                       // the portal's shift ids -> the database's
const SRV_SHIFT_UI = { M:'m', A:'e', N:'n' };
const SRV_SHIFTS = [
  { id:'m', label:'בוקר', start:'07:00', end:'15:00', need:2, needWeekend:2, night:false },
  { id:'e', label:'אחר הצהריים', start:'14:00', end:'22:00', need:4, needWeekend:4, night:false },
  { id:'n', label:'לילה', start:'22:00', end:'08:00', need:2, needWeekend:2, night:true }
];
const srv = { me:null, meRow:null, saved:{}, timer:null, failed:false, busy:false };
const firstOf = mk => mk + '-01';

// ---- Israel time (the database closes the preferences by Israel time, so the screen does too)
function israelNow(){
  const f = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Jerusalem', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }), o = {};
  f.formatToParts(new Date()).forEach(p => { o[p.type] = p.value; });
  return { date:`${o.year}-${o.month}-${o.day}`, minutes:Number(o.hour) * 60 + Number(o.minute) };
}
// preferences for a month are open from the 1st of the previous month until the 24th of it at 22:30 (same rule as the database)
function srvPrefsOpen(mk){
  const n = israelNow(), prev = addMonths(mk, -1), end = prev + '-24';
  if(n.date < prev + '-01' || n.date > end) return false;
  return !(n.date === end && n.minutes >= 22 * 60 + 30);
}

// ---- reading everything the person is allowed to see
async function srvAll(build){
  let out = [], from = 0;
  for(;;){
    const { data, error } = await build().range(from, from + 999);
    if(error) throw error;
    out = out.concat(data || []);
    if(!data || data.length < 1000) return out;
    from += 1000;
  }
}
async function srvLoad(){
  const meId = (await sbPersonal.rpc('my_staff_id')).data;
  if(!meId) return false;
  const staff = await srvAll(() => sbPersonal.from('staff').select('id,display_name,kind,active,sort_order').order('sort_order').order('display_name'));
  const today = monthKeyOf(israelNow().date), months = [-1, 0, 1, 2].map(n => addMonths(today, n));
  const from = firstOf(months[0]), to = daysOfMonth(months[3]).slice(-1)[0];
  const [slots, abs, subs, sched, notices] = await Promise.all([
    srvAll(() => sbPersonal.from('prefs_slot').select('staff_id,day,shift,level').gte('day', from).lte('day', to)),
    srvAll(() => sbPersonal.from('prefs_absence').select('staff_id,day').gte('day', from).lte('day', to)),
    srvAll(() => sbPersonal.from('prefs_submission').select('staff_id,month').gte('month', from).lte('month', to)),
    srvAll(() => sbPersonal.from('schedule').select('month,status').gte('month', from).lte('month', to)),
    srvAll(() => sbPersonal.from('notices').select('id,text,kind,seen,created_at').order('created_at', { ascending:false }).limit(40))
  ]);
  const st = {
    version:2, serverMode:true, instructors:staff.map((s, i) => ({ id:s.id, first:s.display_name, last:'', role:s.kind, active:s.active, photo:samplePhoto(i + 1) })),
    shiftTypes:JSON.parse(JSON.stringify(SRV_SHIFTS)), rules:Object.assign({}, RULES_DEFAULT), months:{}, swaps:[], assignmentIds:{}, announcements:[], timetable:{}, birthdays:{}, outbox:[],
    notices:notices.map(n => ({ id:n.id, to:meId, at:n.created_at, text:n.text, kind:n.kind, seen:n.seen, fromServer:true })),
    settings:{ theme:(function(){ try { return localStorage.getItem('ramzor-portal-theme') || 'dark'; } catch(e){ return 'dark'; } })() }
  };
  portalState = st; srv.me = meId; srv.meRow = st.instructors.find(p => p.id === meId) || null;
  months.forEach(mk => {
    const prev = addMonths(mk, -1), m = { deadline:prev + '-24', deadlineTime:'22:30', prefs:{}, submitted:{}, assignments:{}, approvals:{}, published:false };
    st.months[mk] = m;
  });
  const monthOf = d => monthKeyOf(d);
  slots.forEach(r => {
    const m = st.months[monthOf(r.day)], id = SRV_SHIFT_UI[r.shift]; if(!m || !id || r.level === 'yes') return;
    (m.prefs[r.staff_id] = m.prefs[r.staff_id] || { slots:{}, absent:[] }).slots[`${r.day}|${id}`] = r.level === 'can' ? 'avoid' : r.level;       // the screen's "avoid" = the database's "can" (יכול)
  });
  abs.forEach(r => { const m = st.months[monthOf(r.day)]; if(m) (m.prefs[r.staff_id] = m.prefs[r.staff_id] || { slots:{}, absent:[] }).absent.push(r.day); });
  subs.forEach(r => { const m = st.months[monthOf(r.month)]; if(m) m.submitted[r.staff_id] = true; });
  const published = sched.filter(r => r.status === 'published').map(r => monthOf(r.month));
  published.forEach(mk => { if(st.months[mk]) st.months[mk].published = true; });
  if(published.length){
    const rows = await srvAll(() => sbPersonal.from('assignment').select('id,staff_id,day,shift').in('month', published.map(firstOf)));
    rows.forEach(r => {
      const m = st.months[monthOf(r.day)], id = SRV_SHIFT_UI[r.shift]; if(!m || !id) return;          // (short morning / long weekend shifts: next step)
      const key = `${r.day}|${id}`;
      (m.assignments[key] = m.assignments[key] || []).push(r.staff_id);
      st.assignmentIds[r.id] = { key, staff:r.staff_id }; st.assignmentIds[`${key}|${r.staff_id}`] = r.id;      // (both ways: id -> shift, and shift + person -> id)
    });
  }
  const swapRows = await srvAll(() => sbPersonal.from('swap_requests').select('id,assignment_id,from_staff,to_staff,status,created_at').order('created_at', { ascending:false })).catch(() => []);
  st.swaps = swapRows.filter(s => st.assignmentIds[s.assignment_id]).map(s => ({ id:s.id, key:st.assignmentIds[s.assignment_id].key, from:s.from_staff, to:s.to_staff, status:s.status, at:s.created_at }));
  srv.saved = {};
  months.forEach(mk => { srv.saved[mk] = srvSnapshot(mk); });
  return true;
}
const srvSnapshot = mk => { const p = portalPrefsOf(mk, srv.me); return JSON.stringify({ s:Object.keys(p.slots).sort().map(k => k + '=' + p.slots[k]), a:p.absent.slice().sort() }); };

// ---- writing the person's own preferences (the database accepts only their own rows, only while the month is open)
async function srvSyncPrefs(mk){
  const p = portalPrefsOf(mk, srv.me), days = daysOfMonth(mk), first = days[0], last = days[days.length - 1], snap = srvSnapshot(mk);
  let r = await sbPersonal.from('prefs_slot').delete().eq('staff_id', srv.me).gte('day', first).lte('day', last);
  if(r.error) throw r.error;
  r = await sbPersonal.from('prefs_absence').delete().eq('staff_id', srv.me).gte('day', first).lte('day', last);
  if(r.error) throw r.error;
  const slotRows = Object.keys(p.slots).map(k => { const [d, s] = k.split('|'); return { staff_id:srv.me, day:d, shift:SRV_SHIFT_DB[s], level:p.slots[k] === 'avoid' ? 'can' : p.slots[k] }; });
  if(slotRows.length){ r = await sbPersonal.from('prefs_slot').insert(slotRows); if(r.error) throw r.error; }
  if(p.absent.length){ r = await sbPersonal.from('prefs_absence').insert(p.absent.map(d => ({ staff_id:srv.me, day:d }))); if(r.error) throw r.error; }
  srv.saved[mk] = snap;
}
// called after every change on the screen (from portalSave): saves whatever differs from what the server has, a moment later
function srvQueueSave(){
  clearTimeout(srv.timer);
  srv.timer = setTimeout(srvFlush, 500);
}
async function srvFlush(){
  if(!srv.me || srv.busy) { if(srv.busy) srvQueueSave(); return; }
  srv.busy = true;
  try {
    for(const mk of Object.keys(srv.saved)){
      if(!srvPrefsOpen(mk) || srvSnapshot(mk) === srv.saved[mk]) continue;
      await srvSyncPrefs(mk);
    }
    srv.failed = false;
    const unseen = portalState.notices.filter(n => n.seen && n.fromServer && !n.sent);
    for(const n of unseen){ const r = await sbPersonal.from('notices').update({ seen:true }).eq('id', n.id); if(!r.error) n.sent = true; }
  } catch(e){
    srv.failed = true; toast('השמירה נכשלה. נסו שוב בעוד רגע.');
    setTimeout(srvQueueSave, 5000);
  }
  srv.busy = false;
  const el = document.getElementById('srv-save-state'); if(el) el.textContent = srv.failed ? 'לא נשמר עדיין' : 'נשמר ✓';
}
async function srvSubmit(mk){
  await srvFlush();
  if(srv.failed || srvSnapshot(mk) !== srv.saved[mk]) throw new Error('not saved');
  const r = await sbPersonal.from('prefs_submission').upsert({ staff_id:srv.me, month:firstOf(mk), submitted_at:new Date().toISOString() });
  if(r.error) throw r.error;
  portalMonth(mk).submitted[srv.me] = true;
}

// ---- the screens in server mode
function srvTabs(me){
  if(me.role === 'coordinator') return [['submissions', 'הגשות'], ['swaps', 'החלפות'], ['schedule', 'סידור']];
  if(me.role === 'instructor') return [['schedule', 'הסידור'], ['prefs', 'העדפות'], ['swaps', 'החלפות'], ['inbox', 'הודעות']];
  return [['schedule', 'הסידור']];
}
function srvRenderTab(me, body, t){
  const soon = what => { body.innerHTML = `<div class="pnote">${what} — עדיין בבנייה.</div>`; };
  if(me.role === 'coordinator'){
    if(t === 'submissions') return srvRenderSubmissions(body);
    if(t === 'swaps') return srvRenderCoordSwaps(body);
    return soon('מסך הסידור של הרכזת');
  }
  if(me.role !== 'instructor'){ body.innerHTML = '<div class="pnote">הפורטל לבנות שירות ולמורות עדיין בבנייה. כאן יופיע הסידור שלכן.</div>'; return; }
  if(t === 'schedule') return renderInstructorSchedule(body);
  if(t === 'prefs') return renderInstructorPrefs(body);
  if(t === 'inbox') return srvRenderInbox(body);
  return renderInstructorSwaps(body);
}
function srvRenderInbox(body){
  const st = portalLoad();
  body.innerHTML = `<h2 class="psec">עדכונים אישיים</h2>${st.notices.length ? st.notices.map(n => `<div class="pannounce ${n.kind}"><small>${new Date(n.at).toLocaleString('he-IL')}${n.seen ? '' : ' · חדש'}</small><div>${pEsc(n.text)}</div></div>`).join('') : '<div class="pnote">אין עדכונים.</div>'}`;
}
function srvRenderSubmissions(body){
  const st = portalLoad();
  if(!portalUi.smonth) portalUi.smonth = addMonths(monthKeyOf(israelNow().date), 1);
  const mk = portalUi.smonth, m = portalMonth(mk), people = st.instructors.filter(p => p.active && p.role === 'instructor');
  const missing = people.filter(p => !m.submitted[p.id]);
  body.innerHTML = `
    ${monthNavHtml(mk)}
    <div class="pnote">ההגשה נסגרת ב-24 בחודש הקודם בשעה 22:30.</div>
    <div class="pstatus ${missing.length ? 'bad' : 'ok'}">${missing.length ? `${missing.length} מתוך ${people.length} עוד לא הגישו` : 'כולם הגישו ✓'}</div>
    <div class="psubs">${people.map(p => { const pr = m.prefs[p.id] || { slots:{}, absent:[] }, c = { avoid:0, no:0 }; Object.values(pr.slots).forEach(v => { if(c[v] !== undefined) c[v]++; });
      return `<div class="psub-row ${m.submitted[p.id] ? 'ok' : 'bad'}"><img src="${p.photo}" alt=""><b>${pEsc(instrName(p, st.instructors))}</b><span>${m.submitted[p.id] ? 'הוגש ✓' : 'לא הוגש'}</span><small>יכול ${c.avoid} · לא ${c.no} · היעדרות ${pr.absent.length}</small></div>`; }).join('')}</div>`;
  wireMonthNav(body, 'smonth');
}

// ---- swaps: the three people's steps go through the database's own functions (it checks who may do what)
async function srvReload(){ await srvFlush(); await srvLoad(); }
async function srvSwapAction(fn, args){
  const r = await sbPersonal.rpc(fn, args);
  if(r.error) throw r.error;
  await srvReload();
}
function srvRenderCoordSwaps(body){
  const st = portalLoad(), name = id => { const p = portalPerson(id); return p ? instrName(p, st.instructors) : '?'; };
  const agreed = st.swaps.filter(s => s.status === 'offered'), waiting = st.swaps.filter(s => s.status === 'open');
  body.innerHTML = `
    <h2 class="psec">ממתינות לאישורך</h2>
    ${agreed.length ? agreed.map(s => `<div class="preq"><div><b>${pEsc(name(s.from))}</b> מבקש/ת החלפה, <b>${pEsc(name(s.to))}</b> מוכן/ה להחליף<br>${slotLabel(s.key)}</div><div class="preq-actions"><button type="button" class="btn" data-approve="${s.id}">אישור</button><button type="button" class="btn ghost" data-reject="${s.id}">דחייה</button></div></div>`).join('') : '<div class="pnote">אין החלפות שממתינות לאישור.</div>'}
    <h2 class="psec">בקשות פתוחות (עדיין אין מחליף/ה)</h2>
    ${waiting.length ? waiting.map(s => `<div class="pmine-row"><span>${pEsc(name(s.from))} · ${slotLabel(s.key)}</span><em class="pst pst-open">${SWAP_STATUS.open}</em></div>`).join('') : '<div class="pnote">אין.</div>'}`;
  body.querySelectorAll('[data-approve], [data-reject]').forEach(b => b.addEventListener('click', async () => {
    const approve = !!b.dataset.approve;
    try { await srvSwapAction('decide_swap', { p_swap:b.dataset.approve || b.dataset.reject, p_approve:approve }); toast(approve ? 'ההחלפה אושרה, והמשמרת עברה. שני האנשים קיבלו עדכון.' : 'ההחלפה נדחתה. שני האנשים קיבלו עדכון.'); }
    catch(e){ toast('הפעולה לא הצליחה. נסו שוב.'); }
    srvRenderCoordSwaps(body);
  }));
}
// ---- sign in
function srvLoginHtml(step, email){
  return `<div class="plogin"><div class="eyebrow-gold">מרכז חירום</div><h1 class="apphome-title">פורטל המדריך</h1>
    <div class="card">
      ${step === 'email' ? `
        <h2>כניסה אישית</h2>
        <label class="pfield">כתובת מייל<input type="email" id="plogin-email" autocomplete="email" inputmode="email" dir="ltr"></label>
        <button type="button" class="btn" id="plogin-send">שלחו לי קוד</button>
        /*@TEST-ONLY*/
        <label class="pfield">סיסמה (בדיקות בלבד)<input type="password" id="plogin-pw" autocomplete="current-password" dir="ltr"></label>
        <button type="button" class="btn ghost" id="plogin-pwbtn">כניסה עם סיסמה</button>
        /*@END-TEST-ONLY*/` : `
        <h2>הקלידו את הקוד</h2>
        <div class="pnote">שלחנו קוד בן 6 ספרות אל ${pEsc(email)}.</div>
        <label class="pfield">קוד<input type="text" id="plogin-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" dir="ltr"></label>
        <button type="button" class="btn" id="plogin-verify">כניסה</button>
        <button type="button" class="home-text-btn" id="plogin-back">חזרה</button>`}
      <div id="plogin-error" class="plogin-error" role="alert"></div>
    </div></div>`;
}
function srvShowLogin(step, email){
  portalActivateView('view-portal');
  const view = document.getElementById('view-portal');
  view.innerHTML = srvLoginHtml(step || 'email', email);
  const err = msg => { document.getElementById('plogin-error').textContent = msg || ''; };
  const guard = async (btn, work) => { btn.disabled = true; err(''); try { await work(); } catch(e){ err('משהו השתבש, נסו שוב בעוד רגע.'); } btn.disabled = false; };
  const enter = async () => { if(await srvStart()) return; err('החשבון הזה עדיין לא מחובר לרשימת הצוות. פנו לרכזת.'); await sbPersonal.auth.signOut(); };
  if(step === 'code'){
    document.getElementById('plogin-verify').addEventListener('click', ev => guard(ev.target, async () => {
      const code = document.getElementById('plogin-code').value.trim();
      const { error } = await sbPersonal.auth.verifyOtp({ email, token:code, type:'email' });
      if(error){ err('הקוד לא נכון או שפג תוקפו.'); return; }
      await enter();
    }));
    document.getElementById('plogin-back').addEventListener('click', () => srvShowLogin('email'));
  } else {
    document.getElementById('plogin-send').addEventListener('click', ev => guard(ev.target, async () => {
      const mail = document.getElementById('plogin-email').value.trim().toLowerCase();
      if(!mail){ err('הקלידו את כתובת המייל.'); return; }
      const { error } = await sbPersonal.auth.signInWithOtp({ email:mail, options:{ shouldCreateUser:false } });
      if(error){ err('לא הצלחנו לשלוח קוד לכתובת הזו. בדקו שהיא נכונה, או פנו לרכזת.'); return; }
      srvShowLogin('code', mail);
    }));
    /*@TEST-ONLY*/
    document.getElementById('plogin-pwbtn').addEventListener('click', ev => guard(ev.target, async () => {
      const mail = document.getElementById('plogin-email').value.trim().toLowerCase(), pw = document.getElementById('plogin-pw').value;
      const { error } = await sbPersonal.auth.signInWithPassword({ email:mail, password:pw });
      if(error){ err('מייל או סיסמה שגויים.'); return; }
      await enter();
    }));
    /*@END-TEST-ONLY*/
  }
}
async function srvStart(){
  portalServerOn = true;
  if(!(await srvLoad())){ portalServerOn = false; return false; }
  portalUi.persona = srv.me; portalUi.tab = null; portalUi.pmonth = null;
  showPortal();
  return true;
}
async function srvSignOut(){
  await srvFlush();
  await sbPersonal.auth.signOut();
  portalServerOn = false; portalState = null; srv.me = null;
  srvShowLogin('email');
}
async function portalServerBoot(){
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('protected-app').style.display = '';
  const { data:{ session } } = await sbPersonal.auth.getSession();
  if(session){ try { if(await srvStart()) return; } catch(e){ /* fall through to the login */ } portalServerOn = false; }
  srvShowLogin('email');
}
