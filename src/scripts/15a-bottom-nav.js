
// ---------- bottom navigation bar (phones) ----------
// "בית" = the home screen, "שליטה במסך הילדים" = the kids-screen control area. Both just trigger the
// same things the home screen's own buttons do, so there is a single behaviour for each.
document.getElementById('bnav-home').addEventListener('click', showHub);
document.getElementById('bnav-kids').addEventListener('click', ()=> document.getElementById('hub-kids-btn').click());

function updateBottomNav(){
  const kidsActive = document.getElementById('view-kids-quick').classList.contains('active');
  document.getElementById('bnav-kids').classList.toggle('active', kidsActive);
  document.getElementById('bnav-home').classList.toggle('active', !kidsActive);
}
// views switch by toggling the "active" class from many places — watching it keeps the bar in sync
// without touching each of them
const bottomNavObserver = new MutationObserver(updateBottomNav);
document.querySelectorAll('.view').forEach(v => bottomNavObserver.observe(v, { attributes:true, attributeFilter:['class'] }));
updateBottomNav();
