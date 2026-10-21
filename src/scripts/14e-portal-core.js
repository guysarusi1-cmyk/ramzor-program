
// ---------- THE INSTRUCTOR PORTAL: the shell (app home, header, tabs, shared pieces) ----------
// Demo mode: there are no personal logins yet, so a small "viewing as" selector lets you see the portal as the
// coordinator or as any instructor. Everything is stored in this browser only (see 14a-portal-data.js).
const portalHomeFirst = () => PORTAL_ENABLED && !window.__portalNoHome && location.hash !== '#tv';       // (the test tools set __portalNoHome: they start from the רמזור home)
const portalUi = { persona:'c1', tab:null, month:null, level:'avoid', openDay:null, fold:{ mine:false, team:false, swap:false } };

function portalPerson(id){ return portalLoad().instructors.find(p => p.id === id); }
function portalMe(){ return portalPerson(portalUi.persona) || portalLoad().instructors[0]; }          // (in server mode persona = the signed-in person)
function portalIsCoordinator(){ return portalMe().role === 'coordinator'; }
// the coordinator's view of the portal: the coordinator herself, or the admin when he opened the management portal (an admin can also be an instructor)
// the leopard look: everybody may choose it in the gear; the coordinator has it by default, until she chooses another look (Guy 2026-10-20)
const leopardAllowed = () => !!srv.meRow;
const portalThemeNow = () => srv.portalTheme || (srv.meRow && srv.meRow.role === 'coordinator' ? 'leopard' : null);
const portalAsCoord = me => !!me && (me.role === 'coordinator' || (!!portalUi.manager && !!me.admin));
function pEsc(s){ return escapeHtml(s == null ? '' : s); }
function portalActivateView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.body.classList.add('portal-mode');
  window.scrollTo(0, 0);
}
function queueEmail(to, subject, body){
  const st = portalLoad();
  const plain = x => String(x).replace(/<[^>]+>/g, '');
  st.outbox.unshift({ id:'e' + Date.now() + Math.floor(Math.random() * 1000), at:new Date().toISOString(), to, subject:plain(subject), body:plain(body) });
  st.outbox.length = Math.min(st.outbox.length, 40);
  portalSave();
}

