// ---------- TOAST ----------
function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 3200);
}

// A message with a "ביטול" button, for actions that can be taken back (a star, a step, a bonus).
// onUndo() resolves true when it worked. Stays for UNDO_MS; one undo message at a time.
const UNDO_MS = 9000;
let undoToastEl = null;
function toastUndo(msg, onUndo){
  if(undoToastEl) undoToastEl.remove();
  const t = document.createElement('div');
  t.className = 'toast toast-undo';
  const text = document.createElement('span'); text.textContent = msg;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'toast-undo-btn'; btn.textContent = 'ביטול';
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = '...';
    const ok = await onUndo();
    t.remove(); if(undoToastEl === t) undoToastEl = null;
    toast(ok ? 'הפעולה בוטלה' : '⚠ לא הצלחנו לבטל — בדקו חיבור');
  });
  t.append(text, btn);
  document.body.appendChild(t);
  undoToastEl = t;
  setTimeout(() => { if(undoToastEl === t){ t.remove(); undoToastEl = null; } else t.remove(); }, UNDO_MS);
}

// A question in the middle of the screen. Resolves true on the confirm button, false on cancel / outside tap.
//   confirmSheet({ title, text, okLabel, cancelLabel, danger, typeWord })
//   typeWord: a word that must be typed before the confirm button works (for actions that cannot be undone)
function confirmSheet(opts){
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet confirm-sheet';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="sheet-card">
        <h2></h2><p class="confirm-text"></p>
        ${opts.typeWord ? '<input type="text" class="confirm-input" autocomplete="off" aria-label="אישור בהקלדה">' : ''}
        <div class="confirm-actions"><button type="button" class="btn ghost confirm-cancel"></button><button type="button" class="btn confirm-ok${opts.danger ? ' danger' : ''}"></button></div>
      </div>`;
    wrap.querySelector('h2').textContent = opts.title || '';
    wrap.querySelector('.confirm-text').textContent = opts.text || '';
    const ok = wrap.querySelector('.confirm-ok'), cancel = wrap.querySelector('.confirm-cancel'), input = wrap.querySelector('.confirm-input');
    ok.textContent = opts.okLabel || 'אישור'; cancel.textContent = opts.cancelLabel || 'חזרה';
    if(input){ ok.disabled = true; input.placeholder = `כתבו: ${opts.typeWord}`; input.addEventListener('input', () => { ok.disabled = input.value.trim() !== opts.typeWord; }); }
    const done = v => { wrap.remove(); resolve(v); };
    ok.addEventListener('click', () => done(true));
    cancel.addEventListener('click', () => done(false));
    wrap.addEventListener('click', e => { if(e.target === wrap) done(false); });
    document.body.appendChild(wrap);
    (input || cancel).focus();     // by default the safe choice is the focused one
  });
}
