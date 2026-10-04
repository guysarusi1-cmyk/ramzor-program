
// ---------- STAFF ACCESSIBILITY: text size, high contrast, no motion ----------
// For the staff screens only (the kids' TV is never touched). Chosen from the home screen, remembered on
// this device. Applied as attributes on <html>; the styles are in 11-accessibility.css.
const A11Y_DEFAULTS = { size:'m', contrast:false, motion:false };
function loadA11y(){
  try { return Object.assign({}, A11Y_DEFAULTS, JSON.parse(localStorage.getItem('ramzor-a11y') || '{}')); }
  catch(e){ return Object.assign({}, A11Y_DEFAULTS); }
}
let a11y = loadA11y();
function applyA11y(){
  const h = document.documentElement;
  if(a11y.size === 'm') h.removeAttribute('data-text'); else h.setAttribute('data-text', a11y.size);
  if(a11y.contrast) h.setAttribute('data-contrast', 'high'); else h.removeAttribute('data-contrast');
  if(a11y.motion) h.setAttribute('data-motion', 'off'); else h.removeAttribute('data-motion');
  document.querySelectorAll('#a11y-sheet [data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === a11y.size)));
  [['a11y-contrast', a11y.contrast], ['a11y-motion', a11y.motion]].forEach(([id, on]) => {
    const b = document.getElementById(id); b.setAttribute('aria-pressed', String(on)); b.querySelector('.a11y-state').textContent = on ? 'פועל' : 'כבוי';
  });
}
function saveA11y(){
  applyA11y();
  try { localStorage.setItem('ramzor-a11y', JSON.stringify(a11y)); } catch(e){}
}
document.querySelectorAll('#a11y-sheet [data-size]').forEach(b => b.addEventListener('click', () => { a11y.size = b.dataset.size; saveA11y(); }));
document.getElementById('a11y-contrast').addEventListener('click', () => { a11y.contrast = !a11y.contrast; saveA11y(); });
document.getElementById('a11y-motion').addEventListener('click', () => { a11y.motion = !a11y.motion; saveA11y(); });
document.getElementById('a11y-reset').addEventListener('click', () => { a11y = Object.assign({}, A11Y_DEFAULTS); saveA11y(); });
document.getElementById('hub-a11y-btn').addEventListener('click', () => { document.getElementById('a11y-sheet').hidden = false; });
document.getElementById('a11y-close').addEventListener('click', () => { document.getElementById('a11y-sheet').hidden = true; });
document.getElementById('a11y-sheet').addEventListener('click', e => { if(e.target.id === 'a11y-sheet') e.target.hidden = true; });
applyA11y();
