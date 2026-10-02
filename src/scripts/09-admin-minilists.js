// ---------- ADMIN MINI-LISTS: daily bonuses / duty roster ----------
async function getMiniList(key){
  const { data, error } = await sb.from('mini_lists').select('items').eq('key', key).maybeSingle();
  if(error || !data) return [];
  return data.items;
}
async function setMiniList(key, list){
  const { error } = await sb.from('mini_lists').update({items:list}).eq('key', key);
  if(error) console.error(error);
}

let bonusesDaily = [];
let bonusesWeekly = [];
let dutyRoster = [];

function miniListRow(text, onRemove){
  return `<div class="row"><span>${text}</span><button class="rm-mini">✕</button></div>`;
}
function wireMiniListManager(containerId, getList, setListFn, inputId, addBtnId, renderExtra){
  async function render(){
    const list = getList();
    const el = document.getElementById(containerId);
    if(!list.length){ el.innerHTML = '<div class="empty">הרשימה ריקה</div>'; return; }
    el.innerHTML = list.map(item => `<div class="row" data-id="${item.id}"><span>${item.text}</span><button class="rm-mini">✕</button></div>`).join('');
    el.querySelectorAll('.rm-mini').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.closest('.row').dataset.id;
        const newList = getList().filter(x=>x.id!==id);
        await setListFn(newList);
        render();
        if(renderExtra) renderExtra();
      });
    });
  }
  document.getElementById(addBtnId).addEventListener('click', async ()=>{
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if(!text) return;
    const newList = [...getList(), {id: uid(), text}];
    await setListFn(newList);
    input.value = '';
    render();
    if(renderExtra) renderExtra();
  });
  return render;
}

let renderBonusesDailyList, renderBonusesWeeklyList, renderDutyRosterList;

async function initMiniLists(){
  bonusesDaily = await getMiniList('bonusesDaily');
  bonusesWeekly = await getMiniList('bonusesWeekly');
  dutyRoster = await getMiniList('dutyRoster');

  renderBonusesDailyList = wireMiniListManager('bonuses-daily-list', ()=>bonusesDaily, async(l)=>{bonusesDaily=l; await setMiniList('bonusesDaily', l);}, 'new-bonus-daily', 'add-bonus-daily-btn');
  renderBonusesWeeklyList = wireMiniListManager('bonuses-weekly-list', ()=>bonusesWeekly, async(l)=>{bonusesWeekly=l; await setMiniList('bonusesWeekly', l);}, 'new-bonus-weekly', 'add-bonus-weekly-btn');
  renderDutyRosterList = wireMiniListManager('duty-roster-list', ()=>dutyRoster, async(l)=>{dutyRoster=l; await setMiniList('dutyRoster', l);}, 'new-duty-item', 'add-duty-item-btn');

  renderBonusesDailyList();
  renderBonusesWeeklyList();
  renderDutyRosterList();
}

