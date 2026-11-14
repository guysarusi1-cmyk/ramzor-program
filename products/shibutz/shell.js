
// ---------- THE SCHEDULING PRODUCT: its own small site (Guy 2026-11-13) ----------
// One product of the three, on a database of its own organisation (supabase/core/core-v1.sql + the two-week schedule). This shell is
// everything the two-week module (src/scripts/14zq-twoweek.js, used as it is) needs around it: the connection, the sign-in, who is
// calling, and a few small helpers that the big site has elsewhere. Nothing of the Ramzor or of the therapy portal is in this site.
const ORG_NAME = '@config(orgName)';
const DEMO_TOOLS = '@config(demoTools)' === 'True';          // (the "sample options" button: a demo database only)
const sbPersonal = supabase.createClient('@config(supabaseUrl)', '@config(anonKey)', { auth:{ storageKey:'mercury-shibutz-auth', persistSession:true, autoRefreshToken:true } });
const srv = { me:null, profile:null, meRow:null, portalTheme:null };
let portalServerOn = false;
const liveCut = () => !DEMO_TOOLS;

const DOW_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function isoDate(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseIso(s){ const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0); }
function addDays(s, n){ const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); }
function dowOf(s){ return parseIso(s).getDay(); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]); }
function pEsc(s){ return escapeHtml(s == null ? '' : s); }
function psIco(){ return ''; }
function toast(msg, ms){ const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms || 3200); }
function sbTheme(){ try { return localStorage.getItem('mercury-shibutz-theme') === 'light' ? 'light' : 'dark'; } catch(e){ return 'dark'; } }
function portalLoad(){ return { settings:{ theme:sbTheme() } }; }
function portalActivateView(id){ document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function showAppHome(){ sbOpen(); }          // (this site has one screen)

// the top of the screen: the organisation, who is signed in, light / dark, sign out
function sbDecorate(){
  const shell = document.querySelector('#view-tw .portal-shell'); if(!shell) return;
  const act = shell.querySelector('.portal-top-actions');
  if(act && !act.querySelector('#sb-out')){
    act.classList.add('sb-bar');
    act.innerHTML = `<span class="sb-who">${pEsc((srv.profile && srv.profile.name) || '')}</span>
      <button type="button" class="btn ghost small" id="sb-theme">${sbTheme() === 'light' ? 'מראה כהה' : 'מראה בהיר'}</button>
      <button type="button" class="btn ghost small" id="sb-out">יציאה</button>`;
    act.querySelector('#sb-theme').addEventListener('click', () => { try { localStorage.setItem('mercury-shibutz-theme', sbTheme() === 'light' ? 'dark' : 'light'); } catch(e){} sbOpen(); });
    act.querySelector('#sb-out').addEventListener('click', async () => { try { await sbPersonal.auth.signOut(); } catch(e){} srv.me = null; srv.profile = null; portalServerOn = false; sbShowLogin(); });
  }
  const title = shell.querySelector('.portal-title');
  if(title && !shell.querySelector('.sb-org')) title.insertAdjacentHTML('beforebegin', `<p class="sb-org">${pEsc((srv.profile && srv.profile.org && srv.profile.org.name) || ORG_NAME)}</p>`);
}
function sbOpen(){ const p = showTwoWeek(); sbDecorate(); return p; }

// the sign-in: e-mail and password; the first time (or a forgotten password) a code by e-mail, then a password of one's own
function sbShowLogin(msg, step, email, again){
  step = step || 'email';
  portalActivateView('view-login');
  let inner;
  if(step === 'code') inner = `<h1>הקלידו את הקוד</h1><p class="sb-sub">שלחנו קוד אל <span dir="ltr">${pEsc(email)}</span>. הוא מגיע תוך דקה (כדאי לבדוק גם בספאם).</p>
    <label>קוד<input type="text" id="sb-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></label>
    <button type="submit" class="btn" id="sb-go">כניסה</button>
    <div class="sb-row"><button type="button" class="btn ghost" id="sb-resend">שליחת קוד חדש</button><button type="button" class="btn ghost" id="sb-back">חזרה</button></div>`;
  else if(step === 'setpw') inner = `<h1>${again ? 'סיסמה חדשה?' : 'בחירת סיסמה אישית'}</h1><p class="sb-sub">${again ? 'נכנסתם עם קוד. אפשר לבחור עכשיו סיסמה חדשה.' : 'מהפעם הבאה נכנסים עם המייל והסיסמה הזו. אם שוכחים אותה, אפשר תמיד לקבל קוד למייל.'}</p>
    <label>סיסמה (לפחות 8 תווים)<input type="password" id="sb-new" autocomplete="new-password"></label>
    <label>שוב, לאימות<input type="password" id="sb-new2" autocomplete="new-password"></label>
    <button type="submit" class="btn" id="sb-go">שמירה וכניסה</button>${again ? '<button type="button" class="btn ghost" id="sb-skip">לא עכשיו</button>' : ''}`;
  else inner = `<h1>${pEsc(ORG_NAME)}</h1><p class="sb-sub">כניסה אישית</p>
    <label>כתובת המייל<input type="email" id="sb-mail" autocomplete="username" inputmode="email" value="${pEsc(email || '')}"></label>
    <label>סיסמה<input type="password" id="sb-pass" autocomplete="current-password"></label>
    <button type="submit" class="btn" id="sb-go">כניסה</button>
    <p class="sb-or">כניסה ראשונה, או ששכחתם את הסיסמה?</p>
    <button type="button" class="btn ghost" id="sb-send">שלחו לי קוד למייל</button>`;
  document.getElementById('view-login').innerHTML = `<div class="portal-shell" data-ptheme="${sbTheme()}"><form class="sb-login" id="sb-form" novalidate>${inner}
    <div class="sb-err" id="sb-err" role="alert">${pEsc(msg || '')}</div></form></div>`;
  const $ = id => document.getElementById(id), err = m => { $('sb-err').textContent = m || ''; };
  const guard = async (btn, work) => { btn.disabled = true; err(''); try { await work(); } catch(e){ console.error(e); err('משהו קטן השתבש. אפשר לנסות שוב בעוד רגע.'); } btn.disabled = false; };
  const sendCode = async mail => {
    const { error } = await sbPersonal.auth.signInWithOtp({ email:mail, options:{ shouldCreateUser:false } });
    if(error){ err(/rate|seconds|limit/i.test(error.message || '') ? 'שלחנו קוד ממש עכשיו. אפשר לבקש קוד חדש בעוד דקה.' : 'לא הצלחנו לשלוח קוד לכתובת הזו. כדאי לבדוק שהיא נכונה, ואם זה ממשיך, מנהל/ת המערכת ישמחו לעזור.'); return false; }
    return true;
  };
  $('sb-form').addEventListener('submit', ev => { ev.preventDefault(); const go = $('sb-go');
    if(step === 'code') return guard(go, async () => {
      const { error } = await sbPersonal.auth.verifyOtp({ email, token:$('sb-code').value.trim(), type:'email' });
      if(error){ err('הקוד לא התאים, או שהוא כבר לא בתוקף. אפשר לבקש קוד חדש.'); return; }
      const { data:{ user } } = await sbPersonal.auth.getUser();
      sbShowLogin('', 'setpw', email, !!(user && user.user_metadata && user.user_metadata.has_password));
    });
    if(step === 'setpw') return guard(go, async () => {
      const a = $('sb-new').value, b = $('sb-new2').value;
      if(a.length < 8){ err('הסיסמה צריכה להיות באורך 8 תווים לפחות.'); return; }
      if(a !== b){ err('שתי הסיסמאות לא זהות. אפשר להקליד שוב.'); return; }
      const { error } = await sbPersonal.auth.updateUser({ password:a, data:{ has_password:true } });
      if(error){ err('לא הצלחנו לשמור את הסיסמה. אפשר לנסות שוב.'); return; }
      toast('הסיסמה נשמרה. מהפעם הבאה נכנסים איתה.'); await sbEnter();
    });
    return guard(go, async () => {
      const mail = $('sb-mail').value.trim().toLowerCase(), pass = $('sb-pass').value;
      if(!mail || !pass){ err('צריך מייל וסיסמה. בכניסה הראשונה, או אם שכחתם את הסיסמה, אפשר לקבל קוד למייל.'); return; }
      let r; try { r = await sbPersonal.auth.signInWithPassword({ email:mail, password:pass }); } catch(e){ r = { error:e }; }
      if(r.error){ err(/invalid login/i.test(r.error.message || '') ? 'המייל או הסיסמה לא נכונים. אם שכחתם את הסיסמה, אפשר לקבל קוד למייל.' : 'הכניסה לא הצליחה. בדקו חיבור ונסו שוב'); return; }
      await sbEnter();
    });
  });
  if(step === 'code'){
    $('sb-resend').addEventListener('click', ev => guard(ev.target, async () => { if(await sendCode(email)) toast('נשלח קוד חדש'); }));
    $('sb-back').addEventListener('click', () => sbShowLogin('', 'email', email));
  } else if(step === 'setpw'){
    if($('sb-skip')) $('sb-skip').addEventListener('click', ev => guard(ev.target, sbEnter));
  } else {
    $('sb-send').addEventListener('click', ev => guard(ev.target, async () => {
      const mail = $('sb-mail').value.trim().toLowerCase();
      if(!mail){ err('הקלידו את כתובת המייל.'); return; }
      if(await sendCode(mail)) sbShowLogin('', 'code', mail);
    }));
  }
  setTimeout(() => { const f = $('sb-code') || $('sb-new') || $('sb-mail'); if(f) f.focus(); }, 50);
}
// after a sign-in: who is this? Somebody without an active row in the people list does not get in.
async function sbEnter(){
  let prof = null;
  try { const r = await sbPersonal.rpc('my_profile'); if(!r.error) prof = r.data; } catch(e){}
  // (an older database answers without the person's id: ask for it)
  if(prof && !prof.staff_id){ try { const r2 = await sbPersonal.rpc('my_staff_id'); if(!r2.error && r2.data) prof.staff_id = r2.data; } catch(e){} }
  if(!prof || !prof.staff_id){
    try { await sbPersonal.auth.signOut(); } catch(e){}
    sbShowLogin('המשתמש הזה לא נמצא ברשימת הצוות של הארגון.');
    return false;
  }
  srv.me = prof.staff_id; srv.profile = prof; srv.meRow = { id:prof.staff_id, role:prof.kind, admin:!!prof.admin };
  portalServerOn = true;
  await sbOpen();
  return true;
}
async function sbStart(){
  let session = null;
  try { const r = await sbPersonal.auth.getSession(); session = r.data && r.data.session; } catch(e){}
  if(session){ if(await sbEnter()) return; } else sbShowLogin();
}
setTimeout(sbStart, 0);          // (after the whole script was read: the two-week module comes after this file)
