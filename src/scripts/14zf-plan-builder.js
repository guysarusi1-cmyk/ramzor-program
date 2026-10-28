// ---------- MERCURY: THE THERAPY PLANS, REBUILT (Guy's walkthrough 2026-10-27/28; dist/mercury/walkthrough-2026-10-27.md) ----------
// A plan is built one goal at a time, step by step: how to start (theme / method / search) -> a goal (names only) -> 1-3 targets (each with
// its own spiral scale, "now" and "target") -> up to 3 interventions fitting the targets (sortable by approach; the approach in a faint word) ->
// the sentences to say, chosen one by one -> two summaries (the list, then exactly what the staff will see) -> into the plan. Every step is
// saved as a draft. A goal is in focus (1 by default, up to 3 by a center setting), waiting, achieved or stopped; the staff sees only the
// focus goals, the targets in plain words, the interventions with their approach, and the chosen sentences (2 visible, the rest under "עוד").
// The progress of a target is a spiral, not a line: a dot a day, from the journey steps, the observations, the incidents, the staff's 👍/👎
// and the therapist's monthly rating. The old fields of a goal (targets, interventions, sentences, focus) are kept in sync for the older screens.
const TP_STATUS = { focus:'במוקד', waiting:'בהמתנה', achieved:'הושגה', stopped:'הופסקה' };
const tpFocusMax = () => Math.max(1, Math.min(3, +((thp.mopts || {}).focus_max) || 1));
const tpStatusOf = g => g.status || (g.focus ? 'focus' : 'waiting');
const tpIsV2 = g => Array.isArray(g.targets_list);
const tpBankAge = id => { const b = bankAgeOf(id, ((thp.plans[id] || {}).draft) || {}); return b === '8-12' ? '5-8' : b; };          // (over 8: the 5-8 wording until there is a group, Q33)
const tpGoalsV2 = () => (thp.library || []).filter(x => x.kind === 'goal' && x.active && x.content && x.content.v === 2);
const tpUid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const tpDraftOf = id => { const r = thp.plans[id] || {}; return JSON.parse(JSON.stringify(r.draft || r.published || planEmpty())); };
// the old fields, for the screens that read them (the video, the documents, the old staff view)
function tpSync(g){
  const st = tpStatusOf(g); g.status = st; g.focus = st === 'focus';
  if(tpIsV2(g)){
    g.targets = g.targets_list.map(t => t.staff || t.text).filter(Boolean).join('\n');
    g.interventions = (g.interventions_list || []).map(i => `• ${i.name}: ${i.what}`).join('\n');
    g.sentences = (g.interventions_list || []).flatMap(i => i.sentences || []).join('\n');
  }
  return g;
}
async function tpSave(id, d){
  (d.goals || []).forEach(tpSync);
  const dates = (d.goals || []).filter(g => tpStatusOf(g) === 'focus' && g.review_date).map(g => g.review_date).sort();
  const ok = await planSave(id, d, dates[0] || (thp.plans[id] || {}).review_date || null);
  if(!ok) toast('השמירה נכשלה. אפשר לנסות שוב בעוד רגע');
  return ok;
}

// ---- the tab "תוכניות טיפוליות": a row per child, filters, search; a child opens the plan page
function tpListHtml(){
  if(thp.planChild) return '<div id="tp-page"></div>';
  const f = thp.tpFilter || 'all', q = thp.tpQ || '', kids = thpScope().filter(c => !q || displayName(c).includes(q));
  const need = c => { const r = thp.plans[c.id] || {}; return !r.published_version; }, review = c => { const r = thp.plans[c.id] || {}; return r.review_date && thpDaysTo(r.review_date) <= 14; };
  const list = kids.filter(c => f === 'all' || (f === 'need' && need(c)) || (f === 'review' && review(c)));
  const row = c => {
    const r = thp.plans[c.id] || {}, d = r.draft || r.published || {}, goals = d.goals || [], focus = goals.filter(g => tpStatusOf(g) === 'focus' && g.title);
    const n = s => goals.filter(g => tpStatusOf(g) === s).length, state = r.published_version ? (r.draft && JSON.stringify(r.draft) !== JSON.stringify(r.published) ? 'יש שינויים שלא פורסמו' : 'פורסמה') : (r.draft ? 'טיוטה' : 'אין תוכנית');
    return `<button type="button" class="tp-row" data-tp-kid="${pEsc(c.id)}">${thpAvatar(c)}<span class="tp-row-text"><b class="ar-keep">${pEsc(displayName(c))}</b>
      <small><span class="tp-state ${r.published_version ? 'ok' : ''}">${state}</span>${focus.length ? ` · 🎯 ${focus.map(g => pEsc(g.title)).join(' · ')}` : ''}</small>
      <small>${n('waiting') ? (n('waiting') === 1 ? 'מטרה אחת מחכה' : `${n('waiting')} מטרות מחכות`) : ''}${n('waiting') && n('achieved') ? ' · ' : ''}${n('achieved') ? (n('achieved') === 1 ? 'מטרה אחת הושגה' : `${n('achieved')} מטרות הושגו`) : ''}${r.review_date ? `${n('waiting') || n('achieved') ? ' · ' : ''}בדיקה מחדש ${pEsc(dayLabel(r.review_date))}` : ''}</small></span><span class="th-todo-go" aria-hidden="true">‹</span></button>`; };
  return `<div class="tp-filter">${[['all', 'כולם'], ['need', 'צריכים תוכנית'], ['review', 'לבדיקה מחדש']].map(([k, w]) => `<button type="button" class="th-chip${f === k ? ' on' : ''}" data-tp-f="${k}">${w}</button>`).join('')}
      <input type="search" id="tp-q" class="th-search" placeholder="חיפוש ילד/ה" aria-label="חיפוש ילד/ה" value="${pEsc(q)}"></div>
    <div class="tp-list">${list.map(row).join('') || `<div class="th-empty"><span aria-hidden="true">📋</span><b>${thpScope().length ? 'אין ילדים שמתאימים לסינון' : 'עוד לא שויכו אלייך ילדים'}</b><small>${thpScope().length ? 'אפשר לבחור "כולם".' : 'השיוך נעשה אצל הרכזת או מנהל המערכת.'}</small></div>`}</div>`;
}
function tpWireList(body){
  if(thp.planChild){ tpPlanPage(thp.planChild, body.querySelector('#tp-page')); return; }
  body.querySelectorAll('[data-tp-f]').forEach(b => b.addEventListener('click', () => { thp.tpFilter = b.dataset.tpF; thpRender(); }));
  const q = body.querySelector('#tp-q'); if(q) q.addEventListener('change', () => { thp.tpQ = q.value.trim(); thpRender(); });
  body.querySelectorAll('[data-tp-kid]').forEach(b => b.addEventListener('click', () => { thp.planChild = b.dataset.tpKid; thpRender(); }));
}
// open a child's plan from anywhere (the child's workspace, "משימות")
function tpOpenPlan(id){ thp.tab = 'plans'; thp.planChild = id; thp.editing = null; thp.wtab = null; thpRender(); }

