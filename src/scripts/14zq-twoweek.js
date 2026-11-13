
// ---------- A TWO-WEEK SCHEDULE (the second pilot, Guy 2026-11-13; supabase/scheduling-v75.sql) ----------
// A module of its own next to the monthly schedule: every two weeks each person hands in OPTIONS (twice as many as the shifts they
// work), one of the staff builds the schedule (a different one each time), fixes it by hand and publishes it.
// The rules come from the institution's form: three shifts a day, two people a shift (three on Tuesday morning, and up to two more
// "third" places a week), no back-to-back shifts, a long weekend shift that counts as two, one night a week each (two people get two).
const TW = { people:[], periods:[], period:null, options:[], subs:[], asg:[], fixed:[], me:null, boss:false, tab:null, as:null, draft:null, allowed:null, probing:false, busy:false };
const TW_SHIFT = { M:'בוקר', A:'צהריים', N:'לילה', W:'סוף שבוע' };
const TW_ROWS = ['M', 'A', 'N'];
const TW_THIRDS_A_WEEK = 2;          // (besides Tuesday morning)

// the places of one day: need = must be filled, extra = a third place that is filled only when there are free hands, w = how many shifts it counts
function twSlots(iso){
  const d = dowOf(iso);
  if(d === 5) return [{ shift:'M', need:1, extra:0, w:1, hours:'7:30–14:30' }, { shift:'W', need:2, extra:0, w:2, hours:'שישי 14:00 עד שבת 20:30' }];
  if(d === 6) return [{ shift:'N', need:2, extra:0, w:1, hours:'20:30–8:00' }];
  return [{ shift:'M', need:d === 2 ? 3 : 2, extra:d === 2 ? 0 : 1, w:1, hours:'7:30–15:30' }, { shift:'A', need:2, extra:1, w:1, hours:'15:00–23:00' }, { shift:'N', need:2, extra:0, w:1, hours:'22:30–8:00' }];
}
const twDays = start => Array.from({ length:14 }, (x, i) => addDays(start, i));
const twWeekOf = (start, iso) => (Math.round((parseIso(iso) - parseIso(start)) / 86400000) < 7 ? 0 : 1);
const twShort = iso => { const t = parseIso(iso); return t.getDate() + '/' + (t.getMonth() + 1); };
const twKey = (day, shift) => day + '|' + shift;
const twPerson = id => TW.people.find(p => p.id === id);
const twName = id => (twPerson(id) || {}).name || '?';
const twPeriodRow = () => TW.periods.find(p => p.start === TW.period) || null;
const twIsBuilder = () => TW.boss || (!!TW.me && !!twPeriodRow() && twPeriodRow().builder === TW.me.id);
// the fixed shifts: one fixed person for a shift of the week (the pilot's trial: one fixed and one that changes)
const twFixedOf = (dow, shift) => { const f = TW.fixed.find(x => x.dow === dow && x.shift === shift); return f ? f.person : null; };
const twIsFixed = (personId, day, shift) => twFixedOf(dowOf(day), shift) === personId;
const twCanFix = () => TW.boss || (!!TW.me && TW.periods.some(p => p.builder === TW.me.id && p.status !== 'published'));
const twOpenNow = () => { const p = twPeriodRow(); return !!p && p.status === 'open' && (!p.deadline || new Date(p.deadline) > new Date()); };
const twPeriodLabel = start => `${twShort(start)} – ${twShort(addDays(start, 13))}`;
// two shifts that one person cannot do: the same day, a night and the next morning, the long weekend shift and anything on Saturday
function twClash(d1, s1, d2, s2){
  if(d1 === d2) return true;
  const [a, sa, b, sb2] = d1 < d2 ? [d1, s1, d2, s2] : [d2, s2, d1, s1];
  if(addDays(a, 1) !== b) return false;
  return (sa === 'N' && sb2 === 'M') || sa === 'W';
}

// ---- may this person see the module at all? (asked once after the sign-in; the home card appears when the answer is yes)
function twCardHtml(){
  if(typeof liveCut === 'function' && liveCut()) return '';          // (the test site only, until the pilot's own site is up)
  if(typeof portalServerOn === 'undefined' || !portalServerOn || !sbPersonal) return '';
  if(TW.allowed === null && !TW.probing){
    TW.probing = true;
    twLoadBase().then(() => { TW.probing = false; if(TW.allowed && document.getElementById('view-apphome').classList.contains('active') && !document.getElementById('apphome-tw')) showAppHome(); }, () => { TW.probing = false; TW.allowed = false; });
  }
  if(!TW.allowed) return '';
  return `<button type="button" class="home-card" id="apphome-tw"><span class="apphome-emoji apphome-ico">${psIco('schedule')}</span>
    <span class="home-card-title">סידור דו-שבועי</span><span class="home-card-sub">הגשת אופציות, בניית הסידור והסידור שפורסם</span></button>`;
}

