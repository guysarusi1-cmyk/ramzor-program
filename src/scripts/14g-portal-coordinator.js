
// ---------- THE INSTRUCTOR PORTAL: what the coordinator sees (the schedule, who submitted, swaps, timetable, settings) ----------
// The coordinator manages the work schedule and the children's timetable — nothing else (no children, no resets).
function issueText(i, ctx){
  const who = i.iid ? instrName(portalPerson(i.iid), ctx.instructors) : '';
  const where = slotLabel(i.key);
  switch(i.type){
    case 'unfilled': return `חסר/ים ${i.missing} מדריכים: ${where}`;
    case 'over': return `יותר מדי מדריכים (${i.extra} עודף): ${where}`;
    case 'no': return `${who} סימן/ה "ממש לא": ${where}`;
    case 'sameday': return `${who} משובץ/ת לשתי משמרות באותו יום: ${where}`;
    case 'rest': return `${who}: מנוחה קצרה מדי לפני ${where}`;
    case 'consec': return `${who}: יותר מדי ימים ברצף (${i.run}) ליד ${where}`;
    case 'maxweek': return `${who}: יותר מדי משמרות בשבוע (${i.count}) — ${where}`;
    case 'nights': return `${who}: יותר מדי משמרות לילה בחודש (${i.count})`;
  }
  return where;
}

