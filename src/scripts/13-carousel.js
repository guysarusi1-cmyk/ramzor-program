// ---------- CAROUSEL (kids display: 7 rotating slides, 15s each) ----------
const SLIDES = [
  { id:0, label:'מבט על — הרמזור', render: renderOverviewSlide, hidden:true },
  { id:1, label:'הרמזור הצהוב', render: renderYellowSlide, hidden:true },
  { id:2, label:'לוח ההתנדבויות', render: async ()=>{}, hidden:true }, // still only a 'waiting for design' placeholder — kept out of the rotation until it is designed
  { id:3, label:'בונוסים', render: renderBonusesSlide },
  { id:4, label:'הרמזור הירוק', render: renderGreenSlide, hidden:true },
  { id:5, label:'לוח הכוכבים', render: renderStarBoard },
  { id:6, label:'לוח המסע בחלל', render: renderMoonBoard, hidden:true }, // all current kids graduated to Mercury; kept for future new kids
  { id:7, label:'המסע לכוכב המילים', render: renderMercuryBoard }
];
let carouselIndex = 3; // start on the first non-hidden slide (bonuses)
let carouselTimer = null;

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
        return `<div class="bonus-board-item${activeClass}">🎁 ${b.text}${revokedHtml}</div>`;
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
  await SLIDES[i].render();
}

let feedbackChannel = null;
let bonusRevocationChannel = null;
const EVENT_TYPE_SLIDE = { star:5, moon:6, mercury:7, bonus:3 };
let interruptTimer = null;
let preInterruptIndex = null;

function pauseRotation(){
  if(carouselTimer){ clearInterval(carouselTimer); carouselTimer = null; }
}
function resumeRotation(){
  if(carouselTimer) return;
  carouselTimer = setInterval(()=>{
    let next = (carouselIndex + 1) % SLIDES.length;
    while(SLIDES[next].hidden) next = (next + 1) % SLIDES.length;
    showSlide(next);
  }, 15000);
}

async function interruptToSlide(slideIndex, renderFn){
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
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ renderFn(); }); });

  clearTimeout(interruptTimer);
  interruptTimer = setTimeout(async ()=>{
    const back = preInterruptIndex;
    preInterruptIndex = null;
    await showSlide(back);
    resumeRotation();
  }, 6500);
}

function flyShipHero(childId, boardEl, shipSrc){
  if(!shipSrc) return;
  const marker = boardEl.querySelector(`.kid-marker[data-child-id="${childId}"]`);
  if(!marker) return;
  const boardRect = boardEl.getBoundingClientRect();
  const leftPct = parseFloat(marker.style.left);
  const topPct = parseFloat(marker.style.top);
  const targetX = boardRect.left + (leftPct/100) * boardRect.width;
  const targetY = boardRect.top + (topPct/100) * boardRect.height;
  // match the real marker's actual current width (it carries its own px size, which may be
  // scaled down from the usual 10% if its cluster is crowded — see placeCluster) so the hero
  // doesn't visibly change size the instant it lands.
  const targetSize = parseFloat(marker.style.width) || boardRect.width * 0.10;

  const flyer = document.createElement('img');
  flyer.src = shipSrc;
  Object.assign(flyer.style, {
    position:'fixed', zIndex:200, pointerEvents:'none',
    filter:'drop-shadow(0 8px 24px rgba(0,0,0,.6))',
    transition:'left 1.6s cubic-bezier(.22,.9,.3,1), top 1.6s cubic-bezier(.22,.9,.3,1), width 1.6s cubic-bezier(.22,.9,.3,1), opacity .5s ease .9s',
  });
  const startSize = Math.min(window.innerWidth, window.innerHeight) * 0.45;
  flyer.style.width = startSize + 'px';
  flyer.style.left = (window.innerWidth/2 - startSize/2) + 'px';
  flyer.style.top = (window.innerHeight/2 - startSize/2) + 'px';
  flyer.style.opacity = '1';
  document.body.appendChild(flyer);

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      flyer.style.left = (targetX - targetSize/2) + 'px';
      flyer.style.top = (targetY - targetSize/2) + 'px';
      flyer.style.width = targetSize + 'px';
      flyer.style.opacity = '0';
    });
  });
  setTimeout(()=> flyer.remove(), 1700);
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
    else if(type === 'moon') interruptToSlide(EVENT_TYPE_SLIDE.moon, renderMoonBoard);
    else interruptToSlide(EVENT_TYPE_SLIDE.mercury, async () => {
      // the hero flight is the only motion we want for the ship that just progressed — suppress its
      // own glide transition so it doesn't ALSO slide from its old spot underneath the flying copy
      const movingMarker = document.querySelector(`#mercury-board .kid-marker[data-child-id="${childId}"]`);
      if(movingMarker) movingMarker.style.transition = 'none';
      await renderMercuryBoard();
      flyShipHero(childId, document.getElementById('mercury-board'), shipFor(childId));
      if(movingMarker) requestAnimationFrame(()=>requestAnimationFrame(()=>{ movingMarker.style.transition = ''; }));
    });
  });
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
  showSlide(carouselIndex);
  resumeRotation();
  startFeedbackListener();
}
function stopCarousel(){
  pauseRotation();
  clearTimeout(interruptTimer);
  preInterruptIndex = null;
  stopFeedbackListener();
}

