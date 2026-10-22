// ---------- MERCURY: THE KIDS' TV WITHOUT THE STAFF PASSWORD (stage 6) ----------
// The kids' screen (#tv) needs nobody's sign-in: it only shows what anybody may see. To keep strangers out, a screen joins once with a
// short code: the coordinator or the admin asks for it in the portal settings ("מסכי הילדים בחדר"), it arrives by e-mail (15 minutes),
// and is typed here. The screen keeps its own token; disconnected from the portal, it asks for a code again. A screen that is signed in
// (a person, or the old staff password still on it) goes straight in. (scheduling-v32.sql; decisions 32, 60)
const TV_TOKEN_KEY = 'ramzor-tv-token';
function tvToken(){ try { return localStorage.getItem(TV_TOKEN_KEY) || null; } catch(e){ return null; } }
// true = this screen may show; a missing function on the server (before scheduling-v32.sql) or a moment without the network never locks a known screen
async function tvTokenOk(){
  const tok = tvToken();
  try {
    const r = await sb.rpc('tv_check', { p_token:tok || '' });
    if(r.error) return /could not find|does not exist|schema cache/i.test(r.error.message) ? true : !!tok;
    return r.data === true;
  } catch(e){ return !!tok; }
}
function tvPairScreen(){
  return new Promise(resolve => {
    let el = document.getElementById('tv-pair');
    if(!el){ el = document.createElement('div'); el.id = 'tv-pair'; document.body.appendChild(el); }
    el.innerHTML = `<div class="tvp-card"><div class="tvp-emoji" aria-hidden="true">📺</div><h1>חיבור מסך הילדים</h1>
      <p>מבקשים קוד בפורטל הרכזת: הגדרות ← מסכי הילדים בחדר ← "קוד למסך חדש". הקוד תקף ל-15 דקות.</p>
      <input type="text" id="tvp-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="הקוד (6 ספרות)" aria-label="הקוד">
      <button type="button" class="btn" id="tvp-go">חיבור</button><div class="tvp-err" id="tvp-err" aria-live="polite"></div></div>`;
    el.hidden = false;
    const input = el.querySelector('#tvp-code'), err = el.querySelector('#tvp-err'), go = el.querySelector('#tvp-go');
    const tryCode = async () => {
      const code = input.value.replace(/\D/g, ''); if(code.length !== 6){ err.textContent = 'צריך 6 ספרות'; return; }
      go.disabled = true; err.textContent = '';
      let r; try { r = await sb.rpc('tv_pair', { p_code:code, p_name:'מסך הילדים' }); } catch(e){ r = { error:e }; }
      go.disabled = false;
      if(r.error || !r.data){ err.textContent = 'הקוד לא נכון או שפג תוקפו. אפשר לבקש קוד חדש.'; input.select(); return; }
      try { localStorage.setItem(TV_TOKEN_KEY, r.data); } catch(e){}
      el.hidden = true; resolve(true);
    };
    go.addEventListener('click', tryCode);
    input.addEventListener('keydown', e => { if(e.key === 'Enter') tryCode(); });
    setTimeout(() => input.focus(), 50);
  });
}
// the TV starts: a known screen goes in; otherwise the code first. Every 10 minutes: a screen that was disconnected asks again.
async function tvGate(){
  if(!(await tvTokenOk())) await tvPairScreen();
  clearInterval(tvGate.t);
  tvGate.t = setInterval(async () => { if(!(await tvTokenOk())){ try { localStorage.removeItem(TV_TOKEN_KEY); } catch(e){} location.reload(); } }, 10 * 60 * 1000);
  return true;
}
