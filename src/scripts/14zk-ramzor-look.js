// ---- the Ramzor's staff screens on the new look (Guy 2026-10-30): the main screen, daily work, the kids' screen control, the ahmash control,
// the management. The kids' TV keeps its own look. With a personal sign-in: the person's own look (light, dark, or the leopard where allowed);
// on the center's shared device: dark, with a switch kept on that device. The colours: 22-ramzor-staff.css, by body[data-rlook].
const RZ_STAFF_VIEWS = ['view-hub', 'view-staff', 'view-control', 'view-kids-quick', 'view-manage'];
const rzPersonal = () => typeof srv !== 'undefined' && !!srv.meRow;
function ramzorLookNow(){
  if(rzPersonal()){
    try {
      if(leopardAllowed() && portalThemeNow() === 'leopard') return 'leopard';
      return (srv.portalTheme && srv.portalTheme !== 'leopard' ? srv.portalTheme : portalLoad().settings.theme) === 'light' ? 'light' : 'dark';
    } catch(e){ return 'dark'; }
  }
  try { return localStorage.getItem('ramzor-shared-look') === 'light' ? 'light' : 'dark'; } catch(e){ return 'dark'; }
}
function ramzorLookApply(){
  const v = document.querySelector('.view.active');
  if(v && RZ_STAFF_VIEWS.includes(v.id)){
    const look = ramzorLookNow();
    document.body.dataset.rlook = look;
    document.body.classList.toggle('leopard-bg', look === 'leopard');
  } else if(document.body.dataset.rlook){
    delete document.body.dataset.rlook;
    if(v && v.id === 'view-display') document.body.classList.remove('leopard-bg');
  }
}
async function ramzorLookNext(){          // (the switch on the Ramzor's main screen: light ↔ dark, and the leopard where it is allowed)
  const now = ramzorLookNow();
  if(!rzPersonal()){ try { localStorage.setItem('ramzor-shared-look', now === 'light' ? 'dark' : 'light'); } catch(e){} ramzorLookApply(); return; }
  const order = ['dark', 'light'].concat(leopardAllowed() ? ['leopard'] : []), next = order[(order.indexOf(now) + 1) % order.length];
  if(next === 'leopard'){ srv.portalTheme = 'leopard'; ramzorLookApply(); await srvSaveSetting({ portalTheme:'leopard' }); return; }
  const st = portalLoad(); st.settings.theme = next; try { localStorage.setItem('ramzor-portal-theme', next); } catch(e){}
  srv.portalTheme = next; ramzorLookApply(); await srvSaveSetting({ portalTheme:next });
}
(function(){
  const mo = new MutationObserver(ramzorLookApply);
  const watch = () => { document.querySelectorAll('.view').forEach(v => mo.observe(v, { attributes:true, attributeFilter:['class'] })); ramzorLookApply(); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  document.addEventListener('click', e => { if(e.target.closest('#hub-look-btn')) ramzorLookNext(); });
})();
