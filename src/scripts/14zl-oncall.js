// ---- "כוננית סוף שבוע" (Guy 2026-11-03; the spec: Mercury-Work-Manager plans/SOCIAL-WORKERS-URGENT-SPEC.md; scheduling-v50.sql)
// One shared panel per weekend / holiday, for the social workers (the therapists), the coordinator and the admin:
//   * the active on-call (any of them, per period; replacing somebody asks first and tells her inside the panel)
//   * the list of the weekend's staff — Friday morning to Saturday night, from the schedule — with arrival and return for every shift
//     (taxi: not needed / waiting / needed, time, place, "המונית הוזמנה")
//   * the schedule of the month, read only, a week at first; adding / removing an instructor in the Thursday 22:00 – Sunday 11:00 shifts
//     only for who may (the coordinator, the admin, or a social worker the admin allowed) — checked again in the database
//   * a change by somebody who is not the active on-call: a message for her inside the panel (no e-mail, no WhatsApp)
const OC_SHIFT_ORDER = { M:0, S:1, A:2, L:3, N:4 };
const OC_STD_HOURS = { M:'07:00–15:00', S:'07:00–11:00', A:'14:00–22:00', N:'22:00–08:00', L:'שישי–מוצ"ש' };
const OC_NEED = [['need', 'צריך'], ['none', 'לא צריך']];          // (nothing marked until somebody chooses: no "ממתין לבירור", Guy 2026-11-03)
const oc = { key:null, week:null, monthView:false, data:null, busy:false, view:'list' };

// who may open it: the same people as public.can_oncall(), which the database checks again. The card on the first screen gives no right by itself
const ocAllowed = () => typeof portalServerOn !== 'undefined' && portalServerOn && !portalUi.viewAs && !!((srv.meRow && (['coordinator', 'manager'].includes(srv.meRow.role) || srv.meRow.admin)) || (srv.profile && (srv.profile.admin || srv.profile.therapist || srv.profile.kind === 'therapist')));
const ocPhone = () => { try { return matchMedia('(max-width:700px)').matches; } catch(e){ return false; } };
// its own screen, a card of the first screen beside the portals, not inside any of them (Guy 2026-11-04)
function showOncallScreen(as){          // (as: the manager looks at a social worker's screen, nothing can be changed)
  document.body.classList.remove('leopard-bg');
  portalActivateView('view-oncall');
  let look = 'dark';
  try { look = leopardAllowed() && portalThemeNow() === 'leopard' ? 'leopard' : (srv.portalTheme && srv.portalTheme !== 'leopard' ? srv.portalTheme : portalLoad().settings.theme) || 'dark'; } catch(e){}
  document.body.classList.toggle('leopard-bg', look === 'leopard');
  document.getElementById('view-oncall').innerHTML = `<div class="portal-shell" data-ptheme="${pEsc(look)}">
    <div class="portal-top"><button type="button" class="back-btn portal-back" id="oc-home-back">→ מסך ראשי</button><h1 class="portal-title">כוננית סוף שבוע</h1><span class="portal-top-actions"></span></div>
    <div id="oc-screen"></div></div>`;
  document.getElementById('oc-home-back').addEventListener('click', () => { if(as){ portalUi.tab = 'users'; showPortal('users'); return; } if(personalRamzorKind()) showAppHome(); else srvOpenPortal(); });
  if(as){ const box = document.getElementById('oc-screen'); box.insertAdjacentHTML('beforebegin', `<div class="adm-viewas"><span>👁️ צפייה בלבד · כך ${pEsc(as.first)} רואה את הכוננית</span></div>`);
    box.addEventListener('click', ev => { if(ev.target.closest('[data-oc-period], [data-oc-view], [data-oc-sv], [data-oc-wk]')) return; if(ev.target.closest('button, input, select, textarea, a')){ ev.preventDefault(); ev.stopPropagation(); toast('זו צפייה בלבד'); } }, true); }
  renderOncall(document.getElementById('oc-screen'));
}

