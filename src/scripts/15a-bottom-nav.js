// ---------- bottom navigation bar (phones) ----------
// One button, "בית": back to the first screen — the choice between the Ramzor and the portal (when the portal is on), or the Ramzor's home.
// It is there in the Ramzor and in the portal alike.
function goHome(){ if(PORTAL_ENABLED && typeof showAppHome === 'function') showAppHome(); else showHub(); }
document.getElementById('bnav-home').addEventListener('click', goHome);

function updateBottomNav(){
  const atHome = document.getElementById('view-apphome').classList.contains('active') || (!PORTAL_ENABLED && document.getElementById('view-hub').classList.contains('active'));
  document.getElementById('bnav-home').classList.toggle('active', atHome);
}
// views switch by toggling the "active" class from many places — watching it keeps the bar in sync
// without touching each of them
const bottomNavObserver = new MutationObserver(updateBottomNav);
document.querySelectorAll('.view').forEach(v => bottomNavObserver.observe(v, { attributes:true, attributeFilter:['class'] }));
updateBottomNav();

// "הבא" (Guy 2026-11-03): on a phone the protocol's own "הבא" moves to the bottom bar — חזור | בית | הבא; only while a protocol is open
(function(){
  const nav = document.getElementById('bottom-nav'), gNext = document.getElementById('guided-next-btn'), scr = document.getElementById('staff-screen-guided');
  if(!nav || !gNext || !scr) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'bottom-nav-btn'; b.id = 'bnav-next'; b.hidden = true;
  b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>הבא</span>';
  nav.appendChild(b);
  b.addEventListener('click', () => gNext.click());
  const update = () => {
    const on = document.getElementById('view-staff').classList.contains('active') && getComputedStyle(scr).display !== 'none' && !gNext.hidden;
    b.hidden = !on; nav.classList.toggle('has-next', on);
  };
  const mo = new MutationObserver(update);
  mo.observe(gNext, { attributes:true, attributeFilter:['hidden'] }); mo.observe(scr, { attributes:true, attributeFilter:['style', 'hidden', 'class'] });
  document.querySelectorAll('.view').forEach(v => mo.observe(v, { attributes:true, attributeFilter:['class'] }));
  update();
})();
