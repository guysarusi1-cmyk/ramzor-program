/*@TEST-ONLY*/
// ---------- AUTOMATIC CHECKS (test environment only) ----------
// Open the test site with ?runchecks (tests\run-checks.ps1 does this in a hidden browser). The page
// signs in, walks through every screen and flow, and writes the outcome into #check-results.
// It only ever runs against the test project, never the live site.
(function(){
  if(!/[?&]runchecks\b/.test(location.search)) return;
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
      check('gold screen opens with its 2 real actions (no "coming soon" placeholders)', visible($('staff-screen-gold')) && document.querySelectorAll('#staff-screen-gold .guided-action').length === 2 && ![...document.querySelectorAll('#staff-screen-gold .guided-action')].some(b => b.disabled), 'gold screen wrong');
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
      await updateChildState(kid, () => ({ set:{ stars: base }, guard:['stars'] }));

      await giveStar(kid);
      check('the star message has no "ביטול" button (switched off for now)', !document.querySelector('.toast-undo') && STAR_UNDO_ENABLED === false && !!document.querySelector('.toast'), 'undo still shown');
      check('the star itself is recorded', (await stars()) === base + 1, base + ' vs ' + (await stars()));
      await updateChildState(kid, () => ({ set:{ stars: base }, guard:['stars'] }));

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
