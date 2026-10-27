// ---------- MERCURY: THE THERAPY PORTAL — one portal, what each one needs ----------
// One card on the app home, "פורטל הטיפול" (Guy, 2026-10-22). The therapist and the staff need different things, so inside it each sees their own:
//  · a therapist (and the admin): "מה דורש אותי" first (new observations, journeys waiting for an approval,
//    strengths that rose in the temple, plans to review, children without a published plan), then "הילדים שלי" with the status of each,
//    the library and the settings. A child opens as a workspace in tabs: the plan, the observations, the tracking, the journey, the temple.
//  · the rest of the staff: phone-first. Every child's card shows what to avoid and what to do in focus without a
//    tap, an observation button on every card, "עודכן לאחרונה" on top, and "התצפיות שלי" with the therapist's answers.
// Somebody with both roles (an instructor who is also a therapist, the admin) gets the therapist's tabs and the staff's two tabs too
// ("כל הילדים", "התצפיות שלי"). The admin and the coordinator assign the responsible therapist of every child. The personal sign-in only. (scheduling-v31.sql, v32.sql; Mercury spec, decisions 1-6, 44-46)
const thp = { loaded:false, ok:false, mode:'staff', mine:[], assign:{}, therapists:[], tab:null, guidance:{}, plans:{}, planets:[], library:[], v32:false,
  editing:null, wtab:null, unseen:{}, journeys:{}, risen:[], myObs:[], q:'' };
const therapyAvailable = () => mercuryOn() && typeof portalServerOn !== 'undefined' && portalServerOn && !!srv.profile && 'therapist' in srv.profile;          // (my_profile carries "therapist" from v31)
const isTherapistMe = () => !!(srv.profile && srv.profile.therapist);
const isPureTherapist = () => (portalMe() || {}).role === 'therapist';
const canAssignTherapist = () => !!(srv.meRow && (srv.meRow.role === 'coordinator' || srv.meRow.admin));
const canTherapistPortal = () => isTherapistMe() || !!(srv.profile && srv.profile.admin);
const canStaffPortal = () => !isPureTherapist();