async function twLoadBase(){
  const [pe, pr, fx] = await Promise.all([sbPersonal.from('tw_people').select('*').order('sort').order('name'), sbPersonal.from('tw_period').select('*').order('start', { ascending:false }).limit(8), sbPersonal.from('tw_fixed').select('*')]);
  if(pe.error || pr.error){ TW.allowed = false; return false; }          // (before scheduling-v75.sql, or no right: no module)
  TW.people = pe.data || []; TW.periods = pr.data || []; TW.fixed = fx.error ? [] : (fx.data || []);
  TW.me = TW.people.find(p => p.active && p.staff_id && p.staff_id === srv.me) || null;
  TW.boss = !!((srv.profile && srv.profile.admin) || (srv.meRow && (srv.meRow.role === 'coordinator' || srv.meRow.admin)));
  TW.allowed = TW.boss || !!TW.me;
  if(!TW.period || !TW.periods.some(p => p.start === TW.period)){
    const open = TW.periods.filter(p => p.status === 'open').sort((a, b) => a.start < b.start ? -1 : 1)[0];
    TW.period = (open || TW.periods[0] || {}).start || null;
  }
  return TW.allowed;
}
async function twLoadPeriod(){
  TW.options = []; TW.subs = []; TW.asg = [];
  if(!TW.period) return;
  const [o, s, a] = await Promise.all([sbPersonal.from('tw_option').select('person,day,shift').eq('period', TW.period), sbPersonal.from('tw_submission').select('*').eq('period', TW.period), sbPersonal.from('tw_assignment').select('*').eq('period', TW.period)]);
  TW.options = o.error ? [] : (o.data || []); TW.subs = s.error ? [] : (s.data || []); TW.asg = a.error ? [] : (a.data || []);
}

// ---- the screen
async function showTwoWeek(){
  document.body.classList.remove('leopard-bg');
  portalActivateView('view-tw');
  let look = 'dark';
  try { look = (srv.portalTheme && srv.portalTheme !== 'leopard' ? srv.portalTheme : portalLoad().settings.theme) || 'dark'; if(look === 'leopard') look = 'dark'; } catch(e){}
  document.getElementById('view-tw').innerHTML = `<div class="portal-shell" data-ptheme="${pEsc(look)}">
    <div class="portal-top"><button type="button" class="back-btn portal-back" id="tw-home-back">→ מסך ראשי</button><h1 class="portal-title">סידור דו-שבועי</h1><span class="portal-top-actions"></span></div>
    <div id="tw-screen"><div class="pnote">טוען...</div></div></div>`;
  document.getElementById('tw-home-back').addEventListener('click', () => showAppHome());
  try { await twLoadBase(); await twLoadPeriod(); } catch(e){ console.error(e); }
  if(!TW.allowed){ document.getElementById('tw-screen').innerHTML = '<div class="pnote">הסידור הדו-שבועי לא פתוח למשתמש הזה.</div>'; return; }
  if(!TW.tab) TW.tab = TW.me ? 'mine' : 'build';
  TW.as = null; TW.draft = null;
  twRender();
}
function twTabs(){
  const t = [];
  if(TW.me || twIsBuilder()) t.push(['mine', 'הגשת אופציות']);
  t.push(['sched', 'הסידור']);
  if(twIsBuilder()) t.push(['build', 'בנייה']);
  if(TW.boss) t.push(['team', 'צוות ותקופות']);
  if(!t.some(x => x[0] === TW.tab)) TW.tab = t[0][0];
  return `<div class="tw-tabs" role="tablist">${t.map(([k, l]) => `<button type="button" role="tab" class="tw-tab${TW.tab === k ? ' on' : ''}" data-tw-tab="${k}" aria-selected="${TW.tab === k}">${l}</button>`).join('')}</div>`;
}
function twPeriodPicker(){
  if(!TW.periods.length) return '';
  const st = { open:'פתוח להגשה', built:'בבנייה', published:'פורסם' };
  return `<label class="tw-period"><span>השבועיים:</span><select id="tw-period-sel">${TW.periods.map(p => `<option value="${p.start}"${p.start === TW.period ? ' selected' : ''}>${twPeriodLabel(p.start)} · ${st[p.status] || ''}</option>`).join('')}</select></label>`;
}
function twRender(){
  const box = document.getElementById('tw-screen'); if(!box) return;
  const tabs = twTabs();
  let inner = '';
  if(!TW.period && TW.tab !== 'team') inner = `<div class="pnote">עדיין לא נפתחו שבועיים להגשה.${TW.boss ? ' אפשר לפתוח בלשונית "צוות ותקופות".' : ''}</div>`;
  else if(TW.tab === 'mine') inner = twMineHtml();
  else if(TW.tab === 'sched') inner = twSchedHtml();
  else if(TW.tab === 'build') inner = twBuildHtml();
  else if(TW.tab === 'team') inner = twTeamHtml();
  box.innerHTML = tabs + (TW.tab === 'team' ? '' : twPeriodPicker()) + inner;
  box.querySelectorAll('[data-tw-tab]').forEach(b => b.addEventListener('click', () => { TW.tab = b.dataset.twTab; TW.draft = null; twRender(); }));
  const sel = box.querySelector('#tw-period-sel'); if(sel) sel.addEventListener('change', async () => { TW.period = sel.value; TW.draft = null; await twLoadPeriod(); twRender(); });
  if(TW.tab === 'mine') twMineWire(box); else if(TW.tab === 'sched') twSchedWire(box); else if(TW.tab === 'build') twBuildWire(box); else if(TW.tab === 'team') twTeamWire(box);
}

