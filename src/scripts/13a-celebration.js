
// ---------- CELEBRATION: the big moment on the kids' TV ----------
// When a child gets a star or moves a step forward, the TV first shows a full-screen moment that is
// about THAT child: who it is (avatar or ship + name), what changes (the previous state), the action
// (the new star lands / the ship hops one step) and the new state. Almost no text — the child sees
// themselves progress. Afterwards the normal board is shown and the ship glides to its new place.
let CELEBRATION_MS = 4800;          // (the automatic checks shorten it)
const CELEBRATION_STAR_SLOTS = 12;      // same number of star dots a child has on the star board
const CELEBRATION_TRACK_STEPS = 7;      // moon / word-planet journeys both have 7 steps

// one celebration at a time, even if several events arrive together (e.g. a gift moves two children)
let celebrationQueue = Promise.resolve();
function queueCelebration(job){
  celebrationQueue = celebrationQueue.then(job).catch(err => console.error(err));
  return celebrationQueue;
}
const waitMs = ms => new Promise(r => setTimeout(r, ms));

// ---- sound: short happy sounds made with the browser's own synthesizer (no audio files)
// TVs and browsers only allow sound after one touch/click, so there is a small button for that.
let celebrationAudio = null;
function soundPreference(){ try { return localStorage.getItem('tv-sound') !== 'off'; } catch(e){ return true; } }
function unlockTvSound(){
  try {
    celebrationAudio = celebrationAudio || new (window.AudioContext || window.webkitAudioContext)();
    if(celebrationAudio.state === 'suspended') celebrationAudio.resume();
  } catch(e){ celebrationAudio = null; }
  updateTvSoundButton();
}
function tvSoundReady(){ return !!celebrationAudio && celebrationAudio.state === 'running' && soundPreference(); }
function updateTvSoundButton(){
  const btn = document.getElementById('tv-sound-btn');
  if(btn) btn.hidden = tvSoundReady() || !soundPreference();
}
function playTones(tones){
  if(!tvSoundReady()) return;
  const t0 = celebrationAudio.currentTime;
  tones.forEach(([freq, startSec, lenSec, type, vol]) => {
    const osc = celebrationAudio.createOscillator();
    const gain = celebrationAudio.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + startSec);
    gain.gain.exponentialRampToValueAtTime(vol || 0.16, t0 + startSec + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + startSec + lenSec);
    osc.connect(gain); gain.connect(celebrationAudio.destination);
    osc.start(t0 + startSec); osc.stop(t0 + startSec + lenSec + 0.05);
  });
}
const SOUND_STAR     = [[784, 0, .25], [988, .12, .25], [1319, .24, .45]];                                  // bright "ding-ding-ding"
const SOUND_HOP      = [[392, 0, .14], [523, .1, .14], [659, .2, .3]];                                      // quick hop up
const SOUND_BRICK    = [[110, 0, .35, 'triangle', .3], [82, 0, .4, 'sine', .3], [659, .18, .25, 'triangle', .12], [988, .3, .35, 'triangle', .12]];     // a stone thud, then a small chime
const SOUND_FANFARE  = [[523, 0, .2], [659, .15, .2], [784, .3, .2], [1047, .45, .6, 'triangle', .2]];      // reaching 7
document.getElementById('tv-sound-btn').addEventListener('click', unlockTvSound);
// the first press of ANY kind on the TV (a remote's button, a touch, a click) turns the sound on
['keydown', 'pointerdown', 'touchstart', 'click'].forEach(type => document.addEventListener(type, () => { if(!tvSoundReady() && document.getElementById('view-display').classList.contains('active')) unlockTvSound(); }, { passive:true }));

// ---- the moment itself
function celebrationSparkles(n){
  let html = '';
  for(let i = 0; i < n; i++){
    const x = Math.round(Math.random() * 100), y = Math.round(Math.random() * 100);
    const delay = (Math.random() * 2.4).toFixed(2), size = (1.2 + Math.random() * 2.2).toFixed(1);
    html += `<span class="cel-sparkle" style="left:${x}%; top:${y}%; animation-delay:${delay}s; font-size:${size}vmin;">✦</span>`;
  }
  return html;
}