const ocFridayOf = iso => { const d = dowOf(iso); return addDays(iso, d === 5 ? 0 : d === 6 ? -1 : (5 - d)); };          // (this coming Friday; on Friday / Saturday — this one)
const ocSunday = iso => addDays(iso, -dowOf(iso));
const ocWeekendKey = fri => 'w:' + fri;
const ocShort = iso => { const t = parseIso(iso); return t.getDate() + '/' + (t.getMonth() + 1); };
const ocShiftWord = s => (typeof SRV_SHIFT_WORD !== 'undefined' && SRV_SHIFT_WORD[s]) || s;
const ocHours = r => r.from_time && r.to_time ? `${String(r.from_time).slice(0, 5)}–${String(r.to_time).slice(0, 5)}` : OC_STD_HOURS[r.shift] || '';
const ocTripTime = (r, dir) => { const h = ocHours(r).match(/^(\d\d:\d\d)–(\d\d:\d\d)$/); return h ? (dir === 'in' ? h[1] : h[2]) : ''; };          // (arrival = the shift's start, return = its end)
const ocInWindow = (day, shift) => { const d = dowOf(day); return d === 4 ? shift === 'N' : d === 5 || d === 6 ? true : d === 0 ? ['M', 'S'].includes(shift) : false; };          // (= public.oncall_in_window)

// the periods to choose from: this weekend and the next three, and the holidays the admin set
function ocPeriodsOf(rows, today){
  const fri0 = ocFridayOf(today), out = [];
  for(let i = 0; i < 4; i++){ const f = addDays(fri0, 7 * i); out.push({ key:ocWeekendKey(f), kind:'weekend', from_day:f, to_day:addDays(f, 1), label:`סופ"ש ${ocShort(f)}` }); }
  (rows || []).filter(p => p.kind === 'holiday' && p.to_day >= today).sort((a, b) => a.from_day.localeCompare(b.from_day))
    .forEach(p => out.push({ key:p.key, kind:'holiday', from_day:p.from_day, to_day:p.to_day, title:p.title, label:`${p.title || 'חג'} ${ocShort(p.from_day)}` }));
  return out.map(p => Object.assign(p, (rows || []).find(r => r.key === p.key) || {}));
}

async function ocLoad(){
  const today = isoDate(new Date()), from = addDays(today, -40), to = addDays(today, 70);
  const [per, staff, may, adr] = await Promise.all([
    sbPersonal.from('oncall_period').select('*').gte('to_day', addDays(today, -7)),
    sbPersonal.from('staff').select('id,display_name,kind,active'),
    sbPersonal.rpc('oncall_may_assign'),
    sbPersonal.from('oncall_address').select('staff_id,address')]);          // (the permanent addresses: scheduling-v56.sql; without it, none)
  if(per.error) return { error:per.error };
  const periods = ocPeriodsOf(per.data, today);
  if(!oc.key || !periods.some(p => p.key === oc.key)) oc.key = periods[0].key;
  const p = periods.find(x => x.key === oc.key);
  const mFrom = monthKeyOf(p.from_day) + '-01', mTo = addDays(addMonths(monthKeyOf(p.to_day), 1) + '-01', -1), ws = oc.wkStart || ocSunday(p.from_day), fri = ocFridayOf(today);
  const lo = [addDays(mFrom, -1), ws, addDays(fri, -1)].sort()[0], hi = [addDays(mTo, 1), addDays(ws, 6), addDays(fri, 2)].sort()[2];          // (a phone goes week by week past the month, and the coming weekend is always there)
  const [asg, trips, ev] = await Promise.all([
    sbPersonal.from('assignment').select('id,staff_id,day,shift,from_time,to_time').gte('day', lo).lte('day', hi),
    sbPersonal.from('oncall_trip').select('*').eq('period_key', oc.key),
    sbPersonal.from('oncall_event').select('*').eq('period_key', oc.key).order('at', { ascending:false }).limit(40)]);
  const names = {}; (staff.data || []).forEach(s => { names[s.id] = s; });
  const addr = {}; (adr.error ? [] : adr.data || []).forEach(a => { addr[a.staff_id] = a.address; });
  return { periods, period:p, names, rows:asg.data || [], trips:trips.data || [], events:ev.data || [], may:!may.error && may.data === true, from, to, addr, addrOn:!adr.error };
}

async function ocEnsurePeriod(p){          // a weekend's row is made the first time something is kept for it
  if(p.kind !== 'weekend' || p.updated_at) return true;
  const r = await sbPersonal.from('oncall_period').upsert({ key:p.key, kind:'weekend', from_day:p.from_day, to_day:p.to_day }, { onConflict:'key', ignoreDuplicates:true });
  if(!r.error) p.updated_at = new Date().toISOString();
  return !r.error;
}
async function ocTell(p, text){          // a change by somebody who is not the active on-call: a message for her (or, with nobody chosen, for who takes it)
  if(p.active_staff === srv.me) return;
  await sbPersonal.from('oncall_event').insert({ period_key:p.key, by_staff:srv.me, for_staff:p.active_staff || null, text:text.slice(0, 400) });
}

