
// ---------- THE PILOT AT THE BALANCING HOME: what the builder and the staff need beyond the two-week module (Guy's meeting with the
// institution 19.11.2026; Chava's task 2026-11-19_pilot-mazan-work-doc; Guy's answers the same evening; supabase/scheduling-v86.sql) ----------
// Taken from the first site wherever it had it: "דורש תשומת לב", "כמה משמרות לכל אחת", "שליחת עדכונים", a picture of the schedule to share,
// the personal settings (close pairs, days she never comes, e-mails), "משהו לא עובד?", dragging names into the table on a computer.
// Everything works on a database before v86 too: the parts that need it say nothing or stay hidden.

// ---- 1. "דורש תשומת לב" (the builder, step 3): everything that waits for her, a tap opens the place
const twAttnKey = x => x.t + '|' + x.x;
const twAttnDone = () => (((twPeriodRow() || {}).report || {}).done) || [];
function twAttention(){ const done = twAttnDone(); return twAttentionAll().filter(x => !done.includes(twAttnKey(x))); }
async function twAttnMark(keys){
  const p = twPeriodRow(); if(!p) return;
  const before = twAttnDone(), rep = Object.assign({}, p.report || {}, { done:[...new Set(before.concat(keys))] });
  const r = await sbPersonal.from('tw_period').update({ report:rep }).eq('start', p.start);
  if(r.error){ console.error(r.error); toast('⚠ לא נשמר'); return; }
  p.report = rep; twKeepScroll();
  twUndo(keys.length > 1 ? `${keys.length} סומנו כטופל` : 'סומן כטופל', async () => { const back = Object.assign({}, p.report, { done:before }); const u = await sbPersonal.from('tw_period').update({ report:back }).eq('start', p.start); if(u.error) return false; p.report = back; twKeepScroll(); return true; });
}
function twAttentionAll(){
  const out = [], days = twDays(TW.period), act = TW.people.filter(p => p.active);
  const word = (day, shift) => `${DOW_NAMES[dowOf(day)]} ${twShort(day)} · ${TW_SHIFT[shift]}`;
  days.forEach(day => twSlots(day).forEach(s => {
    const n = s.need - TW.asg.filter(a => a.day === day && a.shift === s.shift).length;
    if(n > 0) out.push({ cls:'bad', t:word(day, s.shift), x:n === 1 ? 'חסר שיבוץ אחד.' : `חסרים ${n} שיבוצים.`, go:twKey(day, s.shift) });
  }));
  TW.asg.forEach(a => {
    const p = twPerson(a.person); if(!p) return;
    if(a.by_hand && twLvl(a.person, a.day, a.shift) === 'no' && !a.ok) out.push({ cls:'bad', t:word(a.day, a.shift), x:`${twDisp(p)} שובצה ביד בלי שסימנה את המשמרת, ועוד לא סומן "אישרה".`, go:twKey(a.day, a.shift) });
    TW.asg.filter(b => b.person === a.person && b !== a && b.day >= a.day).forEach(b => {
      if(b.day === a.day && twSpan(b.day, b.shift, b)[0] < twSpan(a.day, a.shift, a)[0]) return;          // (each pair once, the earlier first)
      const k = twHandPair(a.person, a.day, a.shift, b.day, b.shift, a, b);
      if(k === 'overlap') out.push({ cls:'warn', t:`${twDisp(p)} · משמרות חופפות`, x:`${word(a.day, a.shift)} ו${word(b.day, b.shift)}: חופפות בשעות. ההחלטה שלך.`, go:twKey(b.day, b.shift) });
      else if(k === 'short') out.push({ cls:'warn', t:`${twDisp(p)} · מנוחה קצרה`, x:`${word(a.day, a.shift)} ו${word(b.day, b.shift)}: פחות מ-${twRest()} שעות. ההחלטה שלך.`, go:twKey(b.day, b.shift) });
      else if(k) out.push({ cls:'warn', t:`${twDisp(p)} · ${k === 'row' ? 'כפולה ברצף' : 'צירוף שלא סומן'}`, x:`${word(a.day, a.shift)} ו${word(b.day, b.shift)}: ${twHandWord(k)}. ההחלטה שלך.`, go:twKey(b.day, b.shift) });
    });
  });
  // a night beyond the turn (Guy 20.11: "כן, עם הערה בדברים שדורשים תשומת לב"): the turn gives two nights in a week to two people in the
  // two weeks; when there were not enough people the engine may give more, and the builder sees it here
  const nightsOf = p => [0, 1].map(w => TW.asg.filter(a => a.person === p.id && a.shift === 'N' && twWeekOf(TW.period, a.day) === w).length);
  const dbl = act.filter(p => nightsOf(p).some(n => n >= 2));
  act.forEach(p => {
    const nw = nightsOf(p);
    if(nw.some(n => n >= 3)) out.push({ cls:'warn', t:`${twDisp(p)} · לילה נוסף מעבר לתור`, x:`${Math.max(...nw)} לילות בשבוע אחד. ההחלטה שלך.` });
    else if(nw[0] >= 2 && nw[1] >= 2) out.push({ cls:'warn', t:`${twDisp(p)} · לילה נוסף מעבר לתור`, x:'שני לילות בכל אחד מהשבועות. ההחלטה שלך.' });
  });
  if(dbl.length > 2) out.push({ cls:'warn', t:'לילה נוסף מעבר לתור', x:`${dbl.length} עובדות עם שני לילות בשבוע (${dbl.map(twDisp).join(', ')}). בתור יש שתיים בשבועיים. ההחלטה שלך.` });
  act.forEach(p => {
    const n = TW.asg.filter(a => a.person === p.id).length, q = p.per_week * 2;
    if(TW.asg.length && n > q) out.push({ cls:'info', t:`${twDisp(p)} · מעל המינימום`, x:`${n} משמרות בשבועיים (המינימום ${q}), כי חסרו עובדות שסימנו.` });
    const c = twCount(p), sub = TW.subs.some(s => s.person === p.id);
    const short = c.weeks.map((w, i) => (sub && w && w.need && w.eff < w.need && w.eff < w.have) ? `בשבוע ${i + 1} פתחה ${w.have} ואפשר לשבץ בפועל ${w.eff}` : '').filter(Boolean);
    if(short.length) out.push({ cls:'note', t:`${twDisp(p)} · הגשה עם משמרות צמודות`, x:`${short.join('; ')}. הוגש בכל זאת.` });
  });
  return out;
}
function twAttentionHtml(){
  const list = twAttention();
  // the empty places together, one short line with a button per place; then the rest, six at first
  const miss = list.filter(x => x.cls === 'bad' && x.go && /^חס/.test(x.x)), info = list.filter(x => x.cls === 'info' || x.cls === 'note'), rest = list.filter(x => !miss.includes(x) && !info.includes(x)), MAX = 6;
  const done = x => `<button type="button" class="btn ghost small tw-attn-done" data-tw-done="${pEsc(twAttnKey(x))}">טופל</button>`;
  const row = x => `<div class="pstatus ${x.cls === 'info' ? 'ok' : 'bad'} tw-attn-row tw-attn-line">${x.go ? `<button type="button" class="tw-attn-go" data-tw-goto="${x.go}"><b>${pEsc(x.t)}</b> · ${pEsc(x.x)}</button>` : `<span><b>${pEsc(x.t)}</b> · ${pEsc(x.x)}</span>`}${done(x)}</div>`;
  const shown = TW.attnAll ? rest : rest.slice(0, MAX);
  const act = miss.length + rest.length;
  const infoBox = info.length ? `<details class="tw-fixed-box tw-info"><summary>לידיעה (${info.length})</summary>${info.map(x => `<div class="pstatus tw-soft tw-attn-row"><b>${pEsc(x.t)}</b> · ${pEsc(x.x)}</div>`).join('')}</details>` : '';
  if(!act) return '<div class="pstatus ok">אין דברים שדורשים תשומת לב.</div>' + infoBox;
  return `<details class="tw-fixed-box tw-attn"${TW.attnOpen ? ' open' : ''}><summary>דורש תשומת לב (${act})</summary>
    ${miss.length ? `<div class="pstatus bad tw-attn-row"><b>משבצות חסרות (${miss.length})</b> <button type="button" class="btn ghost small tw-attn-done" data-tw-done="${pEsc(miss.map(twAttnKey).join('\n'))}">טופל</button><span class="tw-attn-chips">${miss.map(x => `<button type="button" class="btn ghost small" data-tw-goto="${x.go}">${pEsc(x.t)}${/^חסרים/.test(x.x) ? ' (' + x.x.replace(/\D/g, '') + ')' : ''}</button>`).join('')}</span></div>` : ''}
    ${shown.map(row).join('')}
    ${!TW.attnAll && rest.length > MAX ? `<div class="tw-actions"><button type="button" class="btn ghost small" id="tw-attn-all">עוד ${rest.length - MAX}</button></div>` : ''}
    <div class="pnote">לחיצה על משבצת פותחת אותה.</div></details>${infoBox}`;
}
// ---- 3. "שליחת עדכונים" (the first site): changes after publishing reach the staff's e-mail together, when the builder presses
// (each person sees her own changes on the site at once, with "הבנתי"; scheduling-v82.sql). The count comes from the database (v86).
// (Guy 23.11) for all the published schedules the coordinator may change, so the line shows in her "הסידור" and in "רכזת" alike, and only
// when there are changes
async function twPendingLoad(){
  TW.pend = {};
  if(typeof twCoordOk !== 'function' || !twCoordOk()) return;
  await Promise.all(twBoardPers().filter(p => p.status === 'published').map(async p => {
    try { const r = await sbPersonal.rpc('tw_send_updates', { p_period:p.start, p_send:false }); if(!r.error && r.data) TW.pend[p.start] = r.data; } catch(e){}
  }));
}
const twPendN = () => Object.values(TW.pend || {}).reduce((a, b) => a + b, 0);
function twPendingHtml(){
  const n = twPendN(); if(!n) return '';
  return `<div class="pstatus bad tw-pending"><span>${n === 1 ? 'לעובדת אחת יש שינויים' : `ל-${n} עובדות יש שינויים`} בסידור שעוד לא נשלחו במייל.</span> <button type="button" class="btn small" id="tw-send-updates">שליחת עדכונים</button></div>`;
}
function twPendingWire(box){
  const b = box.querySelector('#tw-send-updates'); if(!b) return;
  b.addEventListener('click', async () => {
    if(!(await twConfirm({ title:'לשלוח את העדכונים?', text:'כל מי שהמשמרות שלה השתנו מאז הפרסום תקבל מייל אחד עם השינויים (מי שבחרה לקבל).', ok:'כן, לשלוח' }))) return;
    b.disabled = true;
    for(const per of Object.keys(TW.pend || {})){
      let r; try { r = await sbPersonal.rpc('tw_send_updates', { p_period:per, p_send:true }); } catch(e){ r = { error:e }; }
      if(r.error){ console.error(r.error); toast('⚠ השליחה נכשלה'); b.disabled = false; return; }
    }
    toast('העדכונים נשלחו'); TW.pend = {}; twRender();
  });
}

