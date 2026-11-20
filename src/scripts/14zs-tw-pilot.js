
// ---------- THE PILOT AT THE BALANCING HOME: what the builder and the staff need beyond the two-week module (Guy's meeting with the
// institution 19.11.2026; Chava's task 2026-11-19_pilot-mazan-work-doc; Guy's answers the same evening; supabase/scheduling-v86.sql) ----------
// Taken from the first site wherever it had it: "דורש תשומת לב", "כמה משמרות לכל אחת", "שליחת עדכונים", a picture of the schedule to share,
// the personal settings (close pairs, days she never comes, e-mails), "משהו לא עובד?", dragging names into the table on a computer.
// Everything works on a database before v86 too: the parts that need it say nothing or stay hidden.

// ---- 1. "דורש תשומת לב" (the builder, step 3): everything that waits for her, a tap opens the place
function twAttention(){
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
  const row = x => x.go ? `<button type="button" class="pstatus ${x.cls === 'info' ? 'ok' : 'bad'} tw-attn-row" data-tw-goto="${x.go}"><b>${pEsc(x.t)}</b> · ${pEsc(x.x)}</button>`
    : `<div class="pstatus ${x.cls === 'info' ? 'ok' : 'bad'} tw-attn-row"><b>${pEsc(x.t)}</b> · ${pEsc(x.x)}</div>`;
  const shown = TW.attnAll ? rest : rest.slice(0, MAX);
  const act = miss.length + rest.length;
  const infoBox = info.length ? `<details class="tw-fixed-box tw-info"><summary>לידיעה (${info.length})</summary>${info.map(x => `<div class="pstatus tw-soft tw-attn-row"><b>${pEsc(x.t)}</b> · ${pEsc(x.x)}</div>`).join('')}</details>` : '';
  if(!act) return '<div class="pstatus ok">אין דברים שדורשים תשומת לב.</div>' + infoBox;
  return `<details class="tw-fixed-box tw-attn"${TW.attnClosed ? '' : ' open'}><summary>דורש תשומת לב (${act})</summary>
    ${miss.length ? `<div class="pstatus bad tw-attn-row"><b>משבצות חסרות (${miss.length})</b><span class="tw-attn-chips">${miss.map(x => `<button type="button" class="btn ghost small" data-tw-goto="${x.go}">${pEsc(x.t)}${/^חסרים/.test(x.x) ? ' (' + x.x.replace(/\D/g, '') + ')' : ''}</button>`).join('')}</span></div>` : ''}
    ${shown.map(row).join('')}
    ${!TW.attnAll && rest.length > MAX ? `<div class="tw-actions"><button type="button" class="btn ghost small" id="tw-attn-all">עוד ${rest.length - MAX}</button></div>` : ''}
    <div class="pnote">לחיצה על משבצת פותחת אותה.</div></details>${infoBox}`;
}
// ---- 2. "כמה משמרות לכל אחת": the weeks, the two weeks against the least, nights (and who had two), mornings / afternoons / nights
function twCountsHtml(){
  if(!TW.asg.length) return '';
  const act = TW.people.filter(p => p.active), wk = (p, w) => TW.asg.filter(a => a.person === p.id && twWeekOf(TW.period, a.day) === w).length;
  const rows = act.map(p => {
    const all = TW.asg.filter(a => a.person === p.id), q = p.per_week * 2, n = all.length, k = sh => all.filter(a => a.shift === sh).length;
    const nw = [0, 1].map(w => all.filter(a => a.shift === 'N' && twWeekOf(TW.period, a.day) === w).length);
    const st = n === q ? 'ok' : n > q ? 'over' : 'low';
    return { st, html:`<div class="tw-cnt ${st}"><b>${pEsc(twDisp(p))}</b> · ${n} מתוך ${q}${st === 'ok' ? ' ✓' : st === 'over' ? ` · מעל המינימום (+${n - q})` : ` · חסרות ${q - n}`}
      <small>שבוע 1: ${wk(p, 0)} · שבוע 2: ${wk(p, 1)} · לילות ${nw[0] + nw[1]}${nw.some(x => x >= 2) ? ' (שני לילות בשבוע אחד)' : ''} · בוקר ${k('M')}, צהריים ${k('A')}, לילה ${k('N')}, סוף שבוע ${k('W')}</small></div>` };
  });
  const off = rows.filter(r => r.st !== 'ok'), ok = rows.filter(r => r.st === 'ok');
  return `<details class="tw-fixed-box"${TW.countsOpen === false ? '' : ' open'} data-tw-counts><summary>כמה משמרות לכל אחת${off.length ? ` (${off.length === 1 ? 'אחת לא במספר המדויק' : `${off.length} לא במספר המדויק`})` : ''}</summary>
    ${off.map(r => r.html).join('')}${ok.length ? `<details class="tw-cnt-ok"><summary>במספר המדויק (${ok.length})</summary>${ok.map(r => r.html).join('')}</details>` : ''}</details>`;
}

