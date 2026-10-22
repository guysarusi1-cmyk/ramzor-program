// ---------- MERCURY: THE SPACE JOURNEY BY SKILLS (stage 4: the frame + the moon route) ----------
// Every child travels their own route of planets (one skill each; the therapist sets the route). The moon route: 7 steps up the mountain ->
// the child chooses a ship -> 7 steps to the moon -> a symbol on arrival -> an adventure of 10 steps on the moon -> on to the next planet.
// At most one step a day (the day starts at 05:00). After an adventure the next planet waits for the therapist's approval; meanwhile more
// adventures, never a failure. The look of the journey is decided in a design session; here: the working frame with simple pictures.
// A child already on the old moon / word-planet journey stays there until the admin places them (journey_place). (scheduling-v32.sql; decisions 19-24, 29, 30, 40-42, 50, 62)
const JOURNEY_LEN = { climb:7, fly:7, adventure:10, extra:10 };
const journeyToday = () => new Date(Date.now() - 5 * 3600e3).toLocaleDateString('en-CA', { timeZone:'Asia/Jerusalem' });
let journeyPlanetsCache = null;
async function journeyPlanets(){
  if(journeyPlanetsCache) return journeyPlanetsCache;
  const r = await sb.from('journey_planets').select('id,name,skill,question,art,active');
  if(r.error) return null;
  journeyPlanetsCache = {}; (r.data || []).forEach(p => { journeyPlanetsCache[p.id] = p; });
  return journeyPlanetsCache;
}
const journeyDefault = id => ({ child_id:id, route:['moon', 'mercury'], planet_idx:0, stage:'climb', step:0, ship:null, symbols:[], next_approved:false, last_step_day:null });
// the words of where the child is
function journeyWhere(j, planets){
  const p = planets[j.route[j.planet_idx]] || { name:j.route[j.planet_idx] || '' };
  const n = `${j.step} מתוך ${JOURNEY_LEN[j.stage]}`;
  return j.stage === 'climb' ? `עלייה לראש ההר · ${n}` : j.stage === 'fly' ? `בחללית אל ${p.name} · ${n}` : j.stage === 'adventure' ? `הרפתקה על ${p.name} · ${n}` : `הרפתקאות נוספות על ${p.name} · ${n}`;
}
// is this child on the new journey? (a row, or a child who never started the old one)
async function journeyOf(childId){
  const r = await sb.from('child_journeys').select('*').eq('child_id', childId).maybeSingle();
  if(r.error) return null;                                         // (scheduling-v32.sql not run: the old journey)
  if(r.data) return r.data;
  const s = await getChildState(childId);
  return (s.moonSteps || 0) === 0 && (s.mercurySteps || 0) === 0 ? journeyDefault(childId) : null;
}
// the panel in the Ramzor (where the instructor gives a step). Returns false when the child is still on the old journey.
async function journeyPanel(child, fb, containerId){
  const j = await journeyOf(child.id), planets = j && await journeyPlanets();
  if(!j || !planets) return false;
  const p = planets[j.route[j.planet_idx]] || {}, done = j.last_step_day === journeyToday();
  fb.innerHTML = `<div class="protocol prot-gold journey-panel" style="margin-top:14px;">
      <div class="light-title">🚀 המסע בחלל · ${escapeHtml(displayName(child))}</div>
      <div class="journey-where">${escapeHtml(journeyWhere(j, planets))}</div>
      <div class="journey-dots" aria-hidden="true">${Array.from({ length:JOURNEY_LEN[j.stage] }, (_, i) => `<i class="${i < j.step ? 'on' : ''}"></i>`).join('')}</div>
      ${done ? '<div class="note" style="color:var(--gold);">✅ כבר נרשם היום צעד. הצעד הבא מחר (מ-05:00).</div>'
             : `<div class="proj-criterion">${escapeHtml(p.question || 'היום הילד/ה התקדם/ה?')}</div><button class="gold-btn moon-main" id="journey-yes">כן, צעד קדימה</button>`}
    </div>`;
  const yes = fb.querySelector('#journey-yes'); if(!yes) return true;
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    const r = await sb.rpc('journey_step', { p_child:child.id });
    if(r.error){ toast(/already today/.test(r.error.message) ? 'כבר נרשם היום צעד לילד/ה הזה' : '⚠ הצעד לא נשמר — בדקו חיבור ונסו שוב'); journeyPanel(child, fb, containerId); return; }
    const res = r.data || {}, nm = displayName(child);
    const words = { ship:`⛰️ ${nm} הגיע/ה לראש ההר! עכשיו בוחרים חללית`, arrive:`🌙 ${nm} הגיע/ה ל${(planets[res.planet] || {}).name || 'כוכב'} וקיבל/ה סמל!`, adventure_done:`✨ ${nm} סיים/ה הרפתקה! ממשיכים בהרפתקאות נוספות`, extra_done:`✨ ${nm} סיים/ה עוד הרפתקה!`, next:`🚀 ${nm} יוצא/ת לכוכב הבא!` };
    logFeedbackEvent(child.id, 'journey', `🚀 ${nm} התקדם/ה צעד במסע · ${res.stage}:${res.step}${res.milestone ? ' · ' + res.milestone : ''}`);
    toast(words[res.milestone] || `🚀 ${nm} התקדם/ה צעד במסע`);
    if(res.milestone) await journeyMilestone(child, res, planets);
    journeyPanel(child, fb, containerId);
  });
  return true;
}
// a milestone: "can the child watch now?"; the ship is chosen by the child and entered by the adult (decisions 30, 41)
async function journeyMilestone(child, res, planets){
  const nm = displayName(child);
  if(res.milestone === 'ship'){
    const ship = await journeyPickShip(child); if(ship){ const r = await sb.rpc('journey_set_ship', { p_child:child.id, p_ship:ship }); toast(r.error ? 'החללית לא נשמרה' : `${nm} בחר/ה חללית!`); }
  }
  const watch = await confirmSheet({ title:`${nm} הגיע/ה לאבן דרך`, text:'הילד/ה יכול/ה לצפות עכשיו במסך הילדים?', okLabel:'כן, להציג במסך', cancelLabel:'אחר כך' });
  if(watch && !sendTvCommand('journey', { child:child.id, milestone:res.milestone, planet:res.planet })) toast('אין חיבור למסך בחדר');
}
function journeyPickShip(child){
  return new Promise(resolve => {
    const keys = typeof SHIP_OPTIONS !== 'undefined' ? Object.keys(SHIP_OPTIONS) : [];
    if(!keys.length){ resolve(null); return; }
    const sh = portalSheet(`<h2>איזו חללית ${escapeHtml(displayName(child))} בוחר/ת?</h2><div class="ship-grid journey-ships">${keys.map(k => `<button type="button" class="ship-option" data-jship="${k}"><img src="${SHIP_OPTIONS[k]}" alt=""></button>`).join('')}</div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>אחר כך</button></div>`);
    sh.querySelectorAll('[data-jship]').forEach(b => b.addEventListener('click', () => { sh.close(); resolve(b.dataset.jship); }));
    sh.querySelector('[data-close]').addEventListener('click', () => resolve(null));
  });
}

