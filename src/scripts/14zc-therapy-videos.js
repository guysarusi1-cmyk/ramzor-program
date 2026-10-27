
// ---------- MERCURY: THE PLAN VIDEOS (scheduling-v41.sql; decisions 66-76, 84, 89, 90, 93) ----------
// A full update of a plan makes a draft video. The video is built here, in the browser, from the published plan: the child's character from the
// space journey, the strengths, the goals in focus, what the staff does, what to avoid; captions always, the computer voice where the device has a
// Hebrew one; up to about two minutes. The responsible therapist approves or rejects it; only an approved one is shown to the staff (in the child's
// card, and a "סרטון חדש" line until they watched it). Watching 80% of it counts as watched. The coordinator sees who has not watched yet; the
// admin has an overview of the whole center. The style is temporary, until the design session.
async function thpVideosLoad(){
  thp.videos = {}; thp.myViews = {}; thp.allViews = null; thp.vOk = false;
  try {
    const r = await sbPersonal.rpc('plan_videos_current'); if(r.error) return;
    (r.data || []).forEach(v => { thp.videos[v.child_id] = v; });
    const mv = await sbPersonal.from('video_views').select('video_id,pct').eq('staff_id', srv.me);
    (mv.data || []).forEach(v => { thp.myViews[v.video_id] = v.pct; });
    if(canAssignTherapist() || (srv.profile && srv.profile.admin) || isTherapistMe()){
      const av = await sbPersonal.from('video_views').select('video_id,staff_id,pct'); if(!av.error) thp.allViews = av.data || [];
    }
    thp.vOk = true;
  } catch(e){}
}
const thpVideoOf = id => { const v = (thp.videos || {})[id]; return v && v.status === 'approved' ? v : null; };          // (the staff: only the approved one of the last full update)
const thpVideoNew = id => { const v = thpVideoOf(id); return !!v && (thp.myViews[v.video_id] || 0) < 80; };
// who must watch (decision 74): instructors, service girls and teachers who are active
const thpWatchers = () => (portalLoad().instructors || []).filter(p => p.active !== false && ['instructor', 'service', 'teacher'].includes(p.role));

