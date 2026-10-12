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
