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

// Green: report to the social worker. The instructor first marks which children were involved (any
// number); the number of each social worker who handles one of them lights up and blinks gently, so the
// right person is reached for without thinking. Nothing here is saved — it only guides the call.
let greenInvolved = new Set();
function openGreenScreen(){
  document.getElementById('green-message').textContent = PROGRAM.green.message;
  document.getElementById('green-response').textContent = PROGRAM.green.response;
  greenInvolved = new Set();
  document.getElementById('green-involved-panel').hidden = true;
  document.getElementById('green-involved-btn').setAttribute('aria-expanded', 'false');

  document.getElementById('green-involved-list').innerHTML = roster.map(c => `
    <label class="gi-row"><input type="checkbox" value="${c.id}"><span class="gi-box" aria-hidden="true"></span><span>${escapeHtml(displayName(c))}</span></label>`).join('')
    || '<div class="empty">אין ילדים ברשימה</div>';
  document.querySelectorAll('#green-involved-list input').forEach(cb => cb.addEventListener('change', () => {
    if(cb.checked) greenInvolved.add(cb.value); else greenInvolved.delete(cb.value);
    updateGreenSocialWorkers();
  }));

  // the social workers the roster defines (each once) — same wa.me link as before
  const workers = socialWorkers();
  const swEl = document.getElementById('green-sw-section');
  swEl.innerHTML = workers.length
    ? workers.map(w => `<a href="https://wa.me/${w.phone}" target="_blank" rel="noopener" class="guided-secondary sw-link" data-sw="${w.phone}">
        <span class="sw-name">דיווח לעו״סית ${escapeHtml(w.name)} בוואטסאפ</span><span class="sw-phone" dir="ltr">${formatPhone(w.phone)}</span></a>`).join('')
    : `<div class="guided-step-note">לא הוגדרו עו״סיות — ניתן להוסיף שם וטלפון במסך הניהול.</div>`;
  updateGreenSocialWorkers();
  showStaffScreen('green');
}
function updateGreenSocialWorkers(){
  const count = greenInvolved.size;
  document.getElementById('green-involved-count').textContent = count ? `נבחרו ${count}` : '';
  // which workers handle the chosen children (one child -> one worker; children of both -> both)
  const relevant = new Set(roster.filter(c => greenInvolved.has(c.id)).map(c => digitsOnly(c.swPhone)).filter(Boolean));
  document.querySelectorAll('#green-sw-section .sw-link').forEach(a => {
    a.classList.toggle('sw-highlight', relevant.has(a.dataset.sw));
    a.classList.toggle('sw-dim', relevant.size > 0 && !relevant.has(a.dataset.sw));
  });
}
document.getElementById('green-involved-btn').addEventListener('click', () => {
  const panel = document.getElementById('green-involved-panel');
  panel.hidden = !panel.hidden;
  document.getElementById('green-involved-btn').setAttribute('aria-expanded', String(!panel.hidden));
});