// ---- the scenes of one child's video, from the plan (the main things for the instructor: decision 71); a fixed wording (decision 96)
function planVideoScenes(id, c){
  const kid = roster.find(x => x.id === id), name = kid ? displayName(kid) : '', goals = (c.goals || []).filter(g => g.title), focus = goals.filter(g => g.focus).slice(0, 3);
  const strengths = [...new Set(goals.flatMap(g => g.strengths || []))].slice(0, 6), todo = focus.filter(g => g.interventions);
  const s = [{ k:'intro', kicker:'התוכנית הטיפולית · לצוות', big:name, html:thpAvatar(kid || { id }), say:`התוכנית הטיפולית של ${name}. סיכום קצר לצוות.` }];
  if(c.summary) s.push({ k:'sum', kicker:'בקצרה', big:'מה חשוב לדעת עכשיו', html:`<div class="tv-mid">${pEsc(c.summary)}</div>`, say:c.summary });
  if(strengths.length) s.push({ k:'str', kicker:'על מה נשענים', big:`החוזקות של ${name}`, html:`<div class="tv-chips">${strengths.map(x => `<span>${pEsc(x)}</span>`).join('')}</div>`, say:`החוזקות של ${name}: ${strengths.join(', ')}.` });
  if(focus.length) s.push({ k:'goals', kicker:'המטרות', big:focus.length === 1 ? 'המטרה במוקד' : `${focus.length} מטרות במוקד`, html:focus.map(g => `<div class="tv-goal"><b>${pEsc(g.title)}</b>${g.why_staff || g.targets ? `<span>${pEsc(g.why_staff || g.targets)}</span>` : ''}</div>`).join(''), say:`המטרות במוקד: ${focus.map(g => g.title + (g.why_staff ? '. ' + g.why_staff : '')).join('. ')}.` });          // (why it matters, in plain words: decision 100)
  if(todo.length) s.push({ k:'todo', kicker:'מה הצוות עושה', big:`איך עוזרים ל${name} ביום־יום`, html:todo.map((g, i) => `<div class="tv-step"><b>${i + 1}</b><span>${pEsc(g.interventions)}</span></div>`).join(''), say:`איך עוזרים: ${todo.map(g => g.interventions).join('. ')}.` });
  if(c.signs || c.calm) s.push({ k:'calm', kicker:'ברגעים קשים', big:'אותות מוקדמים ומה מרגיע', html:`${c.signs ? `<div class="tv-goal"><b>אותות מוקדמים</b><span>${pEsc(c.signs)}</span></div>` : ''}${c.calm ? `<div class="tv-goal"><b>מה עוזר להירגע</b><span>${pEsc(c.calm)}</span></div>` : ''}`, say:[c.signs ? `אותות מוקדמים: ${c.signs}.` : '', c.calm ? `מה עוזר להירגע: ${c.calm}.` : ''].join(' ') });
  if(c.avoid) s.push({ k:'avoid', kicker:'חשוב לדעת', big:'ממה להימנע', html:`<div class="tv-mid">${pEsc(c.avoid)}</div>`, say:`ממה להימנע: ${c.avoid}.` });
  s.push({ k:'end', kicker:'', big:'תודה לכל הצוות!', html:'<div class="tv-mid">כל צעד קטן במטרות מקדם את המסע.</div>', say:'תודה לכל הצוות.' });
  return s;
}
const planVideoMs = say => Math.max(3500, String(say || '').split(/\s+/).length * 430) + 700;          // (how long a scene stays when there is no voice)
const pvHeVoice = () => { try { return speechSynthesis.getVoices().find(v => /^he/i.test(v.lang)) || null; } catch(e){ return null; } };
// play one child's video in a window; opts.video (to record the watching), opts.draft (the therapist's look before approving)
function planVideoPlay(id, opts){
  opts = opts || {};
  const g = thp.guidance && thp.guidance[id]; if(!g || !g.content){ toast('עוד אין תוכנית שפורסמה'); return; }
  const scenes = planVideoScenes(id, g.content), total = scenes.reduce((s, x) => s + planVideoMs(x.say), 0);
  const sh = portalSheet(`<div class="pv-wrap"><div class="pv-stage" id="pv-stage">${scenes.map((x, i) => `<div class="pv-scene" data-pv="${i}"><div class="pv-kicker">${pEsc(x.kicker)}</div><div class="pv-big ar-keep">${pEsc(x.big)}</div><div class="pv-body ar-keep">${x.html}</div></div>`).join('')}
      <div class="pv-sub ar-keep" id="pv-sub"></div><div class="pv-bar"><i id="pv-bar"></i></div></div>
    ${opts.draft ? '<div class="pnote">טיוטה: המדריכים יראו את הסרטון רק אחרי שתאשרו.</div>' : ''}
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>סגירה</button><button type="button" class="btn" id="pv-play">▶ הפעלה</button></div></div>`);
  sh.classList.add('pv-sheet');
  let run = 0, recorded = 0;
  const stopSpeech = () => { try { speechSynthesis.cancel(); } catch(e){} };
  const record = pct => { if(!opts.video || pct <= recorded) return; recorded = pct;          // (decision 72: 80% of it counts as watched)
    if(pct >= 80 || pct === 100){ thp.myViews[opts.video] = Math.max(thp.myViews[opts.video] || 0, pct); sbPersonal.from('video_views').upsert({ video_id:opts.video, staff_id:srv.me, pct, watched_at:new Date().toISOString() }).then(() => {}, () => {}); } };
  const speak = text => new Promise(res => { const ms = planVideoMs(text) - 700;
    const v = pvHeVoice(); if(!v || !('speechSynthesis' in window)){ setTimeout(res, ms); return; }
    try { const u = new SpeechSynthesisUtterance(text); u.lang = 'he-IL'; u.voice = v; let done = false; const fin = () => { if(!done){ done = true; res(); } }; u.onend = fin; u.onerror = fin; stopSpeech(); speechSynthesis.speak(u); setTimeout(fin, ms + 6000); } catch(e){ setTimeout(res, ms); } });
  const show = i => { sh.querySelectorAll('.pv-scene').forEach((el, k) => el.classList.toggle('on', k === i)); sh.querySelector('#pv-sub').textContent = i >= 0 ? scenes[i].say : ''; };
  const play = async () => {
    const me = ++run; let done = 0; sh.querySelector('#pv-play').textContent = '↺ מההתחלה';
    for(let i = 0; i < scenes.length; i++){
      if(me !== run || !sh.isConnected) return;
      show(i); await speak(scenes[i].say); await new Promise(r => setTimeout(r, 700));
      if(me !== run || !sh.isConnected) return;
      done += planVideoMs(scenes[i].say); const pct = Math.round(done / total * 100);
      sh.querySelector('#pv-bar').style.width = pct + '%'; if(pct >= 80) record(i === scenes.length - 1 ? 100 : Math.max(80, pct));
    }
  };
  show(0);
  sh.querySelector('#pv-play').addEventListener('click', () => { stopSpeech(); play(); });
  const close = sh.close; sh.close = () => { run++; stopSpeech(); close(); };
  sh.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { run++; stopSpeech(); }));
  sh.addEventListener('click', e => { if(e.target === sh){ run++; stopSpeech(); } });          // (closed by a tap outside: the voice stops too)
  return sh;
}

