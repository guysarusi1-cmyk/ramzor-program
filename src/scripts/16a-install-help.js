
// ---------- "install as an app" help (phones) ----------
// The site is a PWA, so it can live on the home screen like an app. Android Chrome can install it with
// one button; iPhone has no such button, so we show the 3 steps. Hidden once it runs as an installed app.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstallPrompt = e; });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; closeInstallSheet(); updateInstallLink(); });

function runsAsInstalledApp(){
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function isIPhoneOrIPad(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function updateInstallLink(){
  const link = document.getElementById('hub-install-link');
  const phoneLike = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || window.innerWidth <= 700;
  link.hidden = runsAsInstalledApp() || !phoneLike;
}
function openInstallSheet(){
  const body = document.getElementById('install-sheet-body');
  if(deferredInstallPrompt){
    body.innerHTML = `<p>אפשר להתקין את התכנית על מסך הבית, והיא תיפתח כמו אפליקציה רגילה.</p>
      <button type="button" class="btn" id="install-now-btn" style="width:100%;">התקנה עכשיו</button>`;
    document.getElementById('install-now-btn').addEventListener('click', async () => {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      closeInstallSheet();
    });
  } else if(isIPhoneOrIPad()){
    body.innerHTML = `<p>באייפון ההתקנה נעשית דרך ספארי (לא דרך דפדפן אחר):</p>
      <ol><li>לוחצים על כפתור השיתוף בתחתית המסך (ריבוע עם חץ כלפי מעלה).</li>
      <li>גוללים ובוחרים <b>"הוספה למסך הבית"</b>.</li>
      <li>לוחצים <b>"הוספה"</b>. האייקון יופיע על מסך הבית.</li></ol>`;
  } else {
    body.innerHTML = `<p>באנדרואיד, בדפדפן כרום:</p>
      <ol><li>לוחצים על שלוש הנקודות בפינה העליונה.</li>
      <li>בוחרים <b>"התקנת אפליקציה"</b> (או "הוספה למסך הבית").</li>
      <li>מאשרים. האייקון יופיע על מסך הבית.</li></ol>`;
  }
  document.getElementById('install-sheet').hidden = false;
}
function closeInstallSheet(){ document.getElementById('install-sheet').hidden = true; }
document.getElementById('hub-install-link').addEventListener('click', openInstallSheet);
document.getElementById('install-sheet-close').addEventListener('click', closeInstallSheet);
document.getElementById('install-sheet').addEventListener('click', e => { if(e.target.id === 'install-sheet') closeInstallSheet(); });
updateInstallLink();
