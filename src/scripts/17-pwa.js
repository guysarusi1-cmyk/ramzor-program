
// ---------- PWA: install-to-home-screen + works offline ----------
// A page that stays open for days (the coordinator's: Guy 2026-10-25) picks up a new release by itself: every 5 minutes it reads the release
// number (in sw.js) and when it changed the page reloads at a quiet moment: no window open, nothing being typed or dragged, or the tab not shown.
// The sign-in is kept in the browser, so she stays signed in. The kids' TV screen is left alone.
if(location.protocol.indexOf('http') === 0){
  let firstVer = null, pendingVer = false, toldVer = false;
  const readVer = () => fetch('sw.js?v=' + Date.now(), { cache:'no-store' }).then(r => r.ok ? r.text() : '').then(t => (t.match(/VERSION = '([^']+)'/) || [])[1] || null).catch(() => null);
  const busyNow = () => !!document.querySelector('.sheet') || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) || (typeof srvDragWho !== 'undefined' && !!srvDragWho);
  const tvNow = () => { const v = document.getElementById('view-display'); return /^#tv/.test(location.hash) || !!(v && v.classList.contains('active')); };
  const reloadIfQuiet = () => {
    if(!pendingVer || tvNow()) return;
    if(document.visibilityState === 'hidden' || !busyNow()){ location.reload(); return; }
    if(!toldVer){ toldVer = true; toast('יש גרסה חדשה של האתר. היא תיטען לבד כשתסיימי את מה שפתוח', 5000); }
  };
  const checkVer = async () => { const v = await readVer(); if(!v) return; if(!firstVer){ firstVer = v; return; } if(v !== firstVer){ pendingVer = true; reloadIfQuiet(); } };
  window.addEventListener('load', () => { checkVer(); setInterval(checkVer, 5 * 60 * 1000); setInterval(reloadIfQuiet, 20 * 1000); });
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') checkVer(); else reloadIfQuiet(); });
}
if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('service worker not registered', err));
  });
}