// ---- 4. a picture of the published schedule to send in WhatsApp (the first site, Guy 2026-11-03). Guy 23.11: both weeks of the schedule
// in ONE picture, the days side by side as in "הצוות כולו" (Sunday on the right), names and hours only, nobody highlighted. With changes
// that were not mailed yet it asks to send them first.
async function twShareAsk(){
  const p = twPeriodRow(); if(!p || p.status !== 'published'){ toast('אפשר לשתף רק סידור שפורסם'); return; }
  if((TW.pend || {})[p.start]){ toast('יש שינויים שעוד לא נשלחו. קודם "שליחת עדכונים", ואז שיתוף.', 5000); return; }
  await twShareImage();
}
// the picture itself: both weeks, the days side by side (for sharing and for printing)
function twScheduleCanvas(){
  const days = twDays(TW.period), W = 1600, side = 150, pad = 30, colW = (W - side - pad * 2) / 7, lineH = 30, F = '400 23px Assistant, Arial';
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const list = (day, sh) => TW.asg.filter(a => a.day === day && a.shift === sh).map(a => twName(a.person) + (a.from_time && a.to_time ? ` ${twNice(twHm(a.from_time))}–${twNice(twHm(a.to_time))}` : '')).sort((x, y) => x.localeCompare(y, 'he'));
  const need = (day, sh) => ((twSlots(day).find(s => s.shift === sh) || {}).need || 0);
  // the boxes of one day: [row, rows it spans, names, how many are needed, a line above the names, the long weekend shift]
  const dayBoxes = d => {
    const sl = {}; twSlots(d).forEach(s => { sl[s.shift] = s; }); const pv = addDays(d, -1), out = [];
    if(sl.W){ if(sl.M) out.push([0, 1, list(d, 'M'), need(d, 'M')]); out.push([1, 2, list(d, 'W'), need(d, 'W'), `סוף שבוע · מ-${twNice(twWeekend(d, 'start'))}`, true]); return out; }
    if(!sl.M && !sl.A && twSlots(pv).some(s => s.shift === 'W')){ out.push([0, 2, list(pv, 'W'), 0, `נמשך, עד ${twNice(twWeekend(d, 'end'))}`, true]); if(sl.N) out.push([2, 1, list(d, 'N'), need(d, 'N')]); return out; }
    TW_ROWS.forEach((k, r) => { if(sl[k]) out.push([r, 1, list(d, k), need(d, k)]); });
    return out;
  };
  const heights = boxes => { const h = [2, 2, 2];
    boxes.forEach(day => day.forEach(([r, span, names, nd, label]) => { const lines = names.length + (nd > names.length ? 1 : 0) + (label ? 1 : 0);
      if(span === 1) h[r] = Math.max(h[r], lines); else { const per = Math.ceil(lines / span); for(let i = 0; i < span; i++) h[r + i] = Math.max(h[r + i], per); } }));
    return h.map(n => n * lineH + 20); };
  const weeks = [0, 1].map(w => { const wd = days.slice(w * 7, w * 7 + 7), boxes = wd.map(dayBoxes); return { wd, boxes, rh:heights(boxes) }; });
  const headH = 130, weekHead = 92;
  const H = headH + weeks.reduce((t, x) => t + weekHead + x.rh.reduce((a, b) => a + b, 0) + 26, 0) + 20;
  c.width = W; c.height = H;
  g.direction = 'rtl'; g.textAlign = 'right'; g.fillStyle = '#FAF7F2'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2D2A24'; g.font = '600 46px Rubik, Assistant, Arial'; g.fillText('סידור העבודה', W - pad, 62);
  g.font = '400 30px Assistant, Arial'; g.fillStyle = '#6E675C'; g.fillText(`${twShort(days[0])} עד ${twShort(days[13])}`, W - pad, 104);
  let y = headH;
  const colR = i => W - pad - side - i * colW;
  weeks.forEach((wk, w) => {
    g.textAlign = 'right'; g.fillStyle = '#5C6F52'; g.font = '700 28px Assistant, Arial'; g.fillText(`שבוע ${w + 1}`, W - pad, y + 34);
    g.textAlign = 'center';
    wk.wd.forEach((d, i) => { g.fillStyle = '#2D2A24'; g.font = '700 25px Assistant, Arial'; g.fillText(DOW_NAMES[dowOf(d)], colR(i) - colW / 2, y + 36); g.font = '400 21px Assistant, Arial'; g.fillStyle = '#6E675C'; g.fillText(twShort(d), colR(i) - colW / 2, y + 64); });
    y += weekHead;
    const top = []; let t = y; wk.rh.forEach(h => { top.push(t); t += h; });
    const usualDay = wk.wd.find(d => twKind(d) === 'weekday') || wk.wd[0];
    TW_ROWS.forEach((k, r) => { g.textAlign = 'right'; g.fillStyle = '#2D2A24'; g.font = '700 24px Assistant, Arial'; g.fillText(TW_SHIFT[k], W - pad - 6, top[r] + 34);
      const hrs = (twSlots(usualDay).find(s => s.shift === k) || {}).hours; if(hrs){ g.font = '400 18px Assistant, Arial'; g.fillStyle = '#6E675C'; g.direction = 'ltr'; g.fillText(hrs, W - pad - 6, top[r] + 60); g.direction = 'rtl'; } });          // (the hours left to right)
    wk.boxes.forEach((day, i) => day.forEach(([r, span, names, nd, label, long]) => {
      const x1 = colR(i) - colW + 4, x2 = colR(i) - 4, y1 = top[r] + 3, y2 = top[r + span - 1] + wk.rh[r + span - 1] - 3, mid = (x1 + x2) / 2;
      g.fillStyle = long ? '#E3ECDB' : (i % 2 ? '#FFFFFF' : '#F4EFE7'); g.fillRect(x1, y1, x2 - x1, y2 - y1);
      g.textAlign = 'center'; let ly = y1 + 30;
      if(label){ g.font = '400 18px Assistant, Arial'; g.fillStyle = '#5C6F52'; g.fillText(label, mid, ly); ly += lineH; }
      g.font = F; g.fillStyle = '#2D2A24';
      names.forEach(n => { let t2 = n; while(g.measureText(t2).width > colW - 14 && t2.length > 3) t2 = t2.slice(0, -1); g.fillText(t2, mid, ly); ly += lineH; });
      const miss = Math.max(0, nd - names.length); if(miss){ g.fillStyle = '#B5502F'; g.fillText(`חסר ${miss}`, mid, ly); }
    }));
    y = t + 26;
  });
  return c;
}
async function twShareImage(){
  const c = twScheduleCanvas();
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const file = new File([blob], `schedule-${TW.period}.png`, { type:'image/png' });
  try { if(navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:'סידור העבודה' }); return; } } catch(e){ if(e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); toast('התמונה נשמרה. אפשר לצרף אותה בוואטסאפ.');
}