async function thpLoad(){
  thp.ok = false;
  try {
    const mine = await sbPersonal.rpc('my_therapy_children'); if(mine.error) throw mine.error;
    thp.mine = (mine.data || []).map(r => typeof r === 'string' ? r : r.my_therapy_children);
    thp.assign = {}; thp.therapists = [];
    if(canAssignTherapist()){
      const [a, s, p] = await Promise.all([
        sbPersonal.from('child_therapist').select('child_id,staff_id'),
        sbPersonal.from('staff').select('id,display_name,kind,active'),
        sbPersonal.from('staff_private').select('staff_id,is_therapist')
      ]);
      if(a.error || s.error || p.error) throw (a.error || s.error || p.error);
      (a.data || []).forEach(r => { thp.assign[r.child_id] = r.staff_id; });
      const flag = {}; (p.data || []).forEach(r => { flag[r.staff_id] = !!r.is_therapist; });
      thp.therapists = (s.data || []).filter(x => x.active && (x.kind === 'therapist' || flag[x.id])).sort((x, y) => String(x.display_name).localeCompare(String(y.display_name), 'he'));
      try { const sb2 = await sbPersonal.from('therapist_subs').select('*').order('until'); thp.subs = sb2.error ? null : (sb2.data || []); } catch(e){ thp.subs = null; }          // (scheduling-v40.sql)
    }
    thp.ok = true;
  } catch(e){ thp.ok = false; }
  // stage 2: the plans (scheduling-v32.sql): the guidance every staff member sees, the plans this person may edit, the planets and the libraries
  thp.guidance = {}; thp.plans = {}; thp.planets = []; thp.library = []; thp.v32 = false;
  if(thp.ok) try {
    const [g, pl, pn, lb] = await Promise.all([sbPersonal.rpc('plan_guidance'), sbPersonal.from('child_plans').select('*'), sbPersonal.from('journey_planets').select('*').order('created_at'), sbPersonal.from('mercury_library').select('*').order('title')]);
    if(g.error || pl.error || pn.error || lb.error) throw (g.error || pl.error || pn.error || lb.error);
    (g.data || []).forEach(r => { thp.guidance[r.child_id] = r; });
    (pl.data || []).forEach(r => { thp.plans[r.child_id] = r; });
    thp.planets = pn.data || []; thp.library = lb.data || []; thp.v32 = true;
    if(isTherapistMe()) await obsLoadNotify();
  } catch(e){ thp.v32 = false; }
  // what each portal needs on top: the therapist — what waits for them; the staff — their own observations
  thp.unseen = {}; thp.journeys = {}; thp.risen = []; thp.myObs = []; thp.questions = {};
  if(thp.v32) try {
    if(canStaffPortal()){
      const r = await sbPersonal.from('observations').select('id,child_id,text,audio_path,created_at,seen_at,reply,replied_at').eq('author', srv.me).order('created_at', { ascending:false }).limit(40);
      thp.myObs = r.data || [];
    }
    if(thp.mode === 'therapist'){
      const since = new Date(Date.now() - 14 * 864e5).toISOString();
      const [o, j, s] = await Promise.all([
        sbPersonal.from('observations').select('child_id').is('seen_at', null),
        sbPersonal.from('child_journeys').select('child_id,route,planet_idx,stage,step,next_approved'),
        sbPersonal.from('child_strengths').select('child_id,strength,updated_at').eq('status', 'main').gte('updated_at', since)]);
      (o.data || []).forEach(r => { thp.unseen[r.child_id] = (thp.unseen[r.child_id] || 0) + 1; });
      try { const qa = await sbPersonal.from('observations').select('child_id').eq('kind', 'question').is('reply', null); (qa.data || []).forEach(r => { thp.questions[r.child_id] = (thp.questions[r.child_id] || 0) + 1; }); } catch(e){}          // (the questions not answered yet: v40)
      (j.data || []).forEach(r => { thp.journeys[r.child_id] = r; });
      thp.risen = s.data || [];
    }
  } catch(e){}
  if(thp.v32) await thpVideosLoad();          // (the plan videos: scheduling-v41.sql; 14zc)
  if(thp.v32 && thp.mode === 'therapist') await bankLoad();          // (the goal bank: favourites, use counts, the center's options; scheduling-v42.sql; 14zd)
  if(thp.v32){ if(!thp.mopts) thp.mopts = {}; await careLoad(); }          // (the stays, marks, family, incidents: scheduling-v43.sql; 14ze)
  thp.loaded = true;
}

