// ---------- CAROUSEL (kids display: 7 rotating slides, 15s each) ----------
const SLIDES = [
  { id:0, label:'מבט על — הרמזור', render: renderOverviewSlide, hidden:true },
  { id:1, label:'הרמזור הצהוב', render: renderYellowSlide, hidden:true },
  { id:2, label:'לוח ההתנדבויות', render: async ()=>{}, hidden:true }, // still only a 'waiting for design' placeholder — kept out of the rotation until it is designed
  { id:3, label:'בונוסים', render: renderBonusesSlide },
  { id:4, label:'הרמזור הירוק', render: renderGreenSlide, hidden:true },
  { id:5, label:'לוח הכוכבים', render: renderStarBoard },
  { id:6, label:'לוח המסע בחלל', render: renderMoonBoard, hidden:true },   // shown only while some child is on this journey (see journeyBoardsNeeded)
  { id:7, label:'המסע לכוכב המילים', render: renderMercuryBoard }   // shown only while some child is on this journey
];
let carouselIndex = 3; // start on the first non-hidden slide (bonuses)
let carouselTimer = null;

// Each journey board is in the rotation only while at least one child is on that journey, so the kids
// never see an empty board — and a child who is added in the first (moon) stage gets a board right away.
// rows: [{ child_id, moon_steps }]; children without a state row count as being at the start.
function journeyBoardsNeeded(rows, childIds){
  const byChild = {};
  rows.forEach(r => { byChild[r.child_id] = r.moon_steps || 0; });
  let moon = 0, mercury = 0;
  childIds.forEach(id => { if((byChild[id] || 0) >= 7) mercury++; else moon++; });
  return { moon: moon > 0, mercury: mercury > 0 };
}
async function refreshJourneyBoards(){
  const { data, error } = await sb.from('child_state').select('child_id, moon_steps');
  if(error || !data) return;
  const need = journeyBoardsNeeded(data, roster.map(c => c.id));
  SLIDES[6].hidden = !need.moon;
  SLIDES[7].hidden = !need.mercury;
}
function renderOverviewSlide(){
  const el = document.getElementById('overview-slide-content');
  const colors = ['red','orange','yellow','green','gold'];
  el.innerHTML = `<div class="overview-signal">` + colors.map(c => `
    <div class="overview-row">
      <div class="dot-lamp ${c}"></div>
      <div class="lbl-txt">${PROGRAM[c].label}</div>
    </div>
  `).join('') + `</div>`;
}
function renderYellowSlide(){
  document.getElementById('yellow-slide-content').innerHTML = renderProtocolCard('yellow');
}
function renderGreenSlide(){
  document.getElementById('green-slide-content').innerHTML = renderProtocolCard('green');
}
function bonusBoardSection(title, list, revocationsByBonus){
  if(!list.length) return '';
  return `
    <h3 style="font-family:'Rubik'; font-size:14px; color:var(--gold); margin:0 0 8px;">${title}</h3>
    <div class="bonus-board-grid" style="margin-bottom:18px;">
      ${list.map(b => {
        const revoked = revocationsByBonus[b.id];
        const revokedHtml = revoked && revoked.length ? `<span class="bonus-revoked-names">לא היום: ${revoked.join(', ')}</span>` : '';
        const activeClass = isBonusTimeActive(b) ? ' bonus-active' : '';
        return `<div class="bonus-board-item${activeClass}"><span class="bb-icon">${bonusIcon(b)}</span><span class="bb-body"><span class="bb-text">${b.text}</span>${revokedHtml}</span></div>`;
      }).join('')}
    </div>`;
}
async function renderBonusesSlide(){
  const el = document.getElementById('bonuses-slide-content');
  const todayDaily = bonusesDaily.filter(bonusAppliesToday);
  const todayWeekly = bonusesWeekly.filter(bonusAppliesToday);
  if(!todayDaily.length && !todayWeekly.length){ el.innerHTML = '<div class="empty">אין בונוסים מוגדרים להיום</div>'; return; }
  const revocationsByBonus = groupRevocationsByBonus(await getActiveBonusRevocations());
  // few bonuses are shown big in one column; more than 4 switch to two columns so they all fit on the screen
  el.dataset.layout = (todayDaily.length + todayWeekly.length) > 4 ? 'two' : 'one';
  el.innerHTML = bonusBoardSection('יומיים', todayDaily, revocationsByBonus) + bonusBoardSection('שבועיים', todayWeekly, revocationsByBonus);
}