// printing (Guy 23.11): the same picture, both weeks on one page across; the browser's printing also saves a PDF
function twPrint(){
  const url = twScheduleCanvas().toDataURL('image/png'), w = window.open('', '_blank');
  if(!w){ toast('הדפדפן חסם את חלון ההדפסה. אפשר לאשר חלונות קופצים לאתר ולנסות שוב.', 6000); return; }
  w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>סידור העבודה</title><style>@page{ size:A4 landscape; margin:8mm; } html,body{ margin:0; } img{ display:block; width:100%; height:auto; max-height:100vh; object-fit:contain; }</style></head><body><img src="${url}" alt="סידור העבודה"></body></html>`);
  w.document.close();
  const go = () => { w.focus(); w.print(); };
  const im = w.document.querySelector('img'); if(im.complete) setTimeout(go, 100); else im.onload = () => setTimeout(go, 100);
}

// the extras of step 3 and of a published schedule, wired once for the screen
function twPilotWire(box){
  box.querySelectorAll('[data-tw-goto]').forEach(b => b.addEventListener('click', () => twCellSheet(b.dataset.twGoto)));
  box.querySelectorAll('[data-tw-done]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); b.disabled = true; twAttnMark(b.dataset.twDone.split('\n')); }));
  const at = box.querySelector('.tw-attn'); if(at) at.addEventListener('toggle', () => { TW.attnOpen = at.open; });          // (folded at first, as in the first site: Guy 23.11)
  const aa = box.querySelector('#tw-attn-all'); if(aa) aa.addEventListener('click', () => { TW.attnAll = true; twKeepScroll(); });
  const sh = box.querySelector('#tw-share'); if(sh) sh.addEventListener('click', () => twShareAsk());
  twPendingWire(box);
}

// ---- 6. my own settings, inside "הגדרות" of the product (Guy 19.11): the close pairs I agree to, the days I never come, how a new
// hand-in starts, which e-mails I get (all on at the start), my phone, and "משהו לא עובד?"
const TW_NOTIFY = [['reminder', 'תזכורת לפני סוף ההגשה, אם עוד לא הגשתי'], ['published', 'הסידור פורסם'], ['changed', 'משמרת שלי זזה או השתנתה'], ['swap', 'בקשת החלפה שמתאימה לי']];
function twMySettingsHtml(){
  if(!TW.me || !TW.prefsOn) return '';
  const pf = twPrefOf(TW.me.id) || {}, combos = pf.combos || [], off = pf.days_off || [], nt = Object.assign({ reminder:true, published:true, changed:true, swap:true }, pf.notify || {});
  const seg = (k, on) => `<div class="mx-seg" role="group"><button type="button" data-tw-nt="${k}" data-v="1" aria-pressed="${!!on}">דלוק</button><button type="button" data-tw-nt="${k}" data-v="" aria-pressed="${!on}">כבוי</button></div>`;
  const fold = (k, t, b) => typeof sbFold === 'function' ? sbFold(k, t, b) : b;          // (folded under headings: Guy 21.11)
  return `${fold('shifts', 'ההעדפות שלי בסידור', `<div class="sb-set-row"><b>משמרות צמודות שאני מוכנה לעבוד</b><div class="sb-help">צירוף שלא סימנת לא ישובץ לך אוטומטית.</div>
      ${Object.entries(TW_COMBO).map(([k, w]) => `<label class="tw-chk-l"><input type="checkbox" data-tw-combo="${k}"${combos.includes(k) ? ' checked' : ''}> ${w}</label>`).join('')}</div>
    <div class="sb-set-row"><b>ימים שאני לא באה בהם</b><div class="tw-days-off">${DOW_NAMES.map((d, i) => `<button type="button" class="btn ghost small" data-tw-off="${i}" aria-pressed="${off.includes(i)}">${d}</button>`).join('')}</div>
      <div class="sb-help">מי שבונה את הסידור רואה את זה ליד השם.</div></div>
    <div class="sb-set-row"><b>הגשה חדשה מתחילה</b><div class="mx-seg" role="group"><button type="button" data-tw-copy="" aria-pressed="${!pf.copy_last}">ריקה</button><button type="button" data-tw-copy="1" aria-pressed="${!!pf.copy_last}">מההגשה הקודמת שלי</button></div></div>
`)}
    ${fold('mail', 'התראות במייל', `<div class="sb-help">הכול דלוק מההתחלה. אפשר לכבות.</div>
    ${TW_NOTIFY.map(([k, w]) => `<div class="sb-set-row"><span>${w}</span>${seg(k, nt[k])}</div>`).join('')}`)}
    ${''/* (Guy 22.11: no "הפרטים שלי ותקלות" here: the phone is entered by the admin in the staff list; "דיווח על תקלה" is a small link at the bottom of every screen, as in the first site) */}`;
}
async function twSavePref(patch){
  const cur = twPrefOf(TW.me.id) || { person:TW.me.id, combos:[], days_off:[], copy_last:false, notify:{ reminder:true, published:true, changed:true, swap:true } };
  const row = Object.assign({}, cur, patch, { person:TW.me.id, updated_at:new Date().toISOString() }); delete row.org_id;
  const r = await sbPersonal.from('tw_pref').upsert(row);
  if(r.error){ console.error(r.error); toast('⚠ לא נשמר'); return false; }
  TW.prefs = (TW.prefs || []).filter(p => p.person !== TW.me.id).concat(Object.assign({}, cur, patch)); toast('נשמר'); return true;
}
function twMySettingsWire(wrap){
  if(!TW.me || !TW.prefsOn) return;
  const redraw = () => { const rows = wrap.querySelectorAll('[data-tw-mine]'); rows.forEach(n => n.remove()); twMySettingsInto(wrap); };
  wrap.querySelectorAll('[data-tw-combo]').forEach(cb => cb.addEventListener('change', async () => {
    const all = [...wrap.querySelectorAll('[data-tw-combo]')].filter(x => x.checked).map(x => x.dataset.twCombo);
    if(!(await twSavePref({ combos:all }))) cb.checked = !cb.checked;
  }));
  wrap.querySelectorAll('[data-tw-off]').forEach(b => b.addEventListener('click', async () => {
    const off = ((twPrefOf(TW.me.id) || {}).days_off || []).slice(), d = Number(b.dataset.twOff), i = off.indexOf(d);
    if(i >= 0) off.splice(i, 1); else off.push(d);
    if(await twSavePref({ days_off:off.sort() })) redraw();
  }));
  wrap.querySelectorAll('[data-tw-copy]').forEach(b => b.addEventListener('click', async () => { if(await twSavePref({ copy_last:!!b.dataset.twCopy })) redraw(); }));
  wrap.querySelectorAll('[data-tw-nt]').forEach(b => b.addEventListener('click', async () => {
    const nt = Object.assign({ reminder:true, published:true, changed:true, swap:true }, (twPrefOf(TW.me.id) || {}).notify || {}); nt[b.dataset.twNt] = !!b.dataset.v;
    if(await twSavePref({ notify:nt })) redraw();
  }));
  const ps = wrap.querySelector('#tw-my-phone');
  if(ps) ps.addEventListener('change', async () => {
    const v = wrap.querySelector('#tw-my-phone').value.trim();
    if(v && !/^[0-9+\- ]{7,20}$/.test(v)){ toast('מספר טלפון לא תקין'); return; }
    const r = v ? await sbPersonal.from('tw_phone').upsert({ person:TW.me.id, phone:v }) : await sbPersonal.from('tw_phone').delete().eq('person', TW.me.id);
    if(r.error){ console.error(r.error); toast('⚠ לא נשמר'); return; }
    if(v) TW.phones[TW.me.id] = v; else delete TW.phones[TW.me.id]; toast('נשמר');
  });
  const pr = wrap.querySelector('#tw-problem'); if(pr) pr.addEventListener('click', () => { wrap.remove(); twProblemSheet(); });
}
// the section goes at the top of the product's settings (products/shibutz/shell.js calls this)
function twMySettingsInto(wrap){
  const set = wrap.querySelector('.sb-set'); if(!set) return;
  const html = twMySettingsHtml(); if(!html) return;
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  [...tmp.children].reverse().forEach(n => { n.dataset.twMine = '1'; set.prepend(n); });
  twMySettingsWire(wrap);
}
// "משהו לא עובד?": a few words, and the screen and the device go with it (no personal details); the admin reads them (tw_problem)
function twProblemSheet(){
  const sh = twSheet(`<h2>דיווח על תקלה</h2><div class="pnote">מה קרה? כמה מילים מספיקות. הדיווח מגיע להנהלה ולתמיכה.</div>
    <label class="tw-note-l">מה לא עבד<textarea id="tw-prob" rows="4" maxlength="1000"></textarea></label><div class="pnote tw-privacy">${twT('privacy')}</div>
    <div class="confirm-actions"><button type="button" class="btn" id="tw-prob-go">שליחה</button><button type="button" class="btn ghost" id="tw-prob-back">חזרה</button></div>`);
  sh.querySelector('#tw-prob-back').addEventListener('click', () => sh.remove());
  sh.querySelector('#tw-prob-go').addEventListener('click', async () => {
    const text = sh.querySelector('#tw-prob').value.trim(); if(!text){ toast('צריך לכתוב מה קרה'); return; }
    const info = { tab:TW.tab || '', step:TW.step || null, period:TW.period || null, width:window.innerWidth, ua:navigator.userAgent.slice(0, 160), at:new Date().toISOString() };
    const r = await sbPersonal.from('tw_problem').insert({ text, info });
    if(r.error){ console.error(r.error); toast('⚠ הדיווח לא נשלח'); return; }
    sh.remove(); toast('הדיווח נשלח. תודה!');
  });
}

// ---- 7. a new hand-in that starts from her last one (Guy 19.11, her choice in the settings): once, when the two weeks are open and she
// marked nothing yet; the same day of the week and shift as in the last two weeks she handed in; never on a day she never comes
async function twCopyLast(person){
  const pf = twPrefOf(person.id); if(!pf || !pf.copy_last || !twOpenNow()) return false;
  if(TW.options.some(o => o.person === person.id) || TW.subs.some(s => s.person === person.id)) return false;
  const key = 'mercury-tw-copied-' + person.id + '-' + TW.period; try { if(localStorage.getItem(key)) return false; localStorage.setItem(key, '1'); } catch(e){}
  const prev = TW.periods.filter(p => p.start < TW.period).map(p => p.start).sort().pop(); if(!prev) return false;
  const r = await sbPersonal.from('tw_option').select('day,shift,level').eq('period', prev).eq('person', person.id); if(r.error || !(r.data || []).length) return false;
  const off = pf.days_off || [], rows = [];
  r.data.forEach(o => { const day = addDays(TW.period, Math.round((parseIso(o.day) - parseIso(prev)) / 86400000)); if(off.includes(dowOf(day)) || !twSlots(day).some(s => s.shift === o.shift)) return; rows.push({ period:TW.period, person:person.id, day, shift:o.shift, level:o.level || 'yes' }); });
  if(!rows.length) return false;
  const ins = await sbPersonal.from('tw_option').insert(rows); if(ins.error){ console.error(ins.error); return false; }
  TW.options = TW.options.concat(rows); toast('ההגשה התחילה מהסימונים של הפעם הקודמת. אפשר לשנות הכול.', 5000); return true;
}

// ---- 8. the test site only (Guy 19.11: "אני רוצה לראות את חוויית המשתמש של מיכל ושל המדריכות"): an admin chooses one of the staff and
// sees the screens exactly as that person does — as a staff member, or as a local admin who is also on the staff and builds. The database
// still knows the real admin (every right check is the admin's), so what goes through the person's own server functions (taking a swap,
// asking for one, her own notices) does not work in this mode; marks, hand-ins, building and settings do. Never on the real sites.
const twViewAsOn = () => /^(shibutz-test\.|localhost|127\.0\.0\.1)/.test(location.hostname);
function twViewAsApply(){
  if(!twViewAsOn() || !TW.realBoss) return;
  let v = null; try { v = JSON.parse(sessionStorage.getItem('mercury-tw-viewas') || 'null'); } catch(e){}
  const p = v && TW.people.find(x => x.id === v.person && x.active); if(!p) return;
  TW.viewAs = { person:p.id, admin:!!v.admin }; TW.me = p; TW.boss = !!v.admin;
}
function twViewAsBar(){
  if(!TW.viewAs) return '';
  return `<div class="pstatus tw-soft tw-viewas" role="status">אתר הבדיקות · רואים את המסך כמו <b>${pEsc(twDisp(TW.me))}</b> (${TW.viewAs.admin ? 'אדמינית מקומית שהיא גם בצוות' : 'עובדת'}). <button type="button" class="btn small" id="tw-viewas-off">חזרה למסך שלי</button></div>`;
}
function twViewAsPickHtml(fold){
  if(!twViewAsOn() || !TW.realBoss || TW.viewAs) return '';
  return fold('viewas', 'צפייה כמו עובדת (רק באתר הבדיקות)', `<p class="tw-step-say">בוחרים עובדת ורואים את האתר בדיוק כמו שהיא רואה אותו. אפשר לסמן העדפות, להגיש, לבנות ולשנות הגדרות. החלפות לא עובדות במצב הזה.</p>
    <div class="tw-form"><label>עובדת <select id="tw-viewas-who">${TW.people.filter(p => p.active).map(p => `<option value="${p.id}">${pEsc(twDisp(p))}</option>`).join('')}</select></label></div>
    <div class="tw-actions"><button type="button" class="btn" data-tw-viewas="">כמו מדריכה</button><button type="button" class="btn ghost" data-tw-viewas="1">כמו אדמינית מקומית שהיא גם בצוות</button></div>
    <div class="pnote">כדי לראות את מי שבונה את הסידור: בפסקה "השבועיים" קובעים אותה כבונה של השבועיים הפתוחים.</div>`);
}
function twViewAsWire(box){
  box.querySelectorAll('[data-tw-viewas]').forEach(b => b.addEventListener('click', async () => {
    const who = box.querySelector('#tw-viewas-who').value;
    try { sessionStorage.setItem('mercury-tw-viewas', JSON.stringify({ person:who, admin:!!b.dataset.twViewas })); } catch(e){}
    TW.tab = null; TW.as = null; TW.step = null; await twLoadBase(); await twLoadPeriod(); TW.tab = TW.me ? 'mine' : 'sched'; twRender(); window.scrollTo(0, 0);
  }));
  const off = box.querySelector('#tw-viewas-off');
  if(off) off.addEventListener('click', async () => {
    try { sessionStorage.removeItem('mercury-tw-viewas'); } catch(e){}
    TW.tab = 'team'; TW.as = null; TW.step = null; await twLoadBase(); await twLoadPeriod(); twRender(); window.scrollTo(0, 0);
  });
}
