// ---------- BACK: ONE PAGE BACK, ALWAYS (the "→ חזור" button and the phone's own Back) ----------
// The app is one page, so by default the phone's Back (and an installed app's Back) leaves the app from wherever you are.
// Here every page the person walks into adds one browser-history entry — a screen of the Ramzor, the app home, a tab of a
// portal, a tab of a child in the therapy portal — and Back returns to the page before it: step by step back through a
// protocol, then to the traffic light, then home; from a portal tab to the tab before it, then to the screen before the portal.
// Only from the first page does Back leave. Open sheets (a question, a portal sheet, accessibility...) close first.
// The bottom bar has a "→ חזור" button that does the same (Guy, 2026-10-22); on a wide screen it floats at the bottom.
(function(){
  if(location.hash === '#tv' || location.hash === '#diag' || IS_TV_PREVIEW) return;   // the room TV has no Back button to care about

  const el = id => document.getElementById(id);
  const shown = id => { const e = el(id); return !!e && getComputedStyle(e).display !== 'none'; };
  const portalOn = () => typeof portalUi !== 'undefined';

  // the page on the screen now: a key (two pages with the same key are the same page) and what is needed to bring it back
  function currentScreenKey(){
    const v = document.querySelector('.view.active');
    if(!v) return 'hub';
    if(v.id === 'view-staff'){
      for(const s of ['guided', 'green', 'gold']) if(shown('staff-screen-' + s)) return 'staff:' + s;
      return 'staff:pick';
    }
    if(v.id === 'view-kids-quick'){
      for(const [k, id] of [['child', 'kids-quick-pick-child'], ['moon', 'kids-quick-moon-panel'], ['intro', 'kids-quick-yellow-intro'], ['list', 'kids-quick-yellow-list']]) if(shown(id)) return 'kq:' + k;
      return 'kq:color';
    }
    if(v.id === 'view-portal' && portalOn()) return `portal:${portalUi.tab || ''}|${portalUi.viewAs || ''}${portalUi.actAs ? 'a' : ''}${portalUi.editPrefs ? 'e' : ''}${portalUi.manager ? 'm' : ''}`;
    if(v.id === 'view-therapy' && typeof thp !== 'undefined') return `therapy:${thp.mode}|${thp.tab || ''}|${thp.editing || ''}|${thp.editing ? thp.wtab || '' : ''}`;
    return ({ 'view-manage':'manage', 'view-display':'display', 'view-apphome':'apphome', 'view-control':'control' })[v.id] || 'hub';
  }
  function snapshot(key){
    if(key.startsWith('portal:')) return { tab:portalUi.tab, viewAs:portalUi.viewAs || null, actAs:!!portalUi.actAs, editPrefs:!!portalUi.editPrefs, manager:!!portalUi.manager, persona:portalUi.persona };
    if(key.startsWith('therapy:')) return { mode:thp.mode, tab:thp.tab, editing:thp.editing, wtab:thp.wtab };
    return null;
  }
  const isRamzorFlow = key => key.startsWith('staff:') || key.startsWith('kq:');

  // the Ramzor's flows: "one page back" = what that screen's own back button does
  function goUp(key){
    switch(key){
      case 'staff:guided': if(guidedStep > 0){ el('guided-prev-btn').click(); return 'stay'; } el('staff-screen-guided').querySelector('.back-btn').click(); break;
      case 'staff:green':  el('staff-screen-green').querySelector('.back-btn').click(); break;
      case 'staff:gold':   el('staff-screen-gold').querySelector('.back-btn').click(); break;
      case 'staff:pick':   showHub(); break;
      case 'kq:child':     el('kids-quick-back-to-color').click(); break;
      case 'kq:moon':      el('kids-quick-back-to-children').click(); break;
      case 'kq:intro':     el('kids-quick-yellow-intro-back').click(); break;
      case 'kq:list':      el('kids-quick-yellow-list-back').click(); break;
      default:             showHub();
    }
  }
  // any other page: brought back as it was
  async function restorePage(key, snap){
    if(key === 'apphome' && typeof showAppHome === 'function') return showAppHome();
    if(key === 'manage' && typeof openManagement === 'function') return openManagement();
    if(key === 'control' && typeof showControl === 'function') return showControl();
    if(key.startsWith('portal:') && snap){
      if(portalUi.editPrefs && !snap.editPrefs && typeof srvFlush === 'function'){ clearTimeout(srv.timer); await srvFlush(); }          // (what was filled for somebody is saved before leaving)
      const wasEditing = !!portalUi.editPrefs;
      Object.assign(portalUi, { tab:snap.tab, viewAs:snap.viewAs, actAs:snap.actAs, editPrefs:snap.editPrefs, manager:snap.manager, persona:snap.persona });
      if(wasEditing !== !!snap.editPrefs && typeof srvResnap === 'function') srvResnap();
      return showPortal(snap.tab);
    }
    if(key.startsWith('therapy:') && snap){
      if(!el('view-therapy').classList.contains('active') || thp.mode !== snap.mode) await showTherapyPortal(snap.mode);
      Object.assign(thp, { tab:snap.tab, editing:snap.editing, wtab:snap.wtab });
      return thpRender();
    }
    showHub();
  }

  // anything open on top of a screen is closed by Back before the screen changes
  function closeOpenSheet(){
    const confirm = document.querySelector('.confirm-sheet');
    if(confirm){ const c = confirm.querySelector('.confirm-cancel'); if(c){ c.click(); return true; } }
    const ps = [...document.querySelectorAll('.psheet')].pop();
    if(ps){ const c = ps.querySelector('[data-close]'); if(c) c.click(); else if(ps.close) ps.close(); else ps.remove(); return true; }
    for(const id of ['a11y-sheet', 'install-sheet']) if(el(id) && !el(id).hidden){ el(id).hidden = true; return true; }
    return false;
  }

  // The trail of pages is kept here (stack + how to bring each page back). The browser's history only needs ONE extra entry,
  // a guard, while there is a page to go back to: the phone's Back takes the guard away, the app goes one page back and puts the
  // guard back. On the first page there is no guard, so Back leaves the app, as usual. (Never several history steps at once:
  // the browser does those late, and a quick second Back got lost.)
  let stack = ['hub'], snaps = [null], rootSet = false, guardOn = false;
  let ignoreUntil = 0;                // the moment our own history.back() (taking the guard away) lands: not a Back of the person
  let muteScreenWatcher = false;      // while the app answers a Back press, the watcher stays quiet
  history.replaceState({ nav:'base' }, '');
  function syncGuard(){
    if(stack.length > 1 && !guardOn){ history.pushState({ nav:'guard' }, ''); guardOn = true; }
    else if(stack.length <= 1 && guardOn){ guardOn = false; ignoreUntil = Date.now() + 1200; history.back(); }
  }

  let queued = false;
  const watch = () => { if(queued) return; queued = true; queueMicrotask(() => { queued = false; screenMayHaveChanged(); }); };
  new MutationObserver(watch).observe(el('protected-app'), { subtree:true, attributes:true, attributeFilter:['class', 'style'] });
  for(const id of ['view-portal', 'view-therapy']) if(el(id)) new MutationObserver(watch).observe(el(id), { childList:true, subtree:id === 'view-therapy' });          // (a portal tab redraws the view without a class change)

  function screenMayHaveChanged(){
    if(muteScreenWatcher) return;
    if(!shown('protected-app')){ rootSet = false; stack = ['hub']; snaps = [null]; syncGuard(); updateBack(); return; }          // (the sign-in screen: the next sign-in starts a new trail)
    const key = currentScreenKey();
    if(!rootSet){ rootSet = true; stack = [key]; snaps = [snapshot(key)]; syncGuard(); updateBack(); return; }          // the first page after signing in is the start of the trail
    const top = stack[stack.length - 1];
    if(key === top){ snaps[snaps.length - 1] = snapshot(key); return; }
    if(key === 'apphome' || (key === 'hub' && stack[0] !== 'apphome')){ stack = [key]; snaps = [snapshot(key)]; }          // home from anywhere: a new trail
    else if(stack.lastIndexOf(key) >= 0){ stack.length = stack.lastIndexOf(key) + 1; snaps.length = stack.length; snaps[snaps.length - 1] = snapshot(key); }          // a page already in the trail (an in-app "back" button, or a tab visited before): back to it
    else { stack.push(key); snaps.push(snapshot(key)); }
    syncGuard(); updateBack();
  }

  window.addEventListener('popstate', async () => {
    if(Date.now() < ignoreUntil){ ignoreUntil = 0; return; }             // our own move (the guard taken away)
    guardOn = false;                                                      // (the person's Back took the guard)
    if(closeOpenSheet()){ syncGuard(); return; }                          // Back only closed a sheet: the page stays
    if(stack.length <= 1){ syncGuard(); return; }                         // at the first page: the next Back leaves the app
    const top = stack[stack.length - 1], target = stack[stack.length - 2], snap = snaps[stack.length - 2];
    muteScreenWatcher = true;
    try {
      if(isRamzorFlow(top) && (isRamzorFlow(target) || target === 'hub')){
        if(goUp(top) === 'stay'){ syncGuard(); return; }                  // one protocol step back, same screen
      } else await restorePage(target, snap);
    } finally { setTimeout(() => { muteScreenWatcher = false; }, 0); }
    stack.pop(); snaps.pop();
    const now = currentScreenKey();                                       // if the page differs from the trail, trust the screen
    if(now !== stack[stack.length - 1]){ stack[stack.length - 1] = now; snaps[snaps.length - 1] = snapshot(now); }
    syncGuard(); updateBack();
  });

  // the "→ חזור" button: in the bottom bar on a phone, floating on a wide screen; hidden on the first page (nothing to go back to)
  const backBtns = [];
  function makeBack(){
    const nav = el('bottom-nav');
    if(nav && !el('bnav-back')){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'bottom-nav-btn'; b.id = 'bnav-back';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg><span>חזור</span>';
      nav.insertBefore(b, nav.firstChild); backBtns.push(b);
    }
    if(!el('nav-back-float')){
      const f = document.createElement('button'); f.type = 'button'; f.id = 'nav-back-float'; f.className = 'nav-back-float'; f.textContent = '→ חזור';
      el('protected-app').appendChild(f); backBtns.push(f);
    }
    backBtns.forEach(b => b.addEventListener('click', () => { if(stack.length > 1) history.back(); }));
  }
  function updateBack(){
    const can = rootSet && stack.length > 1;
    backBtns.forEach(b => { b.hidden = !can; });
    const nav = el('bottom-nav'); if(nav) nav.classList.toggle('has-back', can);
  }
  makeBack(); updateBack();
  window.navCanGoBack = () => rootSet && stack.length > 1;          // (for the checks)
  window.navTrail = () => stack.slice();
})();
