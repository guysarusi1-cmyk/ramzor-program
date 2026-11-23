
// ---------- A TWO-WEEK SCHEDULE (the second pilot, Guy 2026-11-13; supabase/scheduling-v75.sql) ----------
// A module of its own next to the monthly schedule: every two weeks each person hands in OPTIONS (twice as many as the shifts they
// work), one of the staff builds the schedule (a different one each time), fixes it by hand and publishes it.
// The rules (the meeting with the institution 19.11.2026, scheduling-v86.sql): three shifts a day, two people a shift (three on Tuesday
// morning), never a double in a row, the close pairs only for who agreed, a long weekend shift that counts as one, one night a week each
// (two people of the two weeks get two, in turn). The pilot's screens beyond this module: 14zs-tw-pilot.js.
const TW = { people:[], periods:[], period:null, options:[], subs:[], asg:[], others:[], settings:[], priv:{}, staff:[], autoDone:false, swaps:[], msgs:[], myAsg:[], full:false, socialOff:false, fixed:[], me:null, boss:false, tab:null, as:null, week:0, chain:null, allowed:null, probing:false, busy:false };
const TW_SHIFT = { M:'בוקר', A:'צהריים', N:'לילה', W:'סוף שבוע' };
const TW_ROWS = ['M', 'A', 'N'];
// text written by people (names, notes, messages): marked, so that the Arabic of the product never translates it
const twU = s => `<bdi data-u>${pEsc(s)}</bdi>`;
// new text of the staff screens goes through keys (Yigal 2026-11-14): Hebrew, and Arabic on a device that chose it (products/shibutz/ar.js)
const TW_TXT = { privacy:['אל תכתבו כאן סיבות רפואיות או פרטים אישיים.', 'لا تكتبوا هنا أسبابًا طبية أو تفاصيل شخصية.'] };
const twT = k => { const t = TW_TXT[k]; if(!t) return k; return (typeof SB_AR_ON !== 'undefined' && SB_AR_ON) ? t[1] : t[0]; };          // (besides Tuesday morning)

// the places of one day: need = must be filled, extra = a third place that is filled only when there are free hands, w = how many shifts it counts
// The pilot (the meeting with the institution 19.11.2026; supabase/scheduling-v86.sql has the same on the server): two in every shift, also
// on Friday morning, three on Tuesday morning; no automatic third place elsewhere; the long weekend shift counts as ONE shift. A holiday eve
// is a Friday and a holiday a Saturday (tw_holiday); the Hanukkah days are ordinary days. The weekend hours come from the settings, winter
// and summer apart (tw_settings 'weekend_hours'; Guy sends the summer hours later).
function twKind(iso){
  const h = (TW.holidays || {})[iso]; if(h) return h === 'eve' ? 'fri' : 'sat';
  const d = dowOf(iso); return d === 5 ? 'fri' : d === 6 ? 'sat' : 'weekday';
}
// summer time in Israel on that day (the weekend hours differ). The clock's own dates, unless the admin set other dates for that year in
// "שעות סוף השבוע" (Guy 23.11: the hours of the shifts may change on another day than the clock; tw_settings 'summer_dates')
function twSummerClock(iso){
  try { const [y, m, d] = iso.split('-').map(Number); return /GMT\+3/.test(new Date(Date.UTC(y, m - 1, d, 12)).toLocaleString('en-US', { timeZone:'Asia/Jerusalem', timeZoneName:'short' })); } catch(e){ return false; }
}
const twSummerAutoMemo = {};
function twSummerAuto(y){
  if(twSummerAutoMemo[y]) return twSummerAutoMemo[y];
  let start = `${y}-03-27`, end = `${y}-10-25`;
  for(let d = `${y}-03-15`; d <= `${y}-04-15`; d = addDays(d, 1)) if(twSummerClock(d)){ start = d; break; }
  for(let d = `${y}-10-15`; d <= `${y}-11-15`; d = addDays(d, 1)) if(!twSummerClock(d)){ end = d; break; }
  return (twSummerAutoMemo[y] = { start, end });
}
const twSummerDates = y => { const own = ((TW.settings || []).find(x => x.key === 'summer_dates') || {}).value || {}, a = twSummerAuto(y), o = own[y] || {}; return { start:o.start || a.start, end:o.end || a.end }; };
function twSummer(iso){ const d = twSummerDates(Number(iso.slice(0, 4))); return iso >= d.start && iso < d.end; }
function twWeekend(iso, part){
  const v = (TW.settings || []).find(x => x.key === 'weekend_hours'), s = v && v.value && v.value[twSummer(iso) ? 'summer' : 'winter'];
  return (s && s[part]) || (part === 'start' ? '14:00' : '20:30');
}
const twNice = hm => String(hm).replace(/^0(\d)/, '$1');
function twSlots(iso){
  const k = twKind(iso), next = addDays(iso, 1);
  if(k === 'fri') return [{ shift:'M', need:2, extra:0, w:1, hours:'7:30–14:30' },
    { shift:'W', need:2, extra:0, w:1, hours:`${DOW_NAMES[dowOf(iso)]} ${twNice(twWeekend(iso, 'start'))} עד ${DOW_NAMES[dowOf(next)]} ${twNice(twWeekend(next, 'end'))}` }];
  if(k === 'sat') return [{ shift:'N', need:2, extra:0, w:1, hours:`${twNice(twWeekend(iso, 'end'))}–8:00` }];
  return [{ shift:'M', need:dowOf(iso) === 2 ? 3 : 2, extra:0, w:1, hours:'7:30–15:30' }, { shift:'A', need:2, extra:0, w:1, hours:'15:00–23:00' }, { shift:'N', need:2, extra:0, w:1, hours:'22:30–8:00' }];
}
// the time of a shift, in minutes (a placement with hours of its own: those hours)
const twMin = (iso, hm) => { const [y, m, d] = iso.split('-').map(Number), [h, mi] = String(hm).split(':').map(Number); return Date.UTC(y, m - 1, d) / 60000 + h * 60 + (mi || 0); };
function twSpan(day, shift, a){
  if(a && a.from_time && a.to_time){ const s = twMin(day, twHm(a.from_time)); let e = twMin(day, twHm(a.to_time)); if(e <= s) e += 1440; return [s, e]; }
  const k = twKind(day), next = addDays(day, 1);
  if(shift === 'M') return [twMin(day, '07:30'), twMin(day, k === 'fri' ? '14:30' : '15:30')];
  if(shift === 'A') return [twMin(day, '15:00'), twMin(day, '23:00')];
  if(shift === 'N') return [twMin(day, k === 'sat' ? twWeekend(day, 'end') : '22:30'), twMin(next, '08:00')];
  return [twMin(day, twWeekend(day, 'start')), twMin(next, twWeekend(next, 'end'))];
}
const twDays = start => Array.from({ length:14 }, (x, i) => addDays(start, i));
const twWeekOf = (start, iso) => (Math.round((parseIso(iso) - parseIso(start)) / 86400000) < 7 ? 0 : 1);
const twShort = iso => { const t = parseIso(iso); return t.getDate() + '/' + (t.getMonth() + 1); };
const twKey = (day, shift) => day + '|' + shift;
const twPerson = id => TW.people.find(p => p.id === id);
// the name in the schedule: the first name; when two people on the list have the same first name, a letter of the last name too (Guy 19.11)
function twDisp(p){ if(!p) return '?'; const same = TW.people.some(x => x.id !== p.id && x.active && x.name === p.name); return same && p.last_name && p.last_name.trim() ? `${p.name} ${p.last_name.trim()[0]}.` : p.name; }
const twName = id => twDisp(twPerson(id));
const twPeriodRow = () => TW.periods.find(p => p.start === TW.period) || null;
const twIsBuilder = () => TW.boss || (!!TW.me && !!twPeriodRow() && twPeriodRow().builder === TW.me.id && addDays(twPeriodRow().start, 13) >= isoDate(new Date()));
// the fixed shifts: up to two fixed people in a shift of the week (Guy 23.11; before: one), kept from schedule to schedule
const twFixedOf = (dow, shift) => TW.fixed.filter(x => x.dow === dow && x.shift === shift).map(x => x.person);
const twIsFixed = (personId, day, shift) => twFixedOf(dowOf(day), shift).includes(personId);
const twCanFix = () => TW.boss || (!!TW.me && TW.periods.some(p => p.builder === TW.me.id && p.status !== 'published'));
const twOpenNow = () => { const p = twPeriodRow(); return !!p && p.status === 'open' && (!p.deadline || new Date(p.deadline) > new Date()); };
const twPeriodLabel = start => `${twShort(start)} – ${twShort(addDays(start, 13))}`;
// hours and date ranges always read from left to right, the start first (as rangeHtml in the big site; the review agents 2026-11-14)
const twL = s => /^[\d:/–\-\s]+$/.test(String(s || '')) ? `<bdi dir="ltr">${s}</bdi>` : s;
// a question before a heavy step, and "ביטול" for a few seconds after a light one (as confirmSheet / toastUndo in the big site)
function twConfirm(o){
  return new Promise(resolve => {
    let done = false;
    const sh = twSheet(`<h2>${pEsc(o.title || '')}</h2>${o.text ? `<p class="confirm-text">${pEsc(o.text)}</p>` : ''}
      <div class="confirm-actions"><button type="button" class="btn${o.danger ? ' danger' : ''}" data-tw-yes>${pEsc(o.ok || 'אישור')}</button><button type="button" class="btn ghost" data-tw-close>${pEsc(o.cancel || 'חזרה')}</button></div>`);
    const end = v => { if(done) return; done = true; resolve(v); };
    sh._onClose = () => end(false);
    sh.querySelector('[data-tw-yes]').addEventListener('click', () => { end(true); sh.remove(); });
    sh.addEventListener('click', e => { if(e.target === sh || e.target.closest('[data-tw-close]')) end(false); });
    const safe = sh.querySelector('[data-tw-close]'); if(safe) safe.focus();
  });
}
let twUndoEl = null;
function twUndo(msg, onUndo){
  if(twUndoEl) twUndoEl.remove();
  const t = document.createElement('div'); t.className = 'toast toast-undo' + (msg.length > 50 ? ' toast-long' : ''); t.setAttribute('role', 'status');
  const text = document.createElement('span'); text.textContent = msg;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'toast-undo-btn'; btn.textContent = 'ביטול';
  btn.addEventListener('click', async () => { btn.disabled = true; let ok = false; try { ok = await onUndo(); } catch(e){ console.error(e); } t.remove(); if(twUndoEl === t) twUndoEl = null; toast(ok ? 'הפעולה בוטלה' : '⚠ לא הצלחנו לבטל. בדקו חיבור'); });
  t.append(text, btn); document.body.appendChild(t); twUndoEl = t;
  setTimeout(() => { t.remove(); if(twUndoEl === t) twUndoEl = null; }, /שימו לב/.test(msg) ? 12000 : 9000);
}
// two shifts of one person (Guy 19.11): never two that overlap or come one right after the other ("a double in a row"); the three close
// pairs (morning and night the same day, afternoon and the next morning, night and the next afternoon) only if she agreed to that pair in
// her settings (tw_pref.combos); then they are allowed, with a warning to the builder when the rest is short.
// -> 'block' | 'close' (allowed, short rest) | ''
const TW_COMBO = { MN:'בוקר ולילה באותו יום', AM:'צהריים, ולמחרת בוקר', NA:'לילה, ולמחרת צהריים' };
function twCombo(d1, s1, d2, s2){
  const [a, sa, b, sb] = twSpan(d1, s1)[0] <= twSpan(d2, s2)[0] ? [d1, s1, d2, s2] : [d2, s2, d1, s1];
  if(a === b && sa === 'M' && sb === 'N') return 'MN';
  if(addDays(a, 1) === b && sa === 'A' && sb === 'M') return 'AM';
  if(addDays(a, 1) === b && sa === 'N' && sb === 'A') return 'NA';
  return null;
}
const twPrefOf = pid => (TW.prefs || []).find(p => p.person === pid) || null;
const twAgrees = (pid, combo) => { const p = twPrefOf(pid); return !!(p && (p.combos || []).includes(combo)); };
const twRest = () => { const r = (TW.settings || []).find(x => x.key === 'rest_hours'); return Number(r && r.value) || 8; };
function twPair(pid, d1, s1, d2, s2, a1, a2){
  if(d1 === d2 && s1 === s2) return 'block';
  const x = twSpan(d1, s1, a1), y = twSpan(d2, s2, a2), gap = x[0] <= y[0] ? y[0] - x[1] : x[0] - y[1];
  if(gap <= 0) return 'block';
  const combo = twCombo(d1, s1, d2, s2);
  if(combo) return pid && twAgrees(pid, combo) ? 'close' : 'block';
  // short rest outside the three pairs (for example a night on Thursday and then the long Friday shift: Guy 20.11, "המערכת לא תשבץ את זה
  // אוטומטית, כברירת מחדל"): there is nothing to agree to, so the engine never does it (by hand: allowed with a warning, twHandPair)
  return gap < twRest() * 60 ? 'block' : '';
}
function twClash(d1, s1, d2, s2, pid){ return twPair(pid, d1, s1, d2, s2) === 'block'; }
// a placement BY HAND (Guy 20.11, ג1, correcting 19.11: "חפיפה בשעות מותרת, עם אזהרה ורק ידנית" — morning and afternoon overlap by
// half an hour, and a builder must be able to put one person in both): EVERYTHING is allowed by hand, with a warning in "דורש תשומת לב":
// overlapping hours, a double in a row, a close pair she did not agree to, short rest. (The engine keeps twPair and never does these.)
// -> 'overlap' | 'row' | 'combo' | 'short' | ''
function twHandPair(pid, d1, s1, d2, s2, a1, a2){
  if(d1 === d2 && s1 === s2) return 'overlap';
  const x = twSpan(d1, s1, a1), y = twSpan(d2, s2, a2), gap = x[0] <= y[0] ? y[0] - x[1] : x[0] - y[1];
  if(gap < 0) return 'overlap';
  if(gap === 0) return 'row';
  const combo = twCombo(d1, s1, d2, s2);
  if(combo && !twAgrees(pid, combo)) return 'combo';
  return gap < twRest() * 60 ? 'short' : '';
}
const TW_HAND_RANK = { overlap:4, row:3, combo:2, short:1, '':0 };
const twHandWord = k => ({ overlap:'משמרת כפולה (חופפת בשעות למשמרת אחרת שלה)', row:'משמרת כפולה (ברצף, בלי הפסקה)', combo:'צירוף שלא סומן בהגדרות שלה', short:`פחות מ-${twRest()} שעות מנוחה` })[k] || '';

// ---- may this person see the module at all? (asked once after the sign-in; the home card appears when the answer is yes)
function twCardHtml(){
  if(typeof liveCut === 'function' && liveCut()) return '';          // (the test site only, until the pilot's own site is up)
  if(!document.body.classList.contains('product-shibutz')) return '';          // (the pilot has its own site now: no card in the first site, its test copy too — Guy 22.11)
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
  const [pe, pr, fx, se] = await Promise.all([sbPersonal.from('tw_people').select('*').order('sort').order('name'), sbPersonal.from('tw_period').select('*').order('start', { ascending:false }).limit(8), sbPersonal.from('tw_fixed').select('*'), sbPersonal.from('tw_settings').select('*')]);
  if(pe.error || pr.error){ TW.allowed = false; return false; }          // (before scheduling-v75.sql, or no right: no module)
  TW.people = pe.data || []; TW.periods = pr.data || []; TW.fixed = fx.error ? [] : (fx.data || []); TW.settings = se.error ? [] : (se.data || []);
  // the holidays (scheduling-v83.sql) and each person's own settings (scheduling-v86.sql); a database before them: none, and all works as before
  const [ho, pf] = await Promise.all([sbPersonal.from('tw_holiday').select('day,kind').gte('day', addDays(twToday(), -60)).lte('day', addDays(twToday(), 400)),
    sbPersonal.from('tw_pref').select('*')]);
  TW.holidays = {}; if(!ho.error) (ho.data || []).forEach(h => { TW.holidays[h.day] = h.kind; });
  TW.prefs = pf.error ? [] : (pf.data || []); TW.prefsOn = !pf.error;
  // phones (scheduling-v86.sql): the database gives them only to the admin and whoever builds a schedule now, and to each person her own
  TW.phones = {}; if(TW.prefsOn){ const ph = await sbPersonal.from('tw_phone').select('person,phone'); if(!ph.error) (ph.data || []).forEach(x => { TW.phones[x.person] = x.phone; }); }
  TW.me = TW.people.find(p => p.active && p.staff_id && p.staff_id === srv.me) || null;
  TW.boss = !!((srv.profile && srv.profile.admin) || (srv.meRow && (srv.meRow.role === 'coordinator' || srv.meRow.admin)));
  TW.allowed = TW.boss || !!TW.me;
  TW.realBoss = TW.boss; TW.viewAs = null;
  if(typeof twViewAsApply === 'function') twViewAsApply();          // (the test site only: an admin sees the screens as one of the staff)
  if(TW.allowed && !TW.autoDone){          // (the next two weeks open by themselves when they are due: scheduling-v79.sql)
    TW.autoDone = true;
    try { const r = await sbPersonal.rpc('tw_auto_open'); if(!r.error && r.data && !TW.periods.some(p => p.start === r.data)){ const pr2 = await sbPersonal.from('tw_period').select('*').order('start', { ascending:false }).limit(8); if(!pr2.error) TW.periods = pr2.data || []; } } catch(e){}
  }
  try { await twLoadAdmin(); } catch(e){}
  if(!TW.period || !TW.periods.some(p => p.start === TW.period)){
    // first the two weeks of today when they are published (the UX review 2026-11-19: a worker opened on the next two weeks and missed
    // her shift of this Saturday); the builder of open two weeks still lands on them; then the first open ones; then the newest
    const today = twToday(), now = TW.periods.find(p => p.start <= today && addDays(p.start, 13) >= today && p.status === 'published');
    const open = TW.periods.filter(p => p.status === 'open').sort((a, b) => a.start < b.start ? -1 : 1)[0];
    const pick = now && !(open && twBuilderNow()) ? now : (open || now);
    TW.period = (pick || TW.periods[0] || {}).start || null;
  }
  return TW.allowed;
}
async function twLoadPeriod(){
  TW.options = []; TW.subs = []; TW.asg = []; TW.others = []; TW.pub = null;
  if(!TW.period) return;
  const [o, s, a, ot] = await Promise.all([sbPersonal.from('tw_option').select('*').eq('period', TW.period), sbPersonal.from('tw_submission').select('*').eq('period', TW.period), sbPersonal.from('tw_assignment').select('*').eq('period', TW.period), sbPersonal.from('tw_other').select('*').eq('period', TW.period)]);
  TW.options = o.error ? [] : (o.data || []); TW.subs = s.error ? [] : (s.data || []); TW.asg = a.error ? [] : (a.data || []); TW.others = ot.error ? [] : (ot.data || []);
  if(typeof twPendingLoad === 'function') await twPendingLoad();
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
  if(!TW.tab) TW.tab = TW.me ? ((twPeriodRow() || {}).status === 'published' ? 'sched' : 'mine') : 'sched';
  if(TW.tab === 'mine') await twToOpenPeriod();
  TW.as = null; TW.week = 0;
  twRender();
}
function twTabs(){
  const t = [['sched', 'הסידור']];
  if(TW.me || twIsBuilder()) t.push(['mine', 'העדפות']);
  if(TW.me || TW.boss) t.push(['swaps', 'החלפות'], ['inbox', 'הודעות']);
  if(TW.boss) t.push(['team', 'ניהול']);
  // building is not a tab of its own (Guy 2026-11-14): a card at the top of "הסידור" opens it, and it belongs to that tab
  if(TW.tab === 'build' && !twIsBuilder()) TW.tab = 'sched';
  if(TW.tab !== 'build' && !t.some(x => x[0] === TW.tab)) TW.tab = t[0][0];
  const cur = TW.tab === 'build' ? 'sched' : TW.tab;
  return `<div class="tw-tabs" role="tablist">${t.map(([k, l]) => `<button type="button" role="tab" class="tw-tab${cur === k ? ' on' : ''}" data-tw-tab="${k}" aria-selected="${cur === k}">${l}${twTabCount(k)}</button>`).join('')}</div>`;
}
// a table wider than the phone: a fade at the hidden edge and "עוד ימים", until it was scrolled to its end (the UX review 2026-11-19:
// Thursday to Saturday were hidden with nothing that said so)
function twScrollHints(box){
  box.querySelectorAll('.tw-scroll').forEach(sc => {
    const wk = sc.closest('.tw-week'); if(!wk) return;
    const upd = () => { const more = sc.scrollWidth - sc.clientWidth > 4 && Math.abs(sc.scrollLeft) + sc.clientWidth < sc.scrollWidth - 4; wk.classList.toggle('tw-more', more); };
    sc.addEventListener('scroll', upd, { passive:true }); requestAnimationFrame(upd);
  });
}
function twRender(){
  const box = document.getElementById('tw-screen'); if(!box) return;
  const tabs = twTabs();
  let inner = '';
  const allPeriods = TW.tab === 'team' || TW.tab === 'swaps' || TW.tab === 'inbox';
  if(!TW.period && !allPeriods) inner = `<div class="pnote">עדיין לא נפתחו שבועיים להגשה.${TW.boss ? ' אפשר לפתוח בלשונית "ניהול".' : ''}</div>`;
  else if(TW.tab === 'mine') inner = twMineHtml();
  else if(TW.tab === 'sched') inner = twSchedHtml();
  else if(TW.tab === 'build') inner = twBuildHtml();
  else if(TW.tab === 'team') inner = twTeamHtml();
  else if(TW.tab === 'swaps') inner = twSwapsHtml();
  else if(TW.tab === 'inbox') inner = twInboxHtml();
  // (Guy 21–23.11: no choice of two weeks at the top, for anybody: "העדפות" shows the two weeks open for hand-in, "הסידור" goes week by week
  // over what was published, "רכזת" shows the latest schedule built, and the card "בניית הסידור" opens the two weeks in building)
  // (Guy 22.11: "דיווח על תקלה" small at the bottom of every screen of the staff, as in the first site, instead of a part of the settings)
  const problem = (TW.me || TW.boss) && typeof twProblemSheet === 'function' ? '<button type="button" class="portal-problem" id="tw-problem-link">משהו לא עובד? דיווח על תקלה</button>' : '';
  box.innerHTML = (typeof twViewAsBar === 'function' ? twViewAsBar() : '') + tabs + inner + problem;
  TW.cameFromBoard = TW.tab === 'build' ? TW.cameFromBoard : !!TW.board;
  const pl = box.querySelector('#tw-problem-link'); if(pl) pl.addEventListener('click', () => twProblemSheet());
  box.querySelectorAll('[data-tw-tab]').forEach(b => b.addEventListener('click', async () => { if(b.dataset.twTab === TW.tab && !TW.board) return; TW.board = false; if(b.dataset.twTab === 'mine'){ TW.as = null; await twToOpenPeriod(); } else if(b.dataset.twTab === 'sched') await twToSchedPeriod(); twGo(() => { TW.tab = b.dataset.twTab; TW.full = false; TW.step = null; }); }));
  // the card "בניית הסידור" and "מי הגישה" in "רכזת" open the building of their own two weeks
  box.querySelectorAll('[data-tw-open-build]').forEach(b => b.addEventListener('click', async () => { const st = b.dataset.twOpenBuild; if(st && st !== TW.period){ b.disabled = true; TW.period = st; TW.week = 0; await twLoadPeriod(); } twGo(() => { TW.tab = 'build'; TW.board = false; TW.step = null; }); }));
  box.querySelectorAll('[data-tw-back-sched]').forEach(b => b.addEventListener('click', async () => { const back = TW.tab === 'build' && TW.cameFromBoard; b.disabled = true; if(back) await twEnterBoard(); else await twToSchedPeriod(); twGo(() => { TW.tab = 'sched'; TW.board = !!back; TW.step = null; }); }));
  if(typeof twViewAsWire === 'function') twViewAsWire(box);
  twScrollHints(box);
  const shell = box.closest('.portal-shell'); if(shell) shell.dataset.twTab = TW.tab || '';          // (the install link: only under "הסידור")
  if(TW.tab === 'mine') twMineWire(box); else if(TW.tab === 'sched') twSchedWire(box); else if(TW.tab === 'build') twBuildWire(box); else if(TW.tab === 'team') twTeamWire(box); else if(TW.tab === 'swaps') twSwapsWire(box); else if(TW.tab === 'inbox') twInboxWire(box);
}

