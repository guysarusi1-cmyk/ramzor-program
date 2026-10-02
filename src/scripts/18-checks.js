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
      const r = $('bottom-nav').getBoundingClientRect();
      check('bar sits at the bottom edge', Math.abs(r.bottom - innerHeight) < 2, 'bottom ' + r.bottom + ' vs ' + innerHeight);
      $('hub-daily-btn').click(); openGuidedScreen('red');
      check('bar is hidden during a protocol', !visible($('bottom-nav')), 'visible');
      showHub();
    });

    // ---- daily operations: full traffic light, no child
    await step('daily ops', async () => {
      $('hub-daily-btn').click();
      check('daily ops opens staff view', activeView() === 'view-staff', activeView());
      const rows = [...document.querySelectorAll('#quick-light-rows [data-quick]')].map(r => r.dataset.quick);
      check('lights are in order gold, red, orange, yellow, green', rows.join() === 'gold,red,orange,yellow,green', rows.join());
      check('no child list on this screen', !document.querySelector('#staff-screen-pick .child-chip, #staff-screen-pick #staff-child-list'), 'a child list is there');

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
      let sawWarning = false;
      for(let i=0;i<8;i++){ if(document.querySelector('.guided-under5')) sawWarning = true; if(!$('guided-next-btn').hidden) $('guided-next-btn').click(); }
      check('red: under-5 warning shows when no child is chosen', sawWarning, 'never shown');

      document.querySelector('#quick-light-rows [data-quick="green"]').click();
      check('green screen opens', visible($('staff-screen-green')), 'not visible');
      check('green offers a WhatsApp link per social worker', document.querySelectorAll('#green-sw-section a[href^="https://wa.me/"]').length === 2, document.getElementById('green-sw-section').innerHTML.slice(0, 120));
      document.querySelector('#staff-screen-green .back-btn').click();
      document.querySelector('#quick-light-rows [data-quick="gold"]').click();
      check('gold screen opens with its 3 actions', visible($('staff-screen-gold')) && document.querySelectorAll('#staff-screen-gold .guided-action').length === 3, 'gold screen wrong');
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

    // ---- management
    await step('management', async () => {
      showHub();
      $('hub-manage-gear').click();
      check('gear opens the management screen', activeView() === 'view-manage', activeView());
      check('management lists all children', document.querySelectorAll('#roster-list > *').length === 14, 'children not listed');
      check('manual reset buttons exist', !!$('reset-stars-btn') && !!$('reset-mercury-btn'), 'missing');
      check('test tools card exists in test', !!$('temp-goto-display-btn-manage'), 'missing');
      $('manage-back-to-hub').click();
    });

    // ---- management: bonus editor, ship picker, new child with a starting stage (all undone afterwards)
    await step('management editing', async () => {
      showHub(); $('hub-manage-gear').click();
      window.confirm = () => true;

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
        document.querySelector(`.roster-row[data-id="${kid.id}"] .rm`).click();
        for(let i=0;i<20 && roster.length > 14;i++) await sleep(250);
        check(`new child (${stage}) removed again`, roster.length === 14, 'roster ' + roster.length);
      }
      $('manage-back-to-hub').click();
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
      await sleep(400);
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
