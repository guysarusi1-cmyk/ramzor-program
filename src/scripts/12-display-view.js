// ---------- DISPLAY VIEW ----------
function initials(child){
  const first = (child.firstName || '').trim()[0] || '';
  const last = (child.lastInitial || '').trim()[0] || '';
  return (first + last) || '?';
}
function nameColor(name){
  let h = 0;
  for(let i=0;i<name.length;i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}
function avatarHtml(child, sizeClass){
  return `<div class="avatar-initials" style="background:${nameColor(child.firstName)}">${initials(child)}</div>`;
}

// step-path coordinates (percent) — measured directly from the real artwork's painted numbers
// image is 1920x882 after extending the base area; positions below are exact pixel matches
const MOON_PATH = [
  {left:28.6, top:84.1}, // 1
  {left:43.3, top:71.5}, // 2
  {left:64.5, top:61.1}, // 3
  {left:56.1, top:47.5}, // 4
  {left:46.5, top:35.1}, // 5
  {left:56.0, top:23.2}, // 6
  {left:66.4, top:10.0}  // 7
];

const SHIP_ufo_watercolor = '@asset(ships/SHIP_ufo_watercolor.png)';
const SHIP_ufo_purple = '@asset(ships/SHIP_ufo_purple.png)';
const SHIP_ufo_green = '@asset(ships/SHIP_ufo_green.png)';
const SHIP_rocket_redcream = '@asset(ships/SHIP_rocket_redcream.png)';
const SHIP_mia = '@asset(ships/SHIP_mia.png)';
const SHIP_amit = '@asset(ships/SHIP_amit.png)';
const SHIP_rocket_pink = '@asset(ships/SHIP_rocket_pink.png)';
const SHIP_rocket_bluegray = '@asset(ships/SHIP_rocket_bluegray.png)';
const SHIP_ufo_pinkwhite = '@asset(ships/SHIP_ufo_pinkwhite.png)';

// every ship a child can be given in the management screen (key -> picture)
const SHIP_OPTIONS = {
  ufo_watercolor: SHIP_ufo_watercolor, ufo_purple: SHIP_ufo_purple, ufo_green: SHIP_ufo_green,
  ufo_pinkwhite: SHIP_ufo_pinkwhite, rocket_redcream: SHIP_rocket_redcream, rocket_pink: SHIP_rocket_pink,
  rocket_bluegray: SHIP_rocket_bluegray, mia: SHIP_mia, amit: SHIP_amit
};
// default ships (the ones children had before ships became selectable)
const CHILD_SHIP = {
  c2: SHIP_rocket_bluegray,
  c4: SHIP_ufo_watercolor,
  c5: SHIP_amit,
  c7: SHIP_rocket_bluegray,
  c8: SHIP_ufo_green,
  c9: SHIP_ufo_purple,
  c10: SHIP_rocket_pink,
  c11: SHIP_ufo_pinkwhite,
  c12: SHIP_ufo_purple,
  c13: SHIP_rocket_redcream,
  c14: SHIP_mia
};
// stage-2 path (moon -> Mercury/"star of words") — measured from the real artwork (2000x1414)
const MERCURY_PATH = [
  {left:24.0, top:76.0}, // 1
  {left:39.0, top:61.0}, // 2
  {left:25.0, top:47.0}, // 3
  {left:47.0, top:44.0}, // 4
  {left:36.0, top:27.0}, // 5
  {left:47.0, top:17.0}, // 6
  {left:62.0, top:9.0}   // 7
];
// persists for the page's session: child.id -> {cluster, row, col}, so a child's spot within
// a shared step never shifts just because another child joined/left that same step
const mercurySlots = {};

// star board photo-star positions — pixel-measured from the real artwork (1920x1080) by
// detecting the gold star centers directly, since the earlier hand-guessed values were off
async function renderDisplay(){
  await renderStarBoard();
  await renderMoonBoard();
}

const STAR_MAX_DOTS = 12;

function starCardHtml(child, stars){
  const filled = Math.min(stars, STAR_MAX_DOTS);
  let dots = '';
  for(let i=0;i<STAR_MAX_DOTS;i++) dots += `<div class="star-dot${i<filled?' filled':''}"></div>`;
  const extra = stars > STAR_MAX_DOTS ? `<div class="star-count-extra">×${stars}</div>` : '';
  return `${avatarHtml(child)}<div class="star-card-name">${displayName(child)}</div><div class="star-card-dots">${dots}</div>${extra}`;
}

function updateStarDots(card, prevStars, newStars){
  const dotsCol = card.querySelector('.star-card-dots');
  if(!dotsCol) return;
  const dots = dotsCol.querySelectorAll('.star-dot');
  const prevFilled = Math.min(prevStars, STAR_MAX_DOTS);
  const newFilled = Math.min(newStars, STAR_MAX_DOTS);
  dots.forEach((dot, i) => {
    const shouldBeFilled = i < newFilled;
    const wasFilled = i < prevFilled;
    if(shouldBeFilled && !wasFilled){
      dot.classList.add('filled', 'pulse');
      dot.addEventListener('animationend', () => dot.classList.remove('pulse'), { once:true });
    } else if(!shouldBeFilled && wasFilled){
      dot.classList.remove('filled');
    }
  });
  let extra = card.querySelector('.star-count-extra');
  if(newStars > STAR_MAX_DOTS){
    if(!extra) dotsCol.insertAdjacentHTML('afterend', `<div class="star-count-extra">×${newStars}</div>`);
    else extra.textContent = `×${newStars}`;
  } else if(extra){
    extra.remove();
  }
}

async function renderStarBoard(){
  const el = document.getElementById('star-board');
  if(!roster.length){ el.innerHTML = '<div class="empty">אין עדיין ילדים ברשימה</div>'; return; }

  let grid = el.querySelector('.star-cards-grid');
  if(!grid){
    el.innerHTML = '<div class="star-cards-grid"></div>';
    grid = el.querySelector('.star-cards-grid');
  }

  const wantedIds = new Set(roster.map(c=>c.id));
  grid.querySelectorAll('.star-card').forEach(card => {
    if(!wantedIds.has(card.dataset.childId)) card.remove();
  });

  for(const child of roster){
    const state = await getChildState(child.id);
    const stars = state.stars || 0;
    // looked up fresh each time: two renders can overlap (a live event arriving while the carousel draws),
    // and a stale lookup made both of them add a card for the same child
    let card = [...grid.querySelectorAll('.star-card')].find(c => c.dataset.childId === child.id);
    if(!card){
      card = document.createElement('div');
      card.className = 'star-card';
      card.dataset.childId = child.id;
      card.dataset.stars = stars;
      card.innerHTML = starCardHtml(child, stars);
      grid.appendChild(card);
    } else {
      const prevStars = parseInt(card.dataset.stars || '0', 10);
      if(prevStars !== stars){
        updateStarDots(card, prevStars, stars);
        card.dataset.stars = stars;
      }
    }
  }
}

function diffRenderMarkers(el, positions, buildInner, markerWidthPx){
  const existing = {};
  el.querySelectorAll('.kid-marker').forEach(m => { existing[m.dataset.childId] = m; });

  Object.keys(existing).forEach(id => {
    if(!positions[id]) existing[id].remove();
  });

  Object.keys(positions).forEach(id => {
    const {left, top, steps, child, scale} = positions[id];
    let marker = existing[id];
    if(!marker){
      marker = document.createElement('div');
      marker.className = 'kid-marker';
      marker.dataset.childId = id;
      el.appendChild(marker);
    }
    marker.style.left = left + '%';
    marker.style.top = top + '%';
    // a percentage width here resolves unreliably once the marker contains an <img> with its own
    // percentage width (the flex item's automatic min-content size falls back to the image's raw
    // intrinsic pixel size, overriding the percentage entirely) — pass a definite pixel value
    // instead so the ship and its label underneath are reliably centered on the same box.
    const thisWidthPx = markerWidthPx ? Math.round(markerWidthPx * (scale || 1)) : null;
    if(thisWidthPx) marker.style.width = thisWidthPx + 'px';
    marker.innerHTML = buildInner(child, steps, thisWidthPx);
  });
}

async function renderMoonBoard(){
  const el = document.getElementById('moon-board');
  if(!roster.length){ el.innerHTML = '<div class="empty">אין עדיין ילדים ברשימה</div>'; return; }

  let markersByStep = {}; // step index 0-6 (for steps 1-7) -> array of children; base(-1) for step 0
  for(const c of roster){
    const state = await getChildState(c.id);
    const steps = state.moonSteps || 0;
    const idx = Math.min(steps, 7) - 1; // -1 means still at base (0 steps)
    if(!markersByStep[idx]) markersByStep[idx] = [];
    markersByStep[idx].push({child:c, steps});
  }

  const positions = {};
  // base row: children with 0 steps, spread along the extended grass area at the bottom
  const baseKids = markersByStep[-1] || [];
  baseKids.forEach((item, i)=>{
    const left = 6 + (i * (88 / Math.max(baseKids.length,1)));
    positions[item.child.id] = {left, top:95, steps:item.steps, child:item.child};
  });
  // kids on the path (steps 1-7), offset slightly above/around the painted number
  for(let s=0; s<7; s++){
    const kids = markersByStep[s] || [];
    kids.forEach((item, i)=>{
      const base = MOON_PATH[s];
      const offset = (i - (kids.length-1)/2) * 7;
      positions[item.child.id] = {left: base.left + offset, top: base.top - 9, steps:item.steps, child:item.child};
    });
  }

  diffRenderMarkers(el, positions, (child, steps) => {
    const badge = steps >= 7 ? `<span class="badge">🌙</span>` : '';
    return `<div style="position:relative;">${avatarHtml(child)}${badge}</div><div class="lbl">${displayName(child)}</div>`;
  });
}

async function renderMercuryBoard(){
  const el = document.getElementById('mercury-board');
  const eligible = [];
  for(const c of roster){
    const state = await getChildState(c.id);
    if((state.moonSteps || 0) >= 7) eligible.push({child:c, steps: state.mercurySteps || 0});
  }
  if(!eligible.length){ el.innerHTML = '<div class="empty">עדיין אין ילדים שהגיעו לירח — המסע לכוכב המילים יתחיל כשיגיעו.</div>'; return; }

  let markersByStep = {};
  eligible.forEach(item=>{
    const idx = Math.min(item.steps, 7) - 1;
    if(!markersByStep[idx]) markersByStep[idx] = [];
    markersByStep[idx].push(item);
  });

  const positions = {};
  const H_SPACING = 13;      // horizontal gap between ships sharing a row, at full (unshrunk) size
  const DIGIT_CLEARANCE = 9; // horizontal gap from the digit's own position before the first ship
  // keep every ship AND its name label on-canvas no matter how crowded a cluster gets (the label
  // is wider than the ship, so the margin has to cover half the label, not just half the ship)
  const SAFE_MIN = 7, SAFE_MAX = 93;
  // which side of its digit each step's ships spread toward — picked by hand for this artwork,
  // because neighbouring digits are only ~10-17 points apart and a ship row is ~17 tall, so the
  // side that happens to have more room on the canvas isn't always the side that's clear of the
  // next step's ships (e.g. steps 6 and 7 collided when both used "more open room")
  const STEP_SIDE = ['left', 'right', 'left', 'right', 'left', 'left', 'right'];

  // Every cluster is a SINGLE row — no vertical stacking at all. Consecutive path points are only
  // ~10-17 points apart, so any row stacked above/below a digit risks landing on a DIFFERENT
  // step's digit instead (this is what caused ships to appear on the wrong number before). Each
  // child keeps a stable column index for as long as they're in a cluster (assigned once, reused
  // every render — a sibling joining or leaving never moves anyone else's column). If a cluster
  // gets too crowded to fit at full size within the safe area, every ship in THAT cluster shrinks
  // together (same scale) so they still end up spaced apart rather than overlapping or running
  // off-canvas — existing members' column order, and therefore their relative position, never
  // changes because of this, only the uniform scale does.
  function placeCluster(items, anchorLeft, anchorTop, clusterKey, mode){
    const occupiedCols = new Set();
    items.forEach(item=>{
      const slot = mercurySlots[item.child.id];
      if(slot && slot.cluster === clusterKey) occupiedCols.add(slot.col);
    });
    items.forEach(item=>{
      let slot = mercurySlots[item.child.id];
      if(!slot || slot.cluster !== clusterKey){
        let col = 0;
        while(occupiedCols.has(col)) col++;
        slot = { cluster:clusterKey, col };
        mercurySlots[item.child.id] = slot;
        occupiedCols.add(col);
      }
    });
    const cols = items.map(it => mercurySlots[it.child.id].col);
    const maxCol = cols.length ? Math.max(...cols) : 0;
    let scale = 1;
    if(mode === 'bidirectional'){
      const maxRank = Math.ceil((maxCol+1)/2);
      const spanEachSide = Math.min(anchorLeft - SAFE_MIN, SAFE_MAX - anchorLeft);
      const needed = maxRank * H_SPACING;
      if(needed > spanEachSide) scale = spanEachSide / needed;
    } else { // one-directional, away from a digit
      const spanAvailable = mode === 'left' ? (anchorLeft - SAFE_MIN) : (SAFE_MAX - anchorLeft);
      const needed = DIGIT_CLEARANCE + maxCol * H_SPACING;
      if(needed > spanAvailable) scale = spanAvailable / needed;
    }
    items.forEach(item=>{
      const col = mercurySlots[item.child.id].col;
      let left;
      if(mode === 'bidirectional'){
        const side = col % 2 === 0 ? 1 : -1;
        const rank = Math.ceil((col+1)/2);
        left = anchorLeft + side * rank * H_SPACING * scale;
      } else {
        const dir = mode === 'left' ? -1 : 1;
        left = anchorLeft + dir * (DIGIT_CLEARANCE + col * H_SPACING) * scale;
      }
      left = Math.max(SAFE_MIN, Math.min(SAFE_MAX, left));
      // a ship + its label is up to ~19% of the board tall, so nothing may sit closer than ~10%
      // to the top edge (step 7's digit is at 9%) or it pokes out of the board
      positions[item.child.id] = {left, top:Math.max(anchorTop, 11), steps:item.steps, child:item.child, scale};
    });
  }

  const baseKids = markersByStep[-1] || [];
  if(baseKids.length) placeCluster(baseKids, 50, 91, 'base', 'bidirectional');

  for(let s=0; s<7; s++){
    const kids = markersByStep[s] || [];
    if(!kids.length) continue;
    const base = MERCURY_PATH[s];
    placeCluster(kids, base.left, base.top, s, STEP_SIDE[s]);
  }

  const markerWidthPx = Math.round(el.clientWidth * 0.10);
  diffRenderMarkers(el, positions, (child, steps, widthPx) => {
    const badge = steps >= 7 ? `<span class="badge">🪐</span>` : '';
    const ship = shipFor(child.id);
    // most ship artwork is landscape, but a couple (the rockets) are tall/narrow — scaled to the
    // same WIDTH as the others they'd end up almost twice as tall, blowing out the row spacing
    // math above. Cap height too so every marker has a similar, predictable footprint.
    const maxHeightPx = Math.round(widthPx * 1.3);
    const icon = ship ? `<img class="ship-icon" src="${ship}" style="max-width:${widthPx}px; max-height:${maxHeightPx}px; width:auto; height:auto;">` : avatarHtml(child);
    return `<div style="position:relative; width:${widthPx}px; display:flex; justify-content:center;">${icon}${badge}</div><div class="lbl">${displayName(child)}</div>`;
  }, markerWidthPx);
}

