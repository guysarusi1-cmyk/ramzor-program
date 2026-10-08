
// ---------- THE INSTRUCTOR PORTAL: the shell (app home, header, tabs, shared pieces) ----------
// Demo mode: there are no personal logins yet, so a small "viewing as" selector lets you see the portal as the
// coordinator or as any instructor. Everything is stored in this browser only (see 14a-portal-data.js).
const portalHomeFirst = () => PORTAL_ENABLED && !window.__portalNoHome && location.hash !== '#tv';       // (the test tools set __portalNoHome: they start from the רמזור home)
const portalUi = { persona:'c1', tab:null, month:null, level:'avoid', openDay:null, fold:{ mine:false, team:false, swap:false } };

function portalPerson(id){ return portalLoad().instructors.find(p => p.id === id); }
function portalMe(){ return portalPerson(portalUi.persona) || portalLoad().instructors[0]; }          // (in server mode persona = the signed-in person)
function portalIsCoordinator(){ return portalMe().role === 'coordinator'; }
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
  stopCarousel();
  portalActivateView('view-apphome');
  document.getElementById('view-apphome').innerHTML = `
    <div class="apphome">
      <div class="apphome-top"><button type="button" class="home-text-btn" id="apphome-logout">יציאה</button></div>
      <div class="eyebrow-gold">מרכז חירום</div>
      <h1 class="apphome-title">מה תרצו לפתוח?</h1>
      <div class="apphome-cards">
        <button type="button" class="home-card" id="apphome-ramzor">
          <span class="apphome-emoji" aria-hidden="true">🚦</span>
          <span class="home-card-title">הרמזור</span>
          <span class="home-card-sub">תפעול יומיומי ומסך הילדים</span>
        </button>
        <button type="button" class="home-card" id="apphome-portal">
          <span class="apphome-emoji" aria-hidden="true">👥</span>
          <span class="home-card-title">פורטל המדריך</span>
          <span class="home-card-sub">משמרות, העדפות והודעות</span>
        </button>
      </div>
      <div class="apphome-demo">גרסת דמו של הפורטל: הנתונים בו לדוגמה בלבד ונשמרים במכשיר הזה.</div>
    </div>`;
  document.getElementById('apphome-ramzor').addEventListener('click', showHub);
  document.getElementById('apphome-portal').addEventListener('click', showPortal);
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
  view.innerHTML = `
    <div class="portal-shell" data-ptheme="${st.settings.theme}">
      <div class="portal-top">
        <button type="button" class="back-btn portal-back" id="portal-home">${portalServerOn ? 'יציאה' : '→ מסך ראשי'}</button>
        <h1 class="portal-title">פורטל המדריך</h1>
        <span class="portal-top-actions">${portalServerOn ? '<button type="button" class="portal-theme" id="portal-gear" aria-label="העדפות מערכת" title="העדפות מערכת">⚙️</button>' : ''}<button type="button" class="portal-theme" id="portal-theme" aria-label="החלפה בין מצב כהה לבהיר">${st.settings.theme === 'dark' ? '☀️' : '🌙'}</button></span>
      </div>
      ${portalServerOn ? `<div class="portal-hello">שלום ${pEsc(me.first)}</div>` : `<label class="portal-as">צפייה כ:
        <select id="portal-persona">${st.instructors.filter(p => p.active).map(p => `<option value="${p.id}"${p.id === me.id ? ' selected' : ''}>${pEsc(instrName(p, st.instructors))}${p.role === 'coordinator' ? ' (רכזת)' : ''}</option>`).join('')}</select>
        <span class="portal-demo-tag">דמו</span>
      </label>`}
      <nav class="portal-tabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" data-ptab="${t[0]}" class="${t[0] === portalUi.tab ? 'active' : ''}">${t[1]}</button>`).join('')}</nav>
      <div id="portal-body"></div>
    </div>`;
  document.getElementById('portal-home').addEventListener('click', portalServerOn ? srvSignOut : showAppHome);
  const gear = document.getElementById('portal-gear'); if(gear) gear.addEventListener('click', openPortalSettings);
  document.getElementById('portal-theme').addEventListener('click', () => { st.settings.theme = st.settings.theme === 'dark' ? 'light' : 'dark'; if(portalServerOn){ try { localStorage.setItem('ramzor-portal-theme', st.settings.theme); } catch(e){} } else portalSave(); showPortal(); });
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

// the whole team as a weekly calendar: seven days across, one row per shift. In the afternoon shifts and on Friday and Saturday mornings the ahmash
// (who is in charge of the shift) is shown first, with a star and the word אחמ"ש. opts: me, week (the Sunday that is shown), ahmash ({ staff id: rank })
function weekCalHtml(ctx, assignments, opts){
  opts = opts || {};
  const table = scheduleTable(ctx, assignments), today = isoDate(new Date()), rowOf = {}, weeks = [];
  table.forEach(r => { rowOf[r.date] = r; const ws = addDays(r.date, -dowOf(r.date)); if(!weeks.includes(ws)) weeks.push(ws); });
  if(!weeks.length) return '';
  let wi = weeks.indexOf(opts.week); if(wi < 0) wi = Math.max(0, weeks.indexOf(addDays(today, -dowOf(today))));
  const ws = weeks[wi], dates = [0, 1, 2, 3, 4, 5, 6].map(k => addDays(ws, k)), rank = opts.ahmash || {};
  const dm = iso => { const d = parseIso(iso); return d.getDate() + '/' + (d.getMonth() + 1); };
  const picks = ahmashPicks(table, ctx, rank);
  const cell = (s, date) => {
    const r = rowOf[date], c = r && r.cells[ctx.shiftTypes.indexOf(s)];
    if(!c || !c.slot) return `<div class="wcal-cell off${[5, 6].includes(dowOf(date)) ? ' weekend' : ''}">${r ? '—' : ''}</div>`;

    const chip = (p, lead) => {
      const mine = opts.me && p.iid === opts.me, ann = ctx.annot && ctx.annot[c.slot.key + '|' + p.iid];
      return `<span class="pchip lv-neutral${mine ? ' me' : ''}${lead ? ' ahm' : ''}">${pEsc(p.name)}${ann ? ` <small>${pEsc(ann)}</small>` : ''}${lead ? '<small class="ahm-tag">אחמ"ש</small>' : ''}</span>`;
    };
    const lead = c.people.filter(p => picks[c.slot.key] === p.iid), rest = c.people.filter(p => !lead.includes(p));
    return `<div class="wcal-cell${[5, 6].includes(dowOf(date)) ? ' weekend' : ''}${date === today ? ' today' : ''}">${lead.map(p => chip(p, true)).join('')}${rest.map(p => chip(p, false)).join('')}${c.missing ? `<span class="pchip missing">חסר ${c.missing}</span>` : ''}</div>`;
  };
  const nav = `<div class="pweek"><button type="button" data-wkgo="${weeks[wi - 1] || ''}"${wi === 0 ? ' disabled' : ''} aria-label="שבוע קודם"><bdi dir="ltr">›</bdi></button><b>שבוע ${dm(ws)} – ${dm(addDays(ws, 6))}</b><button type="button" data-wkgo="${weeks[wi + 1] || ''}"${wi === weeks.length - 1 ? ' disabled' : ''} aria-label="שבוע הבא"><bdi dir="ltr">‹</bdi></button></div>`;
  const head = `<div class="wcal-corner"></div>${dates.map(d => `<div class="wcal-dayhead${d === today ? ' today' : ''}${[5, 6].includes(dowOf(d)) ? ' weekend' : ''}"><b>${DOW_SHORT[dowOf(d)]}</b><span>${dm(d)}</span></div>`).join('')}`;
  const rows = ctx.shiftTypes.map(s => `<div class="wcal-rowhead"><b>${pEsc(s.label)}</b><small>${rangeHtml(s.start, s.end)}</small></div>${dates.map(d => cell(s, d)).join('')}`).join('');
  return `${nav}<div class="wcal-scroll"><div class="wcal">${head}${rows}</div></div><div class="pnote wcal-legend">אחמ"ש: מי שאחראי/ת על המשמרת (בצהריים, ובשישי ובשבת גם בבוקר)</div>`;
}
