// ---------- MERCURY: TREATMENT PLANS (stage 2) ----------
// The therapist builds a plan per child: a short summary for the staff, "what to avoid", goals (up to 3 in focus) with what we see when
// the child succeeds and what the staff does, a planet of the space journey and the strengths of the temple per goal, the optional
// "what we see / what may be needed / why" thinking (never shown to the staff), an attached document and a review date.
// A draft until "פרסום"; every publish is kept; the staff sees the published plan only (plan_guidance). (scheduling-v32.sql; decisions 7-17, 46, 47, 56-58)
const PLAN_FOCUS_MAX = 3;
const planNewGoal = () => ({ id:'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title:'', library_id:null, focus:false, targets:'', interventions:'', seen:'', needs:'', why:'', planet_id:null, strengths:[] });
const planEmpty = () => ({ summary:'', avoid:'', goals:[planNewGoal()] });
const planCanEdit = id => !!(srv.profile && (srv.profile.admin || (srv.profile.therapist && thp.mine.includes(id))));
const thpLib = kind => (thp.library || []).filter(x => x.kind === kind && x.active);

// ---- the staff's view of one child: what to avoid first, then the goals in focus, the rest folded
function planGuidanceHtml(g){
  if(!g || !g.content) return '';
  const c = g.content, goals = c.goals || [], focus = goals.filter(x => x.focus), rest = goals.filter(x => !x.focus);
  const goalHtml = x => `<div class="th-g"><b class="ar-keep">${pEsc(x.title || '')}</b>
      ${x.targets ? `<div class="th-g-row"><span>מה רואים כשמצליח/ה:</span> <em class="ar-keep">${pEsc(x.targets)}</em></div>` : ''}
      ${x.interventions ? `<div class="th-g-row"><span>מה עושים:</span> <em class="ar-keep">${pEsc(x.interventions)}</em></div>` : ''}
      ${(x.strengths || []).length ? `<div class="th-chips ar-keep">${x.strengths.map(s => `<span class="th-chip">${pEsc(s)}</span>`).join('')}</div>` : ''}</div>`;
  return `${c.avoid ? `<div class="th-avoid"><b>ממה להימנע</b><div class="ar-keep">${pEsc(c.avoid)}</div></div>` : ''}
    ${c.summary ? `<div class="th-summary ar-keep">${pEsc(c.summary)}</div>` : ''}
    ${focus.length ? `<h3 class="psec">במוקד</h3>${focus.map(goalHtml).join('')}` : ''}
    ${rest.length ? `<details class="pfold th-rest"><summary><span>מטרות נוספות (${rest.length})</span></summary><div class="pfold-body">${rest.map(goalHtml).join('')}</div></details>` : ''}
    <div class="th-ver">גרסה ${g.version}${g.published_at ? ' · ' + pEsc(dayLabel(String(g.published_at).slice(0, 10))) : ''}</div>`;
}
const planCardSub = id => { const g = thp.guidance && thp.guidance[id]; if(!g) return 'עוד אין תוכנית טיפולית'; const f = (g.content.goals || []).filter(x => x.focus).map(x => x.title).filter(Boolean); return f.length ? 'במוקד: <span class="ar-keep">' + pEsc(f.join(' · ')) + '</span>' : 'יש תוכנית טיפולית'; };          // (html: the therapist's words stay as written, decision 35)

// one goal box of the editor
function planGoalHtml(g, i){
  const planets = (thp.planets || []).filter(p => p.active);
  return `<div class="th-goal" data-gi="${i}" data-gid="${pEsc(g.id)}">
      <div class="th-goal-top"><input type="text" class="pe-g-title" list="th-lib-goals" maxlength="80" placeholder="שם המטרה (מהספרייה או חופשי)" value="${pEsc(g.title || '')}" aria-label="שם המטרה">
        <label class="th-focus"><input type="checkbox" class="pe-g-focus"${g.focus ? ' checked' : ''}> במוקד</label>
        <button type="button" class="btn ghost small pe-g-rm" aria-label="הסרת המטרה">✕</button></div>
      <label class="pfield">יעדים נצפים: מה רואים כשהילד/ה מצליח/ה<textarea class="pe-g-targets" rows="2">${pEsc(g.targets || '')}</textarea></label>
      <label class="pfield">דרכי התערבות: מה הצוות עושה<textarea class="pe-g-int" rows="2">${pEsc(g.interventions || '')}</textarea></label>
      <label class="pfield">כוכב לכת במסע בחלל<select class="pe-g-planet"><option value="">ללא</option>${planets.map(p => `<option value="${pEsc(p.id)}"${g.planet_id === p.id ? ' selected' : ''}>${pEsc(p.name)} · ${pEsc(p.skill)}</option>`).join('')}</select></label>
      <div class="pfield"><span>חוזקות במקדש (מוצעות למדריך כשנותנים לבנה)</span>
        <div class="th-chips pe-g-strengths">${(g.strengths || []).map(s => `<span class="th-chip" data-str="${pEsc(s)}">${pEsc(s)} <button type="button" class="th-chip-x" aria-label="הסרה">✕</button></span>`).join('')}</div>
        <div class="th-add-row"><input type="text" class="pe-g-str-new" list="th-lib-strengths" maxlength="20" placeholder="חוזקה (עד 20 תווים)" aria-label="חוזקה חדשה"><button type="button" class="btn ghost small pe-g-str-add">הוספה</button></div></div>
      <details class="pfold th-think"${g.seen || g.needs || g.why ? ' open' : ''}><summary><span>עוזר חשיבה (רשות, לא מוצג לצוות)</span></summary><div class="pfold-body">
        <label class="pfield">מה רואים אצל הילד/ה?<textarea class="pe-g-seen" rows="2">${pEsc(g.seen || '')}</textarea></label>
        <label class="pfield">מה הוא/היא אולי צריך/ה?<textarea class="pe-g-needs" rows="2">${pEsc(g.needs || '')}</textarea></label>
        <label class="pfield">למה המטרה הזו תעזור?<textarea class="pe-g-why" rows="2">${pEsc(g.why || '')}</textarea></label></div></details>
    </div>`;
}
// ---- the plan editor (the responsible therapist, or the admin)
function planEditorHtml(id){
  const c = roster.find(x => x.id === id), row = thp.plans[id] || {}, d = row.draft || row.published || planEmpty();
  const status = row.published_version ? `פורסמה גרסה ${row.published_version}${row.draft && JSON.stringify(row.draft) !== JSON.stringify(row.published) ? ' · יש שינויים שלא פורסמו' : ''}` : (row.draft ? 'טיוטה, עוד לא פורסמה' : 'תוכנית חדשה');
  return `<div class="th-editor" data-plan="${pEsc(id)}">
    <datalist id="th-lib-goals">${thpLib('goal').map(x => `<option value="${pEsc(x.title)}">`).join('')}</datalist>
    <datalist id="th-lib-strengths">${thpLib('strength').map(x => `<option value="${pEsc(x.title)}">`).join('')}</datalist>
    <div class="th-ed-head"><button type="button" class="btn ghost small" id="pe-back">→ חזרה</button><div class="th-child-head">${thpAvatar(c)}<h2 class="ar-keep">${pEsc(displayName(c))}</h2></div><span class="th-status">${status}</span></div>
    <label class="pfield">תקציר קצר לצוות<textarea id="pe-summary" rows="3" placeholder="בכמה משפטים: מה חשוב לדעת על הילד/ה עכשיו">${pEsc(d.summary || '')}</textarea></label>
    <label class="pfield th-avoid-field">ממה להימנע (מצבים או מילים שמעוררים את הילד/ה)<textarea id="pe-avoid" rows="2">${pEsc(d.avoid || '')}</textarea></label>
    <h3 class="psec">מטרות <small>(עד ${PLAN_FOCUS_MAX} במוקד)</small></h3>
    <div id="pe-goals">${(d.goals || []).map(planGoalHtml).join('')}</div>
    <button type="button" class="btn ghost" id="pe-add-goal">+ מטרה</button>
    <div class="th-ed-grid">
      <label class="pfield">תאריך לבדיקה מחדש<input type="date" id="pe-review" value="${pEsc(row.review_date || '')}"></label>
      <div class="pfield"><span>קובץ מצורף (Word או PDF)</span><div class="th-file">${d.file ? `<button type="button" class="btn ghost small" id="pe-file-open">📎 ${pEsc(d.file.name)}</button><button type="button" class="btn ghost small" id="pe-file-rm" aria-label="הסרת הקובץ">✕</button>` : ''}<input type="file" id="pe-file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></div></div>
    </div>
    <label class="th-important"><input type="checkbox" id="pe-important"> שינוי חשוב: לשלוח לצוות גם מייל</label>
    <div class="th-actions"><button type="button" class="btn ghost" id="pe-save">שמירת טיוטה</button><button type="button" class="btn" id="pe-publish">פרסום</button>
      <button type="button" class="btn ghost" id="pe-versions"${row.published_version ? '' : ' disabled'}>גרסאות קודמות</button><button type="button" class="btn ghost" id="pe-print">הדפסה / PDF</button></div>
    <div id="pe-temple" class="th-temple"></div>
    <h3 class="psec">המסע בחלל</h3><div id="pe-journey"></div>
    <h3 class="psec">תצפיות מהצוות</h3><div id="pe-obs"></div>
    <h3 class="psec">מעקב, 8 שבועות</h3><div id="pe-track"></div>
  </div>`;
}
// the editor as it is on the screen now -> the draft
function planRead(root){
  const goals = [...root.querySelectorAll('.th-goal')].map(el => {
    const title = el.querySelector('.pe-g-title').value.trim(), lib = thpLib('goal').find(x => x.title === title);
    return { id:el.dataset.gid, title, library_id:lib ? lib.id : null, focus:el.querySelector('.pe-g-focus').checked,
      targets:el.querySelector('.pe-g-targets').value.trim(), interventions:el.querySelector('.pe-g-int').value.trim(),
      seen:el.querySelector('.pe-g-seen').value.trim(), needs:el.querySelector('.pe-g-needs').value.trim(), why:el.querySelector('.pe-g-why').value.trim(),
      planet_id:el.querySelector('.pe-g-planet').value || null, strengths:[...el.querySelectorAll('.pe-g-strengths [data-str]')].map(s => s.dataset.str) };
  }).filter(g => g.title || g.targets || g.interventions);
  const row = thp.plans[root.dataset.plan] || {}, base = row.draft || row.published || {};
  return { summary:root.querySelector('#pe-summary').value.trim(), avoid:root.querySelector('#pe-avoid').value.trim(), goals, file:base.file || null };
}
async function planSave(id, draft, review){
  const r = await sbPersonal.from('child_plans').upsert({ child_id:id, draft, review_date:review || null }).select('*').single();
  if(r.error) return false;
  thp.plans[id] = r.data; return true;
}
function planOpenEditor(id){
  thp.editing = id;
  const body = document.getElementById('therapy-body'); if(!body) return;
  body.innerHTML = planEditorHtml(id);
  const root = body.querySelector('.th-editor'), goalsBox = root.querySelector('#pe-goals');
  const wireGoal = el => {
    el.querySelector('.pe-g-rm').addEventListener('click', () => { el.remove(); });
    el.querySelector('.pe-g-focus').addEventListener('change', e => { if(e.target.checked && root.querySelectorAll('.pe-g-focus:checked').length > PLAN_FOCUS_MAX){ e.target.checked = false; toast(`אפשר עד ${PLAN_FOCUS_MAX} מטרות במוקד`); } });
    const strBox = el.querySelector('.pe-g-strengths'), strIn = el.querySelector('.pe-g-str-new');
    const addStr = () => { const v = cleanStrength(strIn.value); if(!v) return; if([...strBox.querySelectorAll('[data-str]')].some(s => s.dataset.str === v)){ strIn.value = ''; return; }
      strBox.insertAdjacentHTML('beforeend', `<span class="th-chip" data-str="${pEsc(v)}">${pEsc(v)} <button type="button" class="th-chip-x" aria-label="הסרה">✕</button></span>`); strIn.value = ''; };
    el.querySelector('.pe-g-str-add').addEventListener('click', addStr);
    strIn.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); addStr(); } });
    strBox.addEventListener('click', e => { const x = e.target.closest('.th-chip-x'); if(x) x.parentElement.remove(); });
  };
  root.querySelectorAll('.th-goal').forEach(wireGoal);
  root.querySelector('#pe-add-goal').addEventListener('click', () => {
    const tmp = document.createElement('div'); const g = planNewGoal();
    tmp.innerHTML = planGoalHtml(g, goalsBox.children.length); const el = tmp.firstElementChild; goalsBox.appendChild(el); wireGoal(el); el.querySelector('.pe-g-title').focus();
  });
  root.querySelector('#pe-back').addEventListener('click', () => { thp.editing = null; thpRender(); });
  const save = async () => { const ok = await planSave(id, planRead(root), root.querySelector('#pe-review').value); if(!ok) toast('השמירה נכשלה. אפשר לנסות שוב בעוד רגע'); return ok; };
  root.querySelector('#pe-save').addEventListener('click', async e => { e.target.disabled = true; if(await save()){ toast('הטיוטה נשמרה. הצוות עוד רואה את הגרסה שפורסמה'); planOpenEditor(id); } else e.target.disabled = false; });
  root.querySelector('#pe-publish').addEventListener('click', async e => {
    const d = planRead(root); if(!d.goals.length && !d.summary){ toast('צריך לפחות מטרה אחת או תקציר'); return; }
    const imp = root.querySelector('#pe-important').checked;
    if(!(await confirmSheet({ title:'לפרסם את התוכנית?', text:`היא נכנסת לתוקף מיד, והצוות מקבל הודעה בפורטל${imp ? ' וגם מייל' : ''}. הגרסה הקודמת נשמרת.`, okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
    e.target.disabled = true;
    if(!(await save())){ e.target.disabled = false; return; }
    const r = await sbPersonal.rpc('plan_publish', { p_child:id, p_important:imp });
    if(r.error){ e.target.disabled = false; toast('הפרסום נכשל. אפשר לנסות שוב בעוד רגע'); return; }
    toast(`התוכנית פורסמה (גרסה ${r.data}). הצוות קיבל הודעה.`);
    await thpLoad(); thp.editing = id; planOpenEditor(id);
  });
  root.querySelector('#pe-versions').addEventListener('click', () => planVersions(id));
  planTemple(id, root.querySelector('#pe-temple'));
  { const jb = root.querySelector('#pe-journey'), draw = async () => { jb.innerHTML = await journeyAdminHtml(id); journeyWireAdmin(jb, id, draw); }; draw(); }
  obsSection(id, root.querySelector('#pe-obs')); trackSection(id, root.querySelector('#pe-track'));
  root.querySelector('#pe-print').addEventListener('click', () => planPrint(id, planRead(root)));
  const fin = root.querySelector('#pe-file');
  fin.addEventListener('change', async () => {
    const f = fin.files && fin.files[0]; if(!f) return;
    if(f.size > 20 * 1024 * 1024){ toast('הקובץ גדול מדי (עד 20MB)'); fin.value = ''; return; }
    const path = `plans/${id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-60)}`;
    const up = await sbPersonal.storage.from('mercury').upload(path, f, { upsert:false, contentType:f.type || undefined });
    if(up.error){ toast('ההעלאה נכשלה'); return; }
    const d = planRead(root); d.file = { path, name:f.name };
    if(await planSave(id, d, root.querySelector('#pe-review').value)){ toast('הקובץ צורף לטיוטה'); planOpenEditor(id); }
  });
  const fo = root.querySelector('#pe-file-open'); if(fo) fo.addEventListener('click', async () => { const f = (thp.plans[id].draft || thp.plans[id].published || {}).file; if(!f) return; const s = await sbPersonal.storage.from('mercury').createSignedUrl(f.path, 300); if(s.error){ toast('לא הצלחנו לפתוח את הקובץ'); return; } window.open(s.data.signedUrl, '_blank', 'noopener'); });
  const fr = root.querySelector('#pe-file-rm'); if(fr) fr.addEventListener('click', async () => { const d = planRead(root); d.file = null; if(await planSave(id, d, root.querySelector('#pe-review').value)){ toast('הקובץ הוסר מהטיוטה'); planOpenEditor(id); } });
}
// the versions published before (read only)
async function planVersions(id){
  const r = await sbPersonal.from('child_plan_versions').select('version,content,published_at').eq('child_id', id).order('version', { ascending:false });
  if(r.error){ toast('לא הצלחנו לקרוא את הגרסאות'); return; }
  const sh = portalSheet(`<h2>גרסאות קודמות</h2><div class="th-versions">${(r.data || []).map(v => `<details class="pfold"><summary><span>גרסה ${v.version} · ${pEsc(dayLabel(String(v.published_at).slice(0, 10)))}</span></summary><div class="pfold-body">${planGuidanceHtml({ version:v.version, published_at:v.published_at, content:v.content })}</div></details>`).join('') || '<div class="pnote">עוד אין גרסאות.</div>'}</div>
    <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>סגירה</button></div>`);
  return sh;
}
// print / PDF (the therapist and the admin): the plan as on the screen, the thinking included
function planPrint(id, d){
  const c = roster.find(x => x.id === id), row = thp.plans[id] || {};
  let el = document.getElementById('print-sheet'); if(!el){ el = document.createElement('div'); el.id = 'print-sheet'; document.body.appendChild(el); }
  el.innerHTML = `<div class="th-print"><h1>תוכנית טיפולית · ${pEsc(displayName(c))}</h1>
    <div class="th-print-meta">${row.published_version ? 'גרסה ' + row.published_version : 'טיוטה'} · הודפס ${pEsc(dayLabel(isoDate(new Date())))}${row.review_date ? ' · בדיקה מחדש ' + pEsc(dayLabel(row.review_date)) : ''}</div>
    ${d.summary ? `<h2>תקציר</h2><p>${pEsc(d.summary)}</p>` : ''}${d.avoid ? `<h2>ממה להימנע</h2><p>${pEsc(d.avoid)}</p>` : ''}
    <h2>מטרות</h2>${(d.goals || []).map(g => `<div class="th-print-goal"><h3>${pEsc(g.title)}${g.focus ? ' · במוקד' : ''}</h3>
      ${g.targets ? `<p><b>יעדים נצפים:</b> ${pEsc(g.targets)}</p>` : ''}${g.interventions ? `<p><b>דרכי התערבות:</b> ${pEsc(g.interventions)}</p>` : ''}
      ${g.planet_id ? `<p><b>כוכב לכת:</b> ${pEsc(((thp.planets || []).find(p => p.id === g.planet_id) || {}).name || g.planet_id)}</p>` : ''}
      ${(g.strengths || []).length ? `<p><b>חוזקות:</b> ${g.strengths.map(pEsc).join(', ')}</p>` : ''}
      ${g.seen || g.needs || g.why ? `<p><b>חשיבה:</b> ${[g.seen, g.needs, g.why].filter(Boolean).map(pEsc).join(' · ')}</p>` : ''}</div>`).join('')}</div>`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch(e){ done(); }
  setTimeout(done, 60000);
}

// ---- the libraries: Mercury's (only the admin adds to it) and the center's (every therapist adds)
function planLibraryHtml(){
  const KIND = { goal:'מטרות', skill:'מיומנויות', strength:'חוזקות' }, admin = !!(srv.profile && srv.profile.admin);
  const item = x => `<div class="th-lib-item${x.active ? '' : ' off'}"><span><b>${pEsc(x.title)}</b>${x.description ? `<small>${pEsc(x.description)}</small>` : ''}</span><span class="th-lib-scope ${x.scope}">${x.scope === 'mercury' ? 'מרקורי' : 'המרכז'}</span>${admin || (x.scope === 'center' && x.created_by === srv.me) ? `<button type="button" class="btn ghost small" data-lib-toggle="${x.id}">${x.active ? 'הסתרה' : 'החזרה'}</button>` : ''}</div>`;
  return `<div class="pnote">שתי ספריות: של מרקורי (לכל המוסדות; מנהל המערכת מחליט מה נכנס אליה) ושל המרכז (כל איש/אשת טיפול מוסיפים). מה שמוסתר לא מוצע יותר.</div>
    <div class="th-lib-add"><select id="lib-kind" aria-label="סוג"><option value="goal">מטרה</option><option value="skill">מיומנות</option><option value="strength">חוזקה</option></select>
      <input type="text" id="lib-title" maxlength="60" placeholder="שם" aria-label="שם"><input type="text" id="lib-desc" maxlength="200" placeholder="הסבר קצר (רשות)" aria-label="הסבר">
      ${admin ? '<select id="lib-scope" aria-label="ספרייה"><option value="center">ספריית המרכז</option><option value="mercury">ספריית מרקורי</option></select>' : ''}<button type="button" class="btn" id="lib-add">הוספה</button></div>
    ${Object.keys(KIND).map(k => `<details class="pfold"${k === 'goal' ? ' open' : ''}><summary><span>${KIND[k]}</span><span class="pcount">${(thp.library || []).filter(x => x.kind === k && x.active).length}</span></summary><div class="pfold-body">${(thp.library || []).filter(x => x.kind === k).map(item).join('')}</div></details>`).join('')}`;
}
function planWireLibrary(body){
  const add = body.querySelector('#lib-add'); if(!add) return;
  add.addEventListener('click', async () => {
    const title = body.querySelector('#lib-title').value.trim(); if(!title){ toast('צריך שם'); return; }
    const kind = body.querySelector('#lib-kind').value, scopeSel = body.querySelector('#lib-scope');
    const row = { kind, title:kind === 'strength' ? cleanStrength(title) : title, description:body.querySelector('#lib-desc').value.trim() || null, scope:scopeSel ? scopeSel.value : 'center' };
    const r = await sbPersonal.from('mercury_library').insert(row);
    if(r.error){ toast(/duplicate|unique/i.test(r.error.message) ? 'כבר יש כזה בספרייה' : 'ההוספה נכשלה'); return; }
    toast('נוסף לספרייה'); await thpLoad(); thpRender();
  });
  body.querySelectorAll('[data-lib-toggle]').forEach(b => b.addEventListener('click', async () => {
    const x = (thp.library || []).find(y => y.id === b.dataset.libToggle); if(!x) return;
    const r = await sbPersonal.from('mercury_library').update({ active:!x.active }).eq('id', x.id);
    if(r.error){ toast('השינוי נכשל'); return; }
    await thpLoad(); thpRender();
  }));
}

// ---- stage 3: the child's temple as the staff sees it (only here, never on the kids' screen): every brick and its strength, a mark where the
// plan changed, and the child's strengths: the main ones, the new ones (chosen once), and the ones taken down (decisions 26, 27, 48)
async function planTemple(id, box){
  if(!box) return;
  try {
    const [st, ev, vs, ss] = await Promise.all([getChildState(id), sb.from('feedback_events').select('created_at').eq('child_id', id).eq('type', 'bricks').order('created_at'),
      sbPersonal.from('child_plan_versions').select('version,published_at').eq('child_id', id).order('version'), sbPersonal.from('child_strengths').select('*').eq('child_id', id).order('picks', { ascending:false })]);
    const n = (st && st.bricks) || 0, why = (st && st.brickWhy) || [], times = (ev.data || []).map(r => r.created_at).slice(-n);
    while(times.length < n) times.unshift(null);
    const marks = (vs.data || []).map(v => ({ v:v.version, at:v.published_at, before:times.filter(x => x && x < v.published_at).length + times.filter(x => !x).length }));
    let bricks = '';
    for(let i = 0; i < n; i++){
      marks.filter(m => m.before === i && i > 0).forEach(m => { bricks += `<span class="th-plan-mark" title="${pEsc(dayLabel(String(m.at).slice(0, 10)))}">התוכנית ${m.v === 1 ? 'פורסמה' : 'עודכנה'} · גרסה ${m.v}</span>`; });
      bricks += `<span class="th-brick"><small>${i + 1}</small>${pEsc(why[i] || '')}</span>`;
    }
    marks.filter(m => m.before >= n && n > 0).forEach(m => { bricks += `<span class="th-plan-mark">התוכנית ${m.v === 1 ? 'פורסמה' : 'עודכנה'} · גרסה ${m.v}</span>`; });
    const rows = ss.data || [], group = (status, title, btns) => { const l = rows.filter(r => r.status === status); return l.length ? `<div class="th-str-group"><b>${title}</b>${l.map(r => `<div class="th-str-row"><span>${pEsc(r.strength)} <small>(${r.picks})</small></span>${btns.map(([to, w]) => `<button type="button" class="btn ghost small" data-str-set="${pEsc(r.strength)}" data-to="${to}">${w}</button>`).join('')}</div>`).join('')}</div>` : ''; };
    box.innerHTML = `<h3 class="psec">המקדש של ${pEsc(displayName(roster.find(c => c.id === id)))} <small>(${n} לבנים)</small></h3>
      ${n ? `<div class="th-bricks">${bricks}</div>` : '<div class="pnote">עוד אין לבנים.</div>'}
      <h3 class="psec">החוזקות של הילד/ה</h3>
      <div class="pnote">חוזקה שנבחרה פעמיים על ידי שני מדריכים שונים עולה להצעות המרכזיות לבד. אפשר להוריד או להחזיר.</div>
      ${group('main', 'מרכזיות', [['removed', 'הורדה']])}${group('extra', 'הצעות נוספות', [['main', 'למרכזיות'], ['removed', 'הורדה']])}${group('removed', 'שהורדו', [['extra', 'החזרה']])}
      ${rows.length ? '' : '<div class="pnote">עוד לא נבחרו חוזקות על לבנים.</div>'}`;
    box.querySelectorAll('[data-str-set]').forEach(b => b.addEventListener('click', async () => {
      const r = await sbPersonal.rpc('strength_set', { p_child:id, p_strength:b.dataset.strSet, p_status:b.dataset.to });
      if(r.error){ toast('השינוי נכשל'); return; }
      planTemple(id, box);
    }));
  } catch(e){ box.innerHTML = ''; }
}
