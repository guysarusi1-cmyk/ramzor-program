/*@TEST-ONLY*/
// ---------- DEMO MODE (test environment only) ----------
// ?demo=star | moon | mercury | milestone  — signs in, opens the kids' TV and plays that celebration.
// ?demo=slide3 | slide5 | slide7 ...        — opens the kids' TV on that slide.
// Used with tools\snap.ps1 to take a screenshot of a given moment, without clicking through by hand.
(function(){
  const m = location.search.match(/[?&]demo=([\w-]+)/);
  if(!m) return;
  window.__portalNoHome = true;
  window.addEventListener('load', async () => {
    document.getElementById('login-password').value = '@config(testPassword)';
    document.getElementById('login-submit-btn').click();
    for(let i=0;i<60 && !(roster && roster.length);i++) await new Promise(r => setTimeout(r, 200));
    const what = m[1];
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
    else if(what === 'bricks' || what === 'bricks100') playCelebration('bricks', kid, what === 'bricks' ? 37 : 100, what === 'bricks' ? 'אומץ' : '');
    else if(what === 'walls'){   // the board with a small wall for every child, with made-up numbers
      const fake = [12, 100, 37, 64, 5, 88, 23, 51, 0, 76, 41, 9, 99, 30];
      getAllChildStates = async () => ({ get: id => Object.assign(emptyChildState(), { bricks: fake[roster.findIndex(c => c.id === id) % fake.length] }) });
      SLIDES[8].hidden = false; showSlide(8);
    }
    else if(/^slide\d+$/.test(what)) showSlide(Number(what.slice(5)));
  });
})();
/*@END-TEST-ONLY*/
