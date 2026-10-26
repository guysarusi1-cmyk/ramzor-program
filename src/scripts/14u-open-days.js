
// ---------- A NEW DAY FOR SIGN-UP (scheduling-v25.sql) ----------
// In a month that is already published, the coordinator opens a day (the whole day = morning and afternoon, one shift, the night, or other hours),
// with a minimum and a maximum of instructors in the shift altogether (those already placed count: scheduling-v38.sql) and for whom (everybody, only ahmash, ahmash and leaders). The instructors it is for place themselves
// (no approval): the shifts are added at once, the places left go down, and at the maximum the offer disappears and the coordinator is told.
// Taking oneself off goes through the coordinator (she removes the person in the shift editor, and the place opens again).
const OD_SCOPE = { day:'כל היום (בוקר וצהריים)', morning:'בוקר', afternoon:'צהריים', night:'לילה', hours:'שעות אחרות' };
const OD_FOR = { all:'כולם', ahmash:'רק אחמ"שים', ahmash_leader:'אחמ"שים ומובילים' };          // (the choices; "ahmash and leaders" needs scheduling-v29.sql — Guy 2026-10-18)
const OD_FOR_SHOW = Object.assign({ leader:'רק מובילים' }, OD_FOR);          // (a day opened before keeps its words)

// ---- the coordinator
async function srvOdLoad(){
  const st = portalLoad(); st.openDays = [];
  try { const r = await sbPersonal.rpc('open_days_status'); if(!r.error) st.openDays = r.data || []; } catch(e){}
}
const srvOdOfMonth = mk => (portalLoad().openDays || []).filter(o => monthKeyOf(o.day) === mk);
// for "things that need attention": an open day in the next two days that has not reached its minimum
function srvOdAlerts(mk){
  const today = srvToday(), soon = addDays(today, 2);
  return srvOdOfMonth(mk).filter(o => !o.closed && o.day >= today && o.day <= soon && o.taken < o.min_staff)
    .map(o => `${o.words}: במשמרת ${o.taken} מדריכים, מתוך מינימום ${o.min_staff}.`);
}
function srvOdFoldHtml(mk){
  const list = srvOdOfMonth(mk); if(!list.length) return '';
  const st = portalLoad(), nm = id => { const p = st.instructors.find(x => x.id === id); return p ? instrName(p, st.instructors) : ''; };
  return `<details class="pissues od-fold" data-od-fold${portalUi.odOpen ? ' open' : ''}><summary>${list.length} ימים פתוחים לשיבוץ</summary>
    ${list.map(o => { const full = o.taken >= o.max_staff, low = o.taken < o.min_staff;
      return `<div class="pflag od-row"><span><b>${pEsc(o.words)}</b> · ${OD_FOR_SHOW[o.audience] || ''}<br>
        <span class="od-count${full ? ' full' : low ? ' low' : ''}">במשמרת ${o.taken} מתוך ${o.max_staff}${o.min_staff ? ` (מינימום ${o.min_staff})` : ''}${o.closed ? ' · נסגר' : full ? ' · מלא' : ''}</span>
        ${(o.people || []).length ? `<br><small>נרשמו בעצמם: ${o.people.map(id => pEsc(nm(id))).join(', ')}</small>` : ''}${o.note ? `<br><small>${pEsc(o.note)}</small>` : ''}</span>
        ${o.closed ? '' : `<button type="button" class="btn ghost small" data-od-close="${o.id}">סגירה</button>`}</div>`; }).join('')}
    <div class="pnote">מי שנרשם מופיע בלוח מיד. כדי להוריד מישהו: לחיצה על המשמרת בלוח ו"הסרה", והמקום נפתח שוב.</div></details>`;
}
function srvOdWire(body, mk){
  const b = body.querySelector('#cs-openday'); if(b) b.addEventListener('click', () => srvOpenDayDialog(mk, body));
  const f = body.querySelector('[data-od-fold]'); if(f) f.addEventListener('toggle', () => { portalUi.odOpen = f.open; });
  body.querySelectorAll('[data-od-close]').forEach(x => x.addEventListener('click', async () => {
    if(!(await confirmSheet({ title:'לסגור את היום הזה להרשמה?', text:'ההצעה תרד מהפורטל של המדריכים. מי שכבר נרשם נשאר בסידור.', okLabel:'כן, לסגור', cancelLabel:'חזרה' }))) return;
    const u = await sbPersonal.from('open_days').update({ closed:true }).eq('id', x.dataset.odClose);
    toast(u.error ? 'הסגירה נכשלה' : 'היום נסגר להרשמה'); await srvOdLoad(); srvRenderCoordSchedule(body);
  }));
  srvOdPoll(body, mk);
}
// while the coordinator looks at the schedule, the open days are checked every minute: whoever placed herself shows up by itself
function srvOdPoll(body, mk){
  clearInterval(srv.odTimer); srv.odTimer = null;
  if(!srvOdOfMonth(mk).some(o => !o.closed && o.taken < o.max_staff && o.day >= srvToday())) return;
  srv.odTimer = setInterval(async () => {
    if(!body.isConnected || portalUi.tab !== 'schedule' || srvDragWho || document.querySelector('.sheet:not([hidden])')){ if(!body.isConnected){ clearInterval(srv.odTimer); srv.odTimer = null; } return; }
    const before = JSON.stringify(srvOdOfMonth(mk).map(o => [o.id, o.taken]));
    await srvOdLoad();
    if(JSON.stringify(srvOdOfMonth(mk).map(o => [o.id, o.taken])) !== before){ await srvReloadSafe(); await srvLoadCoord(); if(body.isConnected) srvRenderCoordSchedule(body); }
  }, 60000);
}
// the window where the coordinator opens a day
function srvOpenDayDialog(mk, body){
  const today = srvToday(), days = daysOfMonth(mk), first = days[0] > today ? days[0] : today, last = days[days.length - 1];
  if(first > last){ toast('החודש הזה כבר עבר'); return; }
  const sh = portalSheet(`<h2>פתיחת יום לשיבוץ</h2>
    <div class="pnote">המדריכים שהיום פתוח להם יקבלו הודעה בפורטל ובמייל, ויוכלו להשתבץ בעצמם. מי שנרשם מופיע אצלך בלוח מיד.</div>
    <label class="pfield">תאריך<input type="date" id="od-day" min="${first}" max="${last}" value="${first}"></label>
    <label class="pfield">מה פתוח<select id="od-scope">${Object.keys(OD_SCOPE).map(k => `<option value="${k}">${OD_SCOPE[k]}</option>`).join('')}</select></label>
    <div class="od-hours" id="od-hours" hidden><label class="pfield">משעה<input type="time" id="od-from" value="10:00"></label><label class="pfield">עד שעה<input type="time" id="od-to" value="14:00"></label></div>
    <div class="pnote">המינימום והמקסימום הם כמה מדריכים יהיו במשמרת בסך הכל, כולל מי שכבר משובץ.</div>
    <div class="adm-mins od-nums"><label class="pfield">מינימום מדריכים<input type="number" id="od-min" min="0" max="20" value="1"></label><label class="pfield">מקסימום מדריכים<input type="number" id="od-max" min="1" max="20" value="3"></label></div>
    <label class="pfield">למי פתוח<select id="od-for">${Object.keys(OD_FOR).map(k => `<option value="${k}">${OD_FOR[k]}</option>`).join('')}</select></label>
    <label class="pfield">הערה למדריכים (לא חובה)<input type="text" id="od-note" maxlength="200" placeholder="למשל: יום כיף עם הילדים"></label>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="od-go">פרסום למדריכים</button></div>`);
  const scope = sh.querySelector('#od-scope'); scope.addEventListener('change', () => { sh.querySelector('#od-hours').hidden = scope.value !== 'hours'; });
  sh.querySelector('#od-go').addEventListener('click', async () => {
    const v = id => sh.querySelector('#' + id).value, day = v('od-day'), mn = parseInt(v('od-min'), 10), mx = parseInt(v('od-max'), 10), from = v('od-from'), to = v('od-to');
    if(!day || day < first || day > last){ toast('בחרו תאריך בחודש הזה (מהיום והלאה)'); return; }
    if(!(mx >= 1) || !(mn >= 0) || mn > mx){ toast('בדקו את המספרים: המינימום לא יכול להיות גדול מהמקסימום'); return; }
    if(scope.value === 'hours' && (!from || !to || to <= from)){ toast('בדקו את השעות: "עד" צריך להיות אחרי "משעה"'); return; }
    const words = `${dayLabel(day)}, ${scope.value === 'hours' ? `${from}–${to}` : OD_SCOPE[scope.value]}`;
    if(!(await confirmSheet({ title:'לפרסם את היום למדריכים?', text:`${words}. ${mn ? `מינימום ${mn}, ` : ''}מקסימום ${mx} מדריכים, ל${OD_FOR[v('od-for')]}. כל מי שהיום פתוח לו יקבל הודעה ומייל.`, okLabel:'כן, לפרסם', cancelLabel:'חזרה' }))) return;
    const r = await sbPersonal.rpc('open_day_publish', { p_day:day, p_scope:scope.value, p_from:scope.value === 'hours' ? from : null, p_to:scope.value === 'hours' ? to : null, p_min:mn, p_max:mx, p_audience:v('od-for'), p_note:v('od-note') || null });
    if(r.error && /already open/.test(r.error.message)){          // (the same day and shift is open already: change that one instead, Guy 2026-10-26)
      const exId = (r.error.message.match(/[0-9a-f-]{36}/) || [])[0], ex = (portalLoad().openDays || []).find(o => o.id === exId);
      sh.close(); srvOdEdit(ex, mn, mx, body); return;
    }
    if(r.error){ toast(/not published/.test(r.error.message) ? 'אפשר לפתוח יום רק בחודש שהסידור שלו פורסם' : 'הפרסום נכשל: ' + r.error.message, 6000); return; }
    sh.close(); toast('היום פורסם. המדריכים קיבלו הודעה ומייל.', 5000); portalUi.odOpen = true;
    await srvOdLoad(); srvRenderCoordSchedule(body);
  });
}

