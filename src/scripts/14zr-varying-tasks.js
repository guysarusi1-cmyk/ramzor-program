// ---- "משימות משתנות" (Guy 2026-11-17/18; scheduling-v84.sql). One card on the first screen, only when it holds something for you:
//   * end-of-shift tasks — whoever works today's afternoon shift (instructors, ahmash, service girls) marks "done" until 23:30; from 21:30
//     the night shift sees what is still open and marks until 09:00. One shared list, who and when by every mark, an optional note;
//   * a taxi for the weekend — an instructor whose trip falls between Friday 15:00 and Saturday 20:00 asks until Friday 10:00 (the time
//     from the schedule, the last address). It lands in the on-call panel's own table, so "כוננית סוף שבוע" sees it at once.
// The database decides who sees what and checks every tap again (shift_tasks_now / shift_task_set / taxi_mine / taxi_set).
// The coordinator / the admin: the history (3 months) and the editing of the list, in the coordinator's settings (vtCoordSection).
const VT = { now:null, taxi:null, at:0, loading:null, busy:{} };
const VT_REFRESH_MS = 60000;
const vtOn = () => typeof portalServerOn !== 'undefined' && portalServerOn && typeof sbPersonal !== 'undefined' && !!sbPersonal && !portalUi.viewAs;
const vtLeft = () => { const n = VT.now; if(!n) return 0; const done = new Set((n.marks || []).filter(m => m.done).map(m => m.task)); return (n.tasks || []).filter(t => !done.has(t.id)).length; };
const vtHasTaxi = () => !!(VT.taxi && (VT.taxi.trips || []).length);
const vtHm = iso => { try { return new Date(iso).toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' }); } catch(e){ return ''; } };
// both requests at once (the smooth-UX rule, Guy 2026-11-18); a site without scheduling-v84.sql simply shows no card
async function vtLoad(){
  if(VT.loading) return VT.loading;
  VT.loading = Promise.all([sbPersonal.rpc('shift_tasks_now'), sbPersonal.rpc('taxi_mine')]).then(([a, b]) => {
    VT.now = a.error ? null : (a.data || null); VT.taxi = b.error ? null : (b.data || null); VT.at = Date.now();
  }, () => {}).finally(() => { VT.loading = null; });
  return VT.loading;
}
function vtCardHtml(){
  if(!vtOn()) return '';
  if(!VT.loading && Date.now() - VT.at > VT_REFRESH_MS){
    const had = !!document.getElementById('apphome-vt');
    vtLoad().then(() => { const want = !!(VT.now || vtHasTaxi()); const home = document.getElementById('view-apphome');
      if(home && home.classList.contains('active') && (want !== had || want)) showAppHome(); });
  }
  if(!VT.now && !vtHasTaxi()) return '';
  const left = vtLeft();
  return `<button type="button" class="home-card" id="apphome-vt" style="position:relative">
    <span class="apphome-emoji apphome-ico">${psIco('prefs')}</span>
    <span class="home-card-title">משימות משתנות</span><span class="home-card-sub">צ'ק ליסט, מוניות וכו'</span>
    ${VT.now && left ? `<span class="vt-badge">${left} נשארו</span>` : ''}</button>`;
}
function showVaryingScreen(){
  document.body.classList.remove('leopard-bg');
  portalActivateView('view-vt');
  let look = 'dark'; try { look = (srv.portalTheme && srv.portalTheme !== 'leopard' ? srv.portalTheme : portalLoad().settings.theme) || 'dark'; } catch(e){}
  document.getElementById('view-vt').innerHTML = `<div class="portal-shell" data-ptheme="${pEsc(look)}"><div class="portal-top"><button type="button" class="back-btn portal-back" id="vt-home-back">→ מסך ראשי</button><h1 class="portal-title">משימות משתנות</h1><span class="portal-top-actions"></span></div><div id="vt-screen"></div></div>`;
  document.getElementById('vt-home-back').addEventListener('click', () => showAppHome());
  const box = document.getElementById('vt-screen');
  vtPaint(box);          // (what is in hand at once; fresh data right after)
  vtLoad().then(() => { if(box.isConnected) vtPaint(box); });
}
function vtPaint(box){
  const n = VT.now, tx = VT.taxi;
  if(!n && !vtHasTaxi()){ box.innerHTML = '<div class="pnote">אין כרגע משימות בשבילך.</div>'; return; }
  box.innerHTML = (n ? vtTasksHtml(n) : '') + (vtHasTaxi() ? vtTaxiHtml(tx) : '');
  vtWire(box);
}
// ---- the end-of-shift list
function vtTasksHtml(n){
  const marks = {}; (n.marks || []).forEach(m => { marks[m.task] = m; });
  const night = n.as === 'N', nightFrom = new Date(n.day + 'T21:30:00');
  // the night sees what is still open, and what was marked during the night
  const show = t => !night || !(marks[t.id] && marks[t.id].done) || new Date(marks[t.id].at) >= nightFrom;
  const row = t => { const m = marks[t.id] || {}, on = !!m.done, busy = VT.busy[t.id];
    return `<div class="pedit-row vt-row${on ? ' on' : ''}"><button type="button" class="vt-box${on ? ' on' : ''}" data-vt-done="${t.id}" aria-pressed="${on}" aria-label="${pEsc(t.name)}"${busy ? ' disabled' : ''}>${on ? '✓' : ''}</button>
      <span class="vt-text"><span>${pEsc(t.name)}</span>${on && m.by_name ? `<small class="vt-who">${pEsc(firstNameOf(m.by_name))} · ${vtHm(m.at)}</small>` : ''}${busy ? '<small class="vt-who">שומר...</small>' : ''}
      ${m.note ? `<small class="vt-note">הערה: ${pEsc(m.note)}</small>` : ''}</span>
      <button type="button" class="btn ghost small" data-vt-note="${t.id}">${m.note ? 'שינוי הערה' : '+ הערה'}</button></div>`; };
  const areas = (n.areas || []).map(a => { const list = (n.tasks || []).filter(t => t.area === a.id && show(t)); if(!list.length) return '';
    const done = list.filter(t => marks[t.id] && marks[t.id].done).length;
    return `<h3 class="psec">${pEsc(a.name)} <small>(${done} מתוך ${list.length})</small></h3><div class="pedit-list">${list.map(row).join('')}</div>`; }).join('');
  return `<section class="vt-part"><h2 class="vt-h">משימות סוף משמרת</h2>
    ${night ? '<div class="pnote">מה שנשאר פתוח ממשמרת הצהריים. מסמנים עד 09:00 בבוקר. מה שלא יסומן נשאר "לא בוצע", ולא עובר לבוקר.</div>' : ''}
    ${areas || '<div class="pnote">הכול בוצע. תודה!</div>'}
    <div class="pnote">בהערות: בלי שמות של ילדים.</div></section>`;
}
const firstNameOf = s => String(s || '').trim().split(/\s+/)[0] || '';
// ---- the weekend taxi
function vtTaxiHtml(tx){
  const open = !!tx.open, dl = new Date(tx.deadline);
  const wd = iso => `${DOW_NAMES[dowOf(iso)]} ${parseIso(iso).getDate()}/${parseIso(iso).getMonth() + 1}`;
  const trip = t => { const k = `${t.day}|${t.shift}|${t.dir}`, need = t.need === 'need', none = t.need === 'none';
    const when = t.dir === 'out' && ['N', 'L'].includes(t.shift) ? addDays(t.day, 1) : t.day;          // (the way back of a night: the next morning)
    return `<div class="vt-trip" data-vt-trip="${k}"><h3 class="psec">${t.dir === 'in' ? 'הלוך' : 'חזור'} · ${wd(when)} ${pEsc(t.at_time || t.time || '')} <small>(משמרת ${SRV_SHIFT_WORD[t.shift] || t.shift})</small>${t.ordered ? ' <small class="vt-who">✓ הוזמנה</small>' : ''}</h3>
      <div class="vt-need"><button type="button" class="btn small${need ? '' : ' ghost'}" data-vt-need="need"${open ? '' : ' disabled'}>${need ? '✓ ' : ''}צריך מונית</button><button type="button" class="btn small${none ? '' : ' ghost'}" data-vt-need="none"${open ? '' : ' disabled'}>${none ? '✓ ' : ''}לא צריך</button></div>
      <div class="vt-fields"${need ? '' : ' hidden'}><label>שעה <input type="time" data-vt-f="time" value="${pEsc(t.at_time || t.time || '')}"${open ? '' : ' disabled'}></label> <small>${t.dir === 'in' ? '(תחילת המשמרת, לפי הסידור)' : '(סוף המשמרת)'}</small>
        <label class="vt-wide">${t.dir === 'in' ? 'מאיפה' : 'לאן'} <input type="text" maxlength="120" data-vt-f="place" value="${pEsc(t.place || tx.address || '')}"${open ? '' : ' disabled'}></label>
        <label class="vt-wide">הערה (רשות) <input type="text" maxlength="120" data-vt-f="note" value="${pEsc(t.note || '')}"${open ? '' : ' disabled'}></label>
        ${open ? '<button type="button" class="btn small" data-vt-save>שמירה</button>' : ''}</div></div>`; };
  return `<section class="vt-part"><h2 class="vt-h">מונית ל${tx.kind === 'holiday' ? (tx.title || 'חג') : 'סוף השבוע'}</h2>
    <div class="pnote">${open ? `אפשר לבקש או לבטל עד ${DOW_NAMES[dl.getDay()]} ${vtHm(tx.deadline)}.` : 'הבקשות נסגרו. שינוי מכאן והלאה: דרך הכוננית.'} הכתובת גלויה רק לך ולכוננים.</div>
    ${(tx.trips || []).map(trip).join('')}</section>`;
}
function vtWire(box){
  box.querySelectorAll('[data-vt-done]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.vtDone, n = VT.now; if(!n || VT.busy[id]) return;
    const m = (n.marks || []).find(x => x.task === id), was = m ? { ...m } : null, on = !(m && m.done);
    VT.busy[id] = true;
    if(m){ m.done = on; m.at = new Date().toISOString(); m.by_name = (portalMe() || {}).first || ''; } else n.marks.push({ task:id, done:on, at:new Date().toISOString(), by_name:(portalMe() || {}).first || '' });          // (shown at once)
    vtPaint(box);
    const r = await sbPersonal.rpc('shift_task_set', { p_task:id, p_done:on, p_note:null });
    VT.busy[id] = false;
    if(r.error){ console.error(r.error); if(was) Object.assign(m, was); else n.marks = n.marks.filter(x => x.task !== id); toast('⚠ הסימון לא נשמר. אולי המשמרת כבר נגמרה'); }
    await vtLoad(); if(box.isConnected) vtPaint(box);
  }));
  box.querySelectorAll('[data-vt-note]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.vtNote, m = ((VT.now || {}).marks || []).find(x => x.task === id) || {};
    const s = portalSheet(`<h2>הערה</h2><div class="pnote">בלי שמות של ילדים.</div><input type="text" id="vt-note-in" maxlength="200" value="${pEsc(m.note || '')}" style="width:100%;font-size:16px">
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="vt-note-ok">שמירה</button></div>`);
    const inp = s.querySelector('#vt-note-in'); inp.focus();
    s.querySelector('#vt-note-ok').addEventListener('click', async ev => { ev.target.disabled = true; ev.target.textContent = 'שומר...';
      const r = await sbPersonal.rpc('shift_task_set', { p_task:id, p_done:null, p_note:inp.value });
      if(r.error){ ev.target.disabled = false; ev.target.textContent = 'שמירה'; toast('⚠ ההערה לא נשמרה'); return; }
      s.close(); await vtLoad(); if(box.isConnected) vtPaint(box); });
  }));
  box.querySelectorAll('[data-vt-trip]').forEach(w => {
    const [day, shift, dir] = w.dataset.vtTrip.split('|');
    const send = async (need, btn) => {
      const f = k => (w.querySelector(`[data-vt-f="${k}"]`) || {}).value || '';
      if(btn){ btn.disabled = true; btn.textContent = 'שומר...'; }
      const r = await sbPersonal.rpc('taxi_set', { p_day:day, p_shift:shift, p_dir:dir, p_need:need, p_time:f('time'), p_place:f('place'), p_note:f('note') });
      if(r.error){ console.error(r.error); toast('⚠ לא נשמר. ' + (/closed/.test(r.error.message || '') ? 'הבקשות כבר נסגרו' : 'נסו שוב')); }
      else toast(need === 'need' ? 'הבקשה נשמרה. הכוננים רואים אותה' : 'נשמר: לא צריך מונית');
      await vtLoad(); if(box.isConnected) vtPaint(box);
    };
    w.querySelectorAll('[data-vt-need]').forEach(b => b.addEventListener('click', () => {
      if(b.dataset.vtNeed === 'need'){ w.querySelector('.vt-fields').hidden = false; send('need', b); } else send('none', b);
    }));
    const sv = w.querySelector('[data-vt-save]'); if(sv) sv.addEventListener('click', () => send('need', sv));
  });
}