// ---- 1. handing in options
function twWhose(){ return twPerson(TW.as) || TW.me || (twIsBuilder() ? TW.people.filter(p => p.active)[0] : null) || null; }
function twDraftOf(person){
  if(!TW.draft || TW.draft.person !== person.id) TW.draft = { person:person.id, set:new Set(TW.options.filter(o => o.person === person.id).map(o => twKey(o.day, o.shift))), dirty:false };
  return TW.draft;
}
// the numbers under the grid: per week how many were marked against twice the weekly shifts, the kinds, and options that cancel each other
function twCount(person, set){
  const days = twDays(TW.period), weeks = [0, 0], fixedW = [0, 0], kinds = { M:0, A:0, N:0, W:0 }, list = [];
  days.forEach(day => twSlots(day).forEach(sl => { if(twIsFixed(person.id, day, sl.shift)) fixedW[twWeekOf(TW.period, day)] += sl.w; }));
  const needs = fixedW.map(f => Math.max(0, person.per_week - f) * 2), need = Math.max(needs[0], needs[1]);
  set.forEach(k => { const [day, shift] = k.split('|'); if(days.indexOf(day) < 0 || twIsFixed(person.id, day, shift)) return; weeks[twWeekOf(TW.period, day)]++; kinds[shift]++; list.push([day, shift]); });
  let clash = 0;
  for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++) if(twClash(list[i][0], list[i][1], list[j][0], list[j][1])) clash++;
  const three = [kinds.M, kinds.A, kinds.N], uneven = Math.max(...three) - Math.min(...three) > 2;
  return { need, needs, fixedW, weeks, kinds, clash, uneven, ok:weeks[0] >= needs[0] && weeks[1] >= needs[1] };
}
function twMineHtml(){
  const person = twWhose();
  if(!person) return '<div class="pnote">אין שורה ברשימת הצוות של הסידור הדו-שבועי.</div>';
  const d = twDraftOf(person), c = twCount(person, d.set), can = twIsBuilder() || (TW.me && person.id === TW.me.id && twOpenNow());
  const sub = TW.subs.find(s => s.person === person.id), days = twDays(TW.period);
  const pick = twIsBuilder() ? `<label class="tw-period"><span>הגשה עבור:</span><select id="tw-as">${TW.people.filter(p => p.active).map(p => `<option value="${p.id}"${p.id === person.id ? ' selected' : ''}>${pEsc(p.name)}${TW.subs.some(s => s.person === p.id) ? ' ✓' : ''}</option>`).join('')}</select></label>` : '';
  const week = w => `<div class="tw-week"><h3>שבוע ${w + 1} <span class="tw-wk-range">${twShort(days[w * 7])}–${twShort(days[w * 7 + 6])}</span>
      <span class="tw-need ${c.weeks[w] >= c.needs[w] ? 'ok' : 'bad'}">${c.weeks[w]} מתוך ${c.needs[w]} אופציות</span></h3>
    <div class="tw-grid">${days.slice(w * 7, w * 7 + 7).map(day => `<div class="tw-day"><div class="tw-day-name">${DOW_NAMES[dowOf(day)]} <span>${twShort(day)}</span></div>
      <div class="tw-day-slots">${twSlots(day).map(s => twIsFixed(person.id, day, s.shift) ? `<div class="tw-opt fixed"><b>${TW_SHIFT[s.shift]}</b><small>משמרת קבועה</small></div>`
        : `<button type="button" class="tw-opt${d.set.has(twKey(day, s.shift)) ? ' on' : ''}" data-tw-opt="${twKey(day, s.shift)}" aria-pressed="${d.set.has(twKey(day, s.shift))}"${can ? '' : ' disabled'}>
        <b>${TW_SHIFT[s.shift]}</b><small>${s.hours}</small></button>`).join('')}</div></div>`).join('')}</div></div>`;
  const notes = [];
  if(c.clash) notes.push(`<div class="pstatus bad">${c.clash === 1 ? 'יש זוג אחד של אופציות צמודות' : `יש ${c.clash} זוגות של אופציות צמודות`}: רק אחת מכל זוג יכולה להשתבץ, ולכן הן נספרות בפועל כאופציה אחת.</div>`);
  if(c.uneven) notes.push(`<div class="pnote tw-warn">האופציות לא מאוזנות בין סוגי המשמרות (בוקר ${c.kinds.M}, צהריים ${c.kinds.A}, לילה ${c.kinds.N}). כדאי לאזן בתוך השבועיים.</div>`);
  return `${pick}
    <div class="pnote">מסמנים את המשמרות שאפשר לעבוד בהן. צריך לפחות פי שניים מהמשמרות בשבוע: ${person.per_week} משמרות בשבוע = ${person.per_week * 2} אופציות בכל שבוע.${c.fixedW[0] || c.fixedW[1] ? ' משמרת קבועה משובצת לבד, ולכן לא מסמנים אותה והיא מורידה מהמספר.' : ''}</div>
    ${sub ? `<div class="pstatus ok">הוגש ב-${new Date(sub.submitted_at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}. אפשר לשנות עד שהסידור נבנה.</div>` : (can ? '<div class="pstatus bad">עדיין לא הוגש.</div>' : '')}
    ${can ? '' : '<div class="pnote">ההגשה לשבועיים האלה סגורה.</div>'}
    ${week(0)}${week(1)}
    <div class="tw-kinds">סה״כ בשבועיים: בוקר ${c.kinds.M} · צהריים ${c.kinds.A} · לילה ${c.kinds.N} · סוף שבוע ${c.kinds.W}</div>
    ${notes.join('')}
    ${can ? `<div class="tw-actions"><button type="button" class="btn" id="tw-save">${c.ok ? 'שמירה והגשה' : 'הגשה בכל זאת (חסרות אופציות)'}</button></div>` : ''}`;
}
function twMineWire(box){
  const person = twWhose(); if(!person) return;
  const as = box.querySelector('#tw-as'); if(as) as.addEventListener('change', () => { TW.as = as.value; TW.draft = null; twRender(); });
  box.querySelectorAll('[data-tw-opt]').forEach(b => b.addEventListener('click', () => { const d = twDraftOf(person), k = b.dataset.twOpt; if(d.set.has(k)) d.set.delete(k); else d.set.add(k); d.dirty = true; const y = window.scrollY; twRender(); window.scrollTo(0, y); }));
  const save = box.querySelector('#tw-save');
  if(save) save.addEventListener('click', async () => {
    if(TW.busy) return; TW.busy = true; save.disabled = true;
    const ok = await twSaveOptions(person, twDraftOf(person).set);
    TW.busy = false;
    if(ok){ toast('האופציות נשמרו והוגשו'); TW.draft = null; await twLoadPeriod(); twRender(); } else { toast('⚠ השמירה נכשלה. בדקו חיבור ונסו שוב'); save.disabled = false; }
  });
}
async function twSaveOptions(person, set){
  try {
    const del = await sbPersonal.from('tw_option').delete().eq('period', TW.period).eq('person', person.id); if(del.error) throw del.error;
    const rows = [...set].map(k => { const [day, shift] = k.split('|'); return { period:TW.period, person:person.id, day, shift }; });
    if(rows.length){ const ins = await sbPersonal.from('tw_option').insert(rows); if(ins.error) throw ins.error; }
    const sub = await sbPersonal.from('tw_submission').upsert({ period:TW.period, person:person.id, submitted_at:new Date().toISOString(), by_staff:srv.me || null }); if(sub.error) throw sub.error;
    return true;
  } catch(e){ console.error(e); return false; }
}

// ---- 2. the schedule
function twSchedHtml(){
  const p = twPeriodRow(), builder = twIsBuilder();
  if(p.status !== 'published' && !builder) return `<div class="pnote">הסידור של השבועיים האלה עדיין לא פורסם.${p.builder ? ` בונה אותו הפעם: ${pEsc(twName(p.builder))}.` : ''}</div>`;
  if(!TW.asg.length) return `<div class="pnote">עדיין אין סידור לשבועיים האלה.${builder ? ' בונים אותו בלשונית "בנייה".' : ''}</div>`;
  const days = twDays(TW.period), by = {};
  TW.asg.forEach(a => { (by[twKey(a.day, a.shift)] = by[twKey(a.day, a.shift)] || []).push(a); });
  const cell = (day, shift) => {
    const slot = twSlots(day).find(s => s.shift === shift) || (shift === 'A' && dowOf(day) === 5 ? twSlots(day).find(s => s.shift === 'W') : null);
    if(!slot) return '<td class="tw-none"></td>';
    const list = (by[twKey(day, slot.shift)] || []).slice().sort((a, b) => twName(a.person).localeCompare(twName(b.person), 'he'));
    const missing = Math.max(0, slot.need - list.length);
    return `<td class="tw-cell${builder ? ' edit' : ''}" data-tw-cell="${twKey(day, slot.shift)}"${builder ? ' tabindex="0" role="button"' : ''}>${slot.shift === 'W' ? '<small class="tw-long">עד שבת 20:30</small>' : ''}
      ${list.map(a => `<span class="pchip${TW.me && a.person === TW.me.id ? ' me' : ''}${a.by_hand ? ' tw-hand' : ''}${a.fixed ? ' tw-fix' : ''}">${pEsc(twName(a.person))}${a.note ? ` <small>(${pEsc(a.note)})</small>` : ''}</span>`).join('')}
      ${Array.from({ length:missing }, () => '<span class="pchip missing">חסר שיבוץ</span>').join('')}</td>`;
  };
  const table = w => `<div class="tw-week"><h3>שבוע ${w + 1} <span class="tw-wk-range">${twShort(days[w * 7])}–${twShort(days[w * 7 + 6])}</span></h3>
    <div class="tw-scroll"><table class="tw-table"><thead><tr><th></th>${days.slice(w * 7, w * 7 + 7).map(day => `<th>${DOW_NAMES[dowOf(day)]}<small>${twShort(day)}</small></th>`).join('')}</tr></thead>
    <tbody>${TW_ROWS.map(sh => `<tr><th>${TW_SHIFT[sh]}</th>${days.slice(w * 7, w * 7 + 7).map(day => cell(day, sh)).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  const mine = TW.me ? TW.asg.filter(a => a.person === TW.me.id).sort((a, b) => a.day < b.day ? -1 : 1) : [];
  const head = p.status === 'published' ? '' : '<div class="pstatus bad">טיוטה: רק מי שבונה את הסידור רואה אותה. הצוות יראה אחרי הפרסום.</div>';
  return `${head}${mine.length ? `<div class="tw-mine"><b>המשמרות שלי:</b> ${mine.map(a => `<span class="pchip me">${DOW_NAMES[dowOf(a.day)]} ${twShort(a.day)} · ${TW_SHIFT[a.shift]}</span>`).join('')}</div>` : ''}
    ${builder ? '<div class="pnote">לחיצה על משבצת פותחת את רשימת הצוות, להוספה או להסרה ביד.</div>' : ''}${table(0)}${table(1)}`;
}
function twSchedWire(box){
  if(!twIsBuilder()) return;
  box.querySelectorAll('[data-tw-cell]').forEach(td => { const go = () => twCellSheet(td.dataset.twCell); td.addEventListener('click', go); td.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } }); });
}
// the builder's sheet of one place: everybody, who offered it, who cannot (a clash), tap to add or remove
function twCellSheet(key){
  const [day, shift] = key.split('|'), there = () => TW.asg.filter(a => a.day === day && a.shift === shift);
  const wrap = document.createElement('div'); wrap.className = 'sheet confirm-sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  const draw = () => {
    const rows = TW.people.filter(p => p.active).map(p => {
      const on = there().some(a => a.person === p.id), opt = TW.options.some(o => o.person === p.id && o.day === day && o.shift === shift);
      const clash = !on && TW.asg.some(a => a.person === p.id && twClash(a.day, a.shift, day, shift));
      const load = TW.asg.filter(a => a.person === p.id).reduce((n, a) => n + (a.shift === 'W' ? 2 : 1), 0);
      return { p, on, opt, clash, load };
    }).sort((a, b) => (b.on - a.on) || (b.opt - a.opt) || (a.clash - b.clash) || a.p.name.localeCompare(b.p.name, 'he'));
    wrap.innerHTML = `<div class="sheet-card tw-sheet"><h2>${DOW_NAMES[dowOf(day)]} ${twShort(day)} · ${TW_SHIFT[shift]}</h2>
      <div class="tw-pick">${rows.map(r => `<button type="button" class="tw-pick-row${r.on ? ' on' : ''}" data-tw-p="${r.p.id}"><b>${pEsc(r.p.name)}</b>
        <small>${r.on ? 'משובץ כאן · לחיצה מסירה' : (r.opt ? 'הגיש/ה את המשמרת' : 'לא הוגש') + (r.clash ? ' · צמוד למשמרת אחרת' : '')} · ${r.load} מתוך ${r.p.per_week * 2}</small></button>`).join('')}</div>
      <div class="confirm-actions"><button type="button" class="btn" id="tw-sheet-close">סגירה</button></div></div>`;
    wrap.querySelector('#tw-sheet-close').addEventListener('click', () => { wrap.remove(); twRender(); });
    wrap.querySelectorAll('[data-tw-p]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.twP, cur = there().find(a => a.person === id);
      const r = cur ? await sbPersonal.from('tw_assignment').delete().eq('id', cur.id) : await sbPersonal.from('tw_assignment').insert({ period:TW.period, day, shift, person:id, by_hand:true }).select();
      if(r.error){ console.error(r.error); toast('⚠ השינוי לא נשמר'); return; }
      if(cur) TW.asg = TW.asg.filter(a => a.id !== cur.id); else TW.asg.push(r.data[0]);
      draw();
    }));
  };
  wrap.addEventListener('click', e => { if(e.target === wrap){ wrap.remove(); twRender(); } });
  document.body.appendChild(wrap); draw();
}