// the tabs of each portal
function thpTabs(){
  const t = [];
  if(thp.mode === 'therapist'){
    t.push(['todo', 'משימות'], ['mine', 'הילדים שלי']);
    if(thp.v32) t.push(['plans', 'תכניות טיפוליות']);          // (the plans, one goal at a time: 14zf)
    t.push(['kids', 'כל הילדים']);          // (every child as the staff sees it, read only: Mercury decision 87)
    if(canStaffPortal() && thp.v32) t.push(['myobs', 'התצפיות שלי']);
    if(thp.v32) t.push(['library', 'ספרייה']);
    if(thp.v32 && isTherapistMe()) t.push(['settings', 'הגדרות']);
    if(canAssignTherapist()) t.push(['assign', 'שיוך אנשי טיפול']);
    if(thp.v32 && canAssignTherapist()) t.push(['videos', 'צפייה בסרטונים']);
    if(thp.v32 && srv.profile && srv.profile.admin) t.push(['overview', 'תמונת מצב']);
    if(thp.v43 && srv.profile && srv.profile.admin) t.push(['archive', 'ארכיון']);
  } else {
    t.push(['kids', 'הילדים']);
    if(thp.v32) t.push(['myobs', 'התצפיות שלי']);
    if(canAssignTherapist()) t.push(['assign', 'שיוך אנשי טיפול']);
    if(thp.v32 && canAssignTherapist()) t.push(['videos', 'צפייה בסרטונים']);
  }
  return t;
}
// a row of tabs: 4 visible, the rest under "עוד" (Guy, after the simplicity checker: tabs must fit a phone). tabs = [[key, word, badge]]
function thpTabsRow(tabs, active, attr, cls){
  const btn = ([k, w, n]) => `<button type="button" role="tab" ${attr}="${k}" class="${k === active ? 'active' : ''}">${w}${n ? ` <span class="pcount">${n}</span>` : ''}</button>`;
  if(tabs.length <= 5) return `<nav class="portal-tabs${cls ? ' ' + cls : ''}" role="tablist">${tabs.map(btn).join('')}</nav>`;
  const rest = tabs.slice(4), hidden = rest.find(t => t[0] === active), n = rest.reduce((s, t) => s + (+t[2] || 0), 0);
  return `<nav class="portal-tabs${cls ? ' ' + cls : ''}" role="tablist">${tabs.slice(0, 4).map(btn).join('')}
    <details class="tab-more"><summary class="${hidden ? 'active' : ''}"><span>${hidden ? pEsc(hidden[1]) : 'עוד'}</span> <span aria-hidden="true">▾</span>${n ? ` <span class="pcount">${n}</span>` : ''}</summary><div class="tab-more-list">${rest.map(btn).join('')}</div></details></nav>`;
}
// what the person sees inside: a therapist (or the admin) the therapist's tabs; everybody else the staff's
async function showTherapyPortal(){
  thp.mode = canTherapistPortal() ? 'therapist' : 'staff';
  portalActivateView('view-therapy');
  const view = document.getElementById('view-therapy');
  thp.tab = null; thp.editing = null; thp.wtab = null; thp.q = ''; thp.planChild = null;          // (every entry starts on the first tab of this portal)
  view.innerHTML = `<div class="portal-shell therapy-shell" data-ptheme="${portalLoad().settings.theme || 'dark'}"><div class="pnote">טוען...</div></div>`;
  if(typeof roster !== 'undefined' && !roster.length && typeof initRoster === 'function'){ try { await initRoster(); } catch(e){} }          // (a therapist who came in by a refresh: the children were not loaded yet)
  await thpLoad();
  thpRender();
}
const thpKids = () => (typeof roster !== 'undefined' ? roster : []).filter(c => !(typeof careArchived === 'function' && careArchived(c.id))).sort((a, b) => displayName(a).localeCompare(displayName(b), 'he'));          // (an archived child is out of every list: Mercury 129)
const thpAvatar = c => { const k = typeof characterFor === 'function' && characterFor(c.id); return k ? `<span class="th-av">${charImgHtml(k)}</span>` : `<span class="th-av th-av-name ar-keep">${pEsc(displayName(c).slice(0, 2))}</span>`; };
// the children of the therapist's portal: their own; the admin — all of them
const thpScope = () => { const kids = thpKids(); if(srv.profile && srv.profile.admin) return kids; const mine = new Set(thp.mine); return kids.filter(c => mine.has(c.id)); };
const thpDaysTo = d => Math.round((new Date(d + 'T12:00:00') - new Date(isoDate(new Date()) + 'T12:00:00')) / 864e5);

