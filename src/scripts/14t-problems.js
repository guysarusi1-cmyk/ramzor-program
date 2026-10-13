
// ---------- PROBLEMS IN THE FIELD (the pilot) ----------
// A "report a problem" button (the person writes what happened; the screen and the device go with it), and the script errors that happen
// on people's devices, written down by themselves. Only the admin sees them (management portal, "ניהול"). (scheduling-v23.sql)
const PROB = { sent:0, seen:new Set(), recent:[] };
function probWhere(){
  const v = ((document.querySelector('.view.active') || {}).id || '').replace(/^view-/, '');
  return [v, v === 'portal' && typeof portalUi !== 'undefined' ? (portalUi.tab || '') : ''].filter(Boolean).join(' / ');
}
const probDevice = () => `${innerWidth}x${innerHeight} · ${navigator.userAgent.slice(0, 160)}`;
// the connection that is signed in: the personal one, or the staff login of this device
function probClient(){
  try { if(typeof portalServerOn !== 'undefined' && portalServerOn) return sbPersonal; } catch(e){}
  try { return sb; } catch(e){ return null; }
}
const probSilent = () => !window.__probForce && (!!window.__portalNoHome || /[?&]demo=/.test(location.search));          // (the automatic checks and the demos do not write problems)

// an error on this device: written once per kind, at most 8 per visit (a loop must not flood the list)
function probRecord(message, stack){
  const msg = String(message || '').slice(0, 300);
  if(!msg || probSilent() || /ResizeObserver loop|^Script error\.?$/i.test(msg)) return;
  PROB.recent.push({ at:new Date().toISOString(), msg, where:probWhere() }); PROB.recent = PROB.recent.slice(-5);
  if(PROB.seen.has(msg) || PROB.sent >= 8) return;
  PROB.seen.add(msg); PROB.sent++;
  const c = probClient(); if(!c) return;
  try { Promise.resolve(c.from('client_errors').insert({ kind:'error', message:msg, detail:{ stack:String(stack || '').slice(0, 1500), where:probWhere(), device:probDevice(), env:APP_ENV, page:location.pathname + location.hash } })).catch(() => {}); } catch(e){}
}
window.addEventListener('error', e => probRecord(e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', e => { const r = e.reason; probRecord((r && (r.message || r.error_description)) || String(r), r && r.stack); });

// the button: what happened, in the person's words
function openProblemReport(){
  const sh = portalSheet(`<h2>דיווח על תקלה</h2>
    <div class="pnote">מה קרה, ומה ניסית לעשות? המסך והמכשיר נשלחים לבד, אין צורך לפרט אותם.</div>
    <label class="pfield">מה קרה<textarea id="prob-text" rows="4" maxlength="1500"></textarea></label>
    <div class="confirm-actions"><button type="button" class="btn" id="prob-send">שליחה</button><button type="button" class="btn ghost" data-close>ביטול</button></div>`);
  sh.querySelector('#prob-text').focus();
  sh.querySelector('#prob-send').addEventListener('click', async () => {
    const text = sh.querySelector('#prob-text').value.trim(); if(!text){ toast('כתבו בקצרה מה קרה'); return; }
    const b = sh.querySelector('#prob-send'); b.disabled = true;
    let ok = false;
    try { const c = probClient(); if(c){ const r = await c.from('client_errors').insert({ kind:'report', message:text, detail:{ where:probWhere(), device:probDevice(), env:APP_ENV, page:location.pathname + location.hash, recent:PROB.recent } }); ok = !r.error; } } catch(e){}
    if(ok){ sh.close(); toast('תודה! הדיווח נשלח למנהל המערכת, ונחזור אלייך.', 5000); }
    else { b.disabled = false; toast('הדיווח לא נשלח. אפשר לנסות שוב, או לכתוב למנהל המערכת בוואטסאפ.', 6000); }
  });
}

// ---- for the admin: the reports and the errors (management portal, "ניהול")
async function adminProblems(box){
  const r = await sbPersonal.from('client_errors').select('id,at,staff_id,kind,message,detail,handled').not('message', 'like', 'בדיקה אוטומטית%').order('at', { ascending:false }).limit(300);
  if(r.error){ box.innerHTML = '<div class="pnote">נדרש scheduling-v23.sql</div>'; return; }
  const rows = r.data || [], when = x => new Date(x.at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' }), who = x => x.staff_id ? nameOf(x.staff_id) : 'מכשיר משותף';
  const reports = rows.filter(x => x.kind === 'report'), open = reports.filter(x => !x.handled);
  // the automatic errors in groups of the same message: how many times, how many people, when last
  const groups = {}; rows.filter(x => x.kind === 'error' && !x.handled).forEach(x => { const g = groups[x.message] = groups[x.message] || { message:x.message, ids:[], people:new Set(), last:x, where:new Set() }; g.ids.push(x.id); g.people.add(x.staff_id || '-'); if((x.detail || {}).where) g.where.add(x.detail.where); });
  const glist = Object.values(groups).sort((a, b) => String(b.last.at).localeCompare(String(a.last.at)));
  const rep = x => `<div class="pmine-row${x.handled ? ' done' : ''}"><span><small>${when(x)} · ${pEsc(who(x))} · ${pEsc((x.detail || {}).where || '')}</small><br>${pEsc(x.message)}<br><small>${pEsc(((x.detail || {}).device || '').slice(0, 90))}</small></span>${x.handled ? '<em class="pst pst-approved">טופל</em>' : `<button type="button" class="btn ghost small" data-prob-done="${x.id}">טופל</button>`}</div>`;
  box.innerHTML = `<div class="pnote">דיווחים שאנשים שלחו מהכפתור "דיווח על תקלה", ושגיאות שקרו אצלם במכשיר ונרשמו לבד. כל דיווח חדש מגיע אליך גם במייל.</div>
    <h3 class="psec">דיווחים (${open.length} פתוחים)</h3>${reports.slice(0, 60).map(rep).join('') || '<div class="pnote">אין דיווחים.</div>'}
    <h3 class="psec">שגיאות שנרשמו לבד (${glist.length} סוגים)</h3>${glist.map(g => `<div class="pmine-row"><span><small>אחרונה ${when(g.last)} · ${g.ids.length} פעמים · ${g.people.size} אנשים · ${pEsc([...g.where].slice(0, 3).join(', '))}</small><br><span dir="ltr">${pEsc(g.message)}</span></span><button type="button" class="btn ghost small" data-prob-done="${g.ids.join(',')}">טופל</button></div>`).join('') || '<div class="pnote">אין שגיאות פתוחות.</div>'}`;
  box.querySelectorAll('[data-prob-done]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true; const ids = b.dataset.probDone.split(',').map(Number);
    const u = await sbPersonal.from('client_errors').update({ handled:true }).in('id', ids);
    if(u.error){ b.disabled = false; toast('לא נשמר'); return; } adminProblems(box);
  }));
}
{ const hp = document.getElementById('hub-problem'); if(hp) hp.addEventListener('click', openProblemReport); }          // (the same button on the Ramzor's home screen)
