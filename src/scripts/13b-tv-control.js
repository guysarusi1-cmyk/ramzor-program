
// ---------- REMOTE CONTROL OF THE KIDS' TV (from the staff phone) ----------
// Staff and TV talk over one Supabase realtime "broadcast" channel (nothing is stored in the database):
//   staff -> TV   event "cmd":    { cmd: 'show' | 'pause' | 'resume' | 'next' | 'prev' | 'hello', slide? }
//   TV -> staff   event "status": { slide, label, held }
// A board chosen by staff stays on screen for TV_HOLD_MAX_MS and then the normal rotation continues by
// itself, so the room screen is never left stuck on one board if someone forgets.
const TV_CHANNEL = 'tv_control';
const TV_HOLD_MAX_MS = 5 * 60 * 1000;
const IS_TV_PREVIEW = /[?&]preview\b/.test(location.search);   // the small live copy shown on the staff screen

if(IS_TV_PREVIEW) document.body.classList.add('tv-preview');   // hides the exit and sound buttons in the small copy

let tvHeld = false;
let tvHoldTimer = null;
let tvControlChannel = null;

function visibleSlideIds(){ return SLIDES.filter(s => !s.hidden).map(s => s.id); }
function tvStatusPayload(){ return { slide: carouselIndex, label: SLIDES[carouselIndex].label, held: tvHeld }; }

// ---- TV side
function tvHold(){
  tvHeld = true;
  pauseRotation();
  clearTimeout(tvHoldTimer);
  tvHoldTimer = setTimeout(tvRelease, TV_HOLD_MAX_MS);
}
function tvRelease(){
  tvHeld = false;
  clearTimeout(tvHoldTimer);
  resumeRotation();
  announceTvStatus();
}
function tvStep(delta){
  const ids = visibleSlideIds();
  const at = ids.indexOf(carouselIndex);
  const next = ids[(Math.max(at, 0) + delta + ids.length) % ids.length];
  return showSlide(next);
}
function handleTvCommand(c){
  if(!c || !document.getElementById('view-display').classList.contains('active')) return;
  if(IS_TV_PREVIEW) return;                     // the preview only mirrors, it never obeys
  if(c.cmd === 'hello') announceTvStatus();
  else if(c.cmd === 'pause'){ tvHold(); announceTvStatus(); }
  else if(c.cmd === 'resume') tvRelease();
  else if(c.cmd === 'show' && visibleSlideIds().includes(c.slide)){ tvHold(); showSlide(c.slide); }
  else if(c.cmd === 'next'){ tvHold(); tvStep(1); }
  else if(c.cmd === 'prev'){ tvHold(); tvStep(-1); }
}
function announceTvStatus(){
  if(tvControlChannel && !IS_TV_PREVIEW) tvControlChannel.send({ type:'broadcast', event:'status', payload: tvStatusPayload() });
}
function startTvControlListener(){
  if(tvControlChannel) return;
  tvControlChannel = sb.channel(TV_CHANNEL, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'cmd' }, ({ payload }) => handleTvCommand(payload))
    .on('broadcast', { event: 'status' }, ({ payload }) => {
      // the preview copy follows whatever the real TV shows
      if(IS_TV_PREVIEW && payload && payload.slide !== carouselIndex) showSlide(payload.slide);
    })
    .subscribe(status => {
      if(status === 'SUBSCRIBED' && IS_TV_PREVIEW) tvControlChannel.send({ type:'broadcast', event:'cmd', payload:{ cmd:'hello' } });
      if(status === 'SUBSCRIBED') announceTvStatus();
    });
}
function stopTvControlListener(){
  clearTimeout(tvHoldTimer);
  tvHeld = false;
  if(tvControlChannel){ sb.removeChannel(tvControlChannel); tvControlChannel = null; }
}

