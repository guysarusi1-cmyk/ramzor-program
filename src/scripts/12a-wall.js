
// ---------- THE WALL PROJECT (פרויקט הלבנים) ----------
// Every child builds a wall of 100 numbered stone bricks in the colour of their avatar. The instructors add the
// bricks (one at a time); the kids' TV shows the whole wall of a child when a brick is added (the new brick
// drops in and lights up), and one board with a small wall for every child.
const WALL_BRICKS = 100;

// the big wall (a limestone wall with a golden frieze, columns at the sides, blue sky) — built bricks are
// tinted with the child's colour, the ones still to come are dark empty slots; `newBrick` is the one just added
function bigWallHtml(child, count, newBrick){
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
        <div class="wall-base"><span>${escapeHtml(displayName(child))}</span></div>
      </div>
      ${count >= WALL_BRICKS && newBrick ? `<div class="wall-done">${escapeHtml(displayName(child))}<br>סיים/ה לבנות את הקיר!</div>` : ''}
    </div>`;
}

function miniWallHtml(child, count){
  let cells = '';
  for(let i = 1; i <= WALL_BRICKS; i++) cells += `<i class="${i <= count ? 'on' : ''}"></i>`;
  const done = count >= WALL_BRICKS;
  return `<div class="mini-wall-card${done ? ' done' : ''}" style="--h:${nameHue(child.firstName)};" data-child-id="${child.id}">
      <div class="mini-wall">${cells}</div>
      <div class="mini-wall-name">${escapeHtml(displayName(child))}</div>
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
