
// ---------- THE INSTRUCTOR PORTAL: data (demo — kept in THIS browser only, no database yet) ----------
// Switched on by "portal": true in config/<env>.json. With it off nothing of the portal exists on screen.
// Everything here is fictional demo data, stored in localStorage, until the server side is approved and connected.
const PORTAL_ENABLED = '@config(portal)' === 'True';
const PORTAL_KEY = 'ramzor-portal-demo-v1';
const DOW_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DOW_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// ---- dates (always local dates, written YYYY-MM-DD; a week starts on Sunday)
function isoDate(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseIso(s){ const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0); }
function addDays(s, n){ const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); }
function monthKeyOf(s){ return s.slice(0, 7); }
function addMonths(mk, n){ const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function daysOfMonth(mk){
  const [y, m] = mk.split('-').map(Number), out = [];
  for(let d = 1; d <= new Date(y, m, 0).getDate(); d++) out.push(`${mk}-${String(d).padStart(2, '0')}`);
  return out;
}
function dowOf(s){ return parseIso(s).getDay(); }
function monthLabel(mk){ const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1, 12).toLocaleDateString('he-IL', { month:'long', year:'numeric' }); }
function dayLabel(s){ const d = parseIso(s); return `${DOW_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; }
function weekStartOf(s){ return addDays(s, -dowOf(s)); }

// ---- the three levels a preference can have (anything else = neutral)
const LEVELS = { yes:'כן', avoid:'מעדיף שלא', no:'ממש לא' };

const SHIFT_TYPES_DEFAULT = [
  { id:'m', label:'בוקר', start:'07:00', end:'15:00', need:2, needWeekend:2, night:false },
  { id:'e', label:'ערב', start:'15:00', end:'23:00', need:3, needWeekend:2, night:false },
  { id:'n', label:'לילה', start:'23:00', end:'07:00', need:1, needWeekend:1, night:true }
];
const RULES_DEFAULT = { maxShiftsPerWeek:5, maxConsecutiveDays:5, minRestHours:11, maxNightsPerMonth:8 };

// ---- a small seeded random generator, so the demo is the same every time
function seededRandom(seed){
  let a = seed >>> 0;
  return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---- a sample "photo" (until the real photos arrive): a simple person on a coloured round background
function samplePhoto(seed){
  const hue = (seed * 47) % 360, skin = ['#f2c9a0', '#e0a97c', '#c68a5b', '#8d5a3b', '#f7d9b8'][seed % 5], hair = ['#2b1d12', '#6b4423', '#c28a3b', '#1a1a1a', '#8a8a8a'][(seed * 3) % 5];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='hsl(${hue},55%,62%)'/><path d='M12 100 Q14 66 50 64 Q86 66 88 100Z' fill='hsl(${(hue + 160) % 360},45%,40%)'/><circle cx='50' cy='42' r='20' fill='${skin}'/><path d='M30 40 Q32 18 50 18 Q68 18 70 40 Q62 28 50 28 Q38 28 30 40Z' fill='${hair}'/><circle cx='43' cy='44' r='2.2' fill='#2b1a0e'/><circle cx='57' cy='44' r='2.2' fill='#2b1a0e'/><path d='M44 52 Q50 57 56 52' stroke='#8a3b2b' stroke-width='2' fill='none' stroke-linecap='round'/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ---- the people (fictional)
function portalDemoInstructors(){
  const people = [
    ['דנה', 'כהן'], ['דנה', 'לוי'], ['יוסי', 'מזרחי'], ['נועה', 'פרידמן'], ['אלי', 'ביטון'], ['מיכל', 'אברהם'],
    ['רן', 'דהן'], ['תמר', 'שפירא'], ['עומר', 'גולן'], ['שירה', 'אזולאי'], ['גיא', 'חדד'], ['ליאת', 'מלכה']
  ];
  const list = people.map((p, i) => ({ id:'i' + (i + 1), first:p[0], last:p[1], role:'instructor', active:true, photo:samplePhoto(i + 1) }));
  list.push({ id:'c1', first:'רותם', last:'ברק', role:'coordinator', active:true, photo:samplePhoto(20) });
  return list;
}
// the name shown on the TV and in the schedule: first name only, plus the last initial only when two people share a first name
function instrName(p, all){
  const same = (all || portalState.instructors).filter(q => q.active && q.id !== p.id && q.first === p.first);
  return same.length ? `${p.first} ${p.last.charAt(0)}'` : p.first;
}

// ---- the weekly pattern of the children's day (the TV timetable) — a monthly plan = a weekly pattern + exceptions
function timetableDefault(){
  const weekday = [
    { t:'07:30', e:'🥣', n:'ארוחת בוקר' }, { t:'09:00', e:'📚', n:'לימודים' }, { t:'12:30', e:'🍝', n:'ארוחת צהריים' },
    { t:'14:00', e:'🛋️', n:'מנוחה' }, { t:'16:00', e:'⚽', n:'חוג וספורט' }, { t:'18:30', e:'🍽️', n:'ארוחת ערב' },
    { t:'20:00', e:'🎬', n:'סרט / משחק' }, { t:'21:30', e:'🛏️', n:'שינה' }
  ];
  const friday = [{ t:'08:00', e:'🥣', n:'ארוחת בוקר' }, { t:'10:00', e:'🎨', n:'יצירה' }, { t:'12:30', e:'🍝', n:'ארוחת צהריים' }, { t:'17:30', e:'🕯️', n:'קבלת שבת' }];
  const sat = [{ t:'09:00', e:'🥣', n:'ארוחת בוקר' }, { t:'11:00', e:'🎲', n:'משחקי קופסה' }, { t:'13:00', e:'🍝', n:'ארוחת צהריים' }, { t:'16:00', e:'🌳', n:'טיול קצר' }];
  return { weekly:{ 0:weekday, 1:weekday, 2:weekday, 3:weekday, 4:weekday, 5:friday, 6:sat }, exceptions:{} };
}