// a day that is open already: its minimum and maximum can be changed (nobody is told again)
function srvOdEdit(o, mn, mx, body){
  if(!o){ toast('היום הזה כבר פתוח לשיבוץ. אפשר לסגור אותו ולפתוח מחדש.', 5000); return; }
  const sh = portalSheet(`<h2>היום הזה כבר פתוח לשיבוץ</h2><div class="pnote">${pEsc(o.words)} · במשמרת עכשיו ${o.taken} מדריכים (מינימום ${o.min_staff}, מקסימום ${o.max_staff}). אפשר לעדכן אותו במקום לפתוח שוב.</div>
    <div class="adm-mins od-nums"><label class="pfield">מינימום מדריכים<input type="number" id="ode-min" min="0" max="20" value="${mn}"></label><label class="pfield">מקסימום מדריכים<input type="number" id="ode-max" min="1" max="20" value="${mx}"></label></div>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn ghost" id="ode-go">עדכון</button></div>`);
  sh.querySelector('#ode-go').addEventListener('click', async () => {
    const a = parseInt(sh.querySelector('#ode-min').value, 10), b = parseInt(sh.querySelector('#ode-max').value, 10);
    if(!(b >= 1) || !(a >= 0) || a > b){ toast('בדקו את המספרים: המינימום לא יכול להיות גדול מהמקסימום'); return; }
    const u = await sbPersonal.from('open_days').update(Object.assign({ min_staff:a, max_staff:b }, b > o.max_staff ? { full_told:false } : {})).eq('id', o.id);
    if(u.error){ toast('העדכון נכשל'); return; }
    sh.close(); toast('היום עודכן'); portalUi.odOpen = true; await srvOdLoad(); srvRenderCoordSchedule(body);
  });
}

