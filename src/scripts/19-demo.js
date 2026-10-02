/*@TEST-ONLY*/
// ---------- DEMO MODE (test environment only) ----------
// ?demo=star | moon | mercury | milestone  — signs in, opens the kids' TV and plays that celebration.
// Used with tools\snap.ps1 to take a screenshot of a given moment, without clicking through by hand.
(function(){
  const m = location.search.match(/[?&]demo=(\w+)/);
  if(!m) return;
  window.addEventListener('load', async () => {
    document.getElementById('login-password').value = '@config(testPassword)';
    document.getElementById('login-submit-btn').click();
    for(let i=0;i<60 && !(roster && roster.length);i++) await new Promise(r => setTimeout(r, 200));
    activateDisplayView(); stopCarousel();
    const kid = roster.find(c => c.id === 'c2') || roster[0];
    const what = m[1];
    if(what === 'star') playCelebration('star', kid, 5);
    else if(what === 'moon') playCelebration('moon', kid, 3);
    else if(what === 'mercury') playCelebration('mercury', kid, 4);
    else if(what === 'milestone') playCelebration('mercury', kid, 7);
  });
})();
/*@END-TEST-ONLY*/
