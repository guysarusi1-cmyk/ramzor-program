
// ---------- THE PORTAL CONNECTED TO THE SERVER (personal login, preferences kept in the database) ----------
// Reached with #portal (only when "portal" is on in the config). Every person signs in with their own account
// (e-mail + a 6-digit code); the database decides what each one may see (supabase\scheduling.sql).
// The regular staff session of the רמזור is not touched: this uses a second Supabase client with its own storage key.
const sbPersonal = PORTAL_ENABLED ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth:{ storageKey:'ramzor-personal-auth', persistSession:true, autoRefreshToken:true } }) : null;
const SRV_SHIFT_DB = { m:'M', e:'A', n:'N', l:'L' };                       // the portal's shift ids -> the database's (l = the long weekend, marked on Fridays)
const SRV_SHIFT_UI = { M:'m', A:'e', N:'n' };                              // (the shifts of the schedule)
const SRV_PREF_UI = { M:'m', A:'e', N:'n', L:'l' };                       // (the shifts of the preferences)
const SRV_SHIFTS = [
  { id:'m', label:'בוקר', start:'07:00', end:'15:00', need:1, needWeekend:1, night:false },
  { id:'e', label:'צהריים', letter:'צ', start:'14:00', end:'22:00', need:1, needWeekend:1, night:false },
  { id:'n', label:'לילה', start:'22:00', end:'08:00', need:1, needWeekend:1, night:true }
];
const srv = { me:null, meRow:null, saved:{}, timer:null, failed:false, busy:false, photos:null, profile:null, profileFor:null, voice:null, reminders:true };
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
// every load takes a number; a load that is overtaken by a newer one (another person signed in meanwhile, or a second reload started) must not write anything
async function srvLoad(){
  const epoch = srv.epoch = (srv.epoch || 0) + 1, fresh = () => epoch === srv.epoch;
  const meId = (await sbPersonal.rpc('my_staff_id')).data;
  if(!meId) return false;
  const staff = await srvAll(() => sbPersonal.from('staff').select('id,display_name,kind,active,sort_order').order('sort_order').order('display_name'));
  const today = monthKeyOf(israelNow().date), months = [-1, 0, 1, 2].map(n => addMonths(today, n));
  const from = firstOf(months[0]), to = daysOfMonth(months[3]).slice(-1)[0];
  const [slots, abs, subs, sched, notices, hrs, cons] = await Promise.all([
    srvAll(() => sbPersonal.from('prefs_slot').select('staff_id,day,shift,level').gte('day', from).lte('day', to)),
    srvAll(() => sbPersonal.from('prefs_absence').select('staff_id,day,reason,note').gte('day', from).lte('day', to)),
    srvAll(() => sbPersonal.from('prefs_submission').select('staff_id,month,note').gte('month', from).lte('month', to)),
    srvAll(() => sbPersonal.from('schedule').select('month,status').gte('month', from).lte('month', to)),
    sbPersonal.from('notices').select('id,text,kind,seen,created_at').eq('to_staff', meId).order('created_at', { ascending:false }).limit(40).then(r => { if(r.error) throw r.error; return r.data || []; }),          // (only her own: the coordinator may read everybody's notices; and only the last 40)
    srvAll(() => sbPersonal.from('prefs_hours').select('staff_id,day,from_time,to_time').gte('day', from).lte('day', to)),
    srvAll(() => sbPersonal.from('prefs_consent').select('staff_id,month,extend_morning,pull_to_sunday').gte('month', from).lte('month', to))
  ]);
  const st = {
    version:2, serverMode:true, instructors:staff.map((s, i) => ({ id:s.id, first:s.display_name, last:'', role:s.kind === 'admin' ? 'coordinator' : s.kind, admin:s.kind === 'admin', active:s.active, photo:(srv.photos && srv.photos[s.id]) || letterPhoto(s.display_name, i) })),
    shiftTypes:JSON.parse(JSON.stringify(SRV_SHIFTS)), rules:Object.assign({}, RULES_DEFAULT), months:{}, swaps:[], assignmentIds:{}, announcements:[], timetable:{}, birthdays:{}, outbox:[],
    notices:notices.map(n => ({ id:n.id, to:meId, at:n.created_at, text:n.text, kind:n.kind, seen:n.seen, sent:!!n.seen, fromServer:true })),
    settings:{ theme:(function(){ try { return localStorage.getItem('ramzor-portal-theme') || 'dark'; } catch(e){ return 'dark'; } })() }
  };
  if(!fresh()) return false;
  portalState = st; srv.me = meId; srv.meRow = st.instructors.find(p => p.id === meId) || null;
  months.forEach(mk => {
    const prev = addMonths(mk, -1), m = { deadline:prev + '-24', deadlineTime:'22:30', prefs:{}, submitted:{}, notes:{}, goals:{}, assignments:{}, annot:{}, approvals:{}, published:false, status:null };
    st.months[mk] = m;
  });
  const monthOf = d => monthKeyOf(d);
  slots.forEach(r => {
    const m = st.months[monthOf(r.day)], id = SRV_PREF_UI[r.shift]; if(!m || !id) return;
    srvPrefsOf(m, r.staff_id).slots[`${r.day}|${id}`] = r.level === 'can' ? 'avoid' : r.level;       // the screen's "avoid" = the database's "can" (יכול); a shift with no row is neutral (the person did not say)
  });
  abs.forEach(r => { const m = st.months[monthOf(r.day)]; if(!m) return; const pr = srvPrefsOf(m, r.staff_id); if(r.reason === 'self') pr.absent.push(r.day); else pr.fixed.push({ day:r.day, reason:r.reason, note:r.note }); });      // (a vacation, sick leave... that the coordinator entered cannot be changed here)
  hrs.forEach(r => { const m = st.months[monthOf(r.day)]; if(!m) return; const pr = srvPrefsOf(m, r.staff_id); (pr.hours[r.day] = pr.hours[r.day] || []).push([parseInt(r.from_time, 10), parseInt(r.to_time, 10) || 24]); });
  cons.forEach(r => { const m = st.months[monthOf(r.month)]; if(m) srvPrefsOf(m, r.staff_id).consent = { extend:r.extend_morning, pull:r.pull_to_sunday }; });
  subs.forEach(r => { const m = st.months[monthOf(r.month)]; if(m){ m.submitted[r.staff_id] = true; if(r.note) m.notes[r.staff_id] = r.note; } });
  let goalRows = []; try { goalRows = await srvAll(() => sbPersonal.from('prefs_submission').select('staff_id,month,goal').gte('month', from).lte('month', to)); } catch(e){ goalRows = []; }          // (the goal column comes with scheduling-v5.sql; until then there is none)
  goalRows.forEach(r => { const m = st.months[monthOf(r.month)]; if(m && r.goal) m.goals[r.staff_id] = r.goal; });
  let pickRows = []; try { pickRows = await srvAll(() => sbPersonal.from('prefs_pickone').select('staff_id,friday').gte('friday', from).lte('friday', to)); } catch(e){ pickRows = []; }          // ("only one of these weekends" comes with scheduling-v8.sql)
  pickRows.forEach(r => { const m = st.months[monthOf(r.friday)]; if(m) srvPrefsOf(m, r.staff_id).pick.push(r.friday); });
  if(srv.profileFor !== meId){ srv.profileFor = meId; srv.me = meId; srv.ahmash = {}; try { const ar = await sbPersonal.rpc('ahmash_staff'); if(!ar.error && ar.data) ar.data.forEach(x => { srv.ahmash[x.staff_id] = x.rank; }); } catch(e){}          // (who is an ahmash, for the star on the team calendar; comes with scheduling-v10.sql)
    try { const pr = await sbPersonal.rpc('my_profile'); srv.profile = pr.error ? null : pr.data; } catch(e){ srv.profile = null; } await srvLoadSettings(); applyPortalSize(); }
  if(srv.meRow && srv.profile && srv.profile.admin) srv.meRow.admin = true;          // (the admin flag: the management portal; scheduling-v18.sql)
  sched.forEach(r => { const m = st.months[monthOf(r.month)]; if(m){ m.status = r.status; m.published = r.status === 'published'; } });
  st.rows = [];
  if(sched.length){                                       // (the database shows a person only the published schedules; the coordinator sees the drafts too)
    const rows = await srvAll(() => sbPersonal.from('assignment').select('id,staff_id,day,shift,from_time,to_time,flags').in('month', sched.map(r => r.month)).order('day'));
    rows.forEach(r => srvAddRow(st, r));
  }
  const swapRows = await srvAll(() => sbPersonal.from('swap_requests').select('id,assignment_id,from_staff,to_staff,status,urgent,created_at').order('created_at', { ascending:false })).catch(() => []);
  st.swaps = swapRows.filter(s => st.assignmentIds[s.assignment_id]).map(s => ({ id:s.id, key:st.assignmentIds[s.assignment_id].key, aid:s.assignment_id, urgent:!!s.urgent, from:s.from_staff, to:s.to_staff, status:s.status, at:s.created_at }));
  if(!fresh()) return false;
  srv.saved = {};
  months.forEach(mk => { srv.saved[mk] = srvSnapshot(mk); });
  if(srv.meRow && (srv.meRow.role === 'coordinator' || srv.meRow.admin)) await srvLoadCoord();          // (what only the coordinator may read: personal flags, open items, vacation requests)
  if(srv.photos === null) srvLoadPhotos();                                          // (the photos are heavy, so they come once, in the background)
  return true;
}
// a person without a photo: a round coloured letter
function letterPhoto(name, seed){
  const hue = ((seed || 0) * 47 + 200) % 360, ch = String(name || '?').trim().charAt(0);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='hsl(${hue},45%,42%)'/><text x='50' y='66' font-size='52' font-family='Arial,sans-serif' font-weight='700' fill='white' text-anchor='middle'>${ch}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
async function srvLoadPhotos(){
  srv.photos = {};
  try {
    const rows = await srvAll(() => sbPersonal.from('staff').select('id,photo_url').not('photo_url', 'is', null));
    rows.forEach(r => { srv.photos[r.id] = r.photo_url; });
  } catch(e){ srv.photos = null; return; }
  portalLoad().instructors.forEach(p => { if(srv.photos[p.id]) p.photo = srv.photos[p.id]; });
  const v = document.getElementById('view-portal');
  if(v && v.classList.contains('active') && !document.querySelector('.psheet')){ try { portalRefresh(); } catch(e){} }
}
// one row of the schedule -> the list of rows (for "my shifts") and the team board (instructors only; short / long / custom-hours shifts carry a note)
const SRV_STD = { M:['07:00', '15:00'], A:['14:00', '22:00'], N:['22:00', '08:00'], S:['07:00', '11:00'] };
function srvDropRow(st, id){
  const r = st.rows.find(x => x.id === id); if(!r) return;
  st.rows = st.rows.filter(x => x.id !== id);
  const keys = r.shift === 'L' ? [[r.day, 'e'], [addDays(r.day, 1), 'm'], [addDays(r.day, 1), 'e']] : r.shift === 'S' ? [[r.day, 'm']] : [[r.day, SRV_SHIFT_UI[r.shift]]];
  keys.forEach(([d, sid]) => { const mm = st.months[monthKeyOf(d)]; if(!mm || !sid) return; const list = mm.assignments[`${d}|${sid}`]; if(!list) return; const i = list.indexOf(r.staff); if(i >= 0) list.splice(i, 1); });
  const a = st.assignmentIds[id]; if(a){ delete st.assignmentIds[`${a.key}|${a.staff}`]; delete st.assignmentIds[id]; }
}
function srvAddRow(st, r){
  const t5 = x => x ? x.slice(0, 5) : null, from = t5(r.from_time), to = t5(r.to_time);
  st.rows.push({ id:r.id, staff:r.staff_id, day:r.day, shift:r.shift, from, to, flags:r.flags || [] });
  const who = st.instructors.find(p => p.id === r.staff_id);
  if(who && who.role === 'service' && r.shift !== 'L'){ const key = `${r.day}|${SRV_SHIFT_UI[r.shift] || 'm'}`; st.assignmentIds[r.id] = { key, staff:r.staff_id }; st.assignmentIds[`${key}|${r.staff_id}`] = r.id; }          // (a service girl's shift can be swapped too: scheduling-v28.sql)
  if(!who || who.role !== 'instructor') return;
  const keys = r.shift === 'L' ? [[r.day, 'e'], [addDays(r.day, 1), 'm'], [addDays(r.day, 1), 'e']] : r.shift === 'S' ? [[r.day, 'm']] : [[r.day, SRV_SHIFT_UI[r.shift]]];
  const std = SRV_STD[r.shift];
  const note = r.shift === 'L' ? 'סופ"ש ארוך' : r.shift === 'S' ? '07–11' : (from && to && std && (from !== std[0] || to !== std[1]) ? from.slice(0, 2) + '–' + to.slice(0, 2) : '');
  keys.forEach(([d, id]) => {
    const mm = st.months[monthKeyOf(d)]; if(!mm || !id) return;
    const key = `${d}|${id}`;
    (mm.assignments[key] = mm.assignments[key] || []).push(r.staff_id);
    if(note) mm.annot[`${key}|${r.staff_id}`] = note;
  });
  if(r.shift !== 'L'){ const key = keys[0].join('|'); st.assignmentIds[r.id] = { key, staff:r.staff_id }; st.assignmentIds[`${key}|${r.staff_id}`] = r.id; }       // (both ways: id -> shift, and shift + person -> id)
}
const srvPrefsOf = (m, id) => (m.prefs[id] = m.prefs[id] || { slots:{}, absent:[] }, Object.assign(m.prefs[id], { fixed:m.prefs[id].fixed || [], hours:m.prefs[id].hours || {}, pick:m.prefs[id].pick || [], consent:m.prefs[id].consent || { extend:null, pull:null } }));
const srvSnapshot = mk => { const p = srvPrefsOf(portalMonth(mk), srv.me); return JSON.stringify({ s:Object.keys(p.slots).sort().map(k => k + '=' + p.slots[k]), a:p.absent.slice().sort(), h:Object.keys(p.hours).sort().map(k => k + '=' + JSON.stringify(p.hours[k])), k:p.pick.slice().sort(), c:p.consent.extend !== null && p.consent.pull !== null ? p.consent : null }); };

// ---- writing the person's own preferences (the database accepts only their own rows, only while the month is open)
async function srvSyncPrefs(mk){
  const p = portalPrefsOf(mk, srv.me), days = daysOfMonth(mk), first = days[0], last = days[days.length - 1], snap = srvSnapshot(mk);
  let r = await sbPersonal.from('prefs_slot').delete().eq('staff_id', srv.me).gte('day', first).lte('day', last);
  if(r.error) throw r.error;
  r = await sbPersonal.from('prefs_absence').delete().eq('staff_id', srv.me).gte('day', first).lte('day', last);
  if(r.error) throw r.error;
  const slotRows = Object.keys(p.slots).map(k => { const [d, s] = k.split('|'); return { staff_id:srv.me, day:d, shift:SRV_SHIFT_DB[s], level:p.slots[k] === 'avoid' ? 'can' : p.slots[k] }; });
  if(slotRows.length){ r = await sbPersonal.from('prefs_slot').insert(slotRows); if(r.error) throw r.error; }
  if(p.absent.length){ r = await sbPersonal.from('prefs_absence').insert(p.absent.map(d => ({ staff_id:srv.me, day:d, reason:'self' }))); if(r.error) throw r.error; }
  r = await sbPersonal.from('prefs_hours').delete().eq('staff_id', srv.me).gte('day', first).lte('day', last);
  if(r.error) throw r.error;
  const hourRows = []; Object.keys(p.hours).forEach(d => p.hours[d].forEach(([a, b]) => hourRows.push({ staff_id:srv.me, day:d, from_time:String(a).padStart(2, '0') + ':00', to_time:b >= 24 ? '23:59' : String(b).padStart(2, '0') + ':00' })));
  if(hourRows.length){ r = await sbPersonal.from('prefs_hours').insert(hourRows); if(r.error) throw r.error; }
  if(srv.pickOk !== false){                                          // ("only one of these weekends"; before scheduling-v8.sql the table does not exist, and nothing is lost)
    r = await sbPersonal.from('prefs_pickone').delete().eq('staff_id', srv.me).gte('friday', first).lte('friday', last);
    if(r.error){ if(/prefs_pickone|relation|schema cache/i.test(r.error.message || '')) srv.pickOk = false; else throw r.error; }
    else if((p.pick || []).length){ r = await sbPersonal.from('prefs_pickone').insert(p.pick.map(f => ({ staff_id:srv.me, friday:f }))); if(r.error) throw r.error; }
  }
  if(p.consent.extend !== null && p.consent.pull !== null){          // the two consents are asked again every month; saved once both are answered
    r = await sbPersonal.from('prefs_consent').upsert({ staff_id:srv.me, month:firstOf(mk), extend_morning:p.consent.extend, pull_to_sunday:p.consent.pull, answered_at:new Date().toISOString() });
    if(r.error) throw r.error;
  }
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
    srv.failed = true; toast('לא הצלחנו לשמור כרגע, ננסה שוב אוטומטית בעוד רגע');
    setTimeout(srvQueueSave, 5000);
  }
  srv.busy = false;
  const el = document.getElementById('srv-save-state'); if(el) el.textContent = srv.failed ? 'עוד לא נשמר, ננסה שוב' : 'נשמר ✓';
}
async function srvSubmit(mk, note, goal){
  // first everything on the screen must be saved (a save that is already running is waited for, not skipped)
  for(let i = 0; i < 80 && (srv.busy || srvSnapshot(mk) !== srv.saved[mk]); i++){ if(!srv.busy) await srvFlush(); else await new Promise(r => setTimeout(r, 150)); }
  if(srv.failed || srvSnapshot(mk) !== srv.saved[mk]) throw new Error('not saved');
  const row = { staff_id:srv.me, month:firstOf(mk), submitted_at:new Date().toISOString() };
  if(note !== undefined) row.note = note || null;
  if(goal !== undefined && (goal || portalMonth(mk).goals[srv.me])) row.goal = goal || null;          // (sent only when there is something to say, so that it works before and after scheduling-v5.sql)
  const r = await sbPersonal.from('prefs_submission').upsert(row);
  if(r.error) throw r.error;
  portalMonth(mk).submitted[srv.me] = true;
  if(note) portalMonth(mk).notes[srv.me] = note;
  if(goal !== undefined){ if(goal) portalMonth(mk).goals[srv.me] = goal; else delete portalMonth(mk).goals[srv.me]; }
}