function renderDots(){
  const el = document.getElementById('slide-dots');
  el.innerHTML = SLIDES.map((s,i) => s.hidden ? '' : `<div class="dot ${i===carouselIndex?'active':''}"></div>`).join('');
}

async function showSlide(i){
  carouselIndex = i;
  document.querySelectorAll('.slide').forEach(s=>s.classList.remove('active'));
  document.getElementById('slide-'+i).classList.add('active');
  document.getElementById('slide-label').textContent = SLIDES[i].label;
  renderDots();
  announceTvStatus();
  await SLIDES[i].render();
}

let feedbackChannel = null;
let bonusRevocationChannel = null;
const EVENT_TYPE_SLIDE = { star:5, moon:6, mercury:7, bonus:3 };
const STUNT_BOARD_MS = 9500;   // how long a journey board stays up while the ship does its show
let interruptTimer = null;
let preInterruptIndex = null;

function pauseRotation(){
  if(carouselTimer){ clearInterval(carouselTimer); carouselTimer = null; }
}
function resumeRotation(){
  if(carouselTimer || tvHeld || IS_TV_PREVIEW) return;   // held by staff from the control screen / the preview just follows the real TV
  carouselTimer = setInterval(async ()=>{
    await refreshJourneyBoards();
    let next = (carouselIndex + 1) % SLIDES.length;
    while(SLIDES[next].hidden) next = (next + 1) % SLIDES.length;
    showSlide(next);
  }, 15000);
}

async function interruptToSlide(slideIndex, renderFn, holdMs){
  if(!document.getElementById('view-display').classList.contains('active')) return;
  if(preInterruptIndex === null) preInterruptIndex = carouselIndex;
  pauseRotation();

  // show the slide first (old marker positions still in the DOM), THEN update
  // positions a frame later so the glide transition has an old->new state to animate.
  carouselIndex = slideIndex;
  document.querySelectorAll('.slide').forEach(s=>s.classList.remove('active'));
  document.getElementById('slide-'+slideIndex).classList.add('active');
  document.getElementById('slide-label').textContent = SLIDES[slideIndex].label;
  renderDots();
  announceTvStatus();
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ renderFn(); }); });

  clearTimeout(interruptTimer);
  interruptTimer = setTimeout(async ()=>{
    const back = preInterruptIndex;
    preInterruptIndex = null;
    await showSlide(back);
    resumeRotation();
  }, holdMs || 6500);
}

