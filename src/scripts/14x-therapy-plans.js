// ---------- MERCURY: TREATMENT PLANS (stage 2) ----------
// The therapist builds a plan per child: a short summary for the staff, "what to avoid", goals (up to 3 in focus) with what we see when
// the child succeeds and what the staff does, a planet of the space journey and the strengths of the temple per goal, the optional
// "what we see / what may be needed / why" thinking (never shown to the staff), an attached document and a review date.
// A draft until "פרסום"; every publish is kept; the staff sees the published plan only (plan_guidance). (scheduling-v32.sql; decisions 7-17, 46, 47, 56-58)
const PLAN_FOCUS_MAX = 3;
const planNewGoal = () => ({ id:'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title:'', library_id:null, focus:false, targets:'', interventions:'', sentences:'', seen:'', needs:'', why:'', why_staff:'', planet_id:null, strengths:[],
  themes:[], skills:[], scale:null, review_months:null, methods:[], bank:null });          // (the last ones: a goal from the bank, decisions 97-112)
const planEmpty = () => ({ summary:'', avoid:'', calm:'', signs:'', routine:'', gender:'', dev_age:'', goals:[planNewGoal()] });
const PLAN_BLANK = /\[[^\]\n]{1,40}\]/;          // (a place to fill in a whole-plan template, "[שם]": a plan with one is not published, decision 114)
// the parts of a plan besides the goals (Mercury decision 80), each with its own templates in the library; and the categories of the templates (91)
const PLAN_PARTS = [['avoid', 'ממה להימנע', 'מצבים או מילים שמעוררים את הילד/ה'], ['signs', 'אותות מוקדמים', 'איך הילד/ה נראה/ית לפני שזה מתפרץ'],
  ['calm', 'מה עוזר להירגע', 'דרכים שעובדות ברגעי קושי'], ['routine', 'שגרה יומית מיוחדת', 'שינה, אוכל וכדומה (בלי פרטים רפואיים רגישים)']];
const PLAN_KIND_WORD = { goal:'מטרות', todo:'מה הצוות עושה', avoid:'ממה להימנע', signs:'אותות מוקדמים', calm:'מה עוזר להירגע', routine:'שגרה יומית', strength:'חוזקות', skill:'מיומנויות', plan:'תכניות שלמות', method:'שיטות טיפול' };
const PLAN_CATS = ['ביטחון ויציבות', 'ויסות רגשי', 'היקשרות וקשר עם מבוגר', 'זהות ודימוי עצמי', 'מעברים ושגרה', 'קשרים חברתיים', 'למידה ותפקוד', 'התנהגות מסכנת וגבולות', 'שינה ואכילה', 'אובדן ופרידה'];          // (the themes of the bank, trauma informed: Guy, decision 97)
const planCanEdit = id => !!(srv.profile && (srv.profile.admin || (srv.profile.therapist && thp.mine.includes(id))));
const thpLib = kind => (thp.library || []).filter(x => x.kind === kind && x.active);

// ---- the staff's view of one child: what to avoid first, then the goals in focus, the rest folded
function planGuidanceHtml(g){
  if(!g || !g.content) return '';
  const c = g.content, goals = c.goals || [], focus = goals.filter(x => x.focus), rest = goals.filter(x => !x.focus);
  const goalHtml = x => `<div class="th-g"><b class="ar-keep">${pEsc(x.title || '')}</b>${(x.themes || []).length ? `<span class="bk-tags ar-keep">${x.themes.map(t => `<span class="bk-theme">${pEsc(t)}</span>`).join('')}</span>` : ''}
      ${x.interventions ? `<div class="th-g-row"><span>מה עושים:</span> <em class="ar-keep">${pEsc(x.interventions)}</em></div>` : ''}
      ${x.sentences ? `<div class="th-g-row"><span>מה אומרים:</span> <em class="ar-keep">${pEsc(x.sentences)}</em></div>` : ''}
      ${x.why_staff ? `<div class="th-g-row"><span>למה זה חשוב:</span> <em class="ar-keep">${pEsc(x.why_staff)}</em></div>` : ''}
      ${(x.strengths || []).length ? `<div class="th-chips ar-keep">${x.strengths.map(s => `<span class="th-chip">${pEsc(s)}</span>`).join('')}</div>` : ''}</div>`;
  const strengths = [...new Set(goals.flatMap(x => x.strengths || []))];
  const part = (k, w) => c[k] ? `<div class="th-part th-part-${k}"><b>${w}</b><div class="ar-keep">${pEsc(c[k])}</div></div>` : '';
  return `${strengths.length ? `<h3 class="psec">החוזקות</h3><div class="th-chips ar-keep">${strengths.map(s => `<span class="th-chip">${pEsc(s)}</span>`).join('')}</div>` : ''}
    ${focus.length ? `<h3 class="psec">במוקד</h3>${focus.map(goalHtml).join('')}` : ''}
    ${c.summary ? `<div class="th-summary ar-keep">${pEsc(c.summary)}</div>` : ''}
    ${c.avoid ? `<div class="th-avoid"><b>ממה להימנע</b><div class="ar-keep">${pEsc(c.avoid)}</div></div>` : ''}
    ${part('signs', 'אותות מוקדמים')}${part('calm', 'מה עוזר להירגע')}${part('routine', 'שגרה יומית מיוחדת')}
    ${rest.length ? `<details class="pfold th-rest"><summary><span>מטרות נוספות (${rest.length})</span></summary><div class="pfold-body">${rest.map(goalHtml).join('')}</div></details>` : ''}
    <div class="th-ver">גרסה ${g.version}${g.published_at ? ' · ' + pEsc(dayLabel(String(g.published_at).slice(0, 10))) : ''}</div>`;
}
const planCardSub = id => { const g = thp.guidance && thp.guidance[id]; if(!g) return 'עוד אין תוכנית טיפולית'; const f = (g.content.goals || []).filter(x => x.focus).map(x => x.title).filter(Boolean); return f.length ? 'במוקד: <span class="ar-keep">' + pEsc(f.join(' · ')) + '</span>' : 'יש תוכנית טיפולית'; };          // (html: the therapist's words stay as written, decision 35)

