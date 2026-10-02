// ---------- ROSTER (management) ----------
function renderManageRoster(){
  const el = document.getElementById('roster-list');
  if(!roster.length){ el.innerHTML = '<div class="empty">אין עדיין ילדים ברשימה</div>'; return; }
  el.innerHTML = roster.map(c => `
    <span class="chip">${displayName(c)} <button class="rm" data-id="${c.id}">✕</button></span>
  `).join('');
  el.querySelectorAll('.rm').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const child = roster.find(c => c.id === btn.dataset.id);
      const ok = confirm(`למחוק את ${child ? displayName(child) : 'הילד/ה'}? הפעולה תמחק גם את הנתונים שלו/ה (כוכבים, התקדמות בירח).`);
      if(!ok) return;
      const { error } = await sb.from('roster').delete().eq('id', btn.dataset.id);
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
  const firstName = nameInput.value.trim();
  const lastInitial = initInput.value.trim();
  const age = ageInput.value.trim();
  const swName = swNameInput.value.trim();
  const swPhone = swPhoneInput.value.trim();
  if(!firstName) return;
  const newChild = {id: uid(), firstName, lastInitial, age, swName, swPhone};
  const { error } = await sb.from('roster').insert({
    id:newChild.id, first_name:firstName, last_initial:lastInitial, age, sw_name:swName, sw_phone:swPhone
  });
  if(error){ toast('שגיאה בהוספת ילד/ה'); console.error(error); return; }
  roster.push(newChild);
  nameInput.value = '';
  initInput.value = '';
  ageInput.value = '';
  swNameInput.value = '';
  swPhoneInput.value = '';
  renderManageRoster();
});

