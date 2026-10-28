// ---------- MERCURY: CARE IN AN EMERGENCY CENTER / A RESIDENTIAL HOME (scheduling-v43.sql; decisions 119-130) ----------
// Deeper for the therapist, simple for the staff:
//  · the staff: a yes / no for every focus goal at the end of a shift (one screen), an incident in 30 seconds by taps, the family contacts,
//    a sentence for the book of a child who leaves; in the child's card: the intake (until there is a plan), the next family meeting, and an
//    encouraging sentence per focus goal ("השבוע תרגל/ה 3 ימים").
//  · the therapist: the incidents and their patterns, the family log, the stay (intake, exit, archive), the progress graph per goal (journey
//    steps, bricks of the goal's strengths, the end-of-shift marks, her monthly 1-5 scale), and the documents: the child on one page (hers and a
//    simple one for the staff), an assessment report draft, a handover for the next place, and a first version of the child's book.
//  · the admin: the archive (restore or delete).
const INC_KINDS = [['aggression', 'תוקפנות', '👊'], ['self_harm', 'פגיעה עצמית', '🩹'], ['runaway', 'בריחה', '🏃'], ['flooding', 'הצפה', '🌊'], ['damage', 'שבירת רכוש', '💥'], ['other', 'אחר', '•']];
const INC_BEFORE = ['מעבר', 'גבול או סירוב', 'ריב עם ילד', 'אחרי קשר עם המשפחה', 'רעש או עומס', 'עייפות או רעב', 'שינוי בתוכנית', 'לא ידוע'];
const INC_HELPED = ['מבוגר קרוב', 'פינה שקטה', 'כלי הרגעה', 'הפרדה', 'שתייה או אוכל', 'זמן', 'שיחה', 'עוד לא נרגע/ה'];
const FAM_KINDS = [['visit', 'ביקור'], ['call', 'שיחה'], ['cancelled', 'בוטל'], ['other', 'אחר']];
const FAM_BACK = [['calm', 'רגוע/ה'], ['mixed', 'מעורב'], ['upset', 'נסער/ת']];
const INTAKE_TASKS = ['סיור במרכז עם מבוגר קבוע', 'לבחור חפץ מעבר או פינה אישית', 'להכיר את לוח היום', 'שיחה ראשונה עם המטפל/ת', 'קשר ראשון עם המשפחה (לפי ההנחיות)'];
const EXIT_PREP = ['שיחת פרידה עם הילד/ה', 'קופסת זיכרונות', 'ביקור במסגרת הבאה', 'חפיפה עם הצוות של המסגרת הבאה', 'טקס פרידה עם הקבוצה', 'הספר מוכן ומודפס'];
const careShift = d => { const h = new Date(d || Date.now()).getHours(); return h >= 7 && h < 15 ? 'בוקר' : h >= 15 && h < 23 ? 'צהריים' : 'לילה'; };
const careToday = () => isoDate(new Date());
const careFirstDays = () => +((thp.mopts || {}).first_plan_days) || 14;
const careName = id => { const c = roster.find(x => x.id === id); return c ? displayName(c) : ((thp.stays || {})[id] || {}).name || ''; };

// what the portal needs for every role (small): the stays, the next family meetings, the encouraging sentences; for the therapist what waits
async function careLoad(){
  thp.stays = {}; thp.famNext = {}; thp.week = {}; thp.v43 = false; thp.newInc = {}; thp.lettersWait = {};
  try {
    const [s, f, w] = await Promise.all([sbPersonal.rpc('stay_guidance'), sbPersonal.rpc('family_next'), sbPersonal.rpc('goal_week')]);
    if(s.error) return;
    thp.v43 = true;
    (s.data || []).forEach(r => { thp.stays[r.child_id] = r; });
    if(!f.error) (f.data || []).forEach(r => { thp.famNext[r.child_id] = r; });
    if(!w.error) (w.data || []).forEach(r => { thp.week[r.child_id + '|' + r.goal_id] = r.days; });
    if(thp.mode === 'therapist'){
      const [i, l, st] = await Promise.all([sbPersonal.from('incidents').select('child_id').is('seen_at', null), sbPersonal.from('staff_letters').select('child_id').eq('approved', false),
        sbPersonal.from('child_stays').select('*')]);
      const mine = new Set(srv.profile && srv.profile.admin ? thpKids().map(c => c.id) : thp.mine);
      (i.data || []).forEach(r => { if(mine.has(r.child_id)) thp.newInc[r.child_id] = (thp.newInc[r.child_id] || 0) + 1; });
      (l.data || []).forEach(r => { thp.lettersWait[r.child_id] = (thp.lettersWait[r.child_id] || 0) + 1; });
      (st.data || []).forEach(r => { thp.stays[r.child_id] = Object.assign({}, thp.stays[r.child_id] || {}, r); });
      thp.scaleRates = {}; try { const sr = await sbPersonal.from('goal_scale').select('child_id,goal_id,value,rated_on').order('rated_on'); (sr.data || []).forEach(r => { (thp.scaleRates[r.child_id] = thp.scaleRates[r.child_id] || []).push(r); }); } catch(e){}
    }
  } catch(e){}
}
const careArchived = id => !!((thp.stays || {})[id] || {}).archived;

// ---- "מה דורש אותי": the first plan's due date, new incidents, letters to approve, an exit that comes close
function careTodo(c, add){
  if(!thp.v43) return;
  const st = thp.stays[c.id] || {}, row = thp.plans[c.id] || {};
  if(st.admitted && !row.published_version){ const left = thpDaysTo(st.admitted) + careFirstDays();
    if(left <= 3) add(c.id, 'plan', '⏳', left < 0 ? 'עבר מועד התוכנית הראשונה' : 'מועד התוכנית הראשונה מתקרב', 2); }
  if(thp.newInc[c.id]) add(c.id, 'events', '⚠️', 'אירועים חדשים מהצוות', 1);
  if(typeof tpAchievedSuggest === 'function' && tpAchievedSuggest(c.id).length) add(c.id, 'plan', '🎉', 'מטרה נראית מושגת: לסמן?', 2);
  if(thp.lettersWait[c.id]) add(c.id, 'docs', '✉️', 'משפטים לספר מחכים לאישור', 3);
  if(st.exit_date && thpDaysTo(st.exit_date) >= 0 && thpDaysTo(st.exit_date) <= 14) add(c.id, 'stay', '🧳', 'היציאה מתקרבת: כדאי לעבור על ההכנות', 2);
}