function renderCoordSchedule(body){
  const st = portalLoad(), mk = portalUi.month, m = portalMonth(mk), ctx = portalCtx(mk);
  const hasAssign = Object.keys(m.assignments).some(k => (m.assignments[k] || []).length);
  const stats = scheduleStats(ctx, m.assignments), issues = validateSchedule(ctx, m.assignments);
  const people = st.instructors.filter(p => p.active && p.role === 'instructor');
  const missingSubmit = people.filter(p => !m.submitted[p.id]);
  const pct = n => stats.all.total ? Math.round(n * 100 / stats.all.total) : 0;
  const pendingCount = Object.values(m.approvals || {}).filter(v => v === 'pending').length;
  body.innerHTML = `
    ${monthNavHtml(mk, `<span class="pchip ${m.published ? 'lv-yes' : 'lv-avoid'}">${m.published ? 'פורסם' : 'טיוטה'}</span>`)}
    ${missingSubmit.length ? `<div class="pstatus bad">${missingSubmit.length} מדריכים עוד לא הגישו העדפות: ${missingSubmit.map(p => pEsc(instrName(p, st.instructors))).join(', ')}</div>` : ''}
    <div class="pactions">
      <button type="button" class="btn" id="cs-auto">שבץ אוטומטית</button>
      <button type="button" class="btn ghost" id="cs-publish"${hasAssign ? '' : ' disabled'}>${m.published ? 'פרסום מחדש' : 'פרסום'}</button>
      <button type="button" class="btn ghost" id="cs-xlsx"${hasAssign ? '' : ' disabled'}>ייצוא לאקסל</button>
      <button type="button" class="btn ghost" id="cs-print"${hasAssign ? '' : ' disabled'}>הדפסה / PDF</button>
      <button type="button" class="btn ghost" id="cs-mail">תצוגת מייל</button>
    </div>
    ${hasAssign ? `<div class="psummary" aria-label="סיכום שביעות הרצון">
      <span class="pchip lv-yes">קיבלו מה שרצו ${stats.all.yes} (${pct(stats.all.yes)}%)</span>
      <span class="pchip lv-neutral">בלי העדפה ${stats.all.neutral}</span>
      <span class="pchip lv-avoid">העדיפו שלא ${stats.all.avoid}</span>
      <span class="pchip lv-no">ממש לא ${stats.all.no}</span>
      ${stats.missing ? `<span class="pchip missing">חסרים ${stats.missing}</span>` : ''}
      ${pendingCount ? `<span class="pchip pending">ממתינים לאישור מדריך ${pendingCount}</span>` : ''}
    </div>` : '<div class="pnote">עוד אין סידור לחודש הזה. אפשר ללחוץ "שבץ אוטומטית", או לבנות ידנית בלחיצה על משמרות בטבלה.</div>'}
    ${issues.filter(i => i.type !== 'no').length ? `<details class="pissues"><summary>${issues.filter(i => i.type !== 'no').length} דברים שדורשים תשומת לב</summary>${issues.filter(i => i.type !== 'no').slice(0, 40).map(i => `<div>• ${pEsc(issueText(i, ctx))}</div>`).join('')}</details>` : ''}
    <div class="pnote">לחיצה על משמרת בטבלה פותחת עריכה. הצבעים: ירוק = קיבל/ה מה שרצה, צהוב = העדיף/ה שלא, אדום = ממש לא או חסר.</div>
    ${boardHtml(ctx, m.assignments, { colour:true, edit:true })}`;
  wireMonthNav(body);
  body.querySelectorAll('td.editable').forEach(td => {
    const open = () => openSlotEditor(mk, td.dataset.key);
    td.addEventListener('click', open); td.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
  });
  document.getElementById('cs-auto').addEventListener('click', () => {
    const run = (keep) => {
      toast('משבץ...');
      setTimeout(() => {
        const res = autoSchedule(Object.assign({}, ctx, { fixed:keep ? m.assignments : null }));
        m.assignments = res.assignments;
        Object.keys(m.approvals).forEach(k => { const key = k.slice(0, k.lastIndexOf('|')), iid = k.slice(k.lastIndexOf('|') + 1); if(!(m.assignments[key] || []).includes(iid)) delete m.approvals[k]; });
        m.published = false; portalSave(); portalRefresh();
        toast(res.unfilled.length ? `השיבוץ מוכן, חסרים ${res.unfilled.reduce((a, u) => a + u.missing, 0)} מדריכים` : 'השיבוץ מוכן');
      }, 40);
    };
    if(!hasAssign) return run(false);
    const sh = portalSheet(`<h2>שיבוץ אוטומטי</h2><p class="confirm-text">כבר יש סידור לחודש הזה. מה לעשות?</p>
      <div class="pstack"><button type="button" class="btn" id="auto-fill">למלא רק את החסר (משאיר את העריכות שלך)</button><button type="button" class="btn ghost" id="auto-all">לשבץ הכל מחדש</button><button type="button" class="btn ghost" data-close>ביטול</button></div>`);
    sh.querySelector('#auto-fill').addEventListener('click', () => { sh.close(); run(true); });
    sh.querySelector('#auto-all').addEventListener('click', () => { sh.close(); run(false); });
  });
  document.getElementById('cs-publish').addEventListener('click', () => {
    m.published = true;
    queueEmail('all', `הסידור ל${monthLabel(mk)} פורסם`, `שלום,\nהסידור לחודש ${monthLabel(mk)} פורסם. אפשר לראות את המשמרות שלך בפורטל המדריך.`);
    portalSave(); toast('הסידור פורסם, והמדריכים יקבלו הודעה'); portalRefresh();
  });
  document.getElementById('cs-xlsx').addEventListener('click', () => { downloadScheduleXlsx(ctx, m.assignments); toast('קובץ האקסל נוצר'); });
  document.getElementById('cs-print').addEventListener('click', () => printSchedule(ctx, m.assignments));
  document.getElementById('cs-mail').addEventListener('click', () => { const e = st.outbox.find(x => x.to === 'all') || st.outbox[0]; if(e) showMailPreview(e); else toast('עוד לא נוצרו הודעות. הן נוצרות בפרסום הסידור.'); });
}