// ---- 3. "שליחת עדכונים" (the first site): changes after publishing reach the staff's e-mail together, when the builder presses
// (each person sees her own changes on the site at once, with "הבנתי"; scheduling-v82.sql). The count comes from the database (v86).
async function twPendingLoad(){
  TW.pending = null;
  const p = twPeriodRow(); if(!p || p.status !== 'published' || !twIsBuilder()) return;
  try { const r = await sbPersonal.rpc('tw_send_updates', { p_period:TW.period, p_send:false }); if(!r.error) TW.pending = r.data || 0; } catch(e){}
}
function twPendingHtml(){
  if(!TW.pending) return '';
  return `<div class="pstatus bad tw-pending">${TW.pending === 1 ? 'לעובדת אחת יש שינויים' : `ל-${TW.pending} עובדות יש שינויים`} שעוד לא נשלחו במייל. <button type="button" class="btn small" id="tw-send-updates">שליחת עדכונים</button></div>`;
}
function twPendingWire(box){
  const b = box.querySelector('#tw-send-updates'); if(!b) return;
  b.addEventListener('click', async () => {
    if(!(await twConfirm({ title:'לשלוח את העדכונים?', text:'כל מי שהמשמרות שלו השתנו מאז הפרסום יקבל מייל אחד עם השינויים (מי שבחר לקבל).', ok:'כן, לשלוח' }))) return;
    b.disabled = true;
    let r; try { r = await sbPersonal.rpc('tw_send_updates', { p_period:TW.period, p_send:true }); } catch(e){ r = { error:e }; }
    if(r.error){ console.error(r.error); toast('⚠ השליחה נכשלה'); b.disabled = false; return; }
    toast('העדכונים נשלחו'); TW.pending = 0; twRender();
  });
}

// ---- 4. a picture of the published schedule, a week at a time, to send in WhatsApp (the first site, Guy 2026-11-03): names and hours
// only; with changes that were not mailed yet it asks to send them first
function twShareAsk(){
  const p = twPeriodRow(); if(!p || p.status !== 'published'){ toast('אפשר לשתף רק סידור שפורסם'); return; }
  if(TW.pending){ toast('יש שינויים שעוד לא נשלחו. קודם "שליחת עדכונים", ואז שיתוף.', 5000); return; }
  const days = twDays(TW.period);
  const sh = twSheet(`<h2>שיתוף תמונת הסידור</h2><div class="pnote">בטלפון התמונה נפתחת לשיתוף, ובוחרים למי לשלוח. במחשב היא נשמרת כקובץ, ומצרפים אותה בוואטסאפ.</div>
    <div class="tw-actions">${[0, 1].map(w => `<button type="button" class="btn" data-tw-img="${w}">שבוע ${w + 1} <small>${twL(twShort(days[w * 7]) + '–' + twShort(days[w * 7 + 6]))}</small></button>`).join('')}</div>
    <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-tw-close>סגירה</button></div>`);
  sh.querySelectorAll('[data-tw-img]').forEach(b => b.addEventListener('click', async () => { sh.remove(); await twShareImage(Number(b.dataset.twImg)); }));
}
async function twShareImage(w){
  const days = twDays(TW.period).slice(w * 7, w * 7 + 7), cols = [['M', 'בוקר'], ['A', 'צהריים / סוף שבוע'], ['N', 'לילה']];
  const W = 1080, headH = 150, lineH = 34, pad = 22, colW = (W - 80 - 170) / 3, c = document.createElement('canvas'), g = c.getContext('2d');
  const names = (day, code) => {
    const sh = code === 'A' && twKind(day) === 'fri' ? 'W' : code;
    if(!twSlots(day).some(s => s.shift === sh)) return null;
    return TW.asg.filter(a => a.day === day && a.shift === sh).map(a => twName(a.person) + (a.from_time && a.to_time ? ` ${twNice(twHm(a.from_time))} עד ${twNice(twHm(a.to_time))}` : '')).sort((x, y) => x.localeCompare(y, 'he'));
  };
  const F = '400 25px Assistant, Arial';
  const wrapN = list => { g.font = F; const out = []; let cur = '';
    list.forEach(n => { const t = cur ? cur + ', ' + n : n; if(cur && g.measureText(t).width > colW - 16){ out.push(cur + ','); cur = n; } else cur = t; });
    if(cur) out.push(cur); return out; };
  const rows = days.map(d => { const cs = cols.map(([code]) => { const l = names(d, code); return l === null ? null : wrapN(l); });
    return { d, cs, h:Math.max(74, pad * 2 + (Math.max(1, ...cs.map(x => x ? x.length : 1)) + 1) * lineH - 6) }; });
  const H = headH + rows.reduce((t, r) => t + r.h, 0) + 40; c.width = W; c.height = H;
  g.direction = 'rtl'; g.textAlign = 'right'; g.fillStyle = '#FAF7F2'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2D2A24'; g.font = '600 44px Rubik, Assistant, Arial'; g.fillText(`סידור העבודה · שבוע ${w + 1}`, W - 40, 64);
  g.font = '400 30px Assistant, Arial'; g.fillStyle = '#6E675C'; g.fillText(`${twShort(days[0])} עד ${twShort(days[6])}`, W - 40, 108);
  g.font = '700 26px Assistant, Arial'; g.fillStyle = '#5C6F52'; cols.forEach(([, t], i) => g.fillText(t, W - 40 - 170 - i * colW, headH - 8));
  let y = headH;
  rows.forEach((r, i) => {
    g.fillStyle = i % 2 ? '#FFFFFF' : '#F4EFE7'; g.fillRect(30, y + 4, W - 60, r.h - 6);
    g.fillStyle = '#2D2A24'; g.font = '700 28px Assistant, Arial'; g.fillText(`${DOW_NAMES[dowOf(r.d)]} ${twShort(r.d)}`, W - 44, y + pad + 24);
    r.cs.forEach((x, ci) => { const xr = W - 40 - 170 - ci * colW; let ly = y + pad + 24; g.font = F; g.fillStyle = '#2D2A24';
      if(!x || !x.length){ g.fillStyle = '#9A9286'; g.fillText(x ? 'חסר שיבוץ' : '—', xr, ly); return; }
      x.forEach(t => { g.fillText(t, xr, ly); ly += lineH; });
      const sh = cols[ci][0] === 'A' && twKind(r.d) === 'fri' ? 'W' : cols[ci][0], sl = twSlots(r.d).find(s => s.shift === sh), n = sl ? sl.need - TW.asg.filter(a => a.day === r.d && a.shift === sh).length : 0;
      if(n > 0){ g.fillStyle = '#B5502F'; g.fillText(`חסר ${n}`, xr, ly); } });
    y += r.h;
  });
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const file = new File([blob], `schedule-${TW.period}-w${w + 1}.png`, { type:'image/png' });
  try { if(navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:'סידור העבודה' }); return; } } catch(e){ if(e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); toast('התמונה נשמרה. אפשר לצרף אותה בוואטסאפ.');
}

