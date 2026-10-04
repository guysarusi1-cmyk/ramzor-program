// ---------- KIDS QUICK ACCESS (הענקת כוכב / תכנית המסע בחלל / רמזור צהוב) ----------
let kidsQuickMode = null; // 'star' | 'moon' | 'yellow'
let starTapLocked = false;

const KIDS_QUICK_TITLES = {
  star: 'בחרו ילד/ה — הענקת כוכב',
  moon: 'בחרו ילד/ה — המסע בחלל',
  brick: 'בחרו ילד/ה — המקדש שלי',
  yellow: 'בחרו ילד/ה — רמזור צהוב',
};

function kidsQuickShowColorPicker(){
  document.getElementById('kids-quick-pick-color').style.display = 'block';
  document.getElementById('kids-quick-pick-child').style.display = 'none';
  document.getElementById('kids-quick-moon-panel').style.display = 'none';
  document.getElementById('kids-quick-yellow-intro').style.display = 'none';
  document.getElementById('kids-quick-yellow-list').style.display = 'none';
}

function kidsQuickShowChildPicker(mode){
  kidsQuickMode = mode;
  document.getElementById('kids-quick-pick-color').style.display = 'none';
  document.getElementById('kids-quick-pick-child').style.display = 'block';
  document.getElementById('kids-quick-moon-panel').style.display = 'none';
  document.getElementById('kids-quick-yellow-list').style.display = 'none';
  document.getElementById('kids-quick-child-title').textContent = KIDS_QUICK_TITLES[mode] || 'בחרו ילד/ה';
  const el = document.getElementById('kids-quick-roster');
  if(!roster.length){ el.innerHTML = '<div class="empty">אין ילדים ברשימה</div>'; return; }
  el.innerHTML = roster.map(c => `<span class="chip" data-id="${c.id}">${displayName(c)}</span>`).join('');
  el.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', async ()=>{
      selectedStaffChild = chip.dataset.id;
      if(kidsQuickMode === 'star'){
        // a quick double tap must not hand out two stars (each tap would read the same old total)
        if(starTapLocked) return;
        starTapLocked = true;
        try { await giveStar(selectedStaffChild); }
        finally { setTimeout(() => { starTapLocked = false; }, 800); }
      } else if(kidsQuickMode === 'brick'){
        if(starTapLocked) return;                      // one tap, one brick
        const kid = roster.find(c => c.id === selectedStaffChild);
        const strength = await askBrickStrength(kid);  // first: which strength did you see? (null = changed their mind)
        if(strength === null || starTapLocked) return;
        starTapLocked = true;
        try { await giveBrick(selectedStaffChild, strength); }
        finally { setTimeout(() => { starTapLocked = false; }, 800); }
      } else if(kidsQuickMode === 'moon'){
        document.getElementById('kids-quick-pick-child').style.display = 'none';
        document.getElementById('kids-quick-moon-panel').style.display = 'block';
        await renderMoonPanel('kids-quick-moon-feedback');
      } else if(kidsQuickMode === 'yellow'){
        document.getElementById('kids-quick-pick-child').style.display = 'none';
        document.getElementById('kids-quick-yellow-list').style.display = 'block';
        renderYellowScreen({
          title: 'kq-yellow-title-headline', protocol: 'kq-yellow-protocol-list', childTitle: 'kq-yellow-childname-title',
          dailyList: 'kq-yellow-bonus-daily-list', weeklyList: 'kq-yellow-bonus-weekly-list', dutyList: 'kq-yellow-duty-list'
        });
      }
    });
  });
}

document.getElementById('hub-kids-btn').addEventListener('click', async ()=>{
  if(!roster.length) await initRoster();
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-kids-quick').classList.add('active');
  kidsQuickShowColorPicker();
});
document.getElementById('kq-give-star-btn').addEventListener('click', ()=>{ kqOrigin = null; kidsQuickShowChildPicker('star'); });
document.getElementById('kq-moon-journey-btn').addEventListener('click', ()=>{ kqOrigin = null; kidsQuickShowChildPicker('moon'); });
document.getElementById('kq-brick-btn').addEventListener('click', ()=>{ kqOrigin = null; kidsQuickShowChildPicker('brick'); });
// the daily-operations gold screen reaches those same two buttons (see openKidsQuickFrom)
document.getElementById('gold-give-star-btn').addEventListener('click', ()=> openKidsQuickFrom('kq-give-star-btn', 'gold'));
document.getElementById('gold-moon-journey-btn').addEventListener('click', ()=> openKidsQuickFrom('kq-moon-journey-btn', 'gold'));
document.getElementById('gold-brick-btn').addEventListener('click', ()=> openKidsQuickFrom('kq-brick-btn', 'gold'));
document.getElementById('kids-quick-back-to-color').addEventListener('click', ()=>{
  if(kidsQuickMode === 'yellow'){
    document.getElementById('kids-quick-pick-child').style.display = 'none';
    document.getElementById('kids-quick-yellow-intro').style.display = 'block';
  } else if(kqOrigin === 'gold'){
    kqOrigin = null;
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-staff').classList.add('active');
    showStaffScreen('gold');
  } else {
    kidsQuickShowColorPicker();
  }
});
document.getElementById('kids-quick-back-to-children').addEventListener('click', ()=> kidsQuickShowChildPicker(kidsQuickMode));
document.getElementById('kids-quick-back-to-hub').addEventListener('click', showHub);

// the "גריעת בונוס" action itself — shared by the control area's own button and by the last step of
// the guided yellow protocol, so both reach exactly the same screen
let kqOrigin = null; // 'protocol' when entered from the guided yellow protocol (back returns there)
function kidsQuickOpenRevokeIntro(){
  document.getElementById('kids-quick-pick-color').style.display = 'none';
  document.getElementById('kids-quick-yellow-intro').style.display = 'block';
  document.getElementById('kq-yellow-protocol').innerHTML = yellowReminderHtml();
}
document.getElementById('kq-revoke-bonus-btn').addEventListener('click', ()=>{
  kqOrigin = null;
  kidsQuickOpenRevokeIntro();
});
document.getElementById('kids-quick-yellow-intro-back').addEventListener('click', ()=>{
  if(kqOrigin === 'protocol'){
    kqOrigin = null;
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-staff').classList.add('active');
    showStaffScreen('guided');
  } else {
    kidsQuickShowColorPicker();
  }
});
document.getElementById('kq-pick-child-for-revoke-btn').addEventListener('click', ()=>{
  document.getElementById('kids-quick-yellow-intro').style.display = 'none';
  kidsQuickShowChildPicker('yellow');
});
document.getElementById('kids-quick-yellow-list-back').addEventListener('click', ()=> kidsQuickShowChildPicker('yellow'));