// edit one shift: who is on it, with a live warning for every rule that would be broken
function openSlotEditor(mk, key){
  const st = portalLoad(), m = portalMonth(mk), ctx = portalCtx(mk);
  const slot = buildSlots(mk, ctx.shiftTypes).find(s => s.key === key); if(!slot) return;
  const people = st.instructors.filter(p => p.active && p.role === 'instructor');
  const chosen = new Set(m.assignments[key] || []);
  const sh = portalSheet(`<h2>${slotLabel(key)}</h2><div class="pnote">נדרשים ${slot.need} מדריכים. לצד כל שם: מה הוא/היא סימנ/ה.</div><div id="slot-warn" class="pwarn" aria-live="polite"></div><div class="pedit-list" id="slot-list"></div>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="slot-save">שמירה</button></div>`);
  const levelWord = { yes:'כן', neutral:'—', avoid:'מעדיף/ה שלא', no:'ממש לא' };
  const draw = () => {
    sh.querySelector('#slot-list').innerHTML = people.map(p => { const lv = levelOf(ctx.prefs, p.id, slot); return `<label class="pedit-row lv-${lv}"><input type="checkbox" data-pid="${p.id}"${chosen.has(p.id) ? ' checked' : ''}><img src="${p.photo}" alt=""><span>${pEsc(instrName(p, st.instructors))}</span><em>${levelWord[lv]}</em></label>`; }).join('');
    sh.querySelectorAll('[data-pid]').forEach(c => c.addEventListener('change', () => { if(c.checked) chosen.add(c.dataset.pid); else chosen.delete(c.dataset.pid); warn(); }));
    warn();
  };
  const warn = () => {
    const proposed = Object.assign({}, m.assignments, { [key]:[...chosen] });
    const mine = validateSchedule(ctx, proposed).filter(i => i.key === key || (i.iid && chosen.has(i.iid) && i.type !== 'unfilled'));
    sh.querySelector('#slot-warn').innerHTML = mine.length ? mine.map(i => `<div>⚠ ${pEsc(issueText(i, ctx))}${i.type === 'no' ? ' — נדרש אישור המדריך' : ''}</div>`).join('') : '';
  };
  sh.querySelector('#slot-save').addEventListener('click', () => {
    const before = new Set(m.assignments[key] || []);
    m.assignments[key] = [...chosen];
    chosen.forEach(pid => {
      const ak = key + '|' + pid;
      if(!before.has(pid) && levelOf(ctx.prefs, pid, slot) === 'no'){
        m.approvals[ak] = 'pending';
        queueEmail(pid, 'נדרש אישורך לשיבוץ', `הרכזת שיבצה אותך ל${slotLabel(key)}, למרות שסימנת "ממש לא". נא לאשר או לדחות בפורטל.`);
      }
    });
    before.forEach(pid => { if(!chosen.has(pid)) delete m.approvals[key + '|' + pid]; });
    portalSave(); sh.close(); portalRefresh();
  });
  draw();
}

function renderCoordSubmissions(body){
  const st = portalLoad();
  if(!portalUi.smonth) portalUi.smonth = addMonths(monthKeyOf(isoDate(new Date())), 1);
  const mk = portalUi.smonth, m = portalMonth(mk), people = st.instructors.filter(p => p.active && p.role === 'instructor');
  const missing = people.filter(p => !m.submitted[p.id]);
  body.innerHTML = `
    ${monthNavHtml(mk)}
    <label class="pfield">מועד אחרון להגשה<input type="date" id="sub-deadline" value="${m.deadline || ''}"></label>
    <div class="pstatus ${missing.length ? 'bad' : 'ok'}">${missing.length ? `${missing.length} מתוך ${people.length} עוד לא הגישו` : 'כולם הגישו ✓'}</div>
    <button type="button" class="btn${missing.length ? '' : ' ghost'}" id="sub-remind"${missing.length ? '' : ' disabled'}>שליחת תזכורת למי שלא הגיש</button>
    <div class="psubs">${people.map(p => { const pr = m.prefs[p.id] || { slots:{}, absent:[] }, c = { yes:0, avoid:0, no:0 }; Object.values(pr.slots).forEach(v => { c[v]++; });
      return `<div class="psub-row ${m.submitted[p.id] ? 'ok' : 'bad'}"><img src="${p.photo}" alt=""><b>${pEsc(instrName(p, st.instructors))}</b><span>${m.submitted[p.id] ? 'הוגש ✓' : 'לא הוגש'}</span><small>כן ${c.yes} · מעדיף שלא ${c.avoid} · ממש לא ${c.no} · היעדרות ${pr.absent.length}</small></div>`; }).join('')}</div>`;
  wireMonthNav(body.closest ? body : body, 'smonth');
  document.getElementById('sub-deadline').addEventListener('change', e => { m.deadline = e.target.value; portalSave(); });
  document.getElementById('sub-remind').addEventListener('click', () => {
    missing.forEach(p => queueEmail(p.id, `תזכורת: הגשת העדפות ל${monthLabel(mk)}`, `שלום ${p.first},\nעדיין לא הגשת העדפות משמרות ל${monthLabel(mk)}. ההגשה חובה, ונסגרת ב-${m.deadline || 'מועד שייקבע'}.`));
    portalSave(); toast(`נשלחו תזכורות ל-${missing.length} מדריכים`);
  });
}

