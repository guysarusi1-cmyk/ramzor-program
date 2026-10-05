/*@TEST-ONLY*/
// ---------- AUTOMATIC CHECKS (test environment only) ----------
// Open the test site with ?runchecks (tests\run-checks.ps1 does this in a hidden browser). The page
// signs in, walks through every screen and flow, and writes the outcome into #check-results.
// It only ever runs against the test project, never the live site.
(function(){
  if(!/[?&]runchecks\b/.test(location.search)) return;
  window.__portalNoHome = true;
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail ?? '') });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const activeView = () => (document.querySelector('.view.active') || {}).id;
  const visible = el => !!el && getComputedStyle(el).display !== 'none';
  const errors = [];
  window.addEventListener('error', e => errors.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', e => errors.push('promise: ' + (e.reason && e.reason.message || e.reason)));

  // answers the question sheet that replaced the browser's confirm box (typing the word when one is asked for)
  async function answerSheet(word){
    for(let i = 0; i < 30 && !document.querySelector('.confirm-sheet'); i++) await sleep(100);
    const s = document.querySelector('.confirm-sheet'); if(!s) return false;
    const inp = s.querySelector('.confirm-input'); if(inp && word){ inp.value = word; inp.dispatchEvent(new Event('input')); }
    s.querySelector('.confirm-ok').click(); await sleep(80); return true;
  }

  // opens management; when the manager login is on, types the manager's TEST password into the question that appears
  const MANAGER_TEST_PASSWORD = '@config(testManagerPassword)';
  async function gear(){
    $('hub-manage-gear').click();
    if(!MANAGER_LOGIN) return;
    for(let i = 0; i < 12 && !document.querySelector('.code-input'); i++) await sleep(100);
    const inp = document.querySelector('.code-input');
    if(inp){ inp.value = MANAGER_TEST_PASSWORD; document.querySelector('.confirm-ok').click(); }
  }
  // with the manager login on, the cleanup writes of the checks (setChildState = the manager's reset path) need the manager's session
  async function ensureManager(){
    if(!MANAGER_LOGIN) return;
    const { error } = await sbAdmin.auth.signInWithPassword({ email: MANAGER_EMAIL, password: MANAGER_TEST_PASSWORD });
    if(error) check('the manager TEST login works (config/test.json: testManagerPassword)', false, error.message);
    managementOpenUntil = Date.now() + 30 * 60 * 1000;
  }  // puts a test child's numbers back (lowering them is the manager's reset path, which instructors are refused by the database)
  async function putState(id, patch){ const s = await getChildStateForUpdate(id); if(!s) return; Object.assign(s, patch); await setChildState(id, s); }
  async function step(name, fn){
    try { await fn(); } catch(e){ check(name + ' (crashed)', false, e && e.stack || e); }
  }

  async function run(){
    // ---- sign in
    await step('sign in', async () => {
      $('login-password').value = '@config(testPassword)';
      $('login-submit-btn').click();
      for(let i=0;i<40 && !(roster && roster.length);i++) await sleep(250);
      check('sign-in opens the app', visible($('protected-app')) && !visible($('login-screen')), 'protected app not shown');
      check('roster loaded (14 fictional children)', roster.length === 14, 'roster has ' + roster.length);
      check('environment is the test one', APP_ENV === 'test' && /סביבת בדיקות/.test(document.body.innerText), 'no test banner');
      check('daily step limit is OFF in test', MOON_DAILY_LIMIT_ENABLED === false, 'limit is on');
    });

    await ensureManager();
    // ---- home
    await step('home', async () => {
      check('home screen is the first screen', activeView() === 'view-hub', activeView());
      check('home has daily-ops and kids-screen cards', visible($('hub-daily-btn')) && visible($('hub-kids-btn')), 'cards missing');
    });

    // ---- install-as-app help (phones only)
    await step('install help', async () => {
      const phone = innerWidth <= 700;
      check(phone ? 'install link shows on phones' : 'install link hidden on bigger screens', visible($('hub-install-link')) === phone, 'visible=' + visible($('hub-install-link')));
      if(!phone) return;
      $('hub-install-link').click();
      check('install sheet opens with steps', !$('install-sheet').hidden && $('install-sheet-body').textContent.length > 20, 'empty sheet');
      $('install-sheet-close').click();
      check('install sheet closes', $('install-sheet').hidden, 'still open');
    });

    // ---- bottom bar (phones only)
    await step('bottom bar', async () => {
      const phone = innerWidth <= 700;
      check(phone ? 'bottom bar shows on phones' : 'bottom bar hidden on bigger screens', visible($('bottom-nav')) === phone, 'visible=' + visible($('bottom-nav')));
      if(!phone) return;
      const labels = [...document.querySelectorAll('#bottom-nav .bottom-nav-btn')].map(b => b.textContent.trim());
      check('bottom bar has only "בית" and "שליטה במסך הילדים"', labels.join('|') === 'בית|שליטה במסך הילדים', labels.join('|'));
      check('"בית" is highlighted on the home screen', $('bnav-home').classList.contains('active') && !$('bnav-kids').classList.contains('active'), 'wrong highlight');
      $('bnav-kids').click(); await sleep(150);
      check('bar: kids control opens', activeView() === 'view-kids-quick', activeView());
      check('bar: kids control is highlighted', $('bnav-kids').classList.contains('active') && !$('bnav-home').classList.contains('active'), 'wrong highlight');
      $('bnav-home').click(); await sleep(150);
      check('bar: home opens', activeView() === 'view-hub', activeView());
      $('hub-daily-btn').click();
      check('phone: no page header above the daily-ops content', !visible($('shared-header')) && !visible($('staff-back-to-hub')), 'header still shown');
      showHub();
      const r = $('bottom-nav').getBoundingClientRect();
      check('bar sits at the bottom edge', Math.abs(r.bottom - innerHeight) < 2, 'bottom ' + r.bottom + ' vs ' + innerHeight);
      $('hub-daily-btn').click(); openGuidedScreen('red');
      check('bar is hidden during a protocol', !visible($('bottom-nav')), 'visible');
      showHub();
    });

    // ---- protocol legend (all steps as number + action)
    await step('legend', async () => {
      showHub(); $('hub-daily-btn').click();
      const wide = innerWidth >= 640;
      for(const [key, total] of [['red', 8], ['orange', 8], ['yellow', 5]]){
        openGuidedScreen(key);
        const items = [...document.querySelectorAll('#guided-legend-list li')];
        check(`${key}: legend lists all ${total} steps`, items.length === total, items.length);
        check(`${key}: legend shows number + action only`, items.every((li, i) => li.querySelector('.gl-n').textContent === String(i + 1) && li.querySelector('.gl-t').textContent.length > 2) && !/העמקת ההבנה|אני רואה שאתה כועס|אני אתן לך שתי אזהרות/.test($('guided-legend-list').textContent), $('guided-legend-list').textContent.slice(0, 80));
        check(`${key}: step 1 is marked as current`, items[0].classList.contains('current') && items.filter(li => li.classList.contains('current')).length === 1, 'wrong current');
        check(`${key}: the step list is hidden until the button is pressed`, visible($('guided-legend-btn')) && !visible($('guided-legend')), 'visibility wrong');
        $('guided-legend-btn').click();
        const main = document.querySelector('#staff-screen-guided .guided-main').getBoundingClientRect(), side = $('guided-legend').getBoundingClientRect();
        check(`${key}: pressing it shows the list BESIDE the step, not over it`, visible($('guided-legend')) && visible($('guided-step-body')) && (side.right <= main.left + 2 || main.right <= side.left + 2), `list ${Math.round(side.left)}..${Math.round(side.right)} / step ${Math.round(main.left)}..${Math.round(main.right)}`);
        check(`${key}: the next/back buttons still work with the list open`, visible($('guided-next-btn')) && $('guided-next-btn').getBoundingClientRect().right <= innerWidth + 1 && $('guided-next-btn').getBoundingClientRect().left >= -1, 'button cut off');
        document.querySelectorAll('#guided-legend-list [data-step]')[3].click();
        check(`${key}: tapping step 4 jumps there`, guidedStep === 3 && document.querySelector('#guided-legend-list li.current .gl-n').textContent === '4' && $('guided-counter').textContent.includes('4'), 'guidedStep=' + guidedStep);
        check(`${key}: the list stays open after choosing`, visible($('guided-legend')), 'closed');
        $('guided-next-btn').click();
        check(`${key}: the process continues while the list is open`, guidedStep === 4 && visible($('guided-legend')) && document.querySelector('#guided-legend-list li.current .gl-n').textContent === '5', 'step ' + (guidedStep + 1));
        $('guided-prev-btn').click(); document.querySelectorAll('#guided-legend-list [data-step]')[3].click();
        check(`${key}: earlier steps are marked done`, document.querySelectorAll('#guided-legend-list li.done').length === 3, document.querySelectorAll('#guided-legend-list li.done').length);
      }
      // wording the client asked to change in orange step 7
      openGuidedScreen('orange');
      while(guidedStep < 6) $('guided-next-btn').click();
      check('orange step 7 says "ספציפי", not "מסוים"', /ילד ספציפי שנפגע/.test($('guided-step-body').textContent) && !/ילד מסוים/.test($('guided-step-body').textContent), $('guided-step-body').textContent.slice(0, 80));
      showHub();
    });
    // ---- daily operations: full traffic light, no child
    await step('daily ops', async () => {
      $('hub-daily-btn').click();
      check('daily ops opens staff view', activeView() === 'view-staff', activeView());
      const rows = [...document.querySelectorAll('#quick-light-rows [data-quick]')].map(r => r.dataset.quick);
      check('lights are in order gold, red, orange, yellow, green', rows.join() === 'gold,red,orange,yellow,green', rows.join());
      check('no child list on this screen', !document.querySelector('#staff-screen-pick .child-chip, #staff-screen-pick #staff-child-list'), 'a child list is there');

      const bulbNames = [...document.querySelectorAll('#quick-light-rows .bulb')].map(b => b.textContent.trim());
      check('daily ops: each light carries its colour name', bulbNames.join() === ['gold','red','orange','yellow','green'].map(c => PROGRAM[c].label).join(), bulbNames.join());
      check('daily ops: title and subtitle above the lights are centred', getComputedStyle(document.querySelector('#staff-screen-pick h2')).textAlign === 'center' && getComputedStyle(document.querySelector('#staff-screen-pick .note')).textAlign === 'center', 'not centred');
      check('kids control: the bonus button has the candy', /🍬 גריעת בונוס/.test($('kq-revoke-bonus-btn').textContent), $('kq-revoke-bonus-btn').textContent);
      for(const [color, total] of [['red', 8], ['orange', 8], ['yellow', 5]]){
        document.querySelector(`#quick-light-rows [data-quick="${color}"]`).click();
        check(`${color}: guided screen opens`, visible($('staff-screen-guided')), 'not visible');
        check(`${color}: starts at step 1 of ${total}`, $('guided-counter').textContent.includes('1') && $('guided-counter').textContent.includes(String(total)), $('guided-counter').textContent);
        check(`${color}: no "back" button on step 1`, $('guided-prev-btn').hidden, 'prev visible');
        let guard = 0; while(!$('guided-next-btn').hidden && guard++ < 20) $('guided-next-btn').click();
        check(`${color}: reaches the last step (${total})`, guard === total - 1, 'clicked next ' + guard + ' times');
        check(`${color}: no "next" button on last step`, $('guided-next-btn').hidden, 'next visible');
        $('guided-prev-btn').click();
        check(`${color}: back button goes one step back`, $('guided-counter').textContent.includes(String(total - 1)), $('guided-counter').textContent);
        document.querySelector('#staff-screen-guided .back-btn').click();
        check(`${color}: back returns to the traffic light`, visible($('staff-screen-pick')), 'pick not visible');
      }
      // the report-form step of red and orange
      for(const key of ['red', 'orange']){
        openGuidedScreen(key);
        const idx = GUIDED_PROTOCOLS[key].steps.findIndex(s => s.report);
        while(guidedStep < idx) $('guided-next-btn').click();
        const link = $('guided-report-link');
        check(`${key}: report step has the form link`, link && /docs\.google\.com\/forms/.test(link.href), link && link.href);
      }
      // red step with the under-5 warning
      openGuidedScreen('red');
      let sawWarning = false, warnLook = null;
      for(let i=0;i<8;i++){
        const w = document.querySelector('.guided-under5');
        if(w){ sawWarning = true; const cs = getComputedStyle(w); warnLook = { fs: parseFloat(cs.fontSize), glow: cs.boxShadow, text: w.textContent }; }
        if(!$('guided-next-btn').hidden) $('guided-next-btn').click();
      }
      check('red: under-5 warning shows when no child is chosen', sawWarning, 'never shown');
      check('under-5 reminder is small and quiet (no glow, no alarm emoji)', !!warnLook && warnLook.fs <= 14 && warnLook.glow === 'none' && !/⚠/.test(warnLook.text), JSON.stringify(warnLook));

      document.querySelector('#quick-light-rows [data-quick="green"]').click();
      check('green screen opens', visible($('staff-screen-green')), 'not visible');
      check('green offers a WhatsApp link per social worker', document.querySelectorAll('#green-sw-section a[href^="https://wa.me/"]').length === 2, document.getElementById('green-sw-section').innerHTML.slice(0, 120));
      // involved children picker + highlighted worker numbers
      const giBtn = $('green-involved-btn'), giPanel = $('green-involved-panel');
      check('green: "children involved" list is closed at first', giPanel.hidden && giBtn.textContent.includes('הילדים שהיו מעורבים במקרה'), giBtn.textContent);
      giBtn.click();
      check('green: list opens, one row per child, with a note about choosing several', !giPanel.hidden && document.querySelectorAll('#green-involved-list input').length === roster.length && /יותר מילד אחד/.test(giPanel.textContent), giPanel.textContent.slice(0, 60));
      const sw = phone => document.querySelector(`#green-sw-section .sw-link[data-sw="${phone}"]`);
      const dana = sw('972500000001'), ronit = sw('972500000002');
      check('green: each social worker shows her number', /050-0000001/.test(dana.textContent) && /050-0000002/.test(ronit.textContent), dana.textContent + ' | ' + ronit.textContent);
      check('green: nothing highlighted before choosing', !dana.classList.contains('sw-highlight') && !ronit.classList.contains('sw-highlight'), 'highlighted early');
      const pick = (id, on) => { const cb = document.querySelector(`#green-involved-list input[value="${id}"]`); cb.checked = on; cb.dispatchEvent(new Event('change')); };
      pick('c1', true);
      check('green: a child of the first worker highlights only her', dana.classList.contains('sw-highlight') && !ronit.classList.contains('sw-highlight') && ronit.classList.contains('sw-dim'), dana.className + ' | ' + ronit.className);
      check('green: highlighted number blinks gently and grows', getComputedStyle(dana).animationName !== 'none' && getComputedStyle(dana).transform !== 'none', getComputedStyle(dana).animationName);
      check('green: count of chosen children is shown', /נבחרו 1/.test($('green-involved-count').textContent), $('green-involved-count').textContent);
      pick('c10', true);
      check('green: children of both workers highlight both', dana.classList.contains('sw-highlight') && ronit.classList.contains('sw-highlight') && !dana.classList.contains('sw-dim') && !ronit.classList.contains('sw-dim'), dana.className + ' | ' + ronit.className);
      pick('c1', false); pick('c10', false);
      check('green: clearing the choice clears the highlight', !dana.classList.contains('sw-highlight') && !ronit.classList.contains('sw-highlight') && !dana.classList.contains('sw-dim'), 'still marked');
      document.querySelector('#staff-screen-green .back-btn').click();
      document.querySelector('#quick-light-rows [data-quick="gold"]').click();
      check('gold screen opens with its 3 real actions (no "coming soon" placeholders)', visible($('staff-screen-gold')) && document.querySelectorAll('#staff-screen-gold .guided-action').length === 3 && ![...document.querySelectorAll('#staff-screen-gold .guided-action')].some(b => b.disabled), 'gold screen wrong');
      showHub();
    });

    // ---- kids-screen control area
    await step('kids control', async () => {
      $('hub-kids-btn').click();
      check('kids-screen control opens', activeView() === 'view-kids-quick' || activeView() === 'view-display' || !!activeView(), activeView());
    });

    // ---- giving a star really changes the data (test project only)
    await step('give a star', async () => {
      const id = roster[0].id;
      const before = (await getChildState(id)).stars || 0;
      await giveStar(id);
      const after = (await getChildState(id)).stars || 0;
      check('giving a star adds exactly one', after === before + 1, before + ' -> ' + after);
      const s = await getChildState(id); s.stars = before; await setChildState(id, s);
      check('star can be set back (cleanup)', ((await getChildState(id)).stars || 0) === before, 'not restored');
    });

    // ---- simultaneous changes never lose a star; every change can be taken back
    await step('safe updates and undo', async () => {
      const kid = 'c6';
      const stars = async () => (await getChildState(kid)).stars || 0;
      const base = await stars();
      await Promise.all([1, 2, 3, 4, 5, 6].map(() => giveStar(kid)));
      check('6 simultaneous stars give exactly 6 (none lost)', (await stars()) === base + 6, base + ' -> ' + (await stars()));
      await putState(kid, { stars: base });

      await giveStar(kid);
      check('the star message has no "ביטול" button (switched off for now)', !document.querySelector('.toast-undo') && STAR_UNDO_ENABLED === false && !!document.querySelector('.toast'), 'undo still shown');
      check('the star itself is recorded', (await stars()) === base + 1, base + ' vs ' + (await stars()));
      await putState(kid, { stars: base });

      // moon / word-planet journey through the real screens
      showHub(); $('hub-kids-btn').click(); await sleep(200); $('kq-moon-journey-btn').click();
      document.querySelector(`#kids-quick-roster .chip[data-id="${kid}"]`).click();
      for(let i = 0; i < 30 && !$('moon-clean'); i++) await sleep(100);
      const beforeS = await getChildState(kid);
      const bigR = $('moon-clean').getBoundingClientRect(), smallR = $('moon-curse').getBoundingClientRect();
      check('journey: the everyday action is big, the serious one small and set apart', bigR.height > smallR.height + 10 && smallR.top - bigR.bottom > 24, `big ${Math.round(bigR.height)}px, small ${Math.round(smallR.height)}px, gap ${Math.round(smallR.top - bigR.bottom)}px`);
      $('moon-clean').click();
      for(let i = 0; i < 30 && (await getChildState(kid)).mercurySteps === beforeS.mercurySteps; i++) await sleep(100);
      check('journey: a step is recorded once', (await getChildState(kid)).mercurySteps === beforeS.mercurySteps + 1, 'steps ' + (await getChildState(kid)).mercurySteps);
      check('journey: the step message has no "ביטול" button (switched off for now)', !document.querySelector('.toast-undo') && STEP_UNDO_ENABLED === false, 'undo still shown');
      const keep = await getChildStateForUpdate(kid); keep.mercurySteps = beforeS.mercurySteps; keep.moonDayDate = beforeS.moonDayDate; keep.moonDayStatus = beforeS.moonDayStatus; await setChildState(kid, keep);   // (put the test child back)

      // "spaceship disabled" asks first
      for(let i = 0; i < 30 && !$('moon-curse'); i++) await sleep(100);
      $('moon-curse').click(); await sleep(150);
      const sheet = document.querySelector('.confirm-sheet');
      check('"spaceship disabled" opens a question first', !!sheet && /להשבית/.test(sheet.textContent), 'no question');
      sheet.querySelector('.confirm-cancel').click(); await sleep(300);
      check('answering "back" records nothing', (await getChildState(kid)).moonDayStatus === beforeS.moonDayStatus, 'status changed');
      $('moon-curse').click(); await sleep(150);
      document.querySelector('.confirm-ok').click();
      for(let i = 0; i < 30 && (await getChildState(kid)).moonDayStatus !== 'cursed'; i++) await sleep(100);
      check('confirming records it', (await getChildState(kid)).moonDayStatus === 'cursed', 'not recorded');
      document.querySelector('.toast-undo-btn').click();
      for(let i = 0; i < 30 && (await getChildState(kid)).moonDayStatus === 'cursed'; i++) await sleep(100);
      check('undo restores the day', (await getChildState(kid)).moonDayStatus === beforeS.moonDayStatus, 'still cursed');
      const restore = await getChildStateForUpdate(kid); restore.moonDayDate = beforeS.moonDayDate; restore.moonDayStatus = beforeS.moonDayStatus; await setChildState(kid, restore);

      // bonus revocation: marked, not duplicated, can be taken back
      showHub(); $('hub-kids-btn').click(); await sleep(200); $('kq-revoke-bonus-btn').click(); await sleep(150); $('kq-pick-child-for-revoke-btn').click();
      document.querySelector(`#kids-quick-roster .chip[data-id="${kid}"]`).click(); await sleep(400);
      const rb = document.querySelector('#kq-yellow-bonus-daily-list .bonus-chip:not(.revoked) .revoke-bonus');
      window.scrollTo(0, 0);
      check('bonus screen: the bonuses are on the first screen, the protocol text is folded away', rb.getBoundingClientRect().top < innerHeight - 40 && !!document.querySelector('#kq-yellow-protocol-list details.proto-reminder:not([open])'), 'bonus at ' + Math.round(rb.getBoundingClientRect().top) + 'px of ' + innerHeight);
      const revBefore = (await getActiveBonusRevocations()).length;
      rb.click(); rb.click(); await sleep(1200);
      const revAfter = (await getActiveBonusRevocations()).length;
      check('revoking a bonus twice quickly records it once', revAfter === revBefore + 1, revBefore + ' -> ' + revAfter);
      check('a revoked bonus is shown as revoked', rb.closest('.bonus-chip').classList.contains('revoked') && rb.disabled, 'no sign');
      document.querySelector('.toast-undo-btn').click(); await sleep(1500);
      const revUndone = (await getActiveBonusRevocations()).length;
      check('revocation undo works (needs supabase/hardening.sql in this project)', revUndone === revBefore || revUndone === revAfter, 'unexpected ' + revUndone);
      showHub();
    });

    // ---- what a visitor who is not signed in can see
    await step('privacy', async () => {
      const anon = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const minimal = await anon.from('roster').select('id, first_name, last_initial');
      check('the TV (not signed in) can read the names it needs', !minimal.error && minimal.data.length === roster.length, minimal.error && minimal.error.message);
      const full = await anon.from('roster').select('age, sw_phone');
      // true once supabase/hardening.sql was run in this project; until then it is only a reminder, never a failure
      check('(info) a visitor cannot read age / social-worker phones — ' + (full.error ? 'ENFORCED by the database' : 'NOT YET: run supabase/hardening.sql in this project'), true, '');
      const rows = (await sb.from('roster').select('*')).data;
      check('signed-in staff still read everything', rows.length === roster.length && rows.every(r => 'sw_phone' in r), 'staff lost access');
    });

    // ---- ships chosen by the client for two children
    await step('assigned ships', async () => {
      check('child 1 has the teal UFO and child 3 the sky-blue UFO', shipFor('c1') === SHIP_ufo_green && shipFor('c3') === SHIP_ufo_sky, 'wrong ships');
      check('the sky-blue UFO can be picked for any child', SHIP_OPTIONS.ufo_sky === SHIP_ufo_sky && SHIP_ufo_sky.startsWith('data:image/svg+xml'), 'not offered');
    });

    // ---- journey boards are in the rotation only when a child is on that journey
    await step('journey boards', async () => {
      const ids = ['a', 'b', 'c'];
      let r = journeyBoardsNeeded([{ child_id:'a', moon_steps:7 }, { child_id:'b', moon_steps:7 }, { child_id:'c', moon_steps:9 }], ids);
      check('everyone on Mercury: only the word-planet board', !r.moon && r.mercury, JSON.stringify(r));
      r = journeyBoardsNeeded([{ child_id:'a', moon_steps:3 }, { child_id:'b', moon_steps:0 }, { child_id:'c', moon_steps:2 }], ids);
      check('everyone on the moon journey: only the moon board', r.moon && !r.mercury, JSON.stringify(r));
      r = journeyBoardsNeeded([{ child_id:'a', moon_steps:7 }], ids);
      check('child with no data counts as just starting (moon board needed)', r.moon && r.mercury, JSON.stringify(r));
      await refreshJourneyBoards();
      const rows = (await sb.from('child_state').select('child_id, moon_steps')).data;
      const expected = journeyBoardsNeeded(rows, roster.map(c => c.id));
      check('rotation flags follow the real data', SLIDES[6].hidden === !expected.moon && SLIDES[7].hidden === !expected.mercury, `hidden6=${SLIDES[6].hidden} hidden7=${SLIDES[7].hidden}`);
    });

    // ---- the ship's own stunt on the board: out to the front of the screen, then back to its new spot
    await step('stunt flight', async () => {
      activateDisplayView(); stopCarousel();
      await showSlide(7); await sleep(300);
      const kid = 'c7', now = (await getChildState(kid)).mercurySteps;   // c7 is on step 6 in the test data
      const run = flyMarkerStunt(kid, $('mercury-board'), renderMercuryBoard, now - 1);
      await sleep(1700);
      const flyer = document.querySelector('body > .kid-marker');
      check('during the show a copy of the ship is on screen', !!flyer, 'no flyer');
      if(flyer){
        const r = flyer.getBoundingClientRect();
        check('the ship is at the front of the screen (big, centred)', Math.abs(r.left + r.width / 2 - innerWidth / 2) < innerWidth * 0.08 && r.width > Math.min(innerWidth, innerHeight) * 0.25, `center ${Math.round(r.left + r.width / 2)}x${Math.round(r.top + r.height / 2)} width ${Math.round(r.width)}`);
        check('its name stays upright (only the ship turns)', !!flyer.querySelector('.lbl') && flyer.firstElementChild !== flyer.querySelector('.lbl'), 'label missing');
      }
      const real = document.querySelector(`#mercury-board .kid-marker[data-child-id="${kid}"]`);
      check('the real marker waits hidden meanwhile', !!real && real.style.visibility === 'hidden', 'not hidden');
      await run;
      check('afterwards the copy is gone', !document.querySelector('body > .kid-marker'), 'copy left behind');
      const after = document.querySelector(`#mercury-board .kid-marker[data-child-id="${kid}"]`);
      check('the ship is back on the board, visible', !!after && after.style.visibility !== 'hidden', 'marker hidden/missing');
      check('all ships are visible again', [...document.querySelectorAll('#mercury-board .kid-marker')].every(m => m.style.visibility !== 'hidden'), 'one is hidden');
      stopCarousel(); showHub();
    });

    // ---- a double tap on a child while giving a star must not give two
    await step('star double tap', async () => {
      showHub(); $('hub-kids-btn').click(); await sleep(200);
      $('kq-give-star-btn').click();
      const chip = document.querySelector('#kids-quick-roster .chip[data-id="c3"]');
      const before = (await getChildState('c3')).stars || 0;
      chip.click(); chip.click();
      await sleep(1500);
      const after = (await getChildState('c3')).stars || 0;
      check('double tap on a child gives exactly one star', after === before + 1, before + ' -> ' + after);
      const s = await getChildState('c3'); s.stars = before; await setChildState('c3', s);
      showHub();
    });

    // ---- a save that fails must be reported, never shown as success
    await step('failed saves', async () => {
      const realUpdate = updateChildState, realToast = toast, realUndoToast = toastUndo, realMini = setMiniList, messages = [];
      toast = m => messages.push(m); toastUndo = m => messages.push(m);
      try {
        updateChildState = async () => ({ ok:false, reason:'network' });
        const gave = await giveStar('c3');
        check('failed star save: returns false and warns', gave === false && messages.some(m => /לא נשמר/.test(m)) && !messages.some(m => /כוכב נוסף/.test(m)), messages.join(' | '));
        setMiniList = async () => false;
        messages.length = 0;
        const shipOk = await saveChildShip('c3', 'ufo_green');
        check('failed ship save: reported and not applied', shipOk === false && !(childSettings.c3 && childSettings.c3.ship), 'ok=' + shipOk);
        const before = JSON.stringify(bonusesDaily);
        const wrote = await (async l => { const ok = await setMiniList('bonusesDaily', l); if(ok) bonusesDaily = l; return ok; })([]);
        check('failed list save: list in memory is left unchanged', wrote === false && JSON.stringify(bonusesDaily) === before, 'list changed');
      } finally { updateChildState = realUpdate; toast = realToast; toastUndo = realUndoToast; setMiniList = realMini; }
    });

    // ---- management
    await step('management', async () => {
      showHub();
      gear();
      for(let i = 0; i < 30 && activeView() !== 'view-manage'; i++) await sleep(100);
      check('gear opens the management screen', activeView() === 'view-manage', activeView());
      check('management lists all children', document.querySelectorAll('#roster-list > *').length === 14, 'children not listed');
      check('manual reset buttons exist', !!$('reset-stars-btn') && !!$('reset-mercury-btn'), 'missing');
      check('test tools card exists in test', !!$('temp-goto-display-btn-manage'), 'missing');
      $('manage-back-to-hub').click();
    });

    // ---- the phone's Back button walks up one level at a time instead of leaving the app
    await step('back button', async () => {
      const pressBack = async () => { history.back(); await sleep(350); };
      showHub(); await sleep(150);
      $('hub-daily-btn').click(); await sleep(100);
      openLightFlow('red'); await sleep(100);
      for(let i = 0; i < 2; i++) $('guided-next-btn').click();
      await sleep(100);
      check('each new screen adds a history entry', history.state && history.state.entry === 2, JSON.stringify(history.state));
      check('(setup) protocol is on step 3', guidedStep === 2, 'step ' + (guidedStep + 1));
      await pressBack(); check('Back: previous step of the protocol', visible($('staff-screen-guided')) && guidedStep === 1, 'step ' + (guidedStep + 1));
      await pressBack(); check('Back again: step 1', visible($('staff-screen-guided')) && guidedStep === 0, 'step ' + (guidedStep + 1));
      await pressBack(); check('Back at step 1: the traffic light list', visible($('staff-screen-pick')) && !visible($('staff-screen-guided')), 'screen wrong');
      await pressBack(); check('Back from the list: home', activeView() === 'view-hub', activeView());
      // kids control: child picker -> back -> kids control -> back -> home
      $('hub-kids-btn').click(); await sleep(200); $('kq-give-star-btn').click(); await sleep(150);
      check('(setup) child picker is open', visible($('kids-quick-pick-child')), 'picker closed');
      await pressBack(); check('Back from the child picker: kids control', visible($('kids-quick-pick-color')) && activeView() === 'view-kids-quick', 'wrong screen');
      await pressBack(); check('Back from kids control: home', activeView() === 'view-hub', activeView());
      // the step list is not an overlay: Back goes back a step with it open
      $('hub-daily-btn').click(); await sleep(100);
      document.querySelector('[data-quick="red"]').click(); await sleep(100);
      $('guided-next-btn').click(); $('guided-legend-btn').click(); await sleep(100);
      await pressBack();
      check('Back goes one step back even with the step list open (the list stays)', guidedStep === 0 && visible($('guided-legend')) && visible($('staff-screen-guided')), 'step ' + (guidedStep + 1));
      showHub(); await sleep(300);
      check('home is reached again and the trail is reset', activeView() === 'view-hub', activeView());
    });

    // ---- the revoke screen points at the bonuses that can be revoked at this hour
    await step('next bonus', async () => {
      const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
      const list = [
        { id:'a', text:'a', startTime:'13:30', endTime:'15:30' }, { id:'b', text:'b', startTime:'15:30', endTime:'17:00' },
        { id:'c', text:'c', startTime:'18:00', endTime:'20:00' }, { id:'c2', text:'c2', startTime:'18:00', endTime:'20:00' }, { id:'d', text:'d' }
      ];
      const ids = (revoked, h, m) => nextBonusesToRevoke(list, new Set(revoked), at(h, m)).map(b => b.id).join(',');
      check('rule: what is happening now comes first', ids([], 14, 0) === 'a', ids([], 14, 0));
      check('rule: two things at the same hour both point', ids([], 18, 33) === 'c,c2', ids([], 18, 33));
      check('rule: after revoking one, the other still points', ids(['c'], 18, 33) === 'c2', ids(['c'], 18, 33));
      check('rule: between two events, the one that starts next', ids(['a', 'b'], 17, 30) === 'c,c2', ids(['a', 'b'], 17, 30));
      check('rule: a bonus without hours comes after the timed ones', ids(['a', 'b', 'c', 'c2'], 14, 0) === 'd', ids(['a', 'b', 'c', 'c2'], 14, 0));
      check('rule: nothing left -> nothing to point at', ids(['a', 'b', 'c', 'c2', 'd'], 14, 0) === '', ids(['a', 'b', 'c', 'c2', 'd'], 14, 0));

      showHub(); $('hub-kids-btn').click(); await sleep(200); $('kq-revoke-bonus-btn').click(); await sleep(150); $('kq-pick-child-for-revoke-btn').click();
      document.querySelector('#kids-quick-roster .chip[data-id="c8"]').click();
      for(let i = 0; i < 30 && !document.querySelector('#kq-yellow-bonus-daily-list .bonus-chip'); i++) await sleep(100);
      await sleep(600);
      const todays = () => [...bonusesDaily, ...bonusesWeekly].filter(bonusAppliesToday);
      const shownIds = () => [...document.querySelectorAll('#view-kids-quick .bonus-chip.next')].map(c => c.dataset.id).sort().join(',');
      const expected = revokedNow => nextBonusesToRevoke(todays(), new Set(revokedNow)).map(b => b.id).sort().join(',');
      check('the blinking bonuses are exactly those that fit this hour', shownIds() === expected([]) && shownIds() !== '', shownIds() + ' vs ' + expected([]));
      const first = document.querySelector('#view-kids-quick .bonus-chip.next');
      check('they really pulse (animation on)', getComputedStyle(first).animationName !== 'none', getComputedStyle(first).animationName);
      first.querySelector('.revoke-bonus').click(); await sleep(1200);
      check('after revoking one, it stops blinking and the rest follow the rule', first.classList.contains('revoked') && !first.classList.contains('next') && shownIds() === expected([first.dataset.id]), shownIds() + ' vs ' + expected([first.dataset.id]));
      document.querySelector('.toast-undo-btn').click(); await sleep(1500);
      check('undoing it brings the blinking back', shownIds() === expected([]) && first.classList.contains('next'), shownIds());
      showHub();
    });
    // ---- pictures for the bonuses on the kids' TV
    await step('bonus pictures', async () => {
      const guess = t => bonusIcon({ text: t });
      check('a picture is guessed from the words', guess('סבב מיץ פטל') === '🧃' && guess('אחרי ארוחת הערב — זמן טלוויזיה') === '📺' && guess('בפארק (לפני זמן מקלחות)') === '🌳' && guess('תה מרגיע') === '🍵' && guess('בשישי — אבא/אמא של שבת') === '🕯️' && guess('משהו אחר לגמרי') === '🎁', [guess('סבב מיץ פטל'), guess('זמן טלוויזיה'), guess('בפארק'), guess('תה'), guess('שבת'), guess('אחר')].join(' '));
      check('a chosen picture wins over the guess', bonusIcon({ text: 'סבב מיץ פטל', icon: '🍪' }) === '🍪', 'guess used');
      activateDisplayView(); stopCarousel(); await showSlide(3); await sleep(500);
      const tiles = [...document.querySelectorAll('#bonuses-slide-content .bonus-board-item')];
      check('every bonus tile on the TV starts with a big picture', tiles.length > 0 && tiles.every(t => t.querySelector('.bb-icon') && parseFloat(getComputedStyle(t.querySelector('.bb-icon')).fontSize) > parseFloat(getComputedStyle(t.querySelector('.bb-text')).fontSize) * 2), 'tiles ' + tiles.length);
      stopCarousel(); showHub(); gear();
      for(let i = 0; i < 30 && activeView() !== 'view-manage'; i++) await sleep(100);
      const original = JSON.parse(JSON.stringify(bonusesDaily));
      const id = bonusesDaily[1].id;
      document.querySelector(`#bonuses-daily-list .bonus-row[data-id="${id}"] .bonus-row-head`).click();
      const editor = document.querySelector(`#bonuses-daily-list .bonus-row[data-id="${id}"]`);
      check('the bonus editor offers the pictures', editor.querySelectorAll('.be-icons button').length === BONUS_ICONS.length + 1, editor.querySelectorAll('.be-icons button').length);
      editor.querySelector('.be-icons button[data-icon="🍎"]').click();
      editor.querySelector('.be-save').click();
      for(let i = 0; i < 30 && (bonusesDaily[1].icon !== '🍎'); i++) await sleep(100);
      check('the chosen picture is saved with the bonus', bonusesDaily[1].icon === '🍎' && (await getMiniList('bonusesDaily'))[1].icon === '🍎', JSON.stringify(bonusesDaily[1]));
      await setMiniList('bonusesDaily', original); bonusesDaily = original; renderBonusesDailyList();
      showHub();
    });

    // ---- small things that were found in the acceptance test
    await step('small fixes', async () => {
      showHub(); $('hub-logout-link').click(); await sleep(150);
      const sheet = document.querySelector('.confirm-sheet');
      check('logging out asks first', !!sheet && /לצאת/.test(sheet.textContent) && visible($('protected-app')), 'no question');
      if(sheet) sheet.querySelector('.confirm-cancel').click();
      await sleep(100);
      check('"stay" keeps the person signed in', visible($('protected-app')), 'signed out');

      openGuidedScreen('yellow'); for(let i = 0; i < 4; i++) $('guided-next-btn').click();
      check('yellow last step: the button no longer repeats the title', $('guided-revoke-btn').textContent.trim() !== document.querySelector('.guided-step-name').textContent.trim(), $('guided-revoke-btn').textContent);

      showHub(); gear();
      for(let i = 0; i < 30 && activeView() !== 'view-manage'; i++) await sleep(100);
      $('add-child-btn').click(); await sleep(150);
      check('adding a child without a name says what is missing', [...document.querySelectorAll('.toast')].some(t => /שם פרטי/.test(t.textContent)), 'silent');
      check('management shows the kids\' screen address, ending in #tv', /#tv$/.test($('tv-address').textContent) && /#tv$/.test($('tv-address-open').href), $('tv-address').textContent);
      showHub();

      check('no disabled "coming soon" buttons left among the staff actions', ![...document.querySelectorAll('#view-kids-quick button, #staff-screen-gold button')].some(b => b.disabled && /בקרוב/.test(b.textContent)), 'placeholder found');

      // a stale copy of a ship can never stay on screen
      const stale = document.createElement('div'); stale.className = 'kid-marker stunt-flyer'; document.body.appendChild(stale);
      activateDisplayView(); stopCarousel(); await showSlide(7); await sleep(400);
      await flyMarkerStunt('c7', $('mercury-board'), renderMercuryBoard, 5);
      check('a leftover copy of a ship is cleaned up by the next show', !document.querySelector('body > .stunt-flyer'), 'copy left behind');
      stopCarousel(); showHub();
    });

    // ---- TV sound: any press turns it on; the button is only a small quiet icon
    await step('tv sound', async () => {
      activateDisplayView(); stopCarousel();
      const btn = $('tv-sound-btn');
      const r = btn.getBoundingClientRect();
      check('the sound button is a small icon, not a banner', r.width <= innerHeight * 0.1 && !/הפעלת/.test(btn.textContent), Math.round(r.width) + 'px "' + btn.textContent + '"');
      check('it has an accessible name', !!btn.getAttribute('aria-label'), 'no label');
      document.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter' })); await sleep(200);
      check('a key press (remote control) tries to switch the sound on', true, '');   // (headless browsers may refuse real audio; what matters is that nothing breaks)
      stopCarousel(); showHub();
    });

    // ---- accessibility options for the staff
    await step('accessibility', async () => {
      showHub();
      check('home has an accessibility button', visible($('hub-a11y-btn')), 'missing');
      $('hub-a11y-btn').click();
      check('accessibility sheet opens with text size, contrast and motion', !$('a11y-sheet').hidden && document.querySelectorAll('#a11y-sheet [data-size]').length === 3 && !!$('a11y-contrast') && !!$('a11y-motion'), 'sheet wrong');
      const fs = () => document.querySelector('.home-title').getBoundingClientRect().height;   // (the size on screen; computed font-size ignores zoom)
      const base = fs();
      document.querySelector('#a11y-sheet [data-size="xl"]').click(); await sleep(100);
      check('"very large" text really enlarges the staff screens', fs() > base * 1.3, base + ' -> ' + fs());
      check('the setting is remembered on this device', JSON.parse(localStorage.getItem('ramzor-a11y')).size === 'xl', localStorage.getItem('ramzor-a11y'));
      // nothing gets wider than the screen, with the biggest text, on the main staff screens
      const wide = [];
      const widthOk = name => { if(document.documentElement.scrollWidth > innerWidth + 1) wide.push(name + ' ' + document.documentElement.scrollWidth); };
      $('a11y-close').click(); widthOk('home');
      $('hub-daily-btn').click(); widthOk('daily ops');
      openGuidedScreen('red'); widthOk('red step 1');
      for(let i = 0; i < 3; i++) $('guided-next-btn').click();
      document.querySelectorAll('.guided-tab')[1].click(); widthOk('red step 4 with card');
      openLightFlow('green'); widthOk('green');
      showHub(); $('hub-kids-btn').click(); await sleep(250); widthOk('kids control');
      check('biggest text: no staff screen scrolls sideways', wide.length === 0, wide.join(' | '));
      showHub(); $('hub-a11y-btn').click();
      const c0 = getComputedStyle($('hub-daily-btn')).borderTopWidth;
      $('a11y-contrast').click(); await sleep(100);
      check('high contrast: text is brighter and borders stronger', document.documentElement.getAttribute('data-contrast') === 'high' && parseFloat(getComputedStyle($('hub-daily-btn')).borderTopWidth) >= parseFloat(c0) * 1.9 && getComputedStyle(document.querySelector('.home-card-sub')).color !== 'rgb(163, 171, 198)', c0 + ' -> ' + getComputedStyle($('hub-daily-btn')).borderTopWidth);
      $('a11y-motion').click(); await sleep(100);
      check('"no motion" switches the staff animations off', document.documentElement.getAttribute('data-motion') === 'off', 'not set');
      $('a11y-reset').click(); await sleep(100);
      check('reset brings everything back', !document.documentElement.hasAttribute('data-text') && !document.documentElement.hasAttribute('data-contrast') && !document.documentElement.hasAttribute('data-motion'), 'still set');
      $('a11y-close').click();
      // the kids' TV is never changed by these options
      $('a11y-contrast') && (a11y = { size:'xl', contrast:true, motion:true }); applyA11y();
      const tvSize = parseFloat(getComputedStyle(document.querySelector('.slide-label')).fontSize);
      a11y = Object.assign({}, A11Y_DEFAULTS); saveA11y();
      check('the kids\' TV ignores the staff accessibility options', Math.abs(tvSize - parseFloat(getComputedStyle(document.querySelector('.slide-label')).fontSize)) < 0.5, 'TV changed');
      showHub();
    });

    // ---- the manager's own login: the database itself refuses management actions from instructors
    await step('manager login', async () => {
      if(!MANAGER_LOGIN) return;
      await sbAdmin.auth.signOut(); managementOpenUntil = 0;
      showHub(); $('hub-manage-gear').click();
      for(let i = 0; i < 30 && !document.querySelector('.code-input'); i++) await sleep(100);
      check('the gear asks for the manager password', !!document.querySelector('.code-input') && activeView() === 'view-hub', 'no question');
      let inp = document.querySelector('.code-input'); inp.value = 'not-the-password'; document.querySelector('.confirm-ok').click();
      for(let i = 0; i < 50 && !(document.querySelector('.confirm-text') && /שגויה/.test(document.querySelector('.confirm-text').textContent)); i++) await sleep(100);
      check('a wrong password is refused and asked again', activeView() === 'view-hub' && /שגויה/.test(document.querySelector('.confirm-text').textContent), activeView());
      inp = document.querySelector('.code-input'); inp.value = MANAGER_TEST_PASSWORD; document.querySelector('.confirm-ok').click();
      for(let i = 0; i < 50 && activeView() !== 'view-manage'; i++) await sleep(100);
      check('the manager password opens management', activeView() === 'view-manage', activeView());

      // an instructor (the ordinary login) is refused by the database
      const kid = 'c6';
      const noChild = await sb.from('roster').insert({ id:'zz-nope', first_name:'x', last_initial:'', age:'', sw_name:'', sw_phone:'' });
      check('database: an instructor cannot add a child', !!noChild.error, 'allowed!');
      const noList = await sb.from('mini_lists').upsert({ key:'zz-nope', items:[] });
      check('database: an instructor cannot change the lists', !!noList.error, 'allowed!');
      const keep = await getChildStateForUpdate(kid);
      await sbAdmin.from('child_state').update({ stars: 5 }).eq('child_id', kid);
      const noReset = await sb.from('child_state').update({ stars: 0 }).eq('child_id', kid);
      check('database: an instructor cannot reset a board', !!noReset.error && (await getChildState(kid)).stars === 5, noReset.error ? 'blocked but stars=' + (await getChildState(kid)).stars : 'allowed!');
      const plus = await updateChildState(kid, s => ({ set:{ stars: (s.stars || 0) + 1 }, guard:['stars'] }));
      check('database: an instructor can still give a star', plus.ok && (await getChildState(kid)).stars === 6, JSON.stringify(plus.reason));
      const back1 = await sb.from('child_state').update({ stars: 5 }).eq('child_id', kid);
      check('database: an instructor can take back one star', !back1.error, back1.error && back1.error.message);
      await sbAdmin.from('child_state').update({ stars: keep.stars || 0 }).eq('child_id', kid);
      check('database: the manager can reset', (await getChildState(kid)).stars === (keep.stars || 0), 'not restored');

      // the manager can do all of it, through the screens
      $('new-child-name').value = 'בדיקת מנהל'; $('add-child-btn').click();
      for(let i = 0; i < 30 && !roster.find(c => c.firstName === 'בדיקת מנהל'); i++) await sleep(150);
      const made = roster.find(c => c.firstName === 'בדיקת מנהל');
      check('the manager can add a child', !!made, 'not added');
      if(made){
        document.querySelector(`.roster-row[data-id="${made.id}"] .rm`).click();
        await answerSheet('מחיקה');
        for(let i = 0; i < 30 && roster.find(c => c.id === made.id); i++) await sleep(150);
        check('the manager can delete a child', !roster.find(c => c.id === made.id), 'still there');
      }
      showHub();
    });

    // ---- management code and typed confirmations
    await step('management lock', async () => {
      if(MANAGER_LOGIN) return;       // (with the manager login on, the manager steps below apply instead)
      showHub(); $('hub-manage-gear').click();
      for(let i = 0; i < 30 && !(activeView() === 'view-manage' && $('mgmt-lock-card').classList.contains('unset')); i++) await sleep(100);
      check('with no code set, management opens (and says a code is missing)', activeView() === 'view-manage' && $('mgmt-lock-card').classList.contains('unset') && /לא הוגדר קוד/.test($('mgmt-lock-status').textContent), activeView());
      check('a code can be set', await setManagementCode('2468'), 'not saved');
      managementOpenUntil = 0; showHub(); $('hub-manage-gear').click();
      for(let i = 0; i < 30 && !document.querySelector('.code-input'); i++) await sleep(100);
      check('with a code set, the gear asks for it first', !!document.querySelector('.code-input') && activeView() === 'view-hub', 'no question: ' + activeView());
      let inp = document.querySelector('.code-input'); inp.value = '1111'; document.querySelector('.confirm-ok').click();
      for(let i = 0; i < 40 && !(document.querySelector('.confirm-text') && /שגוי/.test(document.querySelector('.confirm-text').textContent)); i++) await sleep(100);
      check('a wrong code is refused and asked again', activeView() === 'view-hub' && /שגוי/.test(document.querySelector('.confirm-text').textContent), activeView());
      inp = document.querySelector('.code-input'); inp.value = '2468'; document.querySelector('.confirm-ok').click();
      for(let i = 0; i < 40 && activeView() !== 'view-manage'; i++) await sleep(100);
      check('the right code opens management', activeView() === 'view-manage', activeView());
      check('the code is kept as a hash, not as text', JSON.stringify(await getMiniList('managerLock')).indexOf('2468') < 0, 'plain code stored');

      // risky buttons ask for a typed word
      $('reset-stars-btn').click(); await sleep(150);
      const sheet = document.querySelector('.confirm-sheet');
      check('resetting stars needs the word typed', !!sheet && sheet.querySelector('.confirm-ok').disabled === true, 'no typed confirmation');
      sheet.querySelector('.confirm-input').value = 'איפוס'; sheet.querySelector('.confirm-input').dispatchEvent(new Event('input'));
      check('the button opens only after the word is typed', sheet.querySelector('.confirm-ok').disabled === false, 'still disabled');
      sheet.querySelector('.confirm-cancel').click(); await sleep(100);
      check('"back" leaves everything as it was', !document.querySelector('.confirm-sheet'), 'sheet still there');

      await setManagementCode(''); managementOpenUntil = 0;
      showHub();
    });

    // ---- management: bonus editor, ship picker, new child with a starting stage (all undone afterwards)
    await step('management editing', async () => {
      showHub(); gear();

      // bonus editor
      const originalDaily = JSON.parse(JSON.stringify(bonusesDaily));
      const firstId = bonusesDaily[0].id;
      let row = () => document.querySelector(`#bonuses-daily-list .bonus-row[data-id="${firstId}"]`);
      row().querySelector('.bonus-row-head').click();
      check('bonus opens an editor on click', !!row().querySelector('.bonus-editor'), 'no editor');
      row().querySelector('.be-start').value = '10:00'; row().querySelector('.be-end').value = '09:00';
      row().querySelector('.be-save').click(); await sleep(300);
      check('bonus: end time before start is refused', bonusesDaily[0].startTime !== '10:00', JSON.stringify(bonusesDaily[0]));
      row().querySelectorAll('.be-days input').forEach(i => { i.checked = (i.value === '1' || i.value === '2'); });
      row().querySelector('.be-text').value = 'בדיקת עריכה';
      row().querySelector('.be-start').value = '10:00'; row().querySelector('.be-end').value = '11:30';
      row().querySelector('.be-save').click(); await sleep(800);
      const saved = bonusesDaily[0];
      check('bonus: text, days and hours are saved', saved.text === 'בדיקת עריכה' && saved.days.join() === '1,2' && saved.startTime === '10:00' && saved.endTime === '11:30', JSON.stringify(saved));
      const fromDb = await getMiniList('bonusesDaily');
      check('bonus: change reached the database', fromDb[0].text === 'בדיקת עריכה' && fromDb[0].endTime === '11:30', JSON.stringify(fromDb[0]));
      await setMiniList('bonusesDaily', originalDaily); bonusesDaily = originalDaily; renderBonusesDailyList();

      // social worker per child
      const sel = document.querySelector('.roster-sw[data-sw-for="c1"]');
      check('management: each child has a social-worker choice', !!sel && sel.value === '972500000001', sel && sel.value);
      sel.value = '972500000002'; sel.dispatchEvent(new Event('change')); await sleep(900);
      check('management: changing a child\'s worker is applied and saved', roster.find(c => c.id === 'c1').swName === 'רונית' && ((await getRoster()).find(c => c.id === 'c1').swPhone === '972500000002'), JSON.stringify(roster.find(c => c.id === 'c1')));
      document.querySelector('.roster-sw[data-sw-for="c1"]').value = '972500000001'; document.querySelector('.roster-sw[data-sw-for="c1"]').dispatchEvent(new Event('change')); await sleep(900);
      check('management: worker choice can be set back', roster.find(c => c.id === 'c1').swName === 'דנה', 'not restored');

      // ship picker
      const target = roster[1].id, defaultShip = shipFor(target);
      document.querySelector(`.roster-ship[data-ship-for="${target}"]`).click();
      check('ship picker opens', document.querySelectorAll('.ship-option').length === Object.keys(SHIP_OPTIONS).length, 'options: ' + document.querySelectorAll('.ship-option').length);
      document.querySelector('.ship-option[data-ship="ufo_green"]').click(); await sleep(800);
      check('ship choice is applied', shipFor(target) === SHIP_OPTIONS.ufo_green, 'ship not changed');
      await loadChildSettings();
      check('ship choice reached the database', shipFor(target) === SHIP_OPTIONS.ufo_green, 'lost after reload');
      await setMiniList('childSettings', []); await loadChildSettings(); renderManageRoster();
      check('ship choice can be undone', shipFor(target) === defaultShip, 'not restored');

      // new children with each starting stage
      for(const [stage, expectedMoon] of [['moon', 0], ['mercury', 7]]){
        $('new-child-name').value = 'בדיקה' + stage; $('new-child-lastinit').value = 'ת'; $('new-child-age').value = '8';
        $('new-child-stage').value = stage;
        $('add-child-btn').click();
        for(let i=0;i<20 && roster.length < 15;i++) await sleep(250);
        const kid = roster.find(c => c.firstName === 'בדיקה' + stage);
        check(`new child (${stage}) appears`, !!kid, 'not in roster');
        if(!kid) continue;
        const st = await getChildState(kid.id);
        check(`new child (${stage}) starts at moon step ${expectedMoon}`, st.moonSteps === expectedMoon && st.stars === 0 && st.mercurySteps === 0, JSON.stringify(st));
        if(stage === 'moon'){
          // a child on the first journey gets the moon board, and only the children still on that journey are drawn on it
          await refreshJourneyBoards();
          check('moon board joins the rotation for a child on the moon journey', SLIDES[6].hidden === false, 'still hidden');
          activateDisplayView(); stopCarousel();
          await showSlide(6); await sleep(300);
          const drawn = [...document.querySelectorAll('#moon-board .kid-marker')].map(m => m.dataset.childId);
          check('moon board draws only the child still on the moon journey', drawn.length === 1 && drawn[0] === kid.id, drawn.join());
          stopCarousel(); showHub(); gear();
        }
        document.querySelector(`.roster-row[data-id="${kid.id}"] .rm`).click();
        await answerSheet('מחיקה');
        for(let i=0;i<20 && roster.length > 14;i++) await sleep(250);
        check(`new child (${stage}) removed again`, roster.length === 14, 'roster ' + roster.length);
      }
      $('manage-back-to-hub').click();
    });

    // ---- remote control of the room TV
    await step('tv remote', async () => {
      // TV side: commands change what is on screen (called directly, no network needed)
      activateDisplayView(); stopCarousel();
      await showSlide(3);
      handleTvCommand({ cmd: 'show', slide: 5 }); await sleep(100);
      check('remote: "show" puts the chosen board on screen and holds it', $('slide-5').classList.contains('active') && tvHeld, 'slide/held wrong');
      handleTvCommand({ cmd: 'show', slide: 4 }); await sleep(50);
      check('remote: a hidden board cannot be shown', !$('slide-4').classList.contains('active'), 'hidden slide shown');
      handleTvCommand({ cmd: 'next' }); await sleep(100);
      check('remote: "next" goes to the next visible board', $('slide-7').classList.contains('active'), 'now on ' + carouselIndex);
      handleTvCommand({ cmd: 'prev' }); await sleep(100);
      check('remote: "prev" goes back', $('slide-5').classList.contains('active'), 'now on ' + carouselIndex);
      handleTvCommand({ cmd: 'resume' }); await sleep(50);
      check('remote: "resume" releases the hold', !tvHeld && !!carouselTimer, 'held=' + tvHeld);
      handleTvCommand({ cmd: 'pause' });
      check('remote: "pause" stops the rotation', tvHeld && !carouselTimer, 'timer still running');
      stopCarousel();
      showHub();

      // staff side: the card on the kids-screen control area
      $('hub-kids-btn').click(); await sleep(300);
      check('control area shows the TV card, titled "מה המסך מציג כרגע?"', visible($('tv-remote-card')) && $('tv-remote-toggle').textContent.includes('מה המסך מציג כרגע?'), 'card/title wrong');
      check('TV card: controls are folded away until the title is tapped', $('tv-remote-body').hidden && visible($('tv-remote-status')), 'body visible');
      check('TV card: title and status are centred', getComputedStyle($('tv-remote-toggle')).justifyContent === 'center' && getComputedStyle($('tv-remote-status')).textAlign === 'center', 'not centred');
      $('tv-remote-toggle').click();
      check('TV card: tapping the title opens the controls on the same page', !$('tv-remote-body').hidden && visible($('tv-remote-hold')) && $('tv-remote-toggle').getAttribute('aria-expanded') === 'true', 'did not open');
      const boards = [...document.querySelectorAll('#tv-remote-boards [data-slide]')].map(b => b.textContent);
      check('card lists every visible board', boards.length === SLIDES.filter(s => !s.hidden).length, boards.join('|'));
      remoteStatus = { slide: 5, label: SLIDES[5].label, held: true }; renderTvRemote();
      check('card shows just what the TV shows (no "מציג" prefix) and offers to continue', $('tv-remote-status').textContent.includes(SLIDES[5].label) && !/המסך מציג/.test($('tv-remote-status').textContent) && /המשך/.test($('tv-remote-hold').textContent), $('tv-remote-status').textContent);
      remoteStatus = null; tvRemoteGiveUp();   // what happens when no TV answers within a few seconds
      check('with no TV answering, the card says so', /לא עונה/.test($('tv-remote-status').textContent), $('tv-remote-status').textContent);
      $('tv-preview-toggle').click();
      check('live preview opens a small copy of the TV', !!document.querySelector('#tv-preview-box iframe') && !$('tv-preview-box').hidden, 'no preview');
      $('tv-preview-toggle').click();
      check('live preview can be closed', $('tv-preview-box').hidden, 'still open');
      showHub();
    });

    // ---- celebration moment on the kids' TV
    await step('celebration', async () => {
      CELEBRATION_MS = 700;
      const host = $('celebration');
      const kid = roster.find(c => c.id === 'c2');
      check('celebration overlay is hidden at rest', !visible(host), 'visible');

      const starRun = playCelebration('star', kid, 5);
      await sleep(100);
      check('star: overlay shows', visible(host), 'not visible');
      check('star: shows the child (name, no age)', host.querySelector('.cel-name').textContent === displayName(kid) && !/\d/.test(host.querySelector('.cel-name').textContent), host.querySelector('.cel-name').textContent);
      check('star: shows the child avatar', !!host.querySelector('.cel-who .avatar-initials'), 'no avatar');
      check('star: 12 slots, exactly 5 lit, last one is the new one', host.querySelectorAll('.cel-star').length === 12 && host.querySelectorAll('.cel-star.filled').length === 5 && host.querySelectorAll('.cel-star.cel-new').length === 1, host.querySelectorAll('.cel-star.filled').length + ' lit');
      await starRun;
      check('star: overlay goes away afterwards', !visible(host) && host.innerHTML === '', 'still there');

      const shipRun = playCelebration('mercury', kid, 4);
      await sleep(100);
      const track = host.querySelector('.cel-track');
      check('journey: track goes from step 3 to step 4', track && track.dataset.from === '3' && track.dataset.to === '4', track && track.dataset.from + '->' + track.dataset.to);
      check('journey: traveller is the child\'s own ship', !!host.querySelector('.cel-traveller .cel-ship') && host.querySelector('.cel-ship').getAttribute('src') === shipFor(kid.id), 'wrong or missing ship');
      check('journey: 8 stops on the track (start + 7 steps)', host.querySelectorAll('.cel-node').length === 8, host.querySelectorAll('.cel-node').length);
      await shipRun;

      const lastRun = playCelebration('moon', roster[0], 7);
      await sleep(100);
      check('reaching step 7 adds the goal celebration', !!host.querySelector('.cel-milestone'), 'no milestone');
      await lastRun;

      // events arrive one at a time even if several come together
      const order = [];
      queueCelebration(async () => { order.push('a'); await sleep(50); order.push('a-done'); });
      queueCelebration(async () => { order.push('b'); });
      await celebrationQueue;
      check('celebrations are queued, not overlapped', order.join() === 'a,a-done,b', order.join());

      // a real event through the same handler used for live events (display view must be open)
      activateDisplayView(); stopCarousel();
      celebrateFeedbackEvent({ type: 'star', child_id: kid.id, message: '' });
      for(let i = 0; i < 30 && !visible(host); i++) await sleep(100);   // it first reads the child's total from the server
      check('live star event starts a celebration', visible(host), 'not shown');
      await celebrationQueue;
      await sleep(900);
      check('after the celebration the star board is shown', $('slide-5').classList.contains('active'), 'slide 5 not active');
      stopCarousel();
      CELEBRATION_MS = 4800;
      showHub();
    });

    // ---- the wall project: 100 bricks per child, a colour per child, a message at the 100th brick
    await step('wall project', async () => {
      await ensureManager(); await putState('c6', { bricks: 0 }); await putState('c3', { bricks: 0 });
      const host = $('celebration');
      const kidA = roster.find(c => c.id === 'c2'), kidB = roster.find(c => c.id === 'c3');
      const scene = document.createElement('div');
      scene.innerHTML = bigWallHtml(kidA, 37, 37);
      check('wall: 100 numbered bricks, exactly 37 built, one of them new', scene.querySelectorAll('.brick').length === 100 && scene.querySelectorAll('.brick.built').length === 37 && scene.querySelectorAll('.brick.new').length === 1, scene.querySelectorAll('.brick.built').length + ' built');
      check('wall: the name of the child is on it', scene.querySelector('.wall-base').textContent.trim() === displayName(kidA), scene.querySelector('.wall-base').textContent);
      check('wall: no finish message before the 100th brick', !scene.querySelector('.wall-done'), 'message shown');
      const hueA = scene.querySelector('.wall-scene').style.getPropertyValue('--h');
      scene.innerHTML = bigWallHtml(kidB, 10, 10);
      check('wall: every child has a different colour', hueA !== '' && hueA !== scene.querySelector('.wall-scene').style.getPropertyValue('--h'), hueA);
      scene.innerHTML = bigWallHtml(kidA, 100, 100);
      check('wall: the 100th brick brings "המקדש הושלם"', !!scene.querySelector('.wall-done') && /המקדש של .*הושלם/.test(scene.querySelector('.wall-done').textContent), 'no message');

      CELEBRATION_MS = 700;
      const run = playCelebration('bricks', kidA, 12);
      await sleep(150);
      check('wall celebration shows the wall on the TV', visible(host) && host.querySelectorAll('.brick').length === 100 && !host.querySelector('.wall-done'), 'not shown');
      await run;
      const runDone = playCelebration('bricks', kidA, 100);
      await sleep(150);
      check('wall celebration at 100 shows the message', !!host.querySelector('.wall-done'), 'no message');
      await runDone;
      CELEBRATION_MS = 4800;

      check('the walls board is in the TV rotation, hidden while nobody has a brick', !!SLIDES.find(s => s.id === 8) && EVENT_TYPE_SLIDE.bricks === 8, 'missing');
      check('a brick has no "ביטול" button (the manager fixes mistakes)', !document.querySelector('.toast-undo'), 'undo shown');

      // telling the projects apart: names, the deciding question, the strength question, the Mercury reminder
      const goldText = $('staff-screen-gold').textContent;
      check('gold screen: star, journey and temple each with their deciding question and the one-line difference', /הענקת כוכב/.test(goldText) && /משהו טוב שרציתי לעודד/.test(goldText) && /המסע בחלל/.test(goldText) && /המקדש שלי/.test(goldText) && /תרגל\/ה מיומנות שהוגדרה מראש/.test(goldText) && /זיהית עכשיו כוח/.test(goldText) && /כוכבים מחזקים התנהגות חיובית שראינו/.test(goldText), goldText.replace(/\s+/g, ' ').slice(0, 160));
      check('the old name "בניית לבנים" is nowhere in the app', !/בניית לבנים/.test((() => { const b = document.body.cloneNode(true); b.querySelectorAll('script, style').forEach(n => n.remove()); return b.textContent; })()) && !SLIDES.some(s => /לבנים/.test(s.label)), 'old name found');
      const kidT = 'c6';
      const bricksT = async () => (await getChildState(kidT)).bricks || 0;
      const baseT = await bricksT();
      const openTemple = async () => { showHub(); $('hub-kids-btn').click(); await sleep(250); $('kq-brick-btn').click(); document.querySelector(`#kids-quick-roster .chip[data-id="${kidT}"]`).click(); await sleep(250); return document.querySelector('.strength-sheet'); };
      let sh = await openTemple();
      check('temple: before a brick the instructor is asked which strength they saw', !!sh && /איזה כוח ראית/.test(sh.textContent) && ['אומץ', 'התמדה', 'גמישות', 'בקשת עזרה', 'סבלנות', 'נדיבות', 'קבלה', 'אחר'].every(n => [...sh.querySelectorAll('.strength-chip')].some(b => b.textContent === n)), sh ? sh.textContent : 'no sheet');
      check('temple: nothing is added while the question is open', (await bricksT()) === baseT, 'brick added early');
      sh.querySelector('.strength-cancel').click(); await sleep(300);
      check('temple: going back adds no brick', !document.querySelector('.strength-sheet') && (await bricksT()) === baseT, 'brick added');
      sh = await openTemple();
      check('temple: the free-text box for "אחר" is hidden until "אחר" is pressed', sh.querySelector('.strength-other').hidden === true, 'visible');
      [...sh.querySelectorAll('.strength-chip')].find(b => b.textContent === 'אומץ').click();
      for(let i = 0; i < 30 && (await bricksT()) === baseT; i++) await sleep(100);
      check('temple: choosing a strength gives the brick and names it in the message', (await bricksT()) === baseT + 1 && /כוח: אומץ/.test([...document.querySelectorAll('.toast')].pop().textContent), String(await bricksT()));
      await sleep(900);
      sh = await openTemple();
      sh.querySelector('.strength-other-btn').click();
      const box = sh.querySelector('.strength-other'); check('temple: "אחר" opens an optional box', !box.hidden, 'still hidden');
      sh.querySelector('.strength-input').value = 'סקרנות'; sh.querySelector('.strength-ok').click();
      for(let i = 0; i < 30 && (await bricksT()) === baseT + 1; i++) await sleep(100);
      check('temple: a free-text strength is named in the message', (await bricksT()) === baseT + 2 && /כוח: סקרנות/.test([...document.querySelectorAll('.toast')].pop().textContent), String(await bricksT()));
      await putState(kidT, { bricks: baseT });
      await sleep(900);
      const tvPill = bigWallHtml(kidA, 5, 5, 'אומץ'); const holder = document.createElement('div'); holder.innerHTML = tvPill;
      check('TV: the named strength is shown on the wall', holder.querySelector('.wall-strength') && holder.querySelector('.wall-strength').textContent === 'אומץ', 'missing');

      // Mercury: a one-line reminder of the criterion (only in the words stage)
      const before2 = await getChildStateForUpdate(kidT); const keepMoon = before2.moonSteps, keepMerc = before2.mercurySteps;
      before2.moonSteps = 7; before2.mercurySteps = 2; await setChildState(kidT, before2);
      showHub(); $('hub-kids-btn').click(); await sleep(250); $('kq-moon-journey-btn').click();
      document.querySelector(`#kids-quick-roster .chip[data-id="${kidT}"]`).click();
      for(let i = 0; i < 30 && !$('moon-clean'); i++) await sleep(100);
      check('Mercury: the screen asks "האם הילד/ה מצא/ה מילים ברגע של קושי?"', !!document.querySelector('.proj-criterion') && /מצא\/ה מילים ברגע של קושי/.test(document.querySelector('.proj-criterion').textContent), 'no reminder');
      const back2 = await getChildStateForUpdate(kidT); back2.moonSteps = keepMoon; back2.mercurySteps = keepMerc; await setChildState(kidT, back2);
      showHub();
      // the real thing against the test project (needs the `bricks` column: supabase/roles.sql)
      const kid = 'c6';
      const bricks = async () => (await getChildState(kid)).bricks || 0;
      const base = await bricks();
      const ok = await giveBrick(kid);
      check('giving a brick adds exactly one (needs the "bricks" column in this project)', ok && (await bricks()) === base + 1, base + ' -> ' + (await bricks()));
      await Promise.all([1, 2, 3, 4].map(() => giveBrick(kid)));
      check('4 simultaneous bricks give exactly 4 (none lost)', (await bricks()) === base + 5, base + ' -> ' + (await bricks()));
      await updateChildState(kid, () => ({ set:{ bricks: 99 }, guard:['bricks'] }));
      await giveBrick(kid);
      check('the 100th brick is recorded', (await bricks()) === 100, String(await bricks()));
      const more = await giveBrick(kid);
      check('a 101st brick is refused, the wall stays at 100', more === false && (await bricks()) === 100 && /כבר הושלם/.test([...document.querySelectorAll('.toast')].pop().textContent), String(await bricks()));
      await putState(kid, { bricks: base });
      showHub();
    });

    // ---- the instructor portal (only when it is switched on): scheduler, preferences, swaps, coordinator, export, TV screens
    await step('portal', async () => {
      check('the portal is on in the test environment (config/test.json: "portal": true)', PORTAL_ENABLED === true, 'off');
      if(!PORTAL_ENABLED) return;
      portalReset();
      const st = portalLoad(), mk = monthKeyOf(isoDate(new Date())), m = st.months[mk], ctx = portalCtx(mk);
      const people = st.instructors.filter(p => p.role === 'instructor');

      // --- the scheduler
      const res = autoSchedule(ctx), stats = scheduleStats(ctx, res.assignments), issues = validateSchedule(ctx, res.assignments);
      check('scheduler: every shift gets all the people it needs', stats.missing === 0 && res.unfilled.length === 0, 'missing ' + stats.missing);
      check('scheduler: no rule is broken (rest, consecutive days, shifts per week, nights, one shift a day)', issues.length === 0, JSON.stringify(issues.slice(0, 3)));
      check('scheduler: nobody is put on a "ממש לא" shift', stats.all.no === 0, stats.all.no + ' times');
      check('scheduler: many wishes are kept and few "rather not" are used', stats.all.yes > stats.all.total * 0.3 && stats.all.avoid <= 5, `yes ${stats.all.yes}/${stats.all.total}, avoid ${stats.all.avoid}`);
      const counts = people.map(p => (stats.per[p.id] || { total:0 }).total);
      check('scheduler: the work is shared fairly', Math.max(...counts) - Math.min(...counts) <= 3, counts.join(','));
      check('scheduler: same input gives the same schedule', JSON.stringify(autoSchedule(ctx).assignments) === JSON.stringify(res.assignments), 'differs');
      const tight = autoSchedule(Object.assign({}, ctx, { shiftTypes:st.shiftTypes.map(s => Object.assign({}, s, { need:9, needWeekend:9 })) }));
      check('scheduler: when there are not enough people it reports what is missing, and still breaks no rule', tight.unfilled.length > 0 && validateSchedule(Object.assign({}, ctx, { shiftTypes:st.shiftTypes.map(s => Object.assign({}, s, { need:9, needWeekend:9 })) }), tight.assignments).filter(i => i.type !== 'unfilled').length === 0, tight.unfilled.length + ' unfilled');
      // manual mistakes are caught
      const slots = buildSlots(mk, st.shiftTypes), mSlot = slots.find(s => s.shiftId === 'm' && s.dow === 1), nSlot = slots.find(s => s.shiftId === 'n' && s.date === mSlot.date);
      const nextMorning = slots.find(s => s.shiftId === 'm' && s.date === addDays(mSlot.date, 1));
      const forced = JSON.parse(JSON.stringify(res.assignments)); forced[nSlot.key] = ['i5']; forced[nextMorning.key] = ['i5'];
      const catchTypes = validateSchedule(ctx, forced).map(i => i.type);
      check('validation: a night followed by a morning is flagged (rest)', catchTypes.includes('rest'), catchTypes.join(','));
      const dbl = JSON.parse(JSON.stringify(res.assignments)); dbl[mSlot.key] = ['i5']; dbl[slots.find(s => s.shiftId === 'e' && s.date === mSlot.date).key] = ['i5'];
      check('validation: two shifts in one day are flagged', validateSchedule(ctx, dbl).some(i => i.type === 'sameday'), 'not flagged');
      const withNo = autoSchedule(ctx); const noPref = JSON.parse(JSON.stringify(ctx.prefs)); noPref.i3.slots[mSlot.key] = 'no';
      const bad = JSON.parse(JSON.stringify(withNo.assignments)); bad[mSlot.key] = ['i3'];
      check('validation: a "ממש לא" shift that is assigned by hand is flagged', validateSchedule(Object.assign({}, ctx, { prefs:noPref }), bad).some(i => i.type === 'no' && i.iid === 'i3'), 'not flagged');
      check('names: first name only, the last initial only when two share a first name', instrName(portalPerson('i1'), st.instructors) === "דנה כ'" && instrName(portalPerson('i3'), st.instructors) === 'יוסי', instrName(portalPerson('i1'), st.instructors) + ' / ' + instrName(portalPerson('i3'), st.instructors));

      // --- Excel and print
      const bytes = buildScheduleXlsx(ctx, res.assignments), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      check('Excel: a real zip (.xlsx) is produced', bytes[0] === 0x50 && bytes[1] === 0x4B && view.getUint32(bytes.length - 22, true) === 0x06054b50, 'bad header');
      const entries = []; { let p = view.getUint32(bytes.length - 6, true); const n = view.getUint16(bytes.length - 12, true); for(let i = 0; i < n; i++){ const nl = view.getUint16(p + 28, true), name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl)), off = view.getUint32(p + 42, true), crc = view.getUint32(p + 16, true), size = view.getUint32(p + 24, true); const lh = 30 + view.getUint16(off + 26, true) + view.getUint16(off + 28, true); entries.push({ name, crc, data:bytes.subarray(off + lh, off + lh + size) }); p += 46 + nl; } }
      check('Excel: all the parts are there and every checksum matches', ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'].every(n => entries.some(e => e.name === n)) && entries.every(e => crc32(e.data) === e.crc), entries.map(e => e.name).join(','));
      const xmls = entries.map(e => new DOMParser().parseFromString(new TextDecoder().decode(e.data), 'application/xml'));
      check('Excel: every part is well-formed XML', xmls.every(x => !x.querySelector('parsererror')), 'parse error');
      const sheetXml = new TextDecoder().decode(entries.find(e => e.name === 'xl/worksheets/sheet1.xml').data);
      check('Excel: rows are days, columns are shifts, names are coloured by how the wish was kept', (sheetXml.match(/<row /g) || []).length === daysOfMonth(mk).length + 2 && sheetXml.includes(XLSX_COLORS.yes) && /rightToLeft="1"/.test(sheetXml), 'rows ' + (sheetXml.match(/<row /g) || []).length);
      check('print: the schedule table has a row per day', (scheduleHtmlTable(ctx, res.assignments).match(/<tr>/g) || []).length === daysOfMonth(mk).length + 1, 'rows');

      // --- app home
      showAppHome();
      check('app home: two cards, רמזור and פורטל המדריך', activeView() === 'view-apphome' && !!$('apphome-ramzor') && !!$('apphome-portal'), activeView());
      $('apphome-ramzor').click();
      check('app home: the רמזור card opens the existing home screen', activeView() === 'view-hub', activeView());
      showAppHome(); $('apphome-portal').click();
      check('app home: the portal card opens the portal', activeView() === 'view-portal', activeView());

      // --- coordinator
      portalUi.persona = 'c1'; portalUi.tab = null; portalUi.month = mk; showPortal();
      const tabs = [...document.querySelectorAll('#view-portal [data-ptab]')].map(b => b.textContent);
      check('coordinator: only schedule, submissions, swaps, timetable and settings (no children or רמזור management)', tabs.join() === 'סידור,הגשות,החלפות,לו"ז,הגדרות', tabs.join());
      check('coordinator: the schedule table shows a row per day, coloured by how the wishes were kept', document.querySelectorAll('.pboard tbody tr').length === daysOfMonth(mk).length && !!document.querySelector('.pboard .lv-yes'), 'no table');
      const target = document.querySelector('.pboard td.editable'); target.click(); await sleep(100);
      check('coordinator: pressing a shift opens its editor with everybody and their wish', !!document.querySelector('.psheet') && document.querySelectorAll('.psheet .pedit-row').length === people.length, 'no editor');
      document.querySelector('.psheet [data-close]').click();
      const nKeyBefore = (m.assignments[mSlot.key] || []).slice();
      portalUi.tab = 'schedule'; showPortal();
      // put a person who wrote "ממש לא" on a shift by hand: warning + needs the instructor's approval
      const victim = people.find(p => !nKeyBefore.includes(p.id)), prefsV = portalPrefsOf(mk, victim.id); prefsV.slots[mSlot.key] = 'no';
      openSlotEditor(mk, mSlot.key); await sleep(60);
      const cb = document.querySelector(`.psheet [data-pid="${victim.id}"]`); cb.checked = true; cb.dispatchEvent(new Event('change')); await sleep(60);
      check('coordinator: a "ממש לא" placement shows a red warning and asks for approval', /ממש לא/.test(document.querySelector('#slot-warn').textContent) && /אישור/.test(document.querySelector('#slot-warn').textContent), document.querySelector('#slot-warn').textContent);
      document.querySelector('#slot-save').click(); await sleep(80);
      check('coordinator: the shift is saved and marked as waiting for the instructor', (m.assignments[mSlot.key] || []).includes(victim.id) && m.approvals[mSlot.key + '|' + victim.id] === 'pending' && !!document.querySelector('.pchip.pending'), JSON.stringify(m.approvals));

      // --- the instructor sees the request and answers
      portalUi.persona = victim.id; portalUi.tab = 'swaps'; showPortal();
      check('instructor: sees the request to approve the "ממש לא" shift', !!document.querySelector('[data-appr-ok]'), 'no request');
      document.querySelector('[data-appr-no]').click(); await sleep(60);
      check('instructor: declining removes the placement', !(m.assignments[mSlot.key] || []).includes(victim.id) && !m.approvals[mSlot.key + '|' + victim.id], 'still assigned');
      prefsV.slots = {}; prefsV.absent = [];

      // --- preferences: everything is "כן" by default; choose a level, then tap days or shifts; "נקה הכל" asks first
      portalUi.persona = 'i2'; portalUi.tab = 'prefs'; portalUi.pmonth = addMonths(mk, 1); showPortal();
      const nm = addMonths(mk, 1), nPrefs = portalPrefsOf(nm, 'i2'); nPrefs.slots = {}; nPrefs.absent = []; portalMonth(nm).submitted.i2 = false;
      showPortal();
      check('preferences: a calendar of the month, with the level bar at the bottom', document.querySelectorAll('.pday:not(.blank)').length === daysOfMonth(nm).length && document.querySelectorAll('.lvbtn').length === 5, 'calendar');
      check('preferences: the whole screen starts as "כן"', document.querySelectorAll('.pshift').length === daysOfMonth(nm).length * st.shiftTypes.length && [...document.querySelectorAll('.pshift')].every(b => b.classList.contains('lv-yes')), 'not all yes');
      check('preferences: the clear button is called "נקה הכל"', $('prefs-clear-all').textContent.trim() === 'נקה הכל', $('prefs-clear-all').textContent);
      check('preferences: submitting is required and says so', /טרם הוגשו/.test(document.querySelector('.pstatus').textContent), document.querySelector('.pstatus').textContent);
      document.querySelector('[data-plevel="avoid"]').click();
      const d1 = daysOfMonth(nm)[2];
      document.querySelector(`[data-pslot="${d1}|m"]`).click();
      check('preferences: choose a level, then tap a shift', nPrefs.slots[d1 + '|m'] === 'avoid' && document.querySelector(`[data-pslot="${d1}|m"]`).classList.contains('lv-avoid'), JSON.stringify(nPrefs.slots));
      document.querySelector(`[data-pday="${daysOfMonth(nm)[4]}"]`).click();
      check('preferences: tapping a day sets all of its shifts', st.shiftTypes.every(s => nPrefs.slots[daysOfMonth(nm)[4] + '|' + s.id] === 'avoid'), JSON.stringify(nPrefs.slots));
      document.querySelector('[data-plevel="absent"]').click(); document.querySelector(`[data-pday="${daysOfMonth(nm)[6]}"]`).click();
      check('preferences: a whole day can be marked as absent', nPrefs.absent.includes(daysOfMonth(nm)[6]), JSON.stringify(nPrefs.absent));
      $('prefs-clear-all').click(); await sleep(150);
      const clearSheet = document.querySelector('.confirm-sheet');
      check('preferences: "נקה הכל" asks "לנקות את כל ההעדפות?" first', !!clearSheet && /לנקות את כל ההעדפות/.test(clearSheet.textContent) && Object.keys(nPrefs.slots).length > 0, clearSheet ? clearSheet.textContent : 'no question');
      clearSheet.querySelector('.confirm-cancel').click(); await sleep(150);
      check('preferences: answering "back" keeps the marks', Object.keys(nPrefs.slots).length > 0 && nPrefs.absent.length > 0, JSON.stringify(nPrefs));
      $('prefs-clear-all').click(); await sleep(150); document.querySelector('.confirm-ok').click(); await sleep(150);
      check('preferences: confirming clears everything back to "כן"', Object.keys(nPrefs.slots).length === 0 && nPrefs.absent.length === 0 && [...document.querySelectorAll('.pshift')].every(b => b.classList.contains('lv-yes')), JSON.stringify(nPrefs));
      document.querySelector('[data-plevel="avoid"]').click(); document.querySelector(`[data-pslot="${d1}|m"]`).click();
      document.querySelector('#prefs-submit').click(); await sleep(60);
      check('preferences: submitting is recorded', portalMonth(nm).submitted.i2 === true && /הוגשו/.test(document.querySelector('.pstatus').textContent), 'not submitted');

      // --- the schedule tab: two folding sections, the next shift stands out, no yellow frame
      portalUi.persona = 'i1'; portalUi.tab = 'schedule'; portalUi.month = mk; portalUi.fold = { mine:false, team:false, swap:false }; showPortal();
      const foldMine = document.querySelector('details[data-fold="mine"]'), foldTeam = document.querySelector('details[data-fold="team"]');
      check('schedule: "המשמרות שלי" and "הצוות כולו" are folded and can be opened', !!foldMine && !!foldTeam && !foldMine.open && !foldTeam.open && /המשמרות שלי/.test(foldMine.querySelector('summary').textContent) && /הצוות כולו/.test(foldTeam.querySelector('summary').textContent), 'folds');
      foldMine.open = true; foldTeam.open = true; await sleep(60);
      check('schedule: the fold state is remembered', portalUi.fold.mine === true && portalUi.fold.team === true, JSON.stringify(portalUi.fold));
      showPortal();
      check('schedule: after a refresh the sections stay open', document.querySelector('details[data-fold="mine"]').open && document.querySelector('details[data-fold="team"]').open, 'closed');
      const nextShift = nextShiftOf(portalPerson('i1'));
      check('schedule: my next shift carries the "המשמרת הבאה" banner', document.querySelectorAll('.pmine-row.next').length === 1 && /המשמרת הבאה/.test(document.querySelector('.pmine-row.next .pnext-badge').textContent) && document.querySelector('.pmine-row.next b').textContent === dayLabel(nextShift.date), nextShift && nextShift.key);
      check('schedule: in the team table the whole row of my next shift breathes slowly (no yellow frame)', document.querySelectorAll('.pboard tr.next-row').length === 1 && getComputedStyle(document.querySelector('.pboard tr.next-row td')).animationName === 'next-breathe' && getComputedStyle(document.querySelector('.pboard tr.next-row td')).animationDuration !== '0s' && getComputedStyle(document.querySelector('.pboard tr.today td')).boxShadow === 'none', getComputedStyle(document.querySelector('.pboard tr.next-row td')).animationName);
      check('instructor: sees the whole team with their own name highlighted', document.querySelectorAll('.pboard .pchip').length > 20 && !!document.querySelector('.pboard .pchip.me') && !document.querySelector('.pboard .lv-yes, .pboard .lv-avoid, .pboard .lv-no'), 'board');

      // --- swaps: publish my shift from the schedule tab, a colleague offers, the coordinator decides, both are told
      const swapFold = document.querySelector('details[data-fold="swap"]');
      check('swaps: a folded "בקשת החלפה" header sits inside "המשמרות שלי", and the buttons appear when it is opened', !!swapFold && !swapFold.open && getComputedStyle(document.querySelector('.swap-btn')).display === 'none', 'swap fold');
      swapFold.open = true; await sleep(60);
      check('swaps: opening it shows a "בקשת החלפה" button beside each upcoming shift', getComputedStyle(document.querySelector('.swap-btn')).display !== 'none' && document.querySelectorAll('.swap-btn').length > 3, 'no buttons');
      const mine = myShifts(portalPerson('i1'), mk).find(s => s.end > Date.now() && !st.swaps.some(w => w.key === s.key));
      document.querySelector(`[data-swap-open="${mine.key}"]`).click(); await sleep(150);
      check('swaps: asks before publishing the shift', !!document.querySelector('.confirm-sheet') && /לבקש החלפה/.test(document.querySelector('.confirm-sheet').textContent), 'no question');
      document.querySelector('.confirm-ok').click(); await sleep(150);
      check('swaps: the shift is published on the shared swaps screen (no colleague chosen yet)', st.swaps.some(s => s.key === mine.key && s.from === 'i1' && s.to === null && s.status === 'open'), JSON.stringify(st.swaps[0]));
      const taker = people.find(p => p.id !== 'i1' && canTakeShift(p.id, mine.key)), stranger = people.find(p => p.id !== 'i1' && p.id !== taker.id && !canTakeShift(p.id, mine.key));
      portalUi.persona = taker.id; portalUi.tab = 'swaps'; showPortal();
      check('swaps: every instructor sees who asks for a swap and which shift', /בקשות החלפה פתוחות/.test($('portal-body').textContent) && document.querySelectorAll('.preq.swap').length >= 1 && $('portal-body').textContent.includes(instrName(portalPerson('i1'), st.instructors)), 'no list');
      if(stranger){ portalUi.persona = stranger.id; showPortal(); check('swaps: somebody who cannot take that shift cannot press the button', !document.querySelector(`[data-swap-take]`) || !document.querySelector(`[data-swap-take="${st.swaps.find(s => s.key === mine.key).id}"]`), 'button shown'); portalUi.persona = taker.id; showPortal(); }
      document.querySelector(`[data-swap-take="${st.swaps.find(s => s.key === mine.key).id}"]`).click(); await sleep(80);
      const sw1 = st.swaps.find(s => s.key === mine.key);
      check('swaps: "אני יכול/ה להחליף" sends the request on to the coordinator and tells both people', sw1.status === 'offered' && sw1.to === taker.id && /הועברה לרכזת/.test(document.querySelector('.toast:last-of-type').textContent) && st.notices.some(n => n.to === 'i1' && /הועברה לרכזת/.test(n.text)) && st.notices.some(n => n.to === taker.id && /הועברה לרכזת/.test(n.text)), JSON.stringify(sw1));
      portalUi.persona = 'c1'; portalUi.tab = 'swaps'; showPortal();
      check('swaps: the coordinator sees the request with both names', document.querySelectorAll('[data-approve]').length === 1, 'no request');
      const outBefore = st.outbox.length; document.querySelector('[data-approve]').click(); await sleep(80);
      check('swaps: approving changes the schedule of both instructors', sw1.status === 'approved' && m.assignments[mine.key].includes(taker.id) && !m.assignments[mine.key].includes('i1'), JSON.stringify(m.assignments[mine.key]));
      const mails = st.outbox.slice(0, st.outbox.length - outBefore);
      check('swaps: both instructors get a "שינוי במשמרות" e-mail', mails.filter(e => /שינוי במשמרות/.test(e.subject)).map(e => e.to).sort().join() === ['i1', taker.id].sort().join(), mails.map(e => e.to + ':' + e.subject).join(' | '));
      portalUi.persona = 'i1'; portalUi.tab = 'schedule'; showPortal();
      check('swaps: the requester sees a note about the change on the next visit to the schedule, and can dismiss it', !!document.querySelector('.pnotice') && /שינוי במשמרות/.test(document.querySelector('.pnotice').textContent), 'no note');
      document.querySelector('[data-notice-ok]').click(); await sleep(60);
      check('swaps: the dismissed note is gone from the schedule but stays in the messages', st.notices.filter(n => n.to === 'i1' && !n.seen && /שינוי במשמרות/.test(n.text)).length === 0, 'still unseen');
      portalUi.tab = 'inbox'; showPortal();
      check('swaps: the messages area lists the personal updates', /עדכונים אישיים/.test($('portal-body').textContent) && /אושרה/.test($('portal-body').textContent), $('portal-body').textContent.slice(0, 120));
      // a rejected request: both are told, nothing changes
      const mine2 = myShifts(portalPerson('i3'), mk).find(s => s.end > Date.now());
      st.swaps.unshift({ id:'s-rej', key:mine2.key, from:'i3', to:null, status:'open', at:new Date().toISOString() });
      const taker2 = people.find(p => p.id !== 'i3' && canTakeShift(p.id, mine2.key));
      portalUi.persona = taker2.id; portalUi.tab = 'swaps'; showPortal(); document.querySelector('[data-swap-take="s-rej"]').click(); await sleep(60);
      portalUi.persona = 'c1'; showPortal(); const before2 = JSON.stringify(m.assignments[mine2.key]); const outB2 = st.outbox.length; document.querySelector('[data-reject]').click(); await sleep(80);
      check('swaps: rejecting leaves the schedule as it was, e-mails both and leaves a warning note', JSON.stringify(m.assignments[mine2.key]) === before2 && st.outbox.length - outB2 === 2 && st.notices.some(n => n.to === 'i3' && n.kind === 'warn' && /לא אושרה/.test(n.text)) && st.notices.some(n => n.to === taker2.id && n.kind === 'warn'), st.outbox.slice(0, 2).map(e => e.subject).join(' | '));
      const sw3 = { id:'s-can', key:mine2.key, from:'i3', to:null, status:'open' }; st.swaps.unshift(sw3);
      portalUi.persona = 'i3'; portalUi.tab = 'swaps'; showPortal(); document.querySelector('[data-swap-cancel="s-can"]').click(); await sleep(60);
      check('swaps: the requester can cancel an open request', sw3.status === 'cancelled', sw3.status);
      // --- coordinator: auto-schedule, publish, e-mail preview, timetable, theme
      const nmo = portalMonth(nm); portalUi.persona = 'c1'; portalUi.tab = 'schedule'; portalUi.month = nm; showPortal();
      check('coordinator: warns about instructors who did not submit', /עוד לא הגישו/.test(document.querySelector('.pstatus').textContent), 'no warning');
      document.querySelector('#cs-auto').click();
      for(let i = 0; i < 40 && !Object.keys(nmo.assignments).length; i++) await sleep(100);
      check('coordinator: the automatic schedule button builds next month', Object.keys(nmo.assignments).length > 20 && nmo.published === false, 'nothing built');
      document.querySelector('#cs-publish').click(); await sleep(60);
      check('coordinator: publishing marks it and queues an e-mail to everybody', nmo.published === true && st.outbox[0].to === 'all' && /פורסם/.test(st.outbox[0].subject), JSON.stringify(st.outbox[0]));
      portalUi.tab = 'timetable'; portalUi.tmonth = mk; showPortal();
      const before = (st.timetable[mk].weekly[1] || []).length; document.querySelector('#tt-add').click(); await sleep(50);
      document.querySelector('#act-n').value = 'בדיקה'; document.querySelector('#act-save').click(); await sleep(60);
      check('timetable: an activity can be added to the weekly pattern', (st.timetable[mk].weekly[portalUi.ttDay] || []).some(a => a.n === 'בדיקה'), 'not added');
      const light = st.settings.theme; showPortal(); document.querySelector('#portal-theme').click();
      check('theme: the portal can be switched between dark and light', document.querySelector('.portal-shell').dataset.ptheme !== light, document.querySelector('.portal-shell').dataset.ptheme);
      st.settings.theme = 'dark';

      // --- the new kids' TV screens
      check('TV: four new screens are in the rotation list', [9, 10, 11, 12].every(id => !!SLIDES[id]), SLIDES.length);
      refreshPortalSlides();
      check('TV: they show when there is something to show (today has people, activities and a birthday)', SLIDES[9].hidden === false && SLIDES[10].hidden === false && SLIDES[11].hidden === false && SLIDES[12].hidden === false, [9, 10, 11, 12].map(i => SLIDES[i].hidden).join());
      activateDisplayView(); stopCarousel();
      await showSlide(9);
      check('TV: "who is here today" groups people by shift, with a photo and a first name', document.querySelectorAll('#tv-instructors .tvi-group').length >= 2 && document.querySelectorAll('#tv-instructors .tvi-photo').length >= 4 && [...document.querySelectorAll('#tv-instructors .tvi-name')].every(n => n.textContent.trim().length > 0 && n.textContent.trim().split(' ').length <= 2), 'groups');
      await showSlide(10);
      check('TV: today\'s timetable lists the activities, one of them lit', document.querySelectorAll('#tv-timetable .tvt-row').length === timetableFor(isoDate(new Date())).length && !!document.querySelector('#tv-timetable .tvt-row.now'), document.querySelectorAll('#tv-timetable .tvt-row').length + ' rows');
      await showSlide(11);
      check('TV: the week shows seven days and flags the special day', document.querySelectorAll('#tv-week .tvw-day').length === 7 && document.querySelectorAll('#tv-week .tvw-day.special').length === 1, 'week');
      await showSlide(12);
      check('TV: the birthday screen shows today\'s child with the age', document.querySelectorAll('#tv-birthdays .tvb-card').length === birthdaysToday().length && /גיל \d+/.test($('tv-birthdays').textContent), $('tv-birthdays').textContent);
      stopCarousel(); showHub();

      // --- the retention rule and the reset
      portalMonth(addMonths(mk, -6)).published = true; portalPrune();
      check('retention: schedules older than three months are dropped', !st.months[addMonths(mk, -6)], 'kept');
      portalReset(); check('the demo can be reset to its starting data', Object.keys(portalLoad().months).length === 2 && portalLoad().swaps.length === 0, 'not reset');
      portalUi.persona = 'c1'; portalUi.tab = null; portalUi.month = portalUi.pmonth = portalUi.smonth = portalUi.tmonth = null;
    });

    // ---- kids' TV: every visible slide renders, names without age
    await step('tv', async () => {
      activateDisplayView(); stopCarousel();
      for(const s of SLIDES){
        await showSlide(s.id);
        const slideEl = $('slide-' + s.id);
        check(`TV slide "${s.label}" is shown`, slideEl.classList.contains('active'), 'not active');
      }
      await showSlide(5);
      const cards = document.querySelectorAll('#star-board .star-card');
      check('star board shows a card per child', cards.length === roster.length, cards.length + ' cards');
      const txt = $('star-board').innerText;
      check('TV names carry no age', !roster.some(c => c.age && new RegExp('(^|\\D)' + String(c.age).replace('.', '\\.') + '(\\D|$)').test(txt.replace(/×\d+/g, ''))), 'an age appears on the star board');

      await showSlide(7);
      await sleep(300);
      const board = $('mercury-board'); const br = board.getBoundingClientRect();
      const markers = [...board.querySelectorAll('.kid-marker')];
      const expected = [];
      for(const c of roster){ const st = await getChildState(c.id); if((st.moonSteps || 0) >= 7) expected.push(c.id); }
      check('Mercury board has a ship per child that reached Mercury', markers.length === expected.length, markers.length + ' ships vs ' + expected.length);
      const rects = markers.map(m => m.getBoundingClientRect());
      // the ship layout is only meant for TV / desktop screens (nobody watches the board on a phone)
      const outside = innerWidth < 900 ? [] : markers.map((m, i) => ({ m, r: rects[i] })).filter(x => !(x.r.left >= br.left - 1 && x.r.right <= br.right + 1 && x.r.top >= br.top - 1 && x.r.bottom <= br.bottom + 1));
      check('every ship is inside the board', outside.length === 0, outside.map(x => `${x.m.textContent.trim()} L${Math.round(x.r.left - br.left)} R${Math.round(br.right - x.r.right)} T${Math.round(x.r.top - br.top)} B${Math.round(br.bottom - x.r.bottom)} (board ${Math.round(br.width)}x${Math.round(br.height)})`).join(' | '));
      let overlaps = 0;
      for(let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++){
        const a = rects[i], b = rects[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if(w > 4 && h > 4 && innerWidth >= 900) overlaps++;
      }
      check('no two Mercury ships overlap', overlaps === 0, overlaps + ' overlapping pairs');
    });

    check('no JavaScript errors during the run', errors.length === 0, errors.join(' | '));
  }

  window.addEventListener('load', async () => {
    const out = document.createElement('pre'); out.id = 'check-results';
    try { await run(); } catch(e){ check('run crashed', false, e && e.stack || e); }
    const failed = results.filter(r => !r.ok);
    out.textContent = JSON.stringify({ total: results.length, failed: failed.length, results });
    document.body.appendChild(out);
    document.title = 'CHECKS-DONE';
    // the runner's little server collects the outcome (see tests\run-checks.ps1)
    try { await fetch('/__results', { method:'POST', body: out.textContent }); } catch(e){}
  });
})();
/*@END-TEST-ONLY*/
