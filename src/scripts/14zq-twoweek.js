
// ---------- A TWO-WEEK SCHEDULE (the second pilot, Guy 2026-11-13; supabase/scheduling-v75.sql) ----------
// A module of its own next to the monthly schedule: every two weeks each person hands in OPTIONS (twice as many as the shifts they
// work), one of the staff builds the schedule (a different one each time), fixes it by hand and publishes it.
// The rules come from the institution's form: three shifts a day, two people a shift (three on Tuesday morning, and up to two more
// "third" places a week), no back-to-back shifts, a long weekend shift that counts as two, one night a week each (two people get two).
const TW = { people:[], periods:[], period:null, options:[], subs:[], asg:[], others:[], swaps:[], msgs:[], myAsg:[], full:false, socialOff:false, fixed:[], me:null, boss:false, tab:null, as:null, week:0, chain:null, allowed:null, probing:false, busy:false };
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
const twIsBuilder = () => TW.boss || (!!TW.me && !!twPeriodRow() && twPeriodRow().builder === TW.me.id && addDays(twPeriodRow().start, 13) >= isoDate(new Date()));
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
  TW.options = []; TW.subs = []; TW.asg = []; TW.others = [];
  if(!TW.period) return;
  const [o, s, a, ot] = await Promise.all([sbPersonal.from('tw_option').select('*').eq('period', TW.period), sbPersonal.from('tw_submission').select('*').eq('period', TW.period), sbPersonal.from('tw_assignment').select('*').eq('period', TW.period), sbPersonal.from('tw_other').select('*').eq('period', TW.period)]);
  TW.options = o.error ? [] : (o.data || []); TW.subs = s.error ? [] : (s.data || []); TW.asg = a.error ? [] : (a.data || []); TW.others = ot.error ? [] : (ot.data || []);
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
  try { await twLoadBase(); await twLoadPeriod(); await twLoadSocial(); } catch(e){ console.error(e); }
  if(!TW.allowed){ document.getElementById('tw-screen').innerHTML = '<div class="pnote">הסידור הדו-שבועי לא פתוח למשתמש הזה.</div>'; return; }
  if(!TW.tab) TW.tab = TW.me ? ((twPeriodRow() || {}).status === 'published' ? 'sched' : 'mine') : 'build';
  TW.as = null; TW.week = 0;
  twRender();
}
function twTabs(){
  const t = [['sched', 'הסידור']];
  if(TW.me || twIsBuilder()) t.push(['mine', 'העדפות']);
  if(TW.me || TW.boss) t.push(['swaps', 'החלפות'], ['inbox', 'הודעות']);
  if(twIsBuilder()) t.push(['build', 'בניית הסידור']);
  if(TW.boss) t.push(['team', 'צוות ותקופות']);
  if(!t.some(x => x[0] === TW.tab)) TW.tab = t[0][0];
  return `<div class="tw-tabs" role="tablist">${t.map(([k, l]) => `<button type="button" role="tab" class="tw-tab${TW.tab === k ? ' on' : ''}" data-tw-tab="${k}" aria-selected="${TW.tab === k}">${l}${twTabCount(k)}</button>`).join('')}</div>`;
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
  const allPeriods = TW.tab === 'team' || TW.tab === 'swaps' || TW.tab === 'inbox';
  if(!TW.period && !allPeriods) inner = `<div class="pnote">עדיין לא נפתחו שבועיים להגשה.${TW.boss ? ' אפשר לפתוח בלשונית "צוות ותקופות".' : ''}</div>`;
  else if(TW.tab === 'mine') inner = twMineHtml();
  else if(TW.tab === 'sched') inner = twSchedHtml();
  else if(TW.tab === 'build') inner = twBuildHtml();
  else if(TW.tab === 'team') inner = twTeamHtml();
  else if(TW.tab === 'swaps') inner = twSwapsHtml();
  else if(TW.tab === 'inbox') inner = twInboxHtml();
  box.innerHTML = tabs + (allPeriods ? '' : twPeriodPicker()) + inner;
  box.querySelectorAll('[data-tw-tab]').forEach(b => b.addEventListener('click', () => { TW.tab = b.dataset.twTab; TW.full = false; TW.step = null; twRender(); window.scrollTo(0, 0); }));
  const sel = box.querySelector('#tw-period-sel'); if(sel) sel.addEventListener('change', async () => { TW.period = sel.value; TW.week = 0; TW.step = null; await twLoadPeriod(); twRender(); });
  if(TW.tab === 'mine') twMineWire(box); else if(TW.tab === 'sched') twSchedWire(box); else if(TW.tab === 'build') twBuildWire(box); else if(TW.tab === 'team') twTeamWire(box); else if(TW.tab === 'swaps') twSwapsWire(box); else if(TW.tab === 'inbox') twInboxWire(box);
}

