
// ---------- THE SECRETARY (Alex card c36860ff, Guy's answers of 5 Nov; supabase/scheduling-v62.sql) ----------
// Her home: הרמזור, לו"ז, חונכויות והתנדבויות. The admin has all of her new abilities too. The rules are kept in the database, not only here.
//   * the stars: lower, reset or set one child's stars, reset everybody's; a way back for 5 seconds that never overwrites what others did since
//   * mentoring and volunteering next to the timetable: right the timetable, left the events, one row per hour — on the kids' TV (a day with events only) and on the staff's screens
//   * the contact page: a person kept once, linked to many events; phones never reach the kids' TV
// Not on live until Guy says so (liveCut).
const sec = { mode:'ev', from:null, tab:'events', start:null };
const secMe = () => { try { return portalMe() || {}; } catch(e){ return {}; } };
const secOn = () => typeof liveCut === 'function' && !liveCut() && typeof portalServerOn !== 'undefined' && portalServerOn;
const secIsMe = () => secOn() && (secMe().role === 'secretary' || !!(srv.profile && srv.profile.kind === 'secretary'));
const secStarsOk = () => secOn() && typeof ramzorPersonal !== 'undefined' && ramzorPersonal && (secIsMe() || !!(srv.profile && srv.profile.admin));          // (stars and "ילדים במסגרת": the secretary and the admin)
const secEventsOk = () => secOn() && (secIsMe() || ['coordinator', 'manager'].includes(secMe().role) || !!secMe().admin);          // (the home card; an ahmash reaches them from the control, during the shift)

// everything that talks to the database (the demo puts its own in: 19-demo.js)
const secApi = {
  between:async (from, to) => { const r = await sbPersonal.rpc('tt_events_between', { p_from:from, p_to:to }); if(r.error) throw r.error; return r.data || []; },
  save:async (id, scope, day, row) => { const r = await sbPersonal.rpc('tt_event_save', { p_id:id || null, p_scope:scope, p_day:day || null, p:row }); if(r.error) throw r.error; return r.data; },
  remove:async (id, scope, day) => { const r = await sbPersonal.rpc('tt_event_remove', { p_id:id, p_scope:scope, p_day:day }); if(r.error) throw r.error; },
  contacts:async () => { const r = await sbPersonal.from('tt_contact').select('id,name,phone').order('name'); if(r.error) throw r.error; return r.data || []; },
  contactAdd:async c => { const r = await sbPersonal.from('tt_contact').insert(c).select('id,name,phone').single(); if(r.error) throw r.error; return r.data; },
  contactChange:async (id, c) => { const r = await sbPersonal.from('tt_contact').update(c).eq('id', id); if(r.error) throw r.error; },
  contactRemove:async id => { const r = await sbPersonal.rpc('tt_contact_remove', { p_id:id }); if(r.error) throw r.error; return r.data; },
  canEdit:async () => { const r = await sbPersonal.rpc('can_edit_timetable'); return r.error ? null : !!r.data; },          // (null: the database has no v62 yet)
  stars:async () => { const r = await sb.from('child_state').select('child_id,stars'); if(r.error) throw r.error; const m = {}; (r.data || []).forEach(x => { m[x.child_id] = x.stars || 0; }); return m; },
  setStars:(id, compute) => updateChildState(id, compute)
};

