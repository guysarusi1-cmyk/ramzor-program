
// ---------- THE INSTRUCTOR PORTAL: the shell (app home, header, tabs, shared pieces) ----------
// Demo mode: there are no personal logins yet, so a small "viewing as" selector lets you see the portal as the
// coordinator or as any instructor. Everything is stored in this browser only (see 14a-portal-data.js).
const portalHomeFirst = () => PORTAL_ENABLED && !window.__portalNoHome && location.hash !== '#tv';       // (the test tools set __portalNoHome: they start from the רמזור home)
const portalUi = { persona:'c1', tab:null, month:null, level:'avoid', openDay:null, fold:{ mine:false, team:false, swap:false } };          // (every part folded at first, the team calendar too: Guy 2026-11-03)          // (the team calendar opens by itself: Guy 2026-10-28)

function portalPerson(id){ return portalLoad().instructors.find(p => p.id === id); }
function portalMe(){ return portalPerson(portalUi.persona) || portalLoad().instructors[0]; }          // (in server mode persona = the signed-in person)
function portalIsCoordinator(){ return portalMe().role === 'coordinator'; }
// the coordinator's view of the portal: the coordinator herself, or the admin when he opened the management portal (an admin can also be an instructor)
// the leopard look: everybody may choose it in the gear; the coordinator has it by default, until she chooses another look (Guy 2026-10-20)
const leopardAllowed = () => !!srv.meRow;
const portalThemeNow = () => srv.portalTheme || (srv.meRow && srv.meRow.role === 'coordinator' ? 'leopard' : null);
const portalAsCoord = me => !!me && (me.role === 'coordinator' || (!!portalUi.manager && !!me.admin));
function pEsc(s){ return escapeHtml(s == null ? '' : s); }
function portalActivateView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.body.classList.add('portal-mode');
  window.scrollTo(0, 0);
}
function queueEmail(to, subject, body){
  const st = portalLoad();
  const plain = x => String(x).replace(/<[^>]+>/g, '');
  st.outbox.unshift({ id:'e' + Date.now() + Math.floor(Math.random() * 1000), at:new Date().toISOString(), to, subject:plain(subject), body:plain(body) });
  st.outbox.length = Math.min(st.outbox.length, 40);
  portalSave();
}

// ---- the first screen after login: two cards
function showAppHome(){
  stopCarousel(); document.body.classList.remove('leopard-bg');
  if(portalUi.viewAs){ const was = portalUi.editPrefs; portalUi.viewAs = null; portalUi.editPrefs = false; portalUi.actAs = false; if(typeof srv !== 'undefined' && srv.me) portalUi.persona = srv.me; if(was && typeof srvResnap === 'function') srvResnap(); }          // (leaving "looking as somebody" by any way: back to being oneself)
  portalActivateView('view-apphome');
  let look = 'dark';          // (the first screen wears the person's own look too: light, dark, or the leopard where it is allowed — Guy 2026-10-30)
  try { look = portalServerOn && leopardAllowed() && portalThemeNow() === 'leopard' ? 'leopard' : (portalServerOn && srv.portalTheme && srv.portalTheme !== 'leopard' ? srv.portalTheme : portalLoad().settings.theme) || 'dark'; } catch(e){}
  document.body.classList.toggle('leopard-bg', look === 'leopard');
  document.getElementById('view-apphome').innerHTML = `
    <div class="apphome mx-home" data-ptheme="${look}">
      <div class="apphome-top"><button type="button" class="home-text-btn" id="apphome-logout">יציאה</button></div>
      <div class="eyebrow-gold">מרכז חירום</div>
      <h1 class="apphome-title">מה תרצו לפתוח?</h1>
      <div class="apphome-cards">
        ${portalServerOn ? `<div class="apphome-hello">שלום ${pEsc((portalMe() || {}).first || '')}</div>` : ''}
        <button type="button" class="home-card" id="apphome-ramzor">
          <span class="apphome-emoji apphome-ico">${psIco('light')}</span>
          <span class="home-card-title">הרמזור</span>
          <span class="home-card-sub">תפעול יומיומי ומסך הילדים</span>
        </button>
        ${(portalMe() || {}).role === 'therapist' ? '' : `<button type="button" class="home-card" id="apphome-portal">
          <span class="apphome-emoji apphome-ico">${psIco('people')}</span>
          <span class="home-card-title">${portalServerOn && (portalMe() || {}).role === 'manager' ? 'ניהול' : portalServerOn && (portalMe() || {}).role === 'coordinator' ? ((portalMe() || {}).admin ? 'פורטל ניהול' : 'פורטל הרכזת') : 'פורטל המדריך'}</span>
          <span class="home-card-sub">${portalServerOn && (portalMe() || {}).role === 'manager' ? 'סידור, לו"ז, שיחות ומשתמשים' : 'משמרות, העדפות והודעות'}</span>
        </button>`}
        ${!liveCut() && typeof therapyAvailable === 'function' && therapyAvailable() ? `<button type="button" class="home-card" id="apphome-therapy">
          <span class="apphome-emoji apphome-ico">${psIco('leaf')}</span>
          <span class="home-card-title">פורטל הטיפול</span>
          <span class="home-card-sub">${canTherapistPortal() ? 'מה מחכה לך, התוכניות, התצפיות והמעקב' : 'מה עושים עם כל ילד, וממה להימנע'}</span>
        </button>` : ''}
        ${typeof ocAllowed === 'function' && ocAllowed() ? `<button type="button" class="home-card" id="apphome-oncall">
          <span class="apphome-emoji apphome-ico">${psIco('schedule')}</span>
          <span class="home-card-title">כוננית סוף שבוע</span>
          <span class="home-card-sub">עובדי סוף השבוע, מוניות וסידור</span>
        </button>` : ''}
        ${portalServerOn && (portalMe() || {}).admin ? `<button type="button" class="home-card" id="apphome-learn">
          <span class="apphome-emoji apphome-ico">${psIco('play')}</span>
          <span class="home-card-title">לומדה</span>
          <span class="home-card-sub">סרטוני הדרכה, ושיתוף שלהם לצוות</span>
        </button>` : ''}
        ${portalServerOn && (portalMe() || {}).admin && (portalMe() || {}).role !== 'coordinator' ? `<button type="button" class="home-card" id="apphome-manage">
          <span class="apphome-emoji apphome-ico">${psIco('admin')}</span>
          <span class="home-card-title">פורטל ניהול</span>
          <span class="home-card-sub">כל מה שהרכזת רואה ועושה, ועוד</span>
        </button>` : ''}
      </div>
      ${installLinkHtml()}
      ${portalServerOn || sbPersonal ? '' : '<div class="apphome-demo">גרסת דמו של הפורטל: הנתונים בו לדוגמה בלבד ונשמרים במכשיר הזה.</div>'}
    </div>`;
  document.querySelectorAll('#view-apphome .mx-home .home-card').forEach(c => {          // the second line of every card behind a small "פירוט" (Guy 2026-11-03)
    const w = document.createElement('div'); w.className = 'home-card-wrap'; c.replaceWith(w); w.appendChild(c);
    const more = document.createElement('button'); more.type = 'button'; more.className = 'home-card-more'; more.textContent = 'פירוט'; more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => { const on = !w.classList.contains('open'); w.classList.toggle('open', on); more.setAttribute('aria-expanded', String(on)); });
    w.appendChild(more);
  });
  document.getElementById('apphome-ramzor').addEventListener('click', showHub);
  { const oc1 = document.getElementById('apphome-oncall'); if(oc1) oc1.addEventListener('click', () => showOncallScreen()); }
  { const th = document.getElementById('apphome-therapy'); if(th) th.addEventListener('click', () => showTherapyPortal()); }          // (Mercury: the therapy portal, 14w-therapy-portal.js)
  if(document.getElementById('apphome-portal')) document.getElementById('apphome-portal').addEventListener('click', () => { portalUi.manager = false; if(portalServerOn) srvOpenPortal(); else if(typeof srvShowLogin === 'function' && sbPersonal && !window.__portalDemo) srvShowLogin('email'); else showPortal(); });          // (with the staff password: the personal sign-in, not a demo)
  { const ln = document.getElementById('apphome-learn'); if(ln) ln.addEventListener('click', showLearnHome); }          // (the admin's training videos, 14zh-learn.js)
  const mg = document.getElementById('apphome-manage'); if(mg) mg.addEventListener('click', () => { portalUi.manager = true; srvOpenPortal(); });
  document.getElementById('apphome-logout').addEventListener('click', () => document.getElementById('hub-logout-link').click());
}

