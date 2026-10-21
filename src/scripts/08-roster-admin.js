// ---------- ROSTER (management) ----------

// Per-child settings that have no column of their own (so no change to the database is needed):
// kept as one list in the "childSettings" row of mini_lists, [{ id:<childId>, ship:<ship key> }].
let childSettings = {};
async function loadChildSettings(){
  childSettings = {};
  (await getMiniList('childSettings')).forEach(s => { childSettings[s.id] = s; });
}
async function saveChildShip(childId, shipKey){
  const updated = Object.assign({}, childSettings, { [childId]: Object.assign({}, childSettings[childId], { id: childId, ship: shipKey }) });
  const ok = await setMiniList('childSettings', Object.values(updated));
  if(ok) childSettings = updated;
  return ok;
}
// the child's character (see 12b-characters.js); '' takes it away
async function saveChildCharacter(childId, key){
  const patch = Object.assign({}, childSettings[childId], { id: childId });
  if(key) patch.character = key; else delete patch.character;
  const updated = Object.assign({}, childSettings, { [childId]: patch });
  const ok = await setMiniList('childSettings', Object.values(updated));
  if(ok) childSettings = updated;
  return ok;
}
// the ship picked in management, else the one the child always had before the picker existed
function shipFor(childId){
  const key = childSettings[childId] && childSettings[childId].ship;
  return (key && SHIP_OPTIONS[key]) || CHILD_SHIP[childId] || null;
}