// ---- staff side: the "המסך בחדר" card on the kids-screen control area
let remoteChannel = null;
let remoteStatus = null;
let remoteHelloTimer = null;
function sendTvCommand(cmd, extra){
  if(!remoteChannel) return false;
  remoteChannel.send({ type:'broadcast', event:'cmd', payload: Object.assign({ cmd }, extra || {}) });
  return true;
}
function renderTvRemote(){
  const statusEl = document.getElementById('tv-remote-status');
  const boardsEl = document.getElementById('tv-remote-boards');
  if(!statusEl) return;
  if(!remoteStatus){
    statusEl.textContent = remoteChannel ? 'מחפש את המסך בחדר...' : 'אין חיבור';
    statusEl.className = 'tv-remote-status';
  } else if(remoteStatus === 'none'){
    statusEl.textContent = 'המסך בחדר לא עונה — ייתכן שהוא כבוי או לא פתוח על התצוגה.';
    statusEl.className = 'tv-remote-status off';
  } else {
    statusEl.textContent = `המסך מציג: ${remoteStatus.label} · ${remoteStatus.held ? 'מוחזק על הלוח הזה' : 'מתחלף אוטומטית'}`;
    statusEl.className = 'tv-remote-status on';
  }
  boardsEl.innerHTML = visibleSlideIds().map(id => `<button type="button" class="btn ghost tv-remote-board${remoteStatus && remoteStatus !== 'none' && remoteStatus.slide === id ? ' current' : ''}" data-slide="${id}">${escapeHtml(SLIDES[id].label)}</button>`).join('');
  boardsEl.querySelectorAll('[data-slide]').forEach(b => b.addEventListener('click', () => sendTvCommand('show', { slide: Number(b.dataset.slide) })));
  const holdBtn = document.getElementById('tv-remote-hold');
  const held = remoteStatus && remoteStatus !== 'none' && remoteStatus.held;
  holdBtn.textContent = held ? '▶ המשך סבב אוטומטי' : '⏸ השהיית הסבב';
  holdBtn.dataset.action = held ? 'resume' : 'pause';
}
function tvRemoteGiveUp(){ if(!remoteStatus){ remoteStatus = 'none'; renderTvRemote(); } }
function connectTvRemote(){
  if(remoteChannel) return;
  remoteStatus = null;
  remoteChannel = sb.channel(TV_CHANNEL, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'status' }, ({ payload }) => { clearTimeout(remoteHelloTimer); remoteStatus = payload; renderTvRemote(); })
    .subscribe(status => { if(status === 'SUBSCRIBED') sendTvCommand('hello'); });
  // no answer from any TV within a few seconds (or no connection at all) -> say so instead of searching forever
  clearTimeout(remoteHelloTimer);
  remoteHelloTimer = setTimeout(tvRemoteGiveUp, 5000);
  renderTvRemote();
}
function disconnectTvRemote(){
  clearTimeout(remoteHelloTimer);
  if(remoteChannel){ sb.removeChannel(remoteChannel); remoteChannel = null; }
  remoteStatus = null;
  const box = document.getElementById('tv-preview-box');
  if(box){ box.hidden = true; box.innerHTML = ''; }
  const tgl = document.getElementById('tv-preview-toggle');
  if(tgl) tgl.textContent = 'הצגת תצוגה מקדימה חיה';
}
document.getElementById('tv-remote-hold').addEventListener('click', e => sendTvCommand(e.currentTarget.dataset.action || 'pause'));
document.getElementById('tv-remote-prev').addEventListener('click', () => sendTvCommand('prev'));
document.getElementById('tv-remote-next').addEventListener('click', () => sendTvCommand('next'));
document.getElementById('tv-preview-toggle').addEventListener('click', e => {
  const box = document.getElementById('tv-preview-box');
  if(box.hidden){
    box.innerHTML = `<iframe class="tv-preview-frame" src="${location.pathname}?preview#tv" title="תצוגה מקדימה של מסך הילדים"></iframe>`;
    box.hidden = false;
    e.currentTarget.textContent = 'הסתרת התצוגה המקדימה';
  } else {
    box.hidden = true; box.innerHTML = '';
    e.currentTarget.textContent = 'הצגת תצוגה מקדימה חיה';
  }
});
// connected only while the kids-screen control area is open
new MutationObserver(() => {
  const open = document.getElementById('view-kids-quick').classList.contains('active');
  if(open) connectTvRemote(); else disconnectTvRemote();
}).observe(document.getElementById('view-kids-quick'), { attributes:true, attributeFilter:['class'] });