// ---- the first screen after login: two cards
function showAppHome(){
  stopCarousel(); document.body.classList.remove('leopard-bg');
  if(portalUi.viewAs){ portalUi.viewAs = null; if(typeof srv !== 'undefined' && srv.me) portalUi.persona = srv.me; }          // (leaving "looking as somebody" by any way: back to being oneself)
  portalActivateView('view-apphome');
  document.getElementById('view-apphome').innerHTML = `
    <div class="apphome">
      <div class="apphome-top"><button type="button" class="home-text-btn" id="apphome-logout">יציאה</button></div>
      <div class="eyebrow-gold">מרכז חירום</div>
      <h1 class="apphome-title">מה תרצו לפתוח?</h1>
      <div class="apphome-cards">
        ${portalServerOn ? `<div class="apphome-hello">שלום ${pEsc((portalMe() || {}).first || '')}</div>` : ''}
        <button type="button" class="home-card" id="apphome-ramzor">
          <span class="apphome-emoji" aria-hidden="true">🚦</span>
          <span class="home-card-title">הרמזור</span>
          <span class="home-card-sub">תפעול יומיומי ומסך הילדים</span>
        </button>
        ${(portalMe() || {}).role === 'therapist' ? '' : `<button type="button" class="home-card" id="apphome-portal">
          <span class="apphome-emoji" aria-hidden="true">👥</span>
          <span class="home-card-title">${portalServerOn && (portalMe() || {}).role === 'coordinator' ? ((portalMe() || {}).admin ? 'פורטל ניהול' : 'פורטל הרכזת') : 'פורטל המדריך'}</span>
          <span class="home-card-sub">משמרות, העדפות והודעות</span>
        </button>`}
        ${typeof therapyAvailable === 'function' && therapyAvailable() ? `<button type="button" class="home-card" id="apphome-therapy">
          <span class="apphome-emoji" aria-hidden="true">🌱</span>
          <span class="home-card-title">פורטל הטיפול</span>
          <span class="home-card-sub">התוכנית הטיפולית של כל ילד, והכוונה לצוות</span>
        </button>` : ''}
        ${portalServerOn && (portalMe() || {}).admin && (portalMe() || {}).role !== 'coordinator' ? `<button type="button" class="home-card" id="apphome-manage">
          <span class="apphome-emoji" aria-hidden="true">🛠️</span>
          <span class="home-card-title">פורטל ניהול</span>
          <span class="home-card-sub">כל מה שהרכזת רואה ועושה, ועוד</span>
        </button>` : ''}
      </div>
      ${installLinkHtml()}
      ${portalServerOn || sbPersonal ? '' : '<div class="apphome-demo">גרסת דמו של הפורטל: הנתונים בו לדוגמה בלבד ונשמרים במכשיר הזה.</div>'}
    </div>`;
  document.getElementById('apphome-ramzor').addEventListener('click', showHub);
  { const th = document.getElementById('apphome-therapy'); if(th) th.addEventListener('click', showTherapyPortal); }          // (Mercury: the therapy portal, 14w-therapy-portal.js)
  if(document.getElementById('apphome-portal')) document.getElementById('apphome-portal').addEventListener('click', () => { portalUi.manager = false; if(portalServerOn) srvOpenPortal(); else if(typeof srvShowLogin === 'function' && sbPersonal && !window.__portalDemo) srvShowLogin('email'); else showPortal(); });          // (with the staff password: the personal sign-in, not a demo)
  const mg = document.getElementById('apphome-manage'); if(mg) mg.addEventListener('click', () => { portalUi.manager = true; srvOpenPortal(); });
  document.getElementById('apphome-logout').addEventListener('click', () => document.getElementById('hub-logout-link').click());
}

