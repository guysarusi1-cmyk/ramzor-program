
// ---------- THE KIDS' DUTY BOARD (scheduling-v39.sql; Guy 2026-10-26) ----------
// The kids from age 5 share all the duties every week. The week is drawn on the night between Saturday and Sunday (the first time anybody
// asks for the board in a new week: duty_board), so that every kid goes through all the duties before doing one again. Shown on the kids' TV
// (a slide of its own), in the yellow Ramzor under the bonuses, and changed in the ahmash control (the duties, who does what, drawing again).
let dutyBoard = null, dutyBoardAt = 0;
async function loadDutyBoard(force){
  if(!force && dutyBoard && Date.now() - dutyBoardAt < 5 * 60 * 1000) return dutyBoard;
  dutyBoardAt = Date.now();
  try { const r = await sb.rpc('duty_board'); if(!r.error) dutyBoard = r.data; } catch(e){ /* keep the last one */ }
  return dutyBoard;
}
const dutyKid = id => (typeof roster !== 'undefined' ? roster : []).find(c => c.id === id);
const dutyHas = b => !!(b && (b.duties || []).some(d => (d.children || []).length));
// the board as cards, a duty each, with its kids (me: the child of the yellow Ramzor, marked)
function dutyBoardHtml(b, me){
  if(!dutyHas(b)) return '<div class="empty">אין עדיין לוח תורנויות לשבוע הזה</div>';
  return `<div class="duty-board">${b.duties.filter(d => (d.children || []).length).map(d => `<div class="duty-card${(d.children || []).includes(me) ? ' mine' : ''}">
      <div class="duty-name">${escapeHtml(d.name)}</div>
      <div class="duty-kids">${d.children.map(id => { const c = dutyKid(id); return c ? `<span class="duty-kid${id === me ? ' me' : ''}">${typeof avatarHtml === 'function' ? avatarHtml(c, 'duty-av') : ''}<span>${escapeHtml(displayName(c))}</span></span>` : ''; }).join('')}</div>
    </div>`).join('')}</div>`;
}
// the yellow Ramzor of one child: her duty this week first, then the whole board
async function renderDutyForChild(el, childId){
  if(!el) return;
  el.innerHTML = '<div class="empty">רק רגע...</div>';
  const b = await loadDutyBoard(), mine = b && (b.duties || []).find(d => (d.children || []).includes(childId));
  if(!el.isConnected) return;
  el.innerHTML = `${mine ? `<div class="duty-mine">התורנות השבוע: <b>${escapeHtml(mine.name)}</b></div>` : ''}${dutyBoardHtml(b, childId)}`;
}

// ---- the kids' TV: a slide of its own (slide-14), shown only when there is a board
async function renderDutySlide(){
  const el = document.getElementById('tv-duties'); if(!el) return;
  const b = await loadDutyBoard();
  el.innerHTML = `<div class="tvd-title">התורנויות השבוע</div>${dutyBoardHtml(b, null)}`;
}
if(typeof SLIDES !== 'undefined' && typeof PORTAL_ENABLED !== 'undefined' && PORTAL_ENABLED){
  while(SLIDES.length < 14) SLIDES.push({ id:SLIDES.length, label:'', render: async () => {}, hidden:true });          // (slide 13 is the space journey only where it is on)
  SLIDES.push({ id:14, label:'התורנויות השבוע', render: renderDutySlide, hidden:true });
  const dutyTick = () => loadDutyBoard(true).then(b => { if(SLIDES[14]) SLIDES[14].hidden = !dutyHas(b); });
  if(typeof IS_TV_PREVIEW === 'undefined' || !IS_TV_PREVIEW) setTimeout(dutyTick, 4000);
  setInterval(dutyTick, 10 * 60 * 1000);
}

