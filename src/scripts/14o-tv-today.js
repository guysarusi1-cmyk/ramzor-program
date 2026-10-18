
// ---------- THE KIDS' TV, from the database (config "portalTv"): who is on shift today, today's timetable, the night and morning screens ----------
// Read without signing in (scheduling-v15.sql: tv_shifts_today, tv_timetable_today). The ahmash control's changes of today are already applied.
var tvShifts = null, tvTimetable = null, tvTodayAt = 0;          // (var: the TV screens of 14d-portal-tv.js ask for them while the page is still starting)
async function loadTvToday(force){
  if(!force && Date.now() - tvTodayAt < 60 * 1000) return;
  tvTodayAt = Date.now();
  try { const r = await sb.rpc('tv_shifts_today'); if(!r.error) tvShifts = r.data; } catch(e){ /* keep the last one */ }
  try { const r = await sb.rpc('tv_timetable_today'); if(!r.error) tvTimetable = r.data; } catch(e){ /* keep the last one */ }
}
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

// the three pictures of the shifts, top to bottom: sunrise, sun, moon (no words: the children see the time of day)
const TV_SHIFT_ART = {
  M:`<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="tvsSkyM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3a7"/><stop offset=".6" stop-color="#ffd59e"/><stop offset="1" stop-color="#fff1c9"/></linearGradient></defs>
      <rect x="4" y="4" width="112" height="112" rx="26" fill="url(#tvsSkyM)"/><g stroke="#ff9a3c" stroke-width="5" stroke-linecap="round"><path d="M60 30v-12M34 40l-8-8M86 40l8-8M22 64h-10M98 64h10"/></g>
      <path d="M28 76a32 32 0 0 1 64 0z" fill="#ffb02e"/><path d="M8 76h104v36a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8z" fill="#7cc576"/><path d="M8 76c22-8 40 6 58-2s30 4 46 0v6H8z" fill="#5fae5c"/></svg>`,
  A:`<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="4" y="4" width="112" height="112" rx="26" fill="#8fd3ff"/>
      <g stroke="#ffc928" stroke-width="6" stroke-linecap="round"><path d="M60 14v12M60 94v12M14 60h12M94 60h12M27 27l8 8M85 85l8 8M93 27l-8 8M35 85l-8 8"/></g>
      <circle cx="60" cy="60" r="24" fill="#ffd93b"/><circle cx="52" cy="56" r="3" fill="#7a4a00"/><circle cx="68" cy="56" r="3" fill="#7a4a00"/><path d="M50 66q10 9 20 0" stroke="#7a4a00" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  N:`<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="4" y="4" width="112" height="112" rx="26" fill="#22306b"/>
      <path d="M74 26a34 34 0 1 0 20 58 28 28 0 1 1-20-58z" fill="#ffe9a8"/><g fill="#fff6c9"><circle cx="30" cy="30" r="3"/><circle cx="92" cy="26" r="2.4"/><circle cx="24" cy="78" r="2.2"/><circle cx="96" cy="96" r="3"/>
      <path d="M40 52l2.4 5 5 .7-3.7 3.5.9 5-4.6-2.4-4.6 2.4.9-5-3.7-3.5 5-.7z"/></g></svg>`
};
// which of today's shifts is now, and which are over (the night is "now" from 22:00 until the morning)
function tvShiftPhase(code){
  const n = nowMin();
  const cur = n >= hm('22:00') || n < hm('07:00') ? 'N' : n >= hm('14:00') ? 'A' : 'M';
  if(code === cur) return 'now';
  if(code === 'M' && (cur === 'A' || (cur === 'N' && n >= hm('22:00')))) return 'past';
  if(code === 'A' && cur === 'N' && n >= hm('22:00')) return 'past';
  return '';
}
function renderShiftsLive(){
  const el = document.getElementById('tv-instructors');
  if(!tvShifts){ el.innerHTML = '<div class="empty">רק רגע...</div>'; return; }
  const g = shiftPeople(tvShifts), shown = code => g[code].filter(p => !p.removed);
  const most = Math.max(1, ...['M', 'A', 'N'].map(c => shown(c).length));
  el.className = 'tv-instructors tvs';
  el.style.setProperty('--tvs-size', most <= 5 ? '15vh' : most <= 7 ? '12.5vh' : most <= 9 ? '10.5vh' : '9vh');
  el.innerHTML = ['M', 'A', 'N'].map(code => `<div class="tvs-band ${tvShiftPhase(code)}"><div class="tvs-art">${TV_SHIFT_ART[code]}</div>
      <div class="tvs-people">${shown(code).map(p => `<div class="tvs-person">${p.photo ? `<img class="tvs-photo" src="${p.photo}" alt="">` : `<div class="tvs-photo tvs-face">${personArt(p)}</div>`}<div class="tvs-name">${escapeHtml(p.label)}</div></div>`).join('') || '<div class="tvs-none">·</div>'}</div></div>`).join('');
}
function renderTimetableLive(){
  const el = document.getElementById('tv-timetable'), list = (tvTimetable && tvTimetable.items) || [];
  if(!list.length){ el.innerHTML = '<div class="empty">אין לו"ז להיום</div>'; return; }
  const n = nowMin(); let current = -1; list.forEach((a, i) => { if(hm(a.t) <= n) current = i; });
  el.className = 'tv-timetable tvt2';
  el.style.setProperty('--tvt-cols', list.length > 8 ? 6 : list.length > 4 ? 4 : list.length);
  el.innerHTML = `${tvTimetable.title ? `<div class="tvt2-title">${escapeHtml(tvTimetable.title)}</div>` : ''}<div class="tvt2-grid">${list.map((a, i) => `<div class="tvt2-item${i === current ? ' now' : i < current ? ' past' : ''}">
      <div class="tvt2-time">${escapeHtml(a.t)}</div><div class="tvt2-icon">${ttArt(a.i)}</div><div class="tvt2-name">${escapeHtml(a.n)}</div></div>`).join('')}</div>`;
}
// the picture of an activity (the drawings of 14p-timetable-art.js when there is one, else the emoji)
const ttArt = id => (typeof TT_ART !== 'undefined' && TT_ART[id]) || `<span class="tvt2-emoji">${ttIcon(id)[2]}</span>`;

// ---- the quiet hours: after bedtime a "good night" screen until 05:00, then the morning routine until 07:30
function tvQuietNow(){
  const n = nowMin(), bed = ((tvTimetable && tvTimetable.items) || []).filter(a => a.i === 'bedtime').map(a => hm(a.t)).sort((a, b) => b - a)[0];
  if(n >= hm('05:00') && n < hm('07:30')) return 'morning';
  if(n < hm('05:00') || (bed != null && n >= bed + 15)) return 'night';
  return null;
}
const TV_QUIET_HTML = {
  night:`<div class="tvq tvq-night"><div class="tvq-stars" aria-hidden="true">${Array.from({ length:40 }, (_, i) => `<i style="left:${(i * 47) % 100}%; top:${(i * 29) % 100}%; animation-delay:${(i % 7) * -0.6}s"></i>`).join('')}</div>
      <div class="tvq-moon" aria-hidden="true">🌙</div><div class="tvq-title">לילה טוב</div><div class="tvq-row" aria-hidden="true">😴 🧸 ⭐ 💤</div></div>`,
  morning:`<div class="tvq tvq-morning"><div class="tvq-sun" aria-hidden="true">🌞</div><div class="tvq-title">בוקר טוב!</div>
      <div class="tvq-steps"><div><span>💦</span>שוטפים פנים</div><div><span>🦷</span>מצחצחים שיניים</div><div><span>👕</span>מחליפים בגדים</div><div><span>👟</span>נועלים נעליים</div></div></div>`
};
let tvQuietTimer = null, tvQuietShown = null;
function tvQuietTick(){
  if(!PORTAL_TV_LIVE) return;
  const view = document.getElementById('view-display'); if(!view) return;
  let el = document.getElementById('tv-quiet');
  if(!el){ el = document.createElement('div'); el.id = 'tv-quiet'; el.hidden = true; view.appendChild(el); }
  const mode = tvQuietNow();
  if(mode !== tvQuietShown){ tvQuietShown = mode; el.innerHTML = mode ? TV_QUIET_HTML[mode] : ''; el.hidden = !mode; }
}
function startTvQuiet(){ stopTvQuiet(); if(!PORTAL_TV_LIVE) return; loadTvToday(true).then(tvQuietTick); tvQuietTimer = setInterval(() => { loadTvToday().then(tvQuietTick); }, 60 * 1000); }
function stopTvQuiet(){ clearInterval(tvQuietTimer); tvQuietTimer = null; }
