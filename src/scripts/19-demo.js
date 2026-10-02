/*@TEST-ONLY*/
// ---------- DEMO MODE (test environment only) ----------
// ?demo=star | moon | mercury | milestone  — signs in, opens the kids' TV and plays that celebration.
// ?demo=slide3 | slide5 | slide7 ...        — opens the kids' TV on that slide.
// Used with tools\snap.ps1 to take a screenshot of a given moment, without clicking through by hand.
(function(){
  const m = location.search.match(/[?&]demo=([\w-]+)/);
  if(!m) return;
  window.addEventListener('load', async () => {
    document.getElementById('login-password').value = '@config(testPassword)';
    document.getElementById('login-submit-btn').click();
    for(let i=0;i<60 && !(roster && roster.length);i++) await new Promise(r => setTimeout(r, 200));
    const what = m[1];
    // staff-side screens (shown instead of the kids' TV)
    if(what === 'hub' || what === 'daily' || what === 'kids' || what === 'manage' || what === 'green' || what === 'gold' || /^guided-/.test(what)){
      if(what === 'daily') document.getElementById('hub-daily-btn').click();
      else if(what === 'kids') document.getElementById('hub-kids-btn').click();
      else if(what === 'manage') document.getElementById('hub-manage-gear').click();
      else if(what === 'green'){ document.getElementById('hub-daily-btn').click(); openLightFlow('green'); }
      else if(what === 'gold'){ document.getElementById('hub-daily-btn').click(); openLightFlow('gold'); }
      else if(/^guided-/.test(what)){ const [, key, n] = what.split('-'); document.getElementById('hub-daily-btn').click(); openGuidedScreen(key); for(let i=1;i<Number(n || 1);i++) document.getElementById('guided-next-btn').click(); }
      return;
    }
    activateDisplayView(); stopCarousel();
    const kid = roster.find(c => c.id === 'c2') || roster[0];
    if(what === 'star') playCelebration('star', kid, 5);
    else if(what === 'moon') playCelebration('moon', kid, 3);
    else if(what === 'mercury') playCelebration('mercury', kid, 4);
    else if(what === 'milestone') playCelebration('mercury', kid, 7);
    else if(/^slide\d$/.test(what)) showSlide(Number(what.slice(5)));
  });
})();
/*@END-TEST-ONLY*/