// ---- the staff's card: the intake until there is a plan, the next family meeting, the encouraging sentence, the incident button
function careCardHtml(c){
  if(!thp.v43) return '';
  const st = (thp.stays || {})[c.id] || {}, g = (thp.guidance || {})[c.id], fn = (thp.famNext || {})[c.id], out = [];
  if(!g && (st.avoid || st.calm || (st.tasks || []).length)) out.push(`<div class="cr-intake"><b>בימים הראשונים</b>${st.avoid ? `<div><span>ממה להימנע:</span> <em class="ar-keep">${pEsc(st.avoid)}</em></div>` : ''}${st.calm ? `<div><span>מה מרגיע:</span> <em class="ar-keep">${pEsc(st.calm)}</em></div>` : ''}
    ${(st.tasks || []).length ? `<div class="cr-tasks">${st.tasks.map((t, i) => `<label class="ar-keep"><input type="checkbox" data-cr-task="${pEsc(c.id)}" data-i="${i}"${t.done ? ' checked' : ''}> ${pEsc(t.t)}</label>`).join('')}</div>` : ''}</div>`);
  if(fn) out.push(`<div class="cr-fam"><span aria-hidden="true">👨‍👩‍👧</span> <span>מפגש עם המשפחה:</span> <b class="ar-keep">${pEsc(dayLabel(fn.next_at))}</b>${fn.next_prep ? ` · <em class="ar-keep">${pEsc(fn.next_prep)}</em>` : ''}</div>`);
  return out.join('');
}
const careWeekLine = (childId, goalId) => { const n = (thp.week || {})[childId + '|' + goalId]; return n ? `<div class="cr-week"><span aria-hidden="true">💪</span> <span>השבוע תרגל/ה</span> <b>${n}</b> <span>${n === 1 ? 'יום' : 'ימים'}</span></div>` : ''; };
function careWireCard(box){
  box.querySelectorAll('[data-th-inc]').forEach(b => b.addEventListener('click', () => careIncidentOpen(b.dataset.thInc)));
  box.querySelectorAll('[data-cr-task]').forEach(x => x.addEventListener('change', async () => {
    const r = await sbPersonal.rpc('intake_task_done', { p_child:x.dataset.crTask, p_index:+x.dataset.i, p_done:x.checked });
    if(r.error){ x.checked = !x.checked; toast('לא נשמר'); return; }
    const st = thp.stays[x.dataset.crTask]; if(st && st.tasks && st.tasks[+x.dataset.i]) st.tasks[+x.dataset.i].done = x.checked;
  }));
  box.querySelectorAll('[data-cr-marks]').forEach(b => b.addEventListener('click', () => careMarksOpen()));
}

// ---- the end of a shift: one screen, every child's focus goals, yes / no / not seen (decision 121)
function careMarksBannerHtml(){
  return '';          // (not for now: Guy, the walkthrough Q22. The screen stays, without the way in.)
  if(!thp.v43) return '';
  const h = new Date().getHours(), m = new Date().getMinutes(), end = (h === 14 && m >= 0) || (h === 21 || h === 22) || h === 6;          // (near the end of a shift: a stronger look)
  return `<button type="button" class="btn${end && !thp.markedToday ? '' : ' ghost'} cr-marks-btn" data-cr-marks>✔ סימון סוף משמרת</button>`;
}
async function careMarksOpen(){
  const kids = thpKids().map(c => ({ c, goals:((thp.guidance[c.id] || {}).content || { goals:[] }).goals.filter(g => g.focus && g.title) })).filter(x => x.goals.length);
  const day = careToday(), mine = {};
  try { const r = await sbPersonal.from('goal_marks').select('child_id,goal_id,value').eq('staff_id', srv.me).eq('day', day); (r.data || []).forEach(x => { mine[x.child_id + '|' + x.goal_id] = x.value; }); } catch(e){}
  const btn = (k, v, w) => `<button type="button" data-v="${v}" class="${mine[k] === v ? 'on' : ''}">${w}</button>`;
  const sh = portalSheet(`<h2>סימון סוף משמרת</h2><div class="pnote">לכל מטרה במוקד: האם ראית את זה היום? לוחצים וזה נשמר. מה שלא ראית מסמנים "לא ראיתי".</div>
    ${kids.length ? kids.map(({ c, goals }) => `<div class="cr-mk-kid">${thpAvatar(c)}<b class="ar-keep">${pEsc(displayName(c))}</b></div>${goals.map(g => { const k = c.id + '|' + g.id;
      return `<div class="cr-mk-row" data-mk="${pEsc(k)}"><span class="ar-keep">${pEsc(g.title)}</span><div class="pchoice">${btn(k, 'yes', 'כן')}${btn(k, 'no', 'לא')}${btn(k, 'na', 'לא ראיתי')}</div></div>`; }).join('')}`).join('')
      : '<div class="pnote">עוד אין מטרות במוקד בתוכניות שפורסמו.</div>'}
    <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>סיום</button></div>`);
  sh.addEventListener('click', async e => {
    const b = e.target.closest('[data-mk] [data-v]'); if(!b) return;
    const row = b.closest('[data-mk]'), [child_id, goal_id] = row.dataset.mk.split('|');
    const r = await sbPersonal.from('goal_marks').upsert({ child_id, goal_id, staff_id:srv.me, day, value:b.dataset.v, at:new Date().toISOString() });
    if(r.error){ toast(/goal_marks/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v43.sql' : 'לא נשמר'); return; }
    row.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x === b)); thp.markedToday = true;
  });
}