// ---- the home cards
function secHomeCards(){
  const card = (id, ico, title, sub) => `<button type="button" class="home-card" id="${id}"><span class="apphome-emoji apphome-ico">${psIco(ico)}</span><span class="home-card-title">${title}</span><span class="home-card-sub">${sub}</span></button>`;
  return (secIsMe() ? card('apphome-sectt', 'schedule', 'לו"ז', 'הלו"ז של היום, של השבוע ועריכה') : '') + (secEventsOk() ? card('apphome-secev', 'people', 'חונכויות והתנדבויות', 'אירועים ודף קשר') : '');
}
function secHomeWire(){
  { const b = document.getElementById('apphome-sectt'); if(b) b.addEventListener('click', () => showSecScreen('tt')); }
  { const b = document.getElementById('apphome-secev'); if(b) b.addEventListener('click', () => showSecScreen('ev')); }
}
// ---- the Ramzor's first screen: two more cards
function secHubButtons(){
  const on = secStarsOk();
  { const b = document.getElementById('hub-stars-btn'); if(b) b.hidden = !on; }
  { const b = document.getElementById('hub-kidslist-btn'); if(b) b.hidden = !on; }
}
// "ילדים במסגרת" with the personal sign-in: only this part of the management screen, and writing with her own session (09a-management-lock.js)
const manageKidsOnly = () => { const v = document.getElementById('view-manage'); return !!(v && v.classList.contains('manage-kids-only')) && secStarsOk(); };
function showKidsList(){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById('view-manage'); v.classList.add('active', 'manage-kids-only');
  document.body.classList.remove('portal-mode'); window.scrollTo(0, 0);
  renderManageRoster();
}

// ---- the screen
function showSecScreen(mode, from){
  sec.mode = mode || sec.mode; sec.from = from || null;
  if(typeof sbPersonal !== 'undefined' && sbPersonal && typeof portalServerOn !== 'undefined' && portalServerOn) sb = sbPersonal;
  document.body.classList.remove('leopard-bg');
  portalActivateView('view-sec');
  let look = 'dark';
  try { look = (srv.portalTheme && srv.portalTheme !== 'leopard' ? srv.portalTheme : portalLoad().settings.theme) || 'dark'; } catch(e){}
  const title = { stars:'ניהול כוכבים', tt:'לו"ז', ev:'חונכויות והתנדבויות' }[sec.mode];
  document.getElementById('view-sec').innerHTML = `<div class="portal-shell" data-ptheme="${pEsc(look)}">
    <div class="portal-top"><button type="button" class="back-btn portal-back" id="sec-back">→ ${sec.mode === 'stars' || sec.from === 'control' ? 'חזרה' : 'מסך ראשי'}</button><h1 class="portal-title">${title}</h1><span class="portal-top-actions"></span></div>
    <div id="sec-screen"><div class="pnote">רק רגע...</div></div></div>`;
  document.getElementById('sec-back').addEventListener('click', () => { if(sec.from === 'control') showControl(); else if(sec.mode === 'stars') showHub(); else showAppHome(); });
  const box = document.getElementById('sec-screen');
  if(sec.mode === 'stars') return renderSecStars(box);
  if(sec.mode === 'tt') return mgrTimetable(box);
  return renderSecEvents(box);
}