// ---- the kids' TV: a step celebrates; a milestone is shown big when the instructor says the child may watch; a board of every child on the journey
async function journeyCelebrate(ev, child){
  const m = (ev.message || '').match(/· (climb|fly|adventure|extra):(\d+)/), stage = m ? m[1] : 'fly', step = m ? +m[2] : 1;
  const j = (await journeyTvRows()).find(r => r.child_id === child.id), planet = (j && j.planet) || 'moon';
  queueCelebration(async () => { await playCelebration(planet === 'moon' ? 'moon' : 'mercury', child, Math.max(1, Math.min(step, typeof CELEBRATION_TRACK_STEPS !== 'undefined' ? CELEBRATION_TRACK_STEPS : 7))); });
}
async function journeyTvRows(){
  try { const r = await sb.rpc('tv_journeys', { p_token:(typeof tvToken === 'function' ? tvToken() : null) }); return r.error ? [] : (r.data || []); } catch(e){ return []; }
}
function journeyShowMilestone(childId, milestone){
  const child = roster.find(c => c.id === childId); if(!child) return;
  const words = { ship:'הגיע/ה לראש ההר!', arrive:'הגיע/ה לכוכב וקיבל/ה סמל!', adventure_done:'סיים/ה הרפתקה!', extra_done:'סיים/ה עוד הרפתקה!', next:'יוצא/ת לכוכב הבא!' };
  const view = document.getElementById('view-display'); let el = document.getElementById('tv-journey-ms');
  if(!el){ el = document.createElement('div'); el.id = 'tv-journey-ms'; view.appendChild(el); }
  const k = typeof characterFor === 'function' && characterFor(child.id);
  el.innerHTML = `<div class="tvj-ms"><div class="tvj-ms-char">${k ? charImgHtml(k) : ''}</div><div class="tvj-ms-name">${escapeHtml(displayName(child))}</div><div class="tvj-ms-words">${words[milestone] || ''}</div></div>`;
  el.hidden = false; if(typeof tvHold === 'function') tvHold();
  if(typeof playTones === 'function' && typeof SOUND_FANFARE !== 'undefined') playTones(SOUND_FANFARE);
  clearTimeout(journeyShowMilestone.t); journeyShowMilestone.t = setTimeout(() => { el.hidden = true; if(typeof tvRelease === 'function') tvRelease(); }, 12000);
}
async function renderJourneyBoard(){
  const el = document.getElementById('tv-journey'); if(!el) return;
  const rows = await journeyTvRows(), planets = await journeyPlanets() || {};
  const kids = rows.map(r => ({ r, c:roster.find(c => c.id === r.child_id) })).filter(x => x.c);
  el.innerHTML = kids.length ? `<div class="tvj-rows">${kids.map(({ r, c }) => { const k = typeof characterFor === 'function' && characterFor(c.id), len = JOURNEY_LEN[r.stage] || 7;
    return `<div class="tvj-row"><span class="tvj-char">${k ? charImgHtml(k) : ''}</span><span class="tvj-name">${escapeHtml(displayName(c))}</span>
      <span class="tvj-track">${Array.from({ length:len }, (_, i) => `<i class="${i < r.step ? 'on' : ''}"></i>`).join('')}</span>
      <span class="tvj-goal">${r.stage === 'climb' ? '⛰️' : (planets[r.planet] || {}).art === 'moon' ? '🌙' : '🪐'}</span></div>`; }).join('')}</div>` : '';
}
if(mercuryOn() && typeof SLIDES !== 'undefined' && SLIDES.length === 13){
  SLIDES.push({ id:13, label:'המסע בחלל', render: renderJourneyBoard, hidden:true });
  const before = refreshJourneyBoards;
  refreshJourneyBoards = async function(){ await before(); try { SLIDES[13].hidden = !(await journeyTvRows()).length; } catch(e){} };
}

