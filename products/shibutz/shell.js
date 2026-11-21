
// ---------- THE SCHEDULING PRODUCT: its own small site (Guy 2026-11-13) ----------
// One product of the three, on a database of its own organisation (supabase/core/core-v1.sql + the two-week schedule). This shell is
// everything the two-week module (src/scripts/14zq-twoweek.js, used as it is) needs around it: the connection, the sign-in, who is
// calling, and a few small helpers that the big site has elsewhere. Nothing of the Ramzor or of the therapy portal is in this site.
const ORG_NAME = '@config(orgName)';
const DEMO_TOOLS = '@config(demoTools)' === 'True';          // (the "sample options" button: a demo database only)
const SB_VERSION = '1.0';          // (the product's version, under the logo: raise it with every release of this site)
const ORG_SLUG = '@config(orgSlug)';          // (one database, many organisations: every call says which one; the database checks the caller works there)
const sbPersonal = supabase.createClient('@config(supabaseUrl)', '@config(anonKey)', { auth:{ storageKey:'mercury-shibutz-auth', persistSession:true, autoRefreshToken:true }, global:{ headers:{ 'x-org':ORG_SLUG } } });
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

// the top of the screen, in one line (the review agents 2026-11-14: it took most of a phone screen): the logo with the version, the
// organisation, and "הגדרות" (light / dark, text, language, installing, and signing out — signing out is not a big button any more)
function sbDecorate(){
  const shell = document.querySelector('#view-tw .portal-shell'); if(!shell) return;
  const top = shell.querySelector('.portal-top'); if(top) top.classList.add('sb-hide-top');
  if(!shell.querySelector('.sb-top')){
    shell.insertAdjacentHTML('afterbegin', `<div class="sb-top">${sbBrandHtml(true)}<span class="sb-top-org">${pEsc((srv.profile && srv.profile.org && srv.profile.org.name) || ORG_NAME)}</span>
      <button type="button" class="portal-theme sb-look" id="sb-look" aria-label="החלפה בין מצב כהה לבהיר">${sbTheme() === 'dark' ? '☀️' : '🌙'}</button>
      <button type="button" class="btn ghost small" id="sb-theme" aria-label="הגדרות">⚙ הגדרות</button></div>`);
    shell.querySelector('#sb-theme').addEventListener('click', sbSettings);
    shell.querySelector('#sb-look').addEventListener('click', () => sbSetTheme(sbTheme() === 'dark' ? 'light' : 'dark'));
  }
  if(!shell.querySelector('#sb-install-link')) shell.insertAdjacentHTML('beforeend', sbInstallLinkHtml());
}
async function sbSignOut(){
  if(typeof twConfirm === 'function' && !(await twConfirm({ title:'לצאת מהחשבון?', text:'בכניסה הבאה צריך מייל וסיסמה, או קוד למייל.', ok:'כן, לצאת' }))) return;
  try { await sbPersonal.auth.signOut(); } catch(e){}
  srv.me = null; srv.profile = null; portalServerOn = false; sbShowLogin();
}
// the logo of Mercury with the version under it (as in the big site), and "install as an app" at the bottom (phones, before it is installed)
function sbBrandHtml(small){ return `<div class="mx-brand-wrap${small ? ' mx-brand-small' : ''}"><div class="mx-brand-logo" role="img" aria-label="Mercury"></div><div class="eyebrow-gold mx-brand" dir="ltr">Mercury ${SB_VERSION}</div></div>`; }
const sbInstallWanted = () => !sbInstalled() && (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || window.innerWidth <= 700);
function sbInstallLinkHtml(){ return sbInstallWanted() ? '<button type="button" class="home-link install-link" id="sb-install-link">📲 התקנה כאפליקציה על מסך הבית</button>' : ''; }
document.addEventListener('click', e => { if(e.target.closest('#sb-install-link')) sbInstallSheet(); });
window.addEventListener('appinstalled', () => { sbInstallEvent = null; document.querySelectorAll('#sb-install-link').forEach(b => b.remove()); });
function sbInstallSheet(){
  const wrap = document.createElement('div'); wrap.className = 'sheet confirm-sheet mx-sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.dataset.ptheme = sbTheme();
  const body = sbInstallEvent ? '<p>אפשר להתקין את הסידור על מסך הבית, והוא ייפתח כמו אפליקציה רגילה.</p><button type="button" class="btn" id="sb-install-now" style="width:100%">התקנה עכשיו</button>'
    : sbIsIos() ? '<p>באייפון ההתקנה נעשית דרך ספארי (לא דרך דפדפן אחר):</p><ol><li>לוחצים על כפתור השיתוף בתחתית המסך (ריבוע עם חץ כלפי מעלה).</li><li>גוללים ובוחרים <b>"הוספה למסך הבית"</b>.</li><li>לוחצים <b>"הוספה"</b>. הסמל יופיע על מסך הבית.</li></ol>'
    : '<p>באנדרואיד, בדפדפן כרום:</p><ol><li>לוחצים על שלוש הנקודות בפינה העליונה.</li><li>בוחרים <b>"התקנת אפליקציה"</b> (או "הוספה למסך הבית").</li><li>מאשרים. הסמל יופיע על מסך הבית.</li></ol>';
  wrap.innerHTML = `<div class="sheet-card tw-sheet"><h2>התקנה כאפליקציה</h2>${body}<div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div></div>`;
  wrap.addEventListener('click', async e => {
    if(e.target === wrap || e.target.closest('[data-close]')){ wrap.remove(); return; }
    if(e.target.closest('#sb-install-now') && sbInstallEvent){ sbInstallEvent.prompt(); try { await sbInstallEvent.userChoice; } catch(err){} sbInstallEvent = null; wrap.remove(); }
  });
  document.body.appendChild(wrap);
}
function sbOpen(){ sbApplyLook(); const p = showTwoWeek(); sbDecorate(); return p; }
// the look changes in place, without loading the screen again (Guy 21.11: a switch in the top line, as in the first site)
function sbSetTheme(t){
  sbSet('theme', t);
  document.querySelectorAll('[data-ptheme]').forEach(el => { el.dataset.ptheme = t; });
  const b = document.getElementById('sb-look'); if(b) b.textContent = t === 'dark' ? '☀️' : '🌙';
  document.querySelectorAll('[data-k="theme"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === t)));
}
// the settings folded under headings, closed at first, as in the first site (Guy 21.11); what was opened stays open while the window is redrawn
const SB_FOLDS = new Set();
const sbFold = (k, title, body) => `<details class="sb-fold" data-fold="${k}"${SB_FOLDS.has(k) ? ' open' : ''}><summary><span>${title}</span></summary><div class="sb-fold-body">${body}</div></details>`;

// ---- the settings of this device: the look, big text, high contrast, installing as an app (Guy 2026-11-14)
const sbGet = (k, d) => { try { const v = localStorage.getItem('mercury-shibutz-' + k); return v === null ? d : v; } catch(e){ return d; } };
const sbSet = (k, v) => { try { localStorage.setItem('mercury-shibutz-' + k, v); } catch(e){} };
function sbApplyLook(){
  document.body.classList.toggle('portal-big', sbGet('big', '') === '1');
  if(sbGet('contrast', '') === 'high') document.documentElement.dataset.contrast = 'high'; else delete document.documentElement.dataset.contrast;
}
let sbInstallEvent = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); sbInstallEvent = e; });
const sbInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const sbIsIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function sbSettings(){
  const wrap = document.createElement('div'); wrap.className = 'sheet confirm-sheet mx-sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.dataset.ptheme = sbTheme();
  const seg = (k, opts, cur) => `<div class="mx-seg" role="group">${opts.map(([v, w]) => `<button type="button" data-k="${k}" data-v="${v}" aria-pressed="${cur === v}">${w}</button>`).join('')}</div>`;
  const install = sbInstalled() ? '<div class="sb-help">האתר כבר מותקן במכשיר הזה כאפליקציה.</div>'
    : sbInstallEvent ? '<button type="button" class="btn" id="sb-install">התקנה כאפליקציה</button><div class="sb-help">יופיע סמל על מסך הבית, והאתר ייפתח כמו אפליקציה.</div>'
    : sbIsIos() ? '<div class="sb-help">באייפון: בספארי לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה), ואז "הוספה למסך הבית".</div>'
    : '<div class="sb-help">באנדרואיד, בכרום: בתפריט (שלוש הנקודות למעלה) בוחרים "התקנת אפליקציה" או "הוספה למסך הבית".</div><div class="sb-help">באייפון, בספארי: לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה), ואז "הוספה למסך הבית".</div>';
  wrap.innerHTML = `<div class="sheet-card tw-sheet"><div class="tw-sheet-head"><h2>הגדרות</h2><button type="button" class="btn ghost small" data-close aria-label="סגירה">✕ סגירה</button></div><div class="sb-set">
    ${sbFold('look', 'מראה ונגישות', `<div class="sb-set-row"><b>מראה</b>${seg('theme', [['dark', 'כהה'], ['light', 'בהיר']], sbTheme())}</div>
    <div class="sb-set-row"><b>גודל הטקסט</b>${seg('big', [['', 'רגיל'], ['1', 'גדול']], sbGet('big', ''))}</div>
    <div class="sb-set-row"><b>ניגודיות</b>${seg('contrast', [['', 'רגילה'], ['high', 'גבוהה']], sbGet('contrast', ''))}</div>
    <div class="sb-set-row"><b>שפה</b>${seg('lang', [['he', 'עברית'], ['ar', 'العربية']], sbGet('lang', 'he'))}</div>`)}
    ${sbFold('app', 'אפליקציה וחשבון', `<div class="sb-set-row"><b>אפליקציה</b>${install}</div>
    <div class="sb-set-row"><b>חשבון</b><button type="button" class="btn ghost" id="sb-out">יציאה מהחשבון</button></div>`)}</div>
    <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div></div>`;
  if(typeof twMySettingsInto === 'function') twMySettingsInto(wrap);          // (my own settings of the schedule: the pilot, 14zs-tw-pilot.js)
  wrap.addEventListener('toggle', e => { const d = e.target; if(d && d.matches && d.matches('.sb-fold')){ if(d.open) SB_FOLDS.add(d.dataset.fold); else SB_FOLDS.delete(d.dataset.fold); } }, true);
  wrap.addEventListener('click', async e => {
    if(e.target === wrap || e.target.closest('[data-close]')){ wrap.remove(); return; }
    const b = e.target.closest('[data-k]');
    if(b && b.dataset.k === 'theme'){ sbSetTheme(b.dataset.v); return; }
    if(b){ sbSet(b.dataset.k, b.dataset.v); if(b.dataset.k === 'lang'){ location.reload(); return; } wrap.remove(); await sbOpen(); sbSettings(); return; }
    if(e.target.closest('#sb-install') && sbInstallEvent){ sbInstallEvent.prompt(); try { await sbInstallEvent.userChoice; } catch(err){} sbInstallEvent = null; wrap.remove(); }
    if(e.target.closest('#sb-out')){ wrap.remove(); sbSignOut(); }
  });
  document.body.appendChild(wrap);
}
if('serviceWorker' in navigator && location.protocol === 'https:') window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });

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
  else inner = `<div class="sb-login-brand">${sbBrandHtml(false)}</div><h1>${pEsc(ORG_NAME)}</h1><p class="sb-sub">כניסה אישית</p>
    <label>כתובת המייל<input type="email" id="sb-mail" autocomplete="username" inputmode="email" value="${pEsc(email || '')}"></label>
    <label>סיסמה<input type="password" id="sb-pass" autocomplete="current-password"></label>
    <button type="submit" class="btn" id="sb-go">כניסה</button>
    <p class="sb-or">כניסה ראשונה, או ששכחתם את הסיסמה?</p>
    <button type="button" class="btn ghost" id="sb-send">שלחו לי קוד למייל</button>
    ${sbInstallLinkHtml()}<button type="button" class="sb-lang" id="sb-lang" lang="${sbGet('lang', 'he') === 'ar' ? 'he' : 'ar'}">${sbGet('lang', 'he') === 'ar' ? 'עברית' : 'العربية'}</button>`;
  document.getElementById('view-login').innerHTML = `<div class="portal-shell" data-ptheme="${sbTheme()}"><form class="sb-login" id="sb-form" novalidate>${inner}
    <div class="sb-err" id="sb-err" role="alert">${pEsc(msg || '')}</div></form></div>`;
  const $ = id => document.getElementById(id), err = m => { $('sb-err').textContent = m || ''; };
  const guard = async (btn, work) => { btn.disabled = true; err(''); try { await work(); } catch(e){ console.error(e); err('משהו קטן השתבש. אפשר לנסות שוב בעוד רגע.'); } btn.disabled = false; };
  const sendCode = async mail => {
    const { error } = await sbPersonal.auth.signInWithOtp({ email:mail, options:{ shouldCreateUser:false } });
    if(error){ err(/rate|seconds|limit/i.test(error.message || '') ? 'שלחנו קוד ממש עכשיו. אפשר לבקש קוד חדש בעוד דקה.' : 'לא הצלחנו לשלוח קוד לכתובת הזו. כדאי לבדוק שהיא נכונה, ואם זה ממשיך, מנהלת המערכת ישמחו לעזור.'); return false; }
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
    $('sb-lang').addEventListener('click', () => { sbSet('lang', sbGet('lang', 'he') === 'ar' ? 'he' : 'ar'); location.reload(); });
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
  sbApplyLook();
  let session = null;
  try { const r = await sbPersonal.auth.getSession(); session = r.data && r.data.session; } catch(e){}
  if(session){ if(await sbEnter()) return; } else sbShowLogin();
}
setTimeout(sbStart, 0);          // (after the whole script was read: the two-week module comes after this file)

// the TEST site (shibutz-test.mercuryteam.app, Guy 19.11): a bar at the top on every screen, so it is never mistaken for the real site
(function(){
  if(!/^shibutz-test\./.test(location.hostname)) return;
  const put = () => {
    if(document.getElementById('sb-test-bar')) return;
    const b = document.createElement('div'); b.id = 'sb-test-bar'; b.setAttribute('role', 'note');
    b.textContent = 'אתר בדיקות · לא האתר האמיתי. מה שעושים כאן לא מגיע לצוות.';
    b.style.cssText = 'position:sticky;top:0;z-index:9999;background:repeating-linear-gradient(135deg,#F2C94C 0 14px,#E8B931 14px 28px);color:#1C1A17;font:700 15px/1.4 Assistant,Arial,sans-serif;text-align:center;padding:6px 10px;';
    document.body.prepend(b);
  };
  if(document.body) put(); else document.addEventListener('DOMContentLoaded', put);
})();
