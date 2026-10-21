// ---------- MERCURY: THE THERAPY PORTAL (stage 1: the frame) ----------
// A third card on the app home, "פורטל הטיפול", with the personal sign-in only. Everybody on the staff sees every child (the guidance of
// the plans comes in stage 2); a therapist sees the children they are responsible for; the admin and the coordinator assign the
// responsible therapist of every child. (scheduling-v31.sql; Mercury spec, decisions 1-6, 44-46)
const thp = { loaded:false, ok:false, mine:[], assign:{}, therapists:[], tab:null, guidance:{}, plans:{}, planets:[], library:[], v32:false, editing:null };
const therapyAvailable = () => typeof portalServerOn !== 'undefined' && portalServerOn && !!srv.profile && 'therapist' in srv.profile;          // (my_profile carries "therapist" from v31)
const isTherapistMe = () => !!(srv.profile && srv.profile.therapist);
const isPureTherapist = () => (portalMe() || {}).role === 'therapist';
const canAssignTherapist = () => !!(srv.meRow && (srv.meRow.role === 'coordinator' || srv.meRow.admin));

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
  thp.loaded = true;
}

// the tabs: a therapist starts with their own children; the rest of the staff with all the children; the admin and the coordinator also assign
function thpTabs(){
  const t = [];
  if(isTherapistMe()) t.push(['mine', 'הילדים שבאחריותי']);
  if(!isPureTherapist()) t.push(['all', 'כל הילדים']);
  if(canAssignTherapist()) t.push(['assign', 'שיוך אנשי טיפול']);
  if(thp.v32 && (isTherapistMe() || (srv.profile && srv.profile.admin))) t.push(['library', 'ספרייה']);
  return t;
}
async function showTherapyPortal(){
  portalActivateView('view-therapy');
  const view = document.getElementById('view-therapy');
  thp.tab = null; thp.editing = null;          // (every entry starts on the first tab of this person)
  view.innerHTML = `<div class="portal-shell therapy-shell" data-ptheme="${portalLoad().settings.theme || 'dark'}"><div class="pnote">טוען...</div></div>`;
  await thpLoad();
  thpRender();
}
const thpKids = () => (typeof roster !== 'undefined' ? roster : []).slice().sort((a, b) => displayName(a).localeCompare(displayName(b), 'he'));
const thpAvatar = c => { const k = typeof characterFor === 'function' && characterFor(c.id); return k ? `<span class="th-av">${charImgHtml(k)}</span>` : `<span class="th-av th-av-name ar-keep">${pEsc(displayName(c).slice(0, 2))}</span>`; };
function thpRender(){
  const view = document.getElementById('view-therapy'); if(!view) return;
  const tabs = thpTabs(); if(!tabs.some(t => t[0] === thp.tab)) thp.tab = tabs.length ? tabs[0][0] : null;
  const me = portalMe() || {}, kids = thpKids(), mine = new Set(thp.mine);
  const card = c => `<button type="button" class="th-kid${thp.guidance[c.id] ? ' has-plan' : ''}" data-th-kid="${pEsc(c.id)}">${thpAvatar(c)}<span class="th-kid-text"><b class="ar-keep">${pEsc(displayName(c))}</b><small>${planCardSub(c.id)}</small></span></button>`;
  let inner = '';
  if(!thp.ok) inner = '<div class="pnote">פורטל הטיפול עוד לא מוכן בשרת הזה, או שאין חיבור כרגע. אפשר לנסות שוב בעוד רגע.</div>';
  else if(thp.tab === 'mine'){
    const list = kids.filter(c => mine.has(c.id));
    inner = `${thp.v32 ? obsNotifyHtml() : ''}<div class="pnote">${thp.v32 ? 'הילדים שאת/ה איש/אשת הטיפול האחראי/ת שלהם. לחיצה על ילד פותחת את התוכנית שלו.' : 'הילדים שאת/ה איש/אשת הטיפול האחראי/ת שלהם. בניית התוכניות תגיע בשלב הבא.'}</div>${list.length ? `<div class="th-kids">${list.map(card).join('')}</div>` : '<div class="pnote">עוד לא שויכו אלייך ילדים. השיוך נעשה אצל הרכזת או מנהל המערכת.</div>'}`;
  } else if(thp.tab === 'all'){
    inner = `<div class="pnote">ההכוונה של כל ילד, לפי התוכנית הטיפולית שלו: מה במוקד, מה לעשות וממה להימנע. התוכניות יופיעו כאן כשאנשי הטיפול יפרסמו אותן.</div><div class="th-kids">${kids.map(card).join('')}</div>`;
  } else if(thp.tab === 'library'){
    inner = planLibraryHtml();
  } else if(thp.tab === 'assign'){
    const opts = sel => `<option value="">ללא</option>${thp.therapists.map(t => `<option value="${t.id}"${sel === t.id ? ' selected' : ''}>${pEsc(t.display_name)}</option>`).join('')}`;
    inner = `<div class="pnote">לכל ילד איש/אשת טיפול אחראי/ת אחד/ת. רק הוא/היא רואה את המידע הטיפולי של הילד ובונה את התוכנית שלו. כל שינוי נרשם.</div>
      ${thp.therapists.length ? '' : '<div class="pnote">עוד אין אנשי טיפול במערכת. מוסיפים בהגדרות (תפקיד "איש/אשת טיפול"), או מסמנים "גם איש/אשת טיפול" בפורטל הניהול.</div>'}
      <div class="th-assign">${kids.map(c => `<div class="th-assign-row">${thpAvatar(c)}<b class="ar-keep">${pEsc(displayName(c))}</b><select data-th-assign="${pEsc(c.id)}" aria-label="איש/אשת הטיפול של ${pEsc(displayName(c))}">${opts(thp.assign[c.id] || '')}</select></div>`).join('')}</div>`;
  }
  view.innerHTML = `<div class="portal-shell therapy-shell" data-ptheme="${portalLoad().settings.theme || 'dark'}">
      <div class="portal-top"><button type="button" class="back-btn portal-back" id="therapy-home">→ מסך ראשי</button><h1 class="portal-title">פורטל הטיפול</h1><span></span></div>
      <div class="portal-hello">שלום ${pEsc(me.first || '')}</div>
      ${tabs.length > 1 ? `<nav class="portal-tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" data-th-tab="${t[0]}" class="${t[0] === thp.tab ? 'active' : ''}">${t[1]}</button>`).join('')}</nav>` : ''}
      <div id="therapy-body">${inner}</div>
    </div>`;
  view.querySelector('#therapy-home').addEventListener('click', () => { if(typeof personalRamzorKind === 'function' && !personalRamzorKind()) srvOpenPortal(); else showAppHome(); });
  view.querySelectorAll('[data-th-tab]').forEach(b => b.addEventListener('click', () => { thp.tab = b.dataset.thTab; thp.editing = null; thpRender(); }));
  view.querySelectorAll('[data-th-kid]').forEach(b => b.addEventListener('click', () => { if(thp.v32 && thp.tab === 'mine' && planCanEdit(b.dataset.thKid)) planOpenEditor(b.dataset.thKid); else thpOpenChild(b.dataset.thKid); }));
  if(thp.tab === 'library') planWireLibrary(view.querySelector('#therapy-body'));
  if(thp.tab === 'mine' && thp.v32) obsWireNotify(view.querySelector('#therapy-body'));
  if(thp.editing && thp.v32 && planCanEdit(thp.editing)) planOpenEditor(thp.editing);
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
// one child (stage 1: the frame; the plan, the guidance and the observations come in the next stages)
function thpOpenChild(id){
  const c = roster.find(x => x.id === id); if(!c) return;
  const g = thp.guidance && thp.guidance[id], edit = thp.v32 && planCanEdit(id);
  const sh = portalSheet(`<div class="th-child-head">${thpAvatar(c)}<h2 class="ar-keep">${pEsc(displayName(c))}</h2></div>
    ${g ? planGuidanceHtml(g) : `<div class="pnote">עוד אין תוכנית טיפולית ל${pEsc(displayName(c))}. כשאיש/אשת הטיפול יפרסמו אותה, יופיעו כאן מה במוקד, מה לעשות וממה להימנע.</div>`}
    ${thp.v32 ? '<button type="button" class="btn ghost" id="th-observe" style="width:100%;margin-top:8px">📝 תצפית לאיש/אשת הטיפול</button>' : ''}
    ${thp.v32 && srv.profile && srv.profile.admin ? '<button type="button" class="btn ghost" id="th-place" style="width:100%;margin-top:8px">מיקום במסע בחלל (מנהל)</button>' : ''}
    <div class="confirm-actions" style="grid-template-columns:${edit ? '1fr 1fr' : '1fr'}">${edit ? '<button type="button" class="btn ghost" id="th-edit-plan">עריכת התוכנית</button>' : ''}<button type="button" class="btn" data-close>סגירה</button></div>`);
  const pl = sh.querySelector('#th-place'); if(pl) pl.addEventListener('click', () => { sh.close(); journeyPlaceSheet(id); });
  const ob = sh.querySelector('#th-observe'); if(ob) ob.addEventListener('click', () => { sh.close(); obsOpen(id); });
  const ed = sh.querySelector('#th-edit-plan'); if(ed) ed.addEventListener('click', () => { sh.close(); planOpenEditor(id); });
}