// ---- the therapist (and the admin): the route, the approval to move on, and (the admin) where a child really is
async function journeyAdminHtml(id){
  const planets = await journeyPlanets() || {}, j = await journeyOf(id);
  if(!j) return `<div class="pnote">הילד/ה עוד במסע הישן (ירח וכוכב המילים). מנהל המערכת ממקם אותו/ה במסע החדש.</div>`;
  const list = Object.values(planets).filter(p => p.active);
  return `<div class="journey-admin" data-jchild="${pEsc(id)}">
    <div class="pnote">עכשיו: ${pEsc(journeyWhere(j, planets))}</div>
    <div class="pfield"><span>המסלול (הכוכבים לפי הסדר)</span><div class="th-chips" id="ja-route">${j.route.map((pid, i) => `<span class="th-chip" data-rp="${pEsc(pid)}">${i + 1}. ${pEsc((planets[pid] || {}).name || pid)} <button type="button" class="th-chip-x" data-rp-up aria-label="למעלה">▲</button><button type="button" class="th-chip-x" data-rp-x aria-label="הסרה">✕</button></span>`).join('')}</div>
      <div class="th-add-row"><select id="ja-add">${list.filter(p => !j.route.includes(p.id)).map(p => `<option value="${pEsc(p.id)}">${pEsc(p.name)} · ${pEsc(p.skill)}</option>`).join('')}</select><button type="button" class="btn ghost small" id="ja-add-go">הוספה</button></div></div>
    <details class="pfold"><summary><span>כוכב חדש</span></summary><div class="pfold-body">
      <label class="pfield">שם הכוכב<input type="text" id="ja-new-name" maxlength="30"></label><label class="pfield">המיומנות<input type="text" id="ja-new-skill" maxlength="60"></label>
      <label class="pfield">השאלה למדריך בכל צעד<input type="text" id="ja-new-q" maxlength="100" placeholder="למשל: היום הילד/ה ביקש/ה עזרה כשהיה קשה?"></label><button type="button" class="btn ghost" id="ja-new-go">יצירה</button></div></details>
    <label class="th-important"><input type="checkbox" id="ja-approve"${j.next_approved ? ' checked' : ''}> מאשר/ת מעבר לכוכב הבא בסוף ההרפתקה</label>
    <div class="th-actions"><button type="button" class="btn" id="ja-save">שמירת המסלול</button>${srv.profile && srv.profile.admin ? '<button type="button" class="btn ghost" id="ja-place">מיקום במסע (מנהל)</button>' : ''}</div>
  </div>`;
}
function journeyWireAdmin(box, id, redraw){
  const root = box.querySelector('.journey-admin'); if(!root) return;
  const route = () => [...root.querySelectorAll('#ja-route [data-rp]')].map(x => x.dataset.rp);
  root.querySelector('#ja-route').addEventListener('click', e => { const chip = e.target.closest('[data-rp]'); if(!chip) return;
    if(e.target.closest('[data-rp-x]')) chip.remove(); else if(e.target.closest('[data-rp-up]') && chip.previousElementSibling) chip.parentElement.insertBefore(chip, chip.previousElementSibling); });
  root.querySelector('#ja-add-go').addEventListener('click', async () => { const v = root.querySelector('#ja-add').value; if(!v) return; const r = route().concat(v); const s = await sbPersonal.rpc('journey_set_route', { p_child:id, p_route:r }); if(s.error){ toast('השמירה נכשלה'); return; } redraw(); });
  root.querySelector('#ja-new-go').addEventListener('click', async () => {
    const name = root.querySelector('#ja-new-name').value.trim(), skill = root.querySelector('#ja-new-skill').value.trim(), q = root.querySelector('#ja-new-q').value.trim();
    if(!name || !skill || !q){ toast('צריך שם, מיומנות ושאלה'); return; }
    const pid = 'p' + Date.now().toString(36);
    const r = await sbPersonal.from('journey_planets').insert({ id:pid, name, skill, question:q, art:'planet' });
    if(r.error){ toast('היצירה נכשלה'); return; }
    journeyPlanetsCache = null; toast('הכוכב נוצר. אפשר להוסיף אותו למסלול'); redraw();
  });
  root.querySelector('#ja-save').addEventListener('click', async () => {
    const r = route(); if(!r.length){ toast('המסלול ריק'); return; }
    const a = await sbPersonal.rpc('journey_set_route', { p_child:id, p_route:r }), b = await sbPersonal.rpc('journey_approve_next', { p_child:id, p_ok:root.querySelector('#ja-approve').checked });
    toast(a.error || b.error ? 'השמירה נכשלה' : 'נשמר'); redraw();
  });
  const pl = root.querySelector('#ja-place'); if(pl) pl.addEventListener('click', () => journeyPlaceSheet(id, redraw));
}
async function journeyPlaceSheet(id, redraw){
  const planets = await journeyPlanets() || {}, j = (await journeyOf(id)) || journeyDefault(id);
  const sh = portalSheet(`<h2>מיקום במסע</h2><div class="pnote">לשים את הילד/ה איפה שהוא/היא באמת (למשל לפי הלוח שעל הקיר). נרשם ביומן.</div>
    <label class="pfield">כוכב<select id="jp-idx">${j.route.map((pid, i) => `<option value="${i}"${i === j.planet_idx ? ' selected' : ''}>${pEsc((planets[pid] || {}).name || pid)}</option>`).join('')}</select></label>
    <label class="pfield">שלב<select id="jp-stage">${[['climb', 'עלייה להר'], ['fly', 'בחללית'], ['adventure', 'הרפתקה'], ['extra', 'הרפתקאות נוספות']].map(([k, w]) => `<option value="${k}"${j.stage === k ? ' selected' : ''}>${w}</option>`).join('')}</select></label>
    <label class="pfield">צעד<input type="number" id="jp-step" min="0" max="9" value="${j.step}"></label>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="jp-go">שמירה</button></div>`);
  sh.querySelector('#jp-go').addEventListener('click', async () => {
    const r = await sbPersonal.rpc('journey_place', { p_child:id, p_planet_idx:+sh.querySelector('#jp-idx').value, p_stage:sh.querySelector('#jp-stage').value, p_step:+sh.querySelector('#jp-step').value });
    if(r.error){ toast('המיקום לא נשמר (בדקו את מספר הצעד)'); return; }
    sh.close(); toast('המיקום נשמר'); if(redraw) redraw();
  });
}
