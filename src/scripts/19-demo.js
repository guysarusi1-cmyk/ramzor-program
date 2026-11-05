/*@TEST-ONLY*/
// the secretary's screens with example data, kept in memory only: nothing here reaches the database
function secDemoStore(){
  const today = secToday(), sun = addDays(today, -dowOf(today));
  const contacts = [{ id:'k1', name:'חונך לדוגמה', phone:'0501234567' }, { id:'k2', name:'מתנדבת לדוגמה', phone:null }];
  const kid = (roster[0] || {}), kid2 = (roster[1] || kid);
  const evs = [
    { id:'e1', kind:'mentor', child_id:kid.id, child:kid.id ? displayName(kid) : 'ילד לדוגמה', contact_id:'k1', person:'חונך לדוגמה', i:'reading', t:'16:00', end:'17:00', every_weeks:1 },
    { id:'e2', kind:'volunteer', activity:'ציור בחצר', group:'small', contact_id:'k2', person:'מתנדבת לדוגמה', i:'art', t:'16:00', end:null, every_weeks:null },
    { id:'e3', kind:'mentor', child_id:kid2.id, child:kid2.id ? displayName(kid2) : 'ילד לדוגמה', contact_id:'k1', person:'חונך לדוגמה', i:'sport', t:'16:30', end:null, every_weeks:null },
    { id:'e4', kind:'volunteer', activity:'כדורגל', group:'other', group_text:'כיתה ג', contact_id:'k2', person:'מתנדבת לדוגמה', i:'sport', t:'17:15', end:'18:00', every_weeks:2 }
  ];
  const stars = {}; roster.forEach((c, i) => { stars[c.id] = (i * 3) % 11; });
  Object.assign(secApi, {
    between:async (from, to) => { const out = []; for(let d = from; d <= to; d = addDays(d, 1)) evs.forEach(e => { const once = !e.every_weeks; if(once ? d === (e.day || today) : dowOf(d) === dowOf(e.day || today)) out.push(Object.assign({}, e, { occ:d, day:e.day || today })); }); return out; },
    save:async (id, scope, day, r) => { const row = { id:id || 'n' + Date.now(), kind:r.kind, child_id:r.child_id, child:r.child_id ? displayName(roster.find(c => c.id === r.child_id)) : null, activity:r.activity, group:r.group_kind, group_text:r.group_text, contact_id:r.contact_id, person:(contacts.find(c => c.id === r.contact_id) || {}).name, i:r.icon, t:r.start_time, end:r.end_time, every_weeks:r.every_weeks, monthly_nth:r.monthly_nth, day:r.day };
      const at = evs.findIndex(e => e.id === id); if(at >= 0) evs[at] = row; else evs.push(row); return row.id; },
    remove:async id => { const at = evs.findIndex(e => e.id === id); if(at >= 0) evs.splice(at, 1); },
    contacts:async () => contacts.slice(),
    contactAdd:async c => { const n = Object.assign({ id:'k' + Date.now() }, c); contacts.push(n); return n; },
    contactChange:async (id, c) => { Object.assign(contacts.find(x => x.id === id), c); evs.filter(e => e.contact_id === id).forEach(e => { e.person = c.name; }); },
    contactRemove:async id => { const ahead = evs.filter(e => e.contact_id === id); if(ahead.length) return { ok:false, ahead:ahead.map(e => Object.assign({ day:today }, e)) }; contacts.splice(contacts.findIndex(c => c.id === id), 1); return { ok:true }; },
    canEdit:async () => !/[?&]offshift/.test(location.search),
    stars:async () => Object.assign({}, stars),
    setStars:async (id, compute) => { const before = { stars:stars[id] || 0 }, ch = compute(before); if(!ch) return { ok:false, reason:'declined', before }; stars[id] = ch.set.stars; return { ok:true, before, after:{ stars:stars[id] } }; }
  });
  return evs;
}
async function secDemo(){
  const sm = (location.search.match(/[?&]sm=(\w+)/) || [])[1] || 'home', role = /[?&]asadmin/.test(location.search) ? null : 'secretary';
  if(role){ srv.profile = Object.assign({}, srv.profile, { kind:role, admin:false, control:true }); const me = portalMe(); if(me){ me.role = role; me.admin = false; } if(srv.meRow){ srv.meRow.role = role; srv.meRow.admin = false; } }
  sb = sbPersonal; ramzorPersonal = true;
  try { await initRoster(); } catch(e){}
  secDemoStore();
  if(sm === 'home') showAppHome();
  else if(sm === 'hub') showHub();
  else if(sm === 'kids') showKidsList();
  else if(sm === 'control'){ ctl.fold = { ev:true, tt:true }; showControl(); }
  else if(sm === 'contacts'){ sec.tab = 'contacts'; showSecScreen('ev'); }
  else showSecScreen(sm);
}
// ---------- DEMO MODE (test environment only) ----------
// ?demo=star | moon | mercury | milestone  — signs in, opens the kids' TV and plays that celebration.
// ?demo=slide3 | slide5 | slide7 ...        — opens the kids' TV on that slide.
// Used with tools\snap.ps1 to take a screenshot of a given moment, without clicking through by hand.
(function(){
  const m = location.search.match(/[?&]demo=([\w-]+)/);
  if(!m) return;
  window.__portalNoHome = true; window.__staffPasswordOn = true;
  window.addEventListener('load', async () => {
    document.getElementById('login-password').value = '@config(testPassword)';
    document.getElementById('login-submit-btn').click();
    for(let i=0;i<60 && !(roster && roster.length);i++) await new Promise(r => setTimeout(r, 200));
    const what = m[1];
    if(/^psrv-/.test(what)){      // the portal on the database: psrv-login | psrv-prefs | psrv-sched | psrv-subs | psrv-service  (signs in with the TEST personal accounts)
      document.getElementById('login-screen').style.display = 'none'; document.getElementById('protected-app').style.display = '';
      if(what === 'psrv-login'){ srvShowLogin('email'); return; }
      const kind = /^psrv-(subs|csched|cswaps|cvac|cset|oncall|sec)$/.test(what) ? 'coordinator' : what === 'psrv-service' ? 'service' : what === 'psrv-mgr' ? 'manager' : what === 'psrv-ther' ? 'therapist' : 'instructor';
      await sbPersonal.auth.signInWithPassword({ email:kind + '-test@merkaz-cherum.local', password:'@config(testPersonalPassword)' });
      try { const sz = location.search.match(/[?&]size=(\d)/); localStorage.setItem('ramzor-portal-big', sz ? sz[1] : '0'); } catch(e){}          // (&size=2 shows the very large text)
      if(/[?&]light(&|$)/.test(location.search)) localStorage.setItem('ramzor-portal-theme', 'light');          // (&light: the light look)
      await srvStart();
      const pm = location.search.match(/[?&]pmonth=(\d{4}-\d{2})/); if(pm) portalUi.month = portalUi.pmonth = portalUi.smonth = pm[1];          // (&pmonth=2026-11 opens that month)
      if(/[?&]long\b/.test(location.search)){ srv.showLong = true; srv.pickOne = /[?&]pick\b/.test(location.search); }          // (&long shows the long weekend, &long&pick also "only one of these")
      if(/[?&]leopard\b/.test(location.search)) srv.portalTheme = 'leopard';          // (&leopard: the coordinator's leopard look)
      if(/[?&]lang=ar/.test(location.search)){ srv.lang = 'ar'; arApply(); }          // (&lang=ar: the portal in Arabic)
      if(/[?&]open\b/.test(location.search)) portalUi.fold = { mine:true, team:true, swap:true, fb:true, openshifts:true, swmine:true, swopen:true };          // (&open shows the folded parts opened)
      { const sf = location.search.match(/[?&]sfold=(\w+)/); if(sf){ portalUi.setFold = portalUi.setFold || {}; portalUi.setFold[sf[1]] = true; } }          // (&sfold=ann opens that part of the settings screen)
      if(/[?&]printpdf/.test(location.search)) setTimeout(async () => {          // (&printpdf: the coordinator's print page, kept on the screen for a PDF made by a headless browser)
        window.print = () => {}; for(let i = 0; i < 80 && !document.getElementById('cs-print'); i++) await new Promise(r => setTimeout(r, 250)); document.getElementById('cs-print').click(); await new Promise(r => setTimeout(r, 200));
        const sheet = document.getElementById('print-sheet').cloneNode(true); setTimeout(() => { document.body.appendChild(sheet); document.body.classList.add('printing'); }, 1500);
      }, 2500);
      if(/[?&]light(&|$)/.test(location.search)){ srv.portalTheme = 'light'; portalLoad().settings.theme = 'light'; }
      { const pw = (location.search.match(/[?&]pw=(\w+)/) || [])[1];          // (&pw=kinds|days|0|1..|end: a step of the process; &pw=month: the month opened from it; &pw=wk: "שבוע-שבוע")
        if(pw){ const wk = pw === 'wk'; srv.prefWeekly = !wk; srv.prefPlain = !wk; localStorage.setItem('ramzor-plain-help', '1'); portalUi.prefsWholeMonth = pw === 'month'; localStorage.setItem(pwPosKey(prefsMonthNow()), JSON.stringify(/^\d+$/.test(pw) ? Number(pw) : pw === 'month' || wk ? 0 : pw)); } }
      if(/[?&]gear(&|$)/.test(location.search)) setTimeout(() => { document.getElementById('portal-gear').click(); setTimeout(() => document.querySelectorAll('.psheet details').forEach(d => { d.open = true; }), 400); }, 1500);          // (&gear: the settings, every fold open)
      if(/[?&]aslive(&|$)/.test(location.search)) window.__asLive = true;          // (&aslive: what the coming live version shows)
      if(/[?&]hub(&|$)/.test(location.search)){ await personalEnter(); showHub(); ramzorLookApply(); return; }          // (&hub: the Ramzor's first screen)
      if(what === 'psrv-ther'){ await showTherapyPortal(); return; }
      if(what === 'psrv-sec'){ secDemo(); return; }          // (the secretary with example data, nothing is saved: &sm=home | stars | tt | ev | contacts | kids | hub | control)
      if(what === 'psrv-mgr'){ const t = location.search.match(/[?&]mt=(\w+)/), v = location.search.match(/[?&]mtv=(\w+)/); if(v) mgr.ttView = v[1]; if(/[?&]mte(&|$)/.test(location.search)) mgr.ttMode = 'edit'; showPortal(t ? t[1] : 'schedule'); return; }          // (&mt=timetable&mtv=week, &mte: the editor)
      if(/[?&]csopen(&|$)/.test(location.search)) portalUi.csOpen = true;
      if(what === 'psrv-oncall'){ const v = location.search.match(/[?&]ocv=(\w+)/); if(v){ oc.view = 'sched'; oc.schedView = v[1]; } showOncallScreen(); return; }          // (&ocv=week | weekend: the schedule on a phone)
      if(/[?&]monthpic(&|$)/.test(location.search)) setTimeout(() => { const c = csMonthCanvas(portalUi.month || monthKeyOf(srvToday())); c.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;width:' + c.width + 'px;height:' + c.height + 'px'; document.body.appendChild(c); }, 5000);          // (&monthpic: the picture of the month to share, at its own size)
      showPortal(({ 'psrv-prefs':'prefs', 'psrv-subs':'submissions', 'psrv-swaps':'swaps', 'psrv-cswaps':'swaps', 'psrv-cvac':'vacations', 'psrv-cset':'settings', 'psrv-inbox':'inbox' })[what] || (location.search.match(/[?&]ptab=(\w+)/) || [])[1] || 'schedule');          // (&ptab=avail opens that tab)
      return;
    }
    if(!/[?&]nochars/.test(location.search)) roster.forEach((c, i) => { childSettings[c.id] = Object.assign({}, childSettings[c.id], { id:c.id, character:CHARACTER_KEYS[i % CHARACTER_KEYS.length] }); });       // (the demo gives every child a character, in memory only)
    const acc = location.search.match(/[?&]a11y=([\w,]+)/);                  // e.g. &a11y=xl,contrast
    if(acc){ a11y = { size: /xl/.test(acc[1]) ? 'xl' : /\bl\b/.test(acc[1]) ? 'l' : 'm', contrast: /contrast/.test(acc[1]), motion: /motion/.test(acc[1]) }; applyA11y(); }
    // staff-side screens (shown instead of the kids' TV)
    if(what === 'moon' || what === 'curse' || what === 'hub' || what === 'daily' || what === 'kids' || what === 'manage' || what === 'green' || what === 'apphome' || /^portal-/.test(what) || what === 'gold' || what === 'strength' || what === 'words' || /^guided-/.test(what)){
      if(what === 'moon' || what === 'curse'){ document.getElementById('hub-kids-btn').click(); await new Promise(r => setTimeout(r, 300)); document.getElementById('kq-moon-journey-btn').click(); document.querySelector('#kids-quick-roster .chip[data-id="c6"]').click(); for(let i=0;i<30 && !document.getElementById('moon-curse');i++) await new Promise(r => setTimeout(r, 150)); if(what === 'curse') document.getElementById('moon-curse').click(); }
      else if(what === 'strength'){ document.getElementById('hub-kids-btn').click(); await new Promise(r => setTimeout(r, 300)); document.getElementById('kq-brick-btn').click(); document.querySelector('#kids-quick-roster .chip[data-id="c6"]').click(); }
      else if(what === 'words'){ const real = getChildState; getChildState = async id => Object.assign(await real(id), { moonSteps: 7, mercurySteps: 3 }); document.getElementById('hub-kids-btn').click(); await new Promise(r => setTimeout(r, 300)); document.getElementById('kq-moon-journey-btn').click(); document.querySelector('#kids-quick-roster .chip[data-id="c6"]').click(); }
      else if(what === 'apphome') showAppHome();
      else if(/^portal-/.test(what)){      // portal-coord | portal-slot | portal-prefs | portal-instr | portal-swaps | portal-tt | portal-settings | portal-subs | portal-light
        const st = portalLoad(), mk = monthKeyOf(isoDate(new Date()));
        if(/light/.test(what)){ st.settings.theme = 'light'; }
        if(/prefs|instr|swaps/.test(what)) portalUi.persona = 'i1';
        if(/instr/.test(what)) portalUi.fold = { mine:true, team:true, swap:true };
        if(/swaps/.test(what)){ const other = myShifts(portalPerson('i4'), mk).find(s => s.end > Date.now()); if(other && !st.swaps.some(s => s.key === other.key)) st.swaps.unshift({ id:'s-demo', key:other.key, from:'i4', to:null, status:'open', at:new Date().toISOString() }); }
        const tab = /prefs/.test(what) ? 'prefs' : /instr/.test(what) ? 'schedule' : /swaps/.test(what) ? 'swaps' : /tt/.test(what) ? 'timetable' : /settings/.test(what) ? 'settings' : /subs/.test(what) ? 'submissions' : 'schedule';
        showPortal(tab);
        if(/slot/.test(what)) openSlotEditor(mk, isoDate(new Date()) + '|e');
      }
      else if(what === 'daily') document.getElementById('hub-daily-btn').click();
      else if(what === 'kids') document.getElementById('hub-kids-btn').click();
      else if(what === 'manage') document.getElementById('hub-manage-gear').click();
      else if(what === 'green'){ document.getElementById('hub-daily-btn').click(); openLightFlow('green'); }
      else if(what === 'gold'){ document.getElementById('hub-daily-btn').click(); openLightFlow('gold'); }
      else if(/^guided-/.test(what)){ const [, key, n] = what.split('-'); document.getElementById('hub-daily-btn').click(); openGuidedScreen(key); for(let i=1;i<Number(n || 1);i++) document.getElementById('guided-next-btn').click(); }
      return;
    }
    if(what === 'summary'){   // a child's summary on the TV (&kid=c6; the snapshot time picks the stage)
      document.getElementById('login-screen').style.display = 'none'; document.getElementById('protected-app').style.display = '';
      const kid = (location.search.match(/[?&]kid=(\w+)/) || [])[1] || (roster[5] || roster[0]).id;
      activateDisplayView(); stopCarousel(); showChildSummary(kid);
      return;
    }
    if(what === 'faces'){   // the drawn characters of people without a photo, for a visual check
      document.getElementById('protected-app').style.display = 'none';
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:900;background:#1d2340;display:flex;flex-wrap:wrap;gap:3vmin;align-content:center;justify-content:center;padding:4vmin';
      box.innerHTML = Array.from({ length:16 }, (_, i) => `<div style="width:20vmin;height:20vmin;border-radius:50%;overflow:hidden;border:.6vmin solid #fff">${personArt({ id:'person-' + i * 7919, female:i < 8 })}</div>`).join('');
      document.body.appendChild(box);
      return;
    }
    if(what === 'ships'){   // every ship, for a visual check
      document.getElementById('protected-app').style.display = 'none';
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:900;background:#141a35;display:flex;flex-wrap:wrap;gap:3vmin;align-items:center;justify-content:center;padding:4vmin';
      box.innerHTML = Object.values(SHIP_OPTIONS).map(s => '<img src="' + s + '" style="width:26vmin">').join('');
      document.body.appendChild(box);
      return;
    }
    if(what === 'planet'){   // the Mercury drawing at three sizes, for a visual check
      document.getElementById('protected-app').style.display = 'none';
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:900;background:#141a35;display:flex;gap:6vmin;align-items:center;justify-content:center';
      box.innerHTML = [60, 30, 12].map(s => '<div style="width:' + s + 'vmin;height:' + s + 'vmin">' + mercuryPlanetSvg().replace('class="mercury-planet"', 'style="width:100%;height:100%"') + '</div>').join('');
      document.body.appendChild(box);
      return;
    }
    activateDisplayView(); stopCarousel();
    const kid = roster.find(c => c.id === 'c2') || roster[0];
    if(what === 'star') playCelebration('star', kid, 5);
    else if(what === 'moon') playCelebration('moon', kid, 3);
    else if(what === 'mercury') playCelebration('mercury', kid, 4);
    else if(what === 'milestone') playCelebration('mercury', kid, 7);
    else if(what === 'bricks' || what === 'bricks100') playCelebration('bricks', kid, what === 'bricks' ? 37 : 100, what === 'bricks' ? 'אומץ' : '', Array.from({ length:100 }, (_, i) => BRICK_STRENGTHS[i % BRICK_STRENGTHS.length]));
    else if(what === 'walls'){   // the board with a small wall for every child, with made-up numbers
      const fake = [12, 100, 37, 64, 5, 88, 23, 51, 0, 76, 41, 9, 99, 30];
      getAllChildStates = async () => ({ get: id => Object.assign(emptyChildState(), { bricks: fake[roster.findIndex(c => c.id === id) % fake.length] }) });
      SLIDES[8].hidden = false; showSlide(8);
    }
    else if(/^slide\d+$/.test(what)){ if(/^slide(9|10)$/.test(what) && typeof loadTvToday === 'function') await loadTvToday(true); showSlide(Number(what.slice(5))); }          // (the screens of today read the database first, as the TV does before it shows them)
    else if(what === 'quiet-night' || what === 'quiet-morning'){          // (the "good night" / "good morning" screens, whatever the hour)
      const view = document.getElementById('view-display'); let el = document.getElementById('tv-quiet');
      if(!el){ el = document.createElement('div'); el.id = 'tv-quiet'; view.appendChild(el); }
      const md = what.slice(6); tvQuietNow = () => md; el.innerHTML = TV_QUIET_HTML[md](/sat/.test(location.search)); el.hidden = false; tvQuietShown = md;          // (the hour is pretended, so the minute check keeps it)
    }
  });
})();
/*@END-TEST-ONLY*/