// ---- the screens in server mode
function srvTabs(me){
  if(portalAsCoord(me)) return [['schedule', 'סידור'], ['submissions', 'הגשות'], ['swaps', 'החלפות'], ['vacations', 'חופשות'], ['settings', 'הגדרות']].concat(me.admin ? [['admin', 'ניהול']] : []);          // (the admin: one more tab, 14s-portal-admin.js)
  if(me.role === 'instructor' && srv.profile && srv.profile.manual_only) return [['schedule', 'הסידור'], ['open', 'משמרות חסרות'], ['swaps', 'החלפות'], ['vacation', 'חופשה'], ['inbox', 'הודעות']];          // (not scheduled automatically: she places herself where somebody is missing)
  if(me.role === 'instructor') return [['schedule', 'הסידור'], ['prefs', 'העדפות'], ['swaps', 'החלפות'], ['vacation', 'חופשה'], ['inbox', 'הודעות']];
  if(me.role === 'service') return [['schedule', 'הסידור'], ['avail', 'זמינות'], ['swaps', 'החלפות'], ['vacation', 'חופשה'], ['inbox', 'הודעות']];          // (swaps: only among the service girls)
  return [['schedule', 'הסידור'], ['hours', 'שעות'], ['inbox', 'הודעות']];          // teachers
}
function srvRenderTab(me, body, t){
  const soon = what => { body.innerHTML = `<div class="pnote">${what} — עדיין בבנייה.</div>`; };
  if(portalAsCoord(me)){
    if(t === 'admin' && me.admin) return srvRenderAdmin(body);
    if(t === 'submissions') return srvRenderSubmissions(body);
    if(t === 'swaps') return srvRenderCoordSwaps(body);
    if(t === 'vacations') return srvRenderCoordVacations(body);
    if(t === 'settings') return srvRenderCoordSettings(body);
    return srvRenderCoordSchedule(body);
  }
  if(t === 'schedule') return srvRenderSchedule(body);
  if(t === 'inbox') return srvRenderInbox(body);
  if(t === 'vacation') return srvRenderVacation(body);
  if(t === 'avail') return srvRenderAvailability(body);
  if(t === 'hours') return srvRenderTeacherHours(body);
  if(t === 'open') return srvRenderOpenShifts(body);
  if(t === 'prefs' && me.role === 'instructor') return renderInstructorPrefs(body);
  return renderInstructorSwaps(body);
}
async function srvRenderInbox(body){
  const st = portalLoad();
  if(!body.textContent.trim()) body.innerHTML = '<div class="pnote">טוען…</div>';          // (not a blank screen while the messages come)
  const an = await sbPersonal.from('announcements').select('created_at,text').order('created_at', { ascending:false }).limit(10);
  if(!body.isConnected) return;                                   // (the person went to another screen while this one was loading)
  body.innerHTML = `<h2 class="psec">העדכונים שלך</h2>${st.notices.length ? st.notices.map(n => `<div class="pannounce ${n.kind}"><small>${new Date(n.at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })}${n.seen ? '' : ' · חדש'}</small><div>${pEsc(n.text)}</div></div>`).join('') : '<div class="pnote">אין עדכונים חדשים כרגע.</div>'}
    <h2 class="psec">הודעות מהרכזת</h2>${(an.data || []).length ? an.data.map(a => `<div class="pannounce"><small>${new Date(a.created_at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })}</small><div>${pEsc(a.text)}</div></div>`).join('') : '<div class="pnote">אין הודעות חדשות כרגע.</div>'}`;
  st.notices.forEach(n => { if(!n.seen){ n.seen = true; } }); portalSave();             // (opening the inbox is reading it)
}// ---- swaps: the three people's steps go through the database's own functions (it checks who may do what)
async function srvReload(){ await srvFlush(); await srvLoad(); }
async function srvReloadSafe(){ try { await srvReload(); } catch(e){ /* the screen refreshes on the next action; a failed refresh must not break what the person is doing */ } }
async function srvSwapAction(fn, args){
  const r = await sbPersonal.rpc(fn, args);
  if(r.error) throw r.error;
  await srvReload();
}
// ---- sign in: the personal password (chosen at the first entry), or a code by e-mail (the first entry, or a forgotten password)
function srvLoginHtml(step, email){
  const staffLink = location.hash === '#portal' ? '' : '<button type="button" class="plogin-staff-link" id="plogin-staff">כניסה למכשיר של המרכז (סיסמת צוות)</button>';          // (not on the first screen: a small link at the bottom)
  let inner;
  if(step === 'code') inner = `
        <h2>הקלידו את הקוד</h2>
        <div class="pnote">שלחנו קוד אל ${pEsc(email)}. הוא מגיע תוך דקה (כדאי לבדוק גם בספאם).</div>
        <label class="pfield">קוד<input type="text" id="plogin-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" dir="ltr"></label>
        <button type="button" class="btn" id="plogin-verify">כניסה</button>
        <div class="plogin-row"><button type="button" class="btn ghost" id="plogin-resend">שליחת קוד חדש</button><button type="button" class="btn ghost" id="plogin-back">חזרה</button></div>`;
  else if(step === 'setpw') inner = `
        <h2>בחירת סיסמה אישית</h2>
        <div class="pnote">מהפעם הבאה נכנסים עם המייל והסיסמה הזו, בלי לחכות לקוד. אם שוכחים אותה, אפשר תמיד לקבל קוד למייל.</div>
        <label class="pfield">סיסמה (לפחות 8 תווים)<input type="password" id="plogin-new" autocomplete="new-password" dir="ltr"></label>
        <label class="pfield">שוב, לאימות<input type="password" id="plogin-new2" autocomplete="new-password" dir="ltr"></label>
        <button type="button" class="btn" id="plogin-setpw">שמירה וכניסה</button>`;
  else inner = `
        <h2>ברוכים הבאים</h2>
        <label class="pfield">כתובת מייל<input type="email" id="plogin-email" autocomplete="username" inputmode="email" dir="ltr" value="${pEsc(email || '')}"></label>
        <label class="pfield">סיסמה<input type="password" id="plogin-pw" autocomplete="current-password" dir="ltr"></label>
        <button type="button" class="btn" id="plogin-pwbtn">כניסה</button>
        <div class="login-or"><span>כניסה ראשונה, או ששכחתם את הסיסמה?</span></div>
        <button type="button" class="btn ghost" id="plogin-send">שלחו לי קוד למייל</button>
        ${staffLink}`;
  return `<div class="plogin"><div class="eyebrow-gold">מרכז חירום</div><h1 class="apphome-title">כניסה אישית</h1>
    <div class="card">${inner}
      <div id="plogin-error" class="plogin-error" role="alert"></div>
    </div></div>`;
}
function srvShowLogin(step, email){
  portalActivateView('view-portal');
  const view = document.getElementById('view-portal');
  view.innerHTML = srvLoginHtml(step || 'email', email);
  const $ = id => document.getElementById(id);
  const err = msg => { $('plogin-error').textContent = msg || ''; };
  const guard = async (btn, work) => { btn.disabled = true; err(''); try { await work(); } catch(e){ err('משהו קטן השתבש. אפשר לנסות שוב בעוד רגע.'); } btn.disabled = false; };
  const enter = async () => { if(await personalEnter()) return; err('עוד לא חיברנו את הכתובת הזו לרשימת הצוות. הרכזת תשמח לעזור לכם להיכנס.'); await sbPersonal.auth.signOut(); };
  const sendCode = async mail => {
    const { error } = await sbPersonal.auth.signInWithOtp({ email:mail, options:{ shouldCreateUser:false } });
    if(error){ err(/rate|seconds|limit/i.test(error.message || '') ? 'שלחנו קוד ממש עכשיו. אפשר לבקש קוד חדש בעוד דקה.' : 'לא הצלחנו לשלוח קוד לכתובת הזו. אפשר לבדוק שהיא נכונה, ואם זה ממשיך, הרכזת תשמח לעזור.'); return false; }
    return true;
  };
  const staffBtn = $('plogin-staff');
  if(staffBtn) staffBtn.addEventListener('click', () => { $('protected-app').style.display = 'none'; $('login-screen').style.display = 'block'; });
  const onEnter = (inputId, btnId) => { const i = $(inputId); if(i) i.addEventListener('keydown', e => { if(e.key === 'Enter') $(btnId).click(); }); };
  if(step === 'code'){
    $('plogin-verify').addEventListener('click', ev => guard(ev.target, async () => {
      const code = $('plogin-code').value.trim();
      const { error } = await sbPersonal.auth.verifyOtp({ email, token:code, type:'email' });
      if(error){ err('הקוד לא התאים, או שהוא כבר לא בתוקף. אפשר לבקש קוד חדש.'); return; }
      const { data:{ user } } = await sbPersonal.auth.getUser();
      if(!(user && user.user_metadata && user.user_metadata.has_password)){ srvShowLogin('setpw', email); return; }          // (the first entry: a personal password for the next times)
      await enter();
    }));
    $('plogin-resend').addEventListener('click', ev => guard(ev.target, async () => { if(await sendCode(email)){ err(''); toast('נשלח קוד חדש'); } }));
    $('plogin-back').addEventListener('click', () => srvShowLogin('email', email));
    onEnter('plogin-code', 'plogin-verify');
  } else if(step === 'setpw'){
    $('plogin-setpw').addEventListener('click', ev => guard(ev.target, async () => {
      const a = $('plogin-new').value, b = $('plogin-new2').value;
      if(a.length < 8){ err('הסיסמה צריכה להיות באורך 8 תווים לפחות.'); return; }
      if(a !== b){ err('שתי הסיסמאות לא זהות. אפשר להקליד שוב.'); return; }
      const { error } = await sbPersonal.auth.updateUser({ password:a, data:{ has_password:true } });
      if(error){ err('לא הצלחנו לשמור את הסיסמה (' + (error.message || '') + '). אפשר להמשיך ולנסות שוב בפעם הבאה.'); return; }
      toast('הסיסמה נשמרה. מהפעם הבאה נכנסים איתה.'); await enter();
    }));
    onEnter('plogin-new2', 'plogin-setpw');
  } else {
    $('plogin-pwbtn').addEventListener('click', ev => guard(ev.target, async () => {
      const mail = $('plogin-email').value.trim().toLowerCase(), pw = $('plogin-pw').value;
      if(!mail || !pw){ err('הקלידו מייל וסיסמה. בכניסה הראשונה, או אם שכחתם את הסיסמה, אפשר לקבל קוד למייל.'); return; }
      const { error } = await sbPersonal.auth.signInWithPassword({ email:mail, password:pw });
      if(error){ err('המייל או הסיסמה לא נכונים. אם שכחתם את הסיסמה, אפשר לקבל קוד למייל.'); return; }
      await enter();
    }));
    $('plogin-send').addEventListener('click', ev => guard(ev.target, async () => {
      const mail = $('plogin-email').value.trim().toLowerCase();
      if(!mail){ err('הקלידו את כתובת המייל.'); return; }
      if(await sendCode(mail)) srvShowLogin('code', mail);
    }));
    onEnter('plogin-pw', 'plogin-pwbtn');
  }
}
// the first load after a sign-in: false only when it really failed. A load that was overtaken by a newer one (two starts at the same moment) leaves the
// portal on: the newer load draws it (before this, the older one switched the portal off and the person got the demo portal)
async function srvLoadFirst(){
  const p = srvLoad(), mine = srv.epoch, ok = await p;
  if(ok) return true;
  if(srv.epoch !== mine){          // (wait for the newer load, then go on as usual)
    for(let i = 0; i < 150 && !(portalState && srv.me && portalState.serverMode); i++) await new Promise(r => setTimeout(r, 100));
    if(portalState && srv.me) return true;
  }
  portalServerOn = false; return false;
}
async function srvStart(){
  portalServerOn = true;
  if(!(await srvLoadFirst())) return false;
  portalUi.persona = srv.me; portalUi.tab = null; portalUi.pmonth = null;
  showPortal();
  return true;
}
// ---- one personal sign-in for the portal AND the Ramzor: after it, the Ramzor reads its data with the personal session
// (supabase/scheduling-v15.sql lets an active instructor / coordinator / admin read and work with the Ramzor's data)
let ramzorPersonal = false;
const personalRamzorKind = () => !!(srv.profile && ['instructor', 'coordinator', 'admin'].includes(srv.profile.kind)) || ['instructor', 'coordinator'].includes((portalMe() || {}).role);
async function personalEnter(){
  portalServerOn = true; portalUi.viewAs = null; portalUi.manager = false;          // (a new sign-in never keeps somebody else's view)
  if(!(await srvLoadFirst())) return false;
  portalUi.persona = srv.me;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('protected-app').style.display = '';
  if(!personalRamzorKind()){ srvOpenPortal(); return true; }          // (service girls and teachers: only the portal)
  sb = sbPersonal; ramzorPersonal = true;
  try { await initRoster(); await initMiniLists(); renderManageRoster(); } catch(e){ /* the Ramzor data loads again on the next screen */ }
  showAppHome();
  return true;
}
function srvOpenPortal(){ portalUi.persona = srv.me; portalUi.tab = null; portalUi.pmonth = null; if(srv.meRow && srv.meRow.role === 'coordinator') portalUi.manager = !!srv.meRow.admin; showPortal(); }
async function personalLeave(){
  try { await srvFlush(); } catch(e){}
  await sbPersonal.auth.signOut();
  sb = sbShared; ramzorPersonal = false; portalServerOn = false; portalState = null; srv.me = null; srv.profile = null; srv.profileFor = null;
  if(typeof arApply === 'function') arApply();          // (back to Hebrew)
  portalUi.viewAs = null; portalUi.manager = false; portalUi.persona = null;
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
