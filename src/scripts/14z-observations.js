// ---------- MERCURY: OBSERVATIONS AND TRACKING (stage 5) ----------
// Anybody on the staff (with the personal sign-in) sends a short free observation on a child to the responsible therapist: words, or a
// recording (kept in private storage, never in the phone's gallery), optionally tied to a goal in focus. The therapist answers
// "ראיתי, תודה" (+ a sentence); the writer is told. No report is required at the end of a shift. The therapist sees a weekly summary
// per goal over 8 weeks (steps, bricks, stars, frequent strengths, a fixed sentence from the numbers, the observations) and a few
// simple charts. Nothing here draws conclusions. (scheduling-v32.sql; decisions 17, 18, 31, 43, 52-55, 64)
const OBS_MAX_SECONDS = 120;
const obsClient = () => (typeof portalServerOn !== 'undefined' && portalServerOn && sbPersonal) ? sbPersonal : sb;
async function obsFocusGoals(childId){
  try { if(thp.guidance && thp.guidance[childId]) return (thp.guidance[childId].content.goals || []).filter(g => g.focus);
    const r = await obsClient().rpc('plan_guidance'); const g = (r.data || []).find(x => x.child_id === childId); return g ? (g.content.goals || []).filter(x => x.focus) : []; } catch(e){ return []; }
}
// the observation sheet (from the therapy portal and from the Ramzor)
async function obsOpen(childId, kind){          // (kind 'question': "שאלה למטפלת", Mercury decision 82; scheduling-v40.sql)
  const q = kind === 'question';
  const c = roster.find(x => x.id === childId); if(!c) return;
  const client = obsClient(), me = (await client.rpc('is_staff_person')).data;
  if(!me){ toast('תצפית נשלחת רק בכניסה אישית (מייל וסיסמה)'); return; }
  const goals = await obsFocusGoals(childId);
  const sh = portalSheet(`<h2>${q ? 'שאלה למטפל/ת על' : 'תצפית על'} ${escapeHtml(displayName(c))}</h2>
    <div class="pnote">${q ? 'מה תרצו לשאול? התשובה תגיע אליכם בהודעה.' : 'מה ראית? כמה מילים מספיקות.'} מגיע רק לאיש/אשת הטיפול האחראי/ת (ולמנהל המערכת).</div>
    <textarea id="obs-text" class="obs-text" rows="4" maxlength="2000" placeholder="${q ? 'למשל: מה עושים כשהוא מסרב להיכנס למקלחת?' : 'למשל: ביקש עזרה כשנתקע בפאזל, בלי לצעוק'}"></textarea>
    <div class="obs-rec"><button type="button" class="btn ghost" id="obs-rec">🎙️ הקלטה</button><span id="obs-rec-state" class="obs-rec-state"></span><audio id="obs-audio" controls hidden></audio><button type="button" class="btn ghost small" id="obs-rec-x" hidden>מחיקת ההקלטה</button></div>
    ${goals.length ? `<div class="pfield"><span>${goals.some(g => (g.targets_list || []).length) ? 'קשור ליעד? (רשות)' : 'קשור למטרה? (רשות)'}</span><div class="pchoice wrap obs-goals">${goals.map(g => (g.targets_list || []).length
        ? g.targets_list.map(t => `<button type="button" data-obs-goal="${escapeHtml(g.id + '|' + t.id)}">🎯 ${escapeHtml(t.staff || t.text || '')}</button>`).join('')
        : `<button type="button" data-obs-goal="${escapeHtml(g.id)}">${escapeHtml(g.title)}</button>`).join('')}</div></div>
      ${q ? '' : '<div class="pfield obs-val" hidden><span>זו הצלחה או קושי?</span><div class="pchoice"><button type="button" data-obs-val="success">🌱 הצלחה</button><button type="button" data-obs-val="difficulty">🌧️ קושי</button></div></div>'}` : ''}
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="obs-send">שליחה</button></div>`);
  let goal = null, valence = null, blob = null, rec = null, chunks = [], timer = null;          // (an observation marked to a goal: a success or a difficulty, Mercury decision 121)
  sh.querySelectorAll('[data-obs-goal]').forEach(b => b.addEventListener('click', () => { goal = goal === b.dataset.obsGoal ? null : b.dataset.obsGoal; sh.querySelectorAll('[data-obs-goal]').forEach(x => x.classList.toggle('on', x.dataset.obsGoal === goal));
    const v = sh.querySelector('.obs-val'); if(v){ v.hidden = !goal; if(!goal){ valence = null; v.querySelectorAll('[data-obs-val]').forEach(x => x.classList.remove('on')); } } }));
  sh.querySelectorAll('[data-obs-val]').forEach(b => b.addEventListener('click', () => { valence = valence === b.dataset.obsVal ? null : b.dataset.obsVal; sh.querySelectorAll('[data-obs-val]').forEach(x => x.classList.toggle('on', x.dataset.obsVal === valence)); }));
  const recBtn = sh.querySelector('#obs-rec'), state = sh.querySelector('#obs-rec-state'), audio = sh.querySelector('#obs-audio'), recX = sh.querySelector('#obs-rec-x');
  const stopRec = () => { if(rec && rec.state !== 'inactive') rec.stop(); clearInterval(timer); };
  recBtn.addEventListener('click', async () => {
    if(rec && rec.state === 'recording'){ stopRec(); return; }
    if(!navigator.mediaDevices || !window.MediaRecorder){ toast('המכשיר הזה לא מאפשר הקלטה'); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio:true }); } catch(e){ toast('אין הרשאה למיקרופון'); return; }
    chunks = []; rec = new MediaRecorder(stream); const t0 = Date.now();
    rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); blob = new Blob(chunks, { type:rec.mimeType || 'audio/webm' }); audio.src = URL.createObjectURL(blob); audio.hidden = false; recX.hidden = false; recBtn.textContent = '🎙️ הקלטה מחדש'; state.textContent = ''; };
    rec.start(); recBtn.textContent = '⏹ עצירה';
    timer = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); state.textContent = `${s} שניות`; if(s >= OBS_MAX_SECONDS) stopRec(); }, 500);
  });
  recX.addEventListener('click', () => { blob = null; audio.hidden = true; audio.removeAttribute('src'); recX.hidden = true; recBtn.textContent = '🎙️ הקלטה'; });
  sh.querySelector('#obs-send').addEventListener('click', async e => {
    const text = sh.querySelector('#obs-text').value.trim();
    if(!text && !blob){ toast('צריך לכתוב משהו או להקליט'); return; }
    e.target.disabled = true; let audio_path = null;
    if(blob){
      const ext = /mp4|aac|m4a/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
      audio_path = `audio/${childId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await client.storage.from('mercury').upload(audio_path, blob, { contentType:blob.type || 'audio/webm' });
      if(up.error){ e.target.disabled = false; toast('ההקלטה לא נשמרה. אפשר לנסות שוב'); return; }
    }
    const [goalId, targetId] = String(goal || '').split('|');          // (an observation marked to a target: the walkthrough Q28)
    let r = await client.from('observations').insert(Object.assign({ child_id:childId, text:text || null, audio_path, goal_id:goalId || null }, targetId ? { target_id:targetId } : {}, q ? { kind:'question' } : {}, valence ? { valence } : {}));
    if(r.error && targetId && /target_id/.test(r.error.message || '')) r = await client.from('observations').insert(Object.assign({ child_id:childId, text:text || null, audio_path, goal_id:goalId || null }, valence ? { valence } : {}));          // (a project without v44)
    if(r.error && valence && /valence/.test(r.error.message || '')) r = await client.from('observations').insert({ child_id:childId, text:(valence === 'success' ? '🌱 ' : '🌧️ ') + (text || ''), audio_path, goal_id:goalId || null });          // (a project without v43)
    if(r.error && q && /kind/.test(r.error.message || '')) r = await client.from('observations').insert({ child_id:childId, text:'❓ ' + (text || ''), audio_path, goal_id:goal });          // (a project without v40)
    if(r.error){ e.target.disabled = false; toast(q ? 'השאלה לא נשלחה. אפשר לנסות שוב' : 'התצפית לא נשלחה. אפשר לנסות שוב'); return; }
    stopRec(); sh.close(); toast(q ? 'השאלה נשלחה לאיש/אשת הטיפול. התשובה תגיע אליך בהודעה' : 'התצפית נשלחה לאיש/אשת הטיפול. תודה!');
  });
  sh.querySelector('[data-close]').addEventListener('click', stopRec);
}

// ---- the therapist: the observations on a child, newest first; "ראיתי, תודה"; a recording plays from a short-lived link
async function obsSection(childId, box){
  if(!box) return;
  const r = await sbPersonal.from('observations').select('*').eq('child_id', childId).order('created_at', { ascending:false }).limit(60);
  if(r.error){ box.innerHTML = ''; return; }
  const names = {}; (portalLoad().instructors || []).forEach(p => { names[p.id] = p.first; });
  const goals = {}; ((thp.plans[childId] && (thp.plans[childId].published || thp.plans[childId].draft)) || { goals:[] }).goals.forEach(g => { goals[g.id] = g.title; });
  const list = r.data || [];
  box.innerHTML = list.length ? list.map(o => `<div class="obs-item${o.seen_at ? '' : ' new'}${o.kind === 'question' ? ' question' : ''}" data-obs="${o.id}">
      <div class="obs-head">${o.kind === 'question' ? '<span class="th-chip obs-q">❓ שאלה</span>' : ''}<b>${pEsc(names[o.author] || 'צוות')}</b><small>${pEsc(dayLabel(String(o.created_at).slice(0, 10)))} ${String(o.created_at).slice(11, 16)}</small>${o.goal_id && goals[o.goal_id] ? `<span class="th-chip">${o.valence === 'success' ? '🌱 ' : o.valence === 'difficulty' ? '🌧️ ' : ''}${pEsc(goals[o.goal_id])}</span>` : ''}</div>
      ${o.text ? `<div class="obs-body">${pEsc(o.text)}</div>` : ''}${o.audio_path ? `<button type="button" class="btn ghost small" data-obs-play="${pEsc(o.audio_path)}">▶ להאזנה</button>` : ''}
      ${o.reply != null ? `<div class="obs-reply">התשובה שלך: ${pEsc(o.reply || 'ראיתי, תודה')}</div>` : `<div class="th-add-row"><input type="text" maxlength="${o.kind === 'question' ? 600 : 200}" placeholder="${o.kind === 'question' ? 'התשובה שלך' : 'משפט קצר (רשות)'}" data-obs-msg aria-label="תשובה"><button type="button" class="btn small" data-obs-ok${o.kind === 'question' ? ' data-q' : ''}>${o.kind === 'question' ? 'שליחת תשובה' : 'ראיתי, תודה'}</button></div>`}
    </div>`).join('') : '<div class="pnote">עוד אין תצפיות על הילד/ה.</div>';
  box.querySelectorAll('[data-obs-play]').forEach(b => b.addEventListener('click', async () => {
    const s = await sbPersonal.storage.from('mercury').createSignedUrl(b.dataset.obsPlay, 300); if(s.error){ toast('לא הצלחנו לפתוח את ההקלטה'); return; }
    const a = document.createElement('audio'); a.controls = true; a.src = s.data.signedUrl; b.replaceWith(a); a.play().catch(() => {});
  }));
  box.querySelectorAll('[data-obs-ok]').forEach(b => b.addEventListener('click', async () => {
    const item = b.closest('[data-obs]'), msg = item.querySelector('[data-obs-msg]').value.trim();
    if('q' in b.dataset && !msg){ toast('כתבו תשובה קצרה'); return; }
    const u = await sbPersonal.from('observations').update({ reply:msg, seen_at:new Date().toISOString() }).eq('id', item.dataset.obs);
    if(u.error){ toast('לא נשמר'); return; }
    toast('נשלח לכותב/ת התצפית'); obsSection(childId, box);
  }));
  const unseen = list.filter(o => !o.seen_at).map(o => o.id);          // (seen once the therapist opened them)
  if(unseen.length) sbPersonal.from('observations').update({ seen_at:new Date().toISOString() }).in('id', unseen).then(() => {}, () => {});
}

// ---- tracking: 8 weeks, per goal; from what was given (steps, bricks, stars), not a conclusion
const obsWeekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; };
async function trackSection(childId, box){
  if(!box) return;
  const since = obsWeekStart(Date.now() - 7 * 7 * 864e5);
  const [ev, steps, obs] = await Promise.all([
    sb.from('feedback_events').select('type,message,created_at').eq('child_id', childId).in('type', ['star', 'bricks']).gte('created_at', since.toISOString()),
    sbPersonal.from('journey_steps').select('planet_id,at').eq('child_id', childId).gte('at', since.toISOString()),
    sbPersonal.from('observations').select('created_at').eq('child_id', childId).gte('created_at', since.toISOString())]);
  if(ev.error || steps.error){ box.innerHTML = ''; return; }
  const weeks = Array.from({ length:8 }, (_, i) => new Date(since.getTime() + i * 7 * 864e5));
  const wk = t => Math.min(7, Math.max(0, Math.floor((new Date(t) - since) / (7 * 864e5))));
  const plan = (thp.plans[childId] && (thp.plans[childId].published || thp.plans[childId].draft)) || { goals:[] };
  const brickWhy = m => ((m || '').match(/ · כוח: (.+)$/) || [])[1] || '';
  const stars = Array(8).fill(0), bricks = Array(8).fill(0), obsN = Array(8).fill(0), freq = {};
  (ev.data || []).forEach(e => { if(e.type === 'star') stars[wk(e.created_at)]++; else { bricks[wk(e.created_at)]++; const w = brickWhy(e.message); if(w) freq[w] = (freq[w] || 0) + 1; } });
  (obs.data || []).forEach(o => { obsN[wk(o.created_at)]++; });
  const perGoal = plan.goals.filter(g => g.title).map(g => {
    const s = Array(8).fill(0), b = Array(8).fill(0);
    (steps.data || []).forEach(x => { if(g.planet_id && x.planet_id === g.planet_id) s[wk(x.at)]++; });
    (ev.data || []).forEach(e => { if(e.type === 'bricks' && (g.strengths || []).includes(brickWhy(e.message))) b[wk(e.created_at)]++; });
    return { g, s, b };
  });
  const last = 7, top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sentence = `השבוע: ${stars[last]} כוכבים, ${bricks[last]} לבנים${perGoal.length ? ', ' + perGoal.map(x => `${x.g.title}: ${x.s[last]} צעדים ו-${x.b[last]} לבנים`).join(', ') : ''}${obsN[last] ? `, ${obsN[last]} תצפיות` : ''}.`;
  const head = `<tr><th></th>${weeks.map(w => `<th>${w.getDate()}/${w.getMonth() + 1}</th>`).join('')}</tr>`;
  const row = (label, arr) => `<tr><th>${pEsc(label)}</th>${arr.map(v => `<td>${v || ''}</td>`).join('')}</tr>`;
  const max = Math.max(1, ...stars, ...bricks);
  const bars = (label, arr) => `<div class="trk-chart"><b>${pEsc(label)}</b><div class="trk-bars">${arr.map((v, i) => `<span title="${weeks[i].getDate()}/${weeks[i].getMonth() + 1}: ${v}"><i style="height:${Math.round(v / max * 100)}%"></i></span>`).join('')}</div></div>`;
  box.innerHTML = `<div class="trk-sentence">${pEsc(sentence)}</div>
    <div class="pnote">אלה הנתונים שנרשמו (צעדים, לבנים, כוכבים): אינדיקציה חלקית בלבד, לא מסקנה טיפולית.</div>
    <div class="trk-scroll"><table class="trk-table"><thead>${head}</thead><tbody>
      ${perGoal.map(x => row(x.g.title + ' · צעדים', x.s) + row(x.g.title + ' · לבנים', x.b)).join('')}
      ${row('כוכבים', stars)}${row('לבנים (הכול)', bricks)}${row('תצפיות', obsN)}</tbody></table></div>
    ${top.length ? `<div class="pnote">חוזקות נפוצות: ${top.map(([w, n]) => `${pEsc(w)} (${n})`).join(' · ')}</div>` : ''}
    <details class="pfold"><summary><span>גרפים פשוטים</span></summary><div class="pfold-body">${bars('כוכבים בשבוע', stars)}${bars('לבנים בשבוע', bricks)}</div></details>`;
}

// ---- the therapist's choice: how to be told (now by e-mail / a daily summary / only in the portal)
function obsNotifyHtml(){
  const v = srv.therapistNotify || 'daily';
  return `<div class="pfield th-notify"><span>איך לעדכן אותך על הילדים שלך?</span><div class="pchoice wrap">${[['now', 'מייל מיד'], ['daily', 'סיכום יומי במייל'], ['portal', 'רק בפורטל']].map(([k, w]) => `<button type="button" class="${v === k ? 'on' : ''}" data-th-notify="${k}">${w}</button>`).join('')}</div></div>`;
}
async function obsLoadNotify(){ try { const r = await sbPersonal.from('staff_settings').select('therapist_notify').eq('staff_id', srv.me).maybeSingle(); srv.therapistNotify = (!r.error && r.data && r.data.therapist_notify) || 'daily'; } catch(e){ srv.therapistNotify = 'daily'; } }
function obsWireNotify(box){
  box.querySelectorAll('[data-th-notify]').forEach(b => b.addEventListener('click', async () => {
    const r = await sbPersonal.from('staff_settings').upsert({ staff_id:srv.me, therapist_notify:b.dataset.thNotify });
    if(r.error){ toast('לא נשמר'); return; }
    srv.therapistNotify = b.dataset.thNotify; box.querySelectorAll('[data-th-notify]').forEach(x => x.classList.toggle('on', x === b)); toast('נשמר');
  }));
}