function renderCoordSwaps(body){
  const st = portalLoad();
  const name = id => { const p = portalPerson(id); return p ? instrName(p, st.instructors) : '?'; };
  const agreed = st.swaps.filter(s => s.status === 'agreed'), waiting = st.swaps.filter(s => s.status === 'asked');
  const pending = [];
  Object.keys(st.months).forEach(mk => Object.keys(st.months[mk].approvals || {}).forEach(k => { if(st.months[mk].approvals[k] === 'pending') pending.push({ key:k.slice(0, k.lastIndexOf('|')), iid:k.slice(k.lastIndexOf('|') + 1) }); }));
  body.innerHTML = `
    <h2 class="psec">ממתינות לאישורך</h2>
    ${agreed.length ? agreed.map(s => `<div class="preq"><div><b>${pEsc(name(s.from))}</b> ← <b>${pEsc(name(s.to))}</b><br>${slotLabel(s.key)}<br><small>הקולגה הסכים/ה</small></div><div class="preq-actions"><button type="button" class="btn" data-approve="${s.id}">אישור</button><button type="button" class="btn ghost" data-reject="${s.id}">דחייה</button></div></div>`).join('') : '<div class="pnote">אין החלפות שממתינות לאישור.</div>'}
    <h2 class="psec">ממתינות לקולגה</h2>
    ${waiting.length ? waiting.map(s => `<div class="pmine-row"><span>${pEsc(name(s.from))} ← ${pEsc(name(s.to))} · ${slotLabel(s.key)}</span><em class="pst pst-asked">${SWAP_STATUS.asked}</em></div>`).join('') : '<div class="pnote">אין.</div>'}
    <h2 class="psec">שיבוצים שממתינים לאישור מדריך ("ממש לא")</h2>
    ${pending.length ? pending.map(p => `<div class="pmine-row"><span>${pEsc(name(p.iid))} · ${slotLabel(p.key)}</span><em class="pst pst-asked">ממתין למדריך</em></div>`).join('') : '<div class="pnote">אין.</div>'}`;
  body.querySelectorAll('[data-approve], [data-reject]').forEach(b => b.addEventListener('click', () => {
    const sw = st.swaps.find(x => x.id === (b.dataset.approve || b.dataset.reject));
    if(b.dataset.approve){
      const { date } = splitKey(sw.key), m = portalMonth(monthKeyOf(date));
      m.assignments[sw.key] = (m.assignments[sw.key] || []).map(id => id === sw.from ? sw.to : id);
      sw.status = 'approved';
      queueEmail(sw.from, 'ההחלפה אושרה', `${slotLabel(sw.key)} — עבר/ה ל${name(sw.to)}.`); queueEmail(sw.to, 'ההחלפה אושרה', `${slotLabel(sw.key)} — את/ה במקום ${name(sw.from)}.`);
      toast('ההחלפה אושרה והסידור עודכן');
    } else { sw.status = 'rejected'; queueEmail(sw.from, 'ההחלפה לא אושרה', slotLabel(sw.key)); toast('ההחלפה נדחתה'); }
    portalSave(); renderCoordSwaps(body);
  }));
}