// ---- the portal itself
function portalTabsFor(me){
  if(portalServerOn) return srvTabs(me);
  return me.role === 'coordinator'
    ? [['schedule', 'סידור'], ['submissions', 'הגשות'], ['swaps', 'החלפות'], ['timetable', 'לו"ז'], ['settings', 'הגדרות']]
    : [['schedule', 'הסידור'], ['prefs', 'העדפות'], ['swaps', 'החלפות'], ['inbox', 'הודעות']];
}
function showPortal(tab){
  const st = portalLoad(), me = portalMe();
  portalActivateView('view-portal');
  const tabs = portalTabsFor(me);
  if(typeof tab === 'string') portalUi.tab = tab;
  if(!tabs.some(t => t[0] === portalUi.tab)) portalUi.tab = tabs[0][0];
  const today = monthKeyOf(isoDate(new Date()));
  if(!portalUi.month) portalUi.month = today;
  const view = document.getElementById('view-portal');
  const leopard = portalServerOn && !portalUi.viewAs && leopardAllowed() && portalThemeNow() === 'leopard', theme = leopard ? 'leopard' : st.settings.theme;          // (the leopard look: the coordinator's own choice, kept with her account)
  document.body.classList.toggle('leopard-bg', leopard);
  view.innerHTML = `
    <div class="portal-shell${portalServerOn && portalAsCoord(me) ? ' wide' : ''}" data-ptheme="${theme}">
      <div class="portal-top">
        <button type="button" class="back-btn portal-back" id="portal-home">${portalServerOn && !ramzorPersonal ? 'יציאה' : '→ מסך ראשי'}</button>
        <h1 class="portal-title">${portalServerOn && portalAsCoord(me) ? (me.admin ? 'פורטל ניהול' : 'פורטל הרכזת') : portalServerOn && me.role === 'service' ? 'פורטל בנות השירות' : 'פורטל המדריך'}</h1>
        <span class="portal-top-actions">${portalServerOn && ['service', 'teacher'].includes(me.role) && typeof therapyAvailable === 'function' && therapyAvailable() ? '<button type="button" class="portal-theme" id="portal-therapy" aria-label="פורטל הטיפול" title="פורטל הטיפול">🌱</button>' : ''}${portalServerOn ? '<button type="button" class="portal-theme" id="portal-gear" aria-label="העדפות מערכת" title="העדפות מערכת">⚙️</button>' : ''}<button type="button" class="portal-theme" id="portal-theme" aria-label="החלפה בין מצב כהה לבהיר">${leopard ? '🐆' : st.settings.theme === 'dark' ? '☀️' : '🌙'}</button></span>
      </div>
      ${portalServerOn ? `<div class="portal-hello">שלום ${pEsc(me.first)}</div>` : `<label class="portal-as">צפייה כ:
        <select id="portal-persona">${st.instructors.filter(p => p.active).map(p => `<option value="${p.id}"${p.id === me.id ? ' selected' : ''}>${pEsc(instrName(p, st.instructors))}${p.role === 'coordinator' ? ' (רכזת)' : ''}</option>`).join('')}</select>
        <span class="portal-demo-tag">דמו</span>
      </label>`}
      <nav class="portal-tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" data-ptab="${t[0]}" class="${t[0] === portalUi.tab ? 'active' : ''}">${t[1]}</button>`).join('')}</nav>
      ${portalServerOn && portalUi.viewAs ? `<div class="adm-viewas"><span>👁️ צפייה כמו ש${pEsc(me.first)} רואה · רק לצפייה</span><button type="button" class="btn small" id="viewas-end">חזרה לפורטל הניהול</button></div>` : ''}
      <div id="portal-body"></div>
      ${portalServerOn && srv.meRow && !['instructor', 'coordinator'].includes(srv.meRow.role) && !srv.meRow.admin ? installLinkHtml() : ''}
      ${portalServerOn ? '<button type="button" class="portal-problem" id="portal-problem">משהו לא עובד? דיווח על תקלה</button>' : ''}
    </div>`;
  if(portalServerOn && portalUi.viewAs){          // (the admin looks at somebody's portal: folds, months and tabs work; nothing can be changed)
    document.getElementById('viewas-end').addEventListener('click', adminViewAsEnd);
    document.getElementById('portal-body').addEventListener('click', ev => {
      if(ev.target.closest('summary, [data-pmonth], .pfold > summary')) return;
      if(ev.target.closest('button, input, select, textarea, a, [data-pslot], [data-pday], [role=button]')){ ev.preventDefault(); ev.stopPropagation(); toast('זו צפייה בלבד'); }
    }, true);
  }
  document.getElementById('portal-home').addEventListener('click', portalServerOn && !ramzorPersonal ? srvSignOut : showAppHome);          // (after the one personal sign-in: back to the two cards; leaving is there)
  const gear = document.getElementById('portal-gear'); if(gear) gear.addEventListener('click', openPortalSettings);
  { const th = document.getElementById('portal-therapy'); if(th) th.addEventListener('click', showTherapyPortal); }          // (service girls and teachers: their way to the therapy portal)
  const prob = document.getElementById('portal-problem'); if(prob) prob.addEventListener('click', openProblemReport);
  document.getElementById('portal-theme').addEventListener('click', () => { if(leopard){ srv.portalTheme = null; srvSaveSetting({ portalTheme:st.settings.theme }); showPortal(); return; } st.settings.theme = st.settings.theme === 'dark' ? 'light' : 'dark'; if(portalServerOn){ try { localStorage.setItem('ramzor-portal-theme', st.settings.theme); } catch(e){} } else portalSave(); showPortal(); });
  if(!portalServerOn) document.getElementById('portal-persona').addEventListener('change', e => { portalUi.persona = e.target.value; portalUi.tab = null; showPortal(); });
  view.querySelectorAll('[data-ptab]').forEach(b => b.addEventListener('click', () => { portalUi.tab = b.dataset.ptab; showPortal(); }));
  portalRenderTab();
}
function portalRenderTab(){
  const me = portalMe(), body = document.getElementById('portal-body'), t = portalUi.tab;
  if(portalServerOn) return srvRenderTab(me, body, t);
  if(me.role === 'coordinator'){
    if(t === 'schedule') renderCoordSchedule(body); else if(t === 'submissions') renderCoordSubmissions(body);
    else if(t === 'swaps') renderCoordSwaps(body); else if(t === 'timetable') renderCoordTimetable(body); else renderCoordSettings(body);
  } else {
    if(t === 'schedule') renderInstructorSchedule(body); else if(t === 'prefs') renderInstructorPrefs(body);
    else if(t === 'swaps') renderInstructorSwaps(body); else renderInstructorInbox(body);
  }
}
function portalRefresh(){ portalRenderTab(); }

// ---- shared small pieces
function monthNavHtml(mk, extra){
  return `<div class="pmonth"><button type="button" data-pmonth="-1" aria-label="חודש קודם"><bdi dir="ltr">›</bdi></button><b>${monthLabel(mk)}</b><button type="button" data-pmonth="1" aria-label="חודש הבא"><bdi dir="ltr">‹</bdi></button>${extra || ''}</div>`;          // (the arrows are fixed left-to-right, so that no phone mirrors them: the right one points right, the left one points left)
}
function wireMonthNav(root, key){
  key = key || 'month';
  root.querySelectorAll('[data-pmonth]').forEach(b => b.addEventListener('click', () => { portalUi[key] = addMonths(portalUi[key], Number(b.dataset.pmonth)); portalRefresh(); }));
}
function portalCtx(mk){
  const st = portalLoad(), m = portalMonth(mk);
  return { month:mk, instructors:st.instructors, shiftTypes:st.shiftTypes, prefs:m.prefs, rules:st.rules, annot:m.annot || {} };
}
// a bottom sheet with any content; returns the element (close with [data-close] or by tapping outside)
function portalSheet(html){
  const wrap = document.createElement('div');
  wrap.className = 'sheet psheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `<div class="sheet-card">${html}</div>`;
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => { if(e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.close = close;
  document.body.appendChild(wrap);
  return wrap;
}

// Who is THE ahmash of a shift (the one that is marked): in the afternoon shifts, and on Friday and Saturday mornings. Only one is marked, even when several ahmash are on the shift.
// The choice goes through the month in order: a main ahmash (rank 1) before a second-rank one (who is chosen only when no main one is on the shift); then somebody who was NOT the
// ahmash the day before; then the one who has been the ahmash the fewest times so far this month; then by id, so that everybody sees the same.  rank = { staff id: 1 | 2 }
function ahmashInCharge(id, date){ return id === 'e' || ([5, 6].includes(dowOf(date)) && id === 'm'); }
function ahmashPicks(table, ctx, rank){
  const picks = {}, count = {}, was = {};
  table.forEach(r => r.cells.forEach((c, i) => {
    const s = ctx.shiftTypes[i]; if(!c.slot || !s || !ahmashInCharge(s.id, r.date)) return;
    const cand = c.people.filter(p => (rank[p.iid] || 0) > 0); if(!cand.length) return;
    const best = Math.min(...cand.map(p => rank[p.iid]));
    let pool = cand.filter(p => rank[p.iid] === best);
    const fresh = pool.filter(p => !(was[p.iid] && was[p.iid].has(addDays(r.date, -1)))); if(fresh.length) pool = fresh;
    pool.sort((a, b) => (count[a.iid] || 0) - (count[b.iid] || 0) || String(a.iid).localeCompare(String(b.iid)));
    const pick = pool[0]; picks[c.slot.key] = pick.iid; count[pick.iid] = (count[pick.iid] || 0) + 1; (was[pick.iid] = was[pick.iid] || new Set()).add(r.date);
  }));
  return picks;
}

// the schedule table: one row per day, one column per shift. In the coordinator's view every name is coloured by how
// well the wish was kept; instructors see the whole team's schedule with only their own name highlighted.
function boardHtml(ctx, assignments, opts){
  opts = opts || {};
  const byId = {}; ctx.instructors.forEach(p => { byId[p.id] = p; });
  const table = scheduleTable(ctx, assignments), today = isoDate(new Date());
  const head = `<tr><th></th>${ctx.shiftTypes.map(s => `<th>${pEsc(s.label)}<small>${rangeHtml(s.start, s.end)}</small></th>`).join('')}</tr>`;
  const approvals = (portalMonth(ctx.month).approvals) || {}, picks = opts.ahmash ? ahmashPicks(table, ctx, opts.ahmash) : {};
  const body = table.map(r => `<tr class="${r.date === today ? 'today' : ''}${opts.nextDate === r.date ? ' next-row' : ''}${[5, 6].includes(dowOf(r.date)) ? ' weekend' : ''}"><th scope="row"><b>${DOW_SHORT[dowOf(r.date)]}</b> ${parseIso(r.date).getDate()}</th>${r.cells.map((c, i) => {
    if(!c.slot) return '<td class="off">—</td>';
    const chips = c.people.map(p => {
      const pid = p.iid;
      const mine = opts.me && pid === opts.me;
      const cls = opts.colour ? 'lv-' + p.level : 'lv-neutral';
      const pending = approvals[c.slot.key + '|' + pid] === 'pending';
      const ann = ctx.annot && ctx.annot[c.slot.key + '|' + pid];
      const lead = picks[c.slot.key] === pid;
      return `<span class="pchip ${cls}${mine ? ' me' : ''}${pending ? ' pending' : ''}${lead ? ' ahm' : ''}">${pEsc(p.name)}${lead ? '<small class="ahm-tag">אחמ"ש</small>' : ''}${ann ? ` <small>${pEsc(ann)}</small>` : ''}${pending ? ' ⏳' : ''}</span>`;
    }).join('');
    const miss = c.missing ? `<span class="pchip missing">חסר ${c.missing}</span>` : '';
    return `<td${opts.edit ? ` class="editable" data-key="${c.slot.key}" tabindex="0" role="button" aria-label="עריכת משמרת"` : ''}>${chips}${miss}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="board-scroll"><table class="pboard"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

// the whole team as a monthly calendar (the structure of the paper schedule): the days of the week above; in every week a row with the day numbers and under it the morning,
// noon and night, with the name of each shift (and its hours) written once, at the start of the week. Everything fits the width of the screen (no sideways scrolling).
// In the afternoon shifts, and on Friday and Saturday mornings, the ahmash is written first and marked אחמ"ש (one per shift, see ahmashPicks); the person herself is highlighted.
// opts: me, ahmash ({ staff id: rank }); for the coordinator: sel (the person whose requests are open at the side; her names are outlined), colour (names coloured by how the wish was kept) and edit (a tap on a shift opens its editor)
// the key of the colours of the coordinator's calendar (shown under her panel of the instructors' requests)
const mcalKeyHtml = compact => compact === 'tab' ? `<span class="mcal-key tab-key" title="שובץ/ה במשמרת שסימן/ה כך"><span class="mcal-name wish-yes">כן</span><span class="mcal-name wish-can">יכול</span><span class="mcal-name wish-no">לא</span><span class="mcal-name wish-none">לא סומן</span></span>` : compact ? `<div class="mcal-key compact" title="שובץ/ה במשמרת שסימן/ה כך"><span class="mcal-name wish-yes">כן</span><span class="mcal-name wish-can">יכול</span><span class="mcal-name wish-no">לא</span><span class="mcal-name wish-none">לא סומן</span></div>` : '<div class="pnote mcal-key"><span class="mcal-name wish-yes">כן</span> <span class="mcal-name wish-can">יכול</span> <span class="mcal-name wish-no">לא</span> <span class="mcal-name wish-none">לא סומן</span> שובץ/ה במשמרת שסימן/ה כך.</div>';
// the service girls and the teachers of a month by shift ("day|m"), each with her hours when they are not the shift's usual ones
function othersByShift(ctx){
  if(typeof portalServerOn === 'undefined' || !portalServerOn || !portalState || !portalState.rows) return {};
  const st = portalLoad(), out = {}, hh = x => String(parseInt(x, 10));
  st.rows.forEach(r => {
    if(monthKeyOf(r.day) !== ctx.month) return;
    const p = st.instructors.find(x => x.id === r.staff); if(!p || !['service', 'teacher'].includes(p.role)) return;
    const sid = (typeof SRV_SHIFT_UI !== 'undefined' && SRV_SHIFT_UI[r.shift]) || 'm', std = typeof SRV_STD !== 'undefined' ? SRV_STD[r.shift] : null;
    const note = r.from && r.to && (!std || r.from !== std[0] || r.to !== std[1]) ? hh(r.from) + '–' + hh(r.to) : '';
    (out[`${r.day}|${sid}`] = out[`${r.day}|${sid}`] || []).push({ id:p.id, role:p.role, name:instrName(p, st.instructors), note, from:r.from || '' });
  });
  Object.values(out).forEach(l => l.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name)));
  return out;
}
function monthCalHtml(ctx, assignments, opts){
  opts = opts || {};
  const table = scheduleTable(ctx, assignments), today = isoDate(new Date()), picks = ahmashPicks(table, ctx, opts.ahmash || {});
  if(!table.length) return '';
  const hh = x => String(parseInt(x, 10)), hours = s => hh(s.start) + '-' + hh(s.end);
  const blank = '<div class="mcal-blank"></div>', lead = dowOf(table[0].date);
  const others = opts.others === false || opts.othersInCells || typeof scheduleOthersOf !== 'function' ? null : scheduleOthersOf(ctx);          // (the service girls and the teachers: one slim line under every day in the coordinator's calendar; she can hide it)
  const inCells = opts.othersInCells ? othersByShift(ctx) : {};          // (the calendar of the staff: they are in the shifts like the instructors; a teacher first, the service girls last — Guy 2026-10-18)
  let weekOthers = false;
  const flat = Array(lead).fill(null).concat(table); while(flat.length % 7) flat.push(null);
  const shiftCell = (r, i) => {
    const c = r.cells[i], s = ctx.shiftTypes[i], wk = [5, 6].includes(dowOf(r.date)), last = i === ctx.shiftTypes.length - 1 && !weekOthers;
    const cls = `mcal-cell${wk ? ' weekend' : ''}${r.date === today ? ' today' : ''}${last ? ' last' : ''}${opts.edit && c.slot ? ' editable' : ''}`, edit = opts.edit && c.slot ? ` data-key="${c.slot.key}" tabindex="0" role="button" aria-label="עריכת משמרת"` : '';
    const oth = inCells[`${r.date}|${s.id}`] || [], othName = x => `<span class="mcal-name${opts.me && x.id === opts.me ? ' me' : ''}" data-role="${x.role}">${pEsc(x.name)}${x.note ? `<small>${pEsc(x.note)}</small>` : ''}</span>`;
    const teachers = oth.filter(x => x.role === 'teacher').map(othName).join(''), service = oth.filter(x => x.role === 'service').map(othName).join('');
    if(!c.slot) return oth.length ? `<div class="${cls}" data-day="${r.date}" data-shift="${s.id}">${teachers}${service}</div>` : `<div class="${cls} off" data-day="${r.date}" data-shift="${s.id}"></div>`;
    const wish = p => {          // how the wish of this person was kept: placed where she wanted = no colour; "can", "no" and "did not say" each have a colour
      if(!opts.colour) return '';
      const pr = (ctx.prefs && ctx.prefs[p.iid]) || { slots:{} }, ann = ctx.annot && ctx.annot[c.slot.key + '|' + p.iid];
      const key = ann === 'סופ"ש ארוך' ? `${dowOf(c.slot.date) === 5 ? c.slot.date : addDays(c.slot.date, -1)}|l` : c.slot.key, lv = (pr.slots || {})[key];
      return lv === 'avoid' ? ' wish-can' : lv === 'no' ? ' wish-no' : lv === 'yes' ? ' wish-yes' : ' wish-none';
    };
    const lead = c.people.filter(p => picks[c.slot.key] === p.iid), rest = c.people.filter(p => !lead.includes(p));
    const name = (p, isLead) => {
      const mine = opts.me && p.iid === opts.me, ann = ctx.annot && ctx.annot[c.slot.key + '|' + p.iid];
      return `<span class="mcal-name${mine ? ' me' : ''}${isLead ? ' ahm' : ''}${wish(p)}${opts.sel && opts.sel === p.iid ? ' sel' : ''}">${pEsc(p.name)}${isLead ? '<small class="ahm-tag">אחמ"ש</small>' : ''}${ann ? `<small>${pEsc(ann)}</small>` : ''}</span>`;
    };
    return `<div class="${cls}" data-day="${r.date}" data-shift="${s.id}"${edit}>${teachers}${lead.map(p => name(p, true)).join('')}${rest.map(p => name(p, false)).join('')}${service}${c.missing ? `<span class="mcal-missing">חסר ${c.missing}</span>` : ''}</div>`;
  };
  let out = `<div class="mcal-corner"></div>${DOW_SHORT.map(d => `<div class="mcal-head">${d}</div>`).join('')}`;
  for(let w = 0; w < flat.length; w += 7){
    const week = flat.slice(w, w + 7);
    if(w > 0) out += `<div class="mcal-corner"></div>${DOW_SHORT.map(d => `<div class="mcal-head mini" aria-hidden="true">${d}</div>`).join('')}`;          // (the days of the week again, small, above every later week: the screen scrolls down)
    out += `<div class="mcal-corner"></div>` + week.map(r => r ? `<div class="mcal-num${[5, 6].includes(dowOf(r.date)) ? ' weekend' : ''}${r.date === today ? ' today' : ''}">${parseIso(r.date).getDate()}</div>` : blank).join('');
    weekOthers = !!others && week.some(r => r && others[r.date]);
    ctx.shiftTypes.forEach((s, i) => { out += `<div class="mcal-label"><b>${pEsc(s.label)}</b><small>${hours(s)}</small></div>` + week.map(r => r ? shiftCell(r, i) : blank).join(''); });
    if(weekOthers){          // (two rows: the teachers, then the service girls — never mixed in one line)
      const nm = (x, k) => `<span class="mcal-other ${k}" title="${pEsc(x.name + (x.hours ? ' ' + x.hours : ''))}">${pEsc(x.name)}</span>`;
      const kinds = [['teacher', 'מורות'], ['service', 'שירות']].filter(([k]) => week.some(r => r && others[r.date] && others[r.date][k].length));
      kinds.forEach(([k, label], ki) => {
        out += `<div class="mcal-label others"><small class="${k}">${label}</small></div>` + week.map(r => {
          if(!r) return blank;
          const d = others[r.date] || { service:[], teacher:[] };
          return `<div class="mcal-others ${k}${ki === kinds.length - 1 ? ' last' : ''}${[5, 6].includes(dowOf(r.date)) ? ' weekend' : ''}${r.date === today ? ' today' : ''}" data-day="${r.date}">${d[k].map(x => nm(x, k)).join('')}</div>`;
        }).join('');
      });
    }
  }
  return `<div class="mcal">${out}</div>`;
}