// ---- the plan page: read first; the focus goals, then waiting / achieved / stopped (folded); "עוד"; ONE main button
function tpGoalCard(id, g, i, can){
  const st = tpStatusOf(g), v2 = tpIsV2(g);
  const targets = v2 ? g.targets_list.map((t, k) => `<details class="tp-target"><summary><span>יעד ${k + 1} – ${pEsc(t.text)}</span>${t.now ? `<em class="tp-now">עכשיו ${t.now}${t.target ? ' · רוצים ' + t.target : ''}</em>` : ''}</summary>
      <div class="tp-t-body"><div><span class="tp-lbl">לצוות:</span> ${pEsc(t.staff || '')}</div>${(t.scale || []).length ? `<ol class="tp-stations">${t.scale.map((s, j) => `<li class="${t.now === j + 1 ? 'now' : ''}${t.target === j + 1 ? ' goal' : ''}">${pEsc(s)}</li>`).join('')}</ol>` : ''}</div></details>`).join('')
    : (g.targets ? `<div class="tp-legacy"><span class="tp-lbl">יעדים:</span> ${pEsc(g.targets)}</div>` : '');
  const ints = v2 ? (g.interventions_list || []).map(x => `<div class="tp-int"><span><b>${pEsc(x.name)}</b> ${pEsc(x.what)}${x.freq ? ` <small>(${pEsc(x.freq)})</small>` : ''}${(x.sentences || []).length ? `<span class="tp-sent">${x.sentences.map(s => '💬 ' + pEsc(s)).join('<br>')}</span>` : ''}</span><em class="tp-appr">${pEsc(x.approach || '')}</em></div>`).join('')
    : (g.interventions ? `<div class="tp-legacy"><span class="tp-lbl">מה עושים:</span> ${pEsc(g.interventions)}</div>` : '');
  const acts = can ? `<div class="tp-acts">${v2 ? `<button type="button" class="btn ghost small" data-tp-edit="${i}">עריכה</button>` : ''}
      <details class="tp-more-acts"><summary aria-label="עוד פעולות">⋯</summary><div>${v2 ? `<button type="button" class="btn ghost small" data-tp-route="${i}">פתיחה במסלול</button>` : ''}
      ${st !== 'achieved' ? `<button type="button" class="btn ghost small" data-tp-ach="${i}">✓ הושגה</button>` : ''}${st === 'focus' ? `<button type="button" class="btn ghost small" data-tp-st="${i}" data-to="waiting">להמתנה</button>` : ''}
      ${st === 'waiting' || st === 'stopped' ? `<button type="button" class="btn ghost small" data-tp-st="${i}" data-to="focus">למוקד</button>` : ''}${st !== 'stopped' && st !== 'achieved' ? `<button type="button" class="btn ghost small" data-tp-stop="${i}">הפסקה</button>` : ''}</div></details></div>` : '';
  return `<details class="tp-goal st-${st}"${st === 'focus' ? ' open' : ''}><summary><b>מטרה ${i + 1} – ${pEsc(g.title || 'בלי שם')}</b>${g.planet_id ? '<span class="tp-planet" title="כוכב במסע">🪐</span>' : ''}</summary>
    <div class="tp-goal-body">${targets}${ints ? `<div class="tp-ints"><span class="tp-lbl">דרכי התערבות</span>${ints}</div>` : ''}
      ${(g.strengths || []).length ? `<div class="th-chips">${g.strengths.map(s => `<span class="th-chip">${pEsc(s)}</span>`).join('')}</div>` : ''}
      ${st === 'stopped' && g.stop_reason ? `<div class="pnote">הופסקה: ${pEsc(g.stop_reason)}</div>` : ''}${st === 'achieved' && g.achieved_at ? `<div class="pnote">הושגה ${pEsc(dayLabel(g.achieved_at))} 🎉</div>` : ''}
      ${g.review_date && st === 'focus' ? `<div class="pnote">בדיקה מחדש של המטרה: ${pEsc(dayLabel(g.review_date))}</div>` : ''}${acts}</div></details>`;
}
async function tpPlanPage(id, box){
  if(!box) return;
  const c = roster.find(x => x.id === id), row = thp.plans[id] || {}, d = row.draft || row.published || planEmpty(), can = planCanEdit(id), goals = (d.goals || []).filter(g => g.title || tpIsV2(g));
  const building = !!(d.builder && d.builder.step), diff = tpDiff(row), changed = diff.length > 0;          // (the goal being built is not a change to publish: the UX reviewer, finding 1)
  const group = s => goals.map((g, i) => ({ g, i })).filter(x => tpStatusOf(x.g) === s);
  const vd = (thp.videos || {})[id], vOld = row.published_version && (!vd || vd.version < row.published_version);
  const main = !can ? '' : changed ? '<button type="button" class="btn tp-main" id="tp-publish">פרסום</button>' : '<button type="button" class="btn tp-main" id="tp-new">+ מטרה חדשה</button>';          // (a goal being built: "להמשיך" in the status bar only)
  const bar = can && (changed || building || !row.published_version) ? `<div class="tp-statebar" role="status">${!row.published_version && !changed ? '<span>עוד לא פורסמה תוכנית</span>' : changed ? `<span><b>בטיוטה:</b> ${diff.length === 1 ? 'שינוי אחד שלא פורסם' : diff.length + ' שינויים שלא פורסמו'}</span>` : '<span>הכול פורסם</span>'}
      ${building ? `<span class="tp-sb-build">· מטרה אחת בבנייה <button type="button" class="btn ghost small" id="tp-resume2">להמשיך</button><button type="button" class="btn ghost small" id="tp-drop">לבטל</button></span>` : ''}</div>` : '';
  box.innerHTML = `<div class="tp-page"><div class="th-ed-head"><button type="button" class="btn ghost small" id="tp-back">→ כל התוכניות</button><div class="th-child-head">${c ? thpAvatar(c) : ''}<h2 class="ar-keep">${pEsc(c ? displayName(c) : careName(id))}</h2></div>
      <span class="th-status">${row.published_version ? 'פורסמה גרסה ' + row.published_version : 'עוד לא פורסמה'}</span></div>
    ${vd && vd.status === 'draft' ? `<div id="tp-video">${thpVideoPanelHtml(id)}</div>` : ''}
    ${bar}${main}${can && changed ? `<button type="button" class="btn ghost small tp-second" id="tp-new2">+ מטרה חדשה</button>` : ''}
    ${group('focus').length ? group('focus').map(x => tpGoalCard(id, x.g, x.i, can)).join('') : `<div class="th-empty"><span aria-hidden="true">🎯</span><b>עוד אין מטרה במוקד</b><small>${can ? 'בונים מטרה אחת, צעד אחר צעד: "+ מטרה חדשה".' : 'איש/אשת הטיפול האחראי/ת בונה את התוכנית.'}</small></div>`}
    ${[['waiting', 'בהמתנה'], ['achieved', 'הושגו'], ['stopped', 'הופסקו']].map(([s, w]) => group(s).length ? `<details class="pfold"><summary><span>${w}</span><span class="pcount">${group(s).length}</span></summary><div class="pfold-body">${group(s).map(x => tpGoalCard(id, x.g, x.i, can)).join('')}</div></details>` : '').join('')}
    ${can ? tpMoreHtml(id, d) : ''}
    <div class="tp-links">${row.published_version ? '<button type="button" class="btn ghost small" id="tp-versions">גרסאות קודמות</button>' : ''}<button type="button" class="btn ghost small" id="tp-docs">מסמכים</button>
      ${can && row.published_version ? `<button type="button" class="btn ghost small" id="tp-video-new"${vOld ? '' : ' disabled'} title="נוצר סרטון חדש מהתוכנית שפורסמה">🎬 סרטון חדש</button>` : ''}</div></div>`;
  const $ = s => box.querySelector(s), on = (s, f) => { const el = $(s); if(el) el.addEventListener('click', f); };
  on('#tp-back', () => { thp.planChild = null; thpRender(); });
  const fresh = () => { if(!building){ tpBuilder(id, null); return; }          // (never erase a goal being built by default or by a tap outside: the checker, round 3)
    const s2 = portalSheet(`<h2>יש מטרה שבבנייה</h2><div class="cs-rebuild-opts"><button type="button" class="btn" data-fr="keep"><b>להמשיך אותה</b><small>מהמקום שעצרת</small></button>
      <button type="button" class="btn ghost danger" data-fr="new"><b>להתחיל מטרה חדשה</b><small>המטרה שבבנייה תימחק</small></button></div><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>חזרה</button></div>`);
    s2.querySelectorAll('[data-fr]').forEach(b => b.addEventListener('click', () => { s2.close(); tpBuilder(id, b.dataset.fr === 'keep' ? d.builder : null); })); };
  on('#tp-new', fresh); on('#tp-new2', fresh); on('#tp-resume', () => tpBuilder(id, d.builder)); on('#tp-resume2', () => tpBuilder(id, d.builder));
  on('#tp-drop', async () => { if(!(await confirmSheet({ title:'לבטל את המטרה שבבנייה?', text:'מה שנבחר בה עד עכשיו יימחק. שאר התוכנית לא משתנה.', okLabel:'כן, לבטל', cancelLabel:'חזרה', danger:true }))) return;
    const dd = tpDraftOf(id); delete dd.builder; if(await tpSave(id, dd)) tpPlanPage(id, box); });
  on('#tp-publish', () => tpPublish(id));
  on('#tp-versions', () => planVersions(id));
  on('#tp-docs', () => { thp.tab = 'mine'; planOpenEditor(id, 'docs'); });
  on('#tp-video-new', async () => { const r = await sbPersonal.rpc('plan_video_request', { p_child:id }); if(r.error){ toast(/plan_video_request/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v44.sql' : 'לא הצלחנו ליצור סרטון'); return; } toast('נוצר סרטון חדש. הוא מחכה לאישור שלך למעלה'); await thpVideosLoad(); tpPlanPage(id, box); });
  const vb = $('#tp-video'); if(vb) thpVideoWire(vb, id, () => tpPlanPage(id, box));
  const edit = async f => { const dd = tpDraftOf(id); if(await f(dd) === false) return; if(await tpSave(id, dd)) tpPlanPage(id, box); };
  box.querySelectorAll('[data-tp-st]').forEach(b => b.addEventListener('click', () => edit(dd => { const g = dd.goals[+b.dataset.tpSt];
    if(b.dataset.to === 'focus' && dd.goals.filter(x => tpStatusOf(x) === 'focus').length >= tpFocusMax()){ toast(tpFocusMax() === 1 ? 'יש כבר מטרה במוקד. קודם מעבירים אותה להמתנה' : `אפשר עד ${tpFocusMax()} מטרות במוקד`); return false; }
    g.status = b.dataset.to; })));
  box.querySelectorAll('[data-tp-stop]').forEach(b => b.addEventListener('click', async () => {
    const sh = portalSheet(`<h2>להפסיק את המטרה?</h2><div class="pnote">המטרה לא נמחקת: היא נשמרת ב"הופסקו", עם הסיבה.</div><label class="pfield">למה? (רשות)<input type="text" id="tp-why" maxlength="160"></label>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>חזרה</button><button type="button" class="btn" id="tp-stop-go">הפסקה</button></div>`);
    sh.querySelector('#tp-stop-go').addEventListener('click', () => { const why = sh.querySelector('#tp-why').value.trim(); sh.close(); edit(dd => { const g = dd.goals[+b.dataset.tpStop]; g.status = 'stopped'; g.stop_reason = why; }); });
  }));
  box.querySelectorAll('[data-tp-ach]').forEach(b => b.addEventListener('click', async () => {
    const dd = tpDraftOf(id), g = dd.goals[+b.dataset.tpAch];
    if(!(await confirmSheet({ title:`"${g.title}" הושגה?`, text:'המטרה עוברת ל"הושגו" עם התאריך, והצוות מקבל הודעה בפורטל. אחר כך אפשר להעלות מטרה מ"בהמתנה" או לבנות חדשה.', okLabel:'כן, הושגה 🎉', cancelLabel:'חזרה' }))) return;
    g.status = 'achieved'; g.achieved_at = careToday();
    const others = tpDiff(thp.plans[id] || {}).length;
    if(others && !(await confirmSheet({ title:'הסימון נכנס לתוקף מיד', text:`יש בטיוטה עוד ${others === 1 ? 'שינוי אחד' : others + ' שינויים'} שלא פורסמו. גם הם יפורסמו עכשיו.`, okLabel:'לפרסם הכול', cancelLabel:'חזרה' }))) return;
    if(!(await tpSave(id, dd))) return;
    { const r = await sbPersonal.rpc('plan_publish', { p_child:id, p_important:false, p_full:false }); if(!r.error) await thpLoad(); }          // ("הושגה" is published at once, with the notice: Guy, after the UX review)
    sbPersonal.rpc('goal_achieved_notice', { p_child:id, p_goal:g.title }).then(() => {}, () => {});
    const waiting = dd.goals.filter(x => tpStatusOf(x) === 'waiting');
    toast('כל הכבוד! הצוות קיבל הודעה', 5000); tpPlanPage(id, box);
    if(!dd.goals.some(x => tpStatusOf(x) === 'focus')){
      const s2 = portalSheet(`<h2>מה במוקד עכשיו?</h2><div class="cs-rebuild-opts">${waiting.map(x => `<button type="button" class="btn ghost" data-up="${pEsc(x.id)}"><b>${pEsc(x.title)}</b><small>מ"בהמתנה"</small></button>`).join('')}
        <button type="button" class="btn ghost" data-up="new"><b>+ מטרה חדשה</b><small>בונים צעד אחר צעד</small></button></div><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>אחר כך</button></div>`);
      s2.querySelectorAll('[data-up]').forEach(u => u.addEventListener('click', () => { s2.close(); if(u.dataset.up === 'new') tpBuilder(id, null); else edit(d3 => { const x = d3.goals.find(y => y.id === u.dataset.up); if(x) x.status = 'focus'; }); }));
    }
  }));
  box.querySelectorAll('[data-tp-edit]').forEach(b => b.addEventListener('click', () => tpEditGoal(id, +b.dataset.tpEdit, () => tpPlanPage(id, box))));
  box.querySelectorAll('[data-tp-route]').forEach(b => b.addEventListener('click', () => { const g = tpDraftOf(id).goals[+b.dataset.tpRoute]; tpBuilder(id, tpStateFromGoal(id, g)); }));
  tpWireMore(id, box, () => tpPlanPage(id, box));
}
// "עוד": the summary (with a suggestion), "ברגעים קשים" (what to avoid stands out, signs, what calms), routine, the child's gender, a file
function tpMoreHtml(id, d){
  const part = (k, w, cls) => `<label class="pfield${cls ? ' ' + cls : ''}">${w} <button type="button" class="btn ghost small th-tpl-btn" data-tpl="${k}">📚</button><textarea id="tm-${k}" rows="2">${pEsc(d[k] || '')}</textarea></label>`;
  return `<details class="pfold tp-more"><summary><span>עוד</span><small>תקציר, ברגעים קשים, שגרה ועוד</small></summary><div class="pfold-body">
    <label class="pfield">תקציר לצוות <button type="button" class="btn ghost small" id="tm-suggest">הצעה</button><textarea id="tm-summary" rows="3" placeholder="כמה משפטים: מה חשוב לדעת עכשיו">${pEsc(d.summary || '')}</textarea></label>
    <h3 class="psec">ברגעים קשים</h3>${part('avoid', 'ממה להימנע', 'th-avoid-field')}${part('signs', 'אותות מוקדמים')}${part('calm', 'מה עוזר להירגע')}
    ${part('routine', 'שגרה יומית מיוחדת')}
    <label class="pfield">הילד/ה (לנוסחים)<select id="tm-gender"><option value="">לא צוין</option><option value="m"${d.gender === 'm' ? ' selected' : ''}>בן</option><option value="f"${d.gender === 'f' ? ' selected' : ''}>בת</option></select></label>
    <details class="pfold"><summary><span>עוזר חשיבה (לא מוצג לצוות)</span></summary><div class="pfold-body"><textarea id="tm-think" rows="3">${pEsc(d.thinking || '')}</textarea></div></details>
    <div class="pfield"><span>קובץ מצורף</span>${d.file ? `<span class="pnote">📎 ${pEsc(d.file.name)}</span>` : ''}<input type="file" id="tm-file" accept=".pdf,.doc,.docx"></div>
    <button type="button" class="btn" id="tm-save">שמירה</button></div></details>`;
}
function tpWireMore(id, box, after){
  const s = box.querySelector('#tm-save'); if(!s) return;
  box.querySelectorAll('.tp-more .th-tpl-btn').forEach(b => b.addEventListener('click', () => { const ta = box.querySelector('#tm-' + b.dataset.tpl);
    bankPick(b.dataset.tpl, { age:tpBankAge(id), onPick:(x, age) => { ta.value = bankJoin(ta.value, bankPartText(x, age, box.querySelector('#tm-gender').value)); } }); }));
  box.querySelector('#tm-suggest').addEventListener('click', async () => { const d = tpDraftOf(id), f = (d.goals || []).filter(g => tpStatusOf(g) === 'focus'), nm = careName(id);
    const t = box.querySelector('#tm-summary');
    if(t.value.trim() && !(await confirmSheet({ title:'להחליף את התקציר בהצעה?', text:'ההצעה נבנית מהמטרה שבמוקד. אפשר לערוך אותה אחר כך.', okLabel:'כן, להחליף', cancelLabel:'חזרה' }))) return;
    t.value = f.length ? `כרגע במוקד: ${f.map(g => g.title).join(', ')}. ${f.map(g => g.why_staff || '').filter(Boolean).join(' ')} ${d.avoid ? 'חשוב לזכור ממה להימנע.' : ''}`.replace(/\s+/g, ' ').trim() : `${nm}: [מה חשוב לדעת עכשיו].`; });
  s.addEventListener('click', async () => {
    const d = tpDraftOf(id), v = k => box.querySelector('#tm-' + k).value.trim();
    Object.assign(d, { summary:v('summary'), avoid:v('avoid'), signs:v('signs'), calm:v('calm'), routine:v('routine'), gender:box.querySelector('#tm-gender').value, thinking:v('think') });
    const fin = box.querySelector('#tm-file'), f = fin.files && fin.files[0];
    if(f){ if(f.size > 20 * 1024 * 1024){ toast('הקובץ גדול מדי (עד 20MB)'); return; }
      const path = `plans/${id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-60)}`, up = await sbPersonal.storage.from('mercury').upload(path, f, { upsert:false, contentType:f.type || undefined });
      if(up.error){ toast('ההעלאה נכשלה'); return; } d.file = { path, name:f.name }; }
    if(await tpSave(id, d)){ toast('נשמר בטיוטה'); after(); }
  });
}
// what the draft changes against the published plan, in words (the goal being built is not counted): the status bar and the publish window
function tpDiff(row){
  const d = row.draft; if(!d) return [];
  const p = row.published || { goals:[] }, out = [], strip = g => { const x = Object.assign({}, g); delete x.status; delete x.focus; return JSON.stringify(x); };
  const pg = {}; (p.goals || []).forEach(g => { pg[g.id] = g; });
  (d.goals || []).filter(g => g.title || tpIsV2(g)).forEach(g => { const o = pg[g.id];
    if(!o) out.push(`נוספה מטרה: ${g.title}`);
    else { if(tpStatusOf(o) !== tpStatusOf(g)) out.push(`${g.title}: ${TP_STATUS[tpStatusOf(g)]}`); if(strip(o) !== strip(g)) out.push(`שונתה: ${g.title}`); } });
  [['summary', 'התקציר'], ['avoid', 'ממה להימנע'], ['signs', 'אותות מוקדמים'], ['calm', 'מה מרגיע'], ['routine', 'השגרה']].forEach(([k, w]) => { if((d[k] || '') !== (p[k] || '')) out.push(`שונה: ${w}`); });
  return out;
}
// publishing: a video when the goal in focus changed (Q13); no e-mail (decision 19)
async function tpPublish(id){
  const row = thp.plans[id] || {}, d = row.draft; if(!d) return;
  const blank = [d.summary, d.avoid, d.signs, d.calm, ...(d.goals || []).flatMap(g => [g.targets, g.interventions, g.sentences])].map(t => String(t || '').match(PLAN_BLANK)).find(Boolean);
  if(blank){ toast(`יש עוד מקום להשלמה: ${blank[0]}. ממלאים אותו לפני הפרסום`, 6000); return; }
  const fk = x => JSON.stringify((x && x.goals || []).filter(g => tpStatusOf(g) === 'focus').map(g => [g.id, g.title, g.targets, g.interventions]));
  const full = !row.published_version || fk(d) !== fk(row.published);
  const what = tpDiff(row).slice(0, 6).join(' · ');          // (what will change for the staff: the UX reviewer, finding 4)
  if(!(await confirmSheet({ title:'לפרסם את התוכנית?', text:`${what ? 'מה משתנה: ' + what + '. ' : ''}${full ? 'זה נכנס לתוקף מיד, ונוצר סרטון מהמטרה שבמוקד. אחרי שתאשרי את הסרטון, הצוות מקבל הודעה בפורטל.' : 'זה נכנס לתוקף מיד. המטרה שבמוקד לא השתנתה, אז לא נוצר סרטון.'}`, okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
  const r = await sbPersonal.rpc('plan_publish', { p_child:id, p_important:false, p_full:full });
  if(r.error){ toast('הפרסום נכשל. אפשר לנסות שוב בעוד רגע'); return; }
  toast(full ? 'התוכנית פורסמה. נוצר סרטון שמחכה לאישור שלך' : 'התוכנית פורסמה', 5000);
  await thpLoad(); thp.planChild = id; thpRender();
}

// ---- editing a goal in place (a word, a sentence); bigger changes: "פתיחה במסלול"
function tpEditGoal(id, gi, after){
  const d = tpDraftOf(id), g = d.goals[gi]; if(!g) return;
  const sh = portalSheet(`<h2>עריכה: ${pEsc(g.title)}</h2>
    <label class="pfield">שם המטרה<input type="text" id="te-title" maxlength="80" value="${pEsc(g.title)}"></label>
    ${(g.targets_list || []).map((t, k) => `<div class="tp-ed-block"><b>יעד ${k + 1}</b><label class="pfield">מקצועי<textarea data-te-t="${k}" data-f="text" rows="2">${pEsc(t.text)}</textarea></label><label class="pfield">לצוות<input type="text" data-te-t="${k}" data-f="staff" value="${pEsc(t.staff || '')}"></label></div>`).join('')}
    ${(g.interventions_list || []).map((x, k) => `<div class="tp-ed-block"><b>${pEsc(x.name)}</b><label class="pfield">מה עושים<textarea data-te-i="${k}" data-f="what" rows="2">${pEsc(x.what)}</textarea></label><label class="pfield">תדירות<input type="text" data-te-i="${k}" data-f="freq" value="${pEsc(x.freq || '')}"></label>
      <label class="pfield">משפטים (משפט בכל שורה)<textarea data-te-i="${k}" data-f="sentences" rows="2">${pEsc((x.sentences || []).join('\n'))}</textarea></label></div>`).join('')}
    <label class="pfield">בדיקה מחדש של המטרה<input type="date" id="te-review" value="${pEsc(g.review_date || '')}"></label>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="te-save">שמירה</button></div>`);
  sh.querySelector('#te-save').addEventListener('click', async () => {
    g.title = sh.querySelector('#te-title').value.trim() || g.title; g.review_date = sh.querySelector('#te-review').value || g.review_date;
    sh.querySelectorAll('[data-te-t]').forEach(el => { g.targets_list[+el.dataset.teT][el.dataset.f] = el.value.trim(); });
    sh.querySelectorAll('[data-te-i]').forEach(el => { const x = g.interventions_list[+el.dataset.teI]; x[el.dataset.f] = el.dataset.f === 'sentences' ? el.value.split('\n').map(s => s.trim()).filter(Boolean) : el.value.trim(); });
    if(await tpSave(id, d)){ sh.close(); toast('נשמר בטיוטה'); after(); }
  });
}

// ---- the builder: one goal, step by step (Q1-20). The state is saved in the draft ("builder") after every step.
const TP_STEPS = [['start', 'התחלה'], ['pick', 'בחירה'], ['goal', 'מטרה'], ['targets', 'יעדים'], ['ints', 'התערבות'], ['sents', 'משפטים'], ['journey', 'מסע ומקדש'], ['sum', 'סיכום'], ['preview', 'לצוות']];
function tpStateFromGoal(id, g){
  const x = (thp.library || []).find(y => y.id === g.library_id), age = (g.bank && g.bank.age) || tpBankAge(id);
  return { step:'targets', editIndex:(tpDraftOf(id).goals || []).findIndex(y => y.id === g.id), goalId:g.id, libId:g.library_id || null, title:g.title, theme:g.theme || '', age,
    targets:(g.targets_list || []).map(t => Object.assign({}, t)), ints:(g.interventions_list || []).map(i => Object.assign({}, i, { sentencesAll:((x && ((x.content.ages[age] || {}).interventions || []).find(b => b.id === i.id)) || {}).sentences || i.sentences })),
    strengths:(g.strengths || []).slice(), planet:g.planet_id || '', status:tpStatusOf(g), why:g.why_staff || '' };
}
async function tpBuilder(id, state){
  const s = state ? JSON.parse(JSON.stringify(state)) : { step:'start', age:tpBankAge(id), targets:[], ints:[], strengths:[], planet:'' };
  if(!s.age) s.age = tpBankAge(id) || '5-8';
  const body = document.getElementById('therapy-body'); if(!body) return;
  let gender = (tpDraftOf(id).gender) || ''; const G = t => bankGender(t || '', gender), lib = () => s.libId ? (thp.library || []).find(y => y.id === s.libId) : null, ageW = () => { const x = lib(); return x ? (x.content.ages[s.age] || x.content.ages['5-8'] || {}) : {}; };
  const persist = async () => { const d = tpDraftOf(id); d.builder = Object.assign({}, s); await planSave(id, d, (thp.plans[id] || {}).review_date || null); };
  const go = async step => { s.step = step; await persist(); draw(); };
  const c = roster.find(x => x.id === id);
  const nav = (next, label, disabled, why) => `<div class="tp-nav">${TP_STEPS.findIndex(x => x[0] === s.step) > 0 ? '<button type="button" class="btn ghost" id="tb-prev">→ הקודם</button>' : '<span></span>'}${next ? `<span class="tp-nav-go">${disabled && why ? `<small>${why}</small>` : ''}<button type="button" class="btn" id="tb-next"${disabled ? ' disabled' : ''}>${label || 'הבא ←'}</button></span>` : ''}</div>`;
  function draw(){
    const i0 = TP_STEPS.findIndex(x => x[0] === s.step);
    let inner = '';
    if(s.step === 'start') inner = `${gender ? '' : `<div class="tp-gender"><span>${pEsc(c ? displayName(c) : '')}:</span><div class="pchoice"><button type="button" data-gender="m">בן</button><button type="button" data-gender="f">בת</button></div><small>כדי שהנוסחים ייכתבו נכון. שואלים פעם אחת.</small></div>`}
      <h2>איך תרצי להתחיל?</h2><div class="tp-big">${[['theme', '🧭', 'לפי תמה', 'ויסות, ביטחון, אובדן...'], ['method', '🧩', 'לפי שיטה', 'ARC, Theraplay, סמכות חדשה...'], ['search', '🔎', 'חיפוש', 'מילה שמתארת את מה שצריך']].map(([k, e, w, sub]) => `<button type="button" class="tp-bigbtn" data-entry="${k}"><span aria-hidden="true">${e}</span><b>${w}</b><small>${sub}</small></button>`).join('')}</div>
      <button type="button" class="btn ghost small" id="tb-own">משהו משלי: מטרה שאני כותבת</button>`;
    else if(s.step === 'pick'){
      const nGoals = n => n === 1 ? 'מטרה אחת' : n + ' מטרות';          // (only what exists is offered: the checker, principle 10)
      if(s.entry === 'theme') inner = `<h2>איזו תמה?</h2><div class="tp-grid">${PLAN_CATS.map(t => [t, tpGoalsV2().filter(x => bankThemesOf(x).includes(t)).length]).filter(x => x[1]).map(([t, n]) => `<button type="button" class="tp-tile" data-theme="${pEsc(t)}"><b>${pEsc(t)}</b><small>${nGoals(n)}</small></button>`).join('') || '<div class="pnote">עוד אין מטרות בבנק. אפשר "משהו משלי".</div>'}</div>`;
      else if(s.entry === 'method') inner = `<h2>איזו שיטה?</h2><div class="tp-grid">${bankMethods().map(m => [m, tpGoalsV2().filter(x => (x.methods || []).includes(m)).length]).filter(x => x[1]).map(([m, n]) => { const card = (thp.library || []).find(y => y.kind === 'method' && y.title === m);
        return `<div class="tp-tile-wrap"><button type="button" class="tp-tile" data-method="${pEsc(m)}"><b>${pEsc(m)}</b><small>${nGoals(n)}</small></button>${card ? `<details class="tp-mcard"><summary>מה זו?</summary><div>${pEsc(card.description || '')}</div></details>` : ''}</div>`; }).join('') || '<div class="pnote">עוד אין מטרות בבנק. אפשר "משהו משלי".</div>'}</div>`;
      else inner = `<h2>חיפוש</h2><input type="search" id="tb-q" class="th-search" placeholder="למשל: מעברים, להירגע, פרידה" value="${pEsc(s.q || '')}"><div id="tb-res"></div>`;
      inner += nav(false);
    }
    else if(s.step === 'goal'){
      const l = tpGoalsV2().filter(x => s.entry === 'theme' ? bankThemesOf(x).includes(s.theme) : s.entry === 'method' ? (x.methods || []).includes(s.method) : `${x.title} ${x.description || ''} ${JSON.stringify(x.content)}`.includes(s.q || ''));
      inner = `<h2>איזו מטרה?</h2><div class="tp-names">${l.map(x => `<button type="button" class="tp-name${s.libId === x.id ? ' on' : ''}" data-goal="${x.id}">${pEsc(G(x.title))}${x.draft ? ' <small class="bk-draft" title="נוסח שמנהל המערכת עוד לא בדק">נוסח בבדיקה</small>' : ''}</button>`).join('') || '<div class="pnote">אין מטרות כאן עדיין.</div>'}</div>
        ${l.some(x => x.draft) ? '<div class="pnote">"נוסח בבדיקה" = נוסח שעוד לא נבדק ואושר. אפשר להשתמש בו ולערוך.</div>' : ''}
        <details class="pfold"><summary><span>משהו משלי</span></summary><div class="pfold-body"><input type="text" id="tb-own-title" maxlength="80" placeholder="שם המטרה" value="${s.libId ? '' : pEsc(s.title || '')}"><button type="button" class="btn small" id="tb-own-go">המשך עם המטרה שלי</button></div></details>${nav(false)}`;
    }
    else if(s.step === 'targets'){
      const w = ageW(), sel = new Set(s.targets.map(t => t.id)), bank = (w.targets || []);
      const mean = (t, k) => t[k] ? `<div class="tp-rate-mean">${t[k]} = ${pEsc((t.scale || [])[t[k] - 1] || '')}</div>` : '<div class="tp-rate-mean dim">בוחרים מספר, ורואים כאן מה הוא אומר</div>';          // (the meaning of the number: the UX reviewer, finding 2)
      const row = (t, k, w) => `<div role="group" aria-label="${w}"><span>${w}</span>${[1, 2, 3, 4, 5].map(v => `<button type="button" class="${t[k] === v ? 'on' : ''}" aria-pressed="${t[k] === v}" aria-label="${w} ${v}: ${pEsc((t.scale || [])[v - 1] || '')}" data-rate="${pEsc(t.id)}" data-k="${k}" data-v="${v}">${v}</button>`).join('')}</div>${mean(t, k)}`;
      const ratings = t => `<div class="tp-rate">${row(t, 'now', 'איפה עכשיו')}${row(t, 'target', 'לאן רוצים להגיע')}</div>`;
      const scaleEd = t => `<details class="tp-scale-ed"><summary>הספירלה של היעד (5 תחנות)</summary>${[0, 1, 2, 3, 4].map(k => `<input type="text" data-scale="${pEsc(t.id)}" data-k="${k}" value="${pEsc((t.scale || [])[k] || '')}" placeholder="${k + 1}">`).join('')}</details>`;
      inner = `<h2>יעדים <small>(1–3)</small></h2>${s.age !== tpBankAge(id) || bankAgeOf(id, {}) === '8-12' ? '<div class="pnote">לילדים מעל 8: בינתיים מוצג הנוסח של גילאי 5–8.</div>' : ''}
        ${bank.map(t => { const on = sel.has(t.id), mine = s.targets.find(x => x.id === t.id) || t;
          return `<div class="tp-pick${on ? ' on' : ''}"><label><input type="checkbox" data-target="${pEsc(t.id)}"${on ? ' checked' : ''}> <span><b>${pEsc(G(t.text))}</b><small>לצוות: ${pEsc(G(t.staff))}</small></span></label>${on ? scaleEd(mine) + ratings(mine) : ''}</div>`; }).join('')}
        ${s.targets.filter(t => t.own).map(t => `<div class="tp-pick on"><span><b>${pEsc(t.text)}</b><small>לצוות: ${pEsc(t.staff)}</small></span>${scaleEd(t)}${ratings(t)}<button type="button" class="btn ghost small" data-own-x="${pEsc(t.id)}">הסרה</button></div>`).join('')}
        <details class="pfold"><summary><span>משהו משלי</span></summary><div class="pfold-body"><textarea id="tb-t-text" rows="2" placeholder="היעד, במילים מקצועיות"></textarea><input type="text" id="tb-t-staff" placeholder="במילים פשוטות לצוות"><button type="button" class="btn small" id="tb-t-add">הוספה</button></div></details>
        ${nav(true, null, !s.targets.length, 'בחרי לפחות יעד אחד')}`;
    }
    else if(s.step === 'ints'){
      const w = ageW(), tids = new Set(s.targets.map(t => t.id)), all = (w.interventions || []);
      let l = s.showAll ? all : all.filter(x => (x.targets || []).some(t => tids.has(t)));
      const by = s.sortAppr ? [...new Set(l.map(x => x.approach))] : null, sel = new Set(s.ints.map(x => x.id));
      const item = x => `<label class="tp-int-pick${sel.has(x.id) ? ' on' : ''}"><input type="checkbox" data-int="${pEsc(x.id)}"${sel.has(x.id) ? ' checked' : ''}><span><b>${pEsc(G(x.name))}</b> ${pEsc(G(x.what))}<small>${pEsc(G(x.freq || ''))}</small></span><em class="tp-appr">${pEsc(x.approach)}</em></label>`;
      inner = `<h2>דרכי התערבות <small>(עד 3)</small></h2><div class="tp-tools"><label><input type="checkbox" id="tb-sort"${s.sortAppr ? ' checked' : ''}> מיון לפי גישה</label>${all.length > l.length || s.showAll ? `<label><input type="checkbox" id="tb-all"${s.showAll ? ' checked' : ''}> כל דרכי ההתערבות של המטרה</label>` : ''}</div>
        ${by ? by.map(a => `<h3 class="psec tp-appr-h">${pEsc(a)}</h3>${l.filter(x => x.approach === a).map(item).join('')}`).join('') : l.map(item).join('')}
        ${s.ints.filter(x => x.own).map(x => `<div class="tp-int-pick on"><span><b>${pEsc(x.name)}</b> ${pEsc(x.what)}</span><em class="tp-appr">${pEsc(x.approach || '')}</em><button type="button" class="btn ghost small" data-own-ix="${pEsc(x.id)}">הסרה</button></div>`).join('')}
        <details class="pfold"><summary><span>משהו משלי</span></summary><div class="pfold-body"><input type="text" id="tb-i-name" placeholder="שם קצר"><textarea id="tb-i-what" rows="2" placeholder="מה עושים"></textarea><select id="tb-i-appr">${bankMethods().map(m => `<option>${pEsc(m)}</option>`).join('')}</select><button type="button" class="btn small" id="tb-i-add">הוספה</button></div></details>
        ${nav(true, null, !s.ints.length, 'בחרי לפחות דרך התערבות אחת')}`;
    }
    else if(s.step === 'sents'){
      inner = `<h2>משפטים לומר לילד/ה</h2><div class="pnote">בוחרים אחד אחד. רק מה שבחרת יגיע לצוות.</div>
        ${s.ints.map(x => `<div class="tp-sent-block"><b>${pEsc(x.name)}</b><div class="tp-chips">${(x.sentencesAll || []).map((t, k) => `<button type="button" class="th-chip${(x.sentences || []).includes(G(t)) ? ' on' : ''}" data-sent="${pEsc(x.id)}" data-k="${k}">💬 ${pEsc(G(t))}</button>`).join('')}</div>
          ${(x.sentences || []).filter(t => !(x.sentencesAll || []).map(G).includes(t)).map(t => `<span class="th-chip on">💬 ${pEsc(t)}</span>`).join('')}
          <div class="th-add-row"><input type="text" data-own-sent="${pEsc(x.id)}" placeholder="משפט משלי"><button type="button" class="btn ghost small" data-own-sent-add="${pEsc(x.id)}">הוספה</button></div></div>`).join('')}${nav(true)}`;
    }
    else if(s.step === 'journey'){          // (its own step: Guy, after the simplicity checker)
      const x = lib(), sug = ((x && x.content.strengths) || []).slice(0, 5), planets = (thp.planets || []).filter(p => p.active);
      if(s.planet === '' && s.planet !== null){ const p = bankPlanetFor({ title:s.title, skills:(x && x.content.skills) || [] }); if(p) s.planet = p; }
      inner = `<h2>המסע בחלל והמקדש</h2>
        <div class="pfield"><span>חוזקות למקדש (עד 3) <small>המדריכים יציעו אותן לילד/ה כשבונים לבנה במקדש</small></span><div class="tp-chips">${[...new Set([...sug, ...s.strengths])].map(t => `<button type="button" class="th-chip${s.strengths.includes(t) ? ' on' : ''}" data-str="${pEsc(t)}">${pEsc(t)}</button>`).join('')}</div>
          <div class="th-add-row"><input type="text" id="tb-str" maxlength="20" placeholder="חוזקה משלי"><button type="button" class="btn ghost small" id="tb-str-add">הוספה</button></div></div>
        <label class="pfield">כוכב במסע <small>הכוכב שהילד/ה טס/ה אליו במסע בחלל, לפי המיומנות שמתרגלים</small><select id="tb-planet"><option value="">בלי כוכב בינתיים</option>${planets.map(p => `<option value="${pEsc(p.id)}"${s.planet === p.id ? ' selected' : ''}>${pEsc(p.name)} · ${pEsc(p.skill)}</option>`).join('')}</select></label>
        ${nav(true)}`;
    }
    else if(s.step === 'sum'){
      const focusN = tpDraftOf(id).goals.filter(g => tpStatusOf(g) === 'focus' && g.id !== s.goalId).length;
      if(!s.status) s.status = focusN < tpFocusMax() ? 'focus' : 'waiting';          // (decided by itself; changed on the plan page)
      inner = `<h2>סיכום</h2><div class="tp-sum"><div><span class="tp-lbl">מטרה</span><b>${pEsc(G(s.title))}</b> <em class="tp-now">${s.status === 'focus' ? 'תיכנס למוקד' : 'תחכה בהמתנה'}</em></div>
        <div><span class="tp-lbl">יעדים</span>${s.targets.map(t => `<div>• ${pEsc(G(t.text))}${t.now ? ` <em class="tp-now">עכשיו ${t.now}${t.target ? ' · רוצים ' + t.target : ''}</em>` : ''}</div>`).join('')}</div>
        <div><span class="tp-lbl">דרכי התערבות</span>${s.ints.map(x2 => `<div>• ${pEsc(x2.name)} <em class="tp-appr">${pEsc(x2.approach || '')}</em></div>`).join('')}</div>
        <div><span class="tp-lbl">משפטים</span>${s.ints.flatMap(x2 => x2.sentences || []).map(t => `<div>💬 ${pEsc(t)}</div>`).join('') || '<div class="pnote">לא נבחרו משפטים.</div>'}</div>
        <div><span class="tp-lbl">מסע ומקדש</span>${s.strengths.map(t => `<span class="th-chip">${pEsc(t)}</span>`).join(' ') || '<span class="pnote">בלי חוזקות</span>'}${s.planet ? ` · 🪐 ${pEsc(((thp.planets || []).find(p => p.id === s.planet) || {}).name || '')}` : ''}</div></div>
        ${nav(true, 'לתצוגה של הצוות ←')}`;
    }
    else {          // preview: exactly what the staff sees
      const g = tpGoalFromState(s, G);
      inner = `<h2>כך הצוות יראה את זה</h2><div class="tp-preview th-kcard">${tpStaffGoalHtml(id, g, false)}</div>${nav(true, s.editIndex >= 0 ? 'שמירת השינויים' : 'הוספה לתוכנית')}`;
    }
    body.innerHTML = `<div class="tp-builder"><div class="th-ed-head"><button type="button" class="btn ghost small" id="tb-out">שמירה ויציאה</button><div class="th-child-head">${c ? thpAvatar(c) : ''}<h2 class="ar-keep">${pEsc(c ? displayName(c) : '')}</h2></div><span></span></div>
      <div class="tp-stepno">${i0 > 0 ? `שלב ${i0} מתוך ${TP_STEPS.length - 1}: ${TP_STEPS[i0][1]}` : `${TP_STEPS.length - 1} שלבים קצרים, ואפשר לעצור ולחזור בכל רגע`}</div><ol class="tp-steps">${TP_STEPS.slice(1).map(([k, w], j) => `<li class="${j + 1 < i0 ? 'done' : j + 1 === i0 ? 'now' : ''}">${w}</li>`).join('')}</ol>${inner}</div>`;
    wire();
  }
  function wire(){
    const $ = q => body.querySelector(q), on = (q, f) => { const el = $(q); if(el) el.addEventListener('click', f); };
    on('#tb-out', async () => { await persist(); thp.tab = 'plans'; thp.planChild = id; thpRender(); });
    on('#tb-prev', () => { const i0 = TP_STEPS.findIndex(x => x[0] === s.step); go(TP_STEPS[Math.max(0, i0 - 1)][0]); });
    body.querySelectorAll('[data-entry]').forEach(b => b.addEventListener('click', () => { s.entry = b.dataset.entry; go('pick'); }));
    body.querySelectorAll('[data-gender]').forEach(b => b.addEventListener('click', async () => { gender = b.dataset.gender; const d = tpDraftOf(id); d.gender = gender; d.builder = Object.assign({}, s); await planSave(id, d, (thp.plans[id] || {}).review_date || null); draw(); }));          // (once per child: the UX reviewer, finding 5)
    on('#tb-own', () => { s.entry = 'own'; go('goal'); });
    body.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => { s.theme = b.dataset.theme; go('goal'); }));
    body.querySelectorAll('[data-method]').forEach(b => b.addEventListener('click', () => { s.method = b.dataset.method; go('goal'); }));
    const q = $('#tb-q'); if(q){ const res = () => { s.q = q.value.trim(); const l = s.q ? tpGoalsV2().filter(x => `${x.title} ${x.description || ''} ${JSON.stringify(x.content)}`.includes(s.q)) : [];
        $('#tb-res').innerHTML = l.map(x => `<button type="button" class="tp-name" data-goal="${x.id}">${pEsc(G(x.title))}</button>`).join('') || (s.q ? '<div class="pnote">לא נמצא. אפשר "משהו משלי" בצעד הבא.</div>' : '');
        $('#tb-res').querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => pickGoal(b.dataset.goal))); }; q.addEventListener('input', res); res(); }
    body.querySelectorAll('.tp-names [data-goal]').forEach(b => b.addEventListener('click', () => pickGoal(b.dataset.goal)));
    on('#tb-own-go', () => { const t = $('#tb-own-title').value.trim(); if(!t){ toast('כותבים שם למטרה'); return; } Object.assign(s, { libId:null, title:t, targets:[], ints:[], why:'' }); go('targets'); });
    body.querySelectorAll('[data-target]').forEach(b => b.addEventListener('change', () => {
      const t = (ageW().targets || []).find(x => x.id === b.dataset.target);
      if(b.checked){ if(s.targets.length >= 3){ b.checked = false; toast('אפשר עד 3 יעדים'); return; } s.targets.push({ id:t.id, text:G(t.text), staff:G(t.staff), scale:(t.scale || []).map(G), now:null, target:null }); }
      else s.targets = s.targets.filter(x => x.id !== t.id);
      draw(); }));
    body.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => { const t = s.targets.find(x => x.id === b.dataset.rate); if(t){ t[b.dataset.k] = +b.dataset.v; draw(); } }));
    body.querySelectorAll('[data-scale]').forEach(i => i.addEventListener('change', () => { const t = s.targets.find(x => x.id === i.dataset.scale); if(t){ t.scale = t.scale || []; t.scale[+i.dataset.k] = i.value.trim(); } }));
    on('#tb-t-add', () => { const text = $('#tb-t-text').value.trim(), staff = $('#tb-t-staff').value.trim(); if(!text){ toast('כותבים את היעד'); return; } if(s.targets.length >= 3){ toast('אפשר עד 3 יעדים'); return; }
      s.targets.push({ id:tpUid('t'), own:true, text, staff:staff || text, scale:['', '', '', '', ''], now:null, target:null }); draw(); });
    body.querySelectorAll('[data-own-x]').forEach(b => b.addEventListener('click', () => { s.targets = s.targets.filter(x => x.id !== b.dataset.ownX); draw(); }));
    const so = $('#tb-sort'); if(so) so.addEventListener('change', () => { s.sortAppr = so.checked; draw(); });
    const al = $('#tb-all'); if(al) al.addEventListener('change', () => { s.showAll = al.checked; draw(); });
    body.querySelectorAll('[data-int]').forEach(b => b.addEventListener('change', () => {
      const x = (ageW().interventions || []).find(y => y.id === b.dataset.int);
      if(b.checked){ if(s.ints.length >= 3){ b.checked = false; toast('אפשר עד 3 דרכי התערבות'); return; } s.ints.push({ id:x.id, name:G(x.name), what:G(x.what), why:G(x.why), freq:G(x.freq), approach:x.approach, sentencesAll:x.sentences || [], sentences:[] }); }
      else s.ints = s.ints.filter(y => y.id !== x.id);
      draw(); }));
    on('#tb-i-add', () => { const name = $('#tb-i-name').value.trim(), what = $('#tb-i-what').value.trim(); if(!name || !what){ toast('כותבים שם ומה עושים'); return; } if(s.ints.length >= 3){ toast('אפשר עד 3 דרכי התערבות'); return; }
      s.ints.push({ id:tpUid('i'), own:true, name, what, why:'', freq:'', approach:$('#tb-i-appr').value, sentencesAll:[], sentences:[] }); draw(); });
    body.querySelectorAll('[data-own-ix]').forEach(b => b.addEventListener('click', () => { s.ints = s.ints.filter(x => x.id !== b.dataset.ownIx); draw(); }));
    body.querySelectorAll('[data-sent]').forEach(b => b.addEventListener('click', () => { const x = s.ints.find(y => y.id === b.dataset.sent), t = G(x.sentencesAll[+b.dataset.k]); x.sentences = x.sentences || [];
      x.sentences = x.sentences.includes(t) ? x.sentences.filter(y => y !== t) : x.sentences.concat(t); draw(); }));
    body.querySelectorAll('[data-own-sent-add]').forEach(b => b.addEventListener('click', () => { const inp = body.querySelector(`[data-own-sent="${b.dataset.ownSentAdd}"]`), t = inp.value.trim(); if(!t) return; const x = s.ints.find(y => y.id === b.dataset.ownSentAdd); x.sentences = (x.sentences || []).concat(t); draw(); }));
    body.querySelectorAll('[data-str]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.str; if(s.strengths.includes(t)) s.strengths = s.strengths.filter(x => x !== t); else if(s.strengths.length >= 3){ toast('עד 3 חוזקות'); return; } else s.strengths.push(t); draw(); }));
    on('#tb-str-add', () => { const t = cleanStrength($('#tb-str').value); if(!t) return; if(s.strengths.length >= 3){ toast('עד 3 חוזקות'); return; } s.strengths.push(t); draw(); });
    const pl = $('#tb-planet'); if(pl) pl.addEventListener('change', () => { s.planet = pl.value || null; });
    body.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => { s.status = b.dataset.status; draw(); }));
    on('#tb-next', async () => {
      if(s.step === 'targets' && s.targets.some(t => !t.now || !t.target)){ if(!(await confirmSheet({ title:'לא סימנת "עכשיו" ו"יעד" לכל יעד', text:'אפשר להמשיך ולסמן אחר כך במעקב.', okLabel:'להמשיך', cancelLabel:'לסמן עכשיו' }))) return; }
      if(s.step === 'preview'){ await finish(); return; }
      const i0 = TP_STEPS.findIndex(x => x[0] === s.step); go(TP_STEPS[i0 + 1][0]);
    });
  }
  function pickGoal(libId){
    const x = (thp.library || []).find(y => y.id === libId); if(!x) return;
    if(s.libId !== libId) Object.assign(s, { libId, title:x.title, theme:bankThemesOf(x)[0] || '', targets:[], ints:[], strengths:[], planet:'', why:x.description || '' });
    go('targets');
  }
  async function finish(){
    const d = tpDraftOf(id), g = tpGoalFromState(s, G);
    if(g.status === 'focus') d.goals.filter(x => tpStatusOf(x) === 'focus' && x.id !== g.id).slice(tpFocusMax() - 1).forEach(x => { x.status = 'waiting'; });
    d.goals = (d.goals || []).filter(x => x.title || tpIsV2(x));
    const at = d.goals.findIndex(x => x.id === g.id);
    if(at >= 0) d.goals[at] = Object.assign({}, d.goals[at], g); else d.goals.push(g);
    delete d.builder;
    if(await tpSave(id, d)){ toast(s.editIndex >= 0 ? 'השינויים נשמרו בטיוטה' : 'המטרה נוספה לטיוטה. כשתסיימי: "פרסום"', 5000); thp.tab = 'plans'; thp.planChild = id; thpRender(); }
  }
  draw();
}
// the goal of the plan, from the builder's state
function tpGoalFromState(s, G){
  const x = s.libId ? (thp.library || []).find(y => y.id === s.libId) : null, review = isoDate(new Date(Date.now() + (((x && x.content.review) || 3) * 30) * 864e5));
  return tpSync({ id:s.goalId || (s.goalId = tpUid('g')), title:G(s.title), theme:s.theme || '', library_id:s.libId || null, status:s.status || 'focus',
    targets_list:s.targets.map(t => ({ id:t.id, text:t.text, staff:t.staff, scale:t.scale || [], now:t.now || null, target:t.target || null })),
    interventions_list:s.ints.map(i => ({ id:i.id, name:i.name, what:i.what, why:i.why || '', freq:i.freq || '', approach:i.approach || '', sentences:(i.sentences || []).slice() })),
    strengths:s.strengths.slice(), planet_id:s.planet || null, why_staff:G(s.why || ''), avoid_line:x ? G(x.content.avoid || '') : '', review_date:review,
    methods:[...new Set(s.ints.map(i => i.approach).filter(Boolean))], bank:x ? { id:x.id, age:s.age } : null });
}

// ---- the staff's view of one goal (Q21, Q25-27): the plain targets, the interventions with their approach, 2 sentences + "עוד", 👍/👎
function tpStaffGoalHtml(childId, g, withFeedback){
  if(!tpIsV2(g)) return '';
  const sents = (g.interventions_list || []).flatMap(i => i.sentences || []);
  return `<div class="tp-sg"><b class="ar-keep">${pEsc(g.title)}</b>${g.why_staff ? `<div class="tp-sg-why ar-keep">${pEsc(g.why_staff)}</div>` : ''}
    ${(g.targets_list || []).length ? `<div class="tp-sg-t">${g.targets_list.map(t => `<div class="ar-keep">🎯 ${pEsc(t.staff || '')}</div>`).join('')}</div>` : ''}
    ${(g.interventions_list || []).map(i => `<div class="tp-sg-i"><span class="ar-keep"><b>${pEsc(i.name)}</b> ${pEsc(i.what)}${i.freq ? ` <small>(${pEsc(i.freq)})</small>` : ''}</span><em class="tp-appr">${pEsc(i.approach || '')}</em>
      ${withFeedback ? `<span class="tp-fb"><button type="button" data-fb="${pEsc(childId)}|${pEsc(g.id)}|${pEsc(i.id)}|up" aria-label="עבד">👍</button><button type="button" data-fb="${pEsc(childId)}|${pEsc(g.id)}|${pEsc(i.id)}|down" aria-label="לא עבד">👎</button></span>` : ''}</div>`).join('')}
    ${sents.length ? `<div class="tp-sg-s ar-keep">${sents.slice(0, 2).map(t => `<div>💬 ${pEsc(t)}</div>`).join('')}${sents.length > 2 ? `<details><summary>עוד</summary>${sents.slice(2).map(t => `<div>💬 ${pEsc(t)}</div>`).join('')}</details>` : ''}</div>` : ''}</div>`;
}
function tpWireFeedback(box){
  box.querySelectorAll('[data-fb]').forEach(b => b.addEventListener('click', () => {
    const [child_id, goal_id, intervention_id, value] = b.dataset.fb.split('|');
    const sh = portalSheet(`<h2>${value === 'up' ? '👍 עבד' : '👎 לא עבד'}</h2><label class="pfield">רוצה לפרט? (רשות)<input type="text" id="fb-note" maxlength="200"></label>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="fb-go">שליחה</button></div>`);
    sh.querySelector('#fb-go').addEventListener('click', async () => {
      const r = await sbPersonal.from('intervention_feedback').insert({ child_id, goal_id, intervention_id, staff_id:srv.me, value, note:sh.querySelector('#fb-note').value.trim() || null });
      if(r.error){ toast(/intervention_feedback/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v44.sql' : 'לא נשמר'); return; }
      sh.close(); toast('תודה! המטפל/ת יראה את זה');
    });
  }));
}

// ---- the spiral of a target (Q23): not a line; a dot a day, from all the data; the stations of the scale on the way out
async function tpSpiralData(id, since){
  const iso = since.toISOString(), q = (t, col, cols) => sbPersonal.from(t).select(cols || '*').eq('child_id', id).gte(col, iso);
  const [st, ob, inc, fb, sc] = await Promise.all([q('journey_steps', 'at', 'planet_id,at'), q('observations', 'created_at', 'goal_id,target_id,valence,created_at'), q('incidents', 'at', 'goal_id,intensity,at'),
    q('intervention_feedback', 'at', 'goal_id,value,at'), sbPersonal.from('goal_scale').select('goal_id,rated_on,value').eq('child_id', id).order('rated_on')]);
  return { steps:st.data || [], obs:ob.data || [], inc:inc.data || [], fb:fb.data || [], scale:sc.data || [] };
}
function tpSpiralLevels(g, t, D, since, days){
  const day = x => Math.floor((new Date(x) - since) / 864e5), sig = Array.from({ length:days }, () => ({ p:0, n:0, r:null }));
  const put = (k, f) => { if(k >= 0 && k < days) f(sig[k]); };
  D.steps.forEach(x => { if(g.planet_id && x.planet_id === g.planet_id) put(day(x.at), s => { s.p += 1; }); });
  D.obs.forEach(o => { if(o.target_id === t.id || (!o.target_id && o.goal_id === g.id)){ const w = o.target_id === t.id ? 1 : 0.5; put(day(o.created_at), s => { if(o.valence === 'success') s.p += w; else if(o.valence === 'difficulty') s.n += w; }); } });
  D.inc.forEach(x => { if(x.goal_id === g.id) put(day(x.at), s => { s.n += 0.5 * (x.intensity || 1); }); });
  D.fb.forEach(x => { if(x.goal_id === g.id) put(day(x.at), s => { if(x.value === 'up') s.p += 0.5; else s.n += 0.5; }); });
  D.scale.forEach(x => { if(x.goal_id === g.id + ':' + t.id) put(day(x.rated_on + 'T12:00:00'), s => { s.r = x.value; }); });
  let lv = t.now || 2; const out = [];
  sig.forEach(s => { if(s.r) lv = s.r; else lv += 0.15 * s.p - 0.2 * s.n; lv = Math.max(1, Math.min(5, lv)); out.push({ lv, any:!!(s.p || s.n || s.r) }); });
  return out;
}
function tpSpiralSvg(t, levels){
  const W = 260, cx = W / 2, cy = W / 2, pos = u => { const a = (u - 1) * Math.PI * 1.6 - Math.PI / 2, r = 14 + (u - 1) * 24; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  let path = ''; for(let u = 1; u <= 5.001; u += 0.05){ const [x, y] = pos(u); path += (path ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
  const n = levels.length, dots = levels.map((p, k) => { if(!p.any && k !== n - 1) return ''; const [x, y] = pos(p.lv), today = k === n - 1;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${today ? 7 : 3.2}" class="${today ? 'sp-today' : 'sp-dot'}" style="opacity:${today ? 1 : (0.25 + 0.75 * k / n).toFixed(2)}"><title>${today ? 'היום' : ''} ${p.lv.toFixed(1)}</title></circle>${today ? `<text x="${(x + 11).toFixed(1)}" y="${(y - 9).toFixed(1)}" class="sp-label">היום</text>` : ''}`; }).join('');
  const stations = [1, 2, 3, 4, 5].map(u => { const [x, y] = pos(u); return `<g class="sp-st${t.target === u ? ' goal' : ''}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${u}</text><title>${pEsc((t.scale || [])[u - 1] || '')}</title></g>`; }).join('');
  return `<svg class="tp-spiral" viewBox="0 0 ${W} ${W}" role="img" aria-label="הספירלה של היעד"><path d="${path}" class="sp-path"/>${stations}${dots}</svg>`;
}
async function tpSpiralSection(id, box){
  const plan = (thp.plans[id] && (thp.plans[id].draft || thp.plans[id].published)) || { goals:[] }, goals = (plan.goals || []).filter(g => tpIsV2(g) && ['focus', 'waiting'].includes(tpStatusOf(g)));
  if(!goals.length) return false;
  const days = 56, since = new Date(Date.now() - (days - 1) * 864e5); since.setHours(0, 0, 0, 0);
  const D = await tpSpiralData(id, since), last = {};
  D.scale.forEach(x => { last[x.goal_id] = x; });
  const sec = document.createElement('div'); sec.className = 'cr-graphs';
  sec.innerHTML = `<h3 class="psec">איפה ${pEsc(careName(id))} עכשיו</h3><details class="pfold"><summary><span>מה זו הספירלה?</span></summary><div class="pfold-body pnote">ההתקדמות לא בקו ישר. כל נקודה היא יום; הנקודה הגדולה היא היום. הספירלה נבנית מצעדים במסע, מתצפיות, מאירועים, מ👍/👎 של הצוות ומהדירוג שלך. נתונים, לא מסקנה.</div></details>
    ${goals.map(g => `<details class="tp-goal" open><summary><b>${pEsc(g.title)}</b> <small>${pEsc(TP_STATUS[tpStatusOf(g)])}</small></summary><div class="tp-goal-body">${g.targets_list.map(t => { const lv = tpSpiralLevels(g, t, D, since, days), r = last[g.id + ':' + t.id];
      return `<details class="tp-target"><summary><span>${pEsc(t.text)}</span><em class="tp-now">עכשיו ${Math.round(lv[lv.length - 1].lv)}${t.target ? ' · רוצים ' + t.target : ''}</em></summary><div class="tp-t-body tp-sp-row">${tpSpiralSvg(t, lv)}
        <div class="tp-sp-side"><ol class="tp-stations">${(t.scale || []).map((s2, j) => `<li class="${t.target === j + 1 ? 'goal' : ''}">${pEsc(s2)}</li>`).join('')}</ol>
          <label>הדירוג של החודש <select data-sp-rate="${pEsc(g.id + ':' + t.id)}"><option value="">—</option>${[1, 2, 3, 4, 5].map(k => `<option${r && r.rated_on.slice(0, 7) === careToday().slice(0, 7) && r.value === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label></div></div></details>`; }).join('')}</div></details>`).join('')}`;
  box.appendChild(sec);
  sec.querySelectorAll('[data-sp-rate]').forEach(s2 => s2.addEventListener('change', async () => {
    if(!s2.value) return;
    const r = await sbPersonal.from('goal_scale').upsert({ child_id:id, goal_id:s2.dataset.spRate, rated_on:careToday(), value:+s2.value });
    if(r.error){ toast('לא נשמר'); return; } toast('הדירוג נשמר'); sec.remove(); tpSpiralSection(id, box);
  }));
  return true;
}
// "the goal looks achieved" (Q16): every target at its target in the last two ratings -> a suggestion in "משימות"
function tpAchievedSuggest(id){
  const row = thp.plans[id] || {}, d = row.draft || row.published, rates = (thp.scaleRates || {})[id] || [];
  if(!d) return [];
  return (d.goals || []).filter(g => tpIsV2(g) && tpStatusOf(g) === 'focus' && g.targets_list.length && g.targets_list.every(t => { if(!t.target) return false;
    const l = rates.filter(x => x.goal_id === g.id + ':' + t.id).slice(-2); return l.length === 2 && l.every(x => x.value >= t.target); })).map(g => g.title);
}