// ---- the children's timetable: a weekly pattern for the month + exceptions on single dates
const ACTIVITY_ICONS = ['🥣', '🍝', '🍽️', '📚', '⚽', '🎬', '🛏️', '🎨', '🚌', '🏊', '🎲', '🌳', '🎂', '🛁', '🎵', '🕯️', '🧹', '🏠'];
function renderCoordTimetable(body){
  const st = portalLoad();
  if(!portalUi.tmonth) portalUi.tmonth = monthKeyOf(isoDate(new Date()));
  const mk = portalUi.tmonth;
  if(!st.timetable[mk]){ st.timetable[mk] = timetableDefault(); portalSave(); }
  const tt = st.timetable[mk];
  if(portalUi.ttDay === undefined || portalUi.ttDay === null) portalUi.ttDay = new Date().getDay();
  const target = portalUi.ttException ? { type:'exception', date:portalUi.ttException } : { type:'weekly', dow:portalUi.ttDay };
  const list = (target.type === 'exception' ? tt.exceptions[target.date] : tt.weekly[target.dow]) || [];
  const exDates = Object.keys(tt.exceptions).sort();
  body.innerHTML = `
    ${monthNavHtml(mk)}
    <div class="pnote">תכנית חודשית: בונים דפוס שבועי, ומוסיפים יום חריג כשיש יום מיוחד. זה מה שמוצג בטלוויזיה של הילדים.</div>
    <div class="pdays" role="tablist">${DOW_NAMES.map((n, i) => `<button type="button" data-ttday="${i}" class="${!portalUi.ttException && portalUi.ttDay === i ? 'active' : ''}">${DOW_SHORT[i]}</button>`).join('')}</div>
    ${portalUi.ttException ? `<div class="pstatus bad">עורכים יום חריג: ${dayLabel(portalUi.ttException)} <button type="button" class="btn ghost small" id="tt-back">חזרה לדפוס השבועי</button> <button type="button" class="btn ghost small" id="tt-del-ex">ביטול החריג</button></div>` : `<h2 class="psec">יום ${DOW_NAMES[portalUi.ttDay]} (בכל שבוע)</h2>`}
    <div class="ptt">${list.map((a, i) => `<button type="button" class="ptt-row" data-act="${i}"><span class="ptt-icon">${a.e}</span><b>${a.t}</b><span>${pEsc(a.n)}</span></button>`).join('') || '<div class="pnote">אין פעילויות ליום הזה.</div>'}</div>
    <button type="button" class="btn ghost" id="tt-add">+ הוספת פעילות</button>
    <h2 class="psec">ימים חריגים</h2>
    <div class="pex">${exDates.map(d => `<button type="button" class="pchip lv-avoid" data-ex="${d}">${dayLabel(d)}</button>`).join('') || '<div class="pnote">אין ימים חריגים.</div>'}</div>
    <label class="pfield">הוספת יום חריג<input type="date" id="tt-ex-date" min="${mk}-01" max="${mk}-${String(daysOfMonth(mk).length).padStart(2, '0')}"></label>`;
  wireMonthNav(body, 'tmonth');
  body.querySelectorAll('[data-ttday]').forEach(b => b.addEventListener('click', () => { portalUi.ttDay = Number(b.dataset.ttday); portalUi.ttException = null; renderCoordTimetable(body); }));
  body.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => { portalUi.ttException = b.dataset.ex; renderCoordTimetable(body); }));
  const back = document.getElementById('tt-back'); if(back) back.addEventListener('click', () => { portalUi.ttException = null; renderCoordTimetable(body); });
  const delEx = document.getElementById('tt-del-ex'); if(delEx) delEx.addEventListener('click', () => { delete tt.exceptions[portalUi.ttException]; portalUi.ttException = null; portalSave(); renderCoordTimetable(body); });
  document.getElementById('tt-ex-date').addEventListener('change', e => {
    const d = e.target.value; if(!d || monthKeyOf(d) !== mk) return;
    if(!tt.exceptions[d]) tt.exceptions[d] = JSON.parse(JSON.stringify(tt.weekly[dowOf(d)] || []));
    portalUi.ttException = d; portalSave(); renderCoordTimetable(body);
  });
  const editAct = idx => {
    const cur = idx === null ? { t:'12:00', e:'🍽️', n:'' } : list[idx];
    const sh = portalSheet(`<h2>${idx === null ? 'פעילות חדשה' : 'עריכת פעילות'}</h2>
      <label class="pfield">שעה<input type="time" id="act-t" value="${cur.t}"></label>
      <label class="pfield">שם קצר<input type="text" id="act-n" maxlength="22" value="${pEsc(cur.n)}"></label>
      <div class="pfield">אייקון (הילדים לא קוראים, אז תמונה גדולה)<div class="picons">${ACTIVITY_ICONS.map(e => `<button type="button" class="picon${e === cur.e ? ' active' : ''}" data-icon="${e}">${e}</button>`).join('')}</div></div>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="act-save">שמירה</button></div>
      ${idx === null ? '' : '<button type="button" class="btn ghost danger" id="act-del" style="width:100%;margin-top:10px;">מחיקת הפעילות</button>'}`);
    let icon = cur.e;
    sh.querySelectorAll('[data-icon]').forEach(b => b.addEventListener('click', () => { icon = b.dataset.icon; sh.querySelectorAll('.picon').forEach(x => x.classList.toggle('active', x === b)); }));
    const apply = fn => { const arr = target.type === 'exception' ? (tt.exceptions[target.date] = tt.exceptions[target.date] || []) : (tt.weekly[target.dow] = tt.weekly[target.dow] || []); fn(arr); portalSave(); sh.close(); renderCoordTimetable(body); };
    sh.querySelector('#act-save').addEventListener('click', () => {
      const a = { t:sh.querySelector('#act-t').value || cur.t, e:icon, n:sh.querySelector('#act-n').value.trim() || 'פעילות' };
      apply(arr => { if(idx === null) arr.push(a); else arr[idx] = a; arr.sort((x, y) => x.t.localeCompare(y.t)); });
    });
    const del = sh.querySelector('#act-del'); if(del) del.addEventListener('click', () => apply(arr => arr.splice(idx, 1)));
  };
  body.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => editAct(Number(b.dataset.act))));
  document.getElementById('tt-add').addEventListener('click', () => editAct(null));
}