// The child's own ship (or avatar) does a little show on the journey boards: it leaves its old spot,
// flies to the front of the screen big, loops and flips, and then flies to its new spot.
//   renderBoard(opts) draws the board; it understands { stepsOverride, hideChildId } (see 12-display-view.js)
async function flyMarkerStunt(childId, boardEl, renderBoard, stepsBefore){
  document.querySelectorAll('body > .stunt-flyer').forEach(f => f.remove());                // never leave an old copy behind
  if(typeof Element.prototype.animate !== 'function'){ await renderBoard({}); return; }     // very old browser: just show the new state
  let flyer = null;
  try {
    await renderBoard({ stepsOverride: { [childId]: stepsBefore } });                        // 1. the board as it was a moment ago
    const marker = boardEl.querySelector(`.kid-marker[data-child-id="${childId}"]`);
    if(!marker){ await renderBoard({}); return; }
    const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
    const from = centerOf(marker);
    flyer = marker.cloneNode(true);                                                          // 2. a copy that can leave the board
    flyer.classList.add('stunt-flyer');
    Object.assign(flyer.style, { position:'fixed', left: from.x + 'px', top: from.y + 'px', width: marker.getBoundingClientRect().width + 'px',
      margin:'0', zIndex:'250', pointerEvents:'none', transition:'none', fontSize: boardEl.style.fontSize, visibility:'visible' });
    document.body.appendChild(flyer);
    marker.style.visibility = 'hidden';
    const body = flyer.firstElementChild;                                                    // the ship/avatar part (the name stays upright)
    const frontScale = Math.max(2, (Math.min(innerWidth, innerHeight) * 0.42) / Math.max(from.w, 40));
    const at = (dx, dy, s) => `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${s})`;
    const toFront = { dx: innerWidth / 2 - from.x, dy: innerHeight / 2 - from.y };
    // a step of the show; the timer guarantees it ends even if the browser has stopped drawing frames
    const play = (el, frames, opts) => Promise.race([el.animate(frames, opts).finished.catch(() => {}), waitMs(opts.duration + 1500)]);

    await play(flyer, [{ transform: at(0, 0, 1) }, { transform: at(toFront.dx, toFront.dy, frontScale * 1.1), offset: .75 }, { transform: at(toFront.dx, toFront.dy, frontScale) }],
      { duration: 1000, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });            // 3. out to the front of the screen
    flyer.style.transform = at(toFront.dx, toFront.dy, frontScale);

    const stunt = play(body, [                                                               // 4. the stunt (a loop, then a flip) — the board updates underneath meanwhile
      { transform: 'perspective(900px) rotate(0deg) rotateY(0deg) scale(1)' },
      { transform: 'perspective(900px) rotate(-360deg) rotateY(0deg) scale(1.18)', offset: .5 },
      { transform: 'perspective(900px) rotate(-360deg) rotateY(360deg) scale(1)' }
    ], { duration: 1700, easing: 'ease-in-out' });
    await Promise.all([stunt, renderBoard({ hideChildId: childId })]);

    const newMarker = boardEl.querySelector(`.kid-marker[data-child-id="${childId}"]`);       // 5. back to the new spot
    if(newMarker){
      const to = centerOf(newMarker);
      await play(flyer, [
        { transform: at(toFront.dx, toFront.dy, frontScale) },
        { transform: at(to.x - from.x, to.y - from.y, 1.12), offset: .85 },
        { transform: at(to.x - from.x, to.y - from.y, 1) }
      ], { duration: 1200, easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' });
    }
  } catch(err){
    console.error(err);
  } finally {                                                                                // whatever happened: no copy on screen, every ship visible
    if(flyer) flyer.remove();
    hideOneMarker(boardEl, null);
  }
}
// star / moon / mercury event: first the full-screen moment about that child, then the board it belongs
// to (where, for the ship journeys, the ship flies from the middle of the screen to its new spot)
function celebrateFeedbackEvent(ev){
  if(!document.getElementById('view-display').classList.contains('active')) return;
  const type = ev.type, childId = ev.child_id;
  const child = roster.find(c => c.id === childId);
  if(!(type in EVENT_TYPE_SLIDE) || type === 'bonus' || !child) return;
  queueCelebration(async () => {
    const state = await getChildState(childId);
    const now = type === 'star' ? (state.stars || 0) : type === 'moon' ? (state.moonSteps || 0) : (state.mercurySteps || 0);
    await playCelebration(type, child, now);
    if(type === 'star') interruptToSlide(EVENT_TYPE_SLIDE.star, renderStarBoard);
    else if(type === 'moon') interruptToSlide(EVENT_TYPE_SLIDE.moon,
      () => flyMarkerStunt(childId, document.getElementById('moon-board'), o => renderMoonBoard(Object.assign({ justArrivedChildId: childId }, o)), now - 1), STUNT_BOARD_MS);
    else interruptToSlide(EVENT_TYPE_SLIDE.mercury,
      () => flyMarkerStunt(childId, document.getElementById('mercury-board'), renderMercuryBoard, now - 1), STUNT_BOARD_MS);  });
}
function startFeedbackListener(){
  if(feedbackChannel) return;
  feedbackChannel = sb.channel('feedback_live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feedback_events' }, payload => {
      celebrateFeedbackEvent(payload.new);
    })
    .subscribe();
  bonusRevocationChannel = sb.channel('bonus_revocations_live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bonus_revocations' }, () => {
      // client decided (2026-10-02) revocation SHOULD interrupt the carousel too, same as the celebratory
      // star/moon/mercury events — no banner/sound though, just jump to the bonuses board and refresh it
      interruptToSlide(EVENT_TYPE_SLIDE.bonus, renderBonusesSlide);
    })
    .subscribe();
}
function stopFeedbackListener(){
  if(feedbackChannel){ sb.removeChannel(feedbackChannel); feedbackChannel = null; }
  if(bonusRevocationChannel){ sb.removeChannel(bonusRevocationChannel); bonusRevocationChannel = null; }
}

function startCarousel(){
  stopCarousel();
  if(!IS_TV_PREVIEW) unlockTvSound();       // works at once where the browser allows it (kiosk / TV modes); otherwise the first button press does
  refreshJourneyBoards().then(() => renderDots());
  showSlide(carouselIndex);
  resumeRotation();
  startFeedbackListener();
  startTvControlListener();
}
function stopCarousel(){
  pauseRotation();
  stopTvControlListener();
  clearTimeout(interruptTimer);
  preInterruptIndex = null;
  stopFeedbackListener();
}