// ---- 5. dragging a name into the table, on a computer (Guy 19.11: as in the first site); on a phone a tap on the place does it
function twDragHtml(){
  return `<aside class="tw-drag" aria-label="גרירת שמות לטבלה"><b>גרירה לטבלה</b><small>גוררים שם למשבצת כדי לשבץ.</small>
    ${TW.people.filter(p => p.active).map(p => { const n = TW.asg.filter(a => a.person === p.id).length, q = p.per_week * 2;
      return `<span class="pchip tw-drag-chip${n === q ? ' full' : n > q ? ' over' : ''}" draggable="true" data-tw-drag="${p.id}">${twU(twDisp(p))} <small>${n} מתוך ${q}${n > q ? ` (+${n - q})` : ''}</small></span>`; }).join('')}</aside>`;
}
function twDragWire(box){
  box.querySelectorAll('[data-tw-drag]').forEach(ch => ch.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', ch.dataset.twDrag); e.dataTransfer.effectAllowed = 'copy'; }));
  box.querySelectorAll('td[data-tw-cell]').forEach(td => {
    td.addEventListener('dragover', e => { e.preventDefault(); td.classList.add('tw-drop'); });
    td.addEventListener('dragleave', () => td.classList.remove('tw-drop'));
    td.addEventListener('drop', async e => {
      e.preventDefault(); td.classList.remove('tw-drop');
      const pid = e.dataTransfer.getData('text/plain'), [day, shift] = td.dataset.twCell.split('|'); if(!pid || !twPerson(pid)) return;
      if(TW.asg.some(a => a.person === pid && a.day === day && a.shift === shift)){ toast(`${twName(pid)} כבר במשמרת הזו`, 4000); return; }
      const ks = TW.asg.filter(a => a.person === pid).map(a => twHandPair(pid, a.day, a.shift, day, shift, a)).reduce((w, x) => TW_HAND_RANK[x] > TW_HAND_RANK[w] ? x : w, '');
      const r = await sbPersonal.from('tw_assignment').insert({ period:TW.period, day, shift, person:pid, by_hand:true }).select();
      if(r.error){ console.error(r.error); toast('⚠ השיבוץ לא נשמר'); return; }
      TW.asg.push(r.data[0]); twKeepScroll();
      if(ks) toast(`${twName(pid)} שובצה. שימו לב: ${twHandWord(ks)}. זה יופיע ב"דורש תשומת לב".`, 5000);
      twUndo(`${twName(pid)} נוספה ל${TW_SHIFT[shift]} ${twShort(day)}`, async () => { const u = await sbPersonal.from('tw_assignment').delete().eq('id', r.data[0].id); if(u.error) return false; TW.asg = TW.asg.filter(a => a.id !== r.data[0].id); twKeepScroll(); return true; });
    });
  });
}

// the extras of step 3 and of a published schedule, wired once for the screen
function twPilotWire(box){
  box.querySelectorAll('[data-tw-goto]').forEach(b => b.addEventListener('click', () => twCellSheet(b.dataset.twGoto)));
  const at = box.querySelector('.tw-attn'); if(at) at.addEventListener('toggle', () => { TW.attnClosed = !at.open; });
  const aa = box.querySelector('#tw-attn-all'); if(aa) aa.addEventListener('click', () => { TW.attnAll = true; twKeepScroll(); });
  const cn = box.querySelector('[data-tw-counts]'); if(cn) cn.addEventListener('toggle', () => { TW.countsOpen = cn.open; });
  const sh = box.querySelector('#tw-share'); if(sh) sh.addEventListener('click', () => twShareAsk());
  twPendingWire(box);
  if(box.querySelector('.tw-drag')) twDragWire(box);
}

// ---- 6. my own settings, inside "הגדרות" of the product (Guy 19.11): the close pairs I agree to, the days I never come, how a new
// hand-in starts, which e-mails I get (all on at the start), my phone, and "משהו לא עובד?"
const TW_NOTIFY = [['reminder', 'תזכורת לפני סוף ההגשה, אם עוד לא הגשתי'], ['published', 'הסידור פורסם'], ['changed', 'משמרת שלי זזה או השתנתה'], ['swap', 'בקשת החלפה שמתאימה לי']];
function twMySettingsHtml(){
  if(!TW.me || !TW.prefsOn) return '';
  const pf = twPrefOf(TW.me.id) || {}, combos = pf.combos || [], off = pf.days_off || [], nt = Object.assign({ reminder:true, published:true, changed:true, swap:true }, pf.notify || {});
  const seg = (k, on) => `<div class="mx-seg" role="group"><button type="button" data-tw-nt="${k}" data-v="1" aria-pressed="${!!on}">דלוק</button><button type="button" data-tw-nt="${k}" data-v="" aria-pressed="${!on}">כבוי</button></div>`;
  return `<div class="sb-set-row"><b>משמרות צמודות שאני מוכנה לעבוד</b><div class="sb-help">צירוף שלא סימנת לא ישובץ לך.</div>
      ${Object.entries(TW_COMBO).map(([k, w]) => `<label class="tw-chk-l"><input type="checkbox" data-tw-combo="${k}"${combos.includes(k) ? ' checked' : ''}> ${w}</label>`).join('')}</div>
    <div class="sb-set-row"><b>ימים שאני לא באה בהם</b><div class="tw-days-off">${DOW_NAMES.map((d, i) => `<button type="button" class="btn ghost small" data-tw-off="${i}" aria-pressed="${off.includes(i)}">${d}</button>`).join('')}</div>
      <div class="sb-help">מי שבונה את הסידור רואה את זה ליד השם.</div></div>
    <div class="sb-set-row"><b>הגשה חדשה מתחילה</b><div class="mx-seg" role="group"><button type="button" data-tw-copy="" aria-pressed="${!pf.copy_last}">ריקה</button><button type="button" data-tw-copy="1" aria-pressed="${!!pf.copy_last}">מההגשה הקודמת שלי</button></div></div>
    <div class="sb-set-row"><b>התראות במייל</b><div class="sb-help">הכול דלוק מההתחלה. אפשר לכבות.</div></div>
    ${TW_NOTIFY.map(([k, w]) => `<div class="sb-set-row"><span>${w}</span>${seg(k, nt[k])}</div>`).join('')}
    <div class="sb-set-row"><b>הטלפון שלי</b><div class="tw-form"><input type="tel" id="tw-my-phone" dir="ltr" maxlength="20" autocomplete="tel" value="${pEsc(TW.phones[TW.me.id] || '')}" aria-label="הטלפון שלי"></div>
      <div class="sb-help">רק מי שבונה את הסידור והנהלה רואים אותו, כדי לשאול בוואטסאפ.</div></div>
    <div class="sb-set-row"><b>משהו לא עובד?</b><button type="button" class="btn ghost" id="tw-problem">דיווח על תקלה</button></div>`;
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
    <div class="confirm-actions"><button type="button" class="btn" id="tw-prob-go">שליחה</button><button type="button" class="btn ghost" id="tw-prob-back">חזרה להגדרות</button></div>`);
  sh.querySelector('#tw-prob-back').addEventListener('click', () => { sh.remove(); if(typeof sbSettings === 'function') sbSettings(); });
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
