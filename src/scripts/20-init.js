// ---------- INIT ----------
(async function init(){
  if(location.hash === '#diag'){ showDiagnostics(); return; }   // device / TV check page, no login needed
  const authed = await checkAuth();
  if(authed){
    await loadApp();
    maybeShowManageFromHash();
  }

  if(location.hash === '#tv'){
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('protected-app').style.display = 'none';
    document.getElementById('feedback-back-to-hub').style.display = 'none';
    if(!authed){ await initRoster(); await initMiniLists(); }
    activateDisplayView();
  }
})();