// ---- 3. building
function twBuildHtml(){
  const p = twPeriodRow(), act = TW.people.filter(x => x.active);
  const rows = act.map(x => { const set = new Set(TW.options.filter(o => o.person === x.id).map(o => twKey(o.day, o.shift))), c = twCount(x, set), sub = TW.subs.some(s => s.person === x.id); return { x, c, sub, n:set.size }; });
  const done = rows.filter(r => r.sub).length, rep = (p.report && p.report.lines) || [];
  return `<div class="pnote">בונה את הסידור הפעם: <b>${p.builder ? pEsc(twName(p.builder)) : 'לא נקבע'}</b>. הגישו ${done} מתוך ${act.length}.</div>
    <div class="tw-subs">${rows.map(r => `<div class="tw-sub ${r.sub ? (r.c.ok ? 'ok' : 'low') : 'none'}"><b>${pEsc(r.x.name)}</b><span>${r.sub ? `שבוע 1: ${r.c.weeks[0]}/${r.c.needs[0]} · שבוע 2: ${r.c.weeks[1]}/${r.c.needs[1]}${r.c.clash ? ` · אופציות צמודות: ${r.c.clash}` : ''}` : 'לא הוגש'}</span></div>`).join('')}</div>
    <div class="tw-actions">
      <button type="button" class="btn" id="tw-build">${TW.asg.length ? 'בנייה מחדש' : 'בניית הסידור'}</button>
      ${TW.asg.length && p.status !== 'published' ? '<button type="button" class="btn" id="tw-publish">פרסום לצוות</button>' : ''}
      ${p.status === 'published' ? '<button type="button" class="btn ghost" id="tw-unpublish">ביטול הפרסום</button>' : ''}
      ${typeof liveCut === 'function' && !liveCut() ? '<button type="button" class="btn ghost" id="tw-demo">נתוני הדגמה: מילוי אופציות למי שאין לו כניסה ולא הגיש</button>' : ''}
    </div>
    ${twFixedBoxHtml()}
    ${TW.asg.length ? `<div class="pnote">בסידור ${TW.asg.length} שיבוצים${TW.asg.some(a => a.by_hand) ? `, מהם ${TW.asg.filter(a => a.by_hand).length} ביד (נשמרים גם בבנייה מחדש)` : ''}. רואים ומתקנים בלשונית "הסידור".</div>` : ''}
    ${rep.length ? `<div class="tw-report"><h3>מה הבנייה מדווחת</h3><ul>${rep.map(l => `<li>${pEsc(l)}</li>`).join('')}</ul></div>` : ''}`;
}
// who is the fixed person of each shift of the week (one per shift; the second place of the shift changes)
function twFixedBoxHtml(){
  if(!twCanFix()) return '';
  const act = TW.people.filter(p => p.active), week = twDays(TW.period).slice(0, 7);
  const pick = (dow, shift) => `<select data-tw-fix="${dow}|${shift}" aria-label="${DOW_NAMES[dow]} ${TW_SHIFT[shift]}"><option value="">אין</option>${act.map(p => `<option value="${p.id}"${twFixedOf(dow, shift) === p.id ? ' selected' : ''}>${pEsc(p.name)}</option>`).join('')}</select>`;
  return `<details class="tw-fixed-box"${TW.fixedOpen ? ' open' : ''}><summary>משמרות קבועות${TW.fixed.length ? ` (${TW.fixed.length})` : ''}</summary>
    <div class="pnote">בכל משמרת אפשר לקבוע אדם אחד קבוע. הבנייה משבצת אותו שם קודם, בכל שבוע, והמקום השני במשמרת מתחלף. משמרת קבועה נספרת בתוך המשמרות השבועיות.</div>
    <div class="tw-fixed-grid">${week.map(day => `<div class="tw-fixed-day"><b>${DOW_NAMES[dowOf(day)]}</b>${twSlots(day).map(sl => `<label>${TW_SHIFT[sl.shift]} ${pick(dowOf(day), sl.shift)}</label>`).join('')}</div>`).join('')}</div>
    <div class="pnote">שינוי כאן משפיע מהבנייה הבאה. כדי לעדכן סידור קיים לוחצים "בנייה מחדש".</div></details>`;
}
function twBuildWire(box){
  const fb = box.querySelector('.tw-fixed-box'); if(fb) fb.addEventListener('toggle', () => { TW.fixedOpen = fb.open; });
  box.querySelectorAll('[data-tw-fix]').forEach(sel => sel.addEventListener('change', async () => {
    const [dow, shift] = sel.dataset.twFix.split('|'), person = sel.value;
    const r = person ? await sbPersonal.from('tw_fixed').upsert({ dow:Number(dow), shift, person }) : await sbPersonal.from('tw_fixed').delete().eq('dow', Number(dow)).eq('shift', shift);
    if(r.error){ console.error(r.error); toast('⚠ השינוי לא נשמר'); } else toast('נשמר');
    await twLoadBase(); twRender();
  }));
  const on = (id, fn) => { const b = box.querySelector(id); if(b) b.addEventListener('click', async () => { if(TW.busy) return; TW.busy = true; b.disabled = true; try { await fn(); } catch(e){ console.error(e); toast('⚠ הפעולה נכשלה'); } TW.busy = false; await twLoadBase(); await twLoadPeriod(); twRender(); }); };
  on('#tw-build', async () => {
    const res = twSolve({ start:TW.period, people:TW.people.filter(p => p.active), options:TW.options, fixed:TW.fixed, hand:TW.asg.filter(a => a.by_hand) });
    const del = await sbPersonal.from('tw_assignment').delete().eq('period', TW.period).eq('by_hand', false); if(del.error) throw del.error;
    if(res.rows.length){ const ins = await sbPersonal.from('tw_assignment').insert(res.rows.map(r => Object.assign({ period:TW.period }, r))); if(ins.error) throw ins.error; }
    const up = await sbPersonal.from('tw_period').update({ status:'built', built_at:new Date().toISOString(), report:{ lines:res.lines } }).eq('start', TW.period); if(up.error) throw up.error;
    toast(res.missing ? `הסידור נבנה. חסרים ${res.missing} שיבוצים` : 'הסידור נבנה, כל המשמרות מלאות');
  });
  on('#tw-publish', async () => { const up = await sbPersonal.from('tw_period').update({ status:'published', published_at:new Date().toISOString() }).eq('start', TW.period); if(up.error) throw up.error; toast('הסידור פורסם לצוות'); });
  on('#tw-unpublish', async () => { const up = await sbPersonal.from('tw_period').update({ status:'built', published_at:null }).eq('start', TW.period); if(up.error) throw up.error; toast('הפרסום בוטל'); });
  // (the demo fill is not for somebody with a sign-in: they hand in themselves)
  on('#tw-demo', async () => {
    for(const p of TW.people.filter(x => x.active && !x.staff_id && !TW.subs.some(s => s.person === x.id))){ if(!(await twSaveOptions(p, twDemoOptions(p)))) throw new Error('demo options'); }
    toast('מולאו אופציות לדוגמה');
  });
}
// invented options for the demo: about twice the weekly shifts in each week, a mix of kinds, no two on one day
function twDemoOptions(person){
  const set = new Set(), days = twDays(TW.period);
  for(let w = 0; w < 2; w++){
    const pool = [];
    days.slice(w * 7, w * 7 + 7).forEach(day => twSlots(day).forEach(s => pool.push([day, s.shift])));
    pool.sort(() => Math.random() - 0.5);
    const kinds = { M:0, A:0, N:0, W:0 }, used = {}; let n = 0;
    for(const [day, shift] of pool){
      if(n >= person.per_week * 2 + (Math.random() < 0.3 ? 1 : 0)) break;
      if(used[day] || kinds[shift] >= (shift === 'W' ? 1 : 3)) continue;
      used[day] = true; kinds[shift]++; n++; set.add(twKey(day, shift));
    }
  }
  return set;
}