// ---- the portal itself
function portalTabsFor(me){
  if(portalServerOn) return srvTabs(me);
  return me.role === 'coordinator'
    ? [['schedule', 'סידור'], ['submissions', 'הגשות'], ['swaps', 'החלפות'], ['timetable', 'לו"ז'], ['settings', 'הגדרות']]
    : [['schedule', 'הסידור'], ['prefs', 'העדפות'], ['swaps', 'החלפות'], ['inbox', 'הודעות']];
}
// the side menu on a computer (Guy 2026-10-30; from 2026-11-03 the instructors' portal only: the coordinator's is back to the tabs across the top,
// and the quick look switch is light / dark only — the leopard stays in the gear): the portal's title and hello above,
// the same areas as the tabs (data-pstab buttons beside the tabs' data-ptab), then the gear, the way home and the look. On a phone the tabs stay (20-mercury.css shows one or the other)
const PS_ICON = { schedule:'M4 6.5h16v13H4zM8 3.5v4M16 3.5v4M4 10.5h16', prefs:'M5 12l4 4 10-10', swaps:'M7 7h12l-3-3M17 17H5l3 3', vacation:'M3 20h18M6 20c1-6 4-10 9-11M15 9c-2-3-6-4-9-2 3 0 5 1 6 3M15 9c3-1 6 0 7 3-2-1-4-1-6 0',
  vacations:'M3 20h18M6 20c1-6 4-10 9-11M15 9c-2-3-6-4-9-2 3 0 5 1 6 3M15 9c3-1 6 0 7 3-2-1-4-1-6 0', inbox:'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4', submissions:'M4 13l2.5-7h11l2.5 7v5H4zM4 13h5l1 2h4l1-2h5',
  open:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8', avail:'M4 6.5h16v13H4zM4 10.5h16M9 15l2 2 4-4', hours:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', timetable:'M4 5h16M4 10h16M4 15h10M4 20h7',
  settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  admin:'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z', home:'M3 11l9-7 9 7M5 10v10h14V10', gear:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4L7 17M17 17l1.4 1.4M5.6 5.6L7 7',
  leaf:'M5 19c0-8 5-14 15-15-1 10-7 15-15 15zM5 19c3-4 6-6 9-8', play:'M3 5h18v14H3zM10.5 9.5v5l4-2.5z',
  light:'M10 2.5h4a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM12 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 15.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  people:'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c2 .6 3.2 2.6 3.5 5.5' };
const psIco = k => `<svg class="ps-ico" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${PS_ICON[k] || PS_ICON.schedule}"></path></svg>`;
function portalSideHtml(me, tabs, title, theme, leopardOk){
  const count = k => portalServerOn && typeof srvTabCount === 'function' ? srvTabCount(me, k) : 0;
  const look = (v, w) => `<button type="button" data-plook="${v}" aria-pressed="${theme === v}">${w}</button>`, top = portalServerOn && me.role === 'manager';          // (the manager: the settings, the look and the way home at the top of the page, not at the bottom of a long side: Guy 2026-11-04)
  return `<aside class="ps-side" aria-label="אזורי הפורטל">
      <div class="ps-side-head"><b>${title}</b>${portalServerOn ? `<span>שלום ${pEsc(me.first)}</span>` : ''}</div>
      <nav class="ps-side-nav">${tabs.map(t => `<button type="button" data-pstab="${t[0]}" class="${t[0] === portalUi.tab ? 'active' : ''}"${t[0] === portalUi.tab ? ' aria-current="page"' : ''}>${psIco(t[0])}<span class="ps-word">${t[1]}</span>${count(t[0]) ? `<span class="ptab-count">${count(t[0])}</span>` : ''}</button>`).join('')}</nav>
      <div class="ps-side-foot">
        ${portalServerOn && me.role === 'teacher' && typeof therapyAvailable === 'function' && therapyAvailable() ? `<button type="button" class="ps-link" data-ps-go="therapy">${psIco('leaf')}<span>פורטל הטיפול</span></button>` : ''}
        ${top ? '' : `${portalServerOn ? `<button type="button" class="ps-link" data-ps-go="gear">${psIco('gear')}<span>העדפות מערכת</span></button>` : ''}
        <button type="button" class="ps-link" data-ps-go="home">${psIco('home')}<span>${portalServerOn && !ramzorPersonal ? 'יציאה' : 'מסך ראשי'}</span></button>
        <div class="mx-seg ps-look" role="group" aria-label="מראה">${look('light', 'בהיר')}${look('dark', 'כהה')}${leopardOk ? look('leopard', 'נמר') : ''}</div>`}
      </div>
    </aside>${top ? `<div class="ps-topbar"><button type="button" class="ps-link" data-ps-go="home">${psIco('home')}<span>מסך ראשי</span></button><span class="ps-topbar-end"><button type="button" class="ps-link" data-ps-go="gear">${psIco('gear')}<span>העדפות מערכת</span></button><span class="mx-seg ps-look" role="group" aria-label="מראה">${look('light', 'בהיר')}${look('dark', 'כהה')}</span></span></div>` : ''}`;
}
function showPortal(tab){
  const st = portalLoad(), me = portalMe();
  portalActivateView('view-portal');
  const tabs = portalTabsFor(me);
  if(typeof tab === 'string') portalUi.tab = tab;
  if(portalUi.tab === 'vacation' && !tabs.some(t => t[0] === 'vacation') && tabs.some(t => t[0] === 'swaps')){ portalUi.tab = 'swaps'; portalUi.fold = Object.assign({}, portalUi.fold, { vac:true }); }          // (the vacation lives in "החלפות וחופשות" now)
  if(!tabs.some(t => t[0] === portalUi.tab)) portalUi.tab = tabs[0][0];
  const today = monthKeyOf(isoDate(new Date()));
  if(!portalUi.month) portalUi.month = today;
  const view = document.getElementById('view-portal');
  const leopard = portalServerOn && !portalUi.viewAs && leopardAllowed() && portalThemeNow() === 'leopard', theme = leopard ? 'leopard' : st.settings.theme;          // (the leopard look: the coordinator's own choice, kept with her account)
  document.body.classList.toggle('leopard-bg', leopard);
  const pTitle = portalServerOn && portalAsCoord(me) ? (me.admin ? 'פורטל ניהול' : 'פורטל הרכזת') : portalServerOn && me.role === 'service' ? 'פורטל בנות השירות' : portalServerOn && me.role === 'manager' ? 'פורטל המנהלת' : 'פורטל המדריך';
  view.innerHTML = `
    <div class="portal-shell${portalServerOn && portalAsCoord(me) ? ' wide' : ''}" data-ptheme="${theme}">
      ${portalServerOn && portalAsCoord(me) ? '' : portalSideHtml(me, tabs, pTitle, theme, false)}
      <div class="portal-top">
        <button type="button" class="back-btn portal-back${portalServerOn && !ramzorPersonal ? '' : ' is-home'}" id="portal-home">${portalServerOn && !ramzorPersonal ? 'יציאה' : '→ מסך ראשי'}</button>
        <h1 class="portal-title">${pTitle}</h1>
        <span class="portal-top-actions">${portalServerOn && ['service', 'teacher'].includes(me.role) && typeof ocAllowed === 'function' && ocAllowed() ? '<button type="button" class="portal-theme" id="portal-oncall" aria-label="כוננית סוף שבוע" title="כוננית סוף שבוע">📋</button>' : ''}${portalServerOn && me.role === 'teacher' && typeof therapyAvailable === 'function' && therapyAvailable() ? '<button type="button" class="portal-theme" id="portal-therapy" aria-label="פורטל הטיפול" title="פורטל הטיפול">🌱</button>' : ''}${portalServerOn ? '<button type="button" class="portal-theme" id="portal-gear" aria-label="העדפות מערכת" title="העדפות מערכת">⚙️</button>' : ''}<button type="button" class="portal-theme" id="portal-theme" aria-label="החלפה בין מצב כהה לבהיר">${leopard ? '🐆' : st.settings.theme === 'dark' ? '☀️' : '🌙'}</button></span>
      </div>
      ${portalServerOn ? `<div class="portal-hello">שלום ${pEsc(me.first)}</div>` : `<label class="portal-as">צפייה כ:
        <select id="portal-persona">${st.instructors.filter(p => p.active).map(p => `<option value="${p.id}"${p.id === me.id ? ' selected' : ''}>${pEsc(instrName(p, st.instructors))}${p.role === 'coordinator' ? ' (רכזת)' : ''}</option>`).join('')}</select>
        <span class="portal-demo-tag">דמו</span>
      </label>`}
      <nav class="portal-tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" data-ptab="${t[0]}" class="${t[0] === portalUi.tab ? 'active' : ''}">${t[1]}${(c => c ? ` <span class="ptab-count">${c}</span>` : '')(portalServerOn && typeof srvTabCount === 'function' ? srvTabCount(me, t[0]) : 0)}</button>`).join('')}</nav>
      ${portalServerOn && portalUi.viewAs ? (portalUi.actAs ? `<div class="adm-viewas act"><span>🛠️ במסך של ${pEsc(me.first)} · שליטה מלאה, כל פעולה נרשמת על שמך</span><button type="button" class="btn small" id="viewas-end">חזרה לפורטל הניהול</button></div>` : portalUi.editPrefs ? `<div class="adm-viewas edit"><span>✏️ ממלא/ת העדפות עבור ${pEsc(me.first)} · נשמר אצלו/ה</span><button type="button" class="btn small" id="viewas-end">סיום</button></div>` : `<div class="adm-viewas"><span>👁️ צפייה כמו ש${pEsc(me.first)} רואה · רק לצפייה</span><button type="button" class="btn small" id="viewas-end">חזרה לפורטל הניהול</button></div>`) : ''}
      <div id="portal-body"></div>
      ${portalServerOn && srv.meRow && !['instructor', 'coordinator'].includes(srv.meRow.role) && !srv.meRow.admin ? installLinkHtml() : ''}
      ${portalServerOn ? '<button type="button" class="portal-problem" id="portal-problem">משהו לא עובד? דיווח על תקלה</button>' : ''}
    </div>`;
  if(portalServerOn && portalUi.viewAs){          // (the admin looks at somebody's portal: folds, months and tabs work; nothing can be changed)
    document.getElementById('viewas-end').addEventListener('click', adminViewAsEnd);
    document.getElementById('portal-body').addEventListener('click', ev => {
      if(portalUi.editPrefs || portalUi.actAs) return;          // (filling somebody's preferences, or working in the coordinator's screen: everything works)
      if(ev.target.closest('summary, [data-pmonth], .pfold > summary')) return;
      if(ev.target.closest('button, input, select, textarea, a, [data-pslot], [data-pday], [role=button]')){ ev.preventDefault(); ev.stopPropagation(); toast('זו צפייה בלבד'); }
    }, true);
  }
  document.getElementById('portal-home').addEventListener('click', portalServerOn && !ramzorPersonal ? async () => { if(await askLogout()) srvSignOut(); } : showAppHome);          // (after the one personal sign-in: back to the two cards; leaving is there)
  const gear = document.getElementById('portal-gear'); if(gear) gear.addEventListener('click', openPortalSettings);
  { const oc1 = document.getElementById('portal-oncall'); if(oc1) oc1.addEventListener('click', () => showOncallScreen()); }          // (they have no first screen: their way to the on-call screen)
  { const th = document.getElementById('portal-therapy'); if(th) th.addEventListener('click', () => showTherapyPortal()); }          // (service girls and teachers: their way to the therapy portal)
  const prob = document.getElementById('portal-problem'); if(prob) prob.addEventListener('click', openProblemReport);
  document.getElementById('portal-theme').addEventListener('click', () => { if(leopard){ srv.portalTheme = null; srvSaveSetting({ portalTheme:st.settings.theme }); showPortal(); return; } st.settings.theme = st.settings.theme === 'dark' ? 'light' : 'dark'; if(portalServerOn){ try { localStorage.setItem('ramzor-portal-theme', st.settings.theme); } catch(e){} } else portalSave(); showPortal(); });
  if(!portalServerOn) document.getElementById('portal-persona').addEventListener('change', e => { portalUi.persona = e.target.value; portalUi.tab = null; showPortal(); });
  view.querySelectorAll('[data-ptab]').forEach(b => b.addEventListener('click', () => { portalUi.tab = b.dataset.ptab; portalUi.prefsPast = false; showPortal(); }));
  view.querySelectorAll('[data-pstab]').forEach(b => b.addEventListener('click', () => { portalUi.tab = b.dataset.pstab; portalUi.prefsPast = false; showPortal(); }));          // (the side menu: the same areas as the tabs)
  view.querySelectorAll('[data-ps-go]').forEach(b => b.addEventListener('click', () => { const id = ({ home:'portal-home', gear:'portal-gear', therapy:'portal-therapy' })[b.dataset.psGo]; const t = document.getElementById(id); if(t) t.click(); }));          // (the side menu's links do what the top row's buttons do)
  view.querySelectorAll('[data-plook]').forEach(b => b.addEventListener('click', async () => {          // (the look, straight from the side menu: the same as the gear's choice)
    const th = b.dataset.plook;
    if(th === 'leopard'){ srv.portalTheme = 'leopard'; showPortal(); if(portalServerOn) await srvSaveSetting({ portalTheme:'leopard' }); return; }
    st.settings.theme = th; try { localStorage.setItem('ramzor-portal-theme', th); } catch(e){}
    if(portalServerOn){ srv.portalTheme = th; showPortal(); await srvSaveSetting({ portalTheme:th }); } else { portalSave(); showPortal(); }
  }));
  portalRenderTab();
}
function portalRenderTab(){
  const me = portalMe(), body = document.getElementById('portal-body'), t = portalUi.tab;
  if(portalServerOn) return srvRenderTab(me, body, t);
  if(me.role === 'coordinator'){
    if(t === 'schedule') renderCoordSchedule(body); else if(t === 'submissions') renderCoordSubmissions(body);
    else if(t === 'swaps') renderCoordSwaps(body); else if(t === 'timetable') renderCoordTimetable(body); else renderCoordSettings(body);
  } else {
    if(t === 'schedule') renderInstructorSchedule(body); else if(t === 'prefs') renderInstructorPrefs(body);
    else if(t === 'swaps') renderInstructorSwaps(body); else renderInstructorInbox(body);
  }
}
function portalRefresh(){ portalRenderTab(); }

// ---- shared small pieces
function monthNavHtml(mk, extra){
  return `<div class="pmonth"><button type="button" data-pmonth="-1" aria-label="חודש קודם"><bdi dir="ltr">›</bdi></button><b>${monthLabel(mk)}</b><button type="button" data-pmonth="1" aria-label="חודש הבא"><bdi dir="ltr">‹</bdi></button>${extra || ''}</div>`;          // (the arrows are fixed left-to-right, so that no phone mirrors them: the right one points right, the left one points left)
}
// the preferences are handed in for next month only (Guy, 2026-10-22): no other month to move to; on the 1st of a month it moves on by itself
const prefsMonthNow = () => addMonths(monthKeyOf(typeof srvToday === 'function' && portalServerOn ? srvToday() : isoDate(new Date())), 1);
const monthFixedHtml = mk => `<div class="pmonth pmonth-fixed"><b>${monthLabel(mk)}</b></div>`;
function wireMonthNav(root, key){
  key = key || 'month';
  root.querySelectorAll('[data-pmonth]').forEach(b => b.addEventListener('click', () => { portalUi[key] = addMonths(portalUi[key], Number(b.dataset.pmonth)); portalRefresh(); }));
}
function portalCtx(mk){
  const st = portalLoad(), m = portalMonth(mk);
  return { month:mk, instructors:st.instructors, shiftTypes:st.shiftTypes, prefs:m.prefs, rules:st.rules, annot:m.annot || {} };
}
// a bottom sheet with any content; returns the element (close with [data-close] or by tapping outside)
function portalSheet(html){
  const wrap = document.createElement('div');
  wrap.className = 'sheet psheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  { const mx = document.querySelector(':is(#view-portal, #view-therapy, #view-learn, #view-oncall, #view-apphome).active :is(.portal-shell, .mx-home)[data-ptheme]'); if(mx){ wrap.classList.add('mx-sheet'); wrap.dataset.ptheme = mx.dataset.ptheme || 'dark'; } }          // (a sheet of a staff portal takes its look: 20-mercury.css)
  wrap.innerHTML = `<div class="sheet-card">${html}</div>`;
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => { if(e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.close = close;
  document.body.appendChild(wrap);
  return wrap;
}

// Who is THE ahmash of a shift (the one that is marked): in the afternoon shifts, and on Friday and Saturday mornings. Only one is marked, even when several ahmash are on the shift.
// The choice goes through the month in order: a main ahmash (rank 1) before a second-rank one (who is chosen only when no main one is on the shift); then somebody who was NOT the
// ahmash the day before; then the one who has been the ahmash the fewest times so far this month; then by id, so that everybody sees the same.  rank = { staff id: 1 | 2 }
function ahmashInCharge(id, date){ return id === 'e' || ([5, 6].includes(dowOf(date)) && id === 'm'); }
function ahmashPicks(table, ctx, rank){
  const picks = {}, count = {}, was = {};
  table.forEach(r => r.cells.forEach((c, i) => {
    const s = ctx.shiftTypes[i]; if(!c.slot || !s || !ahmashInCharge(s.id, r.date)) return;
    const cand = c.people.filter(p => (rank[p.iid] || 0) > 0); if(!cand.length) return;
    const best = Math.min(...cand.map(p => rank[p.iid]));
    let pool = cand.filter(p => rank[p.iid] === best);
    const fresh = pool.filter(p => !(was[p.iid] && was[p.iid].has(addDays(r.date, -1)))); if(fresh.length) pool = fresh;
    pool.sort((a, b) => (count[a.iid] || 0) - (count[b.iid] || 0) || String(a.iid).localeCompare(String(b.iid)));
    const pick = pool[0]; picks[c.slot.key] = pick.iid; count[pick.iid] = (count[pick.iid] || 0) + 1; (was[pick.iid] = was[pick.iid] || new Set()).add(r.date);
  }));
  return picks;
}

// the schedule table: one row per day, one column per shift. In the coordinator's view every name is coloured by how
// well the wish was kept; instructors see the whole team's schedule with only their own name highlighted.
function boardHtml(ctx, assignments, opts){
  opts = opts || {};
  const byId = {}; ctx.instructors.forEach(p => { byId[p.id] = p; });
  const table = scheduleTable(ctx, assignments), today = isoDate(new Date());
  const head = `<tr><th></th>${ctx.shiftTypes.map(s => `<th>${pEsc(s.label)}<small>${rangeHtml(s.start, s.end)}</small></th>`).join('')}</tr>`;
  const approvals = (portalMonth(ctx.month).approvals) || {}, picks = opts.ahmash ? ahmashPicks(table, ctx, opts.ahmash) : {};
  const body = table.map(r => `<tr class="${r.date === today ? 'today' : ''}${opts.nextDate === r.date ? ' next-row' : ''}${[5, 6].includes(dowOf(r.date)) ? ' weekend' : ''}"><th scope="row"><b>${DOW_SHORT[dowOf(r.date)]}</b> ${parseIso(r.date).getDate()}</th>${r.cells.map((c, i) => {
    if(!c.slot) return '<td class="off">—</td>';
    const chips = c.people.map(p => {
      const pid = p.iid;
      const mine = opts.me && pid === opts.me;
      const cls = opts.colour ? 'lv-' + p.level : 'lv-neutral';
      const pending = approvals[c.slot.key + '|' + pid] === 'pending';
      const ann = ctx.annot && ctx.annot[c.slot.key + '|' + pid];
      const lead = picks[c.slot.key] === pid;
      return `<span class="pchip ${cls}${mine ? ' me' : ''}${pending ? ' pending' : ''}${lead ? ' ahm' : ''}">${pEsc(p.name)}${lead ? '<small class="ahm-tag">אחמ"ש</small>' : ''}${ann ? ` <small>${pEsc(ann)}</small>` : ''}${pending ? ' ⏳' : ''}</span>`;
    }).join('');
    const miss = c.missing ? `<span class="pchip missing">חסר ${c.missing}</span>` : '';
    return `<td${opts.edit ? ` class="editable" data-key="${c.slot.key}" tabindex="0" role="button" aria-label="עריכת משמרת"` : ''}>${chips}${miss}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="board-scroll"><table class="pboard"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

// the whole team as a monthly calendar (the structure of the paper schedule): the days of the week above; in every week a row with the day numbers and under it the morning,
// noon and night, with the name of each shift (and its hours) written once, at the start of the week. Everything fits the width of the screen (no sideways scrolling).
// In the afternoon shifts, and on Friday and Saturday mornings, the ahmash is written first and marked אחמ"ש (one per shift, see ahmashPicks); the person herself is highlighted.
// opts: me, ahmash ({ staff id: rank }); for the coordinator: sel (the person whose requests are open at the side; her names are outlined), colour (names coloured by how the wish was kept) and edit (a tap on a shift opens its editor)
// the key of the colours of the coordinator's calendar (shown under her panel of the instructors' requests)
const mcalKeyHtml = compact => compact === 'tab' ? `<span class="mcal-key tab-key" title="שובץ/ה במשמרת שסימן/ה כך"><span class="mcal-name wish-yes">כן</span><span class="mcal-name wish-can">יכול</span><span class="mcal-name wish-no">לא</span><span class="mcal-name wish-none">לא סומן</span></span>` : compact ? `<div class="mcal-key compact" title="שובץ/ה במשמרת שסימן/ה כך"><span class="mcal-name wish-yes">כן</span><span class="mcal-name wish-can">יכול</span><span class="mcal-name wish-no">לא</span><span class="mcal-name wish-none">לא סומן</span></div>` : '<div class="pnote mcal-key"><span class="mcal-name wish-yes">כן</span> <span class="mcal-name wish-can">יכול</span> <span class="mcal-name wish-no">לא</span> <span class="mcal-name wish-none">לא סומן</span> שובץ/ה במשמרת שסימן/ה כך.</div>';
// Somebody whose hours cross into another shift (two hours or more) is shown in every shift she is there, with the hours of that shift she
// covers (Guy, 2026-10-25): a service girl on Sunday 11-19 is in the morning "מ-11" and in the afternoon "עד 19"; the Excel file does the same.
// Only hours that are not the shift's usual ones: the usual hour where two shifts meet (14-15, 7-8) never counts.
const SHIFT_WIN = { m:[7, 15], e:[14, 22], n:[22, 32] };
// -> [{ key:'day|m', note:'11–15' | '' }]: the shifts this row of the schedule covers (its own first), each with the part of it she is there
function rowShiftParts(r, ownSid){
  const hh = x => { const [h, mi] = String(x || '').split(':').map(Number); return h + (mi || 0) / 60; };
  if(!r.from || !r.to || !ownSid) return ownSid ? [{ key:`${r.day}|${ownSid}`, note:'' }] : [];
  let a = hh(r.from), b = hh(r.to); if(b <= a) b += 24;
  const out = [], fmt = x => String(Math.round(x) % 24);
  for(let d = 0; d < 2; d++) for(const sid of ['m', 'e', 'n']){
    const ws = SHIFT_WIN[sid][0] + 24 * d, we = SHIFT_WIN[sid][1] + 24 * d, ov = Math.min(b, we) - Math.max(a, ws), own = d === 0 && sid === ownSid;
    if(!own && ov < 2) continue;
    const f = Math.max(a, ws), t = Math.min(b, we), whole = f === ws && t === we;
    out.push({ key:`${addDays(r.day, d)}|${sid}`, note:whole ? '' : `${fmt(f)}–${fmt(t)}`, own });
  }
  return out.sort((x, y) => (y.own ? 1 : 0) - (x.own ? 1 : 0));
}
// the instructors whose own hours also reach another shift: shown there too (not counted there: the shift's count stays as it is)
function overlapExtras(ctx){
  if(typeof portalServerOn === 'undefined' || !portalServerOn || !portalState || !portalState.rows) return {};
  const st = portalLoad(), out = {};
  st.rows.forEach(r => {
    if(monthKeyOf(r.day) !== ctx.month && monthKeyOf(addDays(r.day, 1)) !== ctx.month) return;
    if(['L', 'S'].includes(r.shift)) return;
    const p = st.instructors.find(x => x.id === r.staff); if(!p || p.role !== 'instructor') return;
    rowShiftParts(r, SRV_SHIFT_UI[r.shift]).filter(x => !x.own).forEach(x => { (out[x.key] = out[x.key] || []).push({ id:p.id, name:instrName(p, st.instructors), note:x.note }); });
  });
  Object.values(out).forEach(l => l.sort((a, b) => String(a.name).localeCompare(String(b.name), 'he')));
  return out;
}
// the service girls and the teachers of a month by shift ("day|m"), each with her hours when they are not the shift's usual ones
function othersByShift(ctx){
  if(typeof portalServerOn === 'undefined' || !portalServerOn || !portalState || !portalState.rows) return {};
  const st = portalLoad(), out = {}, hh = x => String(parseInt(x, 10));
  st.rows.forEach(r => {
    if(monthKeyOf(r.day) !== ctx.month) return;
    const p = st.instructors.find(x => x.id === r.staff); if(!p || !['service', 'teacher'].includes(p.role)) return;
    const sid = (typeof SRV_SHIFT_UI !== 'undefined' && SRV_SHIFT_UI[r.shift]) || 'm';
    const parts = rowShiftParts(r, sid);
    parts.forEach(x => (out[x.key] = out[x.key] || []).push({ id:p.id, role:p.role, name:instrName(p, st.instructors), note:x.note, from:r.from || '', rowId:r.id, parts:parts.length }));          // (in every shift she covers, with the hours of it)
  });
  Object.values(out).forEach(l => l.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name)));
  return out;
}
const csShowOk = () => { try { return localStorage.getItem('ramzor-show-ok') === '1'; } catch(e){ return false; } };
// a shift the coordinator confirmed by hand ("✓ אישר/ה" in the shift's window: the flag "ok" of the row)
function csConfirmed(key, pid){
  if(typeof portalServerOn === 'undefined' || !portalServerOn || !portalState) return false;
  const st = portalLoad(), id = (st.assignmentIds || {})[`${key}|${pid}`], r = id && (st.rows || []).find(x => x.id === id);
  return !!(r && (r.flags || []).includes('ok'));
}
// the weekly view of a month's calendar (Guy 2026-11-03): the weeks are the calendar's own rows (Sunday to Saturday); the first and the last
// may be partly in the next or the previous month. A week number is kept per month; ‹ › move by one week and cross to the next or previous month
function mcalWeeksOf(mk){ const d = daysOfMonth(mk); return Math.ceil((dowOf(d[0]) + d.length) / 7); }
function mcalWeekOfDay(mk, iso){ const d = daysOfMonth(mk), i = d.indexOf(iso); return i < 0 ? 0 : Math.floor((dowOf(d[0]) + i) / 7); }
function mcalWeekLabel(mk, w){
  const d = daysOfMonth(mk), lead = dowOf(d[0]), inMonth = d.filter((_, i) => Math.floor((lead + i) / 7) === w);
  if(!inMonth.length) return '';
  const f = x => { const t = parseIso(x); return t.getDate() + '/' + (t.getMonth() + 1); };
  return inMonth.length === 1 ? f(inMonth[0]) : f(inMonth[0]) + '–' + f(inMonth[inMonth.length - 1]);
}
const mcalWeekNavHtml = (mk, week) => `<div class="mcal-weeknav"><button type="button" class="mcal-wk" data-mwk="-1" aria-label="השבוע הקודם"><bdi dir="ltr">›</bdi></button><b>שבוע <bdi dir="ltr">${pEsc(mcalWeekLabel(mk, week))}</bdi></b><button type="button" class="mcal-wk" data-mwk="1" aria-label="השבוע הבא"><bdi dir="ltr">‹</bdi></button></div>`;
function mcalViewBarHtml(mk, week, id){          // "חודש | שבוע" and, in the weekly view, the week with ‹ ›
  const isW = Number.isInteger(week);
  return `<div class="mcal-viewbar" id="${id}"><div class="mx-seg mcal-seg" role="group" aria-label="תצוגה"><button type="button" data-mview="week" aria-pressed="${isW}">שבוע</button><button type="button" data-mview="month" aria-pressed="${!isW}">חודש</button></div>${isW ? mcalWeekNavHtml(mk, week) : ''}</div>`;
}
// wires the bar: get() / set(month, week|null) keep the screen's own state; redraw() draws it again
function mcalViewBarWire(root, id, mk, get, set, redraw){
  const bar = root.querySelector('#' + id); if(!bar) return;
  bar.querySelectorAll('[data-mview]').forEach(b => b.addEventListener('click', () => {
    if(b.dataset.mview === 'month') set(mk, null);
    else set(mk, monthKeyOf(isoDate(new Date())) === mk ? mcalWeekOfDay(mk, isoDate(new Date())) : 0);
    redraw();
  }));
  bar.querySelectorAll('[data-mwk]').forEach(b => b.addEventListener('click', () => {
    let w = get() + parseInt(b.dataset.mwk, 10), m = mk;
    if(w < 0){ m = addMonths(mk, -1); w = mcalWeeksOf(m) - 1; }          // (a calendar week split between two months shows each month's own days)
    else if(w >= mcalWeeksOf(mk)){ m = addMonths(mk, 1); w = 0; }
    set(m, w); redraw();
  }));
}
function monthCalHtml(ctx, assignments, opts){
  opts = opts || {};
  const table = scheduleTable(ctx, assignments), today = isoDate(new Date()), picks = ahmashPicks(table, ctx, opts.ahmash || {});
  if(!table.length) return '';
  const hh = x => String(parseInt(x, 10)), hours = s => hh(s.start) + '-' + hh(s.end);
  const blank = '<div class="mcal-blank"></div>', lead = dowOf(table[0].date);
  const others = opts.others === false || opts.othersInCells || typeof scheduleOthersOf !== 'function' ? null : scheduleOthersOf(ctx);          // (the service girls and the teachers: one slim line under every day in the coordinator's calendar; she can hide it)
  const liveMiss = typeof csShiftMissing === 'function' ? csShiftMissing(ctx.month) : null;          // ("חסר N" by the staffing rules, as "דורש תשומת לב": Guy 2026-10-25)
  const inCells = opts.othersInCells ? othersByShift(ctx) : {}, extras = opts.othersInCells || opts.edit ? overlapExtras(ctx) : {};          // (instructors whose hours reach this shift too)          // (the calendar of the staff: they are in the shifts like the instructors; a teacher first, the service girls last — Guy 2026-10-18)
  let weekOthers = false;
  const flat = Array(lead).fill(null).concat(table); while(flat.length % 7) flat.push(null);
  const shiftCell = (r, i) => {
    const c = r.cells[i], s = ctx.shiftTypes[i], wk = [5, 6].includes(dowOf(r.date)), last = i === ctx.shiftTypes.length - 1 && !weekOthers;
    const cls = `mcal-cell${wk ? ' weekend' : ''}${r.date === today ? ' today' : ''}${last ? ' last' : ''}${opts.edit && c.slot ? ' editable' : ''}`, edit = opts.edit && c.slot ? ` data-key="${c.slot.key}" tabindex="0" role="button" aria-label="עריכת משמרת"` : '';
    const hrs = n => n && typeof calHours === 'function' ? calHours(n, s) : n;
    const oth = (inCells[`${r.date}|${s.id}`] || []).filter(x => !(opts.hideRoles || []).includes(x.role)), othName = x => `<span class="mcal-name${opts.me && x.id === opts.me ? ' me' : ''}" data-role="${x.role}">${pEsc(x.name)}${x.note ? `<small>${pEsc(hrs(x.note))}</small>` : ''}${opts.otherRm && x.rowId ? `<button type="button" class="mcal-x" data-other-rm="${x.rowId}" data-sid="${s.id}" aria-label="הסרה מהמשמרת" title="הסרה מהמשמרת">×</button>` : ''}</span>`;          // (the × takes a service girl or a teacher off this shift: Guy 2026-10-26)
    const extra = (extras[`${r.date}|${s.id}`] || []).map(x => `<span class="mcal-name extra${opts.me && x.id === opts.me ? ' me' : ''}" title="משובץ/ת במשמרת הסמוכה, ונמצא/ת גם כאן">${pEsc(x.name)}${x.note ? `<small><bdi>${pEsc(hrs(x.note))}</bdi></small>` : ''}</span>`).join('');
    const teachers = oth.filter(x => x.role === 'teacher').map(othName).join(''), service = oth.filter(x => x.role === 'service').map(othName).join('');
    if(!c.slot) return oth.length ? `<div class="${cls}" data-day="${r.date}" data-shift="${s.id}">${teachers}${service}</div>` : `<div class="${cls} off" data-day="${r.date}" data-shift="${s.id}"></div>`;
    const wish = p => {          // how the wish of this person was kept: placed where she wanted = no colour; "can", "no" and "did not say" each have a colour
      if(!opts.colour) return '';
      if(csConfirmed(c.slot.key, p.iid)) return ' wish-yes' + (csShowOk() ? ' ok' : '');          // (the coordinator marked "✓ אישר/ה": green; the ✓ only by the advanced choice, Guy 2026-10-26)
      const pr = (ctx.prefs && ctx.prefs[p.iid]) || { slots:{} }, ann = ctx.annot && ctx.annot[c.slot.key + '|' + p.iid];
      const key = ann === 'סופ"ש ארוך' ? `${dowOf(c.slot.date) === 5 ? c.slot.date : addDays(c.slot.date, -1)}|l` : c.slot.key, lv = (pr.slots || {})[key];
      return lv === 'avoid' ? ' wish-can' : lv === 'no' ? ' wish-no' : lv === 'yes' ? ' wish-yes' : ' wish-none';
    };
    const lead = c.people.filter(p => picks[c.slot.key] === p.iid), rest = c.people.filter(p => !lead.includes(p));
    const name = (p, isLead) => {
      const mine = opts.me && p.iid === opts.me, ann = ctx.annot && ctx.annot[c.slot.key + '|' + p.iid];
      const pend = opts.pend && opts.pend[c.slot.key + '|' + p.iid];          // (a change that waits for "שליחת עדכונים": the staff do not see it yet)
      return `<span class="mcal-name${mine ? ' me' : ''}${isLead ? ' ahm' : ''}${wish(p)}${opts.sel && opts.sel === p.iid ? ' sel' : ''}${pend ? ' pend' : ''}"${pend ? ' title="שינוי שעוד לא נשלח למדריכים"' : ''}${opts.drag ? ` data-iid="${p.iid}"` : ''}>${pEsc(p.name)}${isLead ? '<small class="ahm-tag">אחמ"ש</small>' : ''}${ann ? `<small><bdi>${pEsc(ann)}</bdi></small>` : ''}</span>`;
    };
    return `<div class="${cls}" data-day="${r.date}" data-shift="${s.id}"${edit}>${teachers}${lead.map(p => name(p, true)).join('')}${rest.map(p => name(p, false)).join('')}${extra}${service}${(liveMiss ? liveMiss[c.slot.key] || 0 : c.missing) ? `<span class="mcal-missing">חסר ${liveMiss ? liveMiss[c.slot.key] : c.missing}</span>` : ''}</div>`;
  };
  if(Number.isInteger(opts.week) && opts.rows){          // the weekly view as rows: a day per row, its shifts side by side — room for the names on a phone (Guy 2026-11-03)
    const w0 = Math.max(0, Math.min(opts.week, flat.length / 7 - 1)) * 7;
    return `<div class="mcal mcal-wrows">${flat.slice(w0, w0 + 7).filter(Boolean).filter(r => !opts.day || r.date === opts.day).map(r => `<div class="mcal-wrow${[5, 6].includes(dowOf(r.date)) ? ' weekend' : ''}${r.date === today ? ' today' : ''}"><div class="mcal-wrow-day"><b>${DOW_SHORT[dowOf(r.date)]}</b><span>${parseIso(r.date).getDate()}/${parseIso(r.date).getMonth() + 1}</span></div><div class="mcal-wrow-cells">${ctx.shiftTypes.map((s, i) => `<div class="mcal-wrow-shift"><span class="mcal-wrow-lbl">${pEsc(s.label)} <small>${hours(s)}</small></span>${shiftCell(r, i)}</div>`).join('')}</div></div>`).join('')}</div>`;
  }
  let out = `<div class="mcal-corner"></div>${DOW_SHORT.map(d => `<div class="mcal-head">${d}</div>`).join('')}`;
  const onlyWeek = Number.isInteger(opts.week) ? Math.max(0, Math.min(opts.week, flat.length / 7 - 1)) * 7 : null;          // (one week of the month only: the weekly view, Guy 2026-11-03)
  for(let w = 0; w < flat.length; w += 7){
    if(onlyWeek !== null && w !== onlyWeek) continue;
    const week = flat.slice(w, w + 7);
    if(w > 0 && onlyWeek === null) out += `<div class="mcal-corner"></div>${DOW_SHORT.map(d => `<div class="mcal-head mini" aria-hidden="true">${d}</div>`).join('')}`;          // (the days of the week again, small, above every later week: the screen scrolls down)
    out += `<div class="mcal-corner"></div>` + week.map(r => r ? `<div class="mcal-num${[5, 6].includes(dowOf(r.date)) ? ' weekend' : ''}${r.date === today ? ' today' : ''}">${parseIso(r.date).getDate()}</div>` : blank).join('');
    weekOthers = !!others && week.some(r => r && others[r.date]);
    ctx.shiftTypes.forEach((s, i) => { out += `<div class="mcal-label"><b>${pEsc(s.label)}</b><small>${hours(s)}</small></div>` + week.map(r => r ? shiftCell(r, i) : blank).join(''); });
    if(weekOthers){          // (two rows: the teachers, then the service girls — never mixed in one line)
      const nm = (x, k) => `<span class="mcal-other ${k}" title="${pEsc(x.name + (x.hours ? ' ' + x.hours : ''))}">${pEsc(x.name)}</span>`;
      const kinds = [['teacher', 'מורות'], ['service', 'שירות']].filter(([k]) => week.some(r => r && others[r.date] && others[r.date][k].length));
      kinds.forEach(([k, label], ki) => {
        out += `<div class="mcal-label others"><small class="${k}">${label}</small></div>` + week.map(r => {
          if(!r) return blank;
          const d = others[r.date] || { service:[], teacher:[] };
          return `<div class="mcal-others ${k}${ki === kinds.length - 1 ? ' last' : ''}${[5, 6].includes(dowOf(r.date)) ? ' weekend' : ''}${r.date === today ? ' today' : ''}" data-day="${r.date}">${d[k].map(x => nm(x, k)).join('')}</div>`;
        }).join('');
      });
    }
  }
  return `<div class="mcal${opts.labelsCenter ? ' lbl-center' : ''}">${out}</div>`;          // (a service girl: the morning and the afternoon only, their names and hours in the middle and larger: Guy 2026-10-26)
}