// ---- the ahmash control: this week's board (who does what; moving a kid; drawing again) and the duties themselves
async function ctlDuties(box){
  const b = await loadDutyBoard(true);
  let duties = [];
  try { const r = await sbPersonal.from('duties').select('id,name,kids,sort,active').order('sort'); if(!r.error) duties = r.data || []; } catch(e){}
  if(!box.isConnected) return;
  const active = duties.filter(d => d.active);
  box.innerHTML = `
    <h3 class="psec">השבוע</h3>
    ${dutyHas(b) ? (b.duties || []).map(d => `<div class="ctl-duty"><b>${pEsc(d.name)}</b><span class="ctl-duty-kids">${(d.children || []).map(id => { const c = dutyKid(id); return c ? `<button type="button" class="btn ghost small" data-dkid="${pEsc(id)}" title="העברה לתורנות אחרת">${pEsc(displayName(c))}</button>` : ''; }).join('') || '<small>אין</small>'}</span></div>`).join('') : '<div class="pnote">אין עדיין לוח לשבוע הזה. מוסיפים תורנויות למטה, ואז "ערבוב מחדש".</div>'}
    <div class="ctl-duty-actions"><button type="button" class="btn ghost small" id="duty-reshuffle">ערבוב מחדש של השבוע</button></div>
    <div class="pnote">לחיצה על שם של ילד מעבירה אותו לתורנות אחרת. הלוח מתערבב מחדש לבד בלילה שבין שבת לראשון, וכל ילד עובר את כל התורנויות לפני שהוא חוזר על אחת מהן.</div>
    <h3 class="psec">התורנויות</h3>
    ${active.map(d => `<div class="ctl-duty"><b>${pEsc(d.name)}</b><span class="ctl-duty-kids"><small>${d.kids === 1 ? 'ילד אחד' : `${d.kids} ילדים`}</small><button type="button" class="btn ghost small" data-dedit="${d.id}">עריכה</button><button type="button" class="btn ghost small" data-ddel="${d.id}">הסרה</button></span></div>`).join('') || '<div class="pnote">אין תורנויות.</div>'}
    <div class="ctl-sp-add"><input type="text" id="duty-new-name" maxlength="80" placeholder="שם התורנות"><input type="number" id="duty-new-kids" min="1" max="10" value="1" aria-label="כמה ילדים"><button type="button" class="btn small" id="duty-add">הוספה</button></div>
    <div class="pnote">שינוי ברשימת התורנויות חל מהערבוב הבא (או מיד, ב"ערבוב מחדש").</div>`;
  const again = () => ctlDuties(box);
  box.querySelector('#duty-reshuffle').addEventListener('click', async () => {
    if(!(await confirmSheet({ title:'לערבב מחדש את השבוע?', text:'כל הילדים יקבלו תורנויות מחדש לשבוע הזה, גם מי שהועבר ידנית.', okLabel:'כן, לערבב', cancelLabel:'חזרה' }))) return;
    const r = await sbPersonal.rpc('duty_shuffle', { p_week:b ? b.week : null });
    toast(r.error ? 'הערבוב נכשל' : 'השבוע עורבב מחדש'); again();
  });
  box.querySelectorAll('[data-dkid]').forEach(x => x.addEventListener('click', () => {
    const id = x.dataset.dkid, c = dutyKid(id), cur = (b.duties || []).find(d => (d.children || []).includes(id));
    const sh = portalSheet(`<h2>לאיזו תורנות להעביר את ${pEsc(c ? displayName(c) : '')}?</h2><div class="ctl-icons duty-move">${active.filter(d => !cur || d.id !== cur.id).map(d => `<button type="button" class="btn ghost" data-dto="${d.id}">${pEsc(d.name)}</button>`).join('')}</div>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button></div>`);
    sh.querySelectorAll('[data-dto]').forEach(t => t.addEventListener('click', async () => {
      const u = await sbPersonal.from('duty_assign').upsert({ week:b.week, child_id:id, duty_id:t.dataset.dto, by_hand:true });
      sh.close(); toast(u.error ? 'ההעברה נכשלה' : 'הועבר'); again();
    }));
  }));
  box.querySelector('#duty-add').addEventListener('click', async () => {
    const name = box.querySelector('#duty-new-name').value.trim(), kids = Math.max(1, Math.min(10, parseInt(box.querySelector('#duty-new-kids').value, 10) || 1));
    if(!name){ toast('כתבו שם לתורנות'); return; }
    const u = await sbPersonal.from('duties').insert({ name, kids, sort:(duties.reduce((m, d) => Math.max(m, d.sort), 0) || 0) + 1 });
    toast(u.error ? 'ההוספה נכשלה' : 'התורנות נוספה'); again();
  });
  box.querySelectorAll('[data-dedit]').forEach(x => x.addEventListener('click', () => {
    const d = duties.find(y => y.id === x.dataset.dedit); if(!d) return;
    const sh = portalSheet(`<h2>עריכת תורנות</h2><label class="pfield">שם<input type="text" id="de-name" maxlength="80" value="${pEsc(d.name)}"></label><label class="pfield">כמה ילדים<input type="number" id="de-kids" min="1" max="10" value="${d.kids}"></label>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn ghost" id="de-go">שמירה</button></div>`);
    sh.querySelector('#de-go').addEventListener('click', async () => {
      const name = sh.querySelector('#de-name').value.trim(), kids = Math.max(1, Math.min(10, parseInt(sh.querySelector('#de-kids').value, 10) || 1));
      if(!name){ toast('כתבו שם לתורנות'); return; }
      const u = await sbPersonal.from('duties').update({ name, kids }).eq('id', d.id);
      sh.close(); toast(u.error ? 'השמירה נכשלה' : 'נשמר'); again();
    });
  }));
  box.querySelectorAll('[data-ddel]').forEach(x => x.addEventListener('click', async () => {
    const d = duties.find(y => y.id === x.dataset.ddel); if(!d) return;
    if(!(await confirmSheet({ title:`להסיר את "${d.name}"?`, text:'התורנות תרד מהלוח מהערבוב הבא. מה שהילדים כבר עשו נשאר בהיסטוריה.', okLabel:'כן, להסיר', cancelLabel:'חזרה', danger:true }))) return;
    const u = await sbPersonal.from('duties').update({ active:false }).eq('id', d.id);
    toast(u.error ? 'ההסרה נכשלה' : 'הוסרה'); again();
  }));
}