// ---- the therapist: the video of the child's last full update, at the top of the plan: watch, approve or reject; then who watched
function thpVideoPanelHtml(id){
  if(!thp.vOk) return '';
  const v = (thp.videos || {})[id]; if(!v) return '<div class="pv-panel"><b>🎬 סרטון</b><span class="pnote">ייווצר בפרסום הבא של עדכון מלא.</span></div>';
  if(v.status === 'draft') return `<div class="pv-panel draft"><b>🎬 סרטון חדש מחכה לאישור שלך</b><span class="pnote">גרסה ${v.version}. המדריכים יקבלו הודעה ויראו אותו רק אחרי שתאשרו.</span>
    <div class="pv-acts"><button type="button" class="btn ghost small" data-pv-watch="${pEsc(id)}">▶ צפייה</button><button type="button" class="btn ghost small" data-pv-ok="${v.video_id}">אישור</button><button type="button" class="btn ghost small" data-pv-no="${v.video_id}">דחייה</button></div></div>`;
  if(v.status === 'rejected') return `<div class="pv-panel"><b>🎬 הסרטון של גרסה ${v.version} נדחה</b><span class="pnote">המדריכים לא רואים סרטון. כדי ליצור סרטון חדש, משנים את התוכנית ומפרסמים עדכון מלא.</span></div>`;
  const w = thpWatchers(), seen = new Set((thp.allViews || []).filter(x => x.video_id === v.video_id && x.pct >= 80).map(x => x.staff_id)), not = w.filter(p => !seen.has(p.id));
  return `<div class="pv-panel ok"><b>🎬 הסרטון אושר · צפו ${w.length - not.length} מתוך ${w.length}</b>
    <div class="pv-acts"><button type="button" class="btn ghost small" data-pv-watch="${pEsc(id)}">▶ צפייה</button></div>
    ${not.length ? `<details class="pfold"><summary><span>עוד לא צפו (${not.length})</span></summary><div class="pfold-body">${not.map(p => pEsc(instrName(p, portalLoad().instructors))).join(' · ')}</div></details>` : ''}</div>`;
}
function thpVideoWire(box, id, after){
  box.querySelectorAll('[data-pv-watch]').forEach(b => b.addEventListener('click', () => { const v = (thp.videos || {})[id]; planVideoPlay(id, { draft:v && v.status === 'draft', video:v && v.status === 'approved' ? v.video_id : null }); }));
  box.querySelectorAll('[data-pv-ok], [data-pv-no]').forEach(b => b.addEventListener('click', async () => {
    const ok = !!b.dataset.pvOk, vid = b.dataset.pvOk || b.dataset.pvNo;
    if(!(await confirmSheet(ok ? { title:'לאשר את הסרטון?', text:'הצוות יקבל הודעה, והסרטון יופיע בכרטיס של הילד/ה.', okLabel:'כן, לאשר', cancelLabel:'חזרה' } : { title:'לדחות את הסרטון?', text:'המדריכים לא יראו סרטון עד שיאושר סרטון חדש. סרטון חדש נוצר כשמפרסמים עדכון מלא של התוכנית.', okLabel:'כן, לדחות', cancelLabel:'חזרה', danger:true }))) return;
    const r = await sbPersonal.rpc('plan_video_decide', { p_video:vid, p_ok:ok });
    if(r.error){ toast('הפעולה נכשלה. אפשר לנסות שוב'); return; }
    toast(ok ? 'הסרטון אושר. הצוות קיבל הודעה' : 'הסרטון נדחה'); await thpVideosLoad(); if(after) after();
  }));
}