// ---- an incident in 30 seconds (decision 123)
function careIncidentOpen(childId){
  const c = roster.find(x => x.id === childId); if(!c) return;
  const goals = ((thp.guidance[childId] || {}).content || { goals:[] }).goals.filter(g => g.focus && g.title);
  const helpedList = [...goals.flatMap(g => (g.interventions_list || []).map(i => i.name)), ...INC_HELPED];          // (the child's interventions first: Q30)
  const chips = (name, list) => `<div class="pchoice wrap cr-chips" data-grp="${name}">${list.map(x => { const [k, w, e] = Array.isArray(x) ? x : [x, x, '']; return `<button type="button" data-k="${pEsc(k)}">${e ? e + ' ' : ''}${pEsc(w)}</button>`; }).join('')}</div>`;
  const sh = portalSheet(`<h2>אירוע: <span class="ar-keep">${pEsc(displayName(c))}</span></h2><div class="pnote">כמה לחיצות. השעה והמשמרת נרשמות לבד. עוצמה 3 או פגיעה עצמית: המטפל/ת מקבל/ת הודעה מיד.</div>
    <div class="pfield"><span>מה קרה?</span>${chips('kind', INC_KINDS)}</div>
    <div class="pfield"><span>עוצמה</span><div class="pchoice cr-chips" data-grp="intensity"><button type="button" data-k="1">1 קל</button><button type="button" data-k="2">2 בינוני</button><button type="button" data-k="3">3 חמור</button></div></div>
    <div class="pfield"><span>מה היה לפני? (אפשר כמה)</span>${chips('before', INC_BEFORE)}</div>
    <div class="pfield"><span>מה עזר? (אפשר כמה)</span>${chips('helped', [...new Set(helpedList)])}</div>
    ${goals.length ? `<div class="pfield"><span>קשור למטרה? (רשות)</span>${chips('goal', goals.map(g => [g.id, g.title, '']))}</div>` : ''}
    <label class="pfield">משפט (רשות)<input type="text" id="inc-note" maxlength="300"></label>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="inc-send">שליחה</button></div>`);
  const pick = { kind:null, intensity:null, before:new Set(), helped:new Set(), goal:null }, multi = ['before', 'helped'];
  sh.querySelectorAll('[data-grp]').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if(!b) return; const grp = g.dataset.grp, k = b.dataset.k;
    if(multi.includes(grp)){ if(pick[grp].has(k)) pick[grp].delete(k); else pick[grp].add(k); b.classList.toggle('on', pick[grp].has(k)); return; }
    pick[grp] = pick[grp] === k ? null : k; g.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x.dataset.k === pick[grp]));
  }));
  sh.querySelector('#inc-send').addEventListener('click', async e => {
    if(!pick.kind || !pick.intensity){ toast('בוחרים מה קרה ובאיזו עוצמה'); return; }
    e.target.disabled = true;
    const r = await sbPersonal.from('incidents').insert({ child_id:childId, author:srv.me, shift:careShift(), kind:pick.kind, intensity:+pick.intensity, before:[...pick.before], helped:[...pick.helped], goal_id:pick.goal, note:sh.querySelector('#inc-note').value.trim() || null });
    if(r.error){ e.target.disabled = false; toast(/incidents/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v43.sql' : 'האירוע לא נשמר. אפשר לנסות שוב'); return; }
    sh.close(); toast(+pick.intensity === 3 || pick.kind === 'self_harm' ? 'האירוע נשמר, והמטפל/ת קיבל/ה הודעה' : 'האירוע נשמר. תודה');
  });
}

// ---- the family contact log (decision 127): every staff member records
function careFamilyOpen(childId){
  const c = roster.find(x => x.id === childId); if(!c) return;
  const sh = portalSheet(`<h2>קשר עם המשפחה: <span class="ar-keep">${pEsc(displayName(c))}</span></h2><div class="pnote">מגיע רק למטפל/ת, לרכזת ולמנהל המערכת. הצוות רואה רק מתי המפגש הבא ומה להכין.</div>
    <div class="pfield"><span>מה היה?</span><div class="pchoice wrap cr-chips" data-grp="kind">${FAM_KINDS.map(([k, w]) => `<button type="button" data-k="${k}">${w}</button>`).join('')}</div></div>
    <label class="pfield">עם מי<input type="text" id="fam-who" maxlength="60" placeholder="למשל: אמא, סבתא"></label>
    <div class="pfield"><span>איך חזר/ה?</span><div class="pchoice cr-chips" data-grp="back">${FAM_BACK.map(([k, w]) => `<button type="button" data-k="${k}">${w}</button>`).join('')}</div></div>
    <label class="pfield">משפט (רשות)<input type="text" id="fam-note" maxlength="300"></label>
    <div class="th-ed-grid"><label class="pfield">המפגש הבא (אם ידוע)<input type="date" id="fam-next"></label><label class="pfield">מה להכין לקראתו<input type="text" id="fam-prep" maxlength="120" placeholder="למשל: ציור לאמא, שיחת הכנה"></label></div>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="fam-send">שמירה</button></div>`);
  const pick = { kind:null, back:null };
  sh.querySelectorAll('[data-grp]').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if(!b) return; pick[g.dataset.grp] = pick[g.dataset.grp] === b.dataset.k ? null : b.dataset.k; g.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x.dataset.k === pick[g.dataset.grp])); }));
  sh.querySelector('#fam-send').addEventListener('click', async e => {
    if(!pick.kind){ toast('בוחרים מה היה'); return; }
    e.target.disabled = true;
    const v = s => sh.querySelector(s).value.trim() || null;
    const r = await sbPersonal.from('family_contacts').insert({ child_id:childId, author:srv.me, kind:pick.kind, with_whom:v('#fam-who'), came_back:pick.back, note:v('#fam-note'), next_at:v('#fam-next'), next_prep:v('#fam-prep') });
    if(r.error){ e.target.disabled = false; toast(/family_contacts/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v43.sql' : 'לא נשמר'); return; }
    sh.close(); toast('נשמר. תודה'); await careLoad();
  });
}
// ---- a sentence for the book of a child who leaves (decision 128)
function careLetterOpen(childId){
  const c = roster.find(x => x.id === childId); if(!c) return;
  const sh = portalSheet(`<h2>משפט לספר של <span class="ar-keep">${pEsc(displayName(c))}</span></h2><div class="pnote">משפט טוב שתרצו שייזכר. המטפל/ת עובר/ת על המשפטים לפני שהם נכנסים לספר.</div>
    <textarea id="lt-text" rows="3" maxlength="400" placeholder="למשל: תמיד ידעת להצחיק את כולם בארוחת הערב"></textarea>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="lt-send">שליחה</button></div>`);
  sh.querySelector('#lt-send').addEventListener('click', async () => {
    const text = sh.querySelector('#lt-text').value.trim(); if(!text){ toast('כותבים משפט'); return; }
    const r = await sbPersonal.from('staff_letters').insert({ child_id:childId, author:srv.me, text });
    if(r.error){ toast('לא נשמר'); return; }
    sh.close(); toast('המשפט נשמר. תודה');
  });
}
// the extra buttons of a child's sheet (the staff's view): family, the book's letter; the coordinator and the admin see the family log there
function careChildSheetHtml(id){
  if(!thp.v43) return '';
  const st = thp.stays[id] || {}, coord = canAssignTherapist() || (srv.profile && srv.profile.admin);
  return `<button type="button" class="btn ghost" id="th-inc" style="width:100%;margin-top:8px">⚠️ דיווח על אירוע</button>
    <button type="button" class="btn ghost" id="th-fam" style="width:100%;margin-top:8px">👨‍👩‍👧 קשר עם המשפחה</button>
    ${st.exit_date ? '<button type="button" class="btn ghost" id="th-letter" style="width:100%;margin-top:8px">✉️ משפט לספר</button>' : ''}
    ${coord ? '<div id="th-famlog"></div>' : ''}`;
}
function careChildSheetWire(sh, id){
  const b = (s, f) => { const x = sh.querySelector(s); if(x) x.addEventListener('click', () => { sh.close(); f(id); }); };
  b('#th-inc', careIncidentOpen); b('#th-fam', careFamilyOpen); b('#th-letter', careLetterOpen);
  const fl = sh.querySelector('#th-famlog'); if(fl) careFamilyLog(id, fl);
}

// ---- the therapist's workspace: the incidents and their patterns (decision 123)
const careBars = (title, counts) => { const l = Object.entries(counts).filter(x => x[1]).sort((a, b) => b[1] - a[1]); if(!l.length) return ''; const max = l[0][1];
  return `<div class="cr-bars"><b>${title}</b>${l.map(([k, n]) => `<div class="cr-bar"><span class="ar-keep">${pEsc(k)}</span><i style="width:${Math.round(n / max * 100)}%"></i><em>${n}</em></div>`).join('')}</div>`; };
async function careEventsSection(id, box){
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const r = await sbPersonal.from('incidents').select('*').eq('child_id', id).gte('at', since).order('at', { ascending:false });
  if(r.error){ box.innerHTML = '<div class="pnote">יומן האירועים עוד לא פעיל בשרת הזה (scheduling-v43.sql).</div>'; return; }
  const l = r.data || [], names = {}; (portalLoad().instructors || []).forEach(p => { names[p.id] = p.first; });
  const cnt = (f) => { const o = {}; l.forEach(x => [].concat(f(x)).filter(Boolean).forEach(k => { o[k] = (o[k] || 0) + 1; })); return o; };
  const kindW = k => (INC_KINDS.find(x => x[0] === k) || [k, k])[1], days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const hourB = x => { const h = new Date(x.at).getHours(); return h < 7 ? '00–07' : h < 11 ? '07–11' : h < 15 ? '11–15' : h < 19 ? '15–19' : h < 23 ? '19–23' : '23–24'; };
  const last4 = l.filter(x => new Date(x.at) >= new Date(Date.now() - 28 * 864e5)).length, prev4 = l.filter(x => new Date(x.at) < new Date(Date.now() - 28 * 864e5) && new Date(x.at) >= new Date(Date.now() - 56 * 864e5)).length;
  box.innerHTML = `<div class="trk-sentence">${l.length ? `ב-4 השבועות האחרונים: ${last4} אירועים${prev4 || last4 ? ` (לפני כן: ${prev4})` : ''}.` : 'אין אירועים ב-90 הימים האחרונים.'}</div>
    ${l.length ? `<div class="pnote">דפוסים מ-90 הימים האחרונים. אלה נתונים שנרשמו, לא מסקנה.</div><div class="cr-pattern">
      ${careBars('סוג', cnt(x => kindW(x.kind)))}${careBars('מה היה לפני', cnt(x => x.before))}${careBars('מה עזר', cnt(x => x.helped))}
      ${careBars('משמרת', cnt(x => x.shift))}${careBars('שעה', cnt(hourB))}${careBars('יום בשבוע', cnt(x => days[new Date(x.at).getDay()]))}</div>
      <h3 class="psec">האירועים</h3>${l.map(x => `<div class="obs-item${x.seen_at ? '' : ' new'}${x.intensity === 3 || x.kind === 'self_harm' ? ' cr-hard' : ''}"><div class="obs-head"><b>${pEsc(kindW(x.kind))} · עוצמה ${x.intensity}</b><small>${pEsc(dayLabel(String(x.at).slice(0, 10)))} ${new Date(x.at).toTimeString().slice(0, 5)} · ${pEsc(x.shift || '')} · ${pEsc(names[x.author] || 'צוות')}</small></div>
        ${(x.before || []).length ? `<div class="obs-body">לפני: ${x.before.map(pEsc).join(', ')}</div>` : ''}${(x.helped || []).length ? `<div class="obs-body">עזר: ${x.helped.map(pEsc).join(', ')}</div>` : ''}${x.note ? `<div class="obs-body">${pEsc(x.note)}</div>` : ''}</div>`).join('')}` : ''}`;
  const unseen = l.filter(x => !x.seen_at).map(x => x.id);
  if(unseen.length) sbPersonal.from('incidents').update({ seen_at:new Date().toISOString() }).in('id', unseen).then(() => { if(thp.newInc) delete thp.newInc[id]; }, () => {});
}
// ---- the family log (the therapist, the coordinator, the admin)
async function careFamilyLog(id, box){
  const r = await sbPersonal.from('family_contacts').select('*').eq('child_id', id).order('at', { ascending:false }).limit(60);
  if(r.error){ box.innerHTML = ''; return; }
  const l = r.data || [], kw = k => (FAM_KINDS.find(x => x[0] === k) || [k, k])[1], bw = k => (FAM_BACK.find(x => x[0] === k) || [k, ''])[1];
  const back = {}; l.forEach(x => { if(x.came_back) back[bw(x.came_back)] = (back[bw(x.came_back)] || 0) + 1; });
  box.innerHTML = `<h3 class="psec">יומן הקשר עם המשפחה</h3>${l.length ? `${careBars('איך חזר/ה', back)}${l.map(x => `<div class="obs-item"><div class="obs-head"><b>${pEsc(kw(x.kind))}${x.with_whom ? ' · ' + pEsc(x.with_whom) : ''}</b><small>${pEsc(dayLabel(String(x.at).slice(0, 10)))}</small>${x.came_back ? `<span class="th-chip">${pEsc(bw(x.came_back))}</span>` : ''}</div>
    ${x.note ? `<div class="obs-body">${pEsc(x.note)}</div>` : ''}${x.next_at ? `<div class="obs-body">המפגש הבא: ${pEsc(dayLabel(x.next_at))}${x.next_prep ? ' · ' + pEsc(x.next_prep) : ''}</div>` : ''}</div>`).join('')}` : '<div class="pnote">עוד אין רישומים.</div>'}`;
}
function careFamilySection(id, box){
  box.innerHTML = '<button type="button" class="btn" id="cr-fam-add">+ רישום קשר עם המשפחה</button><div id="cr-fam-log"></div>';
  box.querySelector('#cr-fam-add').addEventListener('click', () => careFamilyOpen(id));
  careFamilyLog(id, box.querySelector('#cr-fam-log'));
}

// ---- the stay: intake (decision 126), exit (128), archive (129)
async function careStayGet(id){ const r = await sbPersonal.from('child_stays').select('*').eq('child_id', id).maybeSingle(); return r.error ? null : (r.data || { child_id:id, intake:{}, exit:{} }); }
async function careStaySave(id, patch){
  const row = Object.assign({ child_id:id, name:careName(id), updated_at:new Date().toISOString() }, patch);
  const r = await sbPersonal.from('child_stays').upsert(row).select('*').single();
  if(r.error){ toast(/child_stays/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v43.sql' : 'לא נשמר'); return null; }
  thp.stays[id] = Object.assign({}, thp.stays[id] || {}, r.data, { avoid:(r.data.intake || {}).avoid, calm:(r.data.intake || {}).calm, tasks:(r.data.intake || {}).tasks || [] }); return r.data;
}
async function careStaySection(id, box){
  const s = await careStayGet(id); if(!s){ box.innerHTML = '<div class="pnote">הקליטה והיציאה עוד לא פעילות בשרת הזה (scheduling-v43.sql).</div>'; return; }
  const it = s.intake || {}, ex = s.exit || {}, tasks = (it.tasks && it.tasks.length) ? it.tasks : INTAKE_TASKS.map(t => ({ t, done:false })), prep = (ex.prep && ex.prep.length) ? ex.prep : EXIT_PREP.map(t => ({ t, done:false }));
  const due = s.admitted ? isoDate(new Date(new Date(s.admitted + 'T12:00:00').getTime() + careFirstDays() * 864e5)) : '';
  const list = (cls, l) => `<div class="cr-list" data-list="${cls}">${l.map(x => `<div class="cr-li"><input type="checkbox"${x.done ? ' checked' : ''} aria-label="בוצע"><input type="text" value="${pEsc(x.t)}" maxlength="80" aria-label="משימה"><button type="button" class="btn ghost small" data-li-x aria-label="הסרה">✕</button></div>`).join('')}<button type="button" class="btn ghost small" data-li-add>+ עוד</button></div>`;
  box.innerHTML = `<h3 class="psec">קליטה</h3><div class="pnote">מה שכתוב ב"ממה להימנע" וב"מה מרגיע" מופיע לצוות בכרטיס הילד/ה עד שיש תוכנית שפורסמה. המשימות מסומנות על ידי הצוות.</div>
    <div class="th-ed-grid"><label class="pfield">תאריך הגעה<input type="date" id="st-adm" value="${pEsc(s.admitted || '')}"></label><div class="pfield"><span>התוכנית הראשונה</span><b class="bk-band">${due ? 'עד ' + pEsc(dayLabel(due)) + ` (${careFirstDays()} יום)` : 'לפי תאריך ההגעה'}</b></div></div>
    <label class="pfield">מה ידוע (למטפל/ת בלבד)<textarea id="st-known" rows="3">${pEsc(it.known || '')}</textarea></label>
    <label class="pfield">ממה להימנע בינתיים (לצוות)<textarea id="st-avoid" rows="2">${pEsc(it.avoid || '')}</textarea></label>
    <label class="pfield">מה מרגיע בינתיים (לצוות)<textarea id="st-calm" rows="2">${pEsc(it.calm || '')}</textarea></label>
    <div class="pfield"><span>משימות לצוות בימים הראשונים</span>${list('tasks', tasks)}</div>
    <button type="button" class="btn" id="st-save-in">שמירת הקליטה</button>
    <h3 class="psec">יציאה</h3>
    <div class="th-ed-grid"><label class="pfield">תאריך יציאה<input type="date" id="st-exit" value="${pEsc(s.exit_date || '')}"></label><label class="pfield">לאן<input type="text" id="st-next" maxlength="80" value="${pEsc(ex.next_place || '')}" placeholder="המסגרת הבאה"></label></div>
    <div class="pfield"><span>הכנה ליציאה</span>${list('prep', prep)}</div>
    <label class="pfield">מה הילד/ה רוצה שהמסגרת הבאה תדע<textarea id="st-wish" rows="2">${pEsc(ex.wish || '')}</textarea></label>
    <label class="pfield">רגעים טובים לספר (רגע בכל שורה)<textarea id="st-moments" rows="3">${pEsc(ex.moments || '')}</textarea></label>
    <label class="pfield">המכתב שלך לספר<textarea id="st-letter" rows="3">${pEsc(ex.letter || '')}</textarea></label>
    <div class="th-actions"><button type="button" class="btn" id="st-save-ex">שמירת היציאה</button>${s.exit_date ? '<button type="button" class="btn ghost" id="st-archive">📦 העברה לארכיון</button>' : ''}</div>
    <div class="pnote">כשנקבע תאריך יציאה, הצוות מקבל הזמנה לכתוב משפט לספר. המסמכים (חפיפה, הספר) בלשונית "מסמכים".</div>`;
  box.addEventListener('click', e => {
    const x = e.target.closest('[data-li-x]'); if(x){ x.closest('.cr-li').remove(); return; }
    const a = e.target.closest('[data-li-add]'); if(a){ a.insertAdjacentHTML('beforebegin', '<div class="cr-li"><input type="checkbox" aria-label="בוצע"><input type="text" maxlength="80" aria-label="משימה"><button type="button" class="btn ghost small" data-li-x aria-label="הסרה">✕</button></div>'); }
  });
  const readList = k => [...box.querySelectorAll(`[data-list="${k}"] .cr-li`)].map(li => ({ t:li.querySelector('input[type=text]').value.trim(), done:li.querySelector('input[type=checkbox]').checked })).filter(x => x.t);
  const v = q => box.querySelector(q).value.trim();
  box.querySelector('#st-save-in').addEventListener('click', async () => {
    if(await careStaySave(id, { admitted:v('#st-adm') || null, intake:{ known:v('#st-known'), avoid:v('#st-avoid'), calm:v('#st-calm'), tasks:readList('tasks') } })){ toast('הקליטה נשמרה'); careStaySection(id, box); }
  });
  box.querySelector('#st-save-ex').addEventListener('click', async () => {
    const first = !s.exit_date && v('#st-exit');
    if(await careStaySave(id, { exit_date:v('#st-exit') || null, exit:{ prep:readList('prep'), next_place:v('#st-next'), wish:v('#st-wish'), moments:v('#st-moments'), letter:v('#st-letter') } })){
      if(first){ const r = await sbPersonal.rpc('exit_invite', { p_child:id }); toast(r.error ? 'היציאה נשמרה' : 'היציאה נשמרה, והצוות הוזמן לכתוב משפט לספר', 6000); } else toast('היציאה נשמרה');
      careStaySection(id, box); }
  });
  const ar = box.querySelector('#st-archive'); if(ar) ar.addEventListener('click', async () => {
    if(!(await confirmSheet({ title:'להעביר לארכיון?', text:'התוכנית, התצפיות והיומנים יעברו לארכיון שרק מנהל המערכת רואה. אם הילד/ה יחזור/תחזור, אפשר להחזיר מהארכיון ולהמשיך מאותו מקום.', okLabel:'כן, לארכיון', cancelLabel:'חזרה' }))) return;
    if(await careStaySave(id, { archived:true, archived_at:new Date().toISOString() })){ toast('הועבר לארכיון'); thp.editing = null; thp.wtab = null; thpRender(); }
  });
}
// ---- the admin's archive (decision 129)
async function careArchiveHtml(box){
  const r = await sbPersonal.from('child_stays').select('child_id,name,exit_date,archived_at').eq('archived', true).order('archived_at', { ascending:false });
  if(r.error){ box.innerHTML = '<div class="pnote">הארכיון עוד לא פעיל בשרת הזה (scheduling-v43.sql).</div>'; return; }
  const l = r.data || [];
  box.innerHTML = `<div class="pnote">ילדים שיצאו והועברו לארכיון. רק מנהל המערכת רואה. "החזרה" מחזירה את הכל כמו שהיה; "מחיקה" מוחקת את כל המידע הטיפולי לצמיתות.</div>
    ${l.map(x => `<div class="th-assign-row"><b class="ar-keep">${pEsc(x.name || x.child_id)}</b><small>${x.exit_date ? 'יצא/ה ' + pEsc(dayLabel(x.exit_date)) : ''}</small><button type="button" class="btn ghost small" data-arc-back="${pEsc(x.child_id)}">החזרה</button><button type="button" class="btn ghost small" data-arc-del="${pEsc(x.child_id)}">מחיקה</button></div>`).join('') || '<div class="th-empty"><span aria-hidden="true">📦</span><b>הארכיון ריק</b></div>'}`;
  box.querySelectorAll('[data-arc-back]').forEach(b => b.addEventListener('click', async () => {
    const u = await sbPersonal.from('child_stays').update({ archived:false, archived_at:null }).eq('child_id', b.dataset.arcBack);
    if(u.error){ toast('לא הצלחנו'); return; } toast('הוחזר מהארכיון'); await careLoad(); careArchiveHtml(box);
  }));
  box.querySelectorAll('[data-arc-del]').forEach(b => b.addEventListener('click', async () => {
    if(!(await confirmSheet({ title:'למחוק לצמיתות?', text:'כל המידע הטיפולי של הילד/ה יימחק: התוכנית וגרסאותיה, התצפיות, האירועים, יומן המשפחה והסרטונים. אי אפשר לשחזר.', okLabel:'כן, למחוק', cancelLabel:'חזרה', danger:true }))) return;
    const d = await sbPersonal.rpc('therapy_purge', { p_child:b.dataset.arcDel });
    if(d.error){ toast('המחיקה נכשלה'); return; } toast('נמחק'); careArchiveHtml(box);
  }));
}

// ---- the progress graph per goal (decision 122): steps, bricks of the goal's strengths, "yes" marks, the monthly scale; the therapist rates here
async function careGraphs(id, box){
  if(!box || !thp.v43) return;
  if(typeof tpSpiralSection === 'function' && await tpSpiralSection(id, box)) return;          // (a plan of the new kind: the spiral of every target, Q23)
  const plan = (thp.plans[id] && (thp.plans[id].published || thp.plans[id].draft)) || { goals:[] }, goals = (plan.goals || []).filter(g => g.title);
  if(!goals.length) return;
  const since = obsWeekStart(Date.now() - 7 * 7 * 864e5), wk = t => Math.min(7, Math.max(0, Math.floor((new Date(t) - since) / (7 * 864e5))));
  const [st, ev, mk, sc] = await Promise.all([sbPersonal.from('journey_steps').select('planet_id,at').eq('child_id', id).gte('at', since.toISOString()),
    sb.from('feedback_events').select('message,created_at').eq('child_id', id).eq('type', 'bricks').gte('created_at', since.toISOString()),
    sbPersonal.from('goal_marks').select('goal_id,day,value').eq('child_id', id).gte('day', isoDate(since)), sbPersonal.from('goal_scale').select('goal_id,rated_on,value').eq('child_id', id).order('rated_on')]);
  const brickWhy = m => ((m || '').match(/ · כוח: (.+)$/) || [])[1] || '';
  const sec = document.createElement('div'); sec.className = 'cr-graphs';
  const bars = (label, arr, max, fmt) => `<div class="trk-chart"><b>${label}</b><div class="trk-bars">${arr.map(v => `<span title="${v == null ? '—' : fmt ? fmt(v) : v}"><i style="height:${v == null ? 0 : Math.round(v / max * 100)}%"></i></span>`).join('')}</div></div>`;
  sec.innerHTML = `<h3 class="psec">התקדמות לפי מטרה</h3><div class="pnote">8 שבועות. ימים שבהם היה צעד במסע, לבנים עם החוזקות של המטרה, אחוז ה"כן" בסימוני סוף משמרת, והסולם החודשי שלך. נתונים, לא מסקנה.</div>
    ${goals.map(g => {
      const steps = Array(8).fill(0), bricks = Array(8).fill(0), yes = Array(8).fill(0), all = Array(8).fill(0);
      (st.data || []).forEach(x => { if(g.planet_id && x.planet_id === g.planet_id) steps[wk(x.at)]++; });
      (ev.data || []).forEach(e => { if((g.strengths || []).includes(brickWhy(e.message))) bricks[wk(e.created_at)]++; });
      (mk.data || []).forEach(m => { if(m.goal_id !== g.id || m.value === 'na') return; const w = wk(m.day + 'T12:00:00'); all[w]++; if(m.value === 'yes') yes[w]++; });
      const pct = all.map((n, i) => n ? Math.round(yes[i] / n * 100) : null), rates = (sc.data || []).filter(x => x.goal_id === g.id), last = rates[rates.length - 1];
      return `<div class="cr-goal" data-cr-goal="${pEsc(g.id)}"><b>${pEsc(g.title)}</b>${g.scale && g.scale.target ? `<small>יעד בסולם: ${g.scale.target}</small>` : ''}
        <div class="cr-charts">${bars('ימי צעד במסע', steps, 7)}${bars('לבנים', bricks, Math.max(3, ...bricks))}${bars('"כן" בסוף משמרת', pct, 100, v => v + '%')}</div>
        <div class="cr-scale"><span>הסולם החודשי: ${rates.length ? rates.map(x => `<em title="${pEsc(dayLabel(x.rated_on))}">${x.value}</em>`).join(' ← ') : 'עוד לא דורג'}</span>
          <label>הדירוג של החודש <select data-cr-rate="${pEsc(g.id)}"><option value="">—</option>${[1, 2, 3, 4, 5].map(k => `<option${last && last.rated_on.slice(0, 7) === careToday().slice(0, 7) && last.value === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label></div></div>`; }).join('')}`;
  box.appendChild(sec);
  sec.querySelectorAll('[data-cr-rate]').forEach(s => s.addEventListener('change', async () => {
    if(!s.value) return;
    const r = await sbPersonal.from('goal_scale').upsert({ child_id:id, goal_id:s.dataset.crRate, rated_on:careToday(), value:+s.value });
    if(r.error){ toast('לא נשמר'); return; } toast('הדירוג נשמר'); sec.remove(); careGraphs(id, box);
  }));
}

// ---- the documents (decisions 124, 125, 128): a sheet that can be edited, printed (PDF) or downloaded for Word
function careDocSheet(title, html, file){
  const sh = portalSheet(`<h2>${pEsc(title)}</h2><div class="pnote">אפשר לערוך כאן ישירות. מה שבסוגריים מרובעים מחכה להשלמה.</div>
    <div class="cr-doc" id="cr-doc" contenteditable="true" dir="rtl">${html}</div>
    <div class="confirm-actions cr-doc-acts"><button type="button" class="btn ghost" data-close>סגירה</button><button type="button" class="btn ghost" id="cr-doc-word">⬇ Word</button><button type="button" class="btn" id="cr-doc-print">🖨️ הדפסה / PDF</button></div>`);
  sh.classList.add('cr-doc-sheet');
  const body = () => sh.querySelector('#cr-doc').innerHTML;
  sh.querySelector('#cr-doc-word').addEventListener('click', () => {
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${pEsc(title)}</title><style>body{font-family:Arial,sans-serif;direction:rtl}h1{font-size:20pt}h2{font-size:14pt;margin-top:14pt}.cr-pg{page-break-after:always}</style></head><body dir="rtl">${body()}</body></html>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿', doc], { type:'application/msword' })); a.download = (file || title) + '.doc'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  sh.querySelector('#cr-doc-print').addEventListener('click', () => {
    let el = document.getElementById('print-sheet'); if(!el){ el = document.createElement('div'); el.id = 'print-sheet'; document.body.appendChild(el); }
    el.innerHTML = `<div class="th-print cr-print">${body()}</div>`; document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); try { window.print(); } catch(e){ done(); } setTimeout(done, 60000);
  });
  return sh;
}
const careTop = (counts, n) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n || 4).map(x => x[0]);
const careCount = (l, f) => { const o = {}; l.forEach(x => [].concat(f(x)).filter(Boolean).forEach(k => { o[k] = (o[k] || 0) + 1; })); return o; };
async function careData(id, from, to){
  const fromT = (from || '2000-01-01') + 'T00:00:00', toT = (to || '2999-12-31') + 'T23:59:59';
  const q = (t, col) => sbPersonal.from(t).select('*').eq('child_id', id).gte(col, fromT).lte(col, toT);
  const [inc, obs, mk, sc, fam, steps, strengths, stay] = await Promise.all([q('incidents', 'at'), q('observations', 'created_at'), sbPersonal.from('goal_marks').select('*').eq('child_id', id).gte('day', from || '2000-01-01').lte('day', to || '2999-12-31'),
    sbPersonal.from('goal_scale').select('*').eq('child_id', id).order('rated_on'), q('family_contacts', 'at'), sbPersonal.from('journey_steps').select('planet_id,day').eq('child_id', id).gte('day', from || '2000-01-01').lte('day', to || '2999-12-31'),
    sbPersonal.from('child_strengths').select('strength,status,picks').eq('child_id', id).order('picks', { ascending:false }), careStayGet(id)]);
  const row = thp.plans[id] || {}, plan = row.published || row.draft || planEmpty();
  return { inc:inc.data || [], obs:obs.data || [], marks:mk.data || [], scale:sc.data || [], fam:fam.data || [], steps:steps.data || [], strengths:(strengths.data || []).filter(s => s.status !== 'removed'), stay:stay || {}, plan, row };
}
// the child on one page: the therapist's map, and a simple one for the staff
async function careOnePage(id, forStaff){
  const D = await careData(id, isoDate(new Date(Date.now() - 90 * 864e5))), p = D.plan, name = careName(id), focus = (p.goals || []).filter(g => g.focus && g.title);
  const strengths = [...new Set([...(p.goals || []).flatMap(g => g.strengths || []), ...D.strengths.filter(s => s.status === 'main').map(s => s.strength)])];
  const ul = l => l.length ? `<ul>${l.map(x => `<li>${pEsc(x)}</li>`).join('')}</ul>` : '<p>[להשלמה]</p>';
  if(forStaff) return careDocSheet(`${name}: דף לצוות`, `<h1>${pEsc(name)}</h1>
    ${strengths.length ? `<h2>על מה נשענים</h2><p>${strengths.map(pEsc).join(' · ')}</p>` : ''}
    <h2>ממה להימנע</h2><p>${pEsc(p.avoid || '[להשלמה]')}</p>${p.signs ? `<h2>אותות מוקדמים</h2><p>${pEsc(p.signs)}</p>` : ''}<h2>מה מרגיע</h2><p>${pEsc(p.calm || '[להשלמה]')}</p>
    <h2>המטרות במוקד</h2>${focus.map(g => `<h3>${pEsc(g.title)}</h3>${g.interventions ? `<p><b>מה עושים:</b> ${pEsc(g.interventions)}</p>` : ''}${g.sentences ? `<p><b>מה אומרים:</b> ${pEsc(g.sentences)}</p>` : ''}`).join('') || '<p>[אין עדיין מטרות במוקד]</p>'}`, `דף לצוות - ${name}`);
  const before = careTop(careCount(D.inc, x => x.before)), helped = careTop(careCount(D.inc, x => x.helped));
  const goalLine = g => { const m = D.marks.filter(x => x.goal_id === g.id && x.value !== 'na'), y = m.filter(x => x.value === 'yes').length, r = D.scale.filter(x => x.goal_id === g.id), succ = D.obs.filter(o => o.goal_id === g.id && o.valence === 'success').length, diff = D.obs.filter(o => o.goal_id === g.id && o.valence === 'difficulty').length;
    return `<li><b>${pEsc(g.title)}</b>: ${m.length ? `"כן" ב-${Math.round(y / m.length * 100)}% מהסימונים` : 'אין סימונים'}${r.length ? ` · סולם ${r.map(x => x.value).join(' ← ')}` : ''}${succ || diff ? ` · תצפיות: ${succ} הצלחות, ${diff} קשיים` : ''}</li>`; };
  return careDocSheet(`${name} בעמוד אחד`, `<h1>${pEsc(name)} בעמוד אחד</h1><p class="cr-meta">90 הימים האחרונים · ${pEsc(dayLabel(careToday()))}</p>
    <h2>חוזקות</h2><p>${strengths.map(pEsc).join(' · ') || '[להשלמה]'}</p>
    <h2>מה מקפיץ</h2>${ul([p.avoid, ...before.map(b => 'לפי האירועים: ' + b)].filter(Boolean))}
    <h2>אותות מוקדמים</h2><p>${pEsc(p.signs || '[להשלמה]')}</p>
    <h2>מה מרגיע</h2>${ul([p.calm, ...helped.map(h => 'לפי האירועים: ' + h)].filter(Boolean))}
    <h2>המטרות וההתקדמות</h2><ul>${(p.goals || []).filter(g => g.title).map(goalLine).join('') || '<li>[אין מטרות]</li>'}</ul>
    <h2>אירועים</h2><p>${D.inc.length} אירועים${D.inc.length ? ': ' + Object.entries(careCount(D.inc, x => (INC_KINDS.find(k => k[0] === x.kind) || [, x.kind])[1])).map(([k, n]) => `${k} ${n}`).join(', ') : ''}.</p>
    <h2>מה עובד לפי הנתונים</h2>${ul(helped.length ? helped : ['[עוד אין מספיק נתונים]'])}
    <h2>מחשבות שלי</h2><p>[להשלמה]</p>`, `עמוד אחד - ${name}`);
}
// the assessment report draft, for a chosen period (decision 125: a structure Claude proposes)
async function careReport(id, from, to){
  const D = await careData(id, from, to), p = D.plan, name = careName(id), st = D.stay || {}, c = roster.find(x => x.id === id) || {};
  const kinds = careCount(D.inc, x => (INC_KINDS.find(k => k[0] === x.kind) || [, x.kind])[1]), hard = D.inc.filter(x => x.intensity === 3).length;
  const famK = careCount(D.fam, x => (FAM_KINDS.find(k => k[0] === x.kind) || [, x.kind])[1]), famB = careCount(D.fam.filter(x => x.came_back), x => (FAM_BACK.find(k => k[0] === x.came_back) || [, ''])[1]);
  const goal = g => { const m = D.marks.filter(x => x.goal_id === g.id && x.value !== 'na'), y = m.filter(x => x.value === 'yes').length, r = D.scale.filter(x => x.goal_id === g.id && x.rated_on >= from && x.rated_on <= to);
    const steps = g.planet_id ? D.steps.filter(s => s.planet_id === g.planet_id).length : 0;
    return `<h3>${pEsc(g.title)}</h3><p>${g.targets ? `<b>היעד:</b> ${pEsc(g.targets)}<br>` : ''}${m.length ? `סימוני סוף משמרת: "כן" ב-${Math.round(y / m.length * 100)}% (${m.length} סימונים). ` : ''}${steps ? `ימי תרגול במסע: ${steps}. ` : ''}${r.length ? `סולם: ${r.map(x => x.value).join(' ← ')}. ` : ''}</p><p>[התרשמות המטפל/ת]</p>`; };
  return careDocSheet(`דוח הערכה: ${name}`, `<h1>דוח הערכה</h1><p class="cr-meta">${pEsc(name)}${c.age ? ' · גיל ' + pEsc(c.age) : ''} · התקופה: ${pEsc(dayLabel(from))} עד ${pEsc(dayLabel(to))}${st.admitted ? ' · הגיע/ה למרכז ' + pEsc(dayLabel(st.admitted)) : ''}</p>
    <p class="cr-meta">טיוטה שנוצרה מהנתונים שבמערכת. יש לעבור עליה, להשלים ולתקן לפני שליחה.</p>
    <h2>1. רקע וסיבת ההפניה</h2><p>[להשלמה]</p>
    <h2>2. תמונת מצב ותפקוד</h2><p>${pEsc(p.summary || '[להשלמה]')}</p><p>[תפקוד רגשי, חברתי, לימודי ובשגרת היום]</p>
    <h2>3. חוזקות</h2><p>${[...new Set([...(p.goals || []).flatMap(g => g.strengths || []), ...D.strengths.filter(s => s.status === 'main').map(s => s.strength)])].map(pEsc).join(', ') || '[להשלמה]'}</p>
    <h2>4. מטרות הטיפול וההתקדמות</h2>${(p.goals || []).filter(g => g.title).map(goal).join('') || '<p>[אין מטרות]</p>'}
    <h2>5. אירועים חריגים</h2><p>${D.inc.length ? `בתקופה דווחו ${D.inc.length} אירועים (${Object.entries(kinds).map(([k, n]) => `${k}: ${n}`).join(', ')})${hard ? `, מהם ${hard} בעוצמה גבוהה` : ''}. מה שקדם להם לרוב: ${careTop(careCount(D.inc, x => x.before), 3).join(', ') || 'לא ידוע'}. מה עזר: ${careTop(careCount(D.inc, x => x.helped), 3).join(', ') || 'לא ידוע'}.` : 'לא דווחו אירועים חריגים בתקופה.'}</p>
    <h2>6. קשר עם המשפחה</h2><p>${D.fam.length ? `${Object.entries(famK).map(([k, n]) => `${k}: ${n}`).join(', ')}.${Object.keys(famB).length ? ` אחרי הקשר הילד/ה חזר/ה: ${Object.entries(famB).map(([k, n]) => `${k} ${n}`).join(', ')}.` : ''}` : 'לא נרשם קשר עם המשפחה בתקופה.'}</p><p>[התרשמות]</p>
    <h2>7. סיכום והמלצות</h2><p>[להשלמה]</p>
    <p class="cr-meta">[שם המטפל/ת, תפקיד, תאריך]</p>`, `דוח הערכה - ${name}`);
}
// the handover for the next place (decision 128)
async function careHandover(id){
  const D = await careData(id), p = D.plan, name = careName(id), ex = (D.stay || {}).exit || {}, focus = (p.goals || []).filter(g => g.title);
  const helped = careTop(careCount(D.inc, x => x.helped));
  return careDocSheet(`חפיפה: ${name}`, `<h1>מסמך חפיפה: ${pEsc(name)}</h1><p class="cr-meta">${ex.next_place ? 'אל: ' + pEsc(ex.next_place) + ' · ' : ''}${pEsc(dayLabel(careToday()))}</p>
    ${ex.wish ? `<h2>מה ${pEsc(name)} רוצה שתדעו</h2><p>${pEsc(ex.wish)}</p>` : `<h2>מה ${pEsc(name)} רוצה שתדעו</h2><p>[להשלמה, במילים של הילד/ה]</p>`}
    <h2>חוזקות</h2><p>${[...new Set([...(p.goals || []).flatMap(g => g.strengths || []), ...D.strengths.filter(s => s.status === 'main').map(s => s.strength)])].map(pEsc).join(' · ') || '[להשלמה]'}</p>
    <h2>מה עובד</h2>${p.calm ? `<p>${pEsc(p.calm)}</p>` : ''}${helped.length ? `<p>לפי מה שראינו ברגעים קשים: ${helped.map(pEsc).join(', ')}.</p>` : ''}
    ${focus.map(g => `<h3>${pEsc(g.title)}</h3>${g.interventions ? `<p>${pEsc(g.interventions)}</p>` : ''}${g.sentences ? `<p><b>משפטים שעוזרים:</b> ${pEsc(g.sentences)}</p>` : ''}`).join('')}
    <h2>ממה להימנע</h2><p>${pEsc(p.avoid || '[להשלמה]')}</p>${p.signs ? `<h2>אותות מוקדמים</h2><p>${pEsc(p.signs)}</p>` : ''}${p.routine ? `<h2>שגרה</h2><p>${pEsc(p.routine)}</p>` : ''}
    <h2>מי אנחנו</h2><p>[שם המטפל/ת ודרך ליצור קשר להמשך החפיפה]</p>`, `חפיפה - ${name}`);
}
// the child's book, a first version (decisions 33, 128; the final design in the design meeting)
async function careBook(id){
  const D = await careData(id), name = careName(id), c = roster.find(x => x.id === id) || { id }, ex = (D.stay || {}).exit || {};
  const planets = [...new Set(D.steps.map(s => s.planet_id))].map(pid => ((thp.planets || []).find(p => p.id === pid) || {}).name || pid);
  let bricks = 0; try { const s = await getChildState(id); bricks = (s && s.bricks) || 0; } catch(e){}
  const lt = await sbPersonal.from('staff_letters').select('text,author').eq('child_id', id).eq('approved', true), names = {}; (portalLoad().instructors || []).forEach(p => { names[p.id] = p.first; });
  const moments = String(ex.moments || '').split('\n').map(s => s.trim()).filter(Boolean);
  return careDocSheet(`הספר של ${name}`, `<div class="cr-pg cr-cover"><div class="cr-cover-av">${thpAvatar(c)}</div><h1>המסע של ${pEsc(name)}</h1><p>${pEsc(dayLabel(careToday()))}</p></div>
    <div class="cr-pg"><h2>🚀 הכוכבים שביקרת בהם</h2>${planets.length ? `<ul>${planets.map(p => `<li>${pEsc(p)}</li>`).join('')}</ul>` : '<p>[המסע בחלל]</p>'}</div>
    <div class="cr-pg"><h2>🏛️ המקדש שלך</h2><p>בנית ${bricks} לבנים.</p>${D.strengths.filter(s => s.status === 'main').length ? `<p>הכוחות שלך: ${D.strengths.filter(s => s.status === 'main').map(s => pEsc(s.strength)).join(' · ')}</p>` : ''}</div>
    <div class="cr-pg"><h2>🌟 רגעים טובים</h2>${moments.length ? `<ul>${moments.map(m => `<li>${pEsc(m)}</li>`).join('')}</ul>` : '<p>[רגעים טובים]</p>'}</div>
    <div class="cr-pg"><h2>✉️ מהצוות</h2>${(lt.data || []).map(l => `<p>"${pEsc(l.text)}"<br><small>${pEsc(names[l.author] || '')}</small></p>`).join('') || '<p>[משפטים מהצוות]</p>'}${ex.letter ? `<h3>מכתב</h3><p>${pEsc(ex.letter)}</p>` : ''}</div>`, `הספר של ${name}`);
}
async function careDocsSection(id, box){
  const today = careToday(), st = thp.stays[id] || {}, from = st.admitted || isoDate(new Date(Date.now() - 60 * 864e5));
  box.innerHTML = `<div class="cr-docs">
    <button type="button" class="btn ghost" data-doc="page">🗺️ ${pEsc(careName(id))} בעמוד אחד</button><button type="button" class="btn ghost" data-doc="staff">🖨️ דף לצוות</button>
    <div class="cr-report"><b>📄 טיוטת דוח הערכה</b><div class="th-ed-grid"><label class="pfield">מתאריך<input type="date" id="rp-from" value="${pEsc(from)}"></label><label class="pfield">עד<input type="date" id="rp-to" value="${today}"></label></div><button type="button" class="btn" data-doc="report">יצירת טיוטה</button></div>
    <button type="button" class="btn ghost" data-doc="handover">🤝 מסמך חפיפה למסגרת הבאה</button><button type="button" class="btn ghost" data-doc="book">📖 הספר (גרסה ראשונה)</button></div>
    <h3 class="psec">משפטים מהצוות לספר</h3><div id="cr-letters"></div>`;
  box.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const k = b.dataset.doc;
      if(k === 'page') await careOnePage(id, false); else if(k === 'staff') await careOnePage(id, true);
      else if(k === 'report'){ const f = box.querySelector('#rp-from').value, t = box.querySelector('#rp-to').value; if(!f || !t || f > t){ toast('בוחרים תקופה'); return; } await careReport(id, f, t); }
      else if(k === 'handover') await careHandover(id); else await careBook(id);
    } catch(e){ toast('לא הצלחנו ליצור את המסמך'); } finally { b.disabled = false; }
  }));
  const lb = box.querySelector('#cr-letters'), r = await sbPersonal.from('staff_letters').select('*').eq('child_id', id).order('at');
  if(r.error){ lb.innerHTML = '<div class="pnote">(scheduling-v43.sql)</div>'; return; }
  const names = {}; (portalLoad().instructors || []).forEach(p => { names[p.id] = p.first; });
  lb.innerHTML = (r.data || []).map(l => `<div class="obs-item"><div class="obs-head"><b>${pEsc(names[l.author] || 'צוות')}</b>${l.approved ? '<span class="th-chip">✓ בספר</span>' : ''}</div><div class="obs-body">${pEsc(l.text)}</div>${l.approved ? '' : `<button type="button" class="btn small" data-lt-ok="${l.id}">אישור לספר</button>`}</div>`).join('') || '<div class="pnote">עוד אין משפטים. כשקובעים תאריך יציאה, הצוות מוזמן לכתוב.</div>';
  lb.querySelectorAll('[data-lt-ok]').forEach(b => b.addEventListener('click', async () => { const u = await sbPersonal.from('staff_letters').update({ approved:true }).eq('id', b.dataset.ltOk); if(u.error){ toast('לא נשמר'); return; } if(thp.lettersWait) delete thp.lettersWait[id]; careDocsSection(id, box); }));
}