// ---- 1. the preferences (Guy 2026-11-14: one way only, no colours)
// Week after week on a phone (both weeks side by side on a computer). A tap on a shift goes כן -> יכול -> לא, and the word is written in the
// cell; a shift that was not touched is "לא". Every tap is saved at once; "הגשה" at the end tells the builder that the person is done, and
// the marks may still be changed until the hand-in closes. "שעות אחרות" (hours of one's own on a day) is in the bar at the bottom.
// The least to open is twice the shifts, counted over the two weeks together: כן and יכול count (the long weekend shift as two), other hours
// only from six hours. Below it a note appears; handing in is still allowed.
const TW_LV_WORD = { yes:'כן', can:'אפשרי', no:'לא' };
const TW_OTHER_MIN = 6;
// filling in for another one (Guy 23.11): whoever builds these two weeks and the system admins, until the schedule is published
const twFillOk = () => { const p = twPeriodRow(); return !!p && p.status !== 'published' && twIsBuilder(); };
function twWhose(){ return (twFillOk() && twPerson(TW.as)) || TW.me || (twFillOk() ? TW.people.filter(p => p.active)[0] : null) || null; }
const twLvl = (personId, day, shift) => { const o = TW.options.find(x => x.person === personId && x.day === day && x.shift === shift); return o ? (o.level || 'yes') : 'no'; };
const twOtherOf = (personId, day) => (TW.others || []).find(x => x.person === personId && x.day === day) || null;
const twHm = t => String(t || '').slice(0, 5);
function twOtherHours(o){
  const [h1, m1] = twHm(o.from_time).split(':').map(Number), [h2, m2] = twHm(o.to_time).split(':').map(Number);
  let min = (h2 * 60 + m2) - (h1 * 60 + m1);
  if(min <= 0) min += 24 * 60;
  return min / 60;
}
// how much a person opened against the least that is asked, over the two weeks (the weekend shift counts one: Guy 19.11)
function twCount(person){
  const days = twDays(TW.period), fixedW = [0, 0], kinds = { M:0, A:0, N:0, W:0 }, list = [];
  days.forEach(day => twSlots(day).forEach(sl => { if(twIsFixed(person.id, day, sl.shift)) fixedW[twWeekOf(TW.period, day)] += sl.w; }));
  const need = fixedW.reduce((n, f) => n + Math.max(0, person.per_week - f) * 2, 0);
  let have = 0, yes = 0, can = 0, other = 0;
  TW.options.forEach(o => {
    if(o.person !== person.id || days.indexOf(o.day) < 0 || twIsFixed(person.id, o.day, o.shift) || !twSlots(o.day).some(s => s.shift === o.shift)) return;
    have += 1; kinds[o.shift]++; list.push([o.day, o.shift]);
    if((o.level || 'yes') === 'can') can++; else yes++;
  });
  (TW.others || []).forEach(o => { if(o.person === person.id && days.indexOf(o.day) >= 0 && twOtherHours(o) >= TW_OTHER_MIN){ have++; other++; } });
  let clash = 0; const pairs = [];
  list.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++) if(twClash(list[i][0], list[i][1], list[j][0], list[j][1], person.id)){ clash++; pairs.push([list[i], list[j]]); }
  return { need, have, yes, can, other, kinds, clash, pairs, fixed:fixedW[0] + fixedW[1], ok:have >= need, weeks:[twWeekCount(person, 0, fixedW[0]), twWeekCount(person, 1, fixedW[1])] };
}
// one week of the hand-in (Guy 19.11): twice the weekly shifts; with 3 a week also the mix (an afternoon at least, and two nights);
// "eff" = how many of the opened shifts can really be placed together, after the pairs she cannot do (a double in a row, a close pair she
// did not agree to) — the biggest set of opened shifts with no such pair between them
const TW_MIX = { 3:{ d:0, a:1, n:2 }, 4:{ d:6, a:1, n:2 }, 5:{ d:7, a:2, n:3 } };
function twWeekCount(person, w, fixed){
  const days = twDays(TW.period).slice(w * 7, w * 7 + 7), list = [];
  TW.options.forEach(o => { if(o.person === person.id && days.indexOf(o.day) >= 0 && !twIsFixed(person.id, o.day, o.shift) && twSlots(o.day).some(s => s.shift === o.shift)) list.push([o.day, o.shift]); });
  const others = (TW.others || []).filter(o => o.person === person.id && days.indexOf(o.day) >= 0 && twOtherHours(o) >= TW_OTHER_MIN).length;
  const need = Math.max(0, person.per_week - (fixed || 0)) * 2, have = list.length + others;
  const nights = list.filter(x => x[1] === 'N').length, afternoons = list.filter(x => x[1] === 'A').length;
  const rule = !fixed && TW_MIX[person.per_week], mix = !!rule, dayN = list.filter(x => x[1] !== 'N').length + others;
  const pairs = [];
  for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++) if(twClash(list[i][0], list[i][1], list[j][0], list[j][1], person.id)) pairs.push([list[i], list[j]]);
  let eff = list.length;
  if(pairs.length){
    const n = list.length, bad = list.map(() => 0);
    pairs.forEach(([x, y]) => { const i = list.indexOf(x), j = list.indexOf(y); bad[i] |= 1 << j; bad[j] |= 1 << i; });
    if(n <= 18){ eff = 0; for(let m = 0; m < (1 << n); m++){ let ok = true, c = 0; for(let i = 0; i < n && ok; i++) if(m & (1 << i)){ c++; if(bad[i] & m) ok = false; } if(ok && c > eff) eff = c; } }
    else { const used = []; list.forEach((x, i) => { if(!used.some(j => bad[i] & (1 << j))) used.push(i); }); eff = used.length; }
    eff += others;
  }
  const place = Math.max(0, person.per_week - (fixed || 0));          // (the shifts she is placed in this week: half of what she opens)
  return { need, have, eff, place, short:!!pairs.length && eff < place && eff < have, nights, afternoons, days:dayN, mix, rule, pairs, okMix:!mix || (nights >= rule.n && afternoons >= rule.a && dayN >= rule.d) };
}
// the egg of this person for these two weeks: it grows with what was opened and hatches when the preferences are handed in
function twEggHtml(person, c, submitted){
  if(typeof pwEggHtml !== 'function') return '';
  let h = 0;
  String(person.id + TW.period).split('').forEach(ch => { h = (h * 31 + ch.charCodeAt(0)) >>> 0; });
  const stage = submitted ? 7 : Math.min(6, Math.floor((c.need ? Math.min(1, c.have / c.need) : 1) * 6));
  return `<span class="tw-egg">${pwEggHtml(stage, PW_EGG_NAMES[h % PW_EGG_NAMES.length])}</span>`;
}
// "העדפות" is about the two weeks that are open for hand-in (Rita 19.11: it opened on the published ones, with "open 8 more")
async function twToOpenPeriod(){
  const cur = twPeriodRow(), open = TW.periods.filter(p => p.status === 'open' && (!p.deadline || new Date(p.deadline) > new Date())).sort((a, b) => a.start < b.start ? -1 : 1)[0];
  if(cur && open && cur.start === open.start) return;
  // (Guy 22.11) nothing open: her preferences of the last hand-in, the latest two weeks, for reading; (23.11) the builder too, and while
  // those two weeks are not published she may still fill in for another one
  const last = !open && TW.me ? TW.periods.slice().sort((a, b) => a.start < b.start ? 1 : -1)[0] : !open && TW.boss ? TW.periods.slice().sort((a, b) => a.start < b.start ? 1 : -1)[0] : null;
  const to = open || last;
  if(!to || (cur && cur.start === to.start)) return;
  TW.period = to.start; TW.week = 0; await twLoadPeriod();
}
// "הסידור" for one of the staff is about the published two weeks of today, not the open ones she just marked (check 2026-11-20:
// after "העדפות" she came back to an empty "not published yet" screen)
async function twToSchedPeriod(){
  const cur = twPeriodRow(); if(cur && cur.status === 'published' && cur.start <= twToday() && twEnd(cur) >= twToday()) return;
  const today = twToday(), pub = TW.periods.filter(p => p.status === 'published').sort((a, b) => a.start < b.start ? 1 : -1);
  const now = pub.find(p => p.start <= today && addDays(p.start, 13) >= today) || pub[0];
  if(!now) return;
  TW.period = now.start; TW.week = 0; await twLoadPeriod();
}
function twCanMark(person){ return twFillOk() || (!!TW.me && person.id === TW.me.id && twOpenNow()); }
// until when the hand-in is open (the review agents: the staff did not see it anywhere); stronger in the last two days
function twDeadlineHtml(){
  const p = twPeriodRow(); if(!p || p.status !== 'open' || !p.deadline) return '';
  const d = new Date(p.deadline); if(d <= new Date()) return '';
  const day = DOW_NAMES[d.getDay()], dm = d.getDate() + '/' + (d.getMonth() + 1), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const soon = d - new Date() < 2 * 86400000;
  // closing in the small hours (Guy 20.11: "למחרת בבוקר 5 בבוקר"): said as the end of the day before, so nobody thinks of the wrong day
  if(d.getHours() < 6){ const e = new Date(d.getTime() - 86400000);
    return `<div class="pstatus ${soon ? 'bad' : 'ok'} tw-deadline">אפשר להגיש ולשנות עד סוף יום ${DOW_NAMES[e.getDay()]} ${e.getDate() + '/' + (e.getMonth() + 1)} (בלילה, עד ${twL(hm)})</div>`; }
  return `<div class="pstatus ${soon ? 'bad' : 'ok'} tw-deadline">אפשר להגיש ולשנות עד יום ${day} ${dm} בשעה ${twL(hm)}</div>`;
}
// the short help of the preferences: open the first time, then folded under "איך מסמנים?"
function twHelpSeen(){
  if(TW.helpOpen === undefined){ let s = false; try { s = !!localStorage.getItem('mercury-tw-help-seen'); localStorage.setItem('mercury-tw-help-seen', '1'); } catch(e){} TW.helpOpen = !s; }
  return !TW.helpOpen;
}
function twMineHtml(){
  const person = twWhose();
  if(!person) return '<div class="pnote">אין שורה ברשימת הצוות של הסידור הדו-שבועי.</div>';
  const c = twCount(person), can = twCanMark(person), sub = TW.subs.find(s => s.person === person.id), days = twDays(TW.period);
  if(TW.week !== 0 && TW.week !== 1) TW.week = 0;
  if(TW.cal === undefined){ try { TW.cal = !!localStorage.getItem('mercury-tw-cal'); } catch(e){ TW.cal = false; } }
  // (Guy 23.11) her own preferences first; "מילוי בשביל מדריכה אחרת" opens the list of names, until the schedule is published
  const other = !TW.me || person.id !== TW.me.id;
  const pick = !twFillOk() ? '' : other
    ? `<div class="pstatus bad tw-for"><span>ממלאים בשם: <b>${twU(person.name)}</b>. כל הקשה נשמרת בהעדפות של ${twU(person.name)}.</span><span class="tw-btns"><button type="button" class="btn small" id="tw-fill-other">מדריכה אחרת</button>${TW.me ? '<button type="button" class="btn ghost small" id="tw-fill-me">חזרה להעדפות שלי</button>' : ''}</span></div>`
    : '<div class="tw-actions tw-fill-row"><button type="button" class="btn ghost" id="tw-fill-other">מילוי בשביל מדריכה אחרת</button></div>';
  // (Guy 21.11: less text in a cell: the kind of shift in the middle and the mark small under it; the hours once, above the kind,
  // and in a cell only where they differ from the usual ones of that kind, as on Friday)
  const usual = {}; days.forEach(d => { if(twKind(d) === 'weekday') twSlots(d).forEach(s => { if(!usual[s.shift]) usual[s.shift] = s.hours; }); });
  const odd = s => s.hours && s.hours !== usual[s.shift] ? `<small class="tw-ph">${twL(s.hours)}</small>` : '';
  const cell = (day, s, span) => {
    if(twIsFixed(person.id, day, s.shift)) return `<div class="tw-pref fixed"${span ? ' style="grid-column:span 2"' : ''}><b>${TW_SHIFT[s.shift]}</b><small>קבועה</small>${odd(s)}</div>`;
    const lv = twLvl(person.id, day, s.shift);
    return `<button type="button" class="tw-pref" data-lv="${lv}" data-tw-pref="${twKey(day, s.shift)}"${span ? ' style="grid-column:span 2"' : ''}${can ? '' : ' disabled'} aria-label="${DOW_NAMES[dowOf(day)]} ${twShort(day)}, ${TW_SHIFT[s.shift]}: ${TW_LV_WORD[lv]}">
      <b>${TW_SHIFT[s.shift]}</b><small class="tw-plv">${TW_LV_WORD[lv]}</small>${odd(s)}</button>`;
  };
  const hoursHead = `<div class="tw-phours" aria-hidden="true"><span></span><div>${TW_ROWS.map(k => `<span><b>${TW_SHIFT[k]}</b>${usual[k] ? `<small>${twL(usual[k])}</small>` : ''}</span>`).join('')}</div></div>`;
  const dayWord = day => `<i class="tw-dl">${DOW_NAMES[dowOf(day)]}</i><i class="tw-ds" aria-hidden="true">${'אבגדהוש'[dowOf(day)]}׳</i>`;          // (the short name: the calendar view with big text on a phone)
  const dayBtn = (day, cls) => can ? `<button type="button" class="${cls} tw-day-btn" data-tw-day="${day}" aria-label="${DOW_NAMES[dowOf(day)]} ${twShort(day)}: כל המשמרות של היום">${dayWord(day)} <span>${twShort(day)}</span></button>`
    : `<div class="${cls}" aria-label="${DOW_NAMES[dowOf(day)]} ${twShort(day)}">${dayWord(day)} <span>${twShort(day)}</span></div>`;
  // the calendar view: the two weeks one under the other, the days side by side (Sunday on the right), a row per kind of shift
  const mini = (day, s, rows) => {
    const st = rows ? ` style="grid-row:span ${rows}"` : '';
    if(twIsFixed(person.id, day, s.shift)) return `<div class="tw-pref mini fixed"${st}><b>${TW_SHIFT[s.shift]}</b><small>קבועה</small></div>`;
    const lv = twLvl(person.id, day, s.shift);
    return `<button type="button" class="tw-pref mini" data-lv="${lv}" data-tw-pref="${twKey(day, s.shift)}"${st}${can ? '' : ' disabled'} aria-label="${DOW_NAMES[dowOf(day)]} ${twShort(day)}, ${TW_SHIFT[s.shift]}: ${TW_LV_WORD[lv]}"><b>${TW_SHIFT[s.shift]}</b><small class="tw-plv">${TW_LV_WORD[lv]}</small></button>`;
  };
  const calWeek = w => {
    const wd = days.slice(w * 7, w * 7 + 7), others = wd.map(d => [d, twOtherOf(person.id, d)]).filter(x => x[1]);
    const row = k => `<div class="tw-cal-kind"><b>${TW_SHIFT[k]}</b>${usual[k] ? `<small>${twL(usual[k])}</small>` : ''}</div>` + wd.map(day => {
      const by = {}; twSlots(day).forEach(s => { by[s.shift] = s; });
      if(by.W) return k === 'M' ? mini(day, by.M) : k === 'A' ? mini(day, by.W, 2) : '';
      if(!by.M && !by.A && twSlots(addDays(day, -1)).some(s => s.shift === 'W')) return k === 'M' ? '<div class="tw-pref-cont mini" style="grid-row:span 2">המשך סוף שבוע</div>' : k === 'A' ? '' : by.N ? mini(day, by.N) : '<span class="tw-pref-none"></span>';
      return by[k] ? mini(day, by[k]) : '<span class="tw-pref-none"></span>';
    }).join('');
    return `<section class="tw-pweek cur"><h3>שבוע ${w + 1} מתוך 2 <span class="tw-wk-range">${twL(twShort(wd[0]) + '–' + twShort(wd[6]))}</span></h3>
      <div class="tw-cal"><span></span>${wd.map(d => dayBtn(d, 'tw-cal-day')).join('')}${TW_ROWS.map(row).join('')}</div>
      ${others.map(([d, o]) => `<div class="tw-pother">${DOW_NAMES[dowOf(d)]} ${twShort(d)}, שעות אחרות: <b>${twL(twHm(o.from_time) + '–' + twHm(o.to_time))}</b>${twOtherHours(o) < TW_OTHER_MIN ? ` <small>(פחות מ-${TW_OTHER_MIN} שעות, לא נספר)</small>` : ''}${can ? ` <button type="button" class="tw-x" data-tw-other-del="${d}" aria-label="הסרת השעות האחרות של יום ${DOW_NAMES[dowOf(d)]}">✕</button>` : ''}</div>`).join('')}</section>`;
  };
  const dayRow = day => {
    const sl = twSlots(day), by = {}, o = twOtherOf(person.id, day);
    sl.forEach(s => { by[s.shift] = s; });
    const goesOn = !by.M && !by.A && twSlots(addDays(day, -1)).some(s => s.shift === 'W');
    const cells = by.W ? cell(day, by.M) + cell(day, by.W, true) : goesOn ? `<div class="tw-pref-cont" style="grid-column:span 2">סוף שבוע · נמשך משישי</div>${by.N ? cell(day, by.N) : ''}` : TW_ROWS.map(k => by[k] ? cell(day, by[k]) : '<span class="tw-pref-none"></span>').join('');
    const off = ((twPrefOf(person.id) || {}).days_off || []).includes(dowOf(day)), offMarked = off && sl.some(s => twLvl(person.id, day, s.shift) !== 'no');
    return `<div class="tw-pday${off ? ' tw-off' : ''}">${dayBtn(day, 'tw-day-name')}<div class="tw-pday-slots">${cells}</div>
      ${off ? `<div class="tw-pother">${offMarked ? '<b>סימנת יום שבהגדרות כתוב שאת לא באה בו.</b> אם זה נכון השבוע, הכול בסדר.' : 'יום שבהגדרות כתוב שאת לא באה בו.'}</div>` : ''}
      ${o ? `<div class="tw-pother">שעות אחרות: <b>${twL(twHm(o.from_time) + '–' + twHm(o.to_time))}</b>${twOtherHours(o) < TW_OTHER_MIN ? ` <small>(פחות מ-${TW_OTHER_MIN} שעות, לא נספר)</small>` : ''}${can ? ` <button type="button" class="tw-x" data-tw-other-del="${day}" aria-label="הסרת השעות האחרות של יום ${DOW_NAMES[dowOf(day)]}">✕</button>` : ''}</div>` : ''}</div>`;
  };
  const week = w => `<section class="tw-pweek${TW.week === w ? ' cur' : ''}"><h3>שבוע ${w + 1} מתוך 2 <span class="tw-wk-range">${twL(twShort(days[w * 7]) + '–' + twShort(days[w * 7 + 6]))}</span></h3>
    ${hoursHead}<div class="tw-grid">${days.slice(w * 7, w * 7 + 7).map(dayRow).join('')}</div></section>`;
  // (Guy 22.11) after the hand-in closed, one of the staff sees what she handed in, for reading only: the days side by side (the calendar
  // view), without colours (the mark in words); above it that the preferences are closed and the schedule sent, and when the next hand-in opens
  if(TW.me && !can && person.id === TW.me.id){
    const p = twPeriodRow(), nextStart = addDays(p.start, 14), opens = addDays(nextStart, -Number(twSetting('open_days', 10))), today = twToday();
    const next = TW.periods.find(x => x.start === nextStart);
    const sub2 = next && next.status === 'open' ? '' : opens > today ? `ההגשה הבאה, לשבועיים ${twL(twPeriodLabel(nextStart))}, תיפתח ביום ${DOW_NAMES[dowOf(opens)]} ${twL(twShort(opens))}.` : 'ההגשה הבאה תיפתח בקרוב.';
    return `<div class="tw-ro-head"><b>ההעדפות לשבועיים ${twL(twPeriodLabel(p.start))} נסגרו, ${p.status === 'published' ? 'והסידור נשלח' : 'והסידור בבנייה'}.</b>${sub2 ? `<small>${sub2}</small>` : ''}</div>
      ${sub || c.have ? '' : '<div class="pnote">לא הגשת העדפות לשבועיים האלה.</div>'}
      <div class="tw-pweeks tw-cal-mode tw-ro">${calWeek(0)}${calWeek(1)}</div>`;
  }
  const left = Math.max(0, c.need - c.have);
  const state = (!can ? '<div class="pnote">ההגשה לשבועיים האלה סגורה.</div>'
    : sub ? `<div class="pstatus ok">הוגש ב-${new Date(sub.submitted_at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}. אפשר עדיין לשנות, כל שינוי נשמר מיד.</div>`
    // (the UX review 2026-11-19: "לא" in every cell looked like a hand-in; before the first mark it is said in words)
    : !c.have && !c.other ? '<div class="pstatus bad tw-none-yet">עוד לא סימנת אף משמרת. משמרת שלא מסמנים נשארת "לא". כל הקשה נשמרת מיד.</div>' : '') + twDeadlineHtml();
  const help = can ? `<details class="tw-help"${twHelpSeen() ? '' : ' open'}><summary>איך מסמנים?</summary><div class="pnote tw-legend">הקשה על משמרת מחליפה: <b>כן</b>, אחר כך <b>אפשרי</b>, אחר כך <b>לא</b>. הקשה על שם היום מחליפה את כל המשמרות שלו. כל הקשה נשמרת מיד.</div></details>` : '';
  const pairWord = x => `${DOW_NAMES[dowOf(x[0])]} ${twShort(x[0])} ${TW_SHIFT[x[1]]}`;
  const bar = can ? `<div class="tw-bar" role="toolbar" aria-label="פעולות ההעדפות">
      <button type="button" class="btn ghost" id="tw-other">שעות אחרות</button>
      <button type="button" class="btn" id="tw-submit">${sub ? 'הגשה מחדש' : 'הגשה'}</button></div>` : '';
  // (Guy 21.11: he found no way to week 2 and no calendar view: both are now above the table, and there also when the hand-in is closed)
  const seg = (attr, list, cur) => `<div class="tw-seg" role="group">${list.map(([v, l]) => `<button type="button" ${attr}="${v}" aria-pressed="${v === cur}"${v === cur ? ' class="on"' : ''}>${l}</button>`).join('')}</div>`;
  const views = `<div class="tw-pview">${seg('data-tw-view', [['rows', 'שורות'], ['cal', 'יומן']], TW.cal ? 'cal' : 'rows')}
    ${TW.cal ? '' : `<span class="tw-wkseg">${seg('data-tw-wk', [['0', 'שבוע 1'], ['1', 'שבוע 2']], String(TW.week))}</span>`}</div>`;
  return `${pick}
    <div class="tw-phead"><div><b class="tw-pnum">${c.have} מתוך ${c.need}</b><span>משמרות שנפתחו בשבועיים${left ? ` · חסרות ${left}` : ''}</span></div>${can ? `<span class="tw-save" role="status" aria-live="polite">${TW.saving ? 'שומר...' : TW.saved ? 'נשמר ✓' : ''}</span>` : ''}</div>
    ${can ? c.weeks.map((x, w) => twWeekLine(x, w)).join('') : ''}
    ${state}
    ${help}
    ${views}
    ${TW.cal ? `<div class="tw-pweeks tw-cal-mode">${calWeek(0)}${calWeek(1)}</div>` : `<div class="tw-pweeks">${week(0)}${week(1)}</div>`}
    ${''/* (Guy 21.11: the notes at the end are gone; the pairs are still said in "רגע לפני ההגשה") */}
    ${bar}`;
}
// one change after the other, so that quick taps reach the database in their order
// "שומר..." while taps are on their way, "נשמר ✓" when they all arrived (as srv-save-state in the big site)
function twSaveShow(){ const el = document.querySelector('#view-tw .tw-save'); if(el) el.textContent = TW.saving ? 'שומר...' : TW.saved ? 'נשמר ✓' : ''; }
function twQueue(fn){
  TW.saving = (TW.saving || 0) + 1; TW.saved = false;
  const done = ok => { TW.saving = Math.max(0, TW.saving - 1); if(!TW.saving) TW.saved = ok; twSaveShow(); };
  TW.chain = (TW.chain || Promise.resolve()).then(fn).then(r => { if(r && r.error) throw r.error; done(true); }).catch(async e => {
    console.error(e); done(false); toast('⚠ הסימון לא נשמר. בדקו חיבור ונסו שוב');
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
  if(typeof twCopyLast === 'function' && TW.me && person.id === TW.me.id) twCopyLast(person).then(ch => { if(ch) twKeepScroll(); }, () => {});
  const fo = box.querySelector('#tw-fill-other');
  if(fo) fo.addEventListener('click', () => {
    const list = TW.people.filter(p => p.active && (!TW.me || p.id !== TW.me.id));
    const sh = twSheet(`<h2>מילוי בשביל מדריכה אחרת</h2><div class="pnote">בוחרים בשביל מי למלא. ✓ = כבר הגישה.</div>
      <div class="tw-pick-list">${list.map(p => `<button type="button" class="btn ghost tw-pick-name" data-tw-for="${p.id}">${twU(twDisp(p))}${TW.subs.some(x => x.person === p.id) ? ' ✓' : ''}</button>`).join('')}</div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-tw-close>ביטול</button></div>`);
    sh.querySelectorAll('[data-tw-for]').forEach(b => b.addEventListener('click', () => { sh.remove(); TW.as = b.dataset.twFor; TW.forOk = null; TW.week = 0; twRender(); window.scrollTo(0, 0); }));
  });
  const fm = box.querySelector('#tw-fill-me'); if(fm) fm.addEventListener('click', () => { TW.as = null; TW.forOk = null; twRender(); window.scrollTo(0, 0); });
  const hp = box.querySelector('.tw-help'); if(hp) hp.addEventListener('toggle', () => { TW.helpOpen = hp.open; });
  // marking for somebody else who already handed in: asked once (the review agents 2026-11-14)
  const forOk = async () => {
    if((TW.me && person.id === TW.me.id) || TW.forOk === person.id || !TW.subs.some(s => s.person === person.id)) return true;
    const ok = await twConfirm({ title:`לשנות את ההעדפות של ${person.name}?`, text:`ההעדפות של ${person.name} כבר הוגשו. כל שינוי יישמר בהן מיד.`, ok:'כן, לשנות' });
    if(ok) TW.forOk = person.id;
    return ok;
  };
  box.querySelectorAll('[data-tw-pref]').forEach(b => b.addEventListener('click', async () => { if(!(await forOk())) return; const [day, shift] = b.dataset.twPref.split('|'); twTap(person, day, shift); twKeepScroll(); }));
  box.querySelectorAll('[data-tw-other-del]').forEach(b => b.addEventListener('click', async () => {
    if(!(await forOk())) return;
    const day = b.dataset.twOtherDel, period = TW.period;
    TW.others = (TW.others || []).filter(o => !(o.person === person.id && o.day === day));
    twQueue(() => sbPersonal.from('tw_other').delete().eq('period', period).eq('person', person.id).eq('day', day));
    twKeepScroll();
  }));
  box.querySelectorAll('[data-tw-day]').forEach(b => b.addEventListener('click', async () => { if(!(await forOk())) return; twDayTap(person, b.dataset.twDay); twKeepScroll(); }));
  const go = (id, fn) => { const b = box.querySelector(id); if(b) b.addEventListener('click', fn); };
  box.querySelectorAll('[data-tw-view]').forEach(b => b.addEventListener('click', () => { const cal = b.dataset.twView === 'cal'; if(cal === !!TW.cal) return; TW.cal = cal; try { localStorage.setItem('mercury-tw-cal', cal ? '1' : ''); } catch(e){} twKeepScroll(); }));
  box.querySelectorAll('[data-tw-wk]').forEach(b => b.addEventListener('click', () => { const w = +b.dataset.twWk; if(w === TW.week) return; TW.week = w; twKeepScroll(); }));
  go('#tw-other', async () => { if(await forOk()) twOtherSheet(person); });
  go('#tw-submit', () => twBeforeSubmit(person));
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
// one week of the hand-in, in words (Guy 19.11: twice the weekly shifts; with 3 a week an afternoon at least and two nights; Guy 20.11,
// Albert's proposal: with 4, 6 day shifts with an afternoon at least and 2 nights; with 5, 7 day shifts with 2 afternoons at least and
// 3 nights. Friday morning and the long weekend shift are day shifts, the night after Saturday is a night)
function twWeekLine(x, w){
  if(!x || !x.need) return '';
  const miss = [], left = Math.max(0, x.need - x.have), r = x.rule || {};
  if(!x.have && x.mix) return `<div class="pstatus tw-soft tw-wline">שבוע ${w + 1}: כדאי לפתוח ${x.need}${r.d ? `: ${r.d} משמרות יום, מהן ${r.a === 1 ? 'צהריים אחד' : r.a + ' צהריים'} לפחות, ו-${r.n} לילות` : `, מהן ${r.a === 1 ? 'צהריים אחד' : r.a + ' צהריים'} לפחות ו-${r.n} לילות`}</div>`;
  if(left) miss.push(left === 1 ? 'לפתוח עוד אחת' : `לפתוח עוד ${left}`);
  if(x.mix && r.d && x.days < r.d) miss.push(r.d - x.days === 1 ? 'חסרה משמרת יום אחת' : `חסרות ${r.d - x.days} משמרות יום`);
  if(x.mix && x.afternoons < r.a) miss.push(r.a === 1 ? 'חסר צהריים אחד' : r.a - x.afternoons === 1 ? `חסר צהריים אחד (לפחות ${r.a})` : `חסרים ${r.a - x.afternoons} צהריים (לפחות ${r.a})`);
  if(x.mix && x.nights < r.n) miss.push(r.n - x.nights === 1 ? 'חסר לילה אחד' : `חסרים ${r.n - x.nights} לילות`);
  if(x.short) miss.push(`בגלל משמרות צמודות אפשר לשבץ אותך בפועל רק ב-${x.eff} מתוך ${x.place} המשמרות שלך בשבוע`);
  // the main line is short, what is missing goes under it as short points (check 2026-11-20: six items in one line)
  const ok = x.mix && !miss.length ? ' · יום, צהריים ולילות ✓' : '';
  return `<div class="pstatus ${miss.length ? 'tw-soft' : 'ok'} tw-wline">שבוע ${w + 1}: פתחת <b>${x.have} מתוך ${x.need}</b>${miss.length ? '' : ok || ' ✓'}${miss.length ? `<ul class="tw-wmiss">${miss.map(m => `<li>${m}</li>`).join('')}</ul>` : ''}</div>`;
}
// before handing in (Guy 19.11): when close pairs leave fewer shifts than asked in a week, a short window says so first; she changes,
// or hands in anyway (and the builder sees it in step 1)
function twBeforeSubmit(person){
  const c = twCount(person), weeks = c.weeks.map((x, w) => ({ x, w })).filter(o => o.x && o.x.short);
  const low = c.weeks.map((x, w) => ({ x, w })).filter(o => o.x && o.x.need && o.x.have < o.x.need && !weeks.includes(o));
  if(!weeks.length && !low.length){ twSubmitSheet(person); return; }
  const pw = x => `${DOW_NAMES[dowOf(x[0])]} ${twShort(x[0])} ${TW_SHIFT[x[1]]}`;
  const why = pr => { if(twCombo(pr[0][0], pr[0][1], pr[1][0], pr[1][1])) return 'צירוף שלא סימנת בהגדרות';
    const x = twSpan(pr[0][0], pr[0][1]), y = twSpan(pr[1][0], pr[1][1]), gap = x[0] <= y[0] ? y[0] - x[1] : x[0] - y[1];
    return gap > 0 ? `פחות מ-${twRest()} שעות מנוחה ביניהן` : 'חופפות או צמודות'; };
  const pairW = pr => pr[0][0] === pr[1][0] ? `${DOW_NAMES[dowOf(pr[0][0])]} ${twShort(pr[0][0])} ${TW_SHIFT[pr[0][1]]} + ${TW_SHIFT[pr[1][1]]}` : `${pw(pr[0])} + ${pw(pr[1])}`;
  const sh = twSheet(`<h2>רגע לפני ההגשה</h2>
    ${weeks.map(o => `<p class="confirm-text">בשבוע ${o.w + 1} צריך לשבץ אותך ב-${o.x.place} משמרות, אבל <b>בגלל משמרות צמודות אפשר לשבץ אותך בפועל רק ב-${o.x.eff}</b>:</p>
      <ul class="tw-pairs">${o.x.pairs.map(pr => `<li><b>${pairW(pr)}</b>: ${why(pr)}</li>`).join('')}</ul>`).join('')}
    ${low.map(o => `<p class="confirm-text">בשבוע ${o.w + 1} פתחת ${o.x.have} מתוך ${o.x.need} שכדאי לפתוח.</p>`).join('')}
    <div class="pnote">${weeks.length ? 'מכל זוג כזה אפשר לשבץ רק אחת. ' : ''}כדי להגיע למספר, פותחים עוד משמרות. אפשר גם להגיש כך.</div>
    <div class="confirm-actions"><button type="button" class="btn" data-tw-close>לשנות</button><button type="button" class="btn ghost" id="tw-submit-anyway">להגיש בכל זאת</button></div>`);
  sh.querySelector('#tw-submit-anyway').addEventListener('click', () => { sh.remove(); TW.skipLeft = true; twSubmitSheet(person); TW.skipLeft = false; });
}
// handing in: what was opened against the least, a free note to the builder, and the button
function twSubmitSheet(person){
  const c = twCount(person), sub = TW.subs.find(s => s.person === person.id), left = Math.max(0, c.need - c.have);
  const sh = twSheet(`<h2>הגשת ההעדפות</h2>
    <div class="pnote">נפתחו ${c.have} מתוך ${c.need} משמרות בשבועיים${c.can ? ` (מהן ${c.can} "אפשרי")` : ''}${c.other ? `, כולל ${c.other === 1 ? 'יום אחד' : c.other + ' ימים'} של שעות אחרות` : ''}.</div>
    ${left && !TW.skipLeft ? `<div class="pstatus tw-soft">${left === 1 ? 'כדאי לפתוח עוד משמרת אחת' : `כדאי לפתוח עוד ${left} משמרות`} בשבועיים. אפשר להגיש בכל זאת, ומי שבונה את הסידור יראה שחסר.</div>` : ''}
    <label class="tw-note-l">הערה למי שבונה את הסידור (לא חובה)<textarea id="tw-note" rows="3" maxlength="300">${pEsc((sub && sub.note) || '')}</textarea></label><div class="pnote tw-privacy">${twT('privacy')}</div>
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
// ---- the coordinator (Guy's walk through her screens, 22–23.11): "הסידור" is the same as for all the staff, with one more button,
// "רכזת", for whoever builds now and the system admins. It opens her view: the latest schedule that was built, both weeks, the days side by
// side as in "הצוות כולו", fixed by tapping a box or by dragging names from a folded list next to it (as the coordinator of the first site),
// with "שיתוף תמונת הסידור" and "שליחת עדכונים". The card "בניית הסידור" shows only from the end of the hand-in until the schedule is published.
const twEnd = p => addDays(p.start, 13);
const twMayBuild = start => TW.boss || (!!TW.me && TW.periods.some(p => p.start === start && p.builder === TW.me.id));
const twCoordOk = () => TW.boss || (!!TW.me && TW.periods.some(p => p.builder === TW.me.id && twEnd(p) >= twToday()));
const twClosedNow = p => p.status === 'built' || (p.status === 'open' && !!p.deadline && new Date(p.deadline) <= new Date());
// the two weeks in building: the hand-in closed and they are not published yet
function twBuildPer(){ const today = twToday(); return TW.periods.filter(p => twClosedNow(p) && twEnd(p) >= today && twMayBuild(p.start)).sort((a, b) => a.start < b.start ? -1 : 1)[0] || null; }
// what the coordinator's view shows: the schedules built or published that are not over, the latest first
function twBoardPers(){ const today = twToday(); return TW.periods.filter(p => (p.status === 'built' || p.status === 'published') && twEnd(p) >= today && twMayBuild(p.start)).sort((a, b) => a.start < b.start ? 1 : -1); }
function twOpenPer(){ return TW.periods.filter(p => p.status === 'open' && (!p.deadline || new Date(p.deadline) > new Date()) && twMayBuild(p.start)).sort((a, b) => a.start < b.start ? -1 : 1)[0] || null; }
function twBuildCardHtml(){
  const p = twBuildPer(); if(!p) return '';
  const step = p.status === 'built' ? 3 : 1, mine = TW.me && p.builder === TW.me.id;
  return `<button type="button" class="tw-build-card" data-tw-open-build="${p.start}"><span class="tw-build-card-t">${mine ? 'הפעם הסידור אצלך' : 'בניית הסידור'} · ${twL(twPeriodLabel(p.start))}</span>
    <span class="tw-build-card-s">ההגשה נסגרה · צעד ${step} מתוך 4: ${TW_STEPS[step - 1]}</span><span class="tw-build-card-go" aria-hidden="true">←</span></button>`;
}
// what she marked for this shift, for the colours of the board (as the first site): yes, can, no, or nothing marked at all in these two weeks
function twLvlOf(pid, day, sh){
  if(twIsFixed(pid, day, sh)) return 'yes';
  const o = TW.options.find(x => x.person === pid && x.day === day && x.shift === sh);
  if(o) return o.level === 'can' ? 'can' : 'yes';
  return TW.options.some(x => x.person === pid) || TW.subs.some(s => s.person === pid) ? 'no' : 'none';
}
const TW_LV4 = [['yes', 'כן'], ['can', 'יכול'], ['no', 'לא'], ['none', 'לא סומן']];
const twLv4Key = cls => `<span class="tw-lv4 ${cls || ''}">${TW_LV4.map(([k, w]) => `<span class="tw-lv4-w" data-lv="${k}">${w}</span>`).join('')}</span>`;
// one week, the days side by side (Sunday on the right) and a row per kind of shift; the long weekend shift is one block (on Friday over the
// afternoon and the night, on Saturday it goes on over the morning and the afternoon). o.edit: the coordinator's board — every box opens its
// window and takes a dragged name; the names are coloured by what each one marked and can be dragged to another box
function twWeekGrid(wd, by, o){
  o = o || {};
  const today = twToday();
  const usual = {}; wd.forEach(d => { if(twKind(d) === 'weekday') twSlots(d).forEach(s => { if(!usual[s.shift]) usual[s.shift] = s.hours; }); });
  const nm = (a, day, sh) => { const lv = o.edit ? twLvlOf(a.person, day, sh) : '';
    if(o.ask && TW.me && a.person === TW.me.id && a.day >= today && !TW.socialOff && !(TW.swaps || []).some(s => s.assignment === a.id && (s.status === 'open' || s.status === 'taken')))
      return `<button type="button" class="tw-tc-name me" data-tw-ask="${a.id}" title="בקשת החלפה">${twU(twName(a.person))}${a.from_time && a.to_time ? `<small>${twL(twHm(a.from_time) + '–' + twHm(a.to_time))}</small>` : ''}</button>`;
    return `<span class="tw-tc-name${!o.edit && TW.me && a.person === TW.me.id ? ' me' : ''}${o.sel && o.sel === a.person ? ' sel' : ''}"${lv ? ` data-lv="${lv}"` : ''}${o.edit && a.id ? ` draggable="true" data-tw-row="${a.id}"` : ''}>${o.edit && a.fixed ? '📌 ' : ''}${twU(twName(a.person))}${o.edit && a.ok ? ' ✓' : ''}${a.from_time && a.to_time ? `<small>${twL(twHm(a.from_time) + '–' + twHm(a.to_time))}</small>` : ''}</span>`; };
  const names = (day, sh, need) => { const list = (by[twKey(day, sh)] || []).slice().sort((a, b) => twName(a.person).localeCompare(twName(b.person), 'he')), miss = Math.max(0, (need || 0) - list.length);
    return list.map(a => nm(a, day, sh)).join('') + (miss ? `<span class="tw-tc-miss">חסר ${miss}</span>` : ''); };
  const box = (day, sh) => o.edit ? ` data-tw-cell="${twKey(day, sh)}" tabindex="0" role="button" aria-label="${DOW_NAMES[dowOf(day)]} ${twShort(day)}, ${TW_SHIFT[sh]}: עריכה"` : '';
  let cells = `<div class="tw-tc-corner" style="grid-column:1;grid-row:1"></div>`;
  wd.forEach((d, i) => { cells += `<div class="tw-tc-head${d === today ? ' today' : ''}${[5, 6].includes(dowOf(d)) ? ' weekend' : ''}" style="grid-column:${i + 2};grid-row:1"><b>${'אבגדהוש'[dowOf(d)]}׳</b><small>${twShort(d)}</small></div>`; });
  TW_ROWS.forEach((k, r) => { cells += `<div class="tw-tc-lbl" style="grid-column:1;grid-row:${r + 2}"><b>${TW_SHIFT[k]}</b>${usual[k] ? `<small>${twL(usual[k])}</small>` : ''}</div>`; });
  wd.forEach((d, i) => {
    const col = i + 2, sl = {}; twSlots(d).forEach(s => { sl[s.shift] = s; });
    const cls = `tw-tc-cell${o.edit ? ' edit' : ''}${d === today ? ' today' : ''}${[5, 6].includes(dowOf(d)) ? ' weekend' : ''}`;
    const at = (row, span) => `grid-column:${col};grid-row:${row}${span ? ' / span ' + span : ''}`;
    const odd = s => s.hours && s.hours !== usual[s.shift] && s.shift !== 'W' ? `<small class="tw-tc-h">${twL(s.hours)}</small>` : '';
    if(sl.W){
      cells += sl.M ? `<div class="${cls}" style="${at(2)}"${box(d, 'M')}>${odd(sl.M)}${names(d, 'M', sl.M.need)}</div>` : `<div class="tw-tc-cell none" style="${at(2)}"></div>`;
      cells += `<div class="${cls} tw-tc-w" style="${at(3, 2)}"${box(d, 'W')}><small class="tw-tc-h">סוף שבוע · מ-${twNice(twWeekend(d, 'start'))}</small>${names(d, 'W', sl.W.need)}</div>`;
      return;
    }
    const pv = addDays(d, -1);
    if(!sl.M && !sl.A && twSlots(pv).some(s => s.shift === 'W')){
      cells += `<div class="${cls} tw-tc-w tw-tc-cont" style="${at(2, 2)}"${box(pv, 'W')}><small class="tw-tc-h">נמשך, עד ${twNice(twWeekend(d, 'end'))}</small>${names(pv, 'W', 0)}</div>`;
      cells += sl.N ? `<div class="${cls}" style="${at(4)}"${box(d, 'N')}>${odd(sl.N)}${names(d, 'N', sl.N.need)}</div>` : `<div class="tw-tc-cell none" style="${at(4)}"></div>`;
      return;
    }
    TW_ROWS.forEach((k, r) => { cells += sl[k] ? `<div class="${cls}" style="${at(r + 2)}"${box(d, k)}>${odd(sl[k])}${names(d, k, sl[k].need)}</div>` : `<div class="tw-tc-cell none" style="${at(r + 2)}"></div>`; });
  });
  return `<div class="tw-tc${o.edit ? ' tw-tc-edit' : ''}">${cells}</div>`;
}
// ---- "הצוות כולו" of one of the staff (Guy 22.11, as in the first site): "היום | חודש"; the month view is one week at a time, with a choice
// of the weeks that were published from this week on: "השבוע", "השבוע הבא", "בעוד שבועיים", each with its dates
async function twLoadPub(){
  const today = twToday(), weekStart = addDays(today, -dowOf(today));
  const pub = TW.periods.filter(p => p.status === 'published' && addDays(p.start, 13) >= weekStart).sort((a, b) => a.start < b.start ? -1 : 1).slice(0, 3);
  const r = pub.length ? await sbPersonal.from('tw_assignment').select('*').in('period', pub.map(p => p.start)) : { data:[] };
  const weeks = [];
  pub.forEach(p => [0, 7].forEach(o => { const s = addDays(p.start, o); if(addDays(s, 6) >= today) weeks.push(s); }));
  TW.pub = { weeks:weeks.slice(0, 3), asg:r.error ? [] : (r.data || []), at:Date.now() };
}
function twTeamCalHtml(){
  if(!TW.pub){ if(!TW.pubLoading){ TW.pubLoading = true; twLoadPub().finally(() => { TW.pubLoading = false; if(TW.tab === 'sched' && !TW.board) twRender(); }); } return '<div class="pnote">רק רגע...</div>'; }
  const weeks = TW.pub.weeks, today = twToday();
  if(!weeks.length) return '<div class="pnote">עוד אין סידור שפורסם לשבוע הזה.</div>';
  const by = {}; TW.pub.asg.forEach(a => { (by[twKey(a.day, a.shift)] = by[twKey(a.day, a.shift)] || []).push(a); });
  const names = (day, sh, need) => { const list = (by[twKey(day, sh)] || []).slice().sort((a, b) => twName(a.person).localeCompare(twName(b.person), 'he')), miss = Math.max(0, (need || 0) - list.length);
    return list.map(a => { const me = TW.me && a.person === TW.me.id, ask = me && a.day >= today && !TW.socialOff && !(TW.swaps || []).some(s => s.assignment === a.id && (s.status === 'open' || s.status === 'taken'));
      const inner = `${twU(twName(a.person))}${a.from_time && a.to_time ? `<small>${twL(twHm(a.from_time) + '–' + twHm(a.to_time))}</small>` : ''}`;
      return ask ? `<button type="button" class="tw-tc-name me" data-tw-ask="${a.id}" title="בקשת החלפה">${inner}</button>` : `<span class="tw-tc-name${me ? ' me' : ''}">${inner}</span>`; }).join('') + (miss ? `<span class="tw-tc-miss">חסר ${miss}</span>` : ''); };
  const view = TW.teamView || 'month';
  const seg = `<div class="tw-seg tw-tc-view" role="group" aria-label="תצוגה">${[['day', 'היום'], ['month', 'חודש']].map(([v, l]) => `<button type="button" data-tw-tcv="${v}" aria-pressed="${v === view}"${v === view ? ' class="on"' : ''}>${l}</button>`).join('')}</div>`;
  if(view === 'day'){
    const sl = twSlots(today), pv = addDays(today, -1), cont = twSlots(pv).some(s => s.shift === 'W') && !sl.some(s => s.shift === 'M' || s.shift === 'A');
    const known = weeks.some(w => today >= w && today <= addDays(w, 6));
    const rows = (cont ? [`<div class="tw-tc-drow"><div class="tw-tc-dlbl"><b>סוף שבוע</b><small>נמשך משישי, עד ${twNice(twWeekend(today, 'end'))}</small></div><div class="tw-tc-dnames">${names(pv, 'W', 0)}</div></div>`] : [])
      .concat(sl.map(s => `<div class="tw-tc-drow"><div class="tw-tc-dlbl"><b>${TW_SHIFT[s.shift]}</b><small>${twNoBreak(twL(s.hours))}</small></div><div class="tw-tc-dnames">${names(today, s.shift, s.need)}</div></div>`));
    return `${seg}<div class="tw-tc-day"><div class="tw-tc-dhead"><b>${DOW_NAMES[dowOf(today)]}</b> ${twShort(today)}</div>${known ? rows.join('') : '<div class="pnote">אין סידור שפורסם להיום.</div>'}</div>`;
  }
  const wi = Math.min(Math.max(TW.teamWk || 0, 0), weeks.length - 1);
  const WORD = ['השבוע', 'השבוע הבא', 'בעוד שבועיים'];
  const nav = `<div class="tw-tc-weeks" role="group" aria-label="איזה שבוע">${weeks.map((w, i) => `<button type="button" data-tw-tcw="${i}" aria-pressed="${i === wi}"${i === wi ? ' class="on"' : ''}><b>${WORD[i]}</b><small>${twL(twShort(w) + '–' + twShort(addDays(w, 6)))}</small></button>`).join('')}</div>`;
  return `${seg}${TW.me ? '<div class="pnote tw-ask-hint">לחיצה על השם שלך במשמרת שעוד לא עברה פותחת בקשת החלפה.</div>' : ''}${nav}${twWeekGrid(Array.from({ length:7 }, (x, i) => addDays(weeks[wi], i)), by, { ask:true })}`;
}
// one of the staff in "הסידור": when two weeks are open for hand-in, a line and the way to them
const twDeadlineOpenHtml = () => { if(!TW.me) return ''; const o = TW.periods.filter(p => p.status === 'open' && (!p.deadline || new Date(p.deadline) > new Date())).sort((a, b) => a.start < b.start ? -1 : 1)[0]; return o ? `<div class="pnote tw-open-line">ההגשה לשבועיים ${twL(twPeriodLabel(o.start))} פתוחה.</div><div class="tw-actions"><button type="button" class="btn ghost" data-tw-tab="mine">להעדפות שלי</button></div>` : ''; };
function twTeamCalWire(box){
  box.querySelectorAll('[data-tw-tcv]').forEach(b => b.addEventListener('click', () => { TW.teamView = b.dataset.twTcv; twRender(); }));
  box.querySelectorAll('[data-tw-tcw]').forEach(b => b.addEventListener('click', () => { TW.teamWk = Number(b.dataset.twTcw); twRender(); }));
}
function twSchedHtml(){
  if(TW.board && twCoordOk()) return twBoardViewHtml();
  TW.board = false;
  const coord = twCoordOk();
  const top = twBuildCardHtml() + twNoticesHtml() + (coord ? twPendingHtml() : '')
    + (coord ? '<div class="tw-actions tw-coord-row"><button type="button" class="btn tw-coord-btn" id="tw-coord">עריכת סידור</button></div>' : '');
  if(!TW.me) return `${top}<h3 class="tw-h">הצוות כולו</h3>${twTeamCalHtml()}`;          // (a system admin who is not on the list: no shifts of her own)
  const fold = (k, title, inner) => `<details class="tw-fixed-box tw-sfold" data-tw-sfold="${k}"${(TW.sfolds || {})[k] ? ' open' : ''}><summary>${title}</summary>${inner}</details>`;
  const mine = twMyShiftsHtml(true);
  return `${top}${fold('mine', `המשמרות שלי${TW.myCount ? ` <span class="tw-sfold-n">${TW.myCount}</span>` : ''}${TW.myNext ? `<small class="tw-sfold-s">הבאה: ${twNoBreak(TW.myNext)}</small>` : ''}`, mine)}
    ${fold('all', 'הצוות כולו', twTeamCalHtml())}${twDeadlineOpenHtml()}`;
}
// the coordinator's view ("רכזת")
function twBoardViewHtml(){
  const pers = twBoardPers(), open = twOpenPer(), p = twPeriodRow();
  const top = '<div class="tw-build-top"><button type="button" class="btn ghost small" data-tw-back-sched>→ חזרה לסידור</button><b>עריכת סידור</b></div>';
  const os = TW.openSubs && open && TW.openSubs.start === open.start ? TW.openSubs : null;
  const openLine = open ? `<div class="pstatus ok tw-open-sum"><span>ההגשה לשבועיים ${twL(twPeriodLabel(open.start))} פתוחה${os ? ` · הגישו <b>${os.n}</b> מתוך ${os.of}` : ''}</span>
    <button type="button" class="btn ghost small" data-tw-open-build="${open.start}">מי הגישה</button></div>` : '';
  if(!p || !pers.some(x => x.start === p.start)) return `${top}${openLine}<div class="pnote">עוד אין סידור שנבנה.</div>`;
  const today = twToday();
  const seg = pers.length > 1 ? `<div class="tw-tc-weeks tw-board-pers" role="group" aria-label="איזה סידור">${pers.slice().reverse().map(x => `<button type="button" data-tw-bper="${x.start}" aria-pressed="${x.start === p.start}"${x.start === p.start ? ' class="on"' : ''}><b>${x.start <= today ? 'השבועיים האלה' : 'השבועיים הבאים'}</b><small>${twL(twPeriodLabel(x.start))}</small></button>`).join('')}</div>` : '';
  const at = p.published_at ? new Date(p.published_at) : null, left = at ? 60 - Math.floor((Date.now() - at) / 60000) : 0;
  const state = p.status === 'published'
    ? `<div class="pstatus ok">הסידור של ${twL(twPeriodLabel(p.start))} פורסם${at ? ` ב-${at.toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}` : ''}. כל הצוות רואה אותו, ושינוי כאן מופיע אצלן מיד.</div>`
    : `<div class="pstatus bad">הסידור של ${twL(twPeriodLabel(p.start))} עוד לא פורסם: רק מי שבונה רואה אותו. מפרסמים בכרטיס "בניית הסידור".</div>`;
  // (Guy 23.11: "ביטול הפרסום" only in the first hour after publishing)
  const acts = p.status === 'published' ? `<div class="tw-actions">${typeof twShareAsk === 'function' ? '<button type="button" class="btn ghost" id="tw-share">שיתוף תמונת הסידור</button><button type="button" class="btn ghost" id="tw-print">הדפסה</button>' : ''}${left > 0 ? `<button type="button" class="btn ghost tw-danger" id="tw-unpublish">ביטול הפרסום <small>(עוד ${left} דק׳)</small></button>` : ''}</div>` : '';
  return `${top}${openLine}${seg}${state}${twPendingHtml()}${acts}${typeof twAttentionHtml === 'function' ? twAttentionHtml() : ''}${twBoardHtml()}`;
}
// both weeks of the schedule as the coordinator's board, with the folded list of the staff at its left
function twBoardHtml(){
  const days = twDays(TW.period), by = {};
  TW.asg.forEach(a => { (by[twKey(a.day, a.shift)] = by[twKey(a.day, a.shift)] || []).push(a); });
  const o = { edit:true, sel:TW.boardSel || null };
  const weeks = [0, 1].map(w => `<section class="tw-board-week"><h3 class="tw-h">שבוע ${w + 1} <span class="tw-wk-range">${twL(twShort(days[w * 7]) + '–' + twShort(days[w * 7 + 6]))}</span></h3>${twWeekGrid(days.slice(w * 7, w * 7 + 7), by, o)}</section>`).join('');
  return `<div class="tw-board"><div class="tw-board-main">${weeks}<div class="pnote">לחיצה על משבצת פותחת אותה: הוספה, החלפה, הסרה ושעות. במחשב אפשר לגרור שם מהרשימה, או ממשבצת למשבצת.</div></div>${twSideHtml()}</div>`;
}
// the list of the staff beside the board, as in the first site (Guy 23.11): folded, a slim tab with the key; open, "המדריכות" with the key in
// coloured words, the names as pills (dashed: did not hand in) that are dragged into the board, "לפי מספר משמרות", a tap on a name marks
// her shifts and shows how many she got by what she marked, and at the bottom "דורש תשומת לב" one at a time
function twSideHtml(){
  if(!TW.sideOpen) return `<button type="button" class="tw-side-tab" id="tw-side-open" aria-expanded="false"><span class="tw-side-tab-t">המדריכות</span>${twLv4Key('tw-lv4-tab')}</button>`;
  const sel = TW.boardSel, byCount = TW.sideSort === 'count', cnt = id => TW.asg.filter(a => a.person === id).length;
  const act = TW.people.filter(p => p.active).sort((a, b) => (byCount ? cnt(a.id) - cnt(b.id) : 0) || twDisp(a).localeCompare(twDisp(b), 'he'));
  const mine = sel ? TW.asg.filter(a => a.person === sel) : [], by = { yes:0, can:0, no:0, none:0 };
  mine.forEach(a => { by[twLvlOf(a.person, a.day, a.shift)]++; });
  const req = sel ? `<div class="tw-req"><b>שובצו ${mine.length} משמרות</b>${[0, 2, 1, 3].map(i => TW_LV4[i]).map(([k, w]) => `<span class="tw-req-r" data-lv="${k}">${w} ${by[k]}</span>`).join('')}</div>` : '<div class="pnote">לחיצה על שם מסמנת את המשמרות שלה בסידור, ומראה כמה שובצה.</div>';
  return `<aside class="tw-side" aria-label="המדריכות"><div class="tw-side-top"><h3>המדריכות</h3>${twLv4Key('tw-lv4-words')}<button type="button" class="tw-side-x" id="tw-side-close" aria-label="קיפול">✕</button></div>
    <button type="button" class="btn ghost small tw-side-sort" id="tw-side-sort" aria-pressed="${byCount}">${byCount ? 'לפי שם' : 'לפי מספר משמרות'}</button>
    <div class="tw-side-names">${act.map(p => { const sub = TW.subs.some(s => s.person === p.id);
      return `<button type="button" class="tw-side-name${sel === p.id ? ' on' : ''}${sub ? '' : ' missing'}" draggable="true" data-tw-drag="${p.id}" title="${sub ? 'הגישה' : 'לא הגישה'} · ${cnt(p.id)} משמרות"><span>${twU(twDisp(p))}</span>${byCount ? `<b class="tw-side-n">${cnt(p.id)}</b>` : ''}</button>`; }).join('')}</div>
    ${req}${twAttnCardHtml()}</aside>`;
}
// "דורש תשומת לב" at the bottom of the list, one at a time (as the first site)
function twAttnCardHtml(){
  if(typeof twAttention !== 'function') return '';
  const list = twAttention().filter(x => x.cls !== 'info' && x.cls !== 'note'); if(!list.length) return '<div class="pstatus ok tw-attn-card">אין דברים שדורשים תשומת לב ✓</div>';
  const i = Math.min(Math.max(TW.attnIdx || 0, 0), list.length - 1), x = list[i];
  return `<div class="tw-attn-card"><div class="tw-attn-top"><b>דורש תשומת לב</b><small>${i + 1} מתוך ${list.length}</small>
      <span class="tw-attn-nav"><button type="button" class="btn ghost small" data-tw-ai="${i - 1}"${i ? '' : ' disabled'} aria-label="הקודם">→</button><button type="button" class="btn ghost small" data-tw-ai="${i + 1}"${i < list.length - 1 ? '' : ' disabled'} aria-label="הבא">←</button></span></div>
    ${x.go ? `<button type="button" class="tw-attn-item" data-tw-goto="${x.go}"><b>${pEsc(x.t)}</b> · ${pEsc(x.x)}</button>` : `<div class="tw-attn-item"><b>${pEsc(x.t)}</b> · ${pEsc(x.x)}</div>`}
    <div class="tw-actions tw-attn-card-act"><button type="button" class="btn ghost small" data-tw-done="${pEsc(twAttnKey(x))}">טופל</button></div></div>`;
}
function twBoardWire(box){
  const side = box.querySelector('#tw-side-open'); if(side) side.addEventListener('click', () => { TW.sideOpen = true; twKeepScroll(); });
  const sx = box.querySelector('#tw-side-close'); if(sx) sx.addEventListener('click', () => { TW.sideOpen = false; TW.boardSel = null; twKeepScroll(); });
  box.querySelectorAll('.tw-side-name').forEach(b => b.addEventListener('click', () => { TW.boardSel = TW.boardSel === b.dataset.twDrag ? null : b.dataset.twDrag; twKeepScroll(); }));
  const ss = box.querySelector('#tw-side-sort'); if(ss) ss.addEventListener('click', () => { TW.sideSort = TW.sideSort === 'count' ? 'name' : 'count'; twKeepScroll(); });
  box.querySelectorAll('[data-tw-ai]').forEach(b => b.addEventListener('click', () => { TW.attnIdx = Number(b.dataset.twAi); twKeepScroll(); }));
  box.querySelectorAll('.tw-board [data-tw-cell]').forEach(c => { const go = () => twCellSheet(c.dataset.twCell); c.addEventListener('click', go); c.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } }); });
  const paint = pid => box.querySelectorAll('.tw-board [data-tw-cell]').forEach(c => { if(!pid){ delete c.dataset.dragLv; return; } const [d, s] = c.dataset.twCell.split('|'); c.dataset.dragLv = twLvlOf(pid, d, s); });
  const end = () => { TW.dragging = null; paint(null); box.querySelectorAll('.tw-drop').forEach(c => c.classList.remove('tw-drop')); };
  box.querySelectorAll('.tw-board [data-tw-drag]').forEach(ch => {
    ch.addEventListener('dragstart', e => { TW.dragging = { pid:ch.dataset.twDrag }; e.dataTransfer.setData('text/plain', ch.dataset.twDrag); e.dataTransfer.effectAllowed = 'copy'; paint(ch.dataset.twDrag); });
    ch.addEventListener('dragend', end);
  });
  box.querySelectorAll('.tw-board [data-tw-row]').forEach(n => {
    n.addEventListener('dragstart', e => { e.stopPropagation(); const a = TW.asg.find(x => x.id === n.dataset.twRow); if(!a) return; TW.dragging = { pid:a.person, row:a.id }; e.dataTransfer.setData('text/plain', a.person); e.dataTransfer.effectAllowed = 'move'; paint(a.person); });
    n.addEventListener('dragend', end);
  });
  box.querySelectorAll('.tw-board [data-tw-cell]').forEach(c => {
    c.addEventListener('dragover', e => { if(!TW.dragging) return; e.preventDefault(); c.classList.add('tw-drop'); });
    c.addEventListener('dragleave', () => c.classList.remove('tw-drop'));
    c.addEventListener('drop', async e => {
      e.preventDefault(); const dr = TW.dragging; end(); if(!dr) return;
      const [day, shift] = c.dataset.twCell.split('|'), pid = dr.pid;
      if(TW.asg.some(a => a.person === pid && a.day === day && a.shift === shift)){ toast(`${twName(pid)} כבר במשמרת הזו`, 4000); return; }
      const others = TW.asg.filter(a => a.person === pid && a.id !== dr.row);
      const ks = others.map(a => twHandPair(pid, a.day, a.shift, day, shift, a)).reduce((w, x) => TW_HAND_RANK[x] > TW_HAND_RANK[w] ? x : w, '');
      const warn = ks ? `. שימו לב: ${twHandWord(ks)}. זה יופיע ב"דורש תשומת לב"` : '';
      if(!(await twAskBeforePlacing(pid, day, shift))) return;
      if(dr.row){          // a name moved from one box to another
        const a = TW.asg.find(x => x.id === dr.row); if(!a) return;
        const back = { day:a.day, shift:a.shift, by_hand:a.by_hand, fixed:a.fixed, from_time:a.from_time, to_time:a.to_time };
        const r = await sbPersonal.from('tw_assignment').update({ day, shift, by_hand:true, fixed:false, from_time:null, to_time:null }).eq('id', a.id);
        if(r.error){ console.error(r.error); toast('⚠ ההעברה לא נשמרה'); return; }
        Object.assign(a, { day, shift, by_hand:true, fixed:false, from_time:null, to_time:null }); await twAfterChange();
        twUndo(`${twName(pid)} הועברה ל${TW_SHIFT[shift]} ${twShort(day)}${warn}`, async () => { const u = await sbPersonal.from('tw_assignment').update(back).eq('id', a.id); if(u.error) return false; Object.assign(a, back); await twAfterChange(); return true; });
        return;
      }
      const r = await sbPersonal.from('tw_assignment').insert({ period:TW.period, day, shift, person:pid, by_hand:true }).select();
      if(r.error){ console.error(r.error); toast('⚠ השיבוץ לא נשמר'); return; }
      TW.asg.push(r.data[0]); await twAfterChange();
      twUndo(`${twName(pid)} נוספה ל${TW_SHIFT[shift]} ${twShort(day)}${warn}`, async () => { const u = await sbPersonal.from('tw_assignment').delete().eq('id', r.data[0].id); if(u.error) return false; TW.asg = TW.asg.filter(a => a.id !== r.data[0].id); await twAfterChange(); return true; });
    });
  });
}
// after a change in a published schedule "שליחת עדכונים" may appear: its count is asked again
async function twAfterChange(){ if((twPeriodRow() || {}).status === 'published' && typeof twPendingLoad === 'function') await twPendingLoad(); twKeepScroll(); }
// into the coordinator's view: the latest schedule that was built (or the one chosen), and how many handed in for the two weeks still open
async function twEnterBoard(per){
  const pers = twBoardPers(), to = per || (pers[0] || {}).start || null;
  TW.board = true; TW.boardSel = null;
  if(to && to !== TW.period){ TW.period = to; TW.week = 0; await twLoadPeriod(); }
  const open = twOpenPer(); TW.openSubs = null;
  if(open){ const r = await sbPersonal.from('tw_submission').select('person').eq('period', open.start); if(!r.error) TW.openSubs = { start:open.start, n:new Set((r.data || []).map(x => x.person)).size, of:TW.people.filter(p => p.active).length }; }
}
function twSchedWire(box){
  twTeamCalWire(box);
  box.querySelectorAll('[data-tw-ask]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); twAskFor(b.dataset.twAsk); }));
  const ap = box.querySelector('#tw-ask-pick');
  if(ap) ap.addEventListener('click', () => {
    const sh = twSheet(`<h2>בקשת החלפה</h2><div class="pnote">לאיזו משמרת?</div><div class="tw-ask-list">${(TW.askable || []).map(a => `<button type="button" class="btn ghost" data-tw-askpick="${a.id}">${twNoBreak(twShiftLine(a.day, a.shift))}</button>`).join('')}</div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-tw-close>ביטול</button></div>`);
    sh.querySelectorAll('[data-tw-askpick]').forEach(b => b.addEventListener('click', () => { sh.remove(); twAskFor(b.dataset.twAskpick); }));
  });
  const all = box.querySelector('#tw-all-mine'); if(all) all.addEventListener('click', () => { TW.allMine = true; twKeepScroll(); });
  box.querySelectorAll('[data-tw-sfold]').forEach(d => d.addEventListener('toggle', () => { TW.sfolds = TW.sfolds || {}; TW.sfolds[d.dataset.twSfold] = d.open; }));
  const co = box.querySelector('#tw-coord'); if(co) co.addEventListener('click', async () => { co.disabled = true; TW.nav.push({ tab:TW.tab, step:TW.step, week:TW.week, full:TW.full, board:false, period:TW.period }); if(twOwnSite()){ try { history.pushState({ tw:'nav' }, ''); } catch(e){} } await twEnterBoard(); twRender(); window.scrollTo(0, 0); });
  box.querySelectorAll('[data-tw-bper]').forEach(b => b.addEventListener('click', async () => { if(b.dataset.twBper === TW.period) return; await twEnterBoard(b.dataset.twBper); twRender(); }));
  twBtn(box, '#tw-unpublish', async () => { const up = await sbPersonal.from('tw_period').update({ status:'built', published_at:null }).eq('start', TW.period); if(up.error) throw up.error; toast('הפרסום בוטל'); },
    () => ({ title:'לבטל את הפרסום?', text:`${TW.people.filter(p => p.active).length} עובדות יפסיקו לראות את הסידור, עד שיפורסם שוב. הסידור עצמו נשמר כטיוטה.`, ok:'כן, לבטל את הפרסום', danger:true }));
  const pr = box.querySelector('#tw-print'); if(pr) pr.addEventListener('click', () => { if(typeof twPrint === 'function') twPrint(); });
  if(TW.board) twBoardWire(box);
  twNoticesWire(box);
  if(typeof twPilotWire === 'function') twPilotWire(box);
}
// a button with a question before it (heavy steps are never one tap: the review agents 2026-11-14); then everything is loaded again
function twBtn(box, id, fn, ask){ const b = box.querySelector(id); if(b) b.addEventListener('click', async () => { if(TW.busy) return; if(ask && !(await twConfirm(ask()))) return; TW.busy = true; b.disabled = true; try { await fn(); } catch(e){ console.error(e); toast('⚠ הפעולה נכשלה'); } TW.busy = false; await twLoadBase(); await twLoadPeriod(); twRender(); }); }
const twWaNum = ph => { const d = String(ph || '').replace(/\D/g, ''); return !d ? '' : d.startsWith('972') ? d : d.startsWith('0') ? '972' + d.slice(1) : d; };
function twWaLink(personId, day, shift){
  const p = twPerson(personId), place = (typeof ORG_NAME !== 'undefined' && ORG_NAME) ? ` ב${ORG_NAME}` : '';
  const text = `שלום ${p ? p.name : ''}, יש מקום פנוי${place}: ${twShiftLine(day, shift)}. אפשר לשבץ אותך?`;
  return `https://wa.me/${twWaNum((TW.phones || {})[personId])}?text=${encodeURIComponent(text)}`;
}
// before placing somebody who marked "לא" or did not mark the shift (Guy 23.11, as the first site's srvAskBeforePlacing): ask her first in
// WhatsApp (a ready message, when she has a phone), place anyway, or go back. Resolves true to place.
function twAskBeforePlacing(pid, day, shift){
  const lv = twLvlOf(pid, day, shift); if(lv === 'yes' || lv === 'can') return Promise.resolve(true);
  const slot = twSlots(day).find(s => s.shift === shift) || {}, ph = (TW.phones || {})[pid];
  return new Promise(resolve => {
    let done = false; const end = v => { if(done) return; done = true; resolve(v); };
    const sh = twSheet(`<h2>${twU(twName(pid))} ${lv === 'no' ? 'סימנה "לא" למשמרת הזו' : 'לא סימנה את המשמרת הזו'}</h2>
      <div class="pnote">${DOW_NAMES[dowOf(day)]} ${twShort(day)} · ${TW_SHIFT[shift]} ${shift === 'W' ? '' : twL(slot.hours || '')}. כדאי לשאול לפני שמשבצים.</div>
      <div class="tw-wa-ask">${ph ? `<a class="btn tw-wa-go" id="tw-wa-go" target="_blank" rel="noopener" href="${pEsc(twWaLink(pid, day, shift))}">${TW_WA_SVG}<span>לשאול בוואטסאפ</span></a>` : '<div class="pnote">אין מספר טלפון. מוסיפים אותו ב"ניהול", בפרטים שלה.</div>'}
        <button type="button" class="btn ghost" id="tw-wa-place">לשבץ בכל זאת</button><button type="button" class="btn ghost" id="tw-wa-back">חזרה</button></div>`);
    sh._onClose = () => end(false);
    const go = sh.querySelector('#tw-wa-go'); if(go) go.addEventListener('click', () => { toast('נפתחה שיחה בוואטסאפ. אחרי התשובה אפשר לשבץ.'); end(false); setTimeout(() => sh.remove(), 50); });
    sh.querySelector('#tw-wa-place').addEventListener('click', () => { end(true); sh.remove(); });
    sh.querySelector('#tw-wa-back').addEventListener('click', () => { end(false); sh.remove(); });
  });
}
// the window of one shift, as the coordinator's window of the first site (Guy 23.11): who is on it, each with "שינוי שעות", "החלפה",
// "הסרה" (and "✓ אישר/ה" for who did not mark it); below, "הוספת מדריך/ה": a folded list coloured by what each one marked (כן, יכול,
// לא, לא סומן, the key at its top, names only), WhatsApp beside who did not mark it, then the hours and the button. By hand nothing is
// refused, not even an overlap in hours (Guy 23.11); the pairs are said as a warning before adding, and show in "דורש תשומת לב".
function twCellSheet(key){
  const [day, shift] = key.split('|'), there = () => TW.asg.filter(a => a.day === day && a.shift === shift);
  const wrap = document.createElement('div'); wrap.className = 'sheet confirm-sheet mx-sheet tw-ed-sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  wrap.dataset.ptheme = (document.querySelector('#view-tw .portal-shell[data-ptheme]') || { dataset:{} }).dataset.ptheme || 'dark';
  const pairOf = (pid, cur, d, s) => TW.asg.filter(a => a.person === pid && a !== cur).map(a => twHandPair(pid, a.day, a.shift, d || day, s || shift, a, cur))
    .reduce((w, x) => TW_HAND_RANK[x] > TW_HAND_RANK[w] ? x : w, '');
  const slot = twSlots(day).find(s => s.shift === shift) || {}, sp = twSpan(day, shift);
  const hm = m => { const t = ((m % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const times = sel => Array.from({ length:48 }, (x, i) => { const v = String(Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00'); return `<option value="${v}"${v === sel ? ' selected' : ''}>${v}</option>`; }).join('');
  const RANK = { yes:0, can:1, none:2, no:3 };
  let replacing = null, editing = null, picked = null, open = false;
  const ranked = () => TW.people.filter(p => p.active && !there().some(a => a.person === p.id)).map(p => ({ p, lv:twLvlOf(p.id, day, shift) }))
    .sort((a, b) => RANK[a.lv] - RANK[b.lv] || twDisp(a.p).localeCompare(twDisp(b.p), 'he'));
  const wa = (pid, lv) => (lv === 'no' || lv === 'none') && (TW.phones || {})[pid] ? `<a class="wa-btn" target="_blank" rel="noopener" href="${pEsc(twWaLink(pid, day, shift))}" aria-label="שאלה בוואטסאפ ל${pEsc(twName(pid))}" title="שאלה בוואטסאפ">${TW_WA_SVG}</a>` : '';
  const list = (attr, title) => `<div class="tw-ed-list" role="listbox"><div class="tw-ed-head">${title ? `<b>${title}</b>` : ''}${twLv4Key('tw-ed-key')}</div>
    ${ranked().map(({ p, lv }) => `<div class="tw-ed-pickrow"><button type="button" class="tw-ed-item" role="option" data-lv="${lv}" ${attr}="${p.id}">${twU(twDisp(p))}</button>${wa(p.id, lv)}</div>`).join('') || '<div class="pnote">אין מדריכה פנויה.</div>'}</div>`;
  const draw = () => {
    if(!wrap.isConnected) return;
    if(replacing && !there().some(a => a.id === replacing)) replacing = null;
    const rows = there().slice().sort((a, b) => twName(a.person).localeCompare(twName(b.person), 'he')), miss = Math.max(0, (slot.need || 0) - rows.length);
    const row = a => {
      const lv = twLvlOf(a.person, day, shift), pr = pairOf(a.person, a), hrs = a.from_time && a.to_time ? twL(twHm(a.from_time) + '–' + twHm(a.to_time)) : '';
      if(editing === a.id) return `<div class="tw-ed-row editing"><span class="tw-ed-name">${twU(twName(a.person))}</span><span class="tw-ed-hrs"><select data-tw-hf aria-label="משעה">${times(a.from_time ? twHm(a.from_time) : hm(sp[0]))}</select><span>עד</span><select data-tw-ht aria-label="עד שעה">${times(a.to_time ? twHm(a.to_time) : hm(sp[1]))}</select></span>
        <span class="tw-ed-btns"><button type="button" class="btn small" data-tw-hsave="${a.id}">שמירה</button>${a.from_time ? `<button type="button" class="btn ghost small" data-tw-hclear="${a.id}">שעות המשמרת</button>` : ''}<button type="button" class="btn ghost small" data-tw-hcancel>ביטול</button></span></div>`;
      return `<div class="tw-ed-row"><span class="tw-ed-name">${twU(twName(a.person))}</span><em class="tw-ed-info">${[hrs, a.ok ? 'אישר/ה ✓' : '', pr ? `⚠ ${twHandWord(pr)}` : ''].filter(Boolean).join(' · ')}</em>
        <span class="tw-ed-btns">${a.ok ? `<button type="button" class="btn ghost small" data-tw-ok="${a.id}" title="ביטול האישור">ביטול ✓</button>` : lv === 'no' || lv === 'none' ? `<button type="button" class="btn ghost small" data-tw-ok="${a.id}" title="אישר/ה (למשל בוואטסאפ)">✓ אישר/ה</button>` : ''}
        <button type="button" class="btn ghost small" data-tw-hrs="${a.id}">שינוי שעות</button><button type="button" class="btn ghost small" data-tw-rep="${a.id}" aria-pressed="${replacing === a.id}">החלפה</button><button type="button" class="btn ghost small" data-tw-rm="${a.id}">הסרה</button></span></div>
        ${replacing === a.id ? list('data-tw-repto', `במקום ${pEsc(twName(a.person))}:`) : ''}`;
    };
    const pw = picked ? pairOf(picked, null) : '';
    wrap.innerHTML = `<div class="sheet-card tw-sheet tw-ed"><div class="tw-sheet-head"><h2>${DOW_NAMES[dowOf(day)]} ${twShort(day)} · ${TW_SHIFT[shift]} <small>${shift === 'W' ? `שישי ${twNice(twWeekend(day, 'start'))} עד שבת ${twNice(twWeekend(addDays(day, 1), 'end'))}` : twL(slot.hours || '')}</small></h2><button type="button" class="btn ghost small" data-tw-x aria-label="סגירה">✕</button></div>
      ${miss ? `<div class="pwarn tw-ed-warn">⚠ ${miss === 1 ? 'חסר שיבוץ אחד' : `חסרים ${miss} שיבוצים`} במשמרת הזו</div>` : ''}
      <div class="tw-ed-rows">${rows.length ? (replacing ? rows.filter(a => a.id === replacing) : rows).map(row).join('') : '<div class="pnote">אין עדיין מדריכות במשמרת הזו.</div>'}</div>
      ${replacing ? '' : `<h3 class="tw-ed-h">הוספת מדריך/ה</h3>
      <div class="tw-ed-pick"><button type="button" class="tw-ed-btn${picked ? ' sel' : ''}" id="tw-ed-open" aria-haspopup="listbox" aria-expanded="${open}"${picked ? ` data-lv="${twLvlOf(picked, day, shift)}"` : ''}><span>${picked ? twU(twName(picked)) : 'בחרו מדריך/ה'}</span><i aria-hidden="true">⌄</i></button>
        ${open ? list('data-tw-add') : ''}</div>
      ${picked ? `<div class="tw-ed-hrs tw-ed-addhrs"><select id="tw-af" aria-label="משעה">${times(hm(sp[0]))}</select><span>עד</span><select id="tw-at" aria-label="עד שעה">${times(hm(sp[1]))}</select></div>
        ${pw ? `<div class="pwarn">⚠ ${twHandWord(pw)}. אפשר לשבץ בכל זאת.</div>` : ''}` : ''}`}
      <div class="confirm-actions tw-ed-actions">${replacing ? '<button type="button" class="btn ghost" data-tw-repx>ביטול ההחלפה</button>' : `<button type="button" class="btn ghost" data-tw-x>סגירה</button>${picked ? `<button type="button" class="btn" id="tw-ed-add">הוספת ${twU(twName(picked))}</button>` : ''}`}</div></div>`;
    wrap.querySelectorAll('[data-tw-x]').forEach(b => b.addEventListener('click', () => wrap.remove()));
    const eo = wrap.querySelector('#tw-ed-open'); if(eo) eo.addEventListener('click', () => { open = !open; draw(); if(open){ const l = wrap.querySelector('.tw-ed-pick .tw-ed-list'); if(l) l.scrollIntoView({ block:'nearest', behavior:'smooth' }); } });
    wrap.querySelectorAll('[data-tw-add]').forEach(b => b.addEventListener('click', () => { picked = b.dataset.twAdd; open = false; draw(); }));
    const ins = async (pid, from, to) => { const row = Object.assign({ period:TW.period, day, shift, person:pid, by_hand:true }, from ? { from_time:from, to_time:to } : {}); return sbPersonal.from('tw_assignment').insert(row).select(); };
    const backOf = a => ({ period:a.period, day:a.day, shift:a.shift, person:a.person, third:a.third, fixed:a.fixed, by_hand:a.by_hand, from_time:a.from_time, to_time:a.to_time, note:a.note, ok:!!a.ok });
    const after = () => { if(typeof twAfterChange === 'function') twAfterChange(); draw(); };
    const add = wrap.querySelector('#tw-ed-add');
    if(add) add.addEventListener('click', async () => {
      const f = wrap.querySelector('#tw-af').value, t = wrap.querySelector('#tw-at').value; if(f === t){ toast('בדקו את השעות'); return; }
      const own = !(f === hm(sp[0]) && t === hm(sp[1])), pid = picked, w = pairOf(pid, null);
      if(!(await twAskBeforePlacing(pid, day, shift))) return;
      add.disabled = true; const r = await ins(pid, own ? f : null, own ? t : null);
      if(r.error){ console.error(r.error); toast('⚠ השיבוץ לא נשמר'); add.disabled = false; return; }
      TW.asg.push(r.data[0]); picked = null; after();
      twUndo(`${twName(pid)} נוספה למשמרת` + (w ? `. שימו לב: ${twHandWord(w)}. זה יופיע ב"דורש תשומת לב"` : ''), async () => { const u = await sbPersonal.from('tw_assignment').delete().eq('id', r.data[0].id); if(u.error) return false; TW.asg = TW.asg.filter(a => a.id !== r.data[0].id); if(wrap.isConnected) draw(); else twRender(); return true; });
    });
    wrap.querySelectorAll('[data-tw-rm]').forEach(b => b.addEventListener('click', async () => {
      const a = TW.asg.find(x => x.id === b.dataset.twRm); if(!a) return; b.disabled = true;
      const d = await sbPersonal.from('tw_assignment').delete().eq('id', a.id); if(d.error){ console.error(d.error); toast('⚠ ההסרה נכשלה'); b.disabled = false; return; }
      TW.asg = TW.asg.filter(x => x.id !== a.id); after();
      const back = backOf(a);
      twUndo(`${twName(a.person)} הוסרה מהמשמרת`, async () => { const u = await sbPersonal.from('tw_assignment').insert(back).select(); if(u.error) return false; TW.asg.push(u.data[0]); if(wrap.isConnected) draw(); else twRender(); return true; });
    }));
    wrap.querySelectorAll('[data-tw-rep]').forEach(b => b.addEventListener('click', () => { replacing = replacing === b.dataset.twRep ? null : b.dataset.twRep; editing = null; draw(); }));
    wrap.querySelectorAll('[data-tw-repx]').forEach(b => b.addEventListener('click', () => { replacing = null; draw(); }));
    wrap.querySelectorAll('[data-tw-repto]').forEach(b => b.addEventListener('click', async () => {
      const old = TW.asg.find(a => a.id === replacing), nw = b.dataset.twRepto; if(!old) return;
      if(!(await twAskBeforePlacing(nw, day, shift))) return;
      const w = pairOf(nw, null), back = backOf(old);
      const d = await sbPersonal.from('tw_assignment').delete().eq('id', old.id); if(d.error){ console.error(d.error); toast('⚠ השינוי לא נשמר'); return; }
      TW.asg = TW.asg.filter(a => a.id !== old.id);
      const r = await ins(nw, old.from_time, old.to_time);
      if(r.error){ console.error(r.error); toast('⚠ השינוי לא נשמר'); await sbPersonal.from('tw_assignment').insert(back); await twLoadPeriod(); draw(); return; }
      TW.asg.push(r.data[0]); replacing = null; after();
      twUndo(`${twName(nw)} במקום ${twName(old.person)}` + (w ? `. שימו לב: ${twHandWord(w)}. זה יופיע ב"דורש תשומת לב"` : ''), async () => {
        const u1 = await sbPersonal.from('tw_assignment').delete().eq('id', r.data[0].id); if(u1.error) return false;
        const u2 = await sbPersonal.from('tw_assignment').insert(back).select(); if(u2.error) return false;
        TW.asg = TW.asg.filter(a => a.id !== r.data[0].id); TW.asg.push(u2.data[0]); if(wrap.isConnected) draw(); else twRender(); return true;
      });
    }));
    wrap.querySelectorAll('[data-tw-ok]').forEach(b => b.addEventListener('click', async () => {
      const a = TW.asg.find(x => x.id === b.dataset.twOk); if(!a) return;
      const next = !a.ok, r = await sbPersonal.from('tw_assignment').update({ ok:next }).eq('id', a.id);
      if(r.error){ console.error(r.error); toast('⚠ לא נשמר'); return; }
      a.ok = next; draw(); toast(next ? `${twName(a.person)} סומנה כמאשרת ✓` : 'האישור בוטל');
    }));
    wrap.querySelectorAll('[data-tw-hrs]').forEach(b => b.addEventListener('click', () => { editing = b.dataset.twHrs; replacing = null; draw(); }));
    wrap.querySelectorAll('[data-tw-hcancel]').forEach(b => b.addEventListener('click', () => { editing = null; draw(); }));
    const saveH = async (id, from, to) => { const a = TW.asg.find(x => x.id === id); if(!a) return;
      const r = await sbPersonal.from('tw_assignment').update({ from_time:from, to_time:to }).eq('id', id);
      if(r.error){ console.error(r.error); toast('⚠ השעות לא נשמרו'); return; }
      a.from_time = from; a.to_time = to; editing = null; after(); toast('השעות עודכנו'); };
    wrap.querySelectorAll('[data-tw-hsave]').forEach(b => b.addEventListener('click', () => { const f = wrap.querySelector('[data-tw-hf]').value, t = wrap.querySelector('[data-tw-ht]').value;
      if(f === t){ toast('בדקו את השעות'); return; } if(f === hm(sp[0]) && t === hm(sp[1])) saveH(b.dataset.twHsave, null, null); else saveH(b.dataset.twHsave, f, t); }));
    wrap.querySelectorAll('[data-tw-hclear]').forEach(b => b.addEventListener('click', () => saveH(b.dataset.twHclear, null, null)));
  };
  wrap._onClose = () => twRender();
  wrap.addEventListener('click', e => { if(e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap); draw();
}
const TW_WA_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>';
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
  const who = `<div class="pnote">השבועיים ${twPeriodLabel(p.start)} · בונה את הסידור: <b>${p.builder ? pEsc(twName(p.builder)) : 'מנהלות המערכת'}</b></div>`;
  const act = TW.people.filter(x => x.active);
  let body = '';
  if(step === 1){
    const rows = act.map(x => ({ x, c:twCount(x), sub:TW.subs.find(s => s.person === x.id) || null }));
    const done = rows.filter(r => r.sub).length, low = rows.filter(r => r.sub && !r.c.ok).length;
    const row = r => `<div class="tw-sub ${r.sub ? (r.c.ok ? 'ok' : 'low') : 'none'}"><b>${pEsc(twDisp(r.x))}</b><span>${r.sub ? `פתחה ${r.c.have} · צריך לפתוח ${r.c.need}${r.c.fixed ? ' (בלי המשמרות הקבועות)' : ''}${r.c.ok ? ' ✓' : ' · פחות ממה שצריך'}${r.c.weeks.some(x => x && x.short) ? ` · בגלל משמרות צמודות אפשר לשבץ בפועל פחות מהמשמרות שלה (${r.c.weeks.map((x, i) => x && x.short ? `שבוע ${i + 1}: ${x.eff} מתוך ${x.place}` : '').filter(Boolean).join(', ')})` : ''}` : (r.c.have ? `סומנו ${r.c.have} מתוך ${r.c.need}, בלי הגשה` : 'לא סומן כלום')}</span>${r.sub && r.sub.note ? `<small class="tw-sub-note">הערה: ${pEsc(r.sub.note)}</small>` : ''}</div>`;
    // (Guy 23.11, as in the first site: folded, "הגישו" and "לא הגישו")
    const grp = (k, title, list, empty) => `<details class="tw-fixed-box tw-subfold" data-tw-subfold="${k}"${(TW.subFolds || {})[k] ? ' open' : ''}><summary>${title} (${list.length})</summary>${list.length ? `<div class="tw-subs">${list.map(row).join('')}</div>` : `<div class="pnote">${empty}</div>`}</details>`;
    body = `<p class="tw-step-say">${twOpenNow() ? 'כאן רואים מי הגישה ומה פתחה. את ההעדפות של מי שאין לה כניסה אישית ממלאים בלשונית "העדפות", בכפתור "מילוי בשביל מדריכה אחרת".' : p.status === 'open' ? 'ההגשה נסגרה. כאן רואים מי הגישה, ואז ממשיכים לבנייה.' : 'ההגשה נסגרה כשהסידור נבנה. אפשר לפתוח אותה מחדש, כדי שהצוות יוכל לשנות.'}</p>
      <div class="tw-step-sum">הגישו <b>${done}</b> מתוך ${act.length}${low ? ` · ${low} פתחו פחות ממה שכדאי` : ''}</div>
      ${grp('done', 'הגישו', rows.filter(r => r.sub), 'עוד אף אחת לא הגישה.')}${grp('miss', 'לא הגישו', rows.filter(r => !r.sub), 'כולן הגישו ✓')}
      <div class="tw-actions"><button type="button" class="btn" data-tw-step="2">המשך לבנייה ←</button>
        ${p.status === 'built' ? '<button type="button" class="btn ghost" id="tw-reopen">פתיחת ההגשה מחדש</button>' : ''}
        ${typeof liveCut === 'function' && !liveCut() && p.status === 'open' ? '<button type="button" class="btn ghost" id="tw-demo">הדגמה: מילוי העדפות למי שאין כניסה ולא הגישה</button>' : ''}</div>`;
  } else if(step === 2){
    body = `<p class="tw-step-say">הבנייה משבצת לפי ההעדפות: קודם מי שסימנה "כן", ורק כשאין אחרת "אפשרי". משמרות קבועות משובצות ראשונות. עם הבנייה ההגשה נסגרת.${built ? ' שיבוצים שנעשו ביד נשמרים גם בבנייה מחדש.' : ''}</p>
      ${twFixedBoxHtml()}
      ${built ? `<div class="tw-actions"><button type="button" class="btn" data-tw-step="3">המשך לתיקונים ←</button><button type="button" class="btn ghost" id="tw-build">בנייה מחדש</button></div>`
        : '<div class="tw-actions"><button type="button" class="btn" id="tw-build">בניית הסידור</button></div>'}`;
  } else if(step === 3){
    const rep = (p.report && p.report.lines) || [], miss = twMissingCount(), fresh = TW.justBuilt; TW.justBuilt = false;
    body = `${fresh ? `<div class="pstatus ok" role="status">הסידור נבנה${miss ? '. המשבצות המסומנות "חסר שיבוץ" מחכות לך בטבלה.' : ', כל המשמרות מלאות.'}</div>` : ''}<p class="tw-step-say">לחיצה על משבצת פותחת את רשימת הצוות: מי סימנה "כן", מי "יכול", ומי צמודה למשמרת אחרת. במחשב אפשר לגרור שמות מהרשימה שבצד.</p>
      <div class="tw-step-sum">${miss ? `חסרים <b>${miss}</b> שיבוצים` : 'כל המשמרות מלאות'} · ${TW.asg.length} שיבוצים${TW.asg.some(a => a.by_hand) ? `, ${TW.asg.filter(a => a.by_hand).length} מהם ביד` : ''}</div>
      ${typeof twAttentionHtml === 'function' ? twAttentionHtml() : ''}
      ${rep.length ? `<details class="tw-report"><summary>הערות מהבנייה (${rep.length})</summary><ul>${rep.map(l => `<li>${pEsc(l)}</li>`).join('')}</ul></details>` : ''}
      ${twBoardHtml()}
      <div class="tw-actions"><button type="button" class="btn" data-tw-step="4">המשך לפרסום ←</button></div>`;
  } else {
    const miss = twMissingCount();
    body = p.status === 'published'
      ? `<div class="pstatus ok">הסידור פורסם${p.published_at ? ` ב-${new Date(p.published_at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}` : ''}. כל הצוות רואה אותו.</div>
        <p class="tw-step-say">תיקונים, שיתוף התמונה ו"שליחת עדכונים" נמצאים מעכשיו בכפתור "עריכת סידור" שבלשונית "הסידור".</p>
        <div class="tw-actions"><button type="button" class="btn" id="tw-to-board">לעריכת הסידור</button></div>`
      : `<p class="tw-step-say">בפרסום הסידור נפתח לכל הצוות, וכל אחת רואה בו את המשמרות שלה.</p>
        ${miss ? `<div class="pstatus bad">${miss === 1 ? 'חסר שיבוץ אחד' : `חסרים ${miss} שיבוצים`}. אפשר לפרסם בכל זאת ולהשלים אחר כך בצעד 3.</div>` : '<div class="pstatus ok">כל המשמרות מלאות.</div>'}
        <div class="tw-actions"><button type="button" class="btn" id="tw-publish">פרסום לצוות</button><button type="button" class="btn ghost" data-tw-step="3">→ חזרה לתיקונים</button></div>`;
  }
  return `<div class="tw-build-top"><button type="button" class="btn ghost small" data-tw-back-sched>→ חזרה לסידור</button><b>בניית הסידור</b></div>` + head + who + body;
}
// the turn of the second night (Guy 19.11: two people of each two weeks get one more night, in turn, remembered from schedule to schedule):
// how many weeks with two nights each person had in the last three published schedules
async function twNightHist(){
  const prev = TW.periods.filter(p => p.start < TW.period && p.status === 'published').map(p => p.start).sort().slice(-3), out = {};
  if(!prev.length) return out;
  try {
    const r = await sbPersonal.from('tw_assignment').select('person,day,period').in('period', prev).eq('shift', 'N'); if(r.error) return out;
    const n = {}; (r.data || []).forEach(a => { const k = a.person + '|' + a.period + '|' + twWeekOf(a.period, a.day); n[k] = (n[k] || 0) + 1; });
    Object.entries(n).forEach(([k, c]) => { if(c >= 2){ const pid = k.split('|')[0]; out[pid] = (out[pid] || 0) + 1; } });
  } catch(e){}
  return out;
}
// who is fixed in each shift of the week: two choices per shift (Guy 23.11). They are kept from schedule to schedule, so the fixed shifts of
// the last schedule are already there, and are changed here
function twFixedBoxHtml(){
  if(!twCanFix()) return '';
  const act = TW.people.filter(p => p.active), week = twDays(TW.period).slice(0, 7);
  const pick = (dow, shift, i) => { const cur = twFixedOf(dow, shift)[i] || '';
    return `<select data-tw-fix="${dow}|${shift}" aria-label="${DOW_NAMES[dow]} ${TW_SHIFT[shift]}, קבועה ${i + 1}"><option value="">אין</option>${act.map(p => `<option value="${p.id}"${cur === p.id ? ' selected' : ''}>${pEsc(twDisp(p))}</option>`).join('')}</select>`; };
  return `<details class="tw-fixed-box tw-fixbox"${TW.fixedOpen ? ' open' : ''}><summary>משמרות קבועות${TW.fixed.length ? ` (${TW.fixed.length})` : ''}</summary>
    <div class="pnote">בכל משמרת אפשר לקבוע עד שתי עובדות קבועות. הבנייה משבצת אותן שם קודם, בכל שבוע, ושאר המקומות במשמרת מתחלפים. הקבועות נשמרות מסידור לסידור, וכאן משנים אותן. משמרת קבועה נספרת בתוך המשמרות השבועיות.</div>
    <div class="tw-fixed-grid">${week.map(day => `<div class="tw-fixed-day"><b>${DOW_NAMES[dowOf(day)]}</b>${twSlots(day).map(sl => `<div class="tw-fix-row"><span>${TW_SHIFT[sl.shift]} <small class="tw-fix-h">${sl.shift === 'W' ? `שישי ${twNice(twWeekend(day, 'start'))} עד שבת ${twNice(twWeekend(addDays(day, 1), 'end'))}` : twL(sl.hours)}</small></span>${pick(dowOf(day), sl.shift, 0)}${pick(dowOf(day), sl.shift, 1)}</div>`).join('')}</div>`).join('')}</div>
    <div class="pnote">שינוי כאן משפיע מהבנייה הבאה. כדי לעדכן סידור קיים לוחצים "בנייה מחדש".</div></details>`;
}
function twBuildWire(box){
  box.querySelectorAll('[data-tw-step]').forEach(b => b.addEventListener('click', () => { if(Number(b.dataset.twStep) !== TW.step) twGo(() => { TW.step = Number(b.dataset.twStep); }); }));
  twBoardWire(box);
  if(typeof twPilotWire === 'function') twPilotWire(box);
  box.querySelectorAll('[data-tw-subfold]').forEach(d => d.addEventListener('toggle', () => { TW.subFolds = TW.subFolds || {}; TW.subFolds[d.dataset.twSubfold] = d.open; }));
  const tb = box.querySelector('#tw-to-board'); if(tb) tb.addEventListener('click', async () => { await twEnterBoard(TW.period); twGo(() => { TW.tab = 'sched'; TW.step = null; }); });
  const fb = box.querySelector('.tw-fixbox'); if(fb) fb.addEventListener('toggle', () => { TW.fixedOpen = fb.open; });
  box.querySelectorAll('[data-tw-fix]').forEach(sel => sel.addEventListener('change', async () => {
    const [dow, shift] = sel.dataset.twFix.split('|');
    const list = [...new Set([...box.querySelectorAll(`[data-tw-fix="${dow}|${shift}"]`)].map(x => x.value).filter(Boolean))];
    if(list.length < [...box.querySelectorAll(`[data-tw-fix="${dow}|${shift}"]`)].filter(x => x.value).length) toast('אותה עובדת נבחרה פעמיים: נשמרה פעם אחת');
    const del = await sbPersonal.from('tw_fixed').delete().eq('dow', Number(dow)).eq('shift', shift);
    const r = del.error ? del : list.length ? await sbPersonal.from('tw_fixed').insert(list.map(person => ({ dow:Number(dow), shift, person }))) : del;
    if(r.error){ console.error(r.error); toast('⚠ השינוי לא נשמר'); } else toast('נשמר');
    await twLoadBase(); twRender();
  }));

  // (ask: a question before the step; heavy steps are never one tap: the review agents 2026-11-14)
  const on = (id, fn, ask) => { const b = box.querySelector(id); if(b) b.addEventListener('click', async () => { if(TW.busy) return; if(ask && !(await twConfirm(ask()))) return; TW.busy = true; b.disabled = true; try { await fn(); } catch(e){ console.error(e); toast('⚠ הפעולה נכשלה'); } TW.busy = false; await twLoadBase(); await twLoadPeriod(); twRender(); }); };
  on('#tw-build', async () => {
    const hist = await twNightHist();
    const seed = Math.floor(Math.random() * 2147483647), input = { people:TW.people.filter(p => p.active), options:TW.options, fixed:TW.fixed, hand:TW.asg.filter(a => a.by_hand), hist };
    const res = twSolve(Object.assign({ start:TW.period, seed }, input));
    const lg = await sbPersonal.from('tw_build_log').insert({ period:TW.period, seed, input, result:{ rows:res.rows, lines:res.lines, missing:res.missing } });
    if(lg.error && !/tw_build_log|PGRST205|42P01/.test(JSON.stringify(lg.error))) throw lg.error;          // (a database before scheduling-v80.sql has no log: build anyway)
    // a published schedule goes back to a draft first, so that the staff does not get a notice for every row of the new build
    if((twPeriodRow() || {}).status === 'published'){ const un = await sbPersonal.from('tw_period').update({ status:'built', published_at:null }).eq('start', TW.period); if(un.error) throw un.error; }
    const del = await sbPersonal.from('tw_assignment').delete().eq('period', TW.period).eq('by_hand', false); if(del.error) throw del.error;
    if(res.rows.length){ const ins = await sbPersonal.from('tw_assignment').insert(res.rows.map(r => Object.assign({ period:TW.period }, r))); if(ins.error) throw ins.error; }
    const up = await sbPersonal.from('tw_period').update({ status:'built', built_at:new Date().toISOString(), report:{ lines:res.lines } }).eq('start', TW.period); if(up.error) throw up.error;
    // (the UX review 2026-11-19: a line above the table instead of a toast that covered it)
    TW.justBuilt = true;
    TW.step = 3;
  }, () => {
    const pub = (twPeriodRow() || {}).status === 'published', auto = TW.asg.filter(a => !a.by_hand).length;
    const notYet = TW.people.filter(x => x.active && !TW.subs.some(s => s.person === x.id)).length, dl = (twPeriodRow() || {}).deadline, early = dl && new Date(dl) > new Date();
    const before = `${notYet ? `${notYet === 1 ? 'עובדת אחת עוד לא הגישה' : `${notYet} עובדות עוד לא הגישו`}. ` : ''}${early ? `ההגשה פתוחה עד ${new Date(dl).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}. ` : ''}`;
    if(!TW.asg.length) return { title:before ? 'לבנות בכל זאת?' : 'לבנות את הסידור?', text:`${before}הבנייה סוגרת את ההגשה לכולן. אפשר לפתוח אותה מחדש בצעד 1.`, ok:before ? 'כן, לבנות בכל זאת' : 'כן, לבנות' };
    return { title:'לבנות מחדש?', text:`${pub ? 'הסידור כבר פורסם לצוות. בנייה מחדש תחזיר אותו לטיוטה, והצוות לא יראה אותו עד הפרסום הבא. ' : ''}${auto} השיבוצים האוטומטיים יוחלפו. שיבוצים שנעשו ביד יישארו.`, ok:'כן, לבנות מחדש', danger:pub };
  });
  on('#tw-publish', () => twPublishAsk());
  on('#tw-reopen', async () => { const up = await sbPersonal.from('tw_period').update({ status:'open' }).eq('start', TW.period); if(up.error) throw up.error; toast('ההגשה נפתחה מחדש'); TW.step = 1; },
    () => ({ title:'לפתוח את ההגשה מחדש?', text:'הצוות יוכל לשנות העדפות. הסידור שנבנה נשאר, ואפשר לבנות מחדש אחר כך.', ok:'כן, לפתוח' }));
  // (the demo fill is not for somebody with a sign-in: they hand in themselves)
  on('#tw-demo', async () => {
    for(const p of TW.people.filter(x => x.active && !x.staff_id && !TW.subs.some(s => s.person === x.id))){ if(!(await twSaveOptions(p, twDemoOptions(p)))) throw new Error('demo options'); }
    toast('מולאו העדפות לדוגמה');
  });
}
// publishing: the server checks the schedule first (scheduling-v80.sql: tw_publish). A broken rule stops it; missing places and the like
// are shown, and the builder publishes anyway or goes back to fix
// one question before publishing, with what the check found in it (the UX review 2026-11-19: it asked twice in a row). The check of the
// server first (scheduling-v80.sql: tw_publish_check); a problem that stops it is shown by twPublish as before.
async function twPublishAsk(){
  const base = 'כל הצוות יראה את הסידור, ומי שיש לה מייל תקבל הודעה עם המשמרות שלה.';
  let r; try { r = await sbPersonal.rpc('tw_publish_check', { p_period:TW.period }); } catch(e){ r = { error:e }; }
  if(r.error){ if(await twConfirm({ title:'לפרסם לכל הצוות?', text:base, ok:'כן, לפרסם' })) await twPublish(false); return; }          // (a database before v80)
  const d = r.data || {}, errs = d.errors || [], warns = d.warnings || [];
  if(errs.length){ await twPublish(false); return; }
  const ok = await new Promise(resolve => {
    let done = false; const end = v => { if(done) return; done = true; resolve(v); };
    const list = warns.length ? `<div class="pnote">כדאי לדעת לפני הפרסום:</div><ul class="tw-chk">${warns.slice(0, 30).map(x => `<li>${pEsc(x)}</li>`).join('')}${warns.length > 30 ? `<li>ועוד ${warns.length - 30}</li>` : ''}</ul>` : '';
    const sh = twSheet(`<h2>לפרסם לכל הצוות?</h2><p class="confirm-text">${pEsc(base)}</p>${list}
      <div class="confirm-actions"><button type="button" class="btn" data-tw-yes>${warns.length ? 'לפרסם בכל זאת' : 'כן, לפרסם'}</button><button type="button" class="btn ghost" data-tw-fix>${warns.length ? 'לתיקונים' : 'חזרה'}</button></div>`);
    sh._onClose = () => end(false);
    const obs = new MutationObserver(() => { if(!document.body.contains(sh)){ obs.disconnect(); end(false); } }); obs.observe(document.body, { childList:true });
    sh.querySelector('[data-tw-yes]').addEventListener('click', () => { end(true); sh.remove(); });
    sh.querySelector('[data-tw-fix]').addEventListener('click', () => { if(warns.length) TW.step = 3; end(false); sh.remove(); });
  });
  if(ok) await twPublish(true);
}
async function twPublish(confirm){
  let r = await sbPersonal.rpc('tw_publish', { p_period:TW.period, p_confirm:confirm });
  if(r.error && /PGRST202|Could not find the function/.test(JSON.stringify(r.error))){          // (a database before scheduling-v80.sql)
    r = await sbPersonal.from('tw_period').update({ status:'published', published_at:new Date().toISOString() }).eq('start', TW.period);
    if(r.error) throw r.error; toast('הסידור פורסם לצוות'); TW.step = null; TW.tab = 'sched'; TW.board = true; return;
  }
  if(r.error) throw r.error;
  const d = r.data || {};
  if(d.published){ toast('הסידור פורסם לצוות'); TW.step = null; TW.tab = 'sched'; TW.board = true; return; }
  const errs = d.errors || [], warns = d.warnings || [];
  const list = a => `<ul class="tw-chk">${a.slice(0, 30).map(x => `<li>${pEsc(x)}</li>`).join('')}${a.length > 30 ? `<li>ועוד ${a.length - 30}</li>` : ''}</ul>`;
  const sh = twSheet(errs.length
    ? `<h2>אי אפשר לפרסם עדיין</h2><div class="pstatus bad">בסידור יש ${errs.length === 1 ? 'בעיה אחת' : errs.length + ' בעיות'} שצריך לתקן לפני הפרסום:</div>${list(errs)}
       <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" id="tw-chk-fix">לתיקונים</button></div>`
    : `<h2>לפני הפרסום</h2><div class="pnote">הבדיקה מצאה דברים שכדאי לדעת. אפשר לפרסם בכל זאת, או לחזור ולתקן.</div>${list(warns)}
       <div class="confirm-actions"><button type="button" class="btn" id="tw-chk-go">לפרסם בכל זאת</button><button type="button" class="btn ghost" id="tw-chk-fix">לתיקונים</button></div>`);
  sh.querySelector('#tw-chk-fix').addEventListener('click', () => { sh.remove(); TW.step = 3; twRender(); window.scrollTo(0, 0); });
  const go = sh.querySelector('#tw-chk-go');
  if(go) go.addEventListener('click', async () => { go.disabled = true; sh.remove(); try { await twPublish(true); } catch(e){ console.error(e); toast('⚠ הפרסום נכשל'); } await twLoadBase(); await twLoadPeriod(); twRender(); });
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
// The pilot's rules (Guy 19.11): the weekly shifts of each person, and one shift may move between the two weeks (4 then 2) while the two
// weeks together stay; one night a week for everybody, and two people of the two weeks get one more night, in turn: who had it the fewest
// times in the last periods ("hist") first; mornings and afternoons balanced; never a double in a row; a close pair only if she agreed
// to it, and then only when needed. When a place has nobody left, somebody who opened it gets a shift above her number ("over"), and the
// builder sees it.
// a small random-number maker with a seed (mulberry32): the same seed gives the same numbers, so a build can be made again exactly
function twRng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function twSolve({ start, people, options, fixed, hand, seed, hist }){
  const rnd = twRng(seed == null ? 1 : seed);
  hist = hist || {};
  const days = twDays(start), offer = {}, di = {};          // (di: the number of a day inside the two weeks, 0–13)
  days.forEach((d, i) => { di[d] = i; });
  const onlyCan = {};
  options.forEach(o => { if(o.day in di){ (offer[o.person] = offer[o.person] || new Set()).add(di[o.day] + o.shift); if(o.level === 'can') (onlyCan[o.person] = onlyCan[o.person] || new Set()).add(di[o.day] + o.shift); } });
  const isCan = (pid, pl) => !!(onlyCan[pid] && onlyCan[pid].has(pl.k));
  const firstYes = (list, pl) => { const y = list.filter(p => !isCan(p.id, pl)); return y.length ? y : list; };
  // the pair rule of two places, once (block / close / free) — per person, because the close pairs depend on what she agreed to
  const pairMemo = {};
  const pairOf = (pid, a, b) => { const key = pid + a.k + '|' + b.k; if(!(key in pairMemo)) pairMemo[key] = twPair(pid, a.day, a.shift, b.day, b.shift, a.a, b.a); return pairMemo[key]; };
  const nightOffer = {};          // per person and week: was a night offered at all
  options.forEach(o => { if(o.shift === 'N' && o.day in di) (nightOffer[o.person] = nightOffer[o.person] || [false, false])[di[o.day] < 7 ? 0 : 1] = true; });
  const fixedOf = {}; (fixed || []).forEach(f => { (fixedOf[f.dow + '|' + f.shift] = fixedOf[f.dow + '|' + f.shift] || []).push(f.person); });
  const slotW = (day, shift) => ((twSlots(day).find(s => s.shift === shift) || {}).w || 1);
  // what is there before the automatic part: the builder's own placements, and then the fixed people of each shift (unless it clashes)
  const pre = hand.filter(a => a.day in di).map(a => ({ person:a.person, day:a.day, shift:a.shift, fixedRow:false, a }));
  days.forEach(day => twSlots(day).forEach(s => {
    (fixedOf[dowOf(day) + '|' + s.shift] || []).forEach(pid => {
      if(!people.some(p => p.id === pid) || pre.some(a => a.person === pid && a.day === day && a.shift === s.shift)) return;
      if(pre.some(a => a.person === pid && twPair(pid, a.day, a.shift, day, s.shift, a.a) === 'block')) return;
      pre.push({ person:pid, day, shift:s.shift, fixedRow:true });
    });
  }));
  const places = [];          // one entry per place to fill
  days.forEach(day => twSlots(day).forEach(s => {
    const taken = pre.filter(a => a.day === day && a.shift === s.shift).length;
    for(let i = taken; i < s.need; i++) places.push({ day, i:di[day], k:di[day] + s.shift, shift:s.shift, w:s.w, must:true, week:di[day] < 7 ? 0 : 1 });
  }));
  const quota = p => p.per_week * 2;
  let best = null;
  for(let round = 0; round < 150; round++){
    const got = {}, load = {}, wload = {}, nights = {}, kinds = {};
    people.forEach(p => { got[p.id] = []; load[p.id] = 0; wload[p.id] = [0, 0]; nights[p.id] = [0, 0]; kinds[p.id] = { M:0, A:0, N:0, W:0 }; });
    const doubles = new Set();          // people with two nights in one of the weeks (two people in the two weeks)
    const put = (pid, pl) => { got[pid].push(pl); load[pid] += pl.w; wload[pid][pl.week] += pl.w; kinds[pid][pl.shift]++; if(pl.shift === 'N'){ nights[pid][pl.week]++; if(nights[pid][pl.week] === 2) doubles.add(pid); } };
    pre.forEach(a => { if(got[a.person]) put(a.person, { day:a.day, i:di[a.day], k:di[a.day] + a.shift, shift:a.shift, w:slotW(a.day, a.shift), week:di[a.day] < 7 ? 0 : 1, a:a.a }); });
    const nightOk = (p, pl) => {
      if(pl.shift !== 'N') return true;
      const n = nights[p.id][pl.week];
      if(n >= 2) return false;
      if(n === 1 && (doubles.has(p.id) || doubles.size >= 2)) return false;
      return true;
    };
    const free = (p, pl) => !got[p.id].some(g => pairOf(p.id, g, pl) === 'block');
    const can = (p, pl) => {
      if(!(offer[p.id] && offer[p.id].has(pl.k))) return false;
      if(load[p.id] + pl.w > quota(p)) return false;
      if(wload[p.id][pl.week] + pl.w > p.per_week + 1) return false;
      return free(p, pl) && nightOk(p, pl);
    };
    // above her number, only when the place has nobody else: somebody who opened it, at most two more in the two weeks
    // (also a second night beyond the two people of the turn: an empty night is worse; the builder sees it in the report)
    const canOver = (p, pl) => !!(offer[p.id] && offer[p.id].has(pl.k)) && load[p.id] + pl.w <= quota(p) + 2 && wload[p.id][pl.week] + pl.w <= p.per_week + 2 && free(p, pl) && (pl.shift !== 'N' || nights[p.id][pl.week] < 2);
    const closeOf = (p, pl) => got[p.id].some(g => pairOf(p.id, g, pl) === 'close');
    const score = (p, pl) => {
      let s = rnd() * 3;
      s += (1 - load[p.id] / Math.max(1, quota(p))) * 10;                      // the one who is furthest from their shifts first
      if((fixedOf[dowOf(pl.day) + '|' + pl.shift] || []).includes(p.id)) s += 50;             // the person's fixed shift
      if(pl.shift === 'N') s += nights[p.id][pl.week] === 0 ? 8 : -6 - (hist[p.id] || 0) * 4;          // a first night of the week; a second one by turn
      s -= Math.abs(wload[p.id][pl.week] + pl.w - p.per_week) * 1.5;            // close to the weekly number
      if(pl.shift === 'M' || pl.shift === 'A') s -= kinds[p.id][pl.shift] * 1.5;          // mornings and afternoons balanced
      if(closeOf(p, pl)) s -= 12;                                               // a close pair she agreed to: only when needed
      return s;
    };
    const open = places.map(pl => Object.assign({}, pl)), filled = [], missing = [];
    while(open.length){
      let bi = 0, bc = null;
      for(let i = 0; i < open.length; i++){ const c = people.filter(p => can(p, open[i])); if(bc === null || c.length < bc.length){ bi = i; bc = c; if(!c.length) break; } }
      const pl = open.splice(bi, 1)[0];
      if(!bc.length){
        const ov = people.filter(p => canOver(p, pl));
        if(!ov.length){ missing.push(pl); continue; }
        const who = firstYes(ov, pl).map(p => [score(p, pl) - (load[p.id] - quota(p)) * 20, p]).sort((a, b) => b[0] - a[0])[0][1];
        put(who.id, pl); filled.push({ pl, pid:who.id, over:true }); continue;
      }
      const who = firstYes(bc, pl).map(p => [score(p, pl), p]).sort((a, b) => b[0] - a[0])[0][1];
      put(who.id, pl); filled.push({ pl, pid:who.id });
    }
    // repair: a place that nobody could take — somebody who opened it gives one of her shifts to another person who can take that one,
    // and takes the empty place instead (one move deep; the builder's own and the fixed placements never move)
    const unput = (pid, pl) => { const i = got[pid].indexOf(pl); if(i < 0) return; got[pid].splice(i, 1); load[pid] -= pl.w; wload[pid][pl.week] -= pl.w; kinds[pid][pl.shift]--; if(pl.shift === 'N'){ nights[pid][pl.week]--; if(!nights[pid].some(n => n >= 2)) doubles.delete(pid); } };
    for(let mi = missing.length - 1; mi >= 0; mi--){
      const pl = missing[mi]; let done = false;
      for(const p of firstYes(people.filter(x => offer[x.id] && offer[x.id].has(pl.k)), pl)){
        if(done) break;
        for(const f of filled.filter(x => x.pid === p.id && !x.over)){
          unput(p.id, f.pl);
          if(can(p, pl)){
            const r = firstYes(people.filter(x => x.id !== p.id && can(x, f.pl)), f.pl).map(x => [score(x, f.pl), x]).sort((a, b) => b[0] - a[0])[0];
            if(r){
              put(r[1].id, f.pl);
              if(can(p, pl)){ f.pid = r[1].id; put(p.id, pl); filled.push({ pl, pid:p.id }); missing.splice(mi, 1); done = true; break; }
              unput(r[1].id, f.pl);          // (her move made the other one's place impossible, for example a third person with two nights)
            }
          }
          put(p.id, f.pl);
        }
      }
    }
    let cost = missing.reduce((n, pl) => n + (pl.shift === 'N' ? 1200 : 1000), 0) + filled.filter(f => isCan(f.pid, f.pl)).length * 3 + filled.filter(f => f.over).length * 60;
    filled.forEach(f => { if(got[f.pid].some(g => g !== f.pl && pairOf(f.pid, g, f.pl) === 'close')) cost += 10; });
    people.forEach(p => {
      cost += Math.max(0, quota(p) - load[p.id]) * 40;
      [0, 1].forEach(w => { cost += Math.abs(wload[p.id][w] - p.per_week) * 6; if(nights[p.id][w] === 0 && nightOffer[p.id] && nightOffer[p.id][w]) cost += 30; });
      if(doubles.has(p.id)) cost += 4 + (hist[p.id] || 0) * 6;
      const d = Math.abs(kinds[p.id].M - kinds[p.id].A); if(d > 1) cost += (d - 1) * 4;
    });
    if(!best || cost < best.cost) best = { cost, filled, missing, load, nights, doubles:[...doubles] };
    if(best.cost === 0) break;
  }
  const lines = [];
  const needAll = places.reduce((n, pl) => n + pl.w, 0) + pre.reduce((n, a) => n + slotW(a.day, a.shift), 0), haveAll = people.reduce((n, p) => n + quota(p), 0);
  if(haveAll < needAll) lines.push(`לפי מספר המשמרות של כל הצוות יש ${haveAll} משמרות בשבועיים, והסידור דורש ${needAll}. חסרות ${needAll - haveAll} גם כשכולן פנויות.`);
  const miss = {};
  best.missing.forEach(pl => { miss[pl.k] = miss[pl.k] || { pl, n:0 }; miss[pl.k].n++; });
  Object.values(miss).sort((a, b) => a.pl.i - b.pl.i).forEach(m => lines.push(`${m.n === 1 ? 'חסר שיבוץ אחד' : `חסרים ${m.n} שיבוצים`}: ${DOW_NAMES[dowOf(m.pl.day)]} ${twShort(m.pl.day)}, ${TW_SHIFT[m.pl.shift]}`));
  people.forEach(p => { const l = best.load[p.id], q = quota(p); if(l < q) lines.push(`${twDisp(p)}: ${l} מתוך ${q} משמרות בשבועיים`); else if(l > q) lines.push(`${twDisp(p)}: ${l} משמרות, מעל המינימום (${q}), כי חסרו עובדות שסימנו`); });
  people.forEach(p => { if(!offer[p.id] || !offer[p.id].size) lines.push(`${twDisp(p)}: לא נפתחו משמרות, ולכן אין שיבוצים`); });
  if(best.doubles.length) lines.push(`לילה נוסף בשבועיים (התור של הלילה הנוסף): ${best.doubles.map(id => twDisp(people.find(p => p.id === id))).join(', ')}`);
  [0, 1].forEach(w => { const none = people.filter(p => best.nights[p.id][w] === 0 && offer[p.id] && offer[p.id].size).map(twDisp); if(none.length) lines.push(`שבוע ${w + 1}, בלי לילה: ${none.join(', ')}`); });
  const cans = best.filled.filter(f => isCan(f.pid, f.pl)).length;
  if(cans) lines.push(`${cans === 1 ? 'שיבוץ אחד נעשה' : cans + ' שיבוצים נעשו'} במשמרות שסומנו "אפשרי", כי לא היה מי שסימן "כן".`);
  if(!lines.length) lines.push('כל המשמרות מלאות, וכל העובדות קיבלו את מספר המשמרות שלהן.');
  const rows = pre.filter(a => a.fixedRow).map(a => ({ day:a.day, shift:a.shift, person:a.person, third:false, fixed:true, by_hand:false }))
    .concat(best.filled.map(f => ({ day:f.pl.day, shift:f.pl.shift, person:f.pid, third:false, fixed:false, by_hand:false })));
  return { rows, lines, missing:best.missing.length, over:best.filled.filter(f => f.over).length };
}

// ---- 4. the admin: the builders' queue, the two weeks, the people and their sign-in (Guy 2026-11-14; scheduling-v79.sql, core/core-v2.sql)
const twSetting = (k, d) => { const r = (TW.settings || []).find(x => x.key === k); return r ? r.value : d; };
async function twLoadAdmin(){
  TW.priv = {}; TW.staff = [];
  if(!TW.boss) return;
  const [pv, st] = await Promise.all([sbPersonal.from('staff_private').select('*'), sbPersonal.from('staff').select('id,display_name,kind,active')]);
  (pv.data || []).forEach(r => { TW.priv[r.staff_id] = r; });
  TW.staff = st.data || [];
}
function twTeamHtml(){
  const latest = TW.periods.map(p => p.start).sort().pop(), today = isoDate(new Date());
  let next = latest ? addDays(latest, 14) : addDays(today, (7 - dowOf(today)) % 7);
  while(addDays(next, 13) < today) next = addDays(next, 14);
  const act = TW.people.filter(x => x.active), queue = (twSetting('queue', []) || []).filter(id => act.some(p => p.id === id));
  const od = Number(twSetting('open_days', 10)), cd = Number(twSetting('close_days', 5));
  const sel = (id, list, v) => `<select id="${id}">${list.map(n => `<option${n === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
  const st = { open:'פתוח להגשה', built:'הסידור עוד לא פורסם', published:'פורסם' };
  const signin = x => {
    const pv = x.staff_id ? (TW.priv[x.staff_id] || {}) : {};
    if(pv.auth_user_id) return `<span class="tw-ok">יש כניסה אישית</span>`;
    if(pv.email) return `<span dir="ltr">${pEsc(pv.email)}</span> <button type="button" class="btn small" data-tw-login="${x.staff_id}">יצירת כניסה</button> <button type="button" class="btn ghost small" data-tw-mail="${x.id}">שינוי מייל</button>`;
    return `<button type="button" class="btn ghost small" data-tw-mail="${x.id}">הוספת מייל</button>`;
  };
  const inRoster = new Set(TW.people.map(p => p.staff_id).filter(Boolean));
  const admins = TW.staff.filter(s => s.active && (s.kind === 'admin' || (TW.priv[s.id] || {}).is_admin) && !inRoster.has(s.id));
  const fold = (k, title, inner) => `<details class="tw-fixed-box" data-tw-fold="${k}"${(TW.folds || {})[k] ? ' open' : ''}><summary>${title}</summary>${inner}</details>`;
  // the team first; the rest is folded (the review agents 2026-11-14)
  return `<h3 class="tw-h">הצוות <small>(${act.length})</small></h3>
    <details class="tw-fixed-box tw-add-fold" data-tw-fold="add"${(TW.folds || {}).add ? ' open' : ''}><summary>+ הוספת עובדת</summary>
    <div class="tw-form tw-add"><label>שם פרטי <input type="text" id="tw-new-name" maxlength="30" autocomplete="off"></label>
      ${TW.prefsOn ? '<label>שם משפחה <input type="text" id="tw-new-last" maxlength="40" autocomplete="off"></label>' : ''}
      <label>מייל (לא חובה) <input type="email" id="tw-new-mail" maxlength="80" autocomplete="off" dir="ltr"></label>
      ${TW.prefsOn ? '<label>טלפון (לא חובה) <input type="tel" id="tw-new-phone" maxlength="20" autocomplete="off" dir="ltr"></label>' : ''}
      <label>משמרות בשבוע <select id="tw-new-pw">${[1, 2, 3, 4, 5].map(n => `<option${n === 3 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>תפקיד <select id="tw-new-role"><option value="staff" selected>מדריכה</option><option value="both">מנהלת מערכת ומדריכה</option><option value="admin">מנהלת מערכת בלבד</option></select></label>
      <button type="button" class="btn" id="tw-add-person">הוספה</button></div>
    <div class="pnote">מי שיש לה מייל מקבלת כניסה אישית מיד: בפעם הראשונה נכנסים עם קוד שמגיע למייל, ובוחרים סיסמה.</div></details>
    ${fold('team', `רשימת העובדות (${act.length})`, `${TW.people.length > 7 ? '<label class="tw-search">חיפוש <input type="search" id="tw-team-q" placeholder="שם" autocomplete="off"></label>' : ''}
    <div class="tw-list" id="tw-team-list">${TW.people.map(x => `<div class="tw-row${x.active ? '' : ' off'}" data-name="${pEsc(x.name + ' ' + (x.last_name || ''))}"><b>${pEsc(x.name)}${x.last_name ? ' ' + pEsc(x.last_name) : ''}</b>
      <span class="tw-row-sub">${x.active ? signin(x) : 'הוסרה מהרשימה'}</span>
      <span class="tw-btns"><label class="tw-inline">משמרות בשבוע <select data-tw-pw="${x.id}">${[1, 2, 3, 4, 5].map(n => `<option${n === x.per_week ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      ${TW.prefsOn && x.active ? `<button type="button" class="btn ghost small" data-tw-det="${x.id}">פרטים</button>` : `<button type="button" class="btn ghost small tw-rm" data-tw-act="${x.id}">${x.active ? 'הסרה מהצוות' : 'החזרה'}</button>`}</span></div>`).join('')}</div>`)}

    ${fold('queue', `מי בונה את הסידור${queue.length ? ` (תור של ${queue.length})` : ' (מנהלות המערכת)'}`, `
    ${queue.length ? `<ol class="tw-queue">${queue.map((id, i) => `<li><b>${i + 1}. ${pEsc(twName(id))}</b><small class="tw-q-dates">בונה את ${twL(twPeriodLabel(addDays(next, 14 * i)))}</small><span class="tw-btns">
      <button type="button" class="btn ghost small" data-tw-q-up="${i}"${i ? '' : ' disabled aria-hidden="true" tabindex="-1" style="visibility:hidden"'} aria-label="להקדים את ${pEsc(twName(id))}">↑</button>
      <button type="button" class="btn ghost small" data-tw-q-down="${i}"${i < queue.length - 1 ? '' : ' disabled aria-hidden="true" tabindex="-1" style="visibility:hidden"'} aria-label="לאחר את ${pEsc(twName(id))}">↓</button>
      <button type="button" class="btn ghost small" data-tw-q-del="${i}" aria-label="להוציא את ${pEsc(twName(id))} מהתור">✕</button></span></li>`).join('')}</ol>`
      : '<div class="pstatus ok">אין תור: מנהלות המערכת בונות כל סידור. אפשר להוסיף עובדות לתור, ואז כל שבועיים בונה הבאה בתור.</div>'}
    ${act.some(p => !queue.includes(p.id)) ? `<div class="tw-form"><label>מי בונה את הסידור של ${twL(twPeriodLabel(addDays(next, 14 * queue.length)))}? <select id="tw-q-add"><option value="">(לבחור)</option>${act.filter(p => !queue.includes(p.id)).map(p => `<option value="${p.id}">${pEsc(p.name)}</option>`).join('')}</select></label></div>` : ''}
    <div class="tw-form tw-days">ההגשה נפתחת ${sel('tw-open-days', [5, 7, 10, 14, 17, 21, 28], od)} ימים לפני שהשבועיים מתחילים, ונסגרת ${sel('tw-close-days', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14], cd)} ימים לפני, בלילה שאחרי, ב-${twL('05:00')}.</div>`)}

    ${fold('periods', 'השבועיים', `
    ${TW.periods.length ? `<div class="tw-list">${TW.periods.map(x => `<div class="tw-row"><b>${twPeriodLabel(x.start)}</b><span>${st[x.status] || ''}${x.deadline && x.status === 'open' ? ` · ההגשה עד ${new Date(x.deadline).toLocaleDateString('he-IL', { day:'numeric', month:'numeric' })}` : ''}</span>
      <label class="tw-inline">בונה: <select data-tw-pb="${x.start}"><option value="">מנהלות המערכת</option>${act.map(p => `<option value="${p.id}"${x.builder === p.id ? ' selected' : ''}>${pEsc(p.name)}</option>`).join('')}</select></label></div>`).join('')}</div>` : '<div class="pnote">עדיין לא נפתחו שבועיים.</div>'}
    <div class="tw-form"><label>פתיחה ידנית: שבועיים מיום ראשון <b>${twShort(next)}</b>, בונה: <select id="tw-new-builder"><option value="">מנהלות המערכת</option>${act.map(x => `<option value="${x.id}">${pEsc(x.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn" id="tw-new-period" data-start="${next}">פתיחה להגשה</button></div>`)}

    ${fold('admins', `מנהלות מערכת${admins.length ? ` (${admins.length})` : ''}`, `
    <div class="pnote">מנהלות מערכת מוסיפות צוות, קובעות מכסות ואת התור של מי בונה את הסידור. כאן מופיעות מי שלא משובצות לסידור. מוסיפים אותן בטופס ההוספה למעלה.</div>
    ${admins.length ? `<div class="tw-list">${admins.map(s => `<div class="tw-row"><b>${pEsc(s.display_name)}</b><span class="tw-row-sub">${(TW.priv[s.id] || {}).auth_user_id ? '<span class="tw-ok">יש כניסה אישית</span>' : (TW.priv[s.id] || {}).email ? `<span dir="ltr">${pEsc(TW.priv[s.id].email)}</span> <button type="button" class="btn small" data-tw-login="${s.id}">יצירת כניסה</button>` : ''}</span></div>`).join('')}</div>` : ''}`)}
    ${typeof twViewAsPickHtml === 'function' ? twViewAsPickHtml(fold) : ''}
    ${fold('wa', 'קבוצת הוואטסאפ של הצוות', `<p class="tw-step-say">הקישור לקבוצה (בוואטסאפ: פרטי הקבוצה, ואז "הזמנה באמצעות קישור"). כשיש קישור, ליד כפתור השליחה ב"הודעות" מופיע כפתור שפותח את הקבוצה.</p>
      <div class="tw-form"><label>קישור <input type="url" id="tw-wa-link" dir="ltr" maxlength="200" placeholder="https://chat.whatsapp.com/..." value="${pEsc(String(twSetting('wa_group', '') || ''))}"></label></div>
      <div class="tw-actions"><button type="button" class="btn" id="tw-wa-save">שמירה</button></div>`)}
    ${fold('weekend', 'שעות סוף השבוע', (() => { const wh = twSetting('weekend_hours', null) || {}, g = (k, part, d) => ((wh[k] || {})[part]) || d;
      return `<p class="tw-step-say">משמרת סוף השבוע מתחילה בשישי (או בערב חג) ומסתיימת במוצאי שבת (או חג). השעות שונות בחורף ובקיץ.</p>
      ${[['winter', 'חורף'], ['summer', 'קיץ']].map(([k, w]) => `<div class="tw-form"><b>${w}</b><label>מתחילה <input type="text" inputmode="numeric" maxlength="5" dir="ltr" data-tw-wh="${k}|start" value="${g(k, 'start', '14:00')}"></label><label>מסתיימת <input type="text" inputmode="numeric" maxlength="5" dir="ltr" data-tw-wh="${k}|end" value="${g(k, 'end', '20:30')}"></label></div>`).join('')}
      <h4 class="tw-h">מתי עוברים לשעות הקיץ ובחזרה</h4>
      <div class="pnote">התאריכים נקבעים לבד לפי שעון הקיץ בישראל. אפשר לשנות אותם, אם השעות של המשמרות מתחלפות ביום אחר.</div>
      ${[0, 1].map(k => { const y0 = new Date().getFullYear(), y = (twToday() >= twSummerAuto(y0).end ? y0 + 1 : y0) + k, dd = twSummerDates(y), auto = twSummerAuto(y), own = dd.start !== auto.start || dd.end !== auto.end;
        return `<div class="tw-form tw-dst"><b>${y}</b><label>שעות הקיץ מ- <input type="date" data-tw-dst="${y}|start" value="${dd.start}"></label><label>עד <input type="date" data-tw-dst="${y}|end" value="${dd.end}"></label>${own ? `<small>(שעון הקיץ עצמו: ${twShort(auto.start)} עד ${twShort(auto.end)})</small>` : ''}</div>`; }).join('')}
      <div class="tw-actions"><button type="button" class="btn" id="tw-wh-save">שמירה</button></div>
      <div class="pnote">השינוי חל על סידורים שנבנים מעכשיו.</div>`; })())}
    ${twIsAdmin() ? fold('cfg', 'הגדרות המוסד (צפייה)', twCfgHtml()) : ''}`;
}
// ---- 8. the organisation's settings, read only (stage 1, scheduling-v83.sql; editing comes with the setup flow, stage 3 — Guy 2026-11-17)
const twIsAdmin = () => !!(srv.profile && srv.profile.admin);
const TW_DAY_TYPE = { weekday:'ימי חול', fri:'שישי', sat:'שבת', eve:'ערב חג', holiday:'חג' };
const TW_CYCLE = { week:'כל שבוע', '2weeks':'כל שבועיים', month:'כל חודש' };
const TW_RULE_KIND = { hard:'כללים קשיחים (אסור לעבור)', soft:'כללים רכים (עם משקל)', warn:'בהגשה (אזהרה בלבד)' };
const TW_PARAM = { hours:n => `${n} שעות`, long_from:n => `משמרת ארוכה: מעל ${n} שעות`, days:n => `${n} ימים`, shifts:n => `${n} משמרות`, nights:n => `${n} לילות`,
  people:n => `${n} עובדים`, over:n => `עד ${n} מעל המכסה`, midweek:n => `${n} באמצע השבוע`, weekends:n => `${n} סופי שבוע`, gap:n => `פער של ${n} לכל היותר`,
  periods:n => `לפי ${n} תקופות אחורה`, factor:n => `פי ${n}` };
function twCfgHtml(){
  const v = TW.cfgView;
  if(v === undefined) return '<div class="pnote">טוען...</div>';
  if(v === null) return '<div class="pnote">ההגדרות עוד לא נשמרו במסד הזה.</div>';
  if(!v.cfg) return '<div class="pnote">למוסד עוד אין הגדרות.</div>';
  const c = v.cfg, dd = iso => { const t = parseIso(iso); return `${t.getDate()}/${t.getMonth() + 1}/${t.getFullYear()}`; };
  const head = `<div class="pnote">${c.valid_from > '2001-01-01' ? `חלות מהתקופה שמתחילה ב-${twL(dd(c.valid_from))}` : 'חלות מההתחלה'}${c.draft ? ' · <b>טיוטה</b>: המספרים יתעדכנו אחרי הפגישה עם המוסד' : ''}</div>
    <ul class="tw-cfg-list"><li>מחזור: <b>${TW_CYCLE[c.cycle] || c.cycle}</b></li>
      <li>ההגשה נפתחת ${twL(c.open_days)} ימים לפני התקופה, ונסגרת ${twL(c.close_days)} ימים לפני, בלילה, ב-${twL('05:00')}</li>
      <li>תזכורת ${twL(c.remind_hours)} שעות לפני שההגשה נסגרת</li>
      <li>לפרסם לפחות ${twL(c.publish_days)} ימים לפני שהתקופה מתחילה</li></ul>`;
  const needWord = n => `${twL(n.min)}${n.extra ? ` (ועוד ${twL(n.extra)} אם יש ידיים פנויות)` : ''}`;
  const shiftRow = s => {
    const all = (s.needs || []).find(n => n.dow === -1), own = (s.needs || []).filter(n => n.dow >= 0);
    return `<tr><td><b>${pEsc(s.name)}</b></td><td data-l="שעות">${twL(s.starts + '–' + s.ends)}${s.end_day ? ` <small>(${s.end_day === 1 ? 'עד היום שאחרי' : `עד ${s.end_day} ימים אחרי`})</small>` : ''}</td>
      <td data-l="כמה צריך">${all ? needWord(all) : '–'}${own.map(n => `<br><small>ב${DOW_NAMES[n.dow]}: ${needWord(n)}</small>`).join('')}</td>
      <td data-l="נספרת במכסה">${Number(s.weight) === 1 ? '1' : twL(Number(s.weight))}</td></tr>`;
  };
  const houses = (v.houses || []).map(h => {
    const mine = (v.shifts || []).filter(s => s.house === h.id);
    const groups = Object.keys(TW_DAY_TYPE).map(dt => [dt, mine.filter(s => s.day_type === dt)]).filter(([, l]) => l.length);
    return `<h4 class="tw-h">${pEsc(h.name)} <small>(${twL(h.people)} עובדות${h.extra_week_cap != null ? ` · עד ${twL(h.extra_week_cap)} מקומות נוספים בשבוע` : ''})</small></h4>
      ${groups.map(([dt, l]) => `<div class="tw-cfg-day">${TW_DAY_TYPE[dt]}</div><div class="tw-scroll"><table class="tw-cfg-table"><thead><tr><th>משמרת</th><th>שעות</th><th>כמה צריך</th><th>נספרת במכסה</th></tr></thead><tbody>${l.map(shiftRow).join('')}</tbody></table></div>`).join('')}`;
  }).join('');
  const rules = Object.keys(TW_RULE_KIND).map(k => [k, (v.rules || []).filter(r => r.kind === k && r.on)]).filter(([, l]) => l.length).map(([k, l]) =>
    `<div class="tw-cfg-day">${TW_RULE_KIND[k]}</div><ul class="tw-cfg-rules">${l.map(r => `<li class="${r.on ? 'on' : 'off'}"><span aria-hidden="true">${r.on ? '✓' : '–'}</span> ${pEsc(r.label)}${Object.entries(r.params || {}).map(([p, n]) => ` <small>· ${TW_PARAM[p] ? TW_PARAM[p](twL(n)) : twL(n)}</small>`).join('')}${r.on ? '' : ' <small>(כבוי)</small>'}</li>`).join('')}</ul>`).join('');
  const hol = (v.holidays || []).filter(h => h.day >= isoDate(new Date())).slice(0, 6);
  return `${head}${houses}<h4 class="tw-h">כללים</h4>${rules}
    ${hol.length ? `<h4 class="tw-h">החגים הקרובים</h4><ul class="tw-cfg-list">${hol.map(h => `<li>${pEsc(h.name)}: ${twL(dd(h.day))}</li>`).join('')}</ul><div class="pnote">חג נספר כמו שבת, וערב חג כמו שישי.</div>` : ''}
    <div class="pnote">לצפייה בלבד. השינויים ייעשו באשף ההגדרה, בשלב הבא.</div>`;
}
async function twCfgLoad(){
  let r; try { r = await sbPersonal.rpc('tw_cfg_view', { p_day:isoDate(new Date()) }); } catch(e){ r = { error:e }; }
  TW.cfgView = r.error ? null : (r.data || { cfg:null });
  if(r.error) console.warn('tw_cfg_view', r.error);
  twKeepScroll();
}const twErrWord = e => { const m = String((e && e.message) || e || ''); return /already on the list/.test(m) ? 'הכתובת הזו כבר ברשימה' : /not valid/.test(m) ? 'כתובת המייל לא תקינה' : /already signs in/.test(m) ? 'לאיש הצוות הזה כבר יש כניסה' : /PGRST202|Could not find the function|core_add_staff|core_set_email|mock/.test(m) ? 'כאן אי אפשר להוסיף מייל. אפשר להוסיף בלי מייל, ולהשלים אחר כך' : ''; };
function twTeamWire(box){
  const run = async (fn, okMsg) => { if(TW.busy) return; TW.busy = true; let r; try { r = await fn(); } catch(e){ r = { error:e }; } TW.busy = false; if(r && r.error){ console.error(r.error); toast('⚠ ' + (twErrWord(r.error) || 'השינוי לא נשמר')); } else if(okMsg) toast(okMsg); await twLoadBase(); await twLoadPeriod(); twRender(); };
  // the sign-in is made at once for whoever has an e-mail (the review agents: "what the system knows, it does not ask")
  const makeLogin = async staffId => { const r = await sbPersonal.functions.invoke('create-staff-user', { body:{ staff_id:staffId } }); if(r.error || (r.data && r.data.error)) return { error:r.error || r.data.error }; return {}; };
  const saveQueue = q => run(() => sbPersonal.from('tw_settings').upsert({ key:'queue', value:q }), 'התור נשמר');
  const queue = () => (twSetting('queue', []) || []).filter(id => TW.people.some(p => p.id === id && p.active));
  box.querySelectorAll('[data-tw-fold]').forEach(d => d.addEventListener('toggle', () => { TW.folds = TW.folds || {}; TW.folds[d.dataset.twFold] = d.open; if(d.dataset.twFold === 'cfg' && d.open && TW.cfgView === undefined) twCfgLoad(); }));
  if((TW.folds || {}).cfg && TW.cfgView === undefined && twIsAdmin()) twCfgLoad();
  const q = box.querySelector('#tw-team-q');
  if(q) q.addEventListener('input', () => { const v = q.value.trim(); box.querySelectorAll('#tw-team-list .tw-row').forEach(r => { r.hidden = !!v && !r.dataset.name.includes(v); }); });
  box.querySelectorAll('[data-tw-q-up]').forEach(b => b.addEventListener('click', () => { const q2 = queue(), i = Number(b.dataset.twQUp); [q2[i - 1], q2[i]] = [q2[i], q2[i - 1]]; saveQueue(q2); }));
  box.querySelectorAll('[data-tw-q-down]').forEach(b => b.addEventListener('click', () => { const q2 = queue(), i = Number(b.dataset.twQDown); [q2[i + 1], q2[i]] = [q2[i], q2[i + 1]]; saveQueue(q2); }));
  box.querySelectorAll('[data-tw-q-del]').forEach(b => b.addEventListener('click', async () => {
    const before = queue(), q2 = before.slice(), i = Number(b.dataset.twQDel), name = twName(q2[i]); q2.splice(i, 1);
    await run(() => sbPersonal.from('tw_settings').upsert({ key:'queue', value:q2 }));
    twUndo(`${name} יצאה מהתור`, async () => { const r = await sbPersonal.from('tw_settings').upsert({ key:'queue', value:before }); if(r.error) return false; await twLoadBase(); twRender(); return true; });
  }));
  const qa = box.querySelector('#tw-q-add'); if(qa) qa.addEventListener('change', () => { if(qa.value) saveQueue(queue().concat(qa.value)); });
  [['#tw-open-days', 'open_days'], ['#tw-close-days', 'close_days']].forEach(([id, k]) => { const s = box.querySelector(id); if(s) s.addEventListener('change', () => run(() => sbPersonal.from('tw_settings').upsert({ key:k, value:Number(s.value) }), 'נשמר')); });
  box.querySelectorAll('[data-tw-pb]').forEach(s => s.addEventListener('change', () => run(() => sbPersonal.from('tw_period').update({ builder:s.value || null }).eq('start', s.dataset.twPb), 'נשמר')));
  const whs = box.querySelector('#tw-wh-save');
  if(whs) whs.addEventListener('click', () => {
    const v = {}; box.querySelectorAll('[data-tw-wh]').forEach(i => { const [k, part] = i.dataset.twWh.split('|'); (v[k] = v[k] || {})[part] = i.value || (part === 'start' ? '14:00' : '20:30'); });
    const dst = Object.assign({}, twSetting('summer_dates', null) || {});
    box.querySelectorAll('[data-tw-dst]').forEach(i => { const [y, part] = i.dataset.twDst.split('|'); if(i.value) (dst[y] = Object.assign({}, dst[y] || {}))[part] = i.value; });
    if(Object.values(dst).some(x => x.start && x.end && x.start >= x.end)){ toast('תאריך הסיום צריך להיות אחרי תאריך ההתחלה'); return; }
    Object.keys(dst).forEach(y => { const a = twSummerAuto(Number(y)); if(dst[y].start === a.start && dst[y].end === a.end) delete dst[y]; });          // (the clock's own dates are not kept)
    run(async () => { const r = await sbPersonal.from('tw_settings').upsert({ key:'weekend_hours', value:v }); if(r.error) return r; return sbPersonal.from('tw_settings').upsert({ key:'summer_dates', value:dst }); }, 'נשמר');
  });
  const was = box.querySelector('#tw-wa-save');
  if(was) was.addEventListener('click', () => { const v = box.querySelector('#tw-wa-link').value.trim();
    if(v && !/^https:\/\/chat\.whatsapp\.com\/\S+$/.test(v)){ toast('צריך קישור הזמנה לקבוצה, שמתחיל ב-https://chat.whatsapp.com/', 5000); return; }
    run(() => sbPersonal.from('tw_settings').upsert({ key:'wa_group', value:v }), v ? 'הקישור נשמר' : 'הקישור נמחק'); });
  const np = box.querySelector('#tw-new-period');
  if(np) np.addEventListener('click', () => {
    const b = box.querySelector('#tw-new-builder').value || null, st = np.dataset.start, cd = Number(twSetting('close_days', 5)), [y, m, d] = addDays(st, 1 - cd).split('-').map(Number);
    const dl = new Date(y, m - 1, d, 5, 0) > new Date() ? new Date(y, m - 1, d, 5, 0).toISOString() : null;          // (the hand-in closes close_days before, the next morning at 05:00: Guy 20.11)
    TW.period = st; run(() => sbPersonal.from('tw_period').insert(Object.assign({ start:st, builder:b }, dl ? { deadline:dl } : {})), 'השבועיים נפתחו להגשה');
  });
  box.querySelectorAll('[data-tw-pw]').forEach(s => s.addEventListener('change', () => run(() => sbPersonal.from('tw_people').update({ per_week:Number(s.value) }).eq('id', s.dataset.twPw), 'נשמר')));
  box.querySelectorAll('[data-tw-act]').forEach(b => b.addEventListener('click', async () => {
    const x = twPerson(b.dataset.twAct);
    if(x.active && !(await twConfirm({ title:`להסיר את ${x.name} מהרשימה?`, text:'לא ישובצו יותר לסידור, ולא יראו את הסידור. אפשר להחזיר לרשימה בכל רגע.', ok:'כן, להסיר' }))) return;
    run(() => sbPersonal.from('tw_people').update({ active:!x.active }).eq('id', x.id), x.active ? 'הוסרה מהרשימה' : 'הוחזרה לרשימה');
  }));
  box.querySelectorAll('[data-tw-det]').forEach(b => b.addEventListener('click', () => {
    const x = twPerson(b.dataset.twDet);
    const sh = twSheet(`<h2>הפרטים של ${pEsc(x.name)}</h2><div class="tw-form tw-form-col">
      <label>שם פרטי <input type="text" id="tw-d-name" maxlength="30" value="${pEsc(x.name)}"></label>
      <label>שם משפחה <input type="text" id="tw-d-last" maxlength="40" value="${pEsc(x.last_name || '')}"></label>
      <label>טלפון <input type="tel" id="tw-d-phone" maxlength="20" dir="ltr" value="${pEsc((TW.phones || {})[x.id] || '')}"></label>
      <div class="pnote">מייל: ${x.staff_id && (TW.priv[x.staff_id] || {}).email ? `<span dir="ltr">${pEsc(TW.priv[x.staff_id].email)}</span>` : 'אין'} <button type="button" class="btn ghost small" data-tw-mail="${x.id}">${x.staff_id && (TW.priv[x.staff_id] || {}).email ? 'שינוי מייל' : 'הוספת מייל'}</button></div></div>
      <div class="pnote">בסידור מופיע השם הפרטי. כששתיים עם אותו שם, מופיעה גם האות הראשונה של שם המשפחה.</div>
      <div class="confirm-actions"><button type="button" class="btn" id="tw-d-save">שמירה</button><button type="button" class="btn ghost" data-tw-close>ביטול</button></div>
      <div class="tw-actions tw-danger-zone"><button type="button" class="btn ghost small tw-danger" data-tw-act="${x.id}">הסרה מהצוות</button></div>`);
    sh.querySelector('[data-tw-mail]').addEventListener('click', () => { sh.remove(); const b2 = box.querySelector(`[data-tw-mail="${x.id}"]`); if(b2) b2.click(); else toast('למי שכבר יש כניסה אישית, מייל משנים דרך התמיכה', 5000); });
    sh.querySelector('[data-tw-act]').addEventListener('click', async () => {
      sh.remove();
      if(!(await twConfirm({ title:`להסיר את ${x.name} מהרשימה?`, text:'לא ישובצו יותר לסידור, ולא יראו את הסידור. אפשר להחזיר לרשימה בכל רגע.', ok:'כן, להסיר', danger:true }))) return;
      run(() => sbPersonal.from('tw_people').update({ active:false }).eq('id', x.id), 'הוסרה מהרשימה');
    });
    sh.querySelector('#tw-d-save').addEventListener('click', () => {
      const name = sh.querySelector('#tw-d-name').value.trim(), last = sh.querySelector('#tw-d-last').value.trim(), phone = sh.querySelector('#tw-d-phone').value.trim();
      if(!name){ toast('צריך שם פרטי'); return; }
      if(phone && !/^[0-9+\- ]{7,20}$/.test(phone)){ toast('מספר טלפון לא תקין'); return; }
      sh.remove();
      run(async () => {
        const u = await sbPersonal.from('tw_people').update({ name, last_name:last || null }).eq('id', x.id); if(u.error) return u;
        const ph = phone ? await sbPersonal.from('tw_phone').upsert({ person:x.id, phone }) : await sbPersonal.from('tw_phone').delete().eq('person', x.id);
        return ph;
      }, 'נשמר');
    });
  }));
  box.querySelectorAll('[data-tw-login]').forEach(b => b.addEventListener('click', () => run(() => makeLogin(b.dataset.twLogin), 'הכניסה נוצרה. בפעם הראשונה נכנסים עם קוד שמגיע למייל')));
  box.querySelectorAll('[data-tw-mail]').forEach(b => b.addEventListener('click', () => {
    const x = twPerson(b.dataset.twMail), cur = x.staff_id ? ((TW.priv[x.staff_id] || {}).email || '') : '';
    const sh = twSheet(`<h2>המייל של ${pEsc(x.name)}</h2><div class="pnote">לכתובת הזו יגיע הקוד של הכניסה הראשונה. הכניסה נוצרת מיד עם השמירה.</div>
      <div class="tw-form tw-form-col"><label>כתובת מייל <input type="email" id="tw-m" value="${pEsc(cur)}" dir="ltr" autocomplete="off"></label></div>
      <div class="confirm-actions"><button type="button" class="btn" id="tw-m-save">שמירה</button><button type="button" class="btn ghost" data-tw-close>ביטול</button></div>`);
    sh.querySelector('#tw-m-save').addEventListener('click', () => { const mail = sh.querySelector('#tw-m').value.trim(); sh.remove();
      run(async () => {
        let sid = x.staff_id;
        if(sid){ const r = await sbPersonal.rpc('core_set_email', { p_staff:sid, p_email:mail }); if(r.error) return r; }
        else { const r = await sbPersonal.rpc('core_add_staff', { p_name:x.name, p_email:mail }); if(r.error) return r; sid = r.data; const u = await sbPersonal.from('tw_people').update({ staff_id:sid }).eq('id', x.id); if(u.error) return u; }
        return mail ? makeLogin(sid) : {};
      }, mail ? 'המייל נשמר והכניסה נוצרה' : 'נשמר'); });
  }));
  box.querySelector('#tw-add-person').addEventListener('click', () => {
    const v = id => { const el = box.querySelector(id); return el ? el.value.trim() : ''; };
    const name = v('#tw-new-name'), last = v('#tw-new-last'), mail = v('#tw-new-mail'), phone = v('#tw-new-phone'), pw = Number(box.querySelector('#tw-new-pw').value), role = box.querySelector('#tw-new-role').value;
    const admin = role !== 'staff', sched = role !== 'admin';          // (Guy 19.11: the local admin may be one of the staff too; 23.11: one choice of the role)
    if(!name){ toast('צריך שם פרטי'); return; }
    if(admin && !mail){ toast('למנהלת מערכת צריך מייל'); return; }
    if(phone && !/^[0-9+\- ]{7,20}$/.test(phone)){ toast('מספר טלפון לא תקין'); return; }
    const full = last ? `${name} ${last}` : name;
    run(async () => {
      let sid = null;
      if(mail){ const r = await sbPersonal.rpc('core_add_staff', { p_name:full, p_email:mail, p_admin:admin }); if(r.error) return r; sid = r.data; }
      if(sched){
        const ins = await sbPersonal.from('tw_people').insert(Object.assign({ name, per_week:pw, staff_id:sid, sort:TW.people.length + 1 }, last ? { last_name:last } : {})).select(); if(ins.error) return ins;
        if(phone){ const ph = await sbPersonal.from('tw_phone').upsert({ person:ins.data[0].id, phone }); if(ph.error) return ph; }
      }
      return sid ? makeLogin(sid) : {};
    }, admin ? (sched ? 'נוספה מנהלת מערכת שמשובצת גם בסידור, והכניסה נוצרה' : 'נוספה מנהלת מערכת, והכניסה נוצרה') : mail ? 'נוספה לצוות, והכניסה נוצרה' : 'נוספה לצוות');
  });
}

// ---- 5. swaps and messages (Guy 2026-11-14: the product's instructor portal; supabase/scheduling-v78.sql)
// A person asks to give away one of her shifts of a published schedule; somebody else on the list takes it; the builder of those two
// weeks approves, and only then the schedule changes. Messages about the schedule are written by whoever builds now and by the admin.
const TW_SWAP_WORD = { open:'מחפשים מי שיחליף', taken:'ממתין לאישור של מי שבנתה את הסידור', approved:'אושר', declined:'לא אושר', cancelled:'בוטל' };
const twToday = () => isoDate(new Date());
const twSlotHours = (day, shift) => ((twSlots(day).find(s => s.shift === shift) || {}).hours || '');
const twShiftLine = (day, shift) => `יום ${DOW_NAMES[dowOf(day)]} ${twShort(day)} · ${TW_SHIFT[shift]}${shift === 'W' ? '' : ` \u2066${twSlotHours(day, shift)}\u2069`}`;          // (the hours isolated left to right: also in the WhatsApp text)
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
  TW.notices = [];          // (a personal notice when one's shift changed after publishing: scheduling-v82.sql; before it, nothing)
  if(TW.me){ try { const nt = await sbPersonal.from('tw_notice').select('*').is('seen_at', null).order('created_at'); if(!nt.error) TW.notices = nt.data || []; } catch(e){} }
}
const twSeenKey = () => 'mercury-tw-seen-' + (srv.me || '');
function twUnread(){ let seen = ''; try { seen = localStorage.getItem(twSeenKey()) || ''; } catch(e){} return (TW.msgs || []).filter(m => m.created_at > seen && m.from_staff !== srv.me).length; }
function twSwapTodo(){
  const sw = TW.swaps || [], today = twToday();
  // (the UX review 2026-11-19: only requests she can take; one next to her own shift does not call her)
  const forMe = TW.me ? sw.filter(s => s.status === 'open' && s.from_person !== TW.me.id && s.day >= today && twCanTake(TW.me.id, s.day, s.shift, TW.myAsg || [])).length : 0;
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
// (the UX review 2026-11-19: always all her coming shifts that were published, whatever two weeks are chosen above, so that the shift of
// this week is never hidden behind the next two weeks; the ones of these two weeks that already passed stay, faded)
function twMyShiftsHtml(bare){
  if(!TW.me) return '';
  TW.myNext = ''; TW.myCount = 0;
  const p = twPeriodRow() || {}, today = twToday();
  const pubOf = per => (TW.periods.find(x => x.start === per) || {}).status === 'published';
  const seen = new Set(), mine = [];
  TW.asg.filter(a => a.person === TW.me.id && (a.day >= today || p.status === 'published')).forEach(a => { seen.add(a.id); mine.push(a); });
  (TW.myAsg || []).filter(a => a.day >= today && pubOf(a.period) && !seen.has(a.id)).forEach(a => { seen.add(a.id); mine.push(a); });
  const shown = mine.filter(a => a.day >= today || a.period === TW.period).filter(a => pubOf(a.period) || a.period === TW.period)
    .sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  if(!shown.length) return (bare ? '' : '<h3 class="tw-h">המשמרות שלי</h3>') + '<div class="pnote">אין לך משמרות קרובות.</div>';
  const nextA = shown.find(a => a.day >= today), nextId = (nextA || {}).id;
  TW.myNext = nextA ? twShiftLine(nextA.day, nextA.shift).replace(/^יום /, '').split(' · ')[0] + ' · ' + TW_SHIFT[nextA.shift] : ''; TW.myCount = shown.filter(a => a.day >= today).length;
  const MAX = 6, past = shown.filter(a => a.day < today), coming = shown.filter(a => a.day >= today);
  const list = TW.allMine ? shown : past.concat(coming.slice(0, MAX));
  const row = a => {
    const here = a.period === TW.period ? TW.asg : null;
    const withMe = here ? here.filter(x => x.day === a.day && x.shift === a.shift && x.person !== TW.me.id).map(x => twName(x.person)) : null;
    const sw = (TW.swaps || []).find(s => s.assignment === a.id && (s.status === 'open' || s.status === 'taken'));
    return `<div class="tw-shift${a.day < today ? ' past' : ''}${a.id === nextId ? ' next' : ''}"><div>${a.id === nextId ? '<span class="tw-next">המשמרת הבאה</span>' : ''}<b>${twNoBreak(twShiftLine(a.day, a.shift))}</b>${a.shift === 'W' ? `<small>${twSlotHours(a.day, 'W')}</small>` : ''}
      ${withMe ? `<small>${withMe.length ? 'יחד עם: ' + twU(withMe.join(', ')) : 'בלי שיבוץ נוסף במשמרת'}</small>` : ''}${sw ? `<small class="tw-swap-state">בקשת החלפה: ${TW_SWAP_WORD[sw.status]}${sw.taker ? ` (${twU(twName(sw.taker))})` : ''}</small>` : ''}</div>
</div>`;
  };
  const askable = coming.filter(a => pubOf(a.period) && !(TW.swaps || []).some(s => s.assignment === a.id && (s.status === 'open' || s.status === 'taken')) && !TW.socialOff);
  TW.askable = askable;
  return `${bare ? '' : '<h3 class="tw-h">המשמרות שלי</h3>'}${askable.length ? '<div class="tw-actions tw-ask-row"><button type="button" class="btn ghost small" id="tw-ask-pick">בקשת החלפה</button></div>' : ''}<div class="tw-list">${list.map(row).join('')}</div>
    ${!TW.allMine && coming.length > MAX ? `<div class="tw-actions"><button type="button" class="btn ghost" id="tw-all-mine">עוד ${coming.length - MAX} משמרות</button></div>` : ''}`;
}
// a range of hours is never broken in the middle (the UX review 2026-11-19: "15:00–" on one line and "23:00" on the next)
const twNoBreak = s => String(s).replace(/–/g, '⁠–⁠');
// who could take a shift: on the list, not working that day, no back-to-back shift
function twCanTake(personId, day, shift, asg){ return !asg.some(a => a.person === personId && twPair(personId, a.day, a.shift, day, shift, a) === 'block'); }
// a shift of other two weeks (the list shows all her coming shifts): those two weeks are opened first, then the question
async function twAskFor(id){
  if(!TW.asg.some(a => a.id === id)){ const m = (TW.myAsg || []).find(a => a.id === id) || ((TW.pub || {}).asg || []).find(a => a.id === id); if(!m) return; TW.period = m.period; TW.week = 0; await twLoadPeriod(); twRender(); }
  twAskSheet(id);
}
function twAskSheet(asgId){
  const a = TW.asg.find(x => x.id === asgId); if(!a) return;
  const free = TW.people.filter(p => p.active && p.id !== TW.me.id && twCanTake(p.id, a.day, a.shift, TW.asg)).map(p => p.name);
  const sh = twSheet(`<h2>בקשת החלפה</h2><div class="pnote"><b>${twNoBreak(twShiftLine(a.day, a.shift))}</b></div>
    <div class="pnote">הבקשה תופיע לכל הצוות בלשונית "החלפות". כשמישהי מהצוות לוקחת את המשמרת, מי שבנתה את הסידור מאשרת, ורק אז הסידור משתנה.</div>
    <div class="pnote">${free.length ? 'פנויות באותו זמן לפי הסידור: ' + twU(free.join(', ')) + '.' : 'לפי הסידור אין מי שפנויה באותו זמן.'}</div>
    <label class="tw-note-l">כמה מילים לצוות (לא חובה)<textarea id="tw-ask-note" rows="2" maxlength="200"></textarea></label><div class="pnote tw-privacy">${twT('privacy')}</div>
    <div class="confirm-actions"><button type="button" class="btn" id="tw-ask-go">שליחת הבקשה</button><button type="button" class="btn ghost" data-tw-close>חזרה</button></div>`);
  sh.querySelector('#tw-ask-go').addEventListener('click', async () => {
    const note = sh.querySelector('#tw-ask-note').value.trim();
    sh.remove();
    if(await twRpc('tw_swap_ask', { p_assignment:a.id, p_note:note || null }, 'הבקשה נשלחה לצוות')) twShareSheet(a);
  });
}
// after asking: a ready WhatsApp message for the staff's group
function twShareSheet(a){
  const text = `מחפשים החלפה: ${twShiftLine(a.day, a.shift)}. מי שיכולה לקחת, מסמנים באתר בלשונית "החלפות": ${location.origin}${location.pathname}`;
  twSheet(`<h2>הבקשה נשלחה</h2><div class="pnote">אפשר גם לשלוח הודעה מוכנה לקבוצת הצוות:</div><div class="tw-share">${pEsc(text)}</div>
    <div class="confirm-actions"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}" data-tw-close>שליחה בוואטסאפ</a><button type="button" class="btn ghost" data-tw-close>סגירה</button></div>`);
}
function twSwapsHtml(){
  if(TW.socialOff) return '<div class="pnote">ההחלפות עוד לא הופעלו במסד הזה.</div>';
  const sw = TW.swaps || [], today = twToday(), me = TW.me ? TW.me.id : null;
  const line = s => `<b>${twNoBreak(twShiftLine(s.day, s.shift))}</b><small>${twU(twName(s.from_person))}${s.taker ? ` ← ${twU(twName(s.taker))}` : ''} · ${TW_SWAP_WORD[s.status]}</small>${s.note ? `<small>״${twU(s.note)}״</small>` : ''}`;
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
    // (the UX review 2026-11-19: the ones she cannot take are folded at the end, so the list and the count call her only to what she can do)
    + sec('מחפשים מי שיחליף', me ? open.filter(s => twCanTake(me, s.day, s.shift, TW.myAsg || [])) : open, takeBtn)
    + (me && open.some(s => !twCanTake(me, s.day, s.shift, TW.myAsg || [])) ? `<details class="tw-fixed-box"><summary>בקשות שלא מתאימות לך (${open.filter(s => !twCanTake(me, s.day, s.shift, TW.myAsg || [])).length})</summary><div class="tw-list">${open.filter(s => !twCanTake(me, s.day, s.shift, TW.myAsg || [])).map(s => `<div class="tw-shift past"><div>${line(s)}</div>${takeBtn(s)}</div>`).join('')}</div></details>` : '')
    + sec('הבקשות שלי', mine, s => (s.status === 'open' || s.status === 'taken') ? `<button type="button" class="btn ghost small" data-tw-cancel="${s.id}">${s.taker === me ? 'ויתור על המשמרת' : 'ביטול הבקשה'}</button>` : '')
    + sec('החלפות שאושרו', done, () => '');
  return (body || '<div class="pnote">אין כרגע בקשות החלפה.</div>') + `<div class="pnote">בקשה חדשה פותחים בלשונית "הסידור", ליד המשמרת.</div>${TW.me ? '<div class="tw-actions"><button type="button" class="btn ghost" data-tw-tab="sched">למשמרות שלי ←</button></div>' : ''}`;
}
function twSwapsWire(box){
  const sw = id => (TW.swaps || []).find(s => s.id === id) || {};
  box.querySelectorAll('[data-tw-take]').forEach(b => b.addEventListener('click', async () => { const s = sw(b.dataset.twTake);
    const per = TW.periods.find(x => x.start === s.period) || {}, self = !!TW.me && ((per.builder && per.builder === TW.me.id) || (!per.builder && TW.boss));
    if(await twConfirm({ title:'לקחת את המשמרת?', text:`${twShiftLine(s.day, s.shift)}. ${self ? 'את בונה את השבועיים האלה, ולכן ההחלפה מאושרת מיד והמשמרת עוברת אליך.' : 'אחרי האישור של מי שבנתה את הסידור, המשמרת תעבור אליך.'}`, ok:'כן, לקחת' }))
      twRpc('tw_swap_take', { p_swap:b.dataset.twTake }, self ? 'המשמרת עברה אליך והסידור עודכן' : 'נרשם. ממתין לאישור של מי שבנתה את הסידור'); }));
  box.querySelectorAll('[data-tw-cancel]').forEach(b => b.addEventListener('click', async () => { const s = sw(b.dataset.twCancel), giveUp = TW.me && s.taker === TW.me.id;
    if(await twConfirm(giveUp ? { title:'לוותר על המשמרת?', text:'הבקשה תחזור להיות פתוחה, ומישהי אחרת תוכל לקחת אותה.', ok:'כן, לוותר' } : { title:'לבטל את הבקשה?', text:'המשמרת נשארת שלך, והבקשה תיעלם מהצוות.', ok:'כן, לבטל' })) twRpc('tw_swap_cancel', { p_swap:b.dataset.twCancel }, 'בוטל'); }));
  box.querySelectorAll('[data-tw-decide]').forEach(b => b.addEventListener('click', async () => { const s = sw(b.dataset.twDecide), ok = !!b.dataset.ok;
    const q = ok ? { title:'לאשר את ההחלפה?', text:`${twShiftLine(s.day, s.shift)}: ${twName(s.from_person)} יוצאת, ${twName(s.taker)} נכנסת. הסידור יתעדכן מיד.`, ok:'כן, לאשר' }
      : { title:'לא לאשר את ההחלפה?', text:`המשמרת נשארת של ${twName(s.from_person)}.`, ok:'כן, לא לאשר' };
    if(await twConfirm(q)) twRpc('tw_swap_decide', { p_swap:b.dataset.twDecide, p_approve:ok }, ok ? 'ההחלפה אושרה והסידור עודכן' : 'ההחלפה לא אושרה'); }));
}
// the link of the team's WhatsApp group (tw_settings 'wa_group', set in "ניהול"): a full link, or only the code of the invitation
function twWaGroup(){ const v = String(twSetting('wa_group', '') || '').trim(); if(!v) return ''; return /^https:\/\//.test(v) ? v : 'https://chat.whatsapp.com/' + v.replace(/^.*\//, ''); }
function twInboxHtml(){
  if(TW.socialOff) return '<div class="pnote">ההודעות עוד לא הופעלו במסד הזה.</div>';
  const who = m => { const p = TW.people.find(x => x.staff_id && x.staff_id === m.from_staff); return p ? p.name : 'הנהלה'; };
  const write = twBuilderNow() ? `<div class="tw-compose"><label class="tw-note-l">הודעה לכל הצוות<textarea id="tw-msg" rows="3" maxlength="1000"></textarea></label><div class="pnote tw-privacy">${twT('privacy')}</div><div class="tw-actions tw-send-row"><button type="button" class="btn" id="tw-msg-send">שליחה</button>${twWaGroup() ? `<a class="btn ghost tw-wa-group" href="${pEsc(twWaGroup())}" target="_blank" rel="noopener">קבוצת הוואטסאפ</a>` : ''}</div></div>` : '';
  const list = (TW.msgs || []).map(m => `<div class="tw-msg"><small>${twU(who(m))} · ${new Date(m.created_at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}</small><p data-u>${pEsc(m.body)}</p>
    ${TW.boss || m.from_staff === srv.me ? `<button type="button" class="tw-x" data-tw-msg-del="${m.id}" aria-label="מחיקת ההודעה">✕</button>` : ''}</div>`).join('');
  return write + (list ? `<div class="tw-list">${list}</div>` : '<div class="pnote">כאן יופיעו הודעות ממי שבונה את הסידור ומההנהלה.</div>');
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
    if(!(await twConfirm({ title:'למחוק את ההודעה?', text:'ההודעה תימחק לכל הצוות, ואי אפשר להחזיר אותה.', ok:'כן, למחוק', danger:true }))) return;
    const r = await sbPersonal.from('tw_message').delete().eq('id', b.dataset.twMsgDel);
    if(r.error){ console.error(r.error); toast('⚠ המחיקה נכשלה'); return; }
    await twLoadSocial(); twRender();
  }));
}

// ---- 6. a personal notice with "הבנתי" when one's shift changed after the schedule was published (the review agents 2026-11-14;
// supabase/scheduling-v82.sql writes them; before that file runs there are none, and nothing is shown)
function twNoticesHtml(){
  const list = TW.notices || []; if(!list.length) return '';
  const line = n => n.kind === 'added' ? `נוספה לך משמרת: ${twShiftLine(n.day, n.shift)}` : `המשמרת שלך בוטלה: ${twShiftLine(n.day, n.shift)}`;
  return `<div class="tw-notice" role="status"><b>שינויים במשמרות שלך</b><ul>${list.map(n => `<li>${line(n)}</li>`).join('')}</ul><button type="button" class="btn small" id="tw-notice-ok">הבנתי</button></div>`;
}
function twNoticesWire(box){
  const ok = box.querySelector('#tw-notice-ok'); if(!ok) return;
  ok.addEventListener('click', async () => {
    const ids = (TW.notices || []).map(n => n.id); ok.disabled = true;
    const r = await sbPersonal.from('tw_notice').update({ seen_at:new Date().toISOString() }).in('id', ids);
    if(r.error){ console.error(r.error); toast('⚠ לא נשמר'); ok.disabled = false; return; }
    TW.notices = []; twRender();
  });
}

// ---- 7. going back: the phone's back button closes an open window, then goes back a step, a week or a tab (as 15b-history.js in the
// big site; the review agents 2026-11-14). Only in the scheduling product's own site: the big site has its own history.
TW.nav = [];
const twOwnSite = () => document.body.classList.contains('product-shibutz');
function twGo(fn){
  if(twUndoEl){ twUndoEl.remove(); twUndoEl = null; }
  TW.nav.push({ tab:TW.tab, step:TW.step, week:TW.week, full:TW.full, board:!!TW.board, period:TW.period });
  if(TW.nav.length > 40) TW.nav.shift();
  if(twOwnSite()){ try { history.pushState({ tw:'nav' }, ''); } catch(e){} }
  fn(); twRender(); window.scrollTo(0, 0);
}
let twPopSkip = 0;
const twTopSheet = () => { const all = document.querySelectorAll('body > .sheet'); return all.length ? all[all.length - 1] : null; };
window.addEventListener('popstate', () => {
  if(!twOwnSite()) return;
  if(twPopSkip){ twPopSkip--; return; }
  const top = twTopSheet();
  if(top){ top._byBack = true; top.remove(); return; }
  const s = TW.nav.pop(); if(!s) return;
  const per = s.period; delete s.period;
  Object.assign(TW, s);
  if(per && per !== TW.period){ TW.period = per; twLoadPeriod().then(() => { twRender(); window.scrollTo(0, 0); }); return; }
  twRender(); window.scrollTo(0, 0);
});
document.addEventListener('keydown', e => { if(e.key === 'Escape' && twOwnSite()){ const top = twTopSheet(); if(top && top.classList.contains('mx-sheet')) top.remove(); } });
// every window: one step in the history (in the own site), the focus inside it, and its own closing work (_onClose)
new MutationObserver(ms => ms.forEach(m => {
  m.addedNodes.forEach(n => {
    if(n.nodeType !== 1 || !n.classList.contains('sheet')) return;
    if(!twOwnSite() && !document.querySelector('#view-tw.active')) return;          // (in the big site only the two-week screen's own windows: the rest of the first site keeps its own focus, check 21.11)
    if(twOwnSite()){ try { history.pushState({ tw:'sheet' }, ''); } catch(e){} }
    setTimeout(() => { if(!n.isConnected || n.contains(document.activeElement)) return; const h = n.querySelector('h2'); if(h){ h.tabIndex = -1; h.focus(); } }, 0);
  });
  m.removedNodes.forEach(n => {
    if(n.nodeType !== 1 || !n.classList.contains('sheet')) return;
    if(typeof n._onClose === 'function'){ try { n._onClose(); } catch(e){ console.error(e); } }
    if(twOwnSite() && !n._byBack && history.state && history.state.tw === 'sheet'){ twPopSkip++; history.back(); }
  });
})).observe(document.body, { childList:true });