
// ---------- THE CHILDREN'S CHARACTERS ----------
// Every child has a small character (most of the children cannot read yet), shown wherever the child's name is on the
// kids' screen, and inside the window of the child's spaceship. Which character belongs to which child is picked in
// management and kept with the other per-child settings (childSettings, "character"), so no child's name is in this code.
const CHARACTERS = {
  ch01:{ src:'@asset(characters/ch01.jpg)', ring:'#6ab4ea', label:'דובי' },
  ch02:{ src:'@asset(characters/ch02.jpg)', ring:'#7cc576', label:'דינוזאור' },
  ch03:{ src:'@asset(characters/ch03.jpg)', ring:'#f48bad', label:'כתר' },
  ch04:{ src:'@asset(characters/ch04.jpg)', ring:'#b08be8', label:'פרפר' },
  ch05:{ src:'@asset(characters/ch05.jpg)', ring:'#f48bad', label:'פרח' },
  ch06:{ src:'@asset(characters/ch06.jpg)', ring:'#6ab4ea', label:'טיל' },
  ch07:{ src:'@asset(characters/ch07.jpg)', ring:'#f48bad', label:'פפיון' },
  ch08:{ src:'@asset(characters/ch08.jpg)', ring:'#f48bad', label:'פפיון מנוקד' },
  ch09:{ src:'@asset(characters/ch09.jpg)', ring:'#f4c95d', label:'שמש' },
  ch10:{ src:'@asset(characters/ch10.jpg)', ring:'#7cc576', label:'אריה' },
  ch11:{ src:'@asset(characters/ch11.jpg)', ring:'#6ab4ea', label:'ג\'ויסטיק' },
  ch12:{ src:'@asset(characters/ch12.jpg)', ring:'#6ab4ea', label:'סירה' },
  ch13:{ src:'@asset(characters/ch13.jpg)', ring:'#f4c95d', label:'דינוזאור כחול' },
  ch14:{ src:'@asset(characters/ch14.jpg)', ring:'#6ab4ea', label:'כוכב' }
};
const CHARACTER_KEYS = Object.keys(CHARACTERS);

function characterFor(childId){
  const k = childSettings[childId] && childSettings[childId].character;
  return (k && CHARACTERS[k]) ? k : null;
}
function charImgHtml(key, cls){ return `<img class="${cls || 'char-img'}" src="${CHARACTERS[key].src}" alt="">`; }

// the round avatar: the child's character on its soft background, in a ring of its colour (same size rules as the initials circle)
function characterAvatarHtml(key){
  return `<div class="avatar-initials avatar-has-char" style="border-color:${CHARACTERS[key].ring}">${charImgHtml(key)}</div>`;
}
// a name with the character next to it (wall, celebration, lists)
function nameTagHtml(child, nameHtml){
  const k = characterFor(child.id), name = nameHtml || escapeHtml(displayName(child));
  return k ? `<span class="nametag">${characterAvatarHtml(k)}<span class="nametag-name">${name}</span></span>` : name;
}
// a tiny character (or the initials when the child has none) for crowded lines such as "who lost a bonus"
function tinyKidHtml(child){
  const k = characterFor(child.id);
  return k ? `<img class="rev-char" src="${CHARACTERS[k].src}" alt="${escapeHtml(initials(child))}">` : escapeHtml(initials(child).split('').join('.'));
}

// ---- the ship: the character sits in its window. Where the window is differs per ship (fractions of the picture's width / height)
const SHIP_WINDOWS = {
  ufo_watercolor:{ x:.50, y:.30, d:.27 }, ufo_purple:{ x:.50, y:.30, d:.25 }, ufo_green:{ x:.45, y:.30, d:.25 },
  rocket_redcream:{ x:.50, y:.26, d:.34 }, mia:{ x:.49, y:.20, d:.20 }, amit:{ x:.50, y:.27, d:.26 },
  rocket_pink:{ x:.675, y:.285, d:.24 }, rocket_bluegray:{ x:.55, y:.43, d:.23 }, ufo_pinkwhite:{ x:.49, y:.20, d:.20 }, ufo_sky:{ x:.50, y:.30, d:.27 }
};
function shipKeyOf(src){ return Object.keys(SHIP_OPTIONS).find(k => SHIP_OPTIONS[k] === src) || null; }
// the ship picture, with the child's character in its window (null when the child has no ship)
function shipHtml(child, cls, style){
  const ship = shipFor(child.id);
  if(!ship) return null;
  const img = `<img class="${cls}" src="${ship}" alt=""${style ? ` style="${style}"` : ''}>`;
  const ck = characterFor(child.id), w = SHIP_WINDOWS[shipKeyOf(ship)];
  if(!ck || !w) return img;
  return `<span class="ship-wrap">${img}<span class="ship-window" style="left:${(w.x * 100).toFixed(1)}%; top:${(w.y * 100).toFixed(1)}%; width:${(w.d * 100).toFixed(1)}%;">${charImgHtml(ck)}</span></span>`;
}
