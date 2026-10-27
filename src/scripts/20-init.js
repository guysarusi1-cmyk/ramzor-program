// ---------- INIT ----------
(async function init(){
  if(location.hash === '#diag'){ showDiagnostics(); return; }   // device / TV check page, no login needed
  if(typeof simplicityOn === 'function' && simplicityOn()){ simplicityStart(); return; }      // the simplicity checker's screens (test build only, made-up data, no sign-in)
  if(location.hash === '#portal' && PORTAL_ENABLED){ portalServerBoot(); return; }      // the personal sign-in of the portal (its own login, not the staff password)
  if(PORTAL_ENABLED && location.hash !== '#tv'){                                          // somebody signed in personally on this device: straight in (the portal and the Ramzor), no password
    try {
      const { data:{ session } } = await sbPersonal.auth.getSession();
      if(session && await personalEnter()){ maybeShowManageFromHash(); return; }
    } catch(e){ /* the staff password screen, as usual */ }
  }
  let authed = await checkAuth();
  // Mercury stage 6: the shared staff password is gone. A device still signed in with it (not the kids' TV, not the checks of the test site) is signed out: the personal sign-in.
  if(authed && !staffPasswordOn() && location.hash !== '#tv'){
    try { const { data:{ session } } = await sb.auth.getSession(); if(session && session.user && session.user.email === STAFF_EMAIL){ await sb.auth.signOut(); authed = await checkAuth(); } } catch(e){}
  }
  if(authed){
    await loadApp();
    maybeShowManageFromHash();
  }

  if(location.hash === '#tv'){
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('protected-app').style.display = 'none';
    document.getElementById('feedback-back-to-hub').style.display = 'none';
    if(!authed){ await tvGate(); await initRoster(); await initMiniLists(); }          // (a screen without a sign-in joins by a code: 14za-tv-pair.js)
    activateDisplayView();
  }
})();