function celebrationBody(kind, child, now, extra){
  if(kind === 'bricks') return bigWallHtml(child, now, now, extra);      // (finishing the wall adds the message inside the wall)
  const milestone = kind !== 'star' && now >= CELEBRATION_TRACK_STEPS;
  const name = `<div class="cel-name">${escapeHtml(displayName(child))}</div>`;
  if(kind === 'star'){
    const shown = Math.min(now, CELEBRATION_STAR_SLOTS);
    let slots = '';
    for(let i = 1; i <= CELEBRATION_STAR_SLOTS; i++){
      const cls = i < shown ? 'filled' : (i === shown ? 'filled cel-new' : '');
      slots += `<span class="cel-star ${cls}">★</span>`;
    }
    const extra = now > CELEBRATION_STAR_SLOTS ? `<div class="cel-extra">×${now}</div>` : '';
    return `<div class="cel-who">${avatarHtml(child)}</div>${name}<div class="cel-stars">${slots}</div>${extra}`;
  }
  // moon / word-planet journey: a track of 7 steps, the traveller starts on the previous step
  const ship = kind === 'mercury' ? shipFor(child.id) : null;
  const traveller = ship ? `<img class="cel-ship" src="${ship}" alt="">` : avatarHtml(child);
  let nodes = '';
  for(let i = 0; i <= CELEBRATION_TRACK_STEPS; i++){
    const cls = i <= now - 1 ? 'passed' : (i === now ? 'cel-target' : '');
    nodes += `<span class="cel-node ${cls}" style="left:${(i / CELEBRATION_TRACK_STEPS * 100).toFixed(2)}%;"></span>`;
  }
  const goal = kind === 'mercury' ? mercuryPlanetSvg() : '🌙';
  return `${name}
    <div class="cel-track${kind === 'mercury' ? ' mercury' : ' moon'}" data-from="${now - 1}" data-to="${now}">
      <span class="cel-line"></span>${nodes}
      <span class="cel-goal">${goal}</span>
      <span class="cel-traveller" style="left:${((now - 1) / CELEBRATION_TRACK_STEPS * 100).toFixed(2)}%;">${traveller}</span>
    </div>${milestone ? `<div class="cel-extra cel-milestone">${goal}</div>` : ''}`;
}

async function playCelebration(kind, child, now, extra){
  const host = document.getElementById('celebration');
  if(!host || !child) return;
  const wallDone = kind === 'bricks' && now >= WALL_BRICKS;
  const milestone = (kind === 'moon' || kind === 'mercury') && now >= CELEBRATION_TRACK_STEPS;
  host.innerHTML = `<div class="cel-glow"></div>${celebrationSparkles(milestone || wallDone ? 34 : 18)}<div class="cel-inner${kind === 'bricks' ? ' cel-wall' : ''}">${celebrationBody(kind, child, now, extra)}</div>`;
  host.classList.remove('leaving');
  host.classList.add('show');
  host.setAttribute('aria-hidden', 'false');
  updateTvSoundButton();
  const scene = host.querySelector('.wall-scene'); if(scene) fitBoardFont(scene);        // (measured once it is on screen) 1em = 1% of the wall's width

  if(kind === 'star'){
    setTimeout(() => playTones(SOUND_STAR), 1200);
  } else if(kind === 'bricks'){
    setTimeout(() => playTones(SOUND_BRICK), 1700);                    // the brick lands
    if(wallDone) setTimeout(() => playTones(SOUND_FANFARE), 2900);
  } else {
    // one frame later, so the traveller visibly moves from the previous step to the new one
    setTimeout(() => {
      const track = host.querySelector('.cel-track');
      const tr = host.querySelector('.cel-traveller');
      if(track && tr){ tr.style.left = (now / CELEBRATION_TRACK_STEPS * 100).toFixed(2) + '%'; tr.classList.add('hop'); }
      playTones(milestone ? SOUND_FANFARE : SOUND_HOP);
    }, 1200);
  }
  // a wall brick takes a little longer (it drops in); finishing the wall longer still (the whole message must be readable)
  await waitMs(kind === 'bricks' && CELEBRATION_MS > 1000 ? (wallDone ? 9500 : 5600) : CELEBRATION_MS);
  host.classList.add('leaving');
  await waitMs(450);
  host.classList.remove('show', 'leaving');
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = '';
}
