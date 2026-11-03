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
const OC_NEED = [['none', 'לא צריך'], ['pending', 'ממתין לבירור'], ['need', 'צריך מונית']];
const oc = { key:null, week:null, monthView:false, data:null, busy:false };

const ocFridayOf = iso => { const d = dowOf(iso); return addDays(iso, d === 5 ? 0 : d === 6 ? -1 : (5 - d)); };          // (this coming Friday; on Friday / Saturday — this one)
const ocWeekendKey = fri => 'w:' + fri;
const ocShort = iso => { const t = parseIso(iso); return t.getDate() + '/' + (t.getMonth() + 1); };
const ocShiftWord = s => (typeof SRV_SHIFT_WORD !== 'undefined' && SRV_SHIFT_WORD[s]) || s;
const ocHours = r => r.from_time && r.to_time ? `${String(r.from_time).slice(0, 5)}–${String(r.to_time).slice(0, 5)}` : OC_STD_HOURS[r.shift] || '';
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
  const [per, staff, may] = await Promise.all([
    sbPersonal.from('oncall_period').select('*').gte('to_day', addDays(today, -7)),
    sbPersonal.from('staff').select('id,display_name,kind,active'),
    sbPersonal.rpc('oncall_may_assign')]);
  if(per.error) return { error:per.error };
  const periods = ocPeriodsOf(per.data, today);
  if(!oc.key || !periods.some(p => p.key === oc.key)) oc.key = periods[0].key;
  const p = periods.find(x => x.key === oc.key);
  const mFrom = monthKeyOf(p.from_day) + '-01', mTo = addDays(addMonths(monthKeyOf(p.to_day), 1) + '-01', -1);
  const [asg, trips, ev] = await Promise.all([
    sbPersonal.from('assignment').select('id,staff_id,day,shift,from_time,to_time').gte('day', addDays(mFrom, -1)).lte('day', addDays(mTo, 1)),
    sbPersonal.from('oncall_trip').select('*').eq('period_key', oc.key),
    sbPersonal.from('oncall_event').select('*').eq('period_key', oc.key).order('at', { ascending:false }).limit(40)]);
  const names = {}; (staff.data || []).forEach(s => { names[s.id] = s; });
  return { periods, period:p, names, rows:asg.data || [], trips:trips.data || [], events:ev.data || [], may:!may.error && may.data === true, from, to };
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
  const p = d.period, me = srv.me, nm = id => (d.names[id] || {}).display_name || '?';
  const listDays = p.kind === 'weekend' ? [p.from_day, addDays(p.from_day, 1)] : (() => { const a = []; for(let x = p.from_day; x <= p.to_day; x = addDays(x, 1)) a.push(x); return a; })();
  const list = d.rows.filter(r => listDays.includes(r.day)).sort((a, b) => (a.day + OC_SHIFT_ORDER[a.shift]).localeCompare(b.day + OC_SHIFT_ORDER[b.shift]) || nm(a.staff_id).localeCompare(nm(b.staff_id), 'he'));
  const tripOf = (r, dir) => d.trips.find(t => t.staff_id === r.staff_id && t.day === r.day && t.shift === r.shift && t.dir === dir) || { need:'pending', at_time:'', place:'', ordered:false };
  const mine = d.events.filter(e => !e.seen && (e.for_staff === me || (!e.for_staff && p.active_staff === me)));
  const dirHtml = (r, dir) => { const t = tripOf(r, dir), k = `${r.staff_id}|${r.day}|${r.shift}|${dir}`;
    return `<div class="oc-dir" data-oc-trip="${k}"><span class="oc-dir-lbl">${dir === 'in' ? 'הגעה' : 'חזרה'}</span>
      <div class="mx-seg oc-need" role="group" aria-label="${dir === 'in' ? 'הגעה' : 'חזרה'}: מונית">${OC_NEED.map(([v, w]) => `<button type="button" data-oc-need="${v}" aria-pressed="${t.need === v}">${w}</button>`).join('')}</div>
      <label class="oc-field"><span>שעה</span><input type="text" inputmode="numeric" maxlength="20" data-oc-time value="${pEsc(t.at_time || '')}" placeholder="למשל 06:30"></label>
      <label class="oc-field"><span>מיקום</span><input type="text" maxlength="120" data-oc-place value="${pEsc(t.place || '')}"></label>
      <label class="oc-ordered"><input type="checkbox" data-oc-ordered${t.ordered ? ' checked' : ''}> המונית הוזמנה</label></div>`; };
  // the schedule: the month, a week at first (the weekend's week)
  const mk = monthKeyOf(p.from_day), days = daysOfMonth(mk), wk = oc.monthView ? null : (Number.isInteger(oc.week) && oc.weekMk === mk ? oc.week : mcalWeekOfDay(mk, p.from_day));
  const lead = dowOf(days[0]), shown = wk === null ? days : days.filter((_, i) => Math.floor((lead + i) / 7) === wk);
  const sched = shown.map(day => {
    const byShift = ['M', 'S', 'A', 'L', 'N'].map(s => [s, d.rows.filter(r => r.day === day && r.shift === s)]).filter(([s, rs]) => rs.length || ['M', 'A', 'N'].includes(s));
    return `<div class="mcal-wrow${[5, 6].includes(dowOf(day)) ? ' weekend' : ''}${day === isoDate(new Date()) ? ' today' : ''}"><div class="mcal-wrow-day"><b>${DOW_SHORT[dowOf(day)]}</b><span>${ocShort(day)}</span></div><div class="mcal-wrow-cells">${byShift.map(([s, rs]) => {
      const can = d.may && ocInWindow(day, s);
      return `<div class="mcal-wrow-shift"><span class="mcal-wrow-lbl">${ocShiftWord(s)}</span><div class="mcal-cell oc-cell">${rs.map(r => `<span class="mcal-name">${pEsc(nm(r.staff_id))}${can ? ` <button type="button" class="oc-x" data-oc-un="${r.id}" aria-label="הסרת ${pEsc(nm(r.staff_id))} מ${ocShiftWord(s)} ${ocShort(day)}">×</button>` : ''}</span>`).join('')}${can ? `<button type="button" class="oc-add" data-oc-add="${day}|${s}" aria-label="הוספת מדריך ל${ocShiftWord(s)} ${ocShort(day)}">+</button>` : ''}</div></div>`; }).join('')}</div></div>`; }).join('');
  box.innerHTML = `<div class="oc">
    <div class="oc-periods" role="group" aria-label="תקופת הכוננות">${d.periods.map(x => `<button type="button" class="oc-period${x.key === p.key ? ' on' : ''}" data-oc-period="${pEsc(x.key)}" aria-pressed="${x.key === p.key}">${pEsc(x.label)}</button>`).join('')}${srv.profile && srv.profile.admin ? '<button type="button" class="oc-period oc-add-holiday" data-oc-holiday>+ כוננות חג</button>' : ''}</div>
    ${p.active_staff ? `<div class="oc-active"><span>הכוננית הפעילה: <b>${pEsc(nm(p.active_staff))}</b>${p.active_staff === me ? ' (את/ה)' : ''}</span>${p.active_staff === me ? '' : '<button type="button" class="btn ghost small" data-oc-take>אני הכוננית הפעילה</button>'}</div>`
      : `<div class="oc-active oc-none"><b>לא נבחרה כוננית פעילה</b><button type="button" class="btn small" data-oc-take>אני הכוננית הפעילה</button></div>`}
    ${mine.length ? `<div class="oc-events"><b>שינויים שעשו אחרים</b>${mine.map(e => `<div class="oc-event"><span>${pEsc(e.text)}</span><small>${pEsc(nm(e.by_staff))} · ${new Date(e.at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}</small></div>`).join('')}<button type="button" class="btn ghost small" data-oc-seen>ראיתי</button></div>` : ''}
    ${!p.active_staff && d.events.some(e => !e.for_staff && !e.seen) ? `<div class="pnote">${d.events.filter(e => !e.for_staff && !e.seen).length} שינויים נשמרו לבדיקה של מי שתיקח את הכוננות.</div>` : ''}
    <details class="pfold" data-fold="oc-list" open><summary><span>עובדי ${p.kind === 'weekend' ? 'סוף השבוע' : 'החג'} ומוניות</span><span class="pcount">${list.length}</span></summary><div class="pfold-body">
      <div class="pnote">לכל משמרת הגעה וחזרה. מוודאים שעה ומיקום עם כל מדריך בכל סוף שבוע מחדש.</div>
      ${list.length ? list.map(r => `<div class="oc-person"><div class="oc-who"><b>${pEsc(nm(r.staff_id))}</b><small>${pEsc(DOW_NAMES[dowOf(r.day)])} ${ocShort(r.day)} · ${ocShiftWord(r.shift)} <bdi dir="ltr">${ocHours(r)}</bdi></small></div>${dirHtml(r, 'in')}${dirHtml(r, 'out')}</div>`).join('') : '<div class="pnote">אין עדיין שיבוצים בסידור לתקופה הזו.</div>'}
    </div></details>
    <details class="pfold" data-fold="oc-sched"${portalUi.fold['oc-sched'] ? ' open' : ''}><summary><span>סידור העבודה</span></summary><div class="pfold-body">
      ${mcalViewBarHtml(mk, wk, 'oc-viewbar')}
      ${d.may ? '<div class="pnote">אפשר להוסיף או להסיר מדריך במשמרות שבין חמישי 22:00 לראשון 11:00.</div>' : ''}
      <div class="mcal mcal-wrows">${sched}</div>
    </div></details>
  </div>`;
  ocWire(box, d);
}