// ---- "מה דורש אותי": every item opens the child's workspace on the right tab
function thpTodo(){
  const items = [], scope = thpScope(), ids = new Set(scope.map(c => c.id)), name = id => { const c = roster.find(x => x.id === id); return c ? displayName(c) : id; };
  const add = (id, tab, emoji, text, order) => items.push({ id, tab, emoji, text, order, name:name(id) });
  scope.forEach(c => {
    const n = thp.unseen[c.id] || 0; if(n) add(c.id, 'obs', '📝', n === 1 ? 'תצפית חדשה מהצוות' : `${n} תצפיות חדשות מהצוות`, 1);
    const qn = (thp.questions || {})[c.id] || 0; if(qn) add(c.id, 'obs', '❓', qn === 1 ? 'שאלה מהצוות שמחכה לתשובה' : `${qn} שאלות מהצוות שמחכות לתשובה`, 1);
    const vd = (thp.videos || {})[c.id]; if(vd && vd.status === 'draft') add(c.id, 'plan', '🎬', 'סרטון חדש מחכה לאישור שלך', 1);
    const j = thp.journeys[c.id]; if(j && j.stage === 'extra' && !j.next_approved) add(c.id, 'journey', '🚀', 'סיים/ה את ההרפתקה. מחכה לאישור שלך למעבר לכוכב הבא', 2);
    const row = thp.plans[c.id];
    if(row && row.published_version && row.review_date){ const d = thpDaysTo(row.review_date); if(d <= 14) add(c.id, 'plan', '🗓️', d < 0 ? `עבר מועד הבדיקה מחדש של התוכנית (${dayLabel(row.review_date)})` : d === 0 ? 'היום מועד הבדיקה מחדש של התוכנית' : `בדיקה מחדש של התוכנית בעוד ${d} ימים`, 3); }
    if(!row || !row.published_version) add(c.id, 'plan', '📋', row && row.draft ? 'יש טיוטה שעוד לא פורסמה' : 'עוד אין תוכנית טיפולית', 4);
    else if(row.draft && JSON.stringify(row.draft) !== JSON.stringify(row.published)) add(c.id, 'plan', '✏️', 'יש שינויים בתוכנית שעוד לא פורסמו', 4);
    careTodo(c, add);
  });
  thp.risen.filter(s => ids.has(s.child_id)).forEach(s => add(s.child_id, 'temple', '🏛️', `החוזקה "${s.strength}" עלתה למקדש`, 5));
  return items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he'));
}
function thpTodoHtml(){
  const items = thpTodo();
  if(!items.length) return '<div class="th-empty"><span aria-hidden="true">🌿</span><b>הכול מעודכן</b><small>אין כרגע משהו שמחכה לך.</small></div>';
  const card = l => { const x = l[0], c = roster.find(k => k.id === x.id);          // (one card per child, a line per item: the checker, principle 5)
    return `<div class="th-todo th-todo-card">${c ? thpAvatar(c) : ''}<span class="th-kid-text"><b class="ar-keep">${pEsc(x.name)}</b>${l.map(y => `<button type="button" class="th-todo-line" data-todo-kid="${pEsc(y.id)}" data-todo-tab="${y.tab}"><span aria-hidden="true">${y.emoji}</span> ${pEsc(y.text)}<span class="th-todo-go" aria-hidden="true">‹</span></button>`).join('')}</span></div>`; };
  const byKid = l => { const m = new Map(); l.forEach(x => { if(!m.has(x.id)) m.set(x.id, []); m.get(x.id).push(x); }); return [...m.values()]; };
  const groups = [['דחוף', items.filter(x => x.order <= 1), true], ['השבוע', items.filter(x => x.order >= 2 && x.order <= 3), true], ['לידיעה', items.filter(x => x.order >= 4), false]];          // (by urgency, in groups: Q44)
  return groups.filter(g => g[1].length).map(([w, l, open]) => `<details class="pfold th-todo-group"${open ? ' open' : ''}><summary><span>${w}</span><span class="pcount">${l.length}</span></summary><div class="pfold-body th-todo-list">${byKid(l).map(card).join('')}</div></details>`).join('');
}
// ---- "הילדים שלי": the status of every child, at a glance
function thpStatusCard(c){
  const row = thp.plans[c.id] || {}, n = thp.unseen[c.id] || 0, j = thp.journeys[c.id], planets = {};
  (thp.planets || []).forEach(p => { planets[p.id] = p; });
  const lines = [planStatus(c.id)];
  if(j && typeof journeyWhere === 'function') lines.push('המסע: ' + journeyWhere(j, planets));
  return `<button type="button" class="th-kid th-stat${row.published_version ? ' has-plan' : ''}" data-th-kid="${pEsc(c.id)}">${thpAvatar(c)}<span class="th-kid-text"><b class="ar-keep">${pEsc(displayName(c))}</b>${lines.map(l => `<small>${pEsc(l)}</small>`).join('')}</span>${n ? `<span class="pcount" title="תצפיות חדשות">${n}</span>` : ''}</button>`;
}
// ---- the staff: one child's card, what matters without a tap
function thpStaffCard(c){
  const g = thp.guidance[c.id], ct = g && g.content, focus = ct ? (ct.goals || []).filter(x => x.focus && x.title) : [], strengths = ct ? [...new Set((ct.goals || []).flatMap(x => x.strengths || []))] : [];
  return `<article class="th-kcard${g ? ' has-plan' : ''}" data-th-card="${pEsc(c.id)}">
    <div class="th-kcard-head">${thpAvatar(c)}<b class="ar-keep">${pEsc(displayName(c))}</b>${g ? `<button type="button" class="btn ghost small" data-th-kid="${pEsc(c.id)}">עוד</button>` : ''}</div>
    ${thpVideoBtnHtml(c.id)}${careCardHtml(c)}
    ${g ? `${strengths.length ? `<div class="th-chips ar-keep">${strengths.map(s => `<span class="th-chip">${pEsc(s)}</span>`).join('')}</div>` : ''}
      ${focus.map(x => tpIsV2(x) ? `<div class="th-kfocus">${tpStaffGoalHtml(c.id, x, true)}</div>` : `<div class="th-kfocus"><b class="ar-keep">${pEsc(x.title)}</b>${x.interventions ? `<div class="ar-keep">${pEsc(x.interventions)}</div>` : ''}${x.sentences ? `<div class="th-ksent ar-keep"><span aria-hidden="true">💬</span> ${pEsc(x.sentences)}</div>` : ''}${careWeekLine(c.id, x.id)}</div>`).join('')}
      ${ct.avoid ? `<div class="th-avoid"><b>ממה להימנע</b><div class="ar-keep">${pEsc(ct.avoid)}</div></div>` : ''}
      ${!ct.avoid && !focus.length ? '<div class="pnote">אין כרגע מטרות במוקד. "עוד" פותח את כל התוכנית.</div>' : ''}`
      : '<div class="th-kcard-none">עוד אין תוכנית טיפולית</div>'}
    ${thp.v32 ? `<div class="th-kcard-acts"><button type="button" class="btn ghost small th-kcard-obs" data-th-obs="${pEsc(c.id)}">📝 תצפית</button><button type="button" class="btn ghost small th-kcard-obs" data-th-ask="${pEsc(c.id)}">❓ שאלה למטפל/ת</button>${thp.v43 ? `<button type="button" class="btn ghost small th-kcard-obs" data-th-inc="${pEsc(c.id)}">⚠️ אירוע</button>` : ''}</div>` : ''}
  </article>`;
}
function thpStaffKidsHtml(){
  const kids = thpKids(), week = Date.now() - 7 * 864e5;
  const fresh = kids.filter(c => { const g = thp.guidance[c.id]; return g && g.published_at && new Date(g.published_at).getTime() >= week; });
  return `${fresh.length ? `<div class="th-fresh"><span>עודכן לאחרונה:</span>${fresh.map(c => `<button type="button" class="th-chip" data-th-kid="${pEsc(c.id)}"><span class="ar-keep">${pEsc(displayName(c))}</span></button>`).join('')}</div>` : ''}
    ${thpVideoBannerHtml()}${careMarksBannerHtml()}
    <input type="search" class="th-search" id="th-q" placeholder="חיפוש ילד/ה" aria-label="חיפוש ילד/ה" value="${pEsc(thp.q)}">
    <div class="th-kcards" id="th-kcards">${thpStaffOrder(kids).map(thpStaffCard).join('')}</div>`;
}
// the staff's list of children: the ones whose plan was published in the last week first, then by name
function thpStaffOrder(kids){
  const week = Date.now() - 7 * 864e5, fresh = c => { if(thpVideoNew(c.id)) return 0; const g = thp.guidance[c.id]; return g && g.published_at && new Date(g.published_at).getTime() >= week ? 0 : 1; };          // (a new video, or a plan updated lately, first)
  return kids.slice().sort((a, b) => fresh(a) - fresh(b) || displayName(a).localeCompare(displayName(b), 'he'));
}
// ---- the staff: "התצפיות שלי" and what the therapist answered
function thpMyObsHtml(){
  if(!thp.myObs.length) return '<div class="th-empty"><span aria-hidden="true">📝</span><b>עוד לא שלחת תצפיות</b><small>בכל כרטיס של ילד יש כפתור "תצפית". כמה מילים מספיקות.</small></div>';
  return `<div class="th-myobs">${thp.myObs.map(o => { const c = roster.find(x => x.id === o.child_id);
    return `<div class="obs-item" data-myobs="${o.id}"><div class="obs-head"><b class="ar-keep">${pEsc(c ? displayName(c) : '')}</b><small>${pEsc(dayLabel(String(o.created_at).slice(0, 10)))} ${String(o.created_at).slice(11, 16)}</small></div>
      ${o.text ? `<div class="obs-body">${pEsc(o.text)}</div>` : ''}${o.audio_path ? '<div class="pnote">🎙️ הקלטה</div>' : ''}
      ${o.reply != null ? `<div class="obs-reply">איש/אשת הטיפול: ${pEsc(o.reply || 'ראיתי, תודה')}</div>` : `<div class="obs-wait">${o.seen_at ? 'נקרא' : 'עוד לא נקרא'}</div>`}</div>`; }).join('')}</div>`;
}

