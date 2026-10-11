
// ---------- A DRAWN CHARACTER FOR A PERSON WITHOUT A PHOTO (the kids' TV and the ahmash control) ----------
// By gender, and a different one for each person: the skin, the hair (its shape and colour), the shirt and the background
// are picked from the person's id, so the same person always gets the same character.
const PA_SKIN = ['#f9dcc0', '#f1c49e', '#e0ab80', '#c58a5e', '#9b6440', '#7a4b2e'];
const PA_HAIR = ['#2b1b10', '#4a2d1a', '#7a4a24', '#b07436', '#d8a548', '#1c1c1c', '#8c3b1f'];
const PA_SHIRT = ['#5aa9e6', '#7cc576', '#f48bad', '#b08be8', '#f4c95d', '#ff9f6b', '#5fc8c0', '#e86a6a'];
const PA_BG = ['#dff1ff', '#e7f7df', '#ffe6ef', '#efe6ff', '#fff3d6', '#ffe8da', '#dcf6f3'];
function paHash(s){ let h = 2166136261; String(s).split('').forEach(c => { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }); return h; }
function personArt(p){
  const h = paHash(p.id || p.label || 'x'), pick = (list, k) => list[(h >>> k) % list.length];
  const female = p.female !== false, skin = pick(PA_SKIN, 3), hair = pick(PA_HAIR, 7), shirt = pick(PA_SHIRT, 11), bg = pick(PA_BG, 15), style = (h >>> 19) % 4;
  const back = female ? [
      `<path d="M24 52c-2-20 10-34 26-34s28 14 26 34c2 14-2 26-8 30H32c-6-4-10-16-8-30z" fill="${hair}"/>`,                       // long
      `<circle cx="50" cy="18" r="10" fill="${hair}"/><path d="M28 50c-1-17 9-28 22-28s23 11 22 28z" fill="${hair}"/>`,           // a bun
      `<path d="M27 48c-1-17 9-28 23-28s24 11 23 28c6 4 8 14 4 22-3-8-6-12-9-14z" fill="${hair}"/>`,                               // a ponytail
      `<path d="M25 56c-3-22 8-36 25-36s28 14 25 36c-4 4-8 5-12 4V48H37v12c-4 1-8 0-12-4z" fill="${hair}"/>`                        // a bob
    ][style] : '';
  const front = female ? [
      `<path d="M32 40c4-10 12-14 18-14s14 4 18 14c-8-4-14-6-18-6s-10 2-18 6z" fill="${hair}"/>`,
      `<path d="M31 42c3-11 11-16 19-16s16 5 19 16c-6-5-12-7-19-7s-13 2-19 7z" fill="${hair}"/>`,
      `<path d="M31 41c4-10 11-15 19-15s15 5 19 15c-10-2-20-6-26-9-4 3-8 6-12 9z" fill="${hair}"/>`,
      `<path d="M31 44c2-12 10-18 19-18s17 6 19 18H31z" fill="${hair}"/>`
    ][style] : [
      `<path d="M31 42c1-12 9-18 19-18s18 6 19 18c-5-5-11-8-19-8s-14 3-19 8z" fill="${hair}"/>`,                                 // short
      `<g fill="${hair}"><circle cx="36" cy="33" r="7"/><circle cx="45" cy="28" r="7"/><circle cx="55" cy="28" r="7"/><circle cx="64" cy="33" r="7"/><circle cx="68" cy="40" r="4"/><circle cx="32" cy="40" r="4"/></g>`,    // curly
      `<path d="M31 42l3-14 5 6 4-10 5 8 5-9 4 9 5-7 3 9 4-2 1 10c-6-4-12-6-19-6s-13 2-19 6z" fill="${hair}"/>`,                 // spiky
      `<path d="M31 43c0-13 8-19 19-19s19 6 19 19c-8-6-16-9-26-8l-4 6c-3 0-6 1-8 2z" fill="${hair}"/>`                            // a side parting
    ][style];
  const beard = !female && ((h >>> 23) % 3 === 0) ? `<path d="M36 58c2 10 8 14 14 14s12-4 14-14c-4 4-9 5-14 5s-10-1-14-5z" fill="${hair}" opacity=".9"/>` : '';
  return `<svg class="person-art" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="${bg}"/>${back}
    <path d="M20 100c2-16 14-24 30-24s28 8 30 24z" fill="${shirt}"/><rect x="44" y="64" width="12" height="12" rx="4" fill="${skin}"/>
    <ellipse cx="50" cy="50" rx="19" ry="21" fill="${skin}"/>${beard}${front}
    <circle cx="43" cy="51" r="2.6" fill="#2b2b2b"/><circle cx="57" cy="51" r="2.6" fill="#2b2b2b"/><circle cx="44" cy="50" r=".9" fill="#fff"/><circle cx="58" cy="50" r=".9" fill="#fff"/>
    <circle cx="38" cy="58" r="3.4" fill="#ff8a8a" opacity=".35"/><circle cx="62" cy="58" r="3.4" fill="#ff8a8a" opacity=".35"/>
    <path d="M44 60q6 5 12 0" stroke="#7a3b2a" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
}