function ocWire(box, d){
  const p = d.period, nm = id => (d.names[id] || {}).display_name || '?', again = () => renderOncall(box);
  box.querySelectorAll('details[data-fold]').forEach(x => x.addEventListener('toggle', () => { portalUi.fold[x.dataset.fold] = x.open; }));
  box.querySelectorAll('[data-oc-period]').forEach(b => b.addEventListener('click', () => { oc.key = b.dataset.ocPeriod; oc.week = null; again(); }));
  mcalViewBarWire(box, 'oc-viewbar', monthKeyOf(p.from_day), () => (oc.monthView ? null : (Number.isInteger(oc.week) ? oc.week : mcalWeekOfDay(monthKeyOf(p.from_day), p.from_day))),
    (mm, w) => { oc.monthView = w === null; oc.week = w; oc.weekMk = mm; portalUi.fold['oc-sched'] = true; }, again);
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
    if(r.error){ toast('לא נשמר. אפשר לנסות שוב.'); return; }
    Object.assign(cur, row); if(!d.trips.includes(cur)) d.trips.push(cur);
    await ocTell(p, `${nm(staff_id)} · ${ocShort(day)} ${ocShiftWord(shift)} · ${dir === 'in' ? 'הגעה' : 'חזרה'}: ${words}`);
  };
  box.querySelectorAll('[data-oc-trip]').forEach(w => {
    w.querySelectorAll('[data-oc-need]').forEach(b => b.addEventListener('click', async () => {
      w.querySelectorAll('[data-oc-need]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      await saveTrip(w, { need:b.dataset.ocNeed }, (OC_NEED.find(n => n[0] === b.dataset.ocNeed) || [])[1] || '');
    }));
    const t = w.querySelector('[data-oc-time]'), pl = w.querySelector('[data-oc-place]'), o = w.querySelector('[data-oc-ordered]');
    t.addEventListener('change', () => saveTrip(w, { at_time:t.value.trim() || null }, `שעה ${t.value.trim() || '—'}`));
    pl.addEventListener('change', () => saveTrip(w, { place:pl.value.trim() || null }, `מיקום ${pl.value.trim() || '—'}`));
    o.addEventListener('change', () => saveTrip(w, { ordered:o.checked }, o.checked ? 'המונית הוזמנה' : 'סימון "הוזמנה" הוסר'));
  });
  // the schedule: add / remove in the weekend window (who may: checked again in the database)
  box.querySelectorAll('[data-oc-un]').forEach(b => b.addEventListener('click', async () => {
    const r = d.rows.find(x => x.id === b.dataset.ocUn); if(!r) return;
    if(!(await confirmSheet({ title:`להסיר את ${nm(r.staff_id)}?`, text:`${DOW_NAMES[dowOf(r.day)]} ${ocShort(r.day)}, ${ocShiftWord(r.shift)}.`, okLabel:'כן, להסיר', cancelLabel:'חזרה' }))) return;
    const x = await sbPersonal.rpc('oncall_unassign', { p_id:r.id });
    toast(x.error ? 'לא הוסר: אין הרשאה או שהמשמרת מחוץ לחלון' : 'הוסר/ה'); again();
  }));
  box.querySelectorAll('[data-oc-add]').forEach(b => b.addEventListener('click', () => {
    const [day, shift] = b.dataset.ocAdd.split('|'), taken = new Set(d.rows.filter(r => r.day === day && r.shift === shift).map(r => r.staff_id));
    const people = Object.values(d.names).filter(s => s.active && s.kind === 'instructor' && !taken.has(s.id)).sort((a, c) => a.display_name.localeCompare(c.display_name, 'he'));
    const sh = portalSheet(`<h2>הוספה ל${ocShiftWord(shift)} ${ocShort(day)}</h2><div class="pchoice wrap oc-pick">${people.map(s => `<button type="button" data-oc-who="${s.id}">${pEsc(s.display_name)}</button>`).join('')}</div><div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button></div>`);
    sh.querySelectorAll('[data-oc-who]').forEach(x => x.addEventListener('click', async () => {
      const r = await sbPersonal.rpc('oncall_assign', { p_day:day, p_shift:shift, p_staff:x.dataset.ocWho });
      sh.close(); toast(r.error ? 'לא נוסף: ' + (/published/.test(r.error.message) ? 'החודש עוד לא פורסם' : /already/.test(r.error.message) ? 'כבר משובץ/ת' : 'אין הרשאה או מחוץ לחלון') : 'נוסף/ה לסידור'); again();
    }));
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