// ---- the instructors: a card at the top of the schedule tab for every day that is open to them
async function srvFillOpenDays(body){
  const box = body.querySelector('#od-cards'); if(!box) return;
  let list = [];
  try { const r = await sbPersonal.rpc('open_days_for_me'); if(r.error) return; list = r.data || []; } catch(e){ return; }
  if(!box.isConnected) return;
  box.innerHTML = list.map(o => { const left = o.max_staff - o.taken;
    return `<div class="od-card${o.mine ? ' mine' : ''}"><div class="od-card-text"><b>${o.mine ? 'נרשמת ליום הנוסף ✓' : 'נפתח יום נוסף לשיבוץ'}</b><span>${pEsc(o.words)}</span>
      ${o.note ? `<small>${pEsc(o.note)}</small>` : ''}${o.mine ? '<small>כדי לבטל צריך לפנות לרכזת.</small>' : `<small>${left === 1 ? 'נשאר מקום אחד' : `נשארו ${left} מקומות`}</small>`}</div>
      ${o.mine ? '' : `<button type="button" class="btn" data-od-join="${o.id}">אני רוצה להשתבץ</button>`}</div>`; }).join('');
  box.querySelectorAll('[data-od-join]').forEach(b => b.addEventListener('click', async () => {
    const o = list.find(x => x.id === b.dataset.odJoin); if(!o) return;
    if(!(await confirmSheet({ title:'להשתבץ ליום הזה?', text:`${o.words}. המשמרת תיכנס לסידור שלך מיד. ביטול רק דרך הרכזת.`, okLabel:'כן, להשתבץ', cancelLabel:'חזרה' }))) return;
    b.disabled = true;
    const r = await sbPersonal.rpc('open_day_join', { p_id:o.id });
    if(r.error){
      const msg = r.error.message || '';
      toast(/full/.test(msg) ? 'מישהו הקדים: היום כבר מלא. תודה על הרצון לעזור!' : /already working/.test(msg) ? 'יש לך כבר משמרת באותו יום, אז אי אפשר להשתבץ גם לזה.' : /already in/.test(msg) ? 'כבר נרשמת ליום הזה.' : 'ההרשמה לא הצליחה. נסו שוב או פנו לרכזת.', 6000);
      b.disabled = false; srvFillOpenDays(body); return;
    }
    toast('נרשמת! המשמרת נכנסה לסידור שלך. תודה!', 5000);
    await srvReloadSafe(); if(body.isConnected) srvRenderSchedule(body);
  }));
}