function renderCoordSettings(body){
  const st = portalLoad();
  body.innerHTML = `
    <h2 class="psec">משמרות וכמה מדריכים בכל אחת</h2>
    <div class="pnote">אלה הערכים שהשיבוץ משתמש בהם. אפשר לשנות בכל עת.</div>
    ${st.shiftTypes.map((s, i) => `<div class="pshiftset" data-i="${i}">
      <label>שם<input type="text" data-f="label" value="${pEsc(s.label)}"></label>
      <label>התחלה<input type="time" data-f="start" value="${s.start}"></label>
      <label>סיום<input type="time" data-f="end" value="${s.end}"></label>
      <label>מדריכים<input type="number" min="0" max="12" data-f="need" value="${s.need}"></label>
      <label>בסופ"ש<input type="number" min="0" max="12" data-f="needWeekend" value="${s.needWeekend}"></label>
      <label class="pcheck"><input type="checkbox" data-f="night"${s.night ? ' checked' : ''}> לילה</label>
    </div>`).join('')}
    <h2 class="psec">כללים</h2>
    <div class="prules">
      <label>מקסימום משמרות בשבוע<input type="number" min="1" max="7" data-r="maxShiftsPerWeek" value="${st.rules.maxShiftsPerWeek}"></label>
      <label>מקסימום ימים ברצף<input type="number" min="1" max="14" data-r="maxConsecutiveDays" value="${st.rules.maxConsecutiveDays}"></label>
      <label>מנוחה מינימלית בין משמרות (שעות)<input type="number" min="0" max="24" data-r="minRestHours" value="${st.rules.minRestHours}"></label>
      <label>מקסימום לילות בחודש<input type="number" min="0" max="31" data-r="maxNightsPerMonth" value="${st.rules.maxNightsPerMonth}"></label>
    </div>
    <button type="button" class="btn" id="set-save">שמירת ההגדרות</button>
    <h2 class="psec">הודעה לצוות</h2>
    <textarea id="ann-text" rows="3" maxlength="240" placeholder="הודעה קצרה לכל המדריכים"></textarea>
    <button type="button" class="btn ghost" id="ann-send">שליחה</button>
    <h2 class="psec">נתוני הדמו</h2>
    <div class="pnote">הנתונים בגרסת הדמו לדוגמה בלבד. אפשר להתחיל מחדש בכל עת.</div>
    <button type="button" class="btn ghost danger" id="set-reset">איפוס נתוני הדמו</button>`;
  document.getElementById('set-save').addEventListener('click', () => {
    body.querySelectorAll('.pshiftset').forEach(row => {
      const s = st.shiftTypes[Number(row.dataset.i)];
      row.querySelectorAll('[data-f]').forEach(inp => { const f = inp.dataset.f; s[f] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Math.max(0, Number(inp.value) || 0) : inp.value; });
    });
    body.querySelectorAll('[data-r]').forEach(inp => { st.rules[inp.dataset.r] = Math.max(0, Number(inp.value) || 0); });
    portalSave(); toast('ההגדרות נשמרו');
  });
  document.getElementById('ann-send').addEventListener('click', () => {
    const t = document.getElementById('ann-text').value.trim(); if(!t) return;
    st.announcements.unshift({ id:'a' + Date.now(), date:isoDate(new Date()), from:portalMe().first, text:t });
    queueEmail('all', 'הודעה מהרכזת', t); portalSave(); toast('ההודעה נשלחה'); document.getElementById('ann-text').value = '';
  });
  document.getElementById('set-reset').addEventListener('click', async () => {
    if(!(await confirmSheet({ title:'לאפס את נתוני הדמו?', text:'כל הסידורים וההעדפות של הדמו יוחלפו בנתוני דוגמה חדשים.', okLabel:'לאפס', danger:true }))) return;
    portalReset(); portalUi.persona = 'c1'; portalUi.pmonth = portalUi.smonth = portalUi.tmonth = null; portalUi.month = null; refreshPortalSlides(); showPortal('schedule'); toast('נתוני הדמו אופסו');
  });
}