// ---- 1. the preferences (Guy 2026-11-14: one way only, no colours)
// Week after week on a phone (both weeks side by side on a computer). A tap on a shift goes כן -> יכול -> לא, and the word is written in the
// cell; a shift that was not touched is "לא". Every tap is saved at once; "הגשה" at the end tells the builder that the person is done, and
// the marks may still be changed until the hand-in closes. "שעות אחרות" (hours of one's own on a day) is in the bar at the bottom.
// The least to open is twice the shifts, counted over the two weeks together: כן and יכול count (the long weekend shift as two), other hours
// only from six hours. Below it a note appears; handing in is still allowed.
const TW_LV_WORD = { yes:'כן', can:'יכול', no:'לא' };
const TW_OTHER_MIN = 6;
function twWhose(){ return twPerson(TW.as) || TW.me || (twIsBuilder() ? TW.people.filter(p => p.active)[0] : null) || null; }
const twLvl = (personId, day, shift) => { const o = TW.options.find(x => x.person === personId && x.day === day && x.shift === shift); return o ? (o.level || 'yes') : 'no'; };
const twOtherOf = (personId, day) => (TW.others || []).find(x => x.person === personId && x.day === day) || null;
const twHm = t => String(t || '').slice(0, 5);
function twOtherHours(o){
  const [h1, m1] = twHm(o.from_time).split(':').map(Number), [h2, m2] = twHm(o.to_time).split(':').map(Number);
  let min = (h2 * 60 + m2) - (h1 * 60 + m1);
  if(min <= 0) min += 24 * 60;
  return min / 60;
}
// how much a person opened against the least that is asked, over the two weeks
function twCount(person){
  const days = twDays(TW.period), fixedW = [0, 0], kinds = { M:0, A:0, N:0, W:0 }, list = [];
  days.forEach(day => twSlots(day).forEach(sl => { if(twIsFixed(person.id, day, sl.shift)) fixedW[twWeekOf(TW.period, day)] += sl.w; }));
  const need = fixedW.reduce((n, f) => n + Math.max(0, person.per_week - f) * 2, 0);
  let have = 0, yes = 0, can = 0, other = 0;
  TW.options.forEach(o => {
    if(o.person !== person.id || days.indexOf(o.day) < 0 || twIsFixed(person.id, o.day, o.shift)) return;
    have += o.shift === 'W' ? 2 : 1; kinds[o.shift]++; list.push([o.day, o.shift]);
    if((o.level || 'yes') === 'can') can++; else yes++;
  });
  (TW.others || []).forEach(o => { if(o.person === person.id && days.indexOf(o.day) >= 0 && twOtherHours(o) >= TW_OTHER_MIN){ have++; other++; } });
  let clash = 0;
  for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++) if(twClash(list[i][0], list[i][1], list[j][0], list[j][1])) clash++;
  return { need, have, yes, can, other, kinds, clash, fixed:fixedW[0] + fixedW[1], ok:have >= need };
}
// the egg of this person for these two weeks: it grows with what was opened and hatches when the preferences are handed in
function twEggHtml(person, c, submitted){
  if(typeof pwEggHtml !== 'function') return '';
  let h = 0;
  String(person.id + TW.period).split('').forEach(ch => { h = (h * 31 + ch.charCodeAt(0)) >>> 0; });
  const stage = submitted ? 7 : Math.min(6, Math.floor((c.need ? Math.min(1, c.have / c.need) : 1) * 6));
  return `<span class="tw-egg">${pwEggHtml(stage, PW_EGG_NAMES[h % PW_EGG_NAMES.length])}</span>`;
}
function twCanMark(person){ return twIsBuilder() || (!!TW.me && person.id === TW.me.id && twOpenNow()); }
function twMineHtml(){
  const person = twWhose();
  if(!person) return '<div class="pnote">אין שורה ברשימת הצוות של הסידור הדו-שבועי.</div>';
  const c = twCount(person), can = twCanMark(person), sub = TW.subs.find(s => s.person === person.id), days = twDays(TW.period);
  if(TW.week !== 0 && TW.week !== 1) TW.week = 0;
  if(TW.cal === undefined){ try { TW.cal = !!localStorage.getItem('mercury-tw-cal'); } catch(e){ TW.cal = false; } }
  const pick = twIsBuilder() ? `<label class="tw-period"><span>ההעדפות של:</span><select id="tw-as">${TW.people.filter(p => p.active).map(p => `<option value="${p.id}"${p.id === person.id ? ' selected' : ''}>${pEsc(p.name)}${TW.subs.some(s => s.person === p.id) ? ' ✓' : ''}</option>`).join('')}</select></label>` : '';
  const cell = (day, s, span) => {
    if(twIsFixed(person.id, day, s.shift)) return `<div class="tw-pref fixed"${span ? ' style="grid-column:span 2"' : ''}><small>${TW_SHIFT[s.shift]}</small><b>קבועה</b><small>${s.hours}</small></div>`;
    const lv = twLvl(person.id, day, s.shift);
    return `<button type="button" class="tw-pref" data-lv="${lv}" data-tw-pref="${twKey(day, s.shift)}"${span ? ' style="grid-column:span 2"' : ''}${can ? '' : ' disabled'} aria-label="${DOW_NAMES[dowOf(day)]} ${twShort(day)}, ${TW_SHIFT[s.shift]}: ${TW_LV_WORD[lv]}">
      <small>${TW_SHIFT[s.shift]}</small><b>${TW_LV_WORD[lv]}</b><small>${s.hours}</small></button>`;
  };
  const dayBtn = (day, cls) => can ? `<button type="button" class="${cls} tw-day-btn" data-tw-day="${day}" aria-label="${DOW_NAMES[dowOf(day)]} ${twShort(day)}: כל המשמרות של היום">${DOW_NAMES[dowOf(day)]} <span>${twShort(day)}</span></button>`
    : `<div class="${cls}">${DOW_NAMES[dowOf(day)]} <span>${twShort(day)}</span></div>`;
  // the calendar view: the two weeks one under the other, the days side by side (Sunday on the right), a row per kind of shift
  const mini = (day, s, rows) => {
    const st = rows ? ` style="grid-row:span ${rows}"` : '';
    if(twIsFixed(person.id, day, s.shift)) return `<div class="tw-pref mini fixed"${st}><b>קבועה</b></div>`;
    const lv = twLvl(person.id, day, s.shift);
    return `<button type="button" class="tw-pref mini" data-lv="${lv}" data-tw-pref="${twKey(day, s.shift)}"${st}${can ? '' : ' disabled'} aria-label="${DOW_NAMES[dowOf(day)]} ${twShort(day)}, ${TW_SHIFT[s.shift]}: ${TW_LV_WORD[lv]}"><b>${TW_LV_WORD[lv]}</b>${s.shift === 'W' ? '<small>סוף שבוע</small>' : ''}</button>`;
  };
  const calWeek = w => {
    const wd = days.slice(w * 7, w * 7 + 7), others = wd.map(d => [d, twOtherOf(person.id, d)]).filter(x => x[1]);
    const row = k => `<div class="tw-cal-kind">${TW_SHIFT[k]}</div>` + wd.map(day => {
      const by = {}; twSlots(day).forEach(s => { by[s.shift] = s; });
      if(by.W) return k === 'M' ? mini(day, by.M) : k === 'A' ? mini(day, by.W, 2) : '';
      return by[k] ? mini(day, by[k]) : '<span class="tw-pref-none"></span>';
    }).join('');
    return `<section class="tw-pweek cur"><h3>שבוע ${w + 1} מתוך 2 <span class="tw-wk-range">${twShort(wd[0])}–${twShort(wd[6])}</span></h3>
      <div class="tw-cal"><span></span>${wd.map(d => dayBtn(d, 'tw-cal-day')).join('')}${TW_ROWS.map(row).join('')}</div>
      ${others.map(([d, o]) => `<div class="tw-pother">${DOW_NAMES[dowOf(d)]} ${twShort(d)}, שעות אחרות: <b>${twHm(o.from_time)}–${twHm(o.to_time)}</b>${twOtherHours(o) < TW_OTHER_MIN ? ` <small>(פחות מ-${TW_OTHER_MIN} שעות, לא נספר)</small>` : ''}${can ? ` <button type="button" class="tw-x" data-tw-other-del="${d}" aria-label="הסרת השעות האחרות של יום ${DOW_NAMES[dowOf(d)]}">✕</button>` : ''}</div>`).join('')}</section>`;
  };
  const dayRow = day => {
    const sl = twSlots(day), by = {}, o = twOtherOf(person.id, day);
    sl.forEach(s => { by[s.shift] = s; });
    const cells = by.W ? cell(day, by.M) + cell(day, by.W, true) : TW_ROWS.map(k => by[k] ? cell(day, by[k]) : '<span class="tw-pref-none"></span>').join('');
    return `<div class="tw-pday">${dayBtn(day, 'tw-day-name')}<div class="tw-pday-slots">${cells}</div>
      ${o ? `<div class="tw-pother">שעות אחרות: <b>${twHm(o.from_time)}–${twHm(o.to_time)}</b>${twOtherHours(o) < TW_OTHER_MIN ? ` <small>(פחות מ-${TW_OTHER_MIN} שעות, לא נספר)</small>` : ''}${can ? ` <button type="button" class="tw-x" data-tw-other-del="${day}" aria-label="הסרת השעות האחרות של יום ${DOW_NAMES[dowOf(day)]}">✕</button>` : ''}</div>` : ''}</div>`;
  };
  const week = w => `<section class="tw-pweek${TW.week === w ? ' cur' : ''}"><h3>שבוע ${w + 1} מתוך 2 <span class="tw-wk-range">${twShort(days[w * 7])}–${twShort(days[w * 7 + 6])}</span></h3>
    <div class="tw-grid">${days.slice(w * 7, w * 7 + 7).map(dayRow).join('')}</div></section>`;
  const left = Math.max(0, c.need - c.have);
  const state = !can ? '<div class="pnote">ההגשה לשבועיים האלה סגורה.</div>'
    : sub ? `<div class="pstatus ok">הוגש ב-${new Date(sub.submitted_at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}. אפשר עדיין לשנות, כל שינוי נשמר מיד.</div>` : '';
  const bar = can ? `<div class="tw-bar" role="toolbar" aria-label="פעולות ההעדפות">
      ${!TW.cal && TW.week === 1 ? '<button type="button" class="btn ghost tw-bar-week" id="tw-week-prev">→ שבוע 1</button>' : ''}
      <button type="button" class="btn ghost" id="tw-cal" aria-pressed="${!!TW.cal}">${TW.cal ? 'שבוע-שבוע' : 'שבועיים יחד'}</button>
      <button type="button" class="btn ghost" id="tw-other">שעות אחרות</button>
      ${!TW.cal && TW.week === 0 ? '<button type="button" class="btn tw-bar-week" id="tw-week-next">לשבוע 2 ←</button>' : ''}
      <button type="button" class="btn${!TW.cal && TW.week === 0 ? ' tw-bar-wide' : ''}" id="tw-submit">${sub ? 'הגשה מחדש' : 'הגשה'}</button></div>` : '';
  return `${pick}
    <div class="tw-phead">${twEggHtml(person, c, !!sub)}<div><b class="tw-pnum">${c.have} מתוך ${c.need}</b><span>משמרות שנפתחו בשבועיים${left ? ` · חסרות ${left}` : ''}</span></div></div>
    ${state}
    ${can ? '<div class="pnote tw-legend">הקשה על משמרת מחליפה: <b>כן</b> ← <b>יכול</b> ← <b>לא</b>. הקשה על שם היום מחליפה את כל המשמרות שלו. כל הקשה נשמרת מיד.</div>' : ''}
    ${TW.cal ? `<div class="tw-pweeks tw-cal-mode">${calWeek(0)}${calWeek(1)}</div>` : `<div class="tw-pweeks">${week(0)}${week(1)}</div>`}
    ${c.clash ? `<div class="pnote tw-warn">${c.clash === 1 ? 'יש זוג אחד של משמרות צמודות' : `יש ${c.clash} זוגות של משמרות צמודות`}: רק אחת מכל זוג יכולה להשתבץ.</div>` : ''}
    ${bar}`;
}
// one change after the other, so that quick taps reach the database in their order
function twQueue(fn){
  TW.chain = (TW.chain || Promise.resolve()).then(fn).then(r => { if(r && r.error) throw r.error; }).catch(async e => {
    console.error(e); toast('⚠ הסימון לא נשמר. בדקו חיבור ונסו שוב');
    await twLoadPeriod(); twRender();
  });
  return TW.chain;
}
const twNextLv = cur => (cur === 'no' ? 'yes' : cur === 'yes' ? 'can' : 'no');
function twTap(person, day, shift){ twSetLv(person, day, shift, twNextLv(twLvl(person.id, day, shift))); }
// a tap on the day itself: all its shifts together (Guy 2026-11-14). When they are alike they all move one step; when they differ they all become "כן".
function twDayTap(person, day){
  const slots = twSlots(day).filter(s => !twIsFixed(person.id, day, s.shift)); if(!slots.length) return;
  const lv = slots.map(s => twLvl(person.id, day, s.shift)), next = lv.every(x => x === lv[0]) ? twNextLv(lv[0]) : 'yes';
  slots.forEach(s => twSetLv(person, day, s.shift, next));
}
function twSetLv(person, day, shift, next){
  TW.options = TW.options.filter(o => !(o.person === person.id && o.day === day && o.shift === shift));
  if(next !== 'no') TW.options.push({ period:TW.period, person:person.id, day, shift, level:next });
  const period = TW.period;
  twQueue(() => next === 'no' ? sbPersonal.from('tw_option').delete().eq('period', period).eq('person', person.id).eq('day', day).eq('shift', shift)
    : sbPersonal.from('tw_option').upsert({ period, person:person.id, day, shift, level:next }));
}
function twKeepScroll(){ const y = window.scrollY; twRender(); window.scrollTo(0, y); }
function twMineWire(box){
  const person = twWhose(); if(!person) return;
  const as = box.querySelector('#tw-as'); if(as) as.addEventListener('change', () => { TW.as = as.value; twRender(); });
  box.querySelectorAll('[data-tw-pref]').forEach(b => b.addEventListener('click', () => { const [day, shift] = b.dataset.twPref.split('|'); twTap(person, day, shift); twKeepScroll(); }));
  box.querySelectorAll('[data-tw-other-del]').forEach(b => b.addEventListener('click', () => {
    const day = b.dataset.twOtherDel, period = TW.period;
    TW.others = (TW.others || []).filter(o => !(o.person === person.id && o.day === day));
    twQueue(() => sbPersonal.from('tw_other').delete().eq('period', period).eq('person', person.id).eq('day', day));
    twKeepScroll();
  }));
  box.querySelectorAll('[data-tw-day]').forEach(b => b.addEventListener('click', () => { twDayTap(person, b.dataset.twDay); twKeepScroll(); }));
  const go = (id, fn) => { const b = box.querySelector(id); if(b) b.addEventListener('click', fn); };
  go('#tw-cal', () => { TW.cal = !TW.cal; try { localStorage.setItem('mercury-tw-cal', TW.cal ? '1' : ''); } catch(e){} twRender(); window.scrollTo(0, 0); });
  go('#tw-week-next', () => { TW.week = 1; twRender(); window.scrollTo(0, 0); });
  go('#tw-week-prev', () => { TW.week = 0; twRender(); window.scrollTo(0, 0); });
  go('#tw-other', () => twOtherSheet(person));
  go('#tw-submit', () => twSubmitSheet(person));
}
function twSheet(html){
  const wrap = document.createElement('div'); wrap.className = 'sheet confirm-sheet mx-sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  wrap.dataset.ptheme = (document.querySelector('#view-tw .portal-shell[data-ptheme]') || { dataset:{} }).dataset.ptheme || 'dark';
  wrap.innerHTML = `<div class="sheet-card tw-sheet">${html}</div>`;
  wrap.addEventListener('click', e => { if(e.target === wrap || e.target.closest('[data-tw-close]')) wrap.remove(); });
  document.body.appendChild(wrap);
  return wrap;
}
// hours of one's own on a day: which day, from when, until when
function twOtherSheet(person){
  const all = twDays(TW.period), wide = TW.cal || window.matchMedia('(min-width:900px)').matches, days = wide ? all : all.slice(TW.week * 7, TW.week * 7 + 7);
  const sh = twSheet(`<h2>שעות אחרות</h2><div class="pnote">יום שאפשר לעבוד בו בשעות שאינן משמרת מלאה. ${TW_OTHER_MIN} שעות ומעלה נספרות כמשמרת שנפתחה.</div>
    <div class="tw-form tw-form-col"><label>יום <select id="tw-o-day">${days.map(d => `<option value="${d}">${DOW_NAMES[dowOf(d)]} ${twShort(d)}</option>`).join('')}</select></label>
      <label>משעה <input type="time" id="tw-o-from" value="12:00" step="900"></label><label>עד שעה <input type="time" id="tw-o-to" value="20:00" step="900"></label></div>
    <div class="confirm-actions"><button type="button" class="btn" id="tw-o-save">שמירה</button><button type="button" class="btn ghost" data-tw-close>ביטול</button></div>`);
  sh.querySelector('#tw-o-save').addEventListener('click', () => {
    const day = sh.querySelector('#tw-o-day').value, from = sh.querySelector('#tw-o-from').value, to = sh.querySelector('#tw-o-to').value, period = TW.period;
    if(!from || !to || from === to){ toast('צריך שעת התחלה ושעת סיום'); return; }
    TW.others = (TW.others || []).filter(o => !(o.person === person.id && o.day === day));
    TW.others.push({ period, person:person.id, day, from_time:from, to_time:to });
    twQueue(() => sbPersonal.from('tw_other').upsert({ period, person:person.id, day, from_time:from, to_time:to }));
    sh.remove(); twKeepScroll();
  });
}
// handing in: what was opened against the least, a free note to the builder, and the button
function twSubmitSheet(person){
  const c = twCount(person), sub = TW.subs.find(s => s.person === person.id), left = Math.max(0, c.need - c.have);
  const sh = twSheet(`<h2>הגשת ההעדפות</h2>
    <div class="pnote">נפתחו ${c.have} מתוך ${c.need} משמרות בשבועיים${c.can ? ` (מהן ${c.can} "יכול")` : ''}${c.other ? `, כולל ${c.other === 1 ? 'יום אחד' : c.other + ' ימים'} של שעות אחרות` : ''}.</div>
    ${left ? `<div class="pstatus bad">${left === 1 ? 'חסרה משמרת אחת' : `חסרות ${left} משמרות`} למינימום של השבועיים. אפשר להגיש בכל זאת, ומי שבונה את הסידור יראה שחסר.</div>` : ''}
    <label class="tw-note-l">הערה למי שבונה את הסידור (לא חובה)<textarea id="tw-note" rows="3" maxlength="300">${pEsc((sub && sub.note) || '')}</textarea></label>
    <div class="confirm-actions"><button type="button" class="btn" id="tw-submit-go">הגשה</button><button type="button" class="btn ghost" data-tw-close>חזרה</button></div>`);
  const go = sh.querySelector('#tw-submit-go');
  go.addEventListener('click', async () => {
    if(TW.busy) return; TW.busy = true; go.disabled = true;
    const note = sh.querySelector('#tw-note').value.trim();
    let r;
    try { await (TW.chain || Promise.resolve()); r = await sbPersonal.from('tw_submission').upsert({ period:TW.period, person:person.id, submitted_at:new Date().toISOString(), by_staff:srv.me || null, note:note || null }); } catch(e){ r = { error:e }; }
    TW.busy = false;
    if(r.error){ console.error(r.error); toast('⚠ ההגשה נכשלה. בדקו חיבור ונסו שוב'); go.disabled = false; return; }
    sh.remove(); toast('ההעדפות הוגשו'); await twLoadPeriod(); twRender(); window.scrollTo(0, 0);
  });
}
// (the demo fill: writes a whole set of marks for one person and hands it in)
async function twSaveOptions(person, rows){
  try {
    const del = await sbPersonal.from('tw_option').delete().eq('period', TW.period).eq('person', person.id); if(del.error) throw del.error;
    if(rows.length){ const ins = await sbPersonal.from('tw_option').insert(rows.map(r => ({ period:TW.period, person:person.id, day:r.day, shift:r.shift, level:r.level || 'yes' }))); if(ins.error) throw ins.error; }
    const sub = await sbPersonal.from('tw_submission').upsert({ period:TW.period, person:person.id, submitted_at:new Date().toISOString(), by_staff:srv.me || null }); if(sub.error) throw sub.error;
    return true;
  } catch(e){ console.error(e); return false; }
}

