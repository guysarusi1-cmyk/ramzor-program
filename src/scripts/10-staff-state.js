// ---------- STAFF VIEW: state machine ----------
function showStaffScreen(name){
  ['pick','guided','green','gold'].forEach(s=>{
    document.getElementById('staff-screen-'+s).style.display = (s===name) ? 'block' : 'none';
  });
  // the guided red protocol is used live in front of a child on a phone, so it drops the page
  // header above it (see .guided-focus CSS) to put the action on the first screen
  document.getElementById('protected-app').classList.toggle('guided-focus', ['guided','green','gold'].includes(name));
}
document.querySelectorAll('.back-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> showStaffScreen(btn.dataset.back));
});

// Gold comes first on purpose: it isn't another step in the red→green sequence but a separate
// category for behaviour that goes beyond what's expected. Used by every full-traffic-light list
// in daily operations so they always agree.
const DAILY_OPS_LIGHT_ORDER = ['gold','red','orange','yellow','green'];

// Entry point of daily operations: the full traffic light, with no child involved. Each colour
// opens the same flow it opens everywhere else, just not tied to any particular child.
function openLightFlow(color){
  selectedStaffChild = null;
  if(color === 'red' || color === 'orange' || color === 'yellow'){
    openGuidedScreen(color);
  } else if(color === 'green'){
    openGreenScreen();
  } else if(color === 'gold'){
    openGoldScreen();
  }
}

function renderQuickLightRows(){
  const el = document.getElementById('quick-light-rows');
  el.innerHTML = DAILY_OPS_LIGHT_ORDER.map(color => {
    const p = PROGRAM[color];
    return `
      <button type="button" class="quick-light-row" data-quick="${color}">
        <span class="qcol qtitle">
          <span class="col-label">מהות</span>
          ${p.title}
        </span>
        <span class="bulb ${color}"></span>
        <span class="qcol qresp">
          <span class="col-label">תגובה</span>
          ${p.response}
        </span>
      </button>`;
  }).join('');
  el.querySelectorAll('[data-quick]').forEach(row=>{
    row.addEventListener('click', ()=> openLightFlow(row.dataset.quick));
  });
}
renderQuickLightRows();
// Gold has no steps: its screen just offers the same three actions the kids-screen control area
// has under gold, and each one hands over to that area's own button (same screen, same logic).
function openGoldScreen(){
  showStaffScreen('gold');
}
function openKidsQuickFrom(buttonId, origin){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-kids-quick').classList.add('active');
  kidsQuickShowColorPicker();               // reset every sub-screen first
  document.getElementById(buttonId).click(); // the control area's own button does the real work
  kqOrigin = origin;                         // set AFTER the click: the button handlers reset it
}

function openGreenScreen(){
  document.getElementById('green-message').textContent = PROGRAM.green.message;
  document.getElementById('green-response').textContent = PROGRAM.green.response;

  // no child is chosen here, so offer the WhatsApp report to each social worker that the roster
  // defines (each distinct worker once) — same wa.me link as before, the instructor picks the right one
  const workers = [];
  roster.forEach(c => {
    const phone = (c.swPhone || '').replace(/[^0-9]/g,'');
    if(c.swName && phone && !workers.some(w => w.phone === phone)) workers.push({ name:c.swName, phone });
  });
  const swEl = document.getElementById('green-sw-section');
  swEl.innerHTML = workers.length
    ? workers.map(w => `<a href="https://wa.me/${w.phone}" target="_blank" rel="noopener" class="guided-secondary" style="margin-bottom:10px;">דיווח לעו״סית ${w.name} בוואטסאפ</a>`).join('')
    : `<div class="guided-step-note">לא הוגדרו עו״סיות — ניתן להוסיף שם וטלפון במסך הניהול.</div>`;
  showStaffScreen('green');
}