// ---- the build itself: many quick tries, the best one wins. Never puts a person where they did not offer; what cannot be filled is reported.
function twSolve({ start, people, options, fixed, hand }){
  const days = twDays(start), offer = {}, di = {};          // (di: the number of a day inside the two weeks, 0–13 — whole numbers, so that the many tries stay quick)
  days.forEach((d, i) => { di[d] = i; });
  options.forEach(o => { if(o.day in di) (offer[o.person] = offer[o.person] || new Set()).add(di[o.day] + o.shift); });
  const clash = (a, b) => a.i === b.i || (b.i === a.i + 1 && ((a.shift === 'N' && b.shift === 'M') || a.shift === 'W')) || (a.i === b.i + 1 && ((b.shift === 'N' && a.shift === 'M') || b.shift === 'W'));
  const nightOffer = {};          // per person and week: was a night offered at all
  options.forEach(o => { if(o.shift === 'N' && o.day in di) (nightOffer[o.person] = nightOffer[o.person] || [false, false])[di[o.day] < 7 ? 0 : 1] = true; });
  const fixedOf = {}; (fixed || []).forEach(f => { fixedOf[f.dow + '|' + f.shift] = f.person; });
  // what is there before the automatic part: the builder's own placements, and then the fixed people of each shift (unless it clashes)
  const pre = hand.map(a => ({ person:a.person, day:a.day, shift:a.shift, fixedRow:false }));
  days.forEach(day => twSlots(day).forEach(s => {
    const pid = fixedOf[dowOf(day) + '|' + s.shift];
    if(!pid || !people.some(p => p.id === pid)) return;
    if(pre.some(a => a.person === pid && twClash(a.day, a.shift, day, s.shift))) return;
    pre.push({ person:pid, day, shift:s.shift, fixedRow:true });
  }));
  const places = [];          // one entry per place to fill
  days.forEach(day => twSlots(day).forEach(s => {
    const taken = pre.filter(a => a.day === day && a.shift === s.shift).length;
    for(let i = taken; i < s.need; i++) places.push({ day, i:di[day], k:di[day] + s.shift, shift:s.shift, w:s.w, must:true, week:di[day] < 7 ? 0 : 1 });
    for(let i = Math.max(taken, s.need); i < s.need + s.extra; i++) places.push({ day, i:di[day], k:di[day] + s.shift, shift:s.shift, w:s.w, must:false, week:di[day] < 7 ? 0 : 1 });
  }));
  const quota = p => p.per_week * 2;
  let best = null;
  for(let round = 0; round < 150; round++){
    const got = {}, load = {}, wload = {}, nights = {};
    people.forEach(p => { got[p.id] = []; load[p.id] = 0; wload[p.id] = [0, 0]; nights[p.id] = [0, 0]; });
    const put = (pid, pl) => { got[pid].push(pl); load[pid] += pl.w; wload[pid][pl.week] += pl.w; if(pl.shift === 'N') nights[pid][pl.week]++; };
    pre.forEach(a => { if(got[a.person] && a.day in di) put(a.person, { day:a.day, i:di[a.day], shift:a.shift, w:a.shift === 'W' ? 2 : 1, week:di[a.day] < 7 ? 0 : 1 }); });
    const twoNights = [new Set(), new Set()];          // who already has two nights in each week (two people at most)
    const can = (p, pl) => {
      if(!(offer[p.id] && offer[p.id].has(pl.k))) return false;
      if(load[p.id] + pl.w > quota(p)) return false;
      if(wload[p.id][pl.week] + pl.w > p.per_week + 1) return false;
      if(got[p.id].some(g => clash(g, pl))) return false;
      if(pl.shift === 'N'){ const n = nights[p.id][pl.week]; if(n >= 2) return false; if(n === 1 && twoNights[pl.week].size >= 2 && !twoNights[pl.week].has(p.id)) return false; }
      return true;
    };
    const score = (p, pl) => {
      let s = Math.random() * 3;
      s += (1 - load[p.id] / Math.max(1, quota(p))) * 10;                      // the one who is furthest from their shifts first
      if(fixedOf[dowOf(pl.day) + '|' + pl.shift] === p.id) s += 50;             // the person's fixed shift
      if(pl.shift === 'N') s += nights[p.id][pl.week] === 0 ? 6 : -8;           // a first night of the week before a second one
      s -= Math.abs(wload[p.id][pl.week] + pl.w - p.per_week) * 1.5;            // close to the weekly number
      return s;
    };
    const open = places.filter(pl => pl.must).map(pl => Object.assign({}, pl)), filled = [], missing = [];
    while(open.length){
      let bi = 0, bc = null;
      for(let i = 0; i < open.length; i++){ const c = people.filter(p => can(p, open[i])); if(bc === null || c.length < bc.length){ bi = i; bc = c; if(!c.length) break; } }
      const pl = open.splice(bi, 1)[0];
      if(!bc.length){ missing.push(pl); continue; }
      const who = bc.map(p => [score(p, pl), p]).sort((a, b) => b[0] - a[0])[0][1];
      put(who.id, pl); filled.push({ pl, pid:who.id });
      if(pl.shift === 'N' && nights[who.id][pl.week] === 2) twoNights[pl.week].add(who.id);
    }
    // the third places: only for people who still have shifts to give, two a week at most
    const thirds = [0, 0];
    places.filter(pl => !pl.must).sort(() => Math.random() - 0.5).forEach(pl => {
      if(thirds[pl.week] >= TW_THIRDS_A_WEEK) return;
      const c = people.filter(p => can(p, pl)); if(!c.length) return;
      const who = c.map(p => [score(p, pl), p]).sort((a, b) => b[0] - a[0])[0][1];
      put(who.id, pl); filled.push({ pl, pid:who.id, third:true }); thirds[pl.week]++;
    });
    let cost = missing.reduce((n, pl) => n + (pl.shift === 'N' ? 1200 : 1000), 0);
    people.forEach(p => { cost += (quota(p) - load[p.id]) * 40; [0, 1].forEach(w => { cost += Math.abs(wload[p.id][w] - p.per_week) * 6; if(nights[p.id][w] === 0 && nightOffer[p.id] && nightOffer[p.id][w]) cost += 8; if(nights[p.id][w] === 2) cost += 4; }); });
    if(!best || cost < best.cost) best = { cost, filled, missing, load, nights };
    if(best.cost === 0) break;
  }
  const lines = [];
  const needAll = places.filter(pl => pl.must).reduce((n, pl) => n + pl.w, 0) + pre.reduce((n, a) => n + (a.shift === 'W' ? 2 : 1), 0), haveAll = people.reduce((n, p) => n + quota(p), 0);
  if(haveAll < needAll) lines.push(`לפי מספר המשמרות של כל הצוות יש ${haveAll} משמרות בשבועיים, והסידור דורש ${needAll}. חסרות ${needAll - haveAll} גם כשכולם פנויים.`);
  const miss = {};
  best.missing.forEach(pl => { miss[pl.k] = miss[pl.k] || { pl, n:0 }; miss[pl.k].n++; });
  Object.values(miss).sort((a, b) => a.pl.i - b.pl.i).forEach(m => lines.push(`${m.n === 1 ? 'חסר שיבוץ אחד' : `חסרים ${m.n} שיבוצים`}: ${DOW_NAMES[dowOf(m.pl.day)]} ${twShort(m.pl.day)}, ${TW_SHIFT[m.pl.shift]}`));
  people.forEach(p => { const l = best.load[p.id], q = quota(p); if(l < q) lines.push(`${p.name}: ${l} מתוך ${q} משמרות בשבועיים`); });
  people.forEach(p => { if(!offer[p.id] || !offer[p.id].size) lines.push(`${p.name}: לא הוגשו אופציות, ולכן אין שיבוצים`); });
  [0, 1].forEach(w => { const two = people.filter(p => best.nights[p.id][w] === 2).map(p => p.name), none = people.filter(p => best.nights[p.id][w] === 0 && offer[p.id] && offer[p.id].size).map(p => p.name);
    if(two.length) lines.push(`שבוע ${w + 1}, שני לילות: ${two.join(', ')}`); if(none.length) lines.push(`שבוע ${w + 1}, בלי לילה: ${none.join(', ')}`); });
  if(!lines.length) lines.push('כל המשמרות מלאות, וכל אחד ואחת קיבלו את מספר המשמרות שלהם.');
  const rows = pre.filter(a => a.fixedRow).map(a => ({ day:a.day, shift:a.shift, person:a.person, third:false, fixed:true, by_hand:false }))
    .concat(best.filled.map(f => ({ day:f.pl.day, shift:f.pl.shift, person:f.pid, third:!!f.third, fixed:false, by_hand:false })));
  return { rows, lines, missing:best.missing.length };
}