// ---- the staff: the "סרטון חדש" line at the top of the children (until they watched it)
function thpVideoBannerHtml(){
  if(!thp.vOk) return '';
  const kids = thpKids().filter(c => thpVideoNew(c.id)); if(!kids.length) return '';
  return `<div class="pv-banner"><b>🎬 ${kids.length === 1 ? 'סרטון חדש' : 'סרטונים חדשים'}:</b>${kids.map(c => `<button type="button" class="th-chip" data-th-video="${pEsc(c.id)}"><span class="ar-keep">${pEsc(displayName(c))}</span></button>`).join('')}</div>`;
}
const thpVideoBtnHtml = id => thpVideoOf(id) ? `<button type="button" class="btn small pv-btn${thpVideoNew(id) ? ' new' : ''}" data-th-video="${pEsc(id)}">▶ סרטון${thpVideoNew(id) ? ' <span class="pv-new">חדש</span>' : ''}</button>` : '';
const thpVideoOpen = id => { const v = thpVideoOf(id); if(v) planVideoPlay(id, { video:v.video_id }); };

// ---- the coordinator (and the admin): who has not watched the current videos yet (decision 86)
function thpVideosHtml(){
  if(!thp.vOk) return '<div class="pnote">הסרטונים עוד לא פעילים בשרת הזה (scheduling-v41.sql).</div>';
  const w = thpWatchers(), rows = thpKids().map(c => ({ c, v:thpVideoOf(c.id) })).filter(x => x.v);
  if(!rows.length) return '<div class="th-empty"><span aria-hidden="true">🎬</span><b>עוד אין סרטונים שאושרו</b><small>סרטון נוצר בכל עדכון מלא של תוכנית, ומופיע כאן אחרי שאיש/אשת הטיפול מאשרים.</small></div>';
  return `<div class="pnote">לכל ילד/ה הסרטון האחרון שאושר, ומי מהצוות (מדריכים, בנות שירות ומורות) עוד לא צפה בו. צפייה ב-80% נחשבת צפייה.</div>
    ${rows.map(({ c, v }) => { const seen = new Set((thp.allViews || []).filter(x => x.video_id === v.video_id && x.pct >= 80).map(x => x.staff_id)), not = w.filter(p => !seen.has(p.id));
      return `<div class="pv-row"><div class="pv-row-head">${thpAvatar(c)}<b class="ar-keep">${pEsc(displayName(c))}</b><span class="pcount">${w.length - not.length}/${w.length}</span></div>${not.length ? `<small>עוד לא צפו: ${not.map(p => pEsc(instrName(p, portalLoad().instructors))).join(' · ')}</small>` : '<small>כולם צפו ✓</small>'}</div>`; }).join('')}`;
}
// ---- the admin: a picture of the whole center (decision 94)
function thpOverviewHtml(){
  const kids = thpKids(), plans = kids.filter(c => (thp.plans[c.id] || {}).published_version), today = isoDate(new Date());
  const review = plans.filter(c => { const d = (thp.plans[c.id] || {}).review_date; return d && thpDaysTo(d) <= 14; }).length;
  const drafts = Object.values(thp.videos || {}).filter(v => v.status === 'draft').length, appr = kids.map(c => thpVideoOf(c.id)).filter(Boolean), w = thpWatchers();
  const seen = appr.reduce((s, v) => s + new Set((thp.allViews || []).filter(x => x.video_id === v.video_id && x.pct >= 80 && w.some(p => p.id === x.staff_id)).map(x => x.staff_id)).size, 0);
  const rate = appr.length && w.length ? Math.round(seen / (appr.length * w.length) * 100) : null, qs = Object.values(thp.questions || {}).reduce((s, n) => s + n, 0);
  const box = (n, label) => `<div class="pv-stat"><b>${n}</b><span>${label}</span></div>`;
  return `<div class="pv-stats">${box(`${plans.length}/${kids.length}`, 'ילדים עם תוכנית שפורסמה')}${box(review, 'תוכניות לבדיקה מחדש (14 יום)')}${box(drafts, 'סרטונים שמחכים לאישור')}${box(rate === null ? '—' : rate + '%', 'צפייה בסרטונים')}${box(qs, 'שאלות מהצוות שמחכות לתשובה')}</div>
    <div class="pnote">נכון ל-${pEsc(dayLabel(today))}. הצפייה: מתוך הסרטונים האחרונים שאושרו, כמה מהצוות צפו בהם.</div>`;
}
