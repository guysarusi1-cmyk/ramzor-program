// ---------- AUTH ----------
async function checkAuth(){
  const { data:{ session } } = await sb.auth.getSession();
  const authed = !!session;
  document.getElementById('login-screen').style.display = authed ? 'none' : 'block';
  document.getElementById('protected-app').style.display = authed ? '' : 'none';
  return authed;
}

async function loadApp(){
  await initRoster();
  await initMiniLists();
  renderManageRoster();
}

document.getElementById('login-submit-btn').addEventListener('click', async ()=>{
  const pwInput = document.getElementById('login-password');
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-submit-btn');
  const pw = pwInput.value;
  errEl.style.display = 'none';
  if(!pw) return;
  btn.disabled = true; btn.textContent = 'בודק...';
  const { error } = await sb.auth.signInWithPassword({ email: STAFF_EMAIL, password: pw });
  btn.disabled = false; btn.textContent = 'כניסה';
  if(error){
    errEl.textContent = 'סיסמה שגויה, נסו שוב.';
    errEl.style.display = 'block';
    pwInput.value = '';
    pwInput.focus();
    return;
  }
  pwInput.value = '';
  await checkAuth();
  await loadApp();
  maybeShowManageFromHash();
});

document.getElementById('login-password').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') document.getElementById('login-submit-btn').click();
});

document.getElementById('logout-btn').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  await checkAuth();
});

function activateDisplayView(){
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-display').classList.add('active');
  startCarousel();
}

function showHub(){
  stopCarousel();
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-hub').classList.add('active');
}

document.getElementById('hub-daily-btn').addEventListener('click', ()=>{
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-staff').classList.add('active');
  selectedStaffChild = null;
  showStaffScreen('pick');
});
document.getElementById('hub-learn-btn').addEventListener('click', ()=>{
  toast('לומדת הרמזור בקרוב! 🎓');
});
// home screen's gear icon -> the existing management screen (same view the #manage route opens)
document.getElementById('hub-manage-gear').addEventListener('click', ()=>{
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-manage').classList.add('active');
});
// home screen's quiet "logout" link just triggers the existing logout button (hidden on this screen)
document.getElementById('hub-logout-link').addEventListener('click', ()=>{
  document.getElementById('logout-btn').click();
});
document.getElementById('manage-back-to-hub').addEventListener('click', ()=>{
  location.hash = '';
  showHub();
});

// management screen isn't shown in the regular menu (client request, 2026-10-02) — reach it by
// adding #manage to the site's address after logging in normally with the regular staff password.
function maybeShowManageFromHash(){
  if(location.hash === '#manage'){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-manage').classList.add('active');
  }
}
document.getElementById('reset-stars-btn').addEventListener('click', async ()=>{
  if(!confirm('לאפס את לוח הכוכבים לכל הילדים ל-0? אי אפשר לבטל את זה.')) return;
  await resetAllStars();
  toast('לוח הכוכבים אופס לכולם');
});
document.getElementById('reset-mercury-btn').addEventListener('click', async ()=>{
  if(!confirm('להחזיר את כל החלליות למצב ההתחלתי (לפני הצעד הראשון)? אי אפשר לבטל את זה.')) return;
  await resetAllMercuryToStart();
  toast('כל החלליות הוחזרו למצב ההתחלתי');
});
// TEMP (2026-10-02): remove this button + handler before real staff use
// TEMP (2026-10-02): remove these buttons + handlers before real staff use
document.getElementById('temp-goto-display-btn-manage').addEventListener('click', ()=>{
  location.hash = 'tv';
  location.reload();
});
document.getElementById('temp-preview-bonus-blink-btn-manage').addEventListener('click', async ()=>{
  activateDisplayView();
  stopCarousel();
  await showSlide(3);
  tempForceBonusActiveId = 'bd1';
  await renderBonusesSlide();
  setTimeout(async ()=>{
    tempForceBonusActiveId = null;
    await renderBonusesSlide();
  }, 5000);
});
document.getElementById('feedback-back-to-hub').addEventListener('click', showHub);
document.getElementById('staff-back-to-hub').addEventListener('click', showHub);