// ---- the coordinator / the admin: history (3 months) and the list, a part of the coordinator's settings (14k srvRenderCoordSettings)
async function vtCoordSection(){
  const today = isoDate(new Date());
  const [a, t] = await Promise.all([sbPersonal.from('shift_task_area').select('*').order('sort'), sbPersonal.from('shift_task').select('*').order('sort')]);
  if(a.error || t.error) return { html:'<div class="pnote">החלק הזה עוד לא זמין כאן (חסר עדכון במסד: scheduling-v84.sql).</div>', wire:() => {} };
  const areas = a.data || [], tasks = t.data || [];
  let day = today;
  const html = `<div class="seg-wrap"><span class="mx-seg" role="group"><button type="button" data-vt-tab="hist" aria-pressed="true">היסטוריה</button><button type="button" data-vt-tab="edit" aria-pressed="false">עריכת הרשימה</button></span></div>
    <div data-vt-pane="hist"><label>יום <input type="date" id="vt-day" value="${today}" max="${today}" min="${addDays(today, -92)}"></label><div id="vt-hist" class="pnote">טוען...</div></div>
    <div data-vt-pane="edit" hidden>${vtEditHtml(areas, tasks)}</div>`;
  const wire = box => {
    box.querySelectorAll('[data-vt-tab]').forEach(b => b.addEventListener('click', () => { box.querySelectorAll('[data-vt-tab]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      box.querySelectorAll('[data-vt-pane]').forEach(p => { p.hidden = p.dataset.vtPane !== b.dataset.vtTab; }); }));
    const hist = async () => {
      const el = box.querySelector('#vt-hist'); el.textContent = 'טוען...';
      const m = await sbPersonal.from('shift_task_mark').select('task,done,note,by_staff,at').eq('day', day);
      if(m.error){ el.textContent = 'הטעינה נכשלה'; return; }
      const by = {}; (m.data || []).forEach(x => { by[x.task] = x; });
      const nm = id => { const p = (portalLoad().instructors || []).find(x => x.id === id); return p ? instrName(p, portalLoad().instructors) : ''; };
      const live = tasks.filter(x => x.active || by[x.id]), done = live.filter(x => by[x.id] && by[x.id].done).length;
      el.className = ''; el.innerHTML = `<div class="pnote">בוצעו <b>${done}</b> מתוך <b>${live.length}</b>${day === today ? ' (היום, עוד לא נסגר)' : ''}</div>` + areas.map(ar => { const l = live.filter(x => x.area === ar.id); if(!l.length) return '';
        return `<h3 class="psec">${pEsc(ar.name)}</h3>${l.map(x => { const k = by[x.id]; return `<div class="pmine-row"><span>${pEsc(x.name)}${x.active ? '' : ' <small>(הוסרה)</small>'}${k && k.note ? `<br><small class="vt-note">הערה: ${pEsc(k.note)}</small>` : ''}</span><small class="${k && k.done ? 'vt-who' : 'vt-not'}">${k && k.done ? `${pEsc(nm(k.by_staff))} · ${vtHm(k.at)}` : 'לא בוצע'}</small></div>`; }).join('')}`; }).join('');
    };
    const dIn = box.querySelector('#vt-day'); dIn.addEventListener('change', () => { if(dIn.value){ day = dIn.value; hist(); } }); hist();
    vtEditWire(box.querySelector('[data-vt-pane="edit"]'), areas, tasks);
  };
  return { html, wire };
}
function vtEditHtml(areas, tasks){
  return `<div class="pnote">שינוי חל מיד, גם על הרשימה של הערב. משימה שנמחקה יורדת מהרשימה, ומה שכבר סומן בה נשאר בהיסטוריה.</div>
    ${areas.filter(a => a.active).map(a => `<h3 class="psec"><input type="text" value="${pEsc(a.name)}" maxlength="60" data-vt-aname="${a.id}" aria-label="שם האזור"></h3>
      <div class="pedit-list">${tasks.filter(t => t.area === a.id && t.active).map((t, i, l) => `<div class="pedit-row"><input type="text" value="${pEsc(t.name)}" maxlength="120" data-vt-tname="${t.id}" aria-label="שם המשימה" style="flex:1">
        <span class="pedit-btns"><button type="button" class="btn ghost small" data-vt-up="${t.id}"${i ? '' : ' disabled'} aria-label="למעלה">↑</button><button type="button" class="btn ghost small" data-vt-down="${t.id}"${i < l.length - 1 ? '' : ' disabled'} aria-label="למטה">↓</button><button type="button" class="btn ghost small" data-vt-del="${t.id}">מחיקה</button></span></div>`).join('')}
        <div class="pedit-row"><input type="text" maxlength="120" placeholder="משימה חדשה" data-vt-new="${a.id}" style="flex:1"><button type="button" class="btn small" data-vt-add="${a.id}">הוספה</button></div></div>`).join('')}
    <div class="phours-row"><input type="text" maxlength="60" placeholder="אזור חדש" id="vt-new-area"><button type="button" class="btn small" id="vt-add-area">הוספת אזור</button></div>`;
}
function vtEditWire(pane, areas, tasks){
  const redo = async () => { const box = pane.closest('[data-sbody]'); if(box){ box.dataset.filled = ''; const d = box.closest('details'); if(d){ d.open = false; d.open = true; } } };
  const run = async (p, ok) => { const r = await p; if(r.error){ console.error(r.error); toast('⚠ השינוי לא נשמר'); return false; } if(ok) toast(ok); return true; };
  pane.querySelectorAll('[data-vt-aname]').forEach(i => i.addEventListener('change', () => { const v = i.value.trim(); if(v) run(sbPersonal.from('shift_task_area').update({ name:v }).eq('id', i.dataset.vtAname), 'נשמר'); }));
  pane.querySelectorAll('[data-vt-tname]').forEach(i => i.addEventListener('change', () => { const v = i.value.trim(); if(v) run(sbPersonal.from('shift_task').update({ name:v }).eq('id', i.dataset.vtTname), 'נשמר'); }));
  pane.querySelectorAll('[data-vt-del]').forEach(b => b.addEventListener('click', async () => { const t = tasks.find(x => x.id === b.dataset.vtDel);
    if(!(await confirmSheet({ title:`למחוק את "${t.name}"?`, text:'המשימה תרד מהרשימה. מה שכבר סומן בה נשאר בהיסטוריה.', okLabel:'כן, למחוק', cancelLabel:'חזרה', danger:true }))) return;
    b.disabled = true; if(await run(sbPersonal.from('shift_task').update({ active:false }).eq('id', t.id), 'המשימה נמחקה')) redo(); }));
  const move = async (id, d) => { const t = tasks.find(x => x.id === id), l = tasks.filter(x => x.area === t.area && x.active), i = l.indexOf(t), o = l[i + d]; if(!o) return;
    const order = l.slice(); order[i] = o; order[i + d] = t;
    await Promise.all(order.map((x, k) => sbPersonal.from('shift_task').update({ sort:k + 1 }).eq('id', x.id))); redo(); };
  pane.querySelectorAll('[data-vt-up]').forEach(b => b.addEventListener('click', () => { b.disabled = true; move(b.dataset.vtUp, -1); }));
  pane.querySelectorAll('[data-vt-down]').forEach(b => b.addEventListener('click', () => { b.disabled = true; move(b.dataset.vtDown, 1); }));
  pane.querySelectorAll('[data-vt-add]').forEach(b => b.addEventListener('click', async () => { const i = pane.querySelector(`[data-vt-new="${b.dataset.vtAdd}"]`), v = i.value.trim(); if(!v) return;
    b.disabled = true; const max = Math.max(0, ...tasks.filter(x => x.area === b.dataset.vtAdd).map(x => x.sort || 0));
    if(await run(sbPersonal.from('shift_task').insert({ area:b.dataset.vtAdd, name:v, sort:max + 1 }), 'נוספה')) redo(); else b.disabled = false; }));
  const aa = pane.querySelector('#vt-add-area'); if(aa) aa.addEventListener('click', async () => { const v = pane.querySelector('#vt-new-area').value.trim(); if(!v) return;
    aa.disabled = true; if(await run(sbPersonal.from('shift_task_area').insert({ name:v, sort:Math.max(0, ...areas.map(x => x.sort || 0)) + 1 }), 'האזור נוסף')) redo(); else aa.disabled = false; });
}
