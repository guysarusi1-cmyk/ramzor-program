// ---------- ADMIN MINI-LISTS: daily bonuses / duty roster ----------
async function getMiniList(key){
  const { data, error } = await sb.from('mini_lists').select('items').eq('key', key).maybeSingle();
  if(error || !data) return [];
  return data.items;
}
async function setMiniList(key, list){
  const { error } = await sb.from('mini_lists').upsert({key, items:list});
  if(error) console.error(error);
  return !error;
}

let bonusesDaily = [];
let bonusesWeekly = [];
let dutyRoster = [];

function wireMiniListManager(containerId, getList, setListFn, inputId, addBtnId){
  async function render(){
    const list = getList();
    const el = document.getElementById(containerId);
    if(!list.length){ el.innerHTML = '<div class="empty">הרשימה ריקה</div>'; return; }
    el.innerHTML = list.map(item => `<div class="row" data-id="${item.id}"><span>${item.text}</span><button class="rm-mini">✕</button></div>`).join('');
    el.querySelectorAll('.rm-mini').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.closest('.row').dataset.id;
        const newList = getList().filter(x=>x.id!==id);
        if(!(await setListFn(newList))){ toast('השמירה נכשלה — בדקו חיבור ונסו שוב'); return; }
        render();
      });
    });
  }
  document.getElementById(addBtnId).onclick = async ()=>{
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if(!text) return;
    const newList = [...getList(), {id: uid(), text}];
    if(!(await setListFn(newList))){ toast('השמירה נכשלה — בדקו חיבור ונסו שוב'); return; }
    input.value = '';
    render();
  };
  return render;
}

// ---- full bonus editor: text, days of the week, and the hours in which the TV highlights the bonus
const DAY_LETTERS = [ ['א',0], ['ב',1], ['ג',2], ['ד',3], ['ה',4], ['ו',5], ['ש',6] ]; // value = Date.getDay()
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function bonusSummary(b){
  const days = (b.days && b.days.length) ? 'ימים: ' + DAY_LETTERS.filter(d => b.days.includes(d[1])).map(d => d[0]).join(' ') : 'כל יום';
  const hours = (b.startTime && b.endTime) ? `${b.startTime}–${b.endTime}` : 'ללא שעות';
  return `${days} · ${hours}`;
}
function wireBonusEditor(containerId, getList, setListFn, inputId, addBtnId){
  let openId = null;
  function render(){
    const list = getList();
    const el = document.getElementById(containerId);
    if(!list.length){ el.innerHTML = '<div class="empty">הרשימה ריקה</div>'; return; }
    el.innerHTML = list.map(b => {
      const open = b.id === openId;
      const editor = !open ? '' : `
        <div class="bonus-editor">
          <label class="be-label">טקסט הבונוס</label>
          <input type="text" class="be-text" value="${escapeHtml(b.text)}">
          <label class="be-label">באילו ימים (בלי סימון = כל יום)</label>
          <div class="be-days">${DAY_LETTERS.map(d => `<label class="be-day"><input type="checkbox" value="${d[1]}"${(b.days||[]).includes(d[1]) ? ' checked' : ''}><span>${d[0]}</span></label>`).join('')}</div>
          <label class="be-label">שעות (המסך יבליט את הבונוס בזמן הזה; בלי שעות — בלי הדגשה)</label>
          <div class="be-times"><input type="time" class="be-start" value="${b.startTime || ''}"><span>עד</span><input type="time" class="be-end" value="${b.endTime || ''}"></div>
          <div class="be-actions">
            <button type="button" class="btn be-save">שמירה</button>
            <button type="button" class="btn ghost be-cancel">ביטול</button>
            <button type="button" class="btn ghost be-delete">מחיקה</button>
          </div>
        </div>`;
      return `<div class="bonus-row${open ? ' open' : ''}" data-id="${b.id}">
        <button type="button" class="bonus-row-head">
          <span class="bonus-row-text">${escapeHtml(b.text)}</span>
          <span class="bonus-row-sub">${bonusSummary(b)}</span>
        </button>${editor}</div>`;
    }).join('');
    el.querySelectorAll('.bonus-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.bonus-row-head').addEventListener('click', () => { openId = (openId === id) ? null : id; render(); });
      const save = row.querySelector('.be-save');
      if(!save) return;
      row.querySelector('.be-cancel').addEventListener('click', () => { openId = null; render(); });
      row.querySelector('.be-delete').addEventListener('click', async () => {
        if(!confirm('למחוק את הבונוס הזה?')) return;
        if(!(await setListFn(getList().filter(x => x.id !== id)))){ toast('המחיקה נכשלה — בדקו חיבור ונסו שוב'); return; }
        openId = null;
        render();
      });
      save.addEventListener('click', async () => {
        const text = row.querySelector('.be-text').value.trim();
        const days = [...row.querySelectorAll('.be-days input:checked')].map(i => Number(i.value));
        const startTime = row.querySelector('.be-start').value;
        const endTime = row.querySelector('.be-end').value;
        if(!text){ toast('חסר טקסט לבונוס'); return; }
        if(!!startTime !== !!endTime){ toast('צריך למלא גם שעת התחלה וגם שעת סיום (או לנקות את שתיהן)'); return; }
        if(startTime && endTime <= startTime){ toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה'); return; }
        const updated = getList().map(x => {
          if(x.id !== id) return x;
          const n = { id: x.id, text };
          if(days.length) n.days = days;
          if(startTime && endTime){ n.startTime = startTime; n.endTime = endTime; }
          return n;
        });
        if(!(await setListFn(updated))){ toast('השמירה נכשלה — בדקו חיבור ונסו שוב'); return; }
        openId = null;
        render();
        toast('הבונוס נשמר');
      });
    });
  }
  document.getElementById(addBtnId).onclick = async () => {
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if(!text) return;
    const item = { id: uid(), text };
    if(!(await setListFn([...getList(), item]))){ toast('ההוספה נכשלה — בדקו חיבור ונסו שוב'); return; }
    input.value = '';
    openId = item.id;        // straight into the editor, to set days / hours
    render();
  };
  return render;
}

let renderBonusesDailyList, renderBonusesWeeklyList, renderDutyRosterList;

async function initMiniLists(){
  bonusesDaily = await getMiniList('bonusesDaily');
  bonusesWeekly = await getMiniList('bonusesWeekly');
  dutyRoster = await getMiniList('dutyRoster');
  await loadChildSettings();

  renderBonusesDailyList = wireBonusEditor('bonuses-daily-list', ()=>bonusesDaily, async(l)=>{ const ok = await setMiniList('bonusesDaily', l); if(ok) bonusesDaily=l; return ok; }, 'new-bonus-daily', 'add-bonus-daily-btn');
  renderBonusesWeeklyList = wireBonusEditor('bonuses-weekly-list', ()=>bonusesWeekly, async(l)=>{ const ok = await setMiniList('bonusesWeekly', l); if(ok) bonusesWeekly=l; return ok; }, 'new-bonus-weekly', 'add-bonus-weekly-btn');
  renderDutyRosterList = wireMiniListManager('duty-roster-list', ()=>dutyRoster, async(l)=>{ const ok = await setMiniList('dutyRoster', l); if(ok) dutyRoster=l; return ok; }, 'new-duty-item', 'add-duty-item-btn');

  renderBonusesDailyList();
  renderBonusesWeeklyList();
  renderDutyRosterList();
}