// ---- the stars
const secName = id => { const c = (typeof roster !== 'undefined' ? roster : []).find(x => x.id === id); return c ? displayName(c) : '?'; };
const secKids = () => (typeof roster !== 'undefined' ? roster : []).slice().sort((a, b) => displayName(a).localeCompare(displayName(b), 'he'));
async function renderSecStars(box){
  let stars;
  try { stars = await secApi.stars(); } catch(e){ box.innerHTML = '<div class="pstatus bad">הכוכבים לא נטענו. אפשר לנסות שוב.</div>'; return; }
  if(!box.isConnected) return;
  const kids = secKids(), withStars = kids.filter(c => stars[c.id] > 0);
  box.innerHTML = `<div class="pnote">בחירה בילד/ה פותחת גריעה, איפוס או קביעת מספר מדויק.</div>
    <div class="sec-stars">${kids.map(c => `<button type="button" class="sec-star-row" data-sec-child="${c.id}"><span>${pEsc(displayName(c))}</span><b><bdi dir="ltr">⭐ ${stars[c.id] || 0}</bdi></b></button>`).join('') || '<div class="pnote">אין ילדים ברשימה.</div>'}</div>
    <div class="sec-danger"><button type="button" class="btn ghost danger" id="sec-reset-all"${withStars.length ? '' : ' disabled'}>איפוס כוכבים לכל הילדים</button></div>`;
  box.querySelectorAll('[data-sec-child]').forEach(b => b.addEventListener('click', () => secStarSheet(b.dataset.secChild, stars[b.dataset.secChild] || 0, box)));
  box.querySelector('#sec-reset-all').addEventListener('click', () => secResetAll(withStars.length, box));
}
// the way back gives back what THIS action took: stars given or taken by others since stay (never "the number it was")
async function secGiveBack(changes, box){
  const res = await Promise.all(changes.map(x => secApi.setStars(x.id, b => { const to = Math.max(0, (b.stars || 0) + x.delta); return to === b.stars ? null : { set:{ stars:to }, guard:['stars'] }; })));
  if(box.isConnected) renderSecStars(box);
  return res.every(r => r.ok || r.reason === 'declined');
}
async function secChangeOne(id, to, box){
  let delta = 0;
  const r = await secApi.setStars(id, b => { const now = b.stars || 0; if(now === to) return null; delta = now - to; return { set:{ stars:to }, guard:['stars'] }; });
  if(r.ok){ if(box.isConnected) renderSecStars(box); toastUndo(`${secName(id)}: ${to} כוכבים`, () => secGiveBack([{ id, delta }], box), 5000); return; }
  if(r.reason === 'declined'){ toast('לא היה מה לשנות'); return; }
  toast('השינוי לא נשמר. נסו שוב.');
}
function secStarSheet(id, now, box){
  const name = secName(id);
  const sh = portalSheet(`<h2>${pEsc(name)}</h2><div class="pnote">עכשיו: <b>${now}</b> כוכבים</div>
    <div class="sec-star-actions"><button type="button" class="btn ghost" id="sec-minus"${now > 0 ? '' : ' disabled'}>גריעת כוכב</button><button type="button" class="btn ghost" id="sec-zero"${now > 0 ? '' : ' disabled'}>איפוס</button></div>
    <label class="pfield">מספר כוכבים מדויק<input type="number" id="sec-exact" min="0" max="999" inputmode="numeric" value="${now}"></label>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>סגירה</button><button type="button" class="btn" id="sec-set">קביעה</button></div>`);
  const go = async (to, text) => { sh.close(); if(await confirmSheet({ title:name, text, okLabel:'כן', cancelLabel:'חזרה' })) secChangeOne(id, to, box); };
  sh.querySelector('#sec-minus').addEventListener('click', () => go(now - 1, `לגרוע כוכב אחד? יישארו ${now - 1}.`));
  sh.querySelector('#sec-zero').addEventListener('click', () => go(0, `לאפס את ${now} הכוכבים?`));
  sh.querySelector('#sec-set').addEventListener('click', () => {
    const v = sh.querySelector('#sec-exact').value.trim(), to = Number(v);
    if(v === '' || !Number.isInteger(to) || to < 0 || to > 999){ toast('כתבו מספר שלם, מ-0 עד 999'); return; }
    if(to === now){ sh.close(); return; }
    go(to, `לקבוע ${to} כוכבים במקום ${now}?`);
  });
}
async function secResetAll(n, box){
  if(!(await confirmSheet({ title:'איפוס כוכבים לכל הילדים', text:`הכוכבים של ${n} ילדים יתאפסו. אפשר יהיה לבטל במשך 5 שניות.`, okLabel:`כן, לאפס ${n} ילדים`, cancelLabel:'חזרה', danger:true }))) return;
  const ids = secKids().map(c => c.id), changes = [];
  const res = await Promise.all(ids.map(id => secApi.setStars(id, b => { const now = b.stars || 0; if(!now) return null; const c = changes.find(x => x.id === id); if(c) c.delta = now; else changes.push({ id, delta:now }); return { set:{ stars:0 }, guard:['stars'] }; })));
  if(box.isConnected) renderSecStars(box);
  const failed = res.filter(r => !r.ok && r.reason !== 'declined'), done = changes.filter(c => res[ids.indexOf(c.id)].ok);
  if(failed.length) toast(`⚠ ${failed.length} ילדים לא אופסו. נסו שוב.`);
  if(done.length) toastUndo(`אופסו הכוכבים של ${done.length} ילדים`, () => secGiveBack(done, box), 5000);
}