// ---- 4. the people and the periods (the admin and the coordinator)
function twTeamHtml(){
  const latest = TW.periods.map(p => p.start).sort().pop(), today = isoDate(new Date());
  let next = latest ? addDays(latest, 14) : addDays(today, (7 - dowOf(today)) % 7 || 7);
  while(next <= today) next = addDays(next, 14);
  const p = twPeriodRow();
  return `<h3 class="tw-h">השבועיים</h3>
    ${TW.periods.length ? `<div class="tw-list">${TW.periods.map(x => `<div class="tw-row"><b>${twPeriodLabel(x.start)}</b><span>${({ open:'פתוח להגשה', built:'בבנייה', published:'פורסם' })[x.status]} · בונה: ${x.builder ? pEsc(twName(x.builder)) : 'לא נקבע'}</span></div>`).join('')}</div>` : '<div class="pnote">עדיין לא נפתחו שבועיים.</div>'}
    <div class="tw-form"><label>שבועיים חדשים מיום ראשון <b>${twShort(next)}</b>, בונה את הסידור:
      <select id="tw-new-builder"><option value="">(לבחור)</option>${TW.people.filter(x => x.active).map(x => `<option value="${x.id}">${pEsc(x.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn" id="tw-new-period" data-start="${next}">פתיחה להגשה</button></div>
    ${p ? `<div class="tw-form"><label>מי בונה את ${twPeriodLabel(p.start)}:
      <select id="tw-set-builder"><option value="">(לא נקבע)</option>${TW.people.filter(x => x.active).map(x => `<option value="${x.id}"${p.builder === x.id ? ' selected' : ''}>${pEsc(x.name)}</option>`).join('')}</select></label></div>` : ''}
    <h3 class="tw-h">הצוות</h3>
    <div class="tw-list">${TW.people.map(x => `<div class="tw-row${x.active ? '' : ' off'}"><b>${pEsc(x.name)}</b>
      <span><label>משמרות בשבוע <select data-tw-pw="${x.id}">${[1, 2, 3, 4, 5].map(n => `<option${n === x.per_week ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      ${x.staff_id ? ' · יש כניסה אישית' : ' · בלי כניסה (מגישים עבורו/ה)'}
      <button type="button" class="btn ghost small" data-tw-act="${x.id}">${x.active ? 'הסרה' : 'החזרה'}</button></span></div>`).join('')}</div>
    <div class="tw-form"><label>שם חדש לצוות <input type="text" id="tw-new-name" maxlength="30" autocomplete="off"></label><button type="button" class="btn" id="tw-add-person">הוספה</button></div>`;
}
function twTeamWire(box){
  const run = async (fn, okMsg) => { if(TW.busy) return; TW.busy = true; let r; try { r = await fn(); } catch(e){ r = { error:e }; } TW.busy = false; if(r && r.error){ console.error(r.error); toast('⚠ השינוי לא נשמר'); } else if(okMsg) toast(okMsg); await twLoadBase(); await twLoadPeriod(); twRender(); };
  const np = box.querySelector('#tw-new-period');
  np.addEventListener('click', () => { const b = box.querySelector('#tw-new-builder').value || null; TW.period = np.dataset.start; run(() => sbPersonal.from('tw_period').insert({ start:np.dataset.start, builder:b }), 'השבועיים נפתחו להגשה'); });
  const sb2 = box.querySelector('#tw-set-builder'); if(sb2) sb2.addEventListener('change', () => run(() => sbPersonal.from('tw_period').update({ builder:sb2.value || null }).eq('start', TW.period), 'נשמר'));
  box.querySelectorAll('[data-tw-pw]').forEach(s => s.addEventListener('change', () => run(() => sbPersonal.from('tw_people').update({ per_week:Number(s.value) }).eq('id', s.dataset.twPw), 'נשמר')));
  box.querySelectorAll('[data-tw-act]').forEach(b => b.addEventListener('click', () => { const x = twPerson(b.dataset.twAct); run(() => sbPersonal.from('tw_people').update({ active:!x.active }).eq('id', x.id), x.active ? 'הוסר מהרשימה' : 'הוחזר לרשימה'); }));
  box.querySelector('#tw-add-person').addEventListener('click', () => { const name = box.querySelector('#tw-new-name').value.trim(); if(!name){ toast('צריך שם'); return; } run(() => sbPersonal.from('tw_people').insert({ name, sort:TW.people.length + 1 }), 'נוסף לצוות'); });
}