async function renderOncall(box){
  if(!box || !box.isConnected) return;
  if(!box.querySelector('.oc')) box.innerHTML = '<div class="pnote">רק רגע...</div>';
  let d; try { d = await ocLoad(); } catch(e){ d = { error:e }; }
  if(!box.isConnected) return;
  if(d.error){ box.innerHTML = '<div class="pstatus bad">הכוננית עוד לא זמינה כאן (חסר עדכון במסד: scheduling-v50.sql).</div>'; return; }
  oc.data = d;
  ocPaint(box, d);
}
// the panel drawn from the data in hand — a tap changes it at once, without waiting for the database (Guy 2026-11-03: "יש דיליי")
function ocPaint(box, d){
  if(!box.isConnected) return;
  const p = d.period, me = srv.me, nm = id => (d.names[id] || {}).display_name || '?';
  const listDays = p.kind === 'weekend' ? [p.from_day, addDays(p.from_day, 1)] : (() => { const a = []; for(let x = p.from_day; x <= p.to_day; x = addDays(x, 1)) a.push(x); return a; })();
  const list = d.rows.filter(r => listDays.includes(r.day)).sort((a, b) => (a.day + OC_SHIFT_ORDER[a.shift]).localeCompare(b.day + OC_SHIFT_ORDER[b.shift]) || nm(a.staff_id).localeCompare(nm(b.staff_id), 'he'));
  const tripOf = (r, dir) => d.trips.find(t => t.staff_id === r.staff_id && t.day === r.day && t.shift === r.shift && t.dir === dir) || { need:'pending', at_time:'', place:'', ordered:false };
  const groups = []; list.forEach(r => { const k = r.day + '|' + r.shift; let g = groups.find(x => x.k === k); if(!g){ g = { k, day:r.day, shift:r.shift, rows:[] }; groups.push(g); } g.rows.push(r); });
  groups.forEach(g => { const n = {}; g.rows.forEach(r => { n[ocHours(r)] = (n[ocHours(r)] || 0) + 1; }); g.hours = Object.keys(n).sort((a, b) => n[b] - n[a])[0] || ''; });          // (the hours most of them have: written once; somebody else's own hours by her name)
  const mine = d.events.filter(e => !e.seen && (e.for_staff === me || (!e.for_staff && p.active_staff === me)));
  // a person is one folded line: taxi or not, and "הוזמן" for each way that needs one. Opened: each way by itself, with its time and address (Guy 2026-11-04)
  const dirHtml = (r, dir) => { const t = tripOf(r, dir), k = `${r.staff_id}|${r.day}|${r.shift}|${dir}`, w = dir === 'in' ? 'הגעה' : 'חזרה', tm = t.at_time || ocTripTime(r, dir);
    return `<div class="oc-dir${t.need === 'need' ? ' need' : ''}" data-oc-trip="${k}"><div class="oc-dir-h"><b>${w}</b></div>
      <div class="oc-d-body"><label class="oc-field"><span>שעה</span><input type="text" inputmode="numeric" maxlength="20" data-oc-time value="${pEsc(tm)}" placeholder="למשל 06:30"></label>
        <label class="oc-field"><span>כתובת</span><input type="text" maxlength="120" data-oc-place value="${pEsc(t.place || d.addr[r.staff_id] || '')}"></label></div></div>`; };
  const personHtml = (r, g) => { const a = tripOf(r, 'in'), b = tripOf(r, 'out'), k = `${r.staff_id}|${r.day}|${r.shift}`, any = a.need === 'need' || b.need === 'need', none = !any && a.need === 'none' && b.need === 'none';
    const ord = (t, dir) => t.need === 'need' ? `<button type="button" class="oc-ordered-btn" data-oc-ord="${k}|${dir}" aria-pressed="${!!t.ordered}">${t.ordered ? '✓ ' : ''}הוזמן · ${dir === 'in' ? 'הגעה' : 'חזרה'}</button>` : '';
    return `<details class="oc-p" data-oc-person="${k}"${portalUi.fold['ocp:' + k] ? ' open' : ''}><summary><span class="oc-p-name"><b>${pEsc(nm(r.staff_id))}</b>${ocHours(r) !== g.hours ? `<small><bdi dir="ltr">${ocHours(r)}</bdi></small>` : ''}</span>
        <span class="mx-seg oc-need" role="group" aria-label="מונית: ${pEsc(nm(r.staff_id))}"><button type="button" data-oc-all="need" aria-pressed="${any}">צריך מונית</button><button type="button" data-oc-all="none" aria-pressed="${none}">לא צריך מונית</button></span>
        <i class="oc-p-more" aria-hidden="true">▾</i>${any ? `<span class="oc-ords">${ord(a, 'in')}${ord(b, 'out')}</span>` : ''}</summary><div class="oc-p-body">${dirHtml(r, 'in')}${dirHtml(r, 'out')}</div></details>`; };
  // what "הוזמן לכולם" marks: who needs a taxi in this list, on this period, and is not marked yet
  d.waiting = []; list.forEach(r => ['in', 'out'].forEach(dir => { const t = tripOf(r, dir); if(t.need === 'need' && !t.ordered) d.waiting.push({ r, dir, t }); }));
  const undoAll = oc.undoAll && oc.undoAll.key === p.key && oc.undoAll.trips.some(t => t.need === 'need' && t.ordered);          // (pressed again: what that press marked, and only that, is taken back)
  const cellIn = (day, s, rs) => { const can = d.may && ocInWindow(day, s);
    return `${rs.map(r => `<span class="mcal-name">${pEsc(nm(r.staff_id))}${d.may && ocInWindow(day, r.shift) ? ` <button type="button" class="oc-x" data-oc-un="${r.id}" aria-label="הסרת ${pEsc(nm(r.staff_id))} מ${ocShiftWord(r.shift)} ${ocShort(day)}">×</button>` : ''}</span>`).join('')}${can ? `<button type="button" class="oc-add" data-oc-add="${day}|${s}" aria-label="הוספת מדריך ל${ocShiftWord(s)} ${ocShort(day)}">+</button>` : ''}`; };
  const dayRow = (day, keep) => {
    const byShift = ['M', 'S', 'A', 'L', 'N'].map(s => [s, d.rows.filter(r => r.day === day && r.shift === s)]).filter(([s, rs]) => (rs.length || ['M', 'A', 'N'].includes(s)) && (!keep || keep(s)));
    return `<div class="mcal-wrow${[5, 6].includes(dowOf(day)) ? ' weekend' : ''}${day === isoDate(new Date()) ? ' today' : ''}"><div class="mcal-wrow-day"><b>${DOW_SHORT[dowOf(day)]}</b><span>${ocShort(day)}</span></div><div class="mcal-wrow-cells">${byShift.map(([s, rs]) => `<div class="mcal-wrow-shift"><span class="mcal-wrow-lbl">${ocShiftWord(s)}</span><div class="mcal-cell oc-cell">${cellIn(day, s, rs)}</div></div>`).join('')}</div></div>`; };
  // only two views, on a phone and on a computer (Guy 2026-11-04). "שבוע": the seven days side by side, from the right, week after week past the month; "סוף השבוע הקרוב": Thursday night to Sunday morning, as in ocInWindow
  const phoneSched = () => {
    const today = isoDate(new Date()), ws = oc.wkStart || ocSunday(p.from_day), week = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(ws, i)), fri = ocFridayOf(today), end = oc.schedView === 'weekend';
    const seg = `<div class="mx-seg oc-sv" role="group" aria-label="תצוגת הסידור"><button type="button" data-oc-sv="week" aria-pressed="${!end}">שבוע</button><button type="button" data-oc-sv="weekend" aria-pressed="${end}">סוף השבוע הקרוב</button></div>`;
    const note = d.may ? '<div class="pnote">אפשר להוסיף או להסיר מדריך במשמרות שבין חמישי 22:00 לראשון 11:00.</div>' : '';
    if(end) return `${seg}${note}<div class="oc-wk-title"><bdi dir="ltr">${ocShort(addDays(fri, -1))}–${ocShort(addDays(fri, 2))}</bdi></div><div class="mcal mcal-wrows">${[-1, 0, 1, 2].map(i => { const day = addDays(fri, i); return dayRow(day, s => ocInWindow(day, s)); }).join('')}</div>`;
    return `${seg}<div class="mcal-weeknav oc-wk-nav"><button type="button" class="mcal-wk" data-oc-wk="-7" aria-label="השבוע הקודם"><bdi dir="ltr">›</bdi></button><b><bdi dir="ltr">${ocShort(week[0])}–${ocShort(week[6])}</bdi></b><button type="button" class="mcal-wk" data-oc-wk="7" aria-label="השבוע הבא"><bdi dir="ltr">‹</bdi></button></div>${note}
      <div class="oc-wk">${week.map(day => `<div class="oc-wk-day${day === today ? ' today' : ''}"><b>${DOW_SHORT[dowOf(day)]}</b><span>${ocShort(day)}</span></div>`).join('')}
      ${[['M', 'S'], ['A', 'L'], ['N']].map(([s, s2]) => `<div class="oc-wk-band">${ocShiftWord(s)} <bdi dir="ltr">${OC_STD_HOURS[s]}</bdi></div>${week.map(day => { const rs = d.rows.filter(r => r.day === day && (r.shift === s || r.shift === s2)), can = d.may && ocInWindow(day, s), names = rs.map(r => `<span class="mcal-name">${pEsc(nm(r.staff_id))}</span>`).join(''), cls = `oc-wk-cell${[5, 6].includes(dowOf(day)) ? ' weekend' : ''}`;
        return can ? `<button type="button" class="${cls} can" data-oc-cell="${day}|${s}" aria-label="עריכת ${ocShiftWord(s)} ${ocShort(day)}">${names}<i aria-hidden="true">✎</i></button>` : `<div class="${cls}">${names}</div>`; }).join('')}`).join('')}</div>`; };
  d.cellIn = cellIn;
  box.innerHTML = `<div class="oc">
    <div class="oc-periods" role="group" aria-label="תקופת הכוננות">${d.periods.map(x => `<button type="button" class="oc-period${x.key === p.key ? ' on' : ''}" data-oc-period="${pEsc(x.key)}" aria-pressed="${x.key === p.key}">${pEsc(x.label)}</button>`).join('')}${srv.profile && srv.profile.admin ? '<button type="button" class="oc-period oc-add-holiday" data-oc-holiday>+ כוננות חג</button>' : ''}</div>
    ${p.active_staff ? `<div class="oc-active"><span>הכוננית הפעילה: <b>${pEsc(nm(p.active_staff))}</b>${p.active_staff === me ? ' (את/ה)' : ''}</span>${p.active_staff === me ? '' : '<button type="button" class="btn ghost small" data-oc-take>אני הכוננית הפעילה</button>'}</div>`
      : `<div class="oc-active oc-none"><b>לא נבחרה כוננית פעילה</b><button type="button" class="btn small" data-oc-take>אני הכוננית הפעילה</button></div>`}
    ${mine.length ? `<div class="oc-events"><b>שינויים שעשו אחרים</b>${mine.map(e => `<div class="oc-event"><span>${pEsc(e.text)}</span><small>${pEsc(nm(e.by_staff))} · ${new Date(e.at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}</small></div>`).join('')}<button type="button" class="btn ghost small" data-oc-seen>ראיתי</button></div>` : ''}
    ${!p.active_staff && d.events.some(e => !e.for_staff && !e.seen) ? `<div class="pnote">${d.events.filter(e => !e.for_staff && !e.seen).length} שינויים נשמרו לבדיקה של מי שתיקח את הכוננות.</div>` : ''}
    <div class="mx-seg oc-views" role="group" aria-label="תצוגה"><button type="button" data-oc-view="list" aria-pressed="${oc.view !== 'sched'}">עובדי ${p.kind === 'weekend' ? 'סוף השבוע' : 'החג'} ומוניות</button><button type="button" data-oc-view="sched" aria-pressed="${oc.view === 'sched'}">סידור</button></div>
    ${oc.view !== 'sched' ? `<div class="oc-list">
      ${d.waiting.length || undoAll ? `<div class="oc-all-row"><button type="button" class="btn small${d.waiting.length ? '' : ' ghost'}" data-oc-all-ordered aria-pressed="${!d.waiting.length}">${d.waiting.length ? 'הוזמן לכולם' : '✓ הוזמן לכולם'}</button></div>` : ''}
      <div class="pnote">לחיצה על שם פותחת הגעה וחזרה, עם שעה וכתובת.</div>
      ${groups.length ? groups.map(g => `<div class="oc-group"><div class="oc-group-h"><b>${pEsc(DOW_NAMES[dowOf(g.day)])} ${ocShort(g.day)} · ${ocShiftWord(g.shift)}</b> <bdi dir="ltr">${g.hours}</bdi></div>
        ${g.rows.map(r => personHtml(r, g)).join('')}</div>`).join('') : '<div class="pnote">אין עדיין שיבוצים בסידור לתקופה הזו.</div>'}
    </div>` : `<div class="oc-sched">${phoneSched()}</div>`}
  </div>`;
  ocWire(box, d);
}

