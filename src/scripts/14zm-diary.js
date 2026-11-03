// ---- "יומן הילדים" (Guy 2026-11-03; the spec: Mercury-Work-Manager plans/SOCIAL-WORKERS-URGENT-SPEC.md; scheduling-v51.sql)
// The social worker's technical diary of the children in her care: calls, meetings and outings — no therapeutic text.
// Two views of the same events: a list (today's first, standing out) and a weekly board. Times are optional; an outing has an
// expected return. Repeating every N weeks on a weekday, or monthly on a relative weekday; a change asks "רק הפעם" or "מהיום והלאה".
const DG_KIND = { call:['שיחה', '📞'], meeting:['פגישה', '🤝'], outing:['יציאה', '🏠'] };
const DG_NTH = { 1:'הראשון', 2:'השני', 3:'השלישי', 4:'הרביעי', '-1':'האחרון' };
const dg = { view:'list', week:null, data:null };
const dgT = t => t ? String(t).slice(0, 5) : '';
const dgShort = iso => { const t = parseIso(iso); return t.getDate() + '/' + (t.getMonth() + 1); };
const dgNthOf = iso => { const d = parseIso(iso).getDate(); return Math.ceil(d / 7); };
const dgIsLast = iso => monthKeyOf(addDays(iso, 7)) !== monthKeyOf(iso);
function dgNthWeekday(mk, dow, nth){          // the Nth (−1 = last) given weekday of a month
  const days = daysOfMonth(mk).filter(x => dowOf(x) === dow);
  return nth === -1 ? days[days.length - 1] : days[nth - 1] || null;
}
// every occurrence of every event between two days (a series expanded; the skipped ones left out; a changed copy stands alone)
function dgOccurrences(events, skips, from, to){
  const skipped = new Set(skips.map(s => s.event_id + '|' + s.day)), out = [];
  events.forEach(e => {
    const until = e.until_day && e.until_day < to ? e.until_day : to;
    const add = d => { if(d >= from && d <= until && d >= e.day && !skipped.has(e.id + '|' + d)) out.push({ e, day:d }); };
    if(e.every_weeks){ for(let d = e.day; d <= until; d = addDays(d, 7 * e.every_weeks)) add(d); }
    else if(e.monthly_nth){ for(let mk = monthKeyOf(e.day > from ? e.day : from); mk <= monthKeyOf(until); mk = addMonths(mk, 1)){ const d = dgNthWeekday(mk, dowOf(e.day), e.monthly_nth); if(d) add(d); } }
    else if(e.day >= from && e.day <= to && !skipped.has(e.id + '|' + e.day)) out.push({ e, day:e.day });
  });
  return out.sort((a, b) => (a.day + (dgT(a.e.start_time) || '00:00')).localeCompare(b.day + (dgT(b.e.start_time) || '00:00')));
}
const dgKids = () => (typeof thpScope === 'function' ? thpScope() : []);
const dgName = id => { const c = (typeof roster !== 'undefined' ? roster : []).find(x => x.id === id); return c ? displayName(c) : '?'; };
function dgLineHtml(o){
  const e = o.e, k = DG_KIND[e.kind] || ['', ''], time = e.start_time ? `${dgT(e.start_time)}${e.end_time ? '–' + dgT(e.end_time) : ''}` : 'בלי שעה';
  const rep = e.every_weeks ? (e.every_weeks === 1 ? 'כל שבוע' : `כל ${e.every_weeks} שבועות`) : e.monthly_nth ? `כל חודש, ${DG_NTH[e.monthly_nth]}` : '';
  return `<button type="button" class="dg-ev dg-${e.kind}" data-dg-ev="${e.id}|${o.day}"><span class="dg-time"><bdi dir="ltr">${time}</bdi></span><span class="dg-what"><b class="ar-keep">${pEsc(dgName(e.child_id))}</b> · ${k[1]} ${k[0]}${e.with_whom ? ` עם ${pEsc(e.with_whom)}` : ''}${e.place ? ` · ${pEsc(e.place)}` : ''}${e.kind === 'outing' && e.return_day ? ` · חזרה ${dgShort(e.return_day)}${e.return_time ? ' ' + dgT(e.return_time) : ''}` : ''}${e.note ? `<small>${pEsc(e.note)}</small>` : ''}${rep ? `<small class="dg-rep">↻ ${rep}</small>` : ''}</span></button>`;
}
async function renderDiary(box){
  if(!box || !box.isConnected) return;
  if(!box.querySelector('.dg')) box.innerHTML = '<div class="pnote">רק רגע...</div>';
  const [ev, sk] = await Promise.all([sbPersonal.from('child_diary').select('*'), sbPersonal.from('child_diary_skip').select('*')]);
  if(!box.isConnected) return;
  if(ev.error){ box.innerHTML = '<div class="pstatus bad">היומן עוד לא זמין כאן (חסר עדכון במסד: scheduling-v51.sql).</div>'; return; }
  dg.data = { events:ev.data || [], skips:sk.data || [] };
  const today = isoDate(new Date());
  let body = '';
  if(dg.view === 'list'){
    const occ = dgOccurrences(dg.data.events, dg.data.skips, today, addDays(today, 45)), todays = occ.filter(o => o.day === today), later = occ.filter(o => o.day > today);
    const byDay = {}; later.forEach(o => { (byDay[o.day] = byDay[o.day] || []).push(o); });
    body = `<section class="dg-today"><h3 class="psec">היום</h3>${todays.length ? todays.map(dgLineHtml).join('') : '<div class="pnote">אין אירועים היום.</div>'}</section>
      <section><h3 class="psec">בהמשך</h3>${Object.keys(byDay).length ? Object.keys(byDay).map(d => `<div class="dg-day"><div class="dg-day-h">${pEsc(DOW_NAMES[dowOf(d)])} ${dgShort(d)}</div>${byDay[d].map(dgLineHtml).join('')}</div>`).join('') : '<div class="pnote">אין עוד אירועים בשבועות הקרובים.</div>'}</section>`;
  } else {
    const start = dg.week || addDays(today, -dowOf(today)), days = Array.from({ length:7 }, (_, i) => addDays(start, i)), occ = dgOccurrences(dg.data.events, dg.data.skips, start, days[6]);
    body = `<div class="mcal-weeknav dg-weeknav"><button type="button" class="mcal-wk" data-dg-wk="-7" aria-label="השבוע הקודם"><bdi dir="ltr">›</bdi></button><b>שבוע ${dgShort(days[0])}–${dgShort(days[6])}</b><button type="button" class="mcal-wk" data-dg-wk="7" aria-label="השבוע הבא"><bdi dir="ltr">‹</bdi></button></div>
      <div class="dg-week">${days.map(d => { const list = occ.filter(o => o.day === d); return `<div class="dg-wday${d === today ? ' today' : ''}"><div class="dg-day-h">${pEsc(DOW_NAMES[dowOf(d)])} ${dgShort(d)}</div>${list.length ? list.map(dgLineHtml).join('') : '<div class="dg-empty">—</div>'}</div>`; }).join('')}</div>`;
  }
  box.innerHTML = `<div class="dg"><div class="dg-top"><div class="mx-seg mcal-seg" role="group" aria-label="תצוגה"><button type="button" data-dg-view="list" aria-pressed="${dg.view === 'list'}">רשימה</button><button type="button" data-dg-view="week" aria-pressed="${dg.view === 'week'}">שבוע</button></div>
    ${dgKids().length ? '<button type="button" class="btn small" data-dg-new>+ אירוע</button>' : ''}</div>
    ${dgKids().length ? '' : '<div class="pnote">עוד לא שויכו אלייך ילדים. השיוך נעשה אצל הרכזת או מנהל המערכת.</div>'}${body}</div>`;
  const again = () => renderDiary(box);
  box.querySelectorAll('[data-dg-view]').forEach(b => b.addEventListener('click', () => { dg.view = b.dataset.dgView; again(); }));
  box.querySelectorAll('[data-dg-wk]').forEach(b => b.addEventListener('click', () => { const t = isoDate(new Date()); dg.week = addDays(dg.week || addDays(t, -dowOf(t)), +b.dataset.dgWk); again(); }));
  { const n = box.querySelector('[data-dg-new]'); if(n) n.addEventListener('click', () => dgEdit(null, null, again)); }
  box.querySelectorAll('[data-dg-ev]').forEach(b => b.addEventListener('click', () => { const [id, day] = b.dataset.dgEv.split('|'); dgEdit(dg.data.events.find(e => e.id === id), day, again); }));
}
// one event: add, change (of a series: "רק הפעם" / "מהיום והלאה") or remove
function dgEdit(e, occDay, done){
  const kids = dgKids(), v = Object.assign({ kind:'call', day:occDay || isoDate(new Date()), child_id:(kids[0] || {}).id }, e || {}, occDay ? { day:occDay } : {});
  const series = !!(e && (e.every_weeks || e.monthly_nth));
  const rep = v.every_weeks ? 'w' + v.every_weeks : v.monthly_nth ? 'm' : '';
  const sh = portalSheet(`<h2>${e ? 'אירוע ביומן' : 'אירוע חדש ביומן'}</h2>
    <label class="pfield">ילד/ה<select id="dg-child">${kids.map(c => `<option value="${pEsc(c.id)}"${c.id === v.child_id ? ' selected' : ''}>${pEsc(displayName(c))}</option>`).join('')}</select></label>
    <div class="mx-seg dg-kind" role="group" aria-label="סוג">${Object.entries(DG_KIND).map(([k, w]) => `<button type="button" data-dg-kind="${k}" aria-pressed="${v.kind === k}">${w[1]} ${w[0]}</button>`).join('')}</div>
    <label class="pfield">תאריך<input type="date" id="dg-day" value="${v.day}"></label>
    <div class="dg-times"><label class="pfield">משעה (לא חובה)<input type="time" id="dg-from" value="${dgT(v.start_time)}"></label><label class="pfield">עד שעה<input type="time" id="dg-to" value="${dgT(v.end_time)}"></label></div>
    <label class="pfield">עם מי<input type="text" id="dg-with" maxlength="120" value="${pEsc(v.with_whom || '')}"></label>
    <label class="pfield">איפה<input type="text" id="dg-place" maxlength="120" value="${pEsc(v.place || '')}"></label>
    <div class="dg-return"${v.kind === 'outing' ? '' : ' hidden'}><label class="pfield">חזרה צפויה: תאריך<input type="date" id="dg-rday" value="${v.return_day || ''}"></label><label class="pfield">שעה<input type="time" id="dg-rtime" value="${dgT(v.return_time)}"></label></div>
    <label class="pfield">הערה טכנית (לא חובה)<input type="text" id="dg-note" maxlength="300" value="${pEsc(v.note || '')}"></label>
    <label class="pfield">חוזר<select id="dg-rep"><option value="">לא חוזר</option>${[1, 2, 3, 4].map(n => `<option value="w${n}"${rep === 'w' + n ? ' selected' : ''}>${n === 1 ? 'כל שבוע' : `כל ${n} שבועות`}, באותו יום</option>`).join('')}<option value="m"${rep === 'm' ? ' selected' : ''} id="dg-rep-m">כל חודש</option></select></label>
    <div class="confirm-actions">${e ? '<button type="button" class="btn danger" id="dg-del">מחיקה</button>' : ''}<button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="dg-save">שמירה</button></div>`);
  const $ = id => sh.querySelector('#' + id);
  let kind = v.kind;
  const monthWord = () => { const d = $('dg-day').value || v.day; $('dg-rep-m').textContent = `כל חודש, ${DOW_NAMES[dowOf(d)]} ${dgNthOf(d) >= 5 ? DG_NTH[-1] : DG_NTH[dgNthOf(d)]} בחודש`; };
  monthWord(); $('dg-day').addEventListener('change', monthWord);
  sh.querySelectorAll('[data-dg-kind]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.dgKind; sh.querySelectorAll('[data-dg-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); sh.querySelector('.dg-return').hidden = kind !== 'outing'; }));
  const fields = () => {
    const d = $('dg-day').value, r = $('dg-rep').value;
    return { child_id:$('dg-child').value, kind, day:d, start_time:$('dg-from').value || null, end_time:$('dg-to').value || null, with_whom:$('dg-with').value.trim() || null, place:$('dg-place').value.trim() || null,
      note:$('dg-note').value.trim() || null, return_day:kind === 'outing' ? $('dg-rday').value || null : null, return_time:kind === 'outing' ? $('dg-rtime').value || null : null,
      every_weeks:r[0] === 'w' ? +r.slice(1) : null, monthly_nth:r === 'm' ? (dgNthOf(d) >= 5 ? -1 : dgNthOf(d)) : null, updated_by:srv.me, updated_at:new Date().toISOString() };
  };
  const scope = async verb => !series ? 'all' : await new Promise(res => {          // a series: only this time, or from this day on
    const q = portalSheet(`<h2>${verb}</h2><div class="pnote">זה אירוע חוזר. מה ${verb === 'מחיקה' ? 'למחוק' : 'לשנות'}?</div><div class="confirm-actions dg-scope"><button type="button" class="btn ghost" data-sc="one">רק הפעם (${dgShort(occDay)})</button><button type="button" class="btn" data-sc="on">מהיום והלאה</button></div>`);
    q.querySelectorAll('[data-sc]').forEach(b => b.addEventListener('click', () => { q.close(); res(b.dataset.sc); }));
    q.addEventListener('click', e => { if(e.target === q) res(null); });          // (a tap outside: nothing changes)
  });
  const fail = r => { if(r && r.error){ toast('לא נשמר. אפשר לנסות שוב.'); return true; } return false; };
  $('dg-save').addEventListener('click', async () => {
    const f = fields(); if(!f.child_id || !f.day){ toast('בחרו ילד ותאריך'); return; }
    if(f.end_time && f.start_time && f.end_time < f.start_time){ toast('שעת הסיום לפני שעת ההתחלה'); return; }
    if(!e){ if(fail(await sbPersonal.from('child_diary').insert(Object.assign(f, { series_id:f.every_weeks || f.monthly_nth ? (crypto.randomUUID ? crypto.randomUUID() : null) : null, created_by:srv.me })))) return; }
    else {
      const sc = await scope('שינוי'); if(!sc) return;
      if(sc === 'all' || (sc === 'on' && occDay === e.day)){ if(fail(await sbPersonal.from('child_diary').update(f).eq('id', e.id))) return; }
      else if(sc === 'one'){
        if(fail(await sbPersonal.from('child_diary_skip').insert({ event_id:e.id, day:occDay }))) return;
        if(fail(await sbPersonal.from('child_diary').insert(Object.assign(f, { every_weeks:null, monthly_nth:null, series_id:e.series_id || e.id, orig_day:occDay, created_by:srv.me })))) return;
      } else {
        if(fail(await sbPersonal.from('child_diary').update({ until_day:addDays(occDay, -1), updated_by:srv.me, updated_at:new Date().toISOString() }).eq('id', e.id))) return;
        if(fail(await sbPersonal.from('child_diary').insert(Object.assign(f, { series_id:e.series_id || e.id, created_by:srv.me })))) return;
      }
    }
    sh.close(); toast('נשמר'); done();
  });
  const del = $('dg-del');
  if(del) del.addEventListener('click', async () => {
    const sc = await scope('מחיקה'); if(!sc) return;
    if(!series && !(await confirmSheet({ title:'למחוק את האירוע?', text:'', okLabel:'כן, למחוק', cancelLabel:'חזרה', danger:true }))) return;
    if(sc === 'all' || (sc === 'on' && occDay === e.day)){ if(fail(await sbPersonal.from('child_diary').delete().eq('id', e.id))) return; }
    else if(sc === 'one'){ if(fail(await sbPersonal.from('child_diary_skip').insert({ event_id:e.id, day:occDay }))) return; }
    else if(fail(await sbPersonal.from('child_diary').update({ until_day:addDays(occDay, -1), updated_by:srv.me, updated_at:new Date().toISOString() }).eq('id', e.id))) return;
    sh.close(); toast('נמחק'); done();
  });
}