// ---- the events
const EV_GROUP = { small:'קטנים', big:'גדולים', all:'כולם', other:'אחר' };
const evGroupWord = e => e.group === 'other' ? (e.group_text || 'אחר') : EV_GROUP[e.group] || '';
const evText = e => e.kind === 'mentor' ? `חונכות ל${e.child || '?'} עם ${e.person}` : `${e.activity} עם ${e.person}`;
const evSub = e => e.kind === 'volunteer' ? `קבוצה: ${evGroupWord(e)}` : '';
const evRep = e => e.every_weeks ? (e.every_weeks === 1 ? 'כל שבוע' : `כל ${e.every_weeks} שבועות`) : e.monthly_nth ? 'כל חודש' : '';
const evTime = e => `${e.t}${e.end ? '–' + e.end : ''}`;
const evSeries = e => !!(e && (e.every_weeks || e.monthly_nth));
// one row per hour: an hour of the timetable and of an event is the same row; an event between two activities gets a row of its own, in its place;
// what starts together stays together (the row grows, the two sides stay level)
function ttRows(items, events){
  const hours = [...new Set([...items.map(a => a.t), ...events.map(e => e.t)])].filter(Boolean).sort();
  return hours.map(t => ({ t, main:items.filter(a => a.t === t), ev:events.filter(e => e.t === t) }));
}
function ttAlignedHtml(items, events, opts){
  const o = opts || {}, art = o.art || (id => `<span class="tta-emoji">${ttIcon(id)[2]}</span>`), cls = o.phase || (() => ''), tall = x => (x.end || x.kind === 'volunteer' ? 2.5 : 1.5), sum = l => l.reduce((n, x) => n + tall(x), 0), units = ttRows(items, events).reduce((n, r) => n + Math.max(1.5, sum(r.main), sum(r.ev)) + .7, 2.5);          // (the height of it all, in letters: the TV sizes the letters by it)
  return `<div class="tta${o.tv ? ' tta-tv' : ''}" style="--units:${units}"><div class="tta-head"><span></span><b>לו"ז</b><b>חונכויות והתנדבויות</b></div>${ttRows(items, events).map(r => `<div class="tta-row${cls(r)}">
      <div class="tta-time"><bdi dir="ltr">${pEsc(r.t)}</bdi></div>
      <div class="tta-main">${r.main.map(a => `<div class="tta-item">${art(a.i)}<span class="tta-name">${pEsc(a.n || '')}${a.end ? `<small><bdi dir="ltr">עד ${pEsc(a.end)}</bdi></small>` : ''}</span></div>`).join('')}</div>
      <div class="tta-ev">${r.ev.map(e => `<div class="tta-item tta-${e.kind}">${art(e.i)}<span class="tta-name">${pEsc(evText(e))}${e.end || e.kind === 'volunteer' ? `<small>${e.end ? `<bdi dir="ltr">עד ${pEsc(e.end)}</bdi>` : ''}${e.end && e.kind === 'volunteer' ? ' · ' : ''}${pEsc(evSub(e))}</small>` : ''}</span></div>`).join('')}</div>
    </div>`).join('')}</div>`;
}
const secToday = () => (typeof israelNow === 'function' ? israelNow().date : isoDate(new Date()));
const secShort = d => { const [, m, x] = d.split('-'); return `${+x}/${+m}`; };
async function renderSecEvents(box){
  const seg = `<div class="mx-seg mgr-tt-mode" role="group" aria-label="חונכויות והתנדבויות"><button type="button" data-sec-tab="events" aria-pressed="${sec.tab === 'events'}">אירועים</button><button type="button" data-sec-tab="contacts" aria-pressed="${sec.tab === 'contacts'}">דף קשר</button></div>`;
  box.innerHTML = seg + '<div id="sec-body"><div class="pnote">רק רגע...</div></div>';
  box.querySelectorAll('[data-sec-tab]').forEach(b => b.addEventListener('click', () => { sec.tab = b.dataset.secTab; renderSecEvents(box); }));
  const body = box.querySelector('#sec-body');
  if(!secKids().length && typeof mgrKids === 'function'){ try { await mgrKids(); } catch(e){} }
  if(sec.tab === 'contacts') return renderSecContacts(body);
  const from = sec.start || secToday(), to = addDays(from, 13);
  let list;
  try { list = await secApi.between(from, to); } catch(e){ body.innerHTML = '<div class="pstatus bad">האירועים לא נטענו. אפשר לנסות שוב.</div>'; return; }
  if(!body.isConnected) return;
  const byDay = {}; list.forEach(o => { (byDay[o.occ] = byDay[o.occ] || []).push(o); });
  body.innerHTML = `<div class="sec-add"><button type="button" class="btn small" data-ev-new="mentor">+ חונכות</button><button type="button" class="btn small" data-ev-new="volunteer">+ התנדבות</button></div>
    <div class="mcal-weeknav dg-weeknav"><button type="button" class="mcal-wk" data-ev-wk="-14" aria-label="שבועיים אחורה"><bdi dir="ltr">›</bdi></button><b><bdi dir="ltr">${secShort(from)}–${secShort(to)}</bdi></b><button type="button" class="mcal-wk" data-ev-wk="14" aria-label="שבועיים קדימה"><bdi dir="ltr">‹</bdi></button></div>
    ${Object.keys(byDay).length ? Object.keys(byDay).map(d => `<h3 class="psec">${pEsc(DOW_NAMES[dowOf(d)])} ${secShort(d)}</h3><div class="sec-evs">${byDay[d].map(o => `<button type="button" class="sec-ev" data-ev-open="${o.id}|${o.occ}"><span class="sec-ev-time"><bdi dir="ltr">${pEsc(evTime(o))}</bdi></span><span class="tta-emoji">${ttIcon(o.i)[2]}</span><span class="sec-ev-text">${pEsc(evText(o))}${evSub(o) || evRep(o) ? `<small>${pEsc([evSub(o), evRep(o)].filter(Boolean).join(' · '))}</small>` : ''}</span></button>`).join('')}</div>`).join('') : '<div class="pnote">אין אירועים בשבועיים האלה.</div>'}`;
  const again = () => renderSecEvents(box);
  body.querySelectorAll('[data-ev-new]').forEach(b => b.addEventListener('click', () => evEdit(null, b.dataset.evNew, again)));
  body.querySelectorAll('[data-ev-wk]').forEach(b => b.addEventListener('click', () => { sec.start = addDays(from, +b.dataset.evWk); again(); }));
  body.querySelectorAll('[data-ev-open]').forEach(b => b.addEventListener('click', () => { const [id, occ] = b.dataset.evOpen.split('|'); evEdit(list.find(o => o.id === id && o.occ === occ), null, again); }));
}
// a series: only this time, or from this time on. There is no "all of the series": what was is left as it was (null: a tap outside, nothing changes)
const evScope = verb => new Promise(res => {
  const q = portalSheet(`<h2>${verb}</h2><div class="pnote">זה אירוע חוזר. מה ${verb === 'מחיקה' ? 'למחוק' : 'לשנות'}?</div><div class="confirm-actions dg-scope"><button type="button" class="btn ghost" data-sc="one">רק הפעם</button><button type="button" class="btn" data-sc="on">מהפעם הזאת והלאה</button></div>`);
  q.querySelectorAll('[data-sc]').forEach(b => b.addEventListener('click', () => { q.close(); res(b.dataset.sc); }));
  q.addEventListener('click', e => { if(e.target === q) res(null); });
});
async function evEdit(o, kind, done){
  let contacts = [];
  try { contacts = await secApi.contacts(); } catch(e){ toast('דף הקשר לא נטען. אפשר לנסות שוב.'); return; }
  const k = o ? o.kind : kind, mentor = k === 'mentor', series = evSeries(o), day0 = o ? o.occ : secToday();
  let icon = (o && o.i) || (mentor ? 'reading' : 'other');
  const rep0 = !o ? 'once' : o.monthly_nth ? 'month' : o.every_weeks === 1 ? 'week' : o.every_weeks ? 'nw' : 'once';
  const people = sel => `<option value="">בחירה מהרשימה</option>${contacts.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${pEsc(c.name)}</option>`).join('')}<option value="new">+ איש קשר חדש</option>`;
  const sh = portalSheet(`<h2>${o ? 'עריכת' : 'הוספת'} ${mentor ? 'חונכות' : 'התנדבות'}</h2>
    ${mentor ? `<label class="pfield">ילד/ה<select id="ev-child"><option value="">בחירה</option>${secKids().map(c => `<option value="${c.id}"${o && o.child_id === c.id ? ' selected' : ''}>${pEsc(displayName(c))}</option>`).join('')}</select></label>`
             : `<label class="pfield">שם פעילות<input type="text" id="ev-activity" maxlength="60" value="${pEsc((o && o.activity) || '')}"></label>`}
    <label class="pfield">${mentor ? 'שם החונך' : 'שם המתנדב'}<select id="ev-person">${people(o && o.contact_id)}</select></label>
    <div class="sec-new-person" hidden><label class="pfield">שם<input type="text" id="ev-new-name" maxlength="80"></label><label class="pfield">טלפון (לא חובה)<input type="tel" id="ev-new-phone" maxlength="20" dir="ltr"></label></div>
    ${mentor ? '' : `<label class="pfield">קבוצה<select id="ev-group">${Object.keys(EV_GROUP).map(g => `<option value="${g}"${o && o.group === g ? ' selected' : ''}>${EV_GROUP[g]}</option>`).join('')}</select></label>
      <label class="pfield" id="ev-group-other"${o && o.group === 'other' ? '' : ' hidden'}>פירוט<input type="text" id="ev-group-text" maxlength="40" value="${pEsc((o && o.group_text) || '')}"></label>`}
    <label class="pfield">תאריך<input type="date" id="ev-day" value="${day0}"></label>
    <div class="sec-times"><div class="pfield"><span>שעת התחלה</span>${ttTimeHtml(o ? o.t : '', 0)}</div><div class="pfield"><span>שעת סיום (לא חובה)</span>${ttTimeHtml(o ? o.end || '' : '', 0, true)}</div></div>
    <div class="pfield"><span>תמונה</span><button type="button" class="ctl-tt-icon sec-ev-icon" id="ev-icon" aria-label="בחירת תמונה">${ttIcon(icon)[2]}</button></div>
    <label class="pfield">תדירות<select id="ev-rep">${TT_REP.map(([v, w]) => `<option value="${v}"${rep0 === v ? ' selected' : ''}>${w}</option>`).join('')}</select></label>
    <label class="pfield" id="ev-n-wrap"${rep0 === 'nw' ? '' : ' hidden'}>כל כמה שבועות<input type="number" id="ev-n" min="2" max="12" value="${(o && o.every_weeks > 1 && o.every_weeks) || 2}"></label>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="ev-save">שמירה</button></div>
    ${o ? '<button type="button" class="btn ghost danger sec-ev-del" id="ev-del">מחיקה</button>' : ''}`);
  const $ = id => sh.querySelector('#' + id);
  $('ev-person').addEventListener('change', () => { sh.querySelector('.sec-new-person').hidden = $('ev-person').value !== 'new'; });
  if(!mentor) $('ev-group').addEventListener('change', () => { $('ev-group-other').hidden = $('ev-group').value !== 'other'; });
  $('ev-rep').addEventListener('change', () => { $('ev-n-wrap').hidden = $('ev-rep').value !== 'nw'; });
  $('ev-icon').addEventListener('click', () => {
    const opt = ([id, word, e]) => `<button type="button" class="ctl-icon-opt${icon === id ? ' on' : ''}" data-icon="${id}"><span>${e}</span><small>${word}</small></button>`;
    const p = portalSheet(`<h2>תמונה</h2><div class="ctl-icons">${TT_ICON_LIST.map(opt).join('')}</div><details class="ctl-icons-more"><summary>עוד תמונות</summary>${TT_ICON_MORE.map(([w, l]) => `<h3 class="psec">${w}</h3><div class="ctl-icons">${l.map(opt).join('')}</div>`).join('')}</details><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div>`);
    p.querySelectorAll('[data-icon]').forEach(b => b.addEventListener('click', () => { icon = b.dataset.icon; $('ev-icon').textContent = ttIcon(icon)[2]; p.close(); }));
  });
  $('ev-save').addEventListener('click', async () => {
    const start = ttTimeOf(sh.querySelector('[data-tt-time]')), end = ttTimeOf(sh.querySelector('[data-tt-end]')), day = $('ev-day').value, rep = $('ev-rep').value, n = Math.max(2, Math.min(12, +$('ev-n').value || 2));
    if(mentor && !$('ev-child').value){ toast('בחרו ילד/ה'); return; }
    if(!mentor && !$('ev-activity').value.trim()){ toast('כתבו שם פעילות'); $('ev-activity').focus(); return; }
    if(!$('ev-person').value){ toast(`בחרו ${mentor ? 'חונך' : 'מתנדב'}`); return; }
    if(!day || !start){ toast('בחרו תאריך ושעת התחלה'); return; }
    if(end && end <= start){ toast('שעת הסיום לפני שעת ההתחלה'); return; }
    let scope = 'all';
    if(series){ scope = await evScope('שינוי'); if(!scope) return; }
    try {
      let contact = $('ev-person').value;
      if(contact === 'new'){
        const name = $('ev-new-name').value.trim(), phone = secPhone($('ev-new-phone').value);
        if(!name){ toast('כתבו את שם איש הקשר'); $('ev-new-name').focus(); return; }
        if(phone === false){ toast('מספר הטלפון לא תקין'); return; }
        const c = await secApi.contactAdd({ name, phone }); contact = c.id;
      }
      const row = { kind:k, contact_id:contact, icon, day, start_time:start, end_time:end || null, every_weeks:rep === 'week' ? 1 : rep === 'nw' ? n : null, monthly_nth:rep === 'month' ? Math.ceil(parseIso(day).getDate() / 7) : null };
      if(mentor) row.child_id = $('ev-child').value; else Object.assign(row, { activity:$('ev-activity').value.trim(), group_kind:$('ev-group').value, group_text:$('ev-group').value === 'other' ? $('ev-group-text').value.trim() || null : null });
      await secApi.save(o ? o.id : null, scope, o ? o.occ : null, row);
    } catch(e){ console.error(e); toast('השמירה נכשלה. נסו שוב.'); return; }
    sh.close(); toast('נשמר'); ttNudgeTv(); done();
  });
  if(o) $('ev-del').addEventListener('click', async () => {
    let scope = 'one';
    if(series){ scope = await evScope('מחיקה'); if(!scope) return; }
    else if(!(await confirmSheet({ title:'למחוק את האירוע?', text:evText(o), okLabel:'כן, למחוק', cancelLabel:'חזרה', danger:true }))) return;
    try { await secApi.remove(o.id, scope, o.occ); } catch(e){ console.error(e); toast('המחיקה נכשלה. נסו שוב.'); return; }
    sh.close(); toast('נמחק'); ttNudgeTv(); done();
  });
}
// a phone: empty (null), a good one (kept with the digits only), or false
function secPhone(v){ const d = digitsOnly(v); if(!d) return null; return /^0\d{8,9}$/.test(d) || /^972\d{8,9}$/.test(d) ? d : false; }
const secWa = phone => { const d = digitsOnly(phone); return d ? 'https://wa.me/' + (d.startsWith('0') ? '972' + d.slice(1) : d) : ''; };
async function renderSecContacts(body){
  let list;
  try { list = await secApi.contacts(); } catch(e){ body.innerHTML = '<div class="pstatus bad">דף הקשר לא נטען. אפשר לנסות שוב.</div>'; return; }
  if(!body.isConnected) return;
  body.innerHTML = `<div class="sec-add"><button type="button" class="btn small" id="sec-contact-new">+ איש קשר</button></div>
    <div class="sec-contacts">${list.map(c => `<div class="sec-contact"><button type="button" class="sec-contact-main" data-contact="${c.id}"><b>${pEsc(c.name)}</b>${c.phone ? `<small><bdi dir="ltr">${pEsc(formatPhone(c.phone))}</bdi></small>` : '<small>אין טלפון</small>'}</button>${secPhone(c.phone) ? `<a class="btn ghost small" href="${secWa(c.phone)}" target="_blank" rel="noopener">וואטסאפ</a>` : ''}</div>`).join('') || '<div class="pnote">עוד אין אנשי קשר.</div>'}</div>`;
  const again = () => renderSecContacts(body);
  body.querySelector('#sec-contact-new').addEventListener('click', () => secContactSheet(null, again));
  body.querySelectorAll('[data-contact]').forEach(b => b.addEventListener('click', () => secContactSheet(list.find(c => c.id === b.dataset.contact), again)));
}
function secContactSheet(c, done){
  const sh = portalSheet(`<h2>${c ? 'עריכת איש קשר' : 'איש קשר חדש'}</h2>
    <label class="pfield">שם<input type="text" id="sc-name" maxlength="80" value="${pEsc((c && c.name) || '')}"></label>
    <label class="pfield">טלפון<input type="tel" id="sc-phone" maxlength="20" dir="ltr" value="${pEsc((c && c.phone && formatPhone(c.phone)) || '')}"></label>
    ${c ? '<div class="pnote">שינוי כאן יחול בכל החונכויות וההתנדבויות של איש הקשר.</div>' : ''}
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="sc-save">שמירה</button></div>
    ${c ? '<button type="button" class="btn ghost danger sec-ev-del" id="sc-del">הסרה</button>' : ''}`);
  sh.querySelector('#sc-save').addEventListener('click', async () => {
    const name = sh.querySelector('#sc-name').value.trim(), phone = secPhone(sh.querySelector('#sc-phone').value);
    if(!name){ toast('כתבו שם'); return; }
    if(phone === false){ toast('מספר הטלפון לא תקין'); return; }
    try { if(c) await secApi.contactChange(c.id, { name, phone }); else await secApi.contactAdd({ name, phone }); } catch(e){ console.error(e); toast('השמירה נכשלה. נסו שוב.'); return; }
    sh.close(); toast('נשמר'); ttNudgeTv(); done();
  });
  if(c) sh.querySelector('#sc-del').addEventListener('click', async () => {
    if(!(await confirmSheet({ title:`להסיר את ${c.name}?`, text:'איש הקשר ייצא מהדף.', okLabel:'כן, להסיר', cancelLabel:'חזרה', danger:true }))) return;
    let r; try { r = await secApi.contactRemove(c.id); } catch(e){ console.error(e); toast('ההסרה נכשלה. נסו שוב.'); return; }
    sh.close();
    if(r && r.ok){ toast('הוסר'); done(); return; }
    // nothing is removed in silence: what is still ahead is shown, and it is handled first (Guy 5 Nov)
    const line = e => `<li>${pEsc(e.kind === 'mentor' ? `חונכות ל${e.child || '?'}` : e.activity)} · <bdi dir="ltr">${pEsc(e.t)}</bdi> · ${pEsc(evRep(e) || secShort(e.day))}</li>`;
    portalSheet(`<h2>אי אפשר להסיר עדיין</h2><div class="pnote">ל${pEsc(c.name)} יש אירועים קדימה. קודם מוחקים אותם, או מחליפים בהם את איש הקשר ("מהפעם הזאת והלאה"), ואז מסירים.</div><ul class="sec-ahead">${((r && r.ahead) || []).map(line).join('')}</ul><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>הבנתי</button></div>`);
  });
}
// the kids' TV reads again at once (it would anyway within a minute). Nothing depends on it
function ttNudgeTv(){
  try {
    if(typeof sendTvCommand === 'function' && sendTvCommand('tt')) return;
    const ch = sb.channel(TV_CHANNEL, { config:{ broadcast:{ self:false } } });
    ch.subscribe(st => { if(st === 'SUBSCRIBED'){ ch.send({ type:'broadcast', event:'cmd', payload:{ cmd:'tt' } }); setTimeout(() => sb.removeChannel(ch), 1500); } });
  } catch(e){ /* the minute's reading will bring it */ }
}
