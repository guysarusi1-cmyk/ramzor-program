
// ---------- THE PHONE'S BACK BUTTON ----------
// The app is one page, so by default the Back button / back swipe (and an installed app's Back) leaves the app
// from wherever you are. Here every screen the staff walk into adds one browser-history entry, and Back goes
// up one level: step by step back through a protocol, then to the traffic light, then home — and only from
// home does Back leave. Open sheets (a question, the step list, accessibility...) close first.
(function(){
  if(location.hash === '#tv' || location.hash === '#diag' || IS_TV_PREVIEW) return;   // the room TV has no Back button to care about

  const el = id => document.getElementById(id);
  const shown = id => { const e = el(id); return !!e && getComputedStyle(e).display !== 'none'; };

  function currentScreenKey(){
    const v = document.querySelector('.view.active');
    if(!v) return 'hub';
    if(v.id === 'view-staff'){
      for(const s of ['guided', 'green', 'gold']) if(shown('staff-screen-' + s)) return 'staff:' + s;
      return 'staff:pick';
    }
    if(v.id === 'view-kids-quick'){
      for(const [k, id] of [['child', 'kids-quick-pick-child'], ['moon', 'kids-quick-moon-panel'], ['intro', 'kids-quick-yellow-intro'], ['list', 'kids-quick-yellow-list']]) if(shown(id)) return 'kq:' + k;
      return 'kq:color';
    }
    return ({ 'view-manage':'manage', 'view-display':'display' })[v.id] || 'hub';
  }

  // what "one level up" means on each screen = what that screen's own back button does
  function goUp(key){
    switch(key){
      case 'staff:guided': if(guidedStep > 0){ el('guided-prev-btn').click(); return 'stay'; } el('staff-screen-guided').querySelector('.back-btn').click(); break;
      case 'staff:green':  el('staff-screen-green').querySelector('.back-btn').click(); break;
      case 'staff:gold':   el('staff-screen-gold').querySelector('.back-btn').click(); break;
      case 'staff:pick':   showHub(); break;
      case 'kq:child':     el('kids-quick-back-to-color').click(); break;
      case 'kq:moon':      el('kids-quick-back-to-children').click(); break;
      case 'kq:intro':     el('kids-quick-yellow-intro-back').click(); break;
      case 'kq:list':      el('kids-quick-yellow-list-back').click(); break;
      case 'kq:color':     showHub(); break;
      case 'manage':       el('manage-back-to-hub').click(); break;
      default:             showHub();
    }
  }

  // anything open on top of a screen is closed by Back before the screen changes
  function closeOpenSheet(){
    const confirm = document.querySelector('.confirm-sheet');
    if(confirm){ const c = confirm.querySelector('.confirm-cancel'); if(c){ c.click(); return true; } }
    for(const id of ['a11y-sheet', 'install-sheet']) if(el(id) && !el(id).hidden){ el(id).hidden = true; return true; }
    return false;
  }

  // The trail of screens (stack[i] <-> history entry i). Every entry carries its own number, so when the browser
  // reports "now at entry N" we know whether it was us moving (expectedEntry) or the person pressing Back.
  let stack = ['hub'];
  let expectedEntry = null, expectedUntil = 0;      // a move WE made stays 'expected' for a moment only (a missed event must never swallow a real Back)
  const expect = entry => { expectedEntry = entry; expectedUntil = Date.now() + 1200; };
  let muteScreenWatcher = false;      // while the app answers a Back press, the watcher stays quiet
  history.replaceState({ entry:0 }, '');
  const pushEntry = () => history.pushState({ entry: stack.length - 1 }, '');
  // Going home rewinds the history, which the browser does a moment later. Screens opened in that moment are only
  // added to the trail, and their history entries are created once the rewind has landed (or after a short wait).
  let rewinding = false;
  function finishRewind(){
    if(!rewinding) return; rewinding = false;
    for(let i = 1; i < stack.length; i++) history.pushState({ entry: i }, '');
  }

  let queued = false;
  new MutationObserver(() => {
    if(queued) return; queued = true;
    queueMicrotask(() => { queued = false; screenMayHaveChanged(); });
  }).observe(el('protected-app'), { subtree:true, attributes:true, attributeFilter:['class', 'style'] });

  function screenMayHaveChanged(){
    if(muteScreenWatcher) return;
    const key = currentScreenKey();
    const top = stack[stack.length - 1];
    if(key === top) return;
    const here = stack.length - 1;
    if(key === 'hub'){                                    // home from anywhere: forget the trail, rewind the history to the start
      stack = ['hub'];
      if(here > 0){ rewinding = true; expect(0); history.go(-here); setTimeout(finishRewind, 1500); }
    } else if(key === stack[stack.length - 2]){            // an in-app "back" button was used: keep the history in step
      stack.pop(); expect(stack.length - 1); history.back();
    } else {
      stack.push(key); if(!rewinding) pushEntry();
    }
  }

  window.addEventListener('popstate', e => {
    const landed = e.state && typeof e.state.entry === 'number' ? e.state.entry : 0;
    if(expectedEntry !== null && Date.now() < expectedUntil && landed === expectedEntry){ expectedEntry = null; finishRewind(); return; }   // our own move
    expectedEntry = null;
    const top = stack[stack.length - 1];
    if(landed >= stack.length - 1) return;                                // forward / unknown: leave it
    if(closeOpenSheet()){ pushEntry(); return; }                          // Back only closed a sheet: the screen stays (entry restored)
    if(stack.length <= 1) return;                                         // at home: Back leaves the app, as usual
    muteScreenWatcher = true; setTimeout(() => { muteScreenWatcher = false; }, 0);
    const result = goUp(top);
    if(result === 'stay'){ pushEntry(); return; }                         // one protocol step back, same screen
    stack.length = Math.max(1, landed + 1);
    const now = currentScreenKey();                                       // if a jump made the screen differ from the trail, trust the screen
    if(now !== stack[stack.length - 1]) stack = now === 'hub' ? ['hub'] : ['hub', now];
  });
})();
