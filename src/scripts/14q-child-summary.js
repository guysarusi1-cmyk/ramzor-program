
// ---------- A CHILD'S SUMMARY ON THE KIDS' TV (chosen in "מה המסך מציג כרגע?") ----------
// The instructor picks one child; the TV jumps to a short show of where this child is in every gold program the child takes
// part in (stars, the moon journey or the journey to the word planet, my temple = the wall): a dramatic opening, 4 seconds for
// each program, then one summary screen — 20 seconds in all, or until another child is chosen. Not part of the rotation.
const SUMMARY_MS = 20000, SUMMARY_PAGE_MS = 4000, SUMMARY_OPEN_MS = 1600;
let summaryTimers = [], summaryChild = null;

// the programs of one child, in order; a program the child does not take part in is left out
function summaryPrograms(state){
  const out = [{ kind:'star', now:state.stars || 0 }];
  const moon = state.moonSteps || 0;
  if(moon < CELEBRATION_TRACK_STEPS) out.push({ kind:'moon', now:moon });
  else out.push({ kind:'mercury', now:state.mercurySteps || 0 });
  if((state.bricks || 0) > 0) out.push({ kind:'bricks', now:state.bricks, why:state.brickWhy });
  return out;
}
// a short word for the grown-ups next to the picture (the children see the pictures), happy even for a small start
function summaryWord(p){
  if(p.kind === 'star') return p.now ? 'הכוכבים שלי' : 'הכוכב הראשון מחכה!';
  if(p.kind === 'moon') return p.now ? 'בדרך אל הירח' : 'התחלת את המסע!';
  if(p.kind === 'mercury') return p.now ? 'בדרך אל כוכב המילים' : 'הגעת לירח! עכשיו לכוכב המילים';
  return 'המקדש שלי';
}
function summaryPageHtml(p, child){
  if(p.kind === 'bricks') return `<div class="sum-page sum-wall">${bigWallHtml(child, p.now, null, '', p.why)}</div>`;
  if(p.kind === 'star'){
    const shown = Math.min(p.now, CELEBRATION_STAR_SLOTS);
    let slots = ''; for(let i = 1; i <= CELEBRATION_STAR_SLOTS; i++) slots += `<span class="cel-star${i <= shown ? ' filled' : ''}">★</span>`;
    return `<div class="sum-page"><div class="cel-stars sum-stars">${slots}</div>${p.now > CELEBRATION_STAR_SLOTS ? `<div class="cel-extra">×${p.now}</div>` : ''}</div>`;
  }
  return `<div class="sum-page sum-track">${celebrationBody(p.kind, child, Math.max(1, p.now))}</div>`;
}
// the last screen: the child's character in the middle, the programs around it as small pictures
function summaryStationHtml(p, child){
  let pic;
  if(p.kind === 'star') pic = `<span class="sum-st-star">★</span><span class="sum-st-count">${'★'.repeat(Math.min(p.now, 5))}${p.now > 5 ? '…' : ''}</span>`;
  else if(p.kind === 'moon') pic = `<span class="sum-st-big">🌙</span><span class="sum-st-dots">${Array.from({ length:CELEBRATION_TRACK_STEPS }, (_, i) => `<i class="${i < p.now ? 'on' : ''}"></i>`).join('')}</span>`;
  else if(p.kind === 'mercury') pic = `<span class="sum-st-big sum-st-planet">${mercuryPlanetSvg()}</span><span class="sum-st-dots">${Array.from({ length:CELEBRATION_TRACK_STEPS }, (_, i) => `<i class="${i < p.now ? 'on' : ''}"></i>`).join('')}</span>`;
  else pic = `<span class="sum-st-wall">${miniWallHtml(child, p.now)}</span>`;
  return `<div class="sum-station sum-${p.kind}">${pic}</div>`;
}
function summaryFinalHtml(child, progs){
  const k = characterFor(child.id);
  return `<div class="sum-final"><div class="sum-center">${k ? `<div class="sum-char" style="border-color:${CHARACTERS[k].ring}">${charImgHtml(k)}</div>` : `<div class="sum-char">${avatarHtml(child)}</div>`}<div class="sum-name">${escapeHtml(displayName(child))}</div></div>
    <div class="sum-stations n${progs.length}">${progs.map(p => summaryStationHtml(p, child)).join('')}</div></div>`;
}
function summaryClear(){ summaryTimers.forEach(clearTimeout); summaryTimers = []; }
function closeChildSummary(){
  summaryClear(); summaryChild = null;
  const el = document.getElementById('tv-summary'); if(el){ el.hidden = true; el.innerHTML = ''; }
  if(typeof tvRelease === 'function') tvRelease();
}
async function showChildSummary(childId){
  const child = roster.find(c => c.id === childId); if(!child) return;
  summaryClear(); summaryChild = childId;
  if(typeof tvHold === 'function') tvHold();
  const view = document.getElementById('view-display');
  let el = document.getElementById('tv-summary');
  if(!el){ el = document.createElement('div'); el.id = 'tv-summary'; view.appendChild(el); }
  const state = await getChildState(childId); if(summaryChild !== childId) return;
  const progs = summaryPrograms(state), k = characterFor(child.id);
  el.hidden = false;
  // the dramatic opening: the character flies in with sparkles and a fanfare
  el.innerHTML = `<div class="sum-stage sum-open"><div class="cel-sparkles">${typeof celebrationSparkles === 'function' ? celebrationSparkles(18) : ''}</div>
    <div class="sum-hero">${k ? `<div class="sum-char" style="border-color:${CHARACTERS[k].ring}">${charImgHtml(k)}</div>` : `<div class="sum-char">${avatarHtml(child)}</div>`}</div>
    <div class="sum-name">${escapeHtml(displayName(child))}</div></div>`;
  playTones(SOUND_FANFARE);
  let at = SUMMARY_OPEN_MS;
  progs.forEach(p => {
    summaryTimers.push(setTimeout(() => {
      if(summaryChild !== childId) return;
      el.innerHTML = `<div class="sum-stage"><div class="sum-head">${nameTagHtml(child)}</div>${summaryPageHtml(p, child)}<div class="sum-word">${escapeHtml(summaryWord(p))}</div></div>`;
      playTones(p.kind === 'star' ? SOUND_STAR : p.kind === 'bricks' ? SOUND_BRICK : SOUND_HOP);
    }, at));
    at += SUMMARY_PAGE_MS;
  });
  summaryTimers.push(setTimeout(() => {
    if(summaryChild !== childId) return;
    el.innerHTML = `<div class="sum-stage">${summaryFinalHtml(child, progs)}</div>`;
    playTones(SOUND_STAR);
  }, at));
  summaryTimers.push(setTimeout(() => { if(summaryChild === childId) closeChildSummary(); }, SUMMARY_MS));
}

// ---- staff side: a folded list of the children under "מה המסך מציג כרגע?"
function renderSummaryPicker(){
  const box = document.getElementById('tv-summary-list'); if(!box) return;
  box.innerHTML = roster.map(c => `<button type="button" class="tv-sum-kid" data-sum="${c.id}">${nameTagHtml(c)}</button>`).join('') || '<div class="empty">אין ילדים ברשימה</div>';
  box.querySelectorAll('[data-sum]').forEach(b => b.addEventListener('click', () => {
    if(sendTvCommand('summary', { child:b.dataset.sum })) toast(`הסיכום של ${displayName(roster.find(c => c.id === b.dataset.sum))} מוצג עכשיו במסך`);
    else toast('אין חיבור למסך בחדר');
  }));
}
document.getElementById('tv-summary-fold').addEventListener('toggle', e => { if(e.currentTarget.open) renderSummaryPicker(); });