function thpRender(){
  const view = document.getElementById('view-therapy'); if(!view) return;
  const tabs = thpTabs(); if(!tabs.some(t => t[0] === thp.tab)) thp.tab = tabs.length ? tabs[0][0] : null;
  const me = portalMe() || {}, kids = thpKids(), ther = thp.mode === 'therapist';
  let inner = '';
  if(!thp.ok) inner = '<div class="pnote">פורטל הטיפול עוד לא מוכן בשרת הזה, או שאין חיבור כרגע. אפשר לנסות שוב בעוד רגע.</div>';
  else if(thp.tab === 'todo') inner = thp.v32 ? thpTodoHtml() : '<div class="pnote">בניית התוכניות תגיע בשלב הבא.</div>';
  else if(thp.tab === 'mine'){
    const list = thpScope();
    inner = list.length ? `<div class="th-kids">${list.map(thpStatusCard).join('')}</div>` : '<div class="pnote">עוד לא שויכו אלייך ילדים. השיוך נעשה אצל הרכזת או מנהל המערכת.</div>';
  } else if(thp.tab === 'settings') inner = obsNotifyHtml();
  else if(thp.tab === 'kids') inner = thpStaffKidsHtml();
  else if(thp.tab === 'myobs') inner = thpMyObsHtml();
  else if(thp.tab === 'library') inner = planLibraryHtml();
  else if(thp.tab === 'plans') inner = tpListHtml();
  else if(thp.tab === 'videos') inner = thpVideosHtml();
  else if(thp.tab === 'overview') inner = thpOverviewHtml() + bankOverviewHtml();
  else if(thp.tab === 'archive') inner = '<div id="cr-archive"><div class="pnote">טוען...</div></div>';
  else if(thp.tab === 'assign'){
    const opts = sel => `<option value="">ללא</option>${thp.therapists.map(t => `<option value="${t.id}"${sel === t.id ? ' selected' : ''}>${pEsc(t.display_name)}</option>`).join('')}`;
    inner = `<div class="pnote">לכל ילד איש/אשת טיפול אחראי/ת אחד/ת. רק הוא/היא רואה את המידע הטיפולי של הילד ובונה את התוכנית שלו. כל שינוי נרשם.</div>
      ${thp.therapists.length ? '' : '<div class="pnote">עוד אין אנשי טיפול במערכת. מוסיפים בהגדרות (תפקיד "איש/אשת טיפול"), או מסמנים "גם איש/אשת טיפול" בפורטל הניהול.</div>'}
      <div class="th-assign">${kids.map(c => `<div class="th-assign-row">${thpAvatar(c)}<b class="ar-keep">${pEsc(displayName(c))}</b><select data-th-assign="${pEsc(c.id)}" aria-label="איש/אשת הטיפול של ${pEsc(displayName(c))}">${opts(thp.assign[c.id] || '')}</select></div>`).join('')}</div>
      ${thp.subs ? thpSubsHtml() : ''}`;
  }
  const todoN = ther && thp.v32 ? thpTodo().length : 0;
  view.innerHTML = `<div class="portal-shell therapy-shell" data-ptheme="${portalLoad().settings.theme || 'dark'}" data-thmode="${thp.mode}">
      <div class="portal-top"><button type="button" class="back-btn portal-back" id="therapy-home">→ מסך ראשי</button><h1 class="portal-title">פורטל הטיפול</h1><span></span></div>
      <div class="portal-hello">שלום ${pEsc(me.first || '')}</div>
      ${tabs.length > 1 ? thpTabsRow(tabs.map(t => [t[0], t[1], t[0] === 'todo' ? todoN : 0]), thp.tab, 'data-th-tab') : ''}
      <div id="therapy-body">${inner}</div>
    </div>`;
  view.querySelector('#therapy-home').addEventListener('click', () => { if(typeof personalRamzorKind === 'function' && !personalRamzorKind()) srvOpenPortal(); else showAppHome(); });
  view.querySelectorAll('[data-th-tab]').forEach(b => b.addEventListener('click', () => { thp.tab = b.dataset.thTab; thp.editing = null; thp.wtab = null; thp.planChild = null; thpRender(); }));
  const body = view.querySelector('#therapy-body');
  const wireKids = box => box.querySelectorAll('[data-th-kid]').forEach(b => b.addEventListener('click', () => { if(ther && thp.tab !== 'kids' && thp.v32 && planCanEdit(b.dataset.thKid)) planOpenEditor(b.dataset.thKid, 'plan'); else thpOpenChild(b.dataset.thKid); }));          // (in "כל הילדים": the staff's view of the child)
  wireKids(body);
  body.querySelectorAll('[data-todo-kid]').forEach(b => b.addEventListener('click', () => { if(!planCanEdit(b.dataset.todoKid)) thpOpenChild(b.dataset.todoKid); else if(b.dataset.todoTab === 'plan' && thp.v32) tpOpenPlan(b.dataset.todoKid); else planOpenEditor(b.dataset.todoKid, b.dataset.todoTab); }));
  if(thp.tab === 'plans') tpWireList(body);
  const wireObs = box => { box.querySelectorAll('[data-th-obs]').forEach(b => b.addEventListener('click', () => obsOpen(b.dataset.thObs)));
    box.querySelectorAll('[data-th-ask]').forEach(b => b.addEventListener('click', () => obsOpen(b.dataset.thAsk, 'question')));
    box.querySelectorAll('[data-th-video]').forEach(b => b.addEventListener('click', () => { thpVideoOpen(b.dataset.thVideo); setTimeout(() => { if(thp.tab === 'kids') thpRender(); }, 400); }));
    careWireCard(box); tpWireFeedback(box); };
  wireObs(body);
  const q = body.querySelector('#th-q');
  if(q) q.addEventListener('input', () => {          // (only the cards change, so the keyboard stays open)
    thp.q = q.value.trim(); const box = body.querySelector('#th-kcards');
    box.innerHTML = thpStaffOrder(thpKids().filter(c => !thp.q || displayName(c).includes(thp.q))).map(thpStaffCard).join('') || '<div class="pnote">לא נמצא ילד בשם הזה.</div>';
    wireKids(box); wireObs(box);
  });
  if(thp.tab === 'library') planWireLibrary(body);
  if(thp.tab === 'archive') careArchiveHtml(body.querySelector('#cr-archive'));
  if(thp.tab === 'overview'){ const rv = body.querySelector('#bk-review'); if(rv) rv.addEventListener('click', () => { const s = bankReview(0); const close = s.close; s.close = () => { close(); thpRender(); }; }); }
  if(thp.tab === 'settings') obsWireNotify(body);
  if(thp.editing && ther && thp.v32 && planCanEdit(thp.editing)) planOpenEditor(thp.editing);
  { const add = view.querySelector('#sub-add'); if(add) add.addEventListener('click', async () => {
      const therapist = view.querySelector('#sub-away').value, substitute = view.querySelector('#sub-by').value, until = view.querySelector('#sub-until').value;
      if(!until || therapist === substitute){ toast(therapist === substitute ? 'בחרו שני אנשים שונים' : 'בחרו עד איזה תאריך'); return; }
      const r = await sbPersonal.from('therapist_subs').insert({ therapist, substitute, until });
      if(r.error){ toast('ההחלפה לא נשמרה'); return; }
      toast('ההחלפה נשמרה'); await thpLoad(); thpRender(); });
    view.querySelectorAll('[data-sub-rm]').forEach(b => b.addEventListener('click', async () => {
      const r = await sbPersonal.from('therapist_subs').delete().eq('id', b.dataset.subRm);
      if(r.error){ toast('הביטול נכשל'); return; } await thpLoad(); thpRender(); })); }
  view.querySelectorAll('[data-th-assign]').forEach(s => s.addEventListener('change', async () => {
    const child = s.dataset.thAssign, to = s.value || null, was = thp.assign[child] || null; s.disabled = true;
    const r = to ? await sbPersonal.from('child_therapist').upsert({ child_id:child, staff_id:to }) : await sbPersonal.from('child_therapist').delete().eq('child_id', child);
    s.disabled = false;
    if(r.error){ s.value = was || ''; toast('השיוך לא נשמר. אפשר לנסות שוב בעוד רגע'); return; }
    if(to) thp.assign[child] = to; else delete thp.assign[child];
    const c = roster.find(x => x.id === child), t = thp.therapists.find(x => x.id === to);
    toast(to ? `${t ? t.display_name : ''} אחראי/ת עכשיו על ${c ? displayName(c) : ''}` : 'השיוך הוסר');
  }));
}
// a substitute therapist until a date (the responsible one is away): sees and approves like her, and it ends by itself (scheduling-v40.sql)
function thpSubsHtml(){
  const nm = id => (thp.therapists.find(t => t.id === id) || {}).display_name || '', today = isoDate(new Date());
  const live = (thp.subs || []).filter(s => s.until >= today), opts = `${thp.therapists.map(t => `<option value="${t.id}">${pEsc(t.display_name)}</option>`).join('')}`;
  return `<h3 class="psec">מחליף/ה בזמן היעדרות</h3>
    ${live.map(s => `<div class="th-assign-row"><span>${pEsc(nm(s.substitute))} מחליף/ה את ${pEsc(nm(s.therapist))} עד ${pEsc(dayLabel(s.until))}</span><button type="button" class="btn ghost small" data-sub-rm="${s.id}">ביטול</button></div>`).join('') || '<div class="pnote">אין כרגע החלפות.</div>'}
    ${thp.therapists.length >= 2 ? `<div class="th-lib-add"><label class="pfield">מי נעדר/ת<select id="sub-away">${opts}</select></label><label class="pfield">מי מחליף/ה<select id="sub-by">${opts}</select></label><label class="pfield">עד תאריך<input type="date" id="sub-until" min="${today}"></label><button type="button" class="btn" id="sub-add">הוספה</button></div>` : '<div class="pnote">צריך לפחות שני אנשי טיפול כדי להגדיר החלפה.</div>'}`;
}
// one child, as the staff sees it: the whole published plan
function thpOpenChild(id){
  const c = roster.find(x => x.id === id); if(!c) return;
  const g = thp.guidance && thp.guidance[id];
  const sh = portalSheet(`<div class="th-child-head">${thpAvatar(c)}<h2 class="ar-keep">${pEsc(displayName(c))}</h2></div>
    ${thpVideoBtnHtml(id)}
    ${g ? planGuidanceHtml(g) : `<div class="pnote">עוד אין תוכנית טיפולית ל${pEsc(displayName(c))}. כשאיש/אשת הטיפול יפרסמו אותה, יופיעו כאן מה במוקד, מה לעשות וממה להימנע.</div>`}
    ${thp.v32 ? '<button type="button" class="btn ghost" id="th-observe" style="width:100%;margin-top:8px">📝 תצפית לאיש/אשת הטיפול</button><button type="button" class="btn ghost" id="th-ask" style="width:100%;margin-top:8px">❓ שאלה לאיש/אשת הטיפול</button>' : ''}${careChildSheetHtml(id)}
    ${thp.v32 && srv.profile && srv.profile.admin ? '<button type="button" class="btn ghost" id="th-place" style="width:100%;margin-top:8px">מיקום במסע בחלל (מנהל)</button>' : ''}
    <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>סגירה</button></div>`);
  const pl = sh.querySelector('#th-place'); if(pl) pl.addEventListener('click', () => { sh.close(); journeyPlaceSheet(id); });
  const ob = sh.querySelector('#th-observe'); if(ob) ob.addEventListener('click', () => { sh.close(); obsOpen(id); });
  const ak = sh.querySelector('#th-ask'); if(ak) ak.addEventListener('click', () => { sh.close(); obsOpen(id, 'question'); });
  const vb = sh.querySelector('[data-th-video]'); if(vb) vb.addEventListener('click', () => { sh.close(); thpVideoOpen(id); });
  careChildSheetWire(sh, id); tpWireFeedback(sh);
}