// one goal box of the editor
function planGoalHtml(g, i){
  const planets = (thp.planets || []).filter(p => p.active);
  const sc = g.scale && (g.scale.anchors || []).length ? g.scale : null, num = (cls, v) => `<select class="${cls}"><option value="">—</option>${[1, 2, 3, 4, 5].map(k => `<option${+v === k ? ' selected' : ''}>${k}</option>`).join('')}</select>`;
  const bk = g.bank ? `<span class="bk-from">${g.bank.edited ? 'מהבנק, עם שינויים' : 'מהבנק'}${g.bank.age ? ' · ' + pEsc(g.bank.age) : ''}</span>` : '';
  return `<div class="th-goal" data-gi="${i}" data-gid="${pEsc(g.id)}" data-bank="${pEsc(JSON.stringify(g.bank || null))}" data-extra="${pEsc(JSON.stringify({ themes:g.themes || [], skills:g.skills || [], review_months:g.review_months || null, methods:g.methods || [], library_id:g.library_id || null }))}">
      <div class="th-goal-top"><input type="text" class="pe-g-title" list="th-lib-goals" maxlength="80" placeholder="שם המטרה (מהבנק או חופשי)" value="${pEsc(g.title || '')}" aria-label="שם המטרה">
        <label class="th-focus"><input type="checkbox" class="pe-g-focus"${g.focus ? ' checked' : ''}> במוקד</label>
        <button type="button" class="btn ghost small pe-g-rm" aria-label="הסרת המטרה">✕</button></div>
      <div class="bk-goal-bar"><button type="button" class="btn ghost small pe-g-bank">📚 נוסח מהבנק</button>${bk}${(g.themes || []).map(t => `<span class="bk-theme">${pEsc(t)}</span>`).join('')}${g.bank && g.bank.method ? `<span class="bk-method">${pEsc(g.bank.method)}</span>` : ''}
        <button type="button" class="btn ghost small pe-g-save">💾 לבנק</button></div>
      <label class="pfield">יעדים: מה רואים כשהילד/ה מצליח/ה (ובכמה פעמים)<textarea class="pe-g-targets" rows="2">${pEsc(g.targets || '')}</textarea></label>
      ${sc ? `<div class="pfield bk-scale"><span>סולם 1–5 (המטפל/ת מעריך/ה פעם בחודש)</span><ol>${sc.anchors.map(a => `<li>${pEsc(a)}</li>`).join('')}</ol>
        <div class="bk-scale-now"><label>עכשיו ${num('pe-g-snow', sc.now)}</label><label>יעד ${num('pe-g-starget', sc.target)}</label></div><input type="hidden" class="pe-g-anchors" value="${pEsc(JSON.stringify(sc.anchors))}"></div>` : ''}
      <label class="pfield">דרכי התערבות: מה הצוות עושה <button type="button" class="btn ghost small th-tpl-btn" data-tpl="todo">📚 מהספרייה</button><textarea class="pe-g-int" rows="3">${pEsc(g.interventions || '')}</textarea></label>
      <label class="pfield">משפטים לומר לילד/ה<textarea class="pe-g-sent" rows="2">${pEsc(g.sentences || '')}</textarea></label>
      <label class="pfield">למה זה חשוב (לצוות, בשפה פשוטה)<textarea class="pe-g-whys" rows="2">${pEsc(g.why_staff || '')}</textarea></label>
      ${(g.skills || []).length || g.review_months ? `<div class="pnote">${(g.skills || []).length ? 'מיומנויות למעקב: ' + g.skills.map(pEsc).join(' · ') : ''}${g.review_months ? `${(g.skills || []).length ? ' · ' : ''}בדיקה מחדש של המטרה: בעוד ${g.review_months === 1 ? 'חודש' : g.review_months + ' חודשים'}` : ''}</div>` : ''}
      <label class="pfield">כוכב לכת במסע בחלל${g.bank ? ' <small>(הצעה זמנית לפי המיומנות, עד ישיבת העיצוב)</small>' : ''}<select class="pe-g-planet"><option value="">ללא</option>${planets.map(p => `<option value="${pEsc(p.id)}"${g.planet_id === p.id ? ' selected' : ''}>${pEsc(p.name)} · ${pEsc(p.skill)}</option>`).join('')}</select></label>
      <div class="pfield"><span>חוזקות במקדש (מוצעות למדריך כשנותנים לבנה)</span>
        <div class="th-chips pe-g-strengths">${(g.strengths || []).map(s => `<span class="th-chip" data-str="${pEsc(s)}">${pEsc(s)} <button type="button" class="th-chip-x" aria-label="הסרה">✕</button></span>`).join('')}</div>
        <div class="th-add-row"><input type="text" class="pe-g-str-new" list="th-lib-strengths" maxlength="20" placeholder="חוזקה (עד 20 תווים)" aria-label="חוזקה חדשה"><button type="button" class="btn ghost small pe-g-str-add">הוספה</button></div></div>
      <details class="pfold th-think"${g.seen || g.needs || g.why ? ' open' : ''}><summary><span>עוזר חשיבה (רשות, לא מוצג לצוות)</span></summary><div class="pfold-body">
        <label class="pfield">מה רואים אצל הילד/ה?<textarea class="pe-g-seen" rows="2">${pEsc(g.seen || '')}</textarea></label>
        <label class="pfield">מה הוא/היא אולי צריך/ה?<textarea class="pe-g-needs" rows="2">${pEsc(g.needs || '')}</textarea></label>
        <label class="pfield">למה המטרה הזו תעזור? (מקצועי)<textarea class="pe-g-why" rows="2">${pEsc(g.why || '')}</textarea></label></div></details>
    </div>`;
}
// ---- the plan editor (the responsible therapist, or the admin)
function planEditorHtml(id){
  const row = thp.plans[id] || {}, d = row.draft || row.published || planEmpty();
  const devOn = !!(thp.mopts && thp.mopts.dev_age), band = typeof bankAgeOf === 'function' ? bankAgeOf(id, d) : '';
  return `<div class="th-editor" data-plan="${pEsc(id)}" data-bank-parts="${pEsc(JSON.stringify(d.bank_parts || []))}">
    <datalist id="th-lib-goals">${thpLib('goal').map(x => `<option value="${pEsc(x.title)}">`).join('')}</datalist>
    <datalist id="th-lib-strengths">${thpLib('strength').map(x => `<option value="${pEsc(x.title)}">`).join('')}</datalist>
    <div class="th-tpl-top"><button type="button" class="btn ghost small" id="pe-from-tpl">📋 תכנית מתבנית</button><button type="button" class="btn ghost small" id="pe-save-tpl">💾 שמירה כתבנית</button></div>
    <div class="th-ed-grid bk-kid"><label class="pfield">הילד/ה (לנוסחים מהבנק)<select id="pe-gender"><option value="">לא צוין</option><option value="m"${d.gender === 'm' ? ' selected' : ''}>בן</option><option value="f"${d.gender === 'f' ? ' selected' : ''}>בת</option></select></label>
      ${devOn ? `<label class="pfield">גיל התפתחותי (למטפלים בלבד)<input type="text" id="pe-devage" inputmode="decimal" maxlength="5" value="${pEsc(d.dev_age || '')}" placeholder="למשל 6"></label>` : ''}
      <div class="pfield"><span>גיל לנוסחים</span><b class="bk-band">${band ? pEsc((BANK_AGES.find(a => a[0] === band) || [, band])[1]) : 'לא ידוע (כל הגילאים)'}</b></div></div>
    <label class="pfield">תקציר קצר לצוות<textarea id="pe-summary" rows="3" placeholder="בכמה משפטים: מה חשוב לדעת על הילד/ה עכשיו">${pEsc(d.summary || '')}</textarea></label>
    ${PLAN_PARTS.map(([k, w, hint]) => `<label class="pfield${k === 'avoid' ? ' th-avoid-field' : ''}">${w} <small>(${hint})</small> <button type="button" class="btn ghost small th-tpl-btn" data-tpl="${k}">📚 מהספרייה</button><textarea id="pe-${k}" rows="2">${pEsc(d[k] || '')}</textarea></label>`).join('')}
    <h3 class="psec">מטרות <small>(עד ${PLAN_FOCUS_MAX} במוקד)</small></h3>
    <div id="pe-goals">${(d.goals || []).map(planGoalHtml).join('')}</div>
    <div class="bk-add-row"><button type="button" class="btn ghost" id="pe-add-goal">+ מטרה</button><button type="button" class="btn ghost" id="pe-add-bank">+ מטרה מהבנק</button></div>
    <div class="th-ed-grid">
      <label class="pfield">תאריך לבדיקה מחדש<input type="date" id="pe-review" value="${pEsc(row.review_date || '')}"></label>
      <div class="pfield"><span>קובץ מצורף (Word או PDF)</span><div class="th-file">${d.file ? `<button type="button" class="btn ghost small" id="pe-file-open">📎 ${pEsc(d.file.name)}</button><button type="button" class="btn ghost small" id="pe-file-rm" aria-label="הסרת הקובץ">✕</button>` : ''}<input type="file" id="pe-file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></div></div>
    </div>
    <label class="th-important"><input type="checkbox" id="pe-important"> שינוי חשוב: לשלוח לצוות גם מייל</label>
    <div class="th-actions"><button type="button" class="btn ghost" id="pe-save">שמירת טיוטה</button><button type="button" class="btn" id="pe-publish">פרסום</button>
      <button type="button" class="btn ghost" id="pe-versions"${row.published_version ? '' : ' disabled'}>גרסאות קודמות</button><button type="button" class="btn ghost" id="pe-print">הדפסה / PDF</button></div>
  </div>`;
}
// the editor as it is on the screen now -> the draft
function planRead(root){
  const js = v => { try { return JSON.parse(v || 'null'); } catch(e){ return null; } };
  const goals = [...root.querySelectorAll('.th-goal')].map(el => {
    const title = el.querySelector('.pe-g-title').value.trim(), lib = thpLib('goal').find(x => x.title === title), ex = js(el.dataset.extra) || {}, bank = js(el.dataset.bank);
    const an = el.querySelector('.pe-g-anchors'), v = s => { const x = el.querySelector(s); return x ? x.value.trim() : ''; };
    const g = { id:el.dataset.gid, title, library_id:lib ? lib.id : (ex.library_id || null), focus:el.querySelector('.pe-g-focus').checked,
      targets:v('.pe-g-targets'), interventions:v('.pe-g-int'), sentences:v('.pe-g-sent'), why_staff:v('.pe-g-whys'),
      seen:v('.pe-g-seen'), needs:v('.pe-g-needs'), why:v('.pe-g-why'),
      planet_id:el.querySelector('.pe-g-planet').value || null, strengths:[...el.querySelectorAll('.pe-g-strengths [data-str]')].map(s => s.dataset.str),
      themes:ex.themes || [], skills:ex.skills || [], review_months:ex.review_months || null, methods:ex.methods || [],
      scale:an ? { anchors:js(an.value) || [], now:+v('.pe-g-snow') || null, target:+v('.pe-g-starget') || null } : null, bank:bank || null };
    if(g.bank && typeof bankSig === 'function' && bankSig(g) !== g.bank.sig) g.bank = Object.assign({}, g.bank, { edited:true });          // (decision 111: "מהבנק, עם שינויים")
    return g;
  }).filter(g => g.title || g.targets || g.interventions);
  const row = thp.plans[root.dataset.plan] || {}, base = row.draft || row.published || {};
  const parts = {}; PLAN_PARTS.forEach(([k]) => { parts[k] = root.querySelector('#pe-' + k).value.trim(); });
  const gd = root.querySelector('#pe-gender'), da = root.querySelector('#pe-devage');
  return Object.assign({ summary:root.querySelector('#pe-summary').value.trim() }, parts, { goals, file:base.file || null,
    gender:gd ? gd.value : (base.gender || ''), dev_age:da ? da.value.trim() : (base.dev_age || ''), bank_parts:js(root.dataset.bankParts) || [] });
}
async function planSave(id, draft, review){
  const r = await sbPersonal.from('child_plans').upsert({ child_id:id, draft, review_date:review || null }).select('*').single();
  if(r.error) return false;
  thp.plans[id] = r.data; return true;
}
// the therapist's workspace of one child: the plan, the observations, the tracking, the journey, the temple — each in its own tab
const PLAN_WS_TABS = [['plan', 'התוכנית'], ['obs', 'תצפיות'], ['track', 'מעקב'], ['events', 'אירועים'], ['family', 'משפחה'], ['stay', 'קליטה ויציאה'], ['docs', 'מסמכים'], ['journey', 'המסע בחלל'], ['temple', 'המקדש']];          // (events, family, stay, docs: 14ze, Mercury 123-129)
const planStatus = id => { const row = thp.plans[id] || {}; return row.published_version ? `פורסמה גרסה ${row.published_version}${row.draft && JSON.stringify(row.draft) !== JSON.stringify(row.published) ? ' · יש שינויים שלא פורסמו' : ''}${row.review_date ? ' · בדיקה מחדש ' + dayLabel(row.review_date) : ''}` : (row.draft ? 'טיוטה, עוד לא פורסמה' : 'עוד אין תוכנית'); };
function planOpenEditor(id, tab){
  thp.editing = id; if(tab) thp.wtab = tab; if(!PLAN_WS_TABS.some(x => x[0] === thp.wtab)) thp.wtab = 'plan';
  const body = document.getElementById('therapy-body'); if(!body) return;
  const c = roster.find(x => x.id === id), unseen = (thp.unseen && thp.unseen[id]) || 0;
  body.innerHTML = `<div class="th-ws" data-ws="${pEsc(id)}">
    <div class="th-ed-head"><button type="button" class="btn ghost small" id="pe-back">→ חזרה</button><div class="th-child-head">${thpAvatar(c)}<h2 class="ar-keep">${pEsc(displayName(c))}</h2></div><span class="th-status">${pEsc(planStatus(id))}</span></div>
    <nav class="portal-tabs th-ws-tabs" role="tablist">${PLAN_WS_TABS.filter(([k]) => thp.v43 || !['events', 'family', 'stay', 'docs'].includes(k)).map(([k, w]) => { const n = k === 'obs' ? unseen : k === 'events' ? ((thp.newInc || {})[id] || 0) : 0;
      return `<button type="button" role="tab" data-ws-tab="${k}" class="${k === thp.wtab ? 'active' : ''}">${w}${n ? ` <span class="pcount">${n}</span>` : ''}</button>`; }).join('')}</nav>
    <div id="th-ws-body"></div></div>`;
  body.querySelector('#pe-back').addEventListener('click', () => { thp.editing = null; thp.wtab = null; thpRender(); });
  body.querySelectorAll('[data-ws-tab]').forEach(b => b.addEventListener('click', () => planOpenEditor(id, b.dataset.wsTab)));
  const wb = body.querySelector('#th-ws-body');
  if(thp.wtab === 'plan'){ wb.innerHTML = `<div id="pe-video">${typeof thpVideoPanelHtml === 'function' ? thpVideoPanelHtml(id) : ''}</div>${planEditorHtml(id)}`; planWireEditor(id, wb.querySelector('.th-editor'));
    if(typeof thpVideoWire === 'function') thpVideoWire(wb.querySelector('#pe-video'), id, () => planOpenEditor(id, 'plan')); }
  else if(thp.wtab === 'obs'){ wb.innerHTML = '<div id="pe-obs"></div>'; obsSection(id, wb.querySelector('#pe-obs')).then(() => { if(thp.unseen) thp.unseen[id] = 0; }); }
  else if(thp.wtab === 'track'){ wb.innerHTML = '<div id="pe-track"></div>'; const tb = wb.querySelector('#pe-track'); trackSection(id, tb).then(() => careGraphs(id, tb)); }
  else if(['events', 'family', 'stay', 'docs'].includes(thp.wtab)){ wb.innerHTML = '<div id="pe-care"><div class="pnote">טוען...</div></div>'; const cb = wb.querySelector('#pe-care');
    ({ events:careEventsSection, family:careFamilySection, stay:careStaySection, docs:careDocsSection })[thp.wtab](id, cb); }
  else if(thp.wtab === 'journey'){ wb.innerHTML = '<div id="pe-journey"></div>'; const jb = wb.querySelector('#pe-journey'), draw = async () => { jb.innerHTML = await journeyAdminHtml(id); journeyWireAdmin(jb, id, draw); }; draw(); }
  else { wb.innerHTML = '<div id="pe-temple" class="th-temple"></div>'; planTemple(id, wb.querySelector('#pe-temple')); }
}
function planWireEditor(id, root){
  const goalsBox = root.querySelector('#pe-goals');
  const wireGoal = el => {
    el.querySelector('.pe-g-rm').addEventListener('click', () => { el.remove(); });
    el.querySelector('.pe-g-focus').addEventListener('change', e => { if(e.target.checked && root.querySelectorAll('.pe-g-focus:checked').length > PLAN_FOCUS_MAX){ e.target.checked = false; toast(`אפשר עד ${PLAN_FOCUS_MAX} מטרות במוקד`); } });
    const strBox = el.querySelector('.pe-g-strengths'), strIn = el.querySelector('.pe-g-str-new');
    const addStr = () => { const v = cleanStrength(strIn.value); if(!v) return; if([...strBox.querySelectorAll('[data-str]')].some(s => s.dataset.str === v)){ strIn.value = ''; return; }
      strBox.insertAdjacentHTML('beforeend', `<span class="th-chip" data-str="${pEsc(v)}">${pEsc(v)} <button type="button" class="th-chip-x" aria-label="הסרה">✕</button></span>`); strIn.value = ''; };
    el.querySelector('.pe-g-str-add').addEventListener('click', addStr);
    strIn.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); addStr(); } });
    strBox.addEventListener('click', e => { const x = e.target.closest('.th-chip-x'); if(x) x.parentElement.remove(); });
    // the bank (decisions 110, 115): a wording for this goal (replace or add after what is written), or this goal into the center's bank
    el.querySelector('.pe-g-bank').addEventListener('click', () => bankPick('goal', { age:kidAge(), onPick:async (x, age) => {
      const old = planRead(root).goals.find(g => g.id === el.dataset.gid) || Object.assign(planNewGoal(), { id:el.dataset.gid });
      const { goal, avoid } = bankGoalFrom(x, age, kidGender()), has = ['targets', 'interventions', 'sentences', 'why_staff'].some(k => (old[k] || '').trim());
      const how = has ? await bankReplaceAsk() : 'replace'; if(!how) return;
      putGoal(el, bankMerge(old, goal, how)); await offerAvoid(avoid);
    } }));
    el.querySelector('.pe-g-save').addEventListener('click', () => { const g = planRead(root).goals.find(y => y.id === el.dataset.gid); if(!g || !g.title){ toast('צריך קודם שם למטרה'); return; } bankSaveGoal(g, kidAge()); });
  };
  const kidGender = () => (root.querySelector('#pe-gender') || {}).value || '';
  const kidAge = () => bankAgeOf(id, { dev_age:(root.querySelector('#pe-devage') || {}).value });
  const putGoal = (el, g) => { const tmp = document.createElement('div'); tmp.innerHTML = planGoalHtml(g, el ? [...goalsBox.children].indexOf(el) : goalsBox.children.length); const nu = tmp.firstElementChild;
    if(el) el.replaceWith(nu); else goalsBox.appendChild(nu); wireGoal(nu); return nu; };
  const addPart = id2 => { const l = JSON.parse(root.dataset.bankParts || '[]'); if(!l.includes(id2)){ l.push(id2); root.dataset.bankParts = JSON.stringify(l); } };
  // the one "what to avoid" line of a bank goal goes into the plan's part only if the therapist says so (decision 99)
  const offerAvoid = async line => { const ta = root.querySelector('#pe-avoid'); if(!line || ta.value.includes(line)) return;
    if(await confirmSheet({ title:'להוסיף ל"ממה להימנע"?', text:line, okLabel:'כן, להוסיף', cancelLabel:'לא' })) ta.value = bankJoin(ta.value, line); };
  root.querySelectorAll('.th-goal').forEach(wireGoal);
  root.querySelector('#pe-add-goal').addEventListener('click', () => { putGoal(null, planNewGoal()).querySelector('.pe-g-title').focus(); });
  root.querySelector('#pe-add-bank').addEventListener('click', () => bankPick('goal', { age:kidAge(), onPick:async (x, age) => {
    const { goal, avoid } = bankGoalFrom(x, age, kidGender()), empty = [...goalsBox.querySelectorAll('.th-goal')].find(e => !e.querySelector('.pe-g-title').value.trim() && !e.querySelector('.pe-g-int').value.trim());
    const nu = putGoal(empty || null, goal); nu.scrollIntoView({ block:'nearest' }); await offerAvoid(avoid);
  } }));
  const save = async () => { const ok = await planSave(id, planRead(root), root.querySelector('#pe-review').value); if(!ok) toast('השמירה נכשלה. אפשר לנסות שוב בעוד רגע'); return ok; };
  root.querySelector('#pe-save').addEventListener('click', async e => { e.target.disabled = true; if(await save()){ toast('הטיוטה נשמרה. הצוות עוד רואה את הגרסה שפורסמה'); planOpenEditor(id); } else e.target.disabled = false; });
  root.querySelector('#pe-publish').addEventListener('click', async e => {
    const d = planRead(root); if(!d.goals.length && !d.summary){ toast('צריך לפחות מטרה אחת או תקציר'); return; }
    { const blank = [d.summary, ...PLAN_PARTS.map(([k]) => d[k]), ...d.goals.flatMap(g => [g.targets, g.interventions, g.sentences, g.why_staff])].map(t => String(t || '').match(PLAN_BLANK)).find(Boolean);
      if(blank){ toast(`יש עוד מקום להשלמה: ${blank[0]}. ממלאים אותו לפני הפרסום`, 6000); return; } }
    const imp = root.querySelector('#pe-important').checked, first = !((thp.plans[id] || {}).published_version);
    const full = first ? true : await planUpdateKind(); if(full === null) return;
    if(!(await confirmSheet({ title:'לפרסם את התוכנית?', text:full ? `היא נכנסת לתוקף מיד, ונוצר ממנה סרטון. אחרי שתאשרו את הסרטון, הצוות מקבל הודעה בפורטל${imp ? ' וגם מייל' : ''}. הגרסה הקודמת נשמרת.` : 'עדכון קטן: נכנס לתוקף מיד, בלי הודעה לצוות. הגרסה הקודמת נשמרת.', okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
    e.target.disabled = true;
    if(!(await save())){ e.target.disabled = false; return; }
    let r = await sbPersonal.rpc('plan_publish', { p_child:id, p_important:imp, p_full:full });
    if(r.error && /p_full|function/i.test(r.error.message || '')) r = await sbPersonal.rpc('plan_publish', { p_child:id, p_important:imp });          // (a project without v40)
    if(r.error){ e.target.disabled = false; toast('הפרסום נכשל. אפשר לנסות שוב בעוד רגע'); return; }
    toast(full ? `התוכנית פורסמה (גרסה ${r.data}). נוצר סרטון: הצוות יקבל הודעה כשתאשרו אותו.` : `העדכון הקטן פורסם (גרסה ${r.data}), בלי הודעה לצוות.`, 6000);
    await thpLoad(); thp.editing = id; planOpenEditor(id);
  });
  root.querySelector('#pe-versions').addEventListener('click', () => planVersions(id));
  // the templates: a part from the library (added to what is written), a whole plan (fills everything), saving this plan as a template
  root.addEventListener('click', e => { const b = e.target.closest('.th-tpl-btn'); if(!b) return; e.preventDefault();
    const ta = b.dataset.tpl === 'todo' ? b.closest('.th-goal').querySelector('.pe-g-int') : root.querySelector('#pe-' + b.dataset.tpl);
    bankPick(b.dataset.tpl, { age:kidAge(), onPick:(x, age) => { ta.value = bankJoin(ta.value, bankPartText(x, age, kidGender())); if(bankHasAges(x)) addPart(x.id); } }); });
  root.querySelector('#pe-from-tpl').addEventListener('click', () => bankPick('plan', { age:kidAge(), onPick:async x => {
    if(!(await confirmSheet({ title:`למלא מהתבנית "${x.title}"?`, text:'מה שכתוב עכשיו בטיוטה יוחלף. אפשר לערוך הכל אחר כך, והתבנית בספרייה לא משתנה.', okLabel:'כן, למלא', cancelLabel:'חזרה' }))) return;
    const now = planRead(root) || {}, c = x.content || {}, keep = { file:now.file || null, gender:now.gender, dev_age:now.dev_age };
    let d;
    if(c.bank && (c.goal_titles || []).length){          // (a whole plan of the bank: its goals in the child's age and gender, its parts, the summary's skeleton: decision 114)
      const age = kidAge() || '5-8', gn = now.gender, goals = [], avoid = [], parts = { avoid:[], signs:[], calm:[], routine:[] }, used = [x.id];
      c.goal_titles.forEach(t => { const gx = thpLib('goal').find(y => y.title === t); if(!gx) return; const r = bankGoalFrom(gx, age, gn); r.goal.focus = goals.length < PLAN_FOCUS_MAX; goals.push(r.goal); if(r.avoid) avoid.push(r.avoid); });
      BANK_PART_KINDS.forEach(k => { const t = (c.parts || {})[k], px = t ? thpLib(k).find(y => y.title === t) : thpLib(k).find(y => bankHasAges(y) && bankThemesOf(y).includes(bankThemesOf(x)[0]));
        if(px){ parts[k].push(bankPartText(px, age, gn)); used.push(px.id); } });
      parts.avoid.push(...avoid);
      d = Object.assign(planEmpty(), keep, { summary:bankGender(c.summary || '', gn), goals:goals.length ? goals : [planNewGoal()], bank_parts:used });
      BANK_PART_KINDS.forEach(k => { d[k] = parts[k].filter(Boolean).join('\n'); });
    } else d = Object.assign(planEmpty(), c, { goals:(c.goals || []).map(g => Object.assign(planNewGoal(), g, { id:planNewGoal().id })) }, keep);
    if(await planSave(id, d, root.querySelector('#pe-review').value)){ toast(PLAN_BLANK.test(d.summary || '') ? 'הטיוטה מולאה מהתבנית. המקומות בסוגריים מחכים להשלמה' : 'הטיוטה מולאה מהתבנית', 6000); planOpenEditor(id); }
  } }));
  root.querySelector('#pe-save-tpl').addEventListener('click', () => planSaveTemplate(planRead(root)));
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
    ${d.summary ? `<h2>תקציר</h2><p>${pEsc(d.summary)}</p>` : ''}${PLAN_PARTS.map(([k, w]) => d[k] ? `<h2>${w}</h2><p>${pEsc(d[k])}</p>` : '').join('')}
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
const planLibMatch = (x, q, cat) => (!cat || x.category === cat || (x.themes || []).includes(cat)) && (!q || `${x.title} ${x.description || ''} ${x.content ? JSON.stringify(x.content) : ''}`.includes(q));
function planLibraryHtml(){
  const admin = !!(srv.profile && srv.profile.admin), q = thp.libQ || '', cat = thp.libCat || '';
  const mine = x => x.scope === 'center' && x.created_by === srv.me, canEdit = x => admin || mine(x) || (x.scope === 'mercury' && isTherapistMe() && x.kind !== 'method');
  const item = x => `<div class="th-lib-item${x.active ? '' : ' off'}"><span><b>${pEsc(x.title)}</b>${typeof bankThemeChips === 'function' ? `<span class="bk-tags">${bankThemeChips(x)}${bankDraftTag(x)}${bankUseTag(x)}${x.source_id ? '<span class="bk-center">עותק ששונה</span>' : ''}</span>` : ''}${x.description && x.kind !== 'method' ? `<small>${pEsc(x.description)}</small>` : ''}</span><span class="th-lib-scope ${x.scope}">${x.scope === 'mercury' ? 'מרקורי' : 'המרכז'}</span>
    ${canEdit(x) ? `<button type="button" class="btn ghost small" data-lib-edit="${x.id}">עריכה</button>` : ''}${admin || mine(x) ? `<button type="button" class="btn ghost small" data-lib-toggle="${x.id}">${x.active ? (admin ? 'לארכיון' : 'הסתרה') : 'החזרה'}</button>` : ''}</div>`;
  return `${typeof bankLibraryTopHtml === 'function' ? bankLibraryTopHtml() : ''}<div class="pnote">שתי ספריות: של מרקורי (לכל המוסדות; מנהל המערכת מחליט מה נכנס אליה) ושל המרכז (כל איש/אשת טיפול מוסיפים). תבנית שנבחרת נעתקת לתוכנית ונערכת שם; התבנית עצמה לא משתנה. שינוי בנוסח של מרקורי נשמר כעותק במרכז. מה שבארכיון לא מוצע יותר.</div>
    <div class="th-lib-filter"><input type="search" id="lib-q" placeholder="חיפוש בספרייה" aria-label="חיפוש בספרייה" value="${pEsc(q)}"><select id="lib-cat" aria-label="תמה"><option value="">כל התמות</option>${PLAN_CATS.map(c => `<option${c === cat ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="th-lib-add"><select id="lib-kind" aria-label="סוג">${Object.keys(PLAN_KIND_WORD).filter(k => k !== 'plan').map(k => `<option value="${k}">${PLAN_KIND_WORD[k]}</option>`).join('')}</select>
      <input type="text" id="lib-title" maxlength="60" placeholder="שם" aria-label="שם"><textarea id="lib-desc" maxlength="600" rows="2" placeholder="הנוסח שייכנס לתוכנית (רשות במטרות ובחוזקות)" aria-label="הנוסח"></textarea>
      <select id="lib-cat-new" aria-label="תמה">${PLAN_CATS.map(c => `<option>${c}</option>`).join('')}</select>
      ${admin ? '<select id="lib-scope" aria-label="ספרייה"><option value="center">ספריית המרכז</option><option value="mercury">ספריית מרקורי</option></select>' : ''}<button type="button" class="btn" id="lib-add">הוספה</button></div>
    <div class="pnote">תכנית שלמה נשמרת לספרייה מתוך עורך התוכנית ("💾 שמירה כתבנית").</div>
    ${Object.keys(PLAN_KIND_WORD).map(k => { const l = (thp.library || []).filter(x => x.kind === k && planLibMatch(x, q, cat)); return `<details class="pfold"${q || cat ? ' open' : ''}><summary><span>${PLAN_KIND_WORD[k]}</span><span class="pcount">${l.filter(x => x.active).length}</span></summary><div class="pfold-body">${l.map(item).join('') || '<div class="pnote">אין.</div>'}</div></details>`; }).join('')}`;
}
// this plan as a whole-plan template of the center (without the thinking and the file)
function planSaveTemplate(d){
  const sh = portalSheet(`<h2>שמירה כתבנית</h2><div class="pnote">התוכנית נשמרת לספריית המרכז כתבנית, בלי עוזר החשיבה ובלי הקובץ, ובלי שם הילד/ה. עדיף לעבור על הנוסח ולהוריד פרטים אישיים.</div>
    <label class="pfield">שם התבנית<input type="text" id="st-name" maxlength="60" placeholder="למשל: ויסות רגשי, גיל 8-10"></label>
    <label class="pfield">קטגוריה<select id="st-cat">${PLAN_CATS.map(c => `<option>${c}</option>`).join('')}</select></label>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="st-go">שמירה</button></div>`);
  sh.querySelector('#st-go').addEventListener('click', async () => {
    const title = sh.querySelector('#st-name').value.trim(); if(!title){ toast('צריך שם לתבנית'); return; }
    const content = Object.assign({}, d, { goals:(d.goals || []).map(g => { const x = Object.assign({}, g); delete x.seen; delete x.needs; delete x.why; delete x.id; return x; }) }); delete content.file;
    const r = await sbPersonal.from('mercury_library').insert({ kind:'plan', title, category:sh.querySelector('#st-cat').value, content, scope:'center', description:d.summary || null });
    if(r.error){ toast(/duplicate|unique/i.test(r.error.message) ? 'כבר יש תבנית בשם הזה' : /kind|category|content/i.test(r.error.message) ? 'צריך קודם להריץ את scheduling-v40.sql' : 'השמירה נכשלה'); return; }
    sh.close(); toast('התבנית נשמרה בספריית המרכז'); await thpLoad();
  });
}
// publishing: a small update (a word corrected: no notice) or a full update -> true / false / null (back)
function planUpdateKind(){
  return new Promise(resolve => {
    let done = false; const finish = v => { if(done) return; done = true; s2.close(); resolve(v); };
    const s2 = portalSheet(`<h2>איזה עדכון זה?</h2><div class="cs-rebuild-opts"><button type="button" class="btn ghost" data-uk="full"><b>עדכון מלא</b><small>משהו מהותי השתנה: הצוות מקבל הודעה.</small></button>
      <button type="button" class="btn ghost" data-uk="small"><b>עדכון קטן</b><small>תיקון מילה או ניסוח: בלי הודעה לצוות.</small></button></div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-uk="back">חזרה</button></div>`);
    s2.querySelectorAll('[data-uk]').forEach(b => b.addEventListener('click', () => finish(b.dataset.uk === 'full' ? true : b.dataset.uk === 'small' ? false : null)));
    s2.addEventListener('click', e => { if(e.target === s2) finish(null); });
  });
}
function planWireLibrary(body){
  if(typeof bankWireLibrary === 'function') bankWireLibrary(body);
  const add = body.querySelector('#lib-add'); if(!add) return;
  add.addEventListener('click', async () => {
    const title = body.querySelector('#lib-title').value.trim(); if(!title){ toast('צריך שם'); return; }
    const kind = body.querySelector('#lib-kind').value, scopeSel = body.querySelector('#lib-scope');
    const row = { kind, title:kind === 'strength' ? cleanStrength(title) : title, description:body.querySelector('#lib-desc').value.trim() || null, scope:scopeSel ? scopeSel.value : 'center', category:body.querySelector('#lib-cat-new').value };
    let r = await sbPersonal.from('mercury_library').insert(row);
    if(r.error && /category/.test(r.error.message || '') && ['goal', 'skill', 'strength'].includes(kind)){ delete row.category; r = await sbPersonal.from('mercury_library').insert(row); }          // (a project without v40)
    if(r.error){ toast(/duplicate|unique/i.test(r.error.message) ? 'כבר יש כזה בספרייה' : /kind/.test(r.error.message) ? 'צריך קודם להריץ את scheduling-v40.sql' : 'ההוספה נכשלה'); return; }
    toast('נוסף לספרייה'); await thpLoad(); thpRender();
  });
  { const lq = body.querySelector('#lib-q'), lc = body.querySelector('#lib-cat');
    if(lq) lq.addEventListener('change', () => { thp.libQ = lq.value.trim(); thpRender(); });
    if(lc) lc.addEventListener('change', () => { thp.libCat = lc.value; thpRender(); }); }
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