function ocWire(box, d){
  const p = d.period, nm = id => (d.names[id] || {}).display_name || '?', again = () => renderOncall(box), paint = () => ocPaint(box, d);
  box.querySelectorAll('details[data-fold]').forEach(x => x.addEventListener('toggle', () => { portalUi.fold[x.dataset.fold] = x.open; }));
  box.querySelectorAll('[data-oc-period]').forEach(b => b.addEventListener('click', () => { oc.key = b.dataset.ocPeriod; oc.week = null; oc.wkStart = null; again(); }));
  box.querySelectorAll('[data-oc-view]').forEach(b => b.addEventListener('click', () => { oc.view = b.dataset.ocView; again(); }));
  box.querySelectorAll('[data-oc-sv]').forEach(b => b.addEventListener('click', () => { oc.schedView = b.dataset.ocSv; paint(); }));
  box.querySelectorAll('[data-oc-wk]').forEach(b => b.addEventListener('click', () => { oc.wkStart = addDays(oc.wkStart || ocSunday(p.from_day), Number(b.dataset.ocWk)); again(); }));
  const take = box.querySelector('[data-oc-take]');
  if(take) take.addEventListener('click', async () => {
    const prev = p.active_staff;
    if(prev && !(await confirmSheet({ title:`להחליף את ${nm(prev)} ככוננית הפעילה?`, text:'היא תקבל על כך הודעה כאן. פרטי הנסיעות והטיפול נשמרים.', okLabel:'כן, להחליף', cancelLabel:'חזרה' }))) return;
    if(!(await ocEnsurePeriod(p))){ toast('לא נשמר. אפשר לנסות שוב.'); return; }
    let q = sbPersonal.from('oncall_period').update({ active_staff:srv.me, active_since:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('key', p.key);
    q = prev ? q.eq('active_staff', prev) : q.is('active_staff', null);          // (two at once: the second sees what changed, nothing is overwritten silently)
    const r = await q.select('key');
    if(r.error || !(r.data || []).length){ toast('מישהי אחרת עדכנה בינתיים. מרעננים.'); again(); return; }
    if(prev) await sbPersonal.from('oncall_event').insert({ period_key:p.key, by_staff:srv.me, for_staff:prev, text:`${nm(srv.me)} היא עכשיו הכוננית הפעילה במקומך.` });
    toast('את/ה הכוננית הפעילה'); again();
  });
  const seen = box.querySelector('[data-oc-seen]');
  if(seen) seen.addEventListener('click', async () => {
    const ids = d.events.filter(e => !e.seen && (e.for_staff === srv.me || (!e.for_staff && p.active_staff === srv.me))).map(e => e.id);
    if(ids.some(id => !d.events.find(e => e.id === id).for_staff)) await sbPersonal.from('oncall_event').update({ for_staff:srv.me }).in('id', ids).is('for_staff', null);          // (what waited for whoever takes it: now hers)
    await sbPersonal.from('oncall_event').update({ seen:true }).in('id', ids); again();
  });
  // a trip: every change is kept at once; a change by somebody who is not the active on-call tells her
  const saveTrip = async (wrap, patch, words) => {
    const [staff_id, day, shift, dir] = wrap.dataset.ocTrip.split('|');
    if(!(await ocEnsurePeriod(p))){ toast('לא נשמר. אפשר לנסות שוב.'); return; }
    const cur = d.trips.find(t => t.staff_id === staff_id && t.day === day && t.shift === shift && t.dir === dir) || { need:'pending', at_time:null, place:null, ordered:false };
    const row = Object.assign({ period_key:p.key, staff_id, day, shift, dir, need:cur.need, at_time:cur.at_time, place:cur.place, ordered:cur.ordered }, patch, { updated_by:srv.me, updated_at:new Date().toISOString() });
    const r = await sbPersonal.from('oncall_trip').upsert(row);
    if(r.error){ toast('לא נשמר. אפשר לנסות שוב.'); return false; }
    Object.assign(cur, row); if(!d.trips.includes(cur)) d.trips.push(cur);
    ocTell(p, `${nm(staff_id)} · ${ocShort(day)} ${ocShiftWord(shift)} · ${dir === 'in' ? 'הגעה' : 'חזרה'}: ${words}`);          // (the note for the active on-call: behind, not waited for)
    return true;
  };
  // a choice is shown at once; if the database refuses it, the screen goes back to what it was
  const quick = async (wrap, patch, words) => {
    const [staff_id, day, shift, dir] = wrap.dataset.ocTrip.split('|');
    let cur = d.trips.find(t => t.staff_id === staff_id && t.day === day && t.shift === shift && t.dir === dir);
    const before = cur ? Object.assign({}, cur) : null;
    if(!cur){ cur = { staff_id, day, shift, dir, need:'pending', at_time:null, place:null, ordered:false }; d.trips.push(cur); }
    Object.assign(cur, patch); paint();
    if(!(await saveTrip(wrap, patch, words))){ if(before) Object.assign(cur, before); else d.trips.splice(d.trips.indexOf(cur), 1); paint(); }
  };
  const way = k => ({ dataset:{ ocTrip:k } });
  box.querySelectorAll('[data-oc-person]').forEach(x => {
    const k = x.dataset.ocPerson;
    x.addEventListener('toggle', () => { portalUi.fold['ocp:' + k] = x.open; });
    x.querySelectorAll('[data-oc-all]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();          // (a choice in the folded line: not opening it)
      const v = b.getAttribute('aria-pressed') === 'true' ? 'pending' : b.dataset.ocAll;          // (pressed again: back to nothing marked)
      ['in', 'out'].forEach(dir => quick(way(`${k}|${dir}`), Object.assign({ need:v }, v !== 'need' ? { ordered:false } : {}), v === 'pending' ? 'הסימון הוסר' : v === 'need' ? 'צריך מונית' : 'לא צריך מונית'));
    }));
    x.querySelectorAll('[data-oc-ord]').forEach(o => o.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const on = o.getAttribute('aria-pressed') !== 'true'; quick(way(o.dataset.ocOrd), { ordered:on }, on ? 'המונית הוזמנה' : 'סימון "הוזמנה" הוסר');
    }));
  });
  // "הוזמן לכולם": a mark in the system only (no taxi is ordered by it), for who needs one in this list and nobody else
  { const all = box.querySelector('[data-oc-all-ordered]'); if(all) all.addEventListener('click', async () => {
      const todo = d.waiting.slice(), mark = todo.length > 0;
      const was = mark ? todo.map(x => d.trips.find(t => t.staff_id === x.r.staff_id && t.day === x.r.day && t.shift === x.r.shift && t.dir === x.dir)) : ((oc.undoAll && oc.undoAll.key === p.key && oc.undoAll.trips) || []).filter(t => t.need === 'need' && t.ordered);
      if(!was.length) return;
      was.forEach(t => { t.ordered = mark; }); oc.undoAll = mark ? { key:p.key, trips:was } : null; paint();
      const undo = () => { was.forEach(t => { t.ordered = !mark; }); oc.undoAll = mark ? null : { key:p.key, trips:was }; paint(); toast('לא נשמר. אפשר לנסות שוב.'); };
      if(!(await ocEnsurePeriod(p))){ undo(); return; }
      const at = new Date().toISOString(), r = await sbPersonal.from('oncall_trip').upsert(was.map(t => ({ period_key:p.key, staff_id:t.staff_id, day:t.day, shift:t.shift, dir:t.dir, need:'need', at_time:t.at_time || null, place:t.place || null, ordered:mark, updated_by:srv.me, updated_at:at })));
      if(r.error){ undo(); return; }
      ocTell(p, `${mark ? 'הוזמן לכולם' : 'בוטל "הוזמן לכולם"'}: ${was.length} נסיעות`);
    }); }
  box.querySelectorAll('[data-oc-trip]').forEach(w => {
    const k = w.dataset.ocTrip, staff = k.split('|')[0];
    const t = w.querySelector('[data-oc-time]'), pl = w.querySelector('[data-oc-place]');
    t.addEventListener('change', () => { const r0 = d.rows.find(x => x.staff_id === staff && x.day === k.split('|')[1] && x.shift === k.split('|')[2]), v = t.value.trim(), dflt = r0 ? ocTripTime(r0, k.split('|')[3]) : '';
      quick(w, { at_time:v && v !== dflt ? v : null }, `שעה ${v || '—'}`); });
    pl.addEventListener('change', async () => {
      const v = pl.value.trim(), fixed = d.addr[staff] || '';
      await saveTrip(w, { place:v && v !== fixed ? v : null }, `כתובת ${v || '—'}`);
      if(!v || v === fixed || !d.addrOn) return;
      if(!(await confirmSheet({ title:`להגדיר ככתובת הקבועה של ${nm(staff)}?`, text:`"${v}" תופיע מעכשיו בהגעה ובחזרה של כל המשמרות שלה. אפשר תמיד לשנות כתובת לנסיעה אחת.`, okLabel:'כן, כתובת קבועה', cancelLabel:'רק לנסיעה הזו' }))) return;
      const r = await sbPersonal.from('oncall_address').upsert({ staff_id:staff, address:v, updated_by:srv.me, updated_at:new Date().toISOString() });
      if(r.error){ toast('הכתובת הקבועה לא נשמרה'); return; }
      await saveTrip(w, { place:null }, `כתובת קבועה: ${v}`);
      toast('נשמרה ככתובת הקבועה'); again();
    });
  });
  // the schedule: add / remove in the weekend window (who may: checked again in the database)
  const wireEdit = root => {
  root.querySelectorAll('[data-oc-un]').forEach(b => b.addEventListener('click', async () => {
    const r = d.rows.find(x => x.id === b.dataset.ocUn); if(!r) return;
    if(!(await confirmSheet({ title:`להסיר את ${nm(r.staff_id)}?`, text:`${DOW_NAMES[dowOf(r.day)]} ${ocShort(r.day)}, ${ocShiftWord(r.shift)}.`, okLabel:'כן, להסיר', cancelLabel:'חזרה' }))) return;
    const x = await sbPersonal.rpc('oncall_unassign', { p_id:r.id });
    toast(x.error ? 'לא הוסר: אין הרשאה או שהמשמרת מחוץ לחלון' : 'הוסר/ה'); again();
  }));
  root.querySelectorAll('[data-oc-add]').forEach(b => b.addEventListener('click', () => {
    const [day, shift] = b.dataset.ocAdd.split('|'), taken = new Set(d.rows.filter(r => r.day === day && r.shift === shift).map(r => r.staff_id));
    const people = Object.values(d.names).filter(s => s.active && s.kind === 'instructor' && !taken.has(s.id)).sort((a, c) => a.display_name.localeCompare(c.display_name, 'he'));
    const sh = portalSheet(`<h2>הוספה ל${ocShiftWord(shift)} ${ocShort(day)}</h2><div class="pchoice wrap oc-pick">${people.map(s => `<button type="button" data-oc-who="${s.id}">${pEsc(s.display_name)}</button>`).join('')}</div><div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button></div>`);
    sh.querySelectorAll('[data-oc-who]').forEach(x => x.addEventListener('click', async () => {
      const r = await sbPersonal.rpc('oncall_assign', { p_day:day, p_shift:shift, p_staff:x.dataset.ocWho });
      sh.close(); toast(r.error ? 'לא נוסף: ' + (/published/.test(r.error.message) ? 'החודש עוד לא פורסם' : /already/.test(r.error.message) ? 'כבר משובץ/ת' : 'אין הרשאה או מחוץ לחלון') : 'נוסף/ה לסידור'); again();
    }));
  }));
  };
  wireEdit(box);
  // the week on a phone is narrow: a tap on a shift opens its names, with the same add and remove
  box.querySelectorAll('[data-oc-cell]').forEach(b => b.addEventListener('click', () => {
    const [day, s] = b.dataset.ocCell.split('|'), s2 = ({ M:'S', A:'L' })[s], rs = d.rows.filter(r => r.day === day && (r.shift === s || r.shift === s2));
    const sh = portalSheet(`<h2>${ocShiftWord(s)} ${ocShort(day)}</h2><div class="mcal-cell oc-cell oc-edit">${d.cellIn(day, s, rs)}</div><div class="confirm-actions"><button type="button" class="btn ghost" data-close>סגירה</button></div>`);
    wireEdit(sh); sh.addEventListener('click', e => { if(e.target.closest('[data-oc-add], [data-oc-un]')) setTimeout(() => sh.close(), 0); });
  }));
  const hol = box.querySelector('[data-oc-holiday]');
  if(hol) hol.addEventListener('click', () => {          // the admin sets a holiday range of shifts by hand (the Hebrew calendar: later)
    const sh = portalSheet(`<h2>כוננות חג</h2><label class="pfield">שם<input type="text" id="oc-h-title" maxlength="40" placeholder="למשל ראש השנה"></label><label class="pfield">מיום<input type="date" id="oc-h-from"></label><label class="pfield">עד יום<input type="date" id="oc-h-to"></label><div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="oc-h-go">שמירה</button></div>`);
    sh.querySelector('#oc-h-go').addEventListener('click', async () => {
      const f = sh.querySelector('#oc-h-from').value, t = sh.querySelector('#oc-h-to').value;
      if(!f || !t || t < f){ toast('בדקו את התאריכים'); return; }
      const id = crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
      const r = await sbPersonal.from('oncall_period').insert({ key:'h:' + id, kind:'holiday', title:sh.querySelector('#oc-h-title').value.trim() || 'חג', from_day:f, to_day:t });
      if(r.error){ toast('לא נשמר'); return; }
      sh.close(); oc.key = 'h:' + id; again();
    });
  });
}