// ---- 2. the schedule
function twGridHtml(builder){
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
  return table(0) + table(1);
}
function twSchedHtml(){
  const p = twPeriodRow(), builder = twIsBuilder();
  if(p.status !== 'published' && !builder) return `<div class="pnote">הסידור של השבועיים האלה עדיין לא פורסם.${p.builder ? ` בונה אותו הפעם: ${pEsc(twName(p.builder))}.` : ''}</div>`;
  if(!TW.asg.length) return `<div class="pnote">עדיין אין סידור לשבועיים האלה.${builder ? ' בונים אותו בלשונית "בניית הסידור".' : ''}</div>`;
  const head = p.status === 'published' ? '' : '<div class="pstatus bad">טיוטה: רק מי שבונה את הסידור רואה אותה. הצוות יראה אחרי הפרסום.</div>';
  const whole = builder || TW.full || !TW.me;
  return `${head}${twMyShiftsHtml()}
    ${whole ? `${TW.me ? '<h3 class="tw-h">הסידור המלא</h3>' : ''}${builder ? '<div class="pnote">לחיצה על משבצת פותחת את רשימת הצוות, להוספה או להסרה ביד.</div>' : ''}${twGridHtml(builder)}`
      : '<div class="tw-actions"><button type="button" class="btn ghost" id="tw-full">הסידור המלא של כל הצוות</button></div>'}`;
}
function twSchedWire(box){
  box.querySelectorAll('[data-tw-ask]').forEach(b => b.addEventListener('click', () => twAskSheet(b.dataset.twAsk)));
  const full = box.querySelector('#tw-full'); if(full) full.addEventListener('click', () => { TW.full = true; twRender(); });
  if(!twIsBuilder()) return;
  twCellWire(box);
}
function twCellWire(box){
  box.querySelectorAll('[data-tw-cell]').forEach(td => { const go = () => twCellSheet(td.dataset.twCell); td.addEventListener('click', go); td.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } }); });
}
// the builder's sheet of one place: everybody, who offered it, who cannot (a clash), tap to add or remove
function twCellSheet(key){
  const [day, shift] = key.split('|'), there = () => TW.asg.filter(a => a.day === day && a.shift === shift);
  const wrap = document.createElement('div'); wrap.className = 'sheet confirm-sheet mx-sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  wrap.dataset.ptheme = (document.querySelector('#view-tw .portal-shell[data-ptheme]') || { dataset:{} }).dataset.ptheme || 'dark';
  const draw = () => {
    const rows = TW.people.filter(p => p.active).map(p => {
      const on = there().some(a => a.person === p.id), lv = twLvl(p.id, day, shift), opt = lv === 'yes' ? 2 : lv === 'can' ? 1 : 0, other = twOtherOf(p.id, day);
      const clash = !on && TW.asg.some(a => a.person === p.id && twClash(a.day, a.shift, day, shift));
      const load = TW.asg.filter(a => a.person === p.id).reduce((n, a) => n + (a.shift === 'W' ? 2 : 1), 0);
      return { p, on, opt, clash, load, other };
    }).sort((a, b) => (b.on - a.on) || (b.opt - a.opt) || (a.clash - b.clash) || a.p.name.localeCompare(b.p.name, 'he'));
    wrap.innerHTML = `<div class="sheet-card tw-sheet"><h2>${DOW_NAMES[dowOf(day)]} ${twShort(day)} · ${TW_SHIFT[shift]}</h2>
      <div class="tw-pick">${rows.map(r => `<button type="button" class="tw-pick-row${r.on ? ' on' : ''}" data-tw-p="${r.p.id}"><b>${pEsc(r.p.name)}</b>
        <small>${r.on ? 'בסידור כאן · לחיצה מסירה' : (r.opt === 2 ? 'כן' : r.opt === 1 ? 'יכול' : 'לא נפתח') + (r.other ? ` · שעות אחרות ${twHm(r.other.from_time)}–${twHm(r.other.to_time)}` : '') + (r.clash ? ' · צמוד למשמרת אחרת' : '')} · ${r.load} מתוך ${r.p.per_week * 2}</small></button>`).join('')}</div>
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

// ---- 3. building, in four numbered steps (Guy 2026-11-14: one of the staff builds, maybe once in a few months, so the screen leads her):
// 1 הגשות, 2 בנייה, 3 תיקונים, 4 פרסום. Each step has one sentence that says what to do now and one main button; any step can be opened again.
const TW_STEPS = ['הגשות', 'בנייה', 'תיקונים', 'פרסום'];
function twStepNow(){
  const p = twPeriodRow();
  if(!TW.step) TW.step = !p || p.status === 'open' ? 1 : p.status === 'built' ? 3 : 4;
  if(TW.step > 2 && !TW.asg.length) TW.step = 2;
  return TW.step;
}
function twMissingCount(){
  let n = 0;
  twDays(TW.period).forEach(day => twSlots(day).forEach(s => { n += Math.max(0, s.need - TW.asg.filter(a => a.day === day && a.shift === s.shift).length); }));
  return n;
}
function twBuildHtml(){
  const p = twPeriodRow(), step = twStepNow(), built = TW.asg.length > 0;
  const head = `<ol class="tw-steps">${TW_STEPS.map((w, i) => { const n = i + 1, off = n > 2 && !built;
    return `<li><button type="button" class="tw-step${n === step ? ' on' : ''}${n < step ? ' done' : ''}" data-tw-step="${n}"${off ? ' disabled' : ''}${n === step ? ' aria-current="step"' : ''}><span class="tw-step-n">${n}</span><span>${w}</span></button></li>`; }).join('')}</ol>`;
  const who = `<div class="pnote">השבועיים ${twPeriodLabel(p.start)} · בונה את הסידור: <b>${p.builder ? pEsc(twName(p.builder)) : 'לא נקבע'}</b></div>`;
  const act = TW.people.filter(x => x.active);
  let body = '';
  if(step === 1){
    const rows = act.map(x => ({ x, c:twCount(x), sub:TW.subs.find(s => s.person === x.id) || null }));
    const done = rows.filter(r => r.sub).length, low = rows.filter(r => r.sub && !r.c.ok).length;
    body = `<p class="tw-step-say">${p.status === 'open' ? 'כאן רואים מי הגיש ומה פתח. העדפות של מי שאין לה כניסה אישית מסמנים בלשונית "העדפות". כשמספיק הגישו, ממשיכים לבנייה.' : 'ההגשה נסגרה כשהסידור נבנה. אפשר לפתוח אותה מחדש, כדי שהצוות יוכל לשנות.'}</p>
      <div class="tw-step-sum">הגישו <b>${done}</b> מתוך ${act.length}${low ? ` · ${low} מתחת למינימום` : ''}</div>
      <div class="tw-subs">${rows.map(r => `<div class="tw-sub ${r.sub ? (r.c.ok ? 'ok' : 'low') : 'none'}"><b>${pEsc(r.x.name)}</b><span>${r.sub ? `${r.c.have} מתוך ${r.c.need}${r.c.ok ? '' : ' · פחות מהמינימום'}${r.c.clash ? ` · משמרות צמודות: ${r.c.clash}` : ''}` : (r.c.have ? `לא הוגש · סומנו ${r.c.have} מתוך ${r.c.need}` : 'לא הוגש')}</span>${r.sub && r.sub.note ? `<small class="tw-sub-note">הערה: ${pEsc(r.sub.note)}</small>` : ''}</div>`).join('')}</div>
      <div class="tw-actions"><button type="button" class="btn" data-tw-step="2">המשך לבנייה ←</button>
        ${p.status === 'built' ? '<button type="button" class="btn ghost" id="tw-reopen">פתיחת ההגשה מחדש</button>' : ''}
        ${typeof liveCut === 'function' && !liveCut() && p.status === 'open' ? '<button type="button" class="btn ghost" id="tw-demo">הדגמה: מילוי העדפות למי שאין כניסה ולא הגיש</button>' : ''}</div>`;
  } else if(step === 2){
    body = `<p class="tw-step-say">הבנייה משבצת לפי ההעדפות: קודם מי שסימן "כן", ורק כשאין אחרת "יכול". משמרות קבועות משובצות ראשונות. עם הבנייה ההגשה נסגרת.${built ? ' שיבוצים שנעשו ביד נשמרים גם בבנייה מחדש.' : ''}</p>
      ${twFixedBoxHtml()}
      <div class="tw-actions"><button type="button" class="btn" id="tw-build">${built ? 'בנייה מחדש' : 'בניית הסידור'}</button>
        ${built ? '<button type="button" class="btn ghost" data-tw-step="3">המשך לתיקונים ←</button>' : ''}</div>`;
  } else if(step === 3){
    const rep = (p.report && p.report.lines) || [], miss = twMissingCount();
    body = `<p class="tw-step-say">לחיצה על משבצת פותחת את רשימת הצוות: מי סימן "כן", מי "יכול", ומי צמוד למשמרת אחרת. לחיצה על שם מוסיפה או מסירה.</p>
      <div class="tw-step-sum">${miss ? `חסרים <b>${miss}</b> שיבוצים` : 'כל המשמרות מלאות'} · ${TW.asg.length} שיבוצים${TW.asg.some(a => a.by_hand) ? `, ${TW.asg.filter(a => a.by_hand).length} מהם ביד` : ''}</div>
      ${rep.length ? `<details class="tw-report"><summary>מה הבנייה מדווחת (${rep.length})</summary><ul>${rep.map(l => `<li>${pEsc(l)}</li>`).join('')}</ul></details>` : ''}
      ${twGridHtml(true)}
      <div class="tw-actions"><button type="button" class="btn" data-tw-step="4">המשך לפרסום ←</button></div>`;
  } else {
    const miss = twMissingCount();
    body = p.status === 'published'
      ? `<div class="pstatus ok">הסידור פורסם ב-${new Date(p.published_at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}. כל הצוות רואה אותו.</div>
        <p class="tw-step-say">שינויים אחרי הפרסום עושים בצעד 3, והם מופיעים לצוות מיד. בקשות החלפה מאשרים בלשונית "החלפות".</p>
        <div class="tw-actions"><button type="button" class="btn ghost" data-tw-step="3">→ תיקונים</button><button type="button" class="btn ghost" id="tw-unpublish">ביטול הפרסום</button></div>`
      : `<p class="tw-step-say">בפרסום הסידור נפתח לכל הצוות, וכל אחת רואה את המשמרות שלה.</p>
        ${miss ? `<div class="pstatus bad">${miss === 1 ? 'חסר שיבוץ אחד' : `חסרים ${miss} שיבוצים`}. אפשר לפרסם בכל זאת ולהשלים אחר כך בצעד 3.</div>` : '<div class="pstatus ok">כל המשמרות מלאות.</div>'}
        <div class="tw-actions"><button type="button" class="btn" id="tw-publish">פרסום לצוות</button><button type="button" class="btn ghost" data-tw-step="3">→ חזרה לתיקונים</button></div>`;
  }
  return head + who + body;
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
  box.querySelectorAll('[data-tw-step]').forEach(b => b.addEventListener('click', () => { TW.step = Number(b.dataset.twStep); twRender(); window.scrollTo(0, 0); }));
  twCellWire(box);
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
    TW.step = 3;
  });
  on('#tw-publish', async () => { const up = await sbPersonal.from('tw_period').update({ status:'published', published_at:new Date().toISOString() }).eq('start', TW.period); if(up.error) throw up.error; toast('הסידור פורסם לצוות'); TW.step = 4; });
  on('#tw-reopen', async () => { const up = await sbPersonal.from('tw_period').update({ status:'open' }).eq('start', TW.period); if(up.error) throw up.error; toast('ההגשה נפתחה מחדש'); TW.step = 1; });
  on('#tw-unpublish', async () => { const up = await sbPersonal.from('tw_period').update({ status:'built', published_at:null }).eq('start', TW.period); if(up.error) throw up.error; toast('הפרסום בוטל'); });
  // (the demo fill is not for somebody with a sign-in: they hand in themselves)
  on('#tw-demo', async () => {
    for(const p of TW.people.filter(x => x.active && !x.staff_id && !TW.subs.some(s => s.person === x.id))){ if(!(await twSaveOptions(p, twDemoOptions(p)))) throw new Error('demo options'); }
    toast('מולאו העדפות לדוגמה');
  });
}
// invented options for the demo: about twice the weekly shifts in each week, a mix of kinds, no two on one day
function twDemoOptions(person){
  const rows = [], days = twDays(TW.period);
  for(let w = 0; w < 2; w++){
    const pool = [];
    days.slice(w * 7, w * 7 + 7).forEach(day => twSlots(day).forEach(s => pool.push([day, s.shift])));
    pool.sort(() => Math.random() - 0.5);
    const kinds = { M:0, A:0, N:0, W:0 }, used = {}; let n = 0;
    for(const [day, shift] of pool){
      if(n >= person.per_week * 2 + (Math.random() < 0.3 ? 1 : 0)) break;
      if(used[day] || kinds[shift] >= (shift === 'W' ? 1 : 3)) continue;
      used[day] = true; kinds[shift]++; n++; rows.push({ day, shift, level:Math.random() < 0.25 ? 'can' : 'yes' });
    }
  }
  return rows;
}

// ---- the build itself: many quick tries, the best one wins. Never puts a person where they did not offer; what cannot be filled is reported.
function twSolve({ start, people, options, fixed, hand }){
  const days = twDays(start), offer = {}, di = {};          // (di: the number of a day inside the two weeks, 0–13 — whole numbers, so that the many tries stay quick)
  days.forEach((d, i) => { di[d] = i; });
  const onlyCan = {};
  options.forEach(o => { if(o.day in di){ (offer[o.person] = offer[o.person] || new Set()).add(di[o.day] + o.shift); if(o.level === 'can') (onlyCan[o.person] = onlyCan[o.person] || new Set()).add(di[o.day] + o.shift); } });
  const isCan = (pid, pl) => !!(onlyCan[pid] && onlyCan[pid].has(pl.k));
  const firstYes = (list, pl) => { const y = list.filter(p => !isCan(p.id, pl)); return y.length ? y : list; };
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
      const who = firstYes(bc, pl).map(p => [score(p, pl), p]).sort((a, b) => b[0] - a[0])[0][1];
      put(who.id, pl); filled.push({ pl, pid:who.id });
      if(pl.shift === 'N' && nights[who.id][pl.week] === 2) twoNights[pl.week].add(who.id);
    }
    // the third places: only for people who still have shifts to give, two a week at most
    const thirds = [0, 0];
    places.filter(pl => !pl.must).sort(() => Math.random() - 0.5).forEach(pl => {
      if(thirds[pl.week] >= TW_THIRDS_A_WEEK) return;
      const c = people.filter(p => can(p, pl) && !isCan(p.id, pl)); if(!c.length) return;
      const who = c.map(p => [score(p, pl), p]).sort((a, b) => b[0] - a[0])[0][1];
      put(who.id, pl); filled.push({ pl, pid:who.id, third:true }); thirds[pl.week]++;
    });
    let cost = missing.reduce((n, pl) => n + (pl.shift === 'N' ? 1200 : 1000), 0) + filled.filter(f => isCan(f.pid, f.pl)).length * 3;
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
  people.forEach(p => { if(!offer[p.id] || !offer[p.id].size) lines.push(`${p.name}: לא נפתחו משמרות, ולכן אין שיבוצים`); });
  [0, 1].forEach(w => { const two = people.filter(p => best.nights[p.id][w] === 2).map(p => p.name), none = people.filter(p => best.nights[p.id][w] === 0 && offer[p.id] && offer[p.id].size).map(p => p.name);
    if(two.length) lines.push(`שבוע ${w + 1}, שני לילות: ${two.join(', ')}`); if(none.length) lines.push(`שבוע ${w + 1}, בלי לילה: ${none.join(', ')}`); });
  const cans = best.filled.filter(f => isCan(f.pid, f.pl)).length;
  if(cans) lines.push(`${cans === 1 ? 'שיבוץ אחד נעשה' : cans + ' שיבוצים נעשו'} במשמרות שסומנו "יכול", כי לא היה מי שסימן "כן".`);
  if(!lines.length) lines.push('כל המשמרות מלאות, וכל אנשי הצוות קיבלו את מספר המשמרות שלהם.');
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

// ---- 5. swaps and messages (Guy 2026-11-14: the product's instructor portal; supabase/scheduling-v78.sql)
// A person asks to give away one of her shifts of a published schedule; somebody else on the list takes it; the builder of those two
// weeks approves, and only then the schedule changes. Messages about the schedule are written by whoever builds now and by the admin.
const TW_SWAP_WORD = { open:'מחפשים מי שיחליף', taken:'ממתין לאישור של מי שבנה את הסידור', approved:'אושר', declined:'לא אושר', cancelled:'בוטל' };
const twToday = () => isoDate(new Date());
const twSlotHours = (day, shift) => ((twSlots(day).find(s => s.shift === shift) || {}).hours || '');
const twShiftLine = (day, shift) => `יום ${DOW_NAMES[dowOf(day)]} ${twShort(day)} · ${TW_SHIFT[shift]}${shift === 'W' ? '' : ` ${twSlotHours(day, shift)}`}`;
const twBuilderNow = () => TW.boss || (!!TW.me && TW.periods.some(p => p.builder === TW.me.id && addDays(p.start, 13) >= twToday()));
const twBuilderOf = period => TW.boss || (!!TW.me && TW.periods.some(p => p.start === period && p.builder === TW.me.id));
async function twLoadSocial(){
  const from = addDays(twToday(), -14);
  const [sw, ms, mine] = await Promise.all([
    sbPersonal.from('tw_swap').select('*').gte('day', from).order('day'),
    sbPersonal.from('tw_message').select('*').order('created_at', { ascending:false }).limit(40),
    TW.me ? sbPersonal.from('tw_assignment').select('id,period,day,shift').eq('person', TW.me.id).gte('day', twToday()) : Promise.resolve({ data:[] })]);
  TW.swaps = sw.error ? [] : (sw.data || []); TW.msgs = ms.error ? [] : (ms.data || []); TW.myAsg = mine.error ? [] : (mine.data || []);
  TW.socialOff = !!sw.error;          // (a database before scheduling-v78.sql: the two tabs say so instead of failing)
}
const twSeenKey = () => 'mercury-tw-seen-' + (srv.me || '');
function twUnread(){ let seen = ''; try { seen = localStorage.getItem(twSeenKey()) || ''; } catch(e){} return (TW.msgs || []).filter(m => m.created_at > seen && m.from_staff !== srv.me).length; }
function twSwapTodo(){
  const sw = TW.swaps || [], today = twToday();
  const forMe = TW.me ? sw.filter(s => s.status === 'open' && s.from_person !== TW.me.id && s.day >= today).length : 0;
  return forMe + sw.filter(s => s.status === 'taken' && twBuilderOf(s.period)).length;
}
function twTabCount(k){ const n = k === 'swaps' ? twSwapTodo() : k === 'inbox' ? twUnread() : 0; return n ? ` <span class="ptab-count">${n}</span>` : ''; }
async function twRpc(name, args, okMsg){
  if(TW.busy) return false; TW.busy = true;
  let r; try { r = await sbPersonal.rpc(name, args); } catch(e){ r = { error:e }; }
  TW.busy = false;
  if(r.error){ console.error(r.error); toast('⚠ הפעולה לא נשמרה. ייתכן שהמצב השתנה בינתיים'); } else if(okMsg) toast(okMsg);
  await twLoadPeriod(); await twLoadSocial(); twRender();
  return !r.error;
}

// "המשמרות שלי": the person's shifts of these two weeks, who she works with, and asking for a swap
function twMyShiftsHtml(){
  if(!TW.me) return '';
  const p = twPeriodRow(), today = twToday();
  const mine = TW.asg.filter(a => a.person === TW.me.id).sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  if(!mine.length) return '<h3 class="tw-h">המשמרות שלי</h3><div class="pnote">אין משמרות בשבועיים האלה.</div>';
  return `<h3 class="tw-h">המשמרות שלי</h3><div class="tw-list">${mine.map(a => {
    const withMe = TW.asg.filter(x => x.day === a.day && x.shift === a.shift && x.person !== TW.me.id).map(x => twName(x.person));
    const sw = (TW.swaps || []).find(s => s.assignment === a.id && (s.status === 'open' || s.status === 'taken'));
    const canAsk = p.status === 'published' && a.day >= today && !sw && !TW.socialOff;
    return `<div class="tw-shift${a.day < today ? ' past' : ''}"><div><b>${twShiftLine(a.day, a.shift)}</b>${a.shift === 'W' ? `<small>${twSlotHours(a.day, 'W')}</small>` : ''}
      <small>${withMe.length ? 'יחד עם: ' + pEsc(withMe.join(', ')) : 'בלי שיבוץ נוסף במשמרת'}</small>${sw ? `<small class="tw-swap-state">בקשת החלפה: ${TW_SWAP_WORD[sw.status]}${sw.taker ? ` (${pEsc(twName(sw.taker))})` : ''}</small>` : ''}</div>
      ${canAsk ? `<button type="button" class="btn ghost small" data-tw-ask="${a.id}">בקשת החלפה</button>` : ''}</div>`;
  }).join('')}</div>`;
}
// who could take a shift: on the list, not working that day, no back-to-back shift
function twCanTake(personId, day, shift, asg){ return !asg.some(a => a.person === personId && twClash(a.day, a.shift, day, shift)); }
function twAskSheet(asgId){
  const a = TW.asg.find(x => x.id === asgId); if(!a) return;
  const free = TW.people.filter(p => p.active && p.id !== TW.me.id && twCanTake(p.id, a.day, a.shift, TW.asg)).map(p => p.name);
  const sh = twSheet(`<h2>בקשת החלפה</h2><div class="pnote"><b>${twShiftLine(a.day, a.shift)}</b></div>
    <div class="pnote">הבקשה תופיע לכל הצוות בלשונית "החלפות". כשמישהו מהצוות לוקח את המשמרת, מי שבנה את הסידור מאשר, ורק אז הסידור משתנה.</div>
    <div class="pnote">${free.length ? 'פנויים באותו זמן לפי הסידור: ' + pEsc(free.join(', ')) + '.' : 'לפי הסידור אין מי שפנוי באותו זמן.'}</div>
    <label class="tw-note-l">כמה מילים לצוות (לא חובה)<textarea id="tw-ask-note" rows="2" maxlength="200"></textarea></label>
    <div class="confirm-actions"><button type="button" class="btn" id="tw-ask-go">שליחת הבקשה</button><button type="button" class="btn ghost" data-tw-close>חזרה</button></div>`);
  sh.querySelector('#tw-ask-go').addEventListener('click', async () => {
    const note = sh.querySelector('#tw-ask-note').value.trim();
    sh.remove();
    if(await twRpc('tw_swap_ask', { p_assignment:a.id, p_note:note || null }, 'הבקשה נשלחה לצוות')) twShareSheet(a);
  });
}
// after asking: a ready WhatsApp message for the staff's group
function twShareSheet(a){
  const text = `מחפשים החלפה: ${twShiftLine(a.day, a.shift)}. מי שיכול/ה לקחת, מסמנים באתר בלשונית "החלפות": ${location.origin}${location.pathname}`;
  twSheet(`<h2>הבקשה נשלחה</h2><div class="pnote">אפשר גם לשלוח הודעה מוכנה לקבוצת הצוות:</div><div class="tw-share">${pEsc(text)}</div>
    <div class="confirm-actions"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}" data-tw-close>שליחה בוואטסאפ</a><button type="button" class="btn ghost" data-tw-close>סגירה</button></div>`);
}
function twSwapsHtml(){
  if(TW.socialOff) return '<div class="pnote">ההחלפות עוד לא הופעלו במסד הזה.</div>';
  const sw = TW.swaps || [], today = twToday(), me = TW.me ? TW.me.id : null;
  const line = s => `<b>${twShiftLine(s.day, s.shift)}</b><small>${pEsc(twName(s.from_person))}${s.taker ? ` ← ${pEsc(twName(s.taker))}` : ''} · ${TW_SWAP_WORD[s.status]}</small>${s.note ? `<small>״${pEsc(s.note)}״</small>` : ''}`;
  const decide = sw.filter(s => s.status === 'taken' && twBuilderOf(s.period));
  const open = sw.filter(s => s.status === 'open' && s.from_person !== me && s.day >= today);
  const mine = sw.filter(s => me && (s.from_person === me || s.taker === me) && s.status !== 'cancelled' && (s.status === 'open' || s.status === 'taken' || s.day >= today));          // (a cancelled request goes at once: Guy 2026-11-14)
  const done = sw.filter(s => s.status === 'approved' && s.day >= today && !mine.includes(s));
  const takeBtn = s => {
    if(!me) return '';
    if(!twCanTake(me, s.day, s.shift, TW.myAsg || [])) return '<small class="tw-swap-state">יש לך משמרת צמודה או באותו יום</small>';
    return `<button type="button" class="btn small" data-tw-take="${s.id}">לקחת את המשמרת</button>`;
  };
  const sec = (title, list, extra) => list.length ? `<h3 class="tw-h">${title}</h3><div class="tw-list">${list.map(s => `<div class="tw-shift"><div>${line(s)}</div>${extra(s)}</div>`).join('')}</div>` : '';
  const body = sec('ממתינות לאישור שלך', decide, s => `<span class="tw-btns"><button type="button" class="btn small" data-tw-decide="${s.id}" data-ok="1">אישור</button><button type="button" class="btn ghost small" data-tw-decide="${s.id}">לא לאשר</button></span>`)
    + sec('מחפשים מי שיחליף', open, takeBtn)
    + sec('הבקשות שלי', mine, s => (s.status === 'open' || s.status === 'taken') ? `<button type="button" class="btn ghost small" data-tw-cancel="${s.id}">${s.taker === me ? 'ויתור על המשמרת' : 'ביטול הבקשה'}</button>` : '')
    + sec('החלפות שאושרו', done, () => '');
  return (body || '<div class="pnote">אין כרגע בקשות החלפה.</div>') + `<div class="pnote">בקשה חדשה פותחים בלשונית "הסידור", ליד המשמרת.</div>`;
}
function twSwapsWire(box){
  box.querySelectorAll('[data-tw-take]').forEach(b => b.addEventListener('click', () => twRpc('tw_swap_take', { p_swap:b.dataset.twTake }, 'נרשם. ממתין לאישור של מי שבנה את הסידור')));
  box.querySelectorAll('[data-tw-cancel]').forEach(b => b.addEventListener('click', () => twRpc('tw_swap_cancel', { p_swap:b.dataset.twCancel }, 'בוטל')));
  box.querySelectorAll('[data-tw-decide]').forEach(b => b.addEventListener('click', () => twRpc('tw_swap_decide', { p_swap:b.dataset.twDecide, p_approve:!!b.dataset.ok }, b.dataset.ok ? 'ההחלפה אושרה והסידור עודכן' : 'ההחלפה לא אושרה')));
}
function twInboxHtml(){
  if(TW.socialOff) return '<div class="pnote">ההודעות עוד לא הופעלו במסד הזה.</div>';
  const who = m => { const p = TW.people.find(x => x.staff_id && x.staff_id === m.from_staff); return p ? p.name : 'הנהלה'; };
  const write = twBuilderNow() ? `<div class="tw-compose"><label class="tw-note-l">הודעה לכל הצוות<textarea id="tw-msg" rows="3" maxlength="1000"></textarea></label><button type="button" class="btn" id="tw-msg-send">שליחה</button></div>` : '';
  const list = (TW.msgs || []).map(m => `<div class="tw-msg"><small>${pEsc(who(m))} · ${new Date(m.created_at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}</small><p>${pEsc(m.body)}</p>
    ${TW.boss || m.from_staff === srv.me ? `<button type="button" class="tw-x" data-tw-msg-del="${m.id}" aria-label="מחיקת ההודעה">✕</button>` : ''}</div>`).join('');
  return write + (list ? `<div class="tw-list">${list}</div>` : '<div class="pnote">אין הודעות.</div>');
}
function twInboxWire(box){
  try { if((TW.msgs || []).length) localStorage.setItem(twSeenKey(), TW.msgs[0].created_at); } catch(e){}
  const send = box.querySelector('#tw-msg-send');
  if(send) send.addEventListener('click', async () => {
    const body = box.querySelector('#tw-msg').value.trim(); if(!body){ toast('צריך לכתוב הודעה'); return; }
    if(TW.busy) return; TW.busy = true; send.disabled = true;
    const r = await sbPersonal.from('tw_message').insert({ body });
    TW.busy = false;
    if(r.error){ console.error(r.error); toast('⚠ ההודעה לא נשלחה'); send.disabled = false; return; }
    toast('ההודעה נשלחה לצוות'); await twLoadSocial(); twRender();
  });
  box.querySelectorAll('[data-tw-msg-del]').forEach(b => b.addEventListener('click', async () => {
    const r = await sbPersonal.from('tw_message').delete().eq('id', b.dataset.twMsgDel);
    if(r.error){ console.error(r.error); toast('⚠ המחיקה נכשלה'); return; }
    await twLoadSocial(); twRender();
  }));
}
