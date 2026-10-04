
// ---------- MANAGEMENT CODE ----------
// The management screen can delete children and reset the boards, so it asks for a separate code before it
// opens (once set; it stays open for 10 minutes of this session). The code is kept as a salted, slow hash in
// the "managerLock" list. Honest limit: it stops mistakes and curiosity among staff who share the staff
// password; it is not a security boundary (that would be a separate login in the database).
const MANAGEMENT_OPEN_MINUTES = 10;
let managementOpenUntil = 0;

const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function hashCode(code, saltBytes){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  return toB64(await crypto.subtle.deriveBits({ name:'PBKDF2', salt:saltBytes, iterations:150000, hash:'SHA-256' }, key, 256));
}
async function getManagementLock(){
  const list = await getMiniList('managerLock');
  return list && list[0] && list[0].salt ? list[0] : null;
}
async function setManagementCode(code){        // code '' removes the lock
  if(!code) return setMiniList('managerLock', []);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return setMiniList('managerLock', [{ v:1, salt: toB64(salt), hash: await hashCode(code, salt) }]);
}
async function checkManagementCode(code){
  const lock = await getManagementLock();
  return !!lock && (await hashCode(code, fromB64(lock.salt))) === lock.hash;
}

// a small sheet that asks for a code (digits or letters); resolves with the text, or null on cancel
function askCode({ title, text, okLabel }){
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet confirm-sheet';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="sheet-card"><h2></h2><p class="confirm-text"></p>
      <input type="password" class="confirm-input code-input" inputmode="numeric" autocomplete="off" aria-label="קוד">
      <div class="code-error" role="alert" hidden></div>
      <div class="confirm-actions"><button type="button" class="btn ghost confirm-cancel">ביטול</button><button type="button" class="btn confirm-ok"></button></div></div>`;
    wrap.querySelector('h2').textContent = title; wrap.querySelector('.confirm-text').textContent = text || '';
    const input = wrap.querySelector('input'), ok = wrap.querySelector('.confirm-ok'), cancel = wrap.querySelector('.confirm-cancel');
    ok.textContent = okLabel || 'אישור';
    const done = v => { wrap.remove(); resolve(v); };
    ok.addEventListener('click', () => done(input.value.trim() || null));
    cancel.addEventListener('click', () => done(null));
    input.addEventListener('keydown', e => { if(e.key === 'Enter') ok.click(); });
    wrap.addEventListener('click', e => { if(e.target === wrap) done(null); });
    document.body.appendChild(wrap);
    input.focus();
  });
}

// the only way into the management screen (home gear, #manage address)
async function openManagement(){
  const lock = await getManagementLock();
  if(lock && Date.now() > managementOpenUntil){
    for(let tries = 0; tries < 5; tries++){
      const code = await askCode({ title:'קוד ניהול', text: tries ? 'הקוד שגוי, נסו שוב.' : 'מסך הניהול מוגן בקוד.', okLabel:'כניסה' });
      if(code === null) return false;
      if(await checkManagementCode(code)){ managementOpenUntil = Date.now() + MANAGEMENT_OPEN_MINUTES * 60 * 1000; break; }
      if(tries === 4){ toast('הקוד שגוי. נסו שוב מאוחר יותר.'); return false; }
    }
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-manage').classList.add('active');
  renderManagementLockCard();
  renderTvAddress();
  return true;
}

// the kids' screen address, ready to copy
function renderTvAddress(){
  const url = location.origin + location.pathname + '#tv';
  document.getElementById('tv-address').textContent = url;
  document.getElementById('tv-address-open').href = url;
}
document.getElementById('tv-address-copy').addEventListener('click', async () => {
  const url = document.getElementById('tv-address').textContent;
  try { await navigator.clipboard.writeText(url); toast('הכתובת הועתקה'); } catch(e){ toast('לא הצלחנו להעתיק — אפשר לסמן את הכתובת ולהעתיק ידנית'); }
});

// the "קוד ניהול" card at the top of the management screen
async function renderManagementLockCard(){
  const lock = await getManagementLock();
  document.getElementById('mgmt-lock-status').textContent = lock
    ? 'מסך הניהול מוגן בקוד.'
    : 'עדיין לא הוגדר קוד ניהול — כל מי שנכנס לאתר יכול לפתוח את המסך הזה. מומלץ להגדיר קוד עכשיו.';
  document.getElementById('mgmt-lock-card').classList.toggle('unset', !lock);
  document.getElementById('mgmt-lock-btn').textContent = lock ? 'שינוי קוד הניהול' : 'הגדרת קוד ניהול';
  document.getElementById('mgmt-lock-off-btn').hidden = !lock;
}
async function chooseNewCode(){
  const first = await askCode({ title:'קוד ניהול חדש', text:'לפחות 4 תווים. את הקוד הזה ידעו רק מי שמנהלים את התכנית.', okLabel:'המשך' });
  if(first === null) return;
  if(first.length < 4){ toast('הקוד קצר מדי — לפחות 4 תווים'); return; }
  const again = await askCode({ title:'הקלידו שוב את הקוד', text:'', okLabel:'שמירה' });
  if(again === null) return;
  if(again !== first){ toast('הקודים לא תואמים — לא נשמר'); return; }
  const ok = await setManagementCode(first);
  if(ok){ managementOpenUntil = Date.now() + MANAGEMENT_OPEN_MINUTES * 60 * 1000; toast('קוד הניהול נשמר'); }
  else toast('⚠ השמירה נכשלה — בדקו חיבור ונסו שוב');
  renderManagementLockCard();
}
document.getElementById('mgmt-lock-btn').addEventListener('click', async () => {
  const lock = await getManagementLock();
  if(lock){
    const current = await askCode({ title:'הקוד הנוכחי', text:'כדי לשנות את הקוד, הקלידו קודם את הקוד הנוכחי.', okLabel:'המשך' });
    if(current === null) return;
    if(!(await checkManagementCode(current))){ toast('הקוד שגוי'); return; }
  }
  await chooseNewCode();
});
document.getElementById('mgmt-lock-off-btn').addEventListener('click', async () => {
  const current = await askCode({ title:'ביטול הקוד', text:'הקלידו את הקוד הנוכחי כדי להסיר את ההגנה.', okLabel:'להסיר' });
  if(current === null) return;
  if(!(await checkManagementCode(current))){ toast('הקוד שגוי'); return; }
  toast((await setManagementCode('')) ? 'ההגנה בקוד הוסרה' : '⚠ השמירה נכשלה — בדקו חיבור ונסו שוב');
  renderManagementLockCard();
});
