
// ---------- THE WALL PROJECT (פרויקט הלבנים) ----------
// Every child builds a wall of 100 numbered stone bricks in the colour of their avatar. The instructors add the
// bricks (one at a time); the kids' TV shows the whole wall of a child when a brick is added (the new brick
// drops in and lights up), and one board with a small wall for every child.
const WALL_BRICKS = 100;

// the big wall (a limestone wall with a golden frieze, columns at the sides, blue sky) — built bricks are
// tinted with the child's colour, the ones still to come are dark empty slots; `newBrick` is the one just added
function bigWallHtml(child, count, newBrick, strength){
  let bricks = '';
  for(let i = 1; i <= WALL_BRICKS; i++){
    const cls = i <= count ? (i === newBrick ? 'built new' : 'built') : '';
    bricks += `<div class="brick ${cls}"><span>${i}</span></div>`;
  }
  return `<div class="wall-scene" style="--h:${nameHue(child.firstName)};">
      <div class="wall-col wall-col-l"></div><div class="wall-col wall-col-r"></div>
      <div class="wall">
        <div class="wall-cornice"></div><div class="wall-frieze"></div>
        <div class="wall-body">${bricks}</div>
        <div class="wall-base"><span>${nameTagHtml(child)}</span></div>
      </div>
      ${strength ? `<div class="wall-strength">${escapeHtml(strength)}</div>` : ''}
      ${count >= WALL_BRICKS && newBrick ? `<div class="wall-done">המקדש של ${escapeHtml(displayName(child))}<br>הושלם!</div>` : ''}
    </div>`;
}

function miniWallHtml(child, count){
  let cells = '';
  for(let i = 1; i <= WALL_BRICKS; i++) cells += `<i class="${i <= count ? 'on' : ''}"></i>`;
  const done = count >= WALL_BRICKS;
  return `<div class="mini-wall-card${done ? ' done' : ''}" style="--h:${nameHue(child.firstName)};" data-child-id="${child.id}">
      <div class="mini-wall">${cells}</div>
      <div class="mini-wall-name">${nameTagHtml(child)}</div>
      <div class="mini-wall-count">${done ? '✓' : count}</div>
    </div>`;
}

// the board with every child's wall, in the rotation of the kids' TV while anybody has a brick
async function renderWallsBoard(){
  const el = document.getElementById('walls-board');
  if(!roster.length){ el.innerHTML = '<div class="empty">אין עדיין ילדים ברשימה</div>'; return; }
  const states = await getAllChildStates();
  if(!states) return;                                      // read failed: keep what is on screen
  const rows = roster.length <= 6 ? 1 : roster.length <= 18 ? 2 : roster.length <= 30 ? 3 : 4;
  el.style.setProperty('--wall-cols', Math.ceil(roster.length / rows));
  el.innerHTML = roster.map(c => miniWallHtml(c, Math.min(WALL_BRICKS, states.get(c.id).bricks || 0))).join('');
}

// ---- the instructor names the strength before a brick is given: "איזה כוח ראית בו עכשיו?" (one quick tap)
const BRICK_STRENGTHS = ['אומץ', 'התמדה', 'גמישות', 'בקשת עזרה', 'סבלנות', 'נדיבות', 'קבלה'];
const cleanStrength = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 20);
// resolves to the strength's name ('' is never returned: "אחר" without text gives 'אחר'), or null if they went back
function askBrickStrength(child){
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet strength-sheet';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="sheet-card">
        <h2></h2>
        <div class="strength-chips">${BRICK_STRENGTHS.map(s => `<button type="button" class="strength-chip" data-s="${s}">${s}</button>`).join('')}<button type="button" class="strength-chip strength-other-btn">אחר</button></div>
        <div class="strength-other" hidden><input type="text" class="confirm-input strength-input" maxlength="20" autocomplete="off" placeholder="איזה כוח? (לא חובה)" aria-label="כוח אחר"><button type="button" class="btn strength-ok">הוספת לבנה</button></div>
        <div class="confirm-actions strength-actions"><button type="button" class="btn ghost strength-cancel">חזרה</button></div>
      </div>`;
    wrap.querySelector('h2').textContent = `איזה כוח ראית ב${displayName(child)} עכשיו?`;
    const done = v => { wrap.remove(); resolve(v); };
    wrap.querySelectorAll('.strength-chip[data-s]').forEach(b => b.addEventListener('click', () => done(b.dataset.s)));
    const box = wrap.querySelector('.strength-other'), input = wrap.querySelector('.strength-input');
    wrap.querySelector('.strength-other-btn').addEventListener('click', () => { box.hidden = false; input.focus(); });
    wrap.querySelector('.strength-ok').addEventListener('click', () => done(cleanStrength(input.value) || 'אחר'));
    input.addEventListener('keydown', e => { if(e.key === 'Enter') done(cleanStrength(input.value) || 'אחר'); });
    wrap.querySelector('.strength-cancel').addEventListener('click', () => done(null));
    wrap.addEventListener('click', e => { if(e.target === wrap) done(null); });
    document.body.appendChild(wrap);
  });
}