// The social workers the roster defines (each distinct worker once), and the children each one handles.
const digitsOnly = s => String(s || '').replace(/[^0-9]/g, '');
function socialWorkers(){
  const list = [];
  roster.forEach(c => {
    const phone = digitsOnly(c.swPhone);
    if(c.swName && phone && !list.some(w => w.phone === phone)) list.push({ name: c.swName, phone });
  });
  return list;
}
// 972500000001 -> 050-0000001, the way it is dialled in Israel
function formatPhone(phone){
  const d = digitsOnly(phone);
  const local = d.startsWith('972') ? '0' + d.slice(3) : d;
  return local.length > 3 ? local.slice(0, 3) + '-' + local.slice(3) : local;
}
async function setChildSocialWorker(childId, worker){
  const child = roster.find(c => c.id === childId);
  const client = await adminClient(); if(!client) return false;
  const { error } = await client.from('roster').update({ sw_name: worker ? worker.name : '', sw_phone: worker ? worker.phone : '' }).eq('id', childId);
  if(error){ console.error(error); return false; }
  child.swName = worker ? worker.name : ''; child.swPhone = worker ? worker.phone : '';
  return true;
}
// Mercury: the responsible therapist of every child, chosen next to the child (scheduling-v31.sql). null = not read yet, false = not available here
let rosterTh = null;
async function loadRosterTherapists(){
  const client = (typeof ramzorPersonal !== 'undefined' && ramzorPersonal) ? sb : (MANAGER_LOGIN && typeof sbAdmin !== 'undefined' ? sbAdmin : sb);
  try {
    const [a, s, p] = await Promise.all([client.from('child_therapist').select('child_id,staff_id'), client.from('staff').select('id,display_name,kind,active'), client.from('staff_private').select('staff_id,is_therapist')]);
    if(a.error || s.error || p.error) throw (a.error || s.error || p.error);
    const flag = {}; (p.data || []).forEach(r => { flag[r.staff_id] = !!r.is_therapist; });
    const map = {}; (a.data || []).forEach(r => { map[r.child_id] = r.staff_id; });
    rosterTh = { map, list:(s.data || []).filter(x => x.active && (x.kind === 'therapist' || flag[x.id])).sort((x, y) => String(x.display_name).localeCompare(String(y.display_name), 'he')) };
  } catch(e){ rosterTh = false; }
}
async function setChildTherapist(childId, staffId){
  const client = (typeof ramzorPersonal !== 'undefined' && ramzorPersonal) ? sb : await adminClient(); if(!client) return false;
  const r = staffId ? await client.from('child_therapist').upsert({ child_id:childId, staff_id:staffId }) : await client.from('child_therapist').delete().eq('child_id', childId);
  if(r.error){ console.error(r.error); return false; }
  if(staffId) rosterTh.map[childId] = staffId; else delete rosterTh.map[childId];
  return true;
}
let shipPickerOpenFor = null;
let charPickerOpenFor = null;
function renderManageRoster(){
  const el = document.getElementById('roster-list');
  if(!roster.length){ el.innerHTML = '<div class="empty">אין עדיין ילדים ברשימה</div>'; return; }
  if(rosterTh === null){ rosterTh = undefined; loadRosterTherapists().then(() => { if(rosterTh) renderManageRoster(); }); }          // (read once; the list shows at once and the therapist choice joins it)
  el.innerHTML = roster.map(c => {
    const ship = shipFor(c.id);
    const picker = c.id !== shipPickerOpenFor ? '' : `
      <div class="ship-picker">
        <div class="be-label">בחירת חללית ל${escapeHtml(displayName(c))}</div>
        <div class="ship-grid">${Object.keys(SHIP_OPTIONS).map(k => `
          <button type="button" class="ship-option${SHIP_OPTIONS[k] === ship ? ' selected' : ''}" data-ship="${k}"><img src="${SHIP_OPTIONS[k]}" alt=""></button>`).join('')}
        </div>
      </div>`;
    const ck = characterFor(c.id);
    const takenBy = {}; roster.forEach(o => { const k = characterFor(o.id); if(k && o.id !== c.id) takenBy[k] = displayName(o); });
    const charPicker = c.id !== charPickerOpenFor ? '' : `
      <div class="char-picker">
        <div class="be-label">בחירת דמות ל${escapeHtml(displayName(c))}</div>
        <div class="char-grid">${CHARACTER_KEYS.map(k => `
          <button type="button" class="char-option${k === ck ? ' selected' : ''}${takenBy[k] ? ' taken' : ''}" data-char="${k}"${takenBy[k] ? ` disabled title="${escapeHtml(takenBy[k])}"` : ''} aria-label="${escapeHtml(CHARACTERS[k].label)}">${charImgHtml(k)}</button>`).join('')}
        </div>
        ${ck ? '<button type="button" class="btn ghost char-none" data-char="">בלי דמות</button>' : ''}
      </div>`;
    return `
      <div class="roster-row" data-id="${c.id}">
        <button type="button" class="roster-ship" data-ship-for="${c.id}" aria-label="בחירת חללית">${ship ? `<img src="${ship}" alt="">` : '🚀'}</button>
        <button type="button" class="roster-char" data-char-for="${c.id}" aria-label="בחירת דמות">${ck ? charImgHtml(ck) : '🙂'}</button>
        <span class="roster-name">${escapeHtml(displayNameWithAge(c))}</span>
        <select class="roster-sw" data-sw-for="${c.id}" aria-label="עו״סית של ${escapeHtml(displayName(c))}">
          <option value="">ללא עו״סית</option>
          ${socialWorkers().map(w => `<option value="${w.phone}"${digitsOnly(c.swPhone) === w.phone ? ' selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
        </select>
        ${rosterTh ? `<select class="roster-th" data-th-for="${c.id}" aria-label="איש/אשת הטיפול של ${escapeHtml(displayName(c))}"><option value="">ללא איש טיפול</option>${rosterTh.list.map(x => `<option value="${x.id}"${rosterTh.map[c.id] === x.id ? ' selected' : ''}>${escapeHtml(x.display_name)}</option>`).join('')}</select>` : ''}
        <button type="button" class="rm" data-id="${c.id}" aria-label="מחיקה">✕</button>
      </div>${picker}${charPicker}`;
  }).join('');
  el.querySelectorAll('.roster-char').forEach(btn => {
    btn.addEventListener('click', () => { charPickerOpenFor = (charPickerOpenFor === btn.dataset.charFor) ? null : btn.dataset.charFor; shipPickerOpenFor = null; renderManageRoster(); });
  });
  el.querySelectorAll('[data-char]').forEach(opt => {
    opt.addEventListener('click', async () => {
      const childId = charPickerOpenFor; charPickerOpenFor = null;
      const ok = await saveChildCharacter(childId, opt.dataset.char);
      renderManageRoster();
      toast(ok ? 'הדמות נשמרה' : 'השמירה נכשלה — בדקו חיבור ונסו שוב');
    });
  });

  el.querySelectorAll('.roster-th').forEach(sel => {
    sel.addEventListener('change', async () => {
      const ok = await setChildTherapist(sel.dataset.thFor, sel.value || null);
      toast(ok ? 'איש/אשת הטיפול עודכנו' : 'השמירה נכשלה — בדקו חיבור ונסו שוב');
      renderManageRoster();
    });
  });
  el.querySelectorAll('.roster-sw').forEach(sel => {
    sel.addEventListener('change', async () => {
      const worker = socialWorkers().find(w => w.phone === sel.value) || null;
      const ok = await setChildSocialWorker(sel.dataset.swFor, worker);
      toast(ok ? 'העו״סית עודכנה' : 'השמירה נכשלה — בדקו חיבור ונסו שוב');
      renderManageRoster();
    });
  });
  el.querySelectorAll('.roster-ship').forEach(btn => {
    btn.addEventListener('click', () => {
      shipPickerOpenFor = (shipPickerOpenFor === btn.dataset.shipFor) ? null : btn.dataset.shipFor;
      renderManageRoster();
    });
  });
  el.querySelectorAll('.ship-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const childId = shipPickerOpenFor;
      shipPickerOpenFor = null;
      const ok = await saveChildShip(childId, opt.dataset.ship);
      renderManageRoster();
      toast(ok ? 'החללית נשמרה' : 'השמירה נכשלה — בדקו חיבור ונסו שוב');
    });
  });
  el.querySelectorAll('.rm').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const child = roster.find(c => c.id === btn.dataset.id);
      const ok = await confirmSheet({ title:`למחוק את ${child ? displayName(child) : 'הילד/ה'}?`, text:'הפעולה תמחק גם את הנתונים של הילד/ה (כוכבים, התקדמות בירח) ואי אפשר לבטל אותה.', typeWord:'מחיקה', okLabel:'למחוק', danger:true });
      if(!ok) return;
      const client = await adminClient(); if(!client){ toast('נדרשת סיסמת מנהל'); return; }
      const { error } = await client.from('roster').delete().eq('id', btn.dataset.id);
      if(error){ toast('שגיאה במחיקה'); console.error(error); return; }
      roster = roster.filter(c => c.id !== btn.dataset.id);
      renderManageRoster();
    });
  });
}

document.getElementById('add-child-btn').addEventListener('click', async ()=>{
  const nameInput = document.getElementById('new-child-name');
  const initInput = document.getElementById('new-child-lastinit');
  const ageInput = document.getElementById('new-child-age');
  const swNameInput = document.getElementById('new-child-swname');
  const swPhoneInput = document.getElementById('new-child-swphone');
  const stageInput = document.getElementById('new-child-stage');
  const firstName = nameInput.value.trim();
  const lastInitial = initInput.value.trim();
  const age = ageInput.value.trim();
  const swName = swNameInput.value.trim();
  const swPhone = swPhoneInput.value.trim();
  if(!firstName){ toast('כתבו קודם שם פרטי'); nameInput.focus(); return; }
  const newChild = {id: uid(), firstName, lastInitial, age, swName, swPhone};
  const client = await adminClient(); if(!client){ toast('נדרשת סיסמת מנהל'); return; }
  const { error } = await client.from('roster').insert({
    id:newChild.id, first_name:firstName, last_initial:lastInitial, age, sw_name:swName, sw_phone:swPhone
  });
  if(error){ toast('שגיאה בהוספת ילד/ה'); console.error(error); return; }
  // where the child starts: the moon journey from its first step, or already on the way to the word planet
  const startsOnMercury = stageInput.value === 'mercury';
  await setChildState(newChild.id, { stars:0, moonSteps: startsOnMercury ? 7 : 0, moonGifts:0, mercurySteps:0, moonDayDate:null, moonDayStatus:null });
  roster.push(newChild);
  nameInput.value = '';
  initInput.value = '';
  ageInput.value = '';
  swNameInput.value = '';
  swPhoneInput.value = '';
  stageInput.value = 'moon';
  renderManageRoster();
  toast(`${displayName(newChild)} נוסף/ה`);
});
