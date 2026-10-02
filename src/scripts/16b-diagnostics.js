
// ---------- TV / device diagnostics: open the site's address with #diag at the end ----------
// Built for the room TV, whose browser is not known yet: shows what it supports (with big, readable
// text), whether it can reach the database and receive live updates, and plays a test sound.
async function showDiagnostics(){
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('protected-app').style.display = 'none';
  const view = document.getElementById('diag-view');
  view.hidden = false;
  const rows = document.getElementById('diag-rows');
  const summary = document.getElementById('diag-summary');
  const add = (label, ok, note) => {
    rows.insertAdjacentHTML('beforeend', `<div class="diag-row ${ok ? 'ok' : 'bad'}"><span class="diag-mark">${ok ? '✓' : '✗'}</span><span class="diag-label">${label}</span>${note ? `<span class="diag-note">${note}</span>` : ''}</div>`);
    return ok;
  };
  const css = (prop, val) => !!(window.CSS && CSS.supports && CSS.supports(prop, val));

  document.getElementById('diag-device').textContent =
    `${innerWidth}×${innerHeight} (מסך ${screen.width}×${screen.height}, צפיפות ${window.devicePixelRatio || 1}) · ${navigator.userAgent}`;

  const results = [];
  results.push(add('גריד (CSS Grid)', css('display', 'grid')));
  results.push(add('יחס גובה-רוחב (aspect-ratio) — לוחות החלליות', css('aspect-ratio', '16 / 9')));
  results.push(add('min() ו-calc() — גודל הלוחות', css('width', 'min(96vw, calc(10vh * 2))')));
  results.push(add('יחידות vmin — גדלי הטקסט במסך הילדים', css('font-size', '5vmin')));
  results.push(add('מעברים ואנימציות', css('animation-name', 'x') && css('transition', 'left 1s ease')));
  results.push(add('צליל (WebAudio) — צלילי החגיגה', !!(window.AudioContext || window.webkitAudioContext)));
  results.push(add('חיבור חי (WebSocket)', 'WebSocket' in window));
  results.push(add('אחסון בדפדפן (localStorage)', (() => { try { localStorage.setItem('diag','1'); localStorage.removeItem('diag'); return true; } catch(e){ return false; } })()));
  results.push(add('שירות לעבודה בלי אינטרנט (Service Worker)', 'serviceWorker' in navigator, location.protocol.indexOf('http') === 0 ? '' : 'דורש כתובת https'));
  results.push(add('אפקט טשטוש רקע (לא חובה)', css('backdrop-filter', 'blur(2px)') || css('-webkit-backdrop-filter', 'blur(2px)')));
  results.push(add('בורר :has() (לא חובה — רק בטלפון)', css('selector(:has(a))', '') || (() => { try { document.querySelector(':has(a)'); return true; } catch(e){ return false; } })()));

  // can this screen reach the data, and receive live updates (stars, board changes, remote control)?
  let dataOk = false;
  try { const { data, error } = await sb.from('roster').select('id'); dataOk = !error && Array.isArray(data); add('קריאת נתונים מהשרת', dataOk, dataOk ? `${data.length} ילדים` : String(error && error.message || '')); } catch(e){ add('קריאת נתונים מהשרת', false, String(e)); }
  results.push(dataOk);
  const live = await new Promise(resolve => {
    const ch = sb.channel('diag_' + Date.now());
    const timer = setTimeout(() => { sb.removeChannel(ch); resolve(false); }, 7000);
    ch.subscribe(status => { if(status === 'SUBSCRIBED'){ clearTimeout(timer); sb.removeChannel(ch); resolve(true); } });
  });
  results.push(add('עדכונים חיים מהשרת (כוכבים, שליטה מרחוק)', live));

  const bad = results.filter(r => !r).length;
  summary.textContent = bad === 0 ? 'הכול תקין — המסך הזה מתאים.' : `נמצאו ${bad} בעיות — צלמו את המסך הזה ושלחו.`;
  summary.className = 'diag-summary ' + (bad === 0 ? 'ok' : 'bad');

  document.getElementById('diag-sound-btn').addEventListener('click', () => {
    unlockTvSound();
    setTimeout(() => playTones(SOUND_STAR), 150);
  });
}