// ---- the whole demo state
let portalState = null;
function portalSeed(){
  const today = isoDate(new Date()), mk = monthKeyOf(today), next = addMonths(mk, 1);
  const instructors = portalDemoInstructors();
  const st = {
    version:1, instructors, shiftTypes:JSON.parse(JSON.stringify(SHIFT_TYPES_DEFAULT)), rules:Object.assign({}, RULES_DEFAULT),
    months:{}, swaps:[], announcements:[], timetable:{}, birthdays:{}, settings:{ theme:'dark' }, outbox:[]
  };
  st.timetable[mk] = timetableDefault(); st.timetable[next] = timetableDefault();
  // tomorrow is a special day (an exception to the weekly pattern)
  st.timetable[monthKeyOf(addDays(today, 1))].exceptions[addDays(today, 1)] = [
    { t:'08:00', e:'🥣', n:'ארוחת בוקר' }, { t:'09:30', e:'🚌', n:'טיול' }, { t:'13:00', e:'🍕', n:'פיצה בטיול' }, { t:'17:00', e:'🏠', n:'חזרה' }, { t:'18:30', e:'🍽️', n:'ארוחת ערב' }
  ];
  // this month: everybody handed in preferences, the schedule was made and published; next month: preferences are being collected
  st.months[mk] = { deadline:addDays(mk + '-01', -3), prefs:portalDemoPrefs(instructors, mk, 11), submitted:{}, assignments:{}, approvals:{}, published:true };
  instructors.filter(p => p.role === 'instructor').forEach(p => { st.months[mk].submitted[p.id] = true; });
  const res = autoSchedule({ month:mk, instructors, shiftTypes:st.shiftTypes, prefs:st.months[mk].prefs, rules:st.rules });
  st.months[mk].assignments = res.assignments;
  st.months[next] = { deadline:addDays(next + '-01', -3), prefs:portalDemoPrefs(instructors.slice(0, 7), next, 12), submitted:{}, assignments:{}, approvals:{}, published:false };
  instructors.slice(0, 7).forEach(p => { if(p.role === 'instructor') st.months[next].submitted[p.id] = true; });
  st.announcements.push({ id:'a1', date:today, from:'רותם', text:'תזכורת: הגשת ההעדפות לחודש הבא נסגרת בסוף השבוע.' });
  return st;
}
// made-up preferences: mostly no opinion, some wishes, a few "I would rather not", and a couple of hard "no" days
function portalDemoPrefs(instructors, mk, seed){
  const rnd = seededRandom(seed), out = {};
  instructors.filter(p => p.role === 'instructor').forEach((p, idx) => {
    const slots = {}, absent = [];
    daysOfMonth(mk).forEach(d => SHIFT_TYPES_DEFAULT.forEach(s => {
      const r = rnd();
      if(r < 0.12) slots[`${d}|${s.id}`] = 'yes'; else if(r < 0.22) slots[`${d}|${s.id}`] = 'avoid'; else if(r < 0.27) slots[`${d}|${s.id}`] = 'no';
    }));
    if(idx % 4 === 1){ const d = daysOfMonth(mk)[Math.floor(rnd() * 25)]; absent.push(d, addDays(d, 1)); }
    out[p.id] = { slots, absent };
  });
  return out;
}

function portalLoad(){
  if(portalState) return portalState;
  try { const raw = localStorage.getItem(PORTAL_KEY); if(raw){ portalState = JSON.parse(raw); } } catch(e){ portalState = null; }
  if(!portalState || portalState.version !== 1){ portalState = portalSeed(); portalSave(); }
  return portalState;
}
function portalSave(){ try { localStorage.setItem(PORTAL_KEY, JSON.stringify(portalState)); } catch(e){} }
function portalReset(){ portalState = null; try { localStorage.removeItem(PORTAL_KEY); } catch(e){} return portalLoad(); }
// keep only the last three months of schedules and preferences (the agreed retention)
function portalPrune(){
  const keepFrom = addMonths(monthKeyOf(isoDate(new Date())), -3);
  Object.keys(portalState.months).forEach(mk => { if(mk < keepFrom) delete portalState.months[mk]; });
}
function portalMonth(mk){
  const st = portalLoad();
  if(!st.months[mk]) st.months[mk] = { deadline:addDays(mk + '-01', -3), prefs:{}, submitted:{}, assignments:{}, approvals:{}, published:false };
  return st.months[mk];
}
function portalPrefsOf(mk, iid){
  const m = portalMonth(mk);
  if(!m.prefs[iid]) m.prefs[iid] = { slots:{}, absent:[] };
  return m.prefs[iid];
}

// ---- the children's birthdays (demo: made-up dates relative to today, one of them is today). Real dates will live only in the protected server.
function kidBirthday(child, index){
  const st = portalLoad();
  if(!st.birthdays[child.id]){
    const offset = index === 1 ? 0 : (index * 29) % 330 + 2;
    const d = parseIso(isoDate(new Date())); d.setDate(d.getDate() + offset);
    const age = parseInt(child.age, 10) || (8 + index % 7);
    st.birthdays[child.id] = { md:`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, age };
    portalSave();
  }
  return st.birthdays[child.id];
}
function birthdaysToday(){
  const md = isoDate(new Date()).slice(5);
  return roster.map((c, i) => ({ child:c, b:kidBirthday(c, i) })).filter(x => x.b.md === md);
}
