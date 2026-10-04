// ---------- BONUS SCHEDULING + REVOCATIONS ----------
// A bonus item may carry an optional `days` array (JS Date.getDay() values: 0=Sunday ... 5=Friday, 6=Saturday).
// No `days` field (or an empty array) means the bonus is shown every day.
function bonusAppliesToday(b){ return !b.days || !b.days.length || b.days.includes(new Date().getDay()); }

// A bonus may carry optional "startTime"/"endTime" ("HH:MM" strings) — while the current time
// falls inside that window, the kids-display board shows a highlighted banner on its row.
// A bonus with no times set never shows a banner (just the plain row, as before).
// TEMP (2026-10-02): lets the staff-side preview button force one bonus to show as "active"
// for a few seconds regardless of the real time, so it can be demoed without waiting. Remove
// this override (and the button that sets it) before real staff use.
let tempForceBonusActiveId = null;
function isBonusTimeActive(b){
  if(b.id === tempForceBonusActiveId) return true;
  if(!b.startTime || !b.endTime) return false;
  const toMinutes = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const now = new Date();
  const nowMinutes = now.getHours()*60 + now.getMinutes();
  return nowMinutes >= toMinutes(b.startTime) && nowMinutes < toMinutes(b.endTime);
}

// A picture for every bonus on the kids' TV (children aged 2-7 do not read the sentences). The staff can pick
// one in the bonus editor; without a choice one is guessed from the words, and a gift is the fallback.
const BONUS_ICONS = ['🧃', '🍬', '🍵', '📺', '🌳', '🧁', '🍎', '🎈', '⚽', '🎨', '🛁', '🎉', '🍪', '🧹', '🕯️', '🎁'];
const BONUS_ICON_WORDS = [
  [/מיץ|פטל|שתייה|משקה/, '🧃'], [/שלוק|גלידה|קרטיב/, '🍧'], [/מתוק|ממתק|סוכרי/, '🍬'], [/תה|נענע|קמומיל/, '🍵'],
  [/טלוויזיה|טלויזיה|סרט|מסך/, '📺'], [/פארק|גינה|חצר|טיול/, '🌳'], [/אפייה|עוגה|עוגי|מאפה/, '🧁'], [/פרי|תפוח/, '🍎'],
  [/כדור|משחק|מגרש/, '⚽'], [/ציור|יצירה|צבע/, '🎨'], [/מקלחת|אמבט/, '🛁'], [/שבת|נר/, '🕯️'], [/תורנו/, '🎉'], [/ניקי|סידור|ניקיון/, '🧹'], [/ארוחת? ארבע|עוגי/, '🍪']
];
function bonusIcon(b){
  if(b.icon) return b.icon;
  const hit = BONUS_ICON_WORDS.find(([re]) => re.test(b.text || ''));
  return hit ? hit[1] : '🎁';
}

// Which bonuses the instructor may revoke right now, so they can be pointed out on the revoke screen: everything
// that is happening at this hour (by the hours set in the bonus editor — there can be several at once, like the
// ones that pulse on the kids' TV); if nothing is, those that start next; else the first one without hours (or
// the last of the day). Bonuses already revoked are skipped. Returns a list (possibly empty).
function nextBonusesToRevoke(list, revokedIds, now){
  now = now || new Date();
  const left = list.filter(b => !revokedIds.has(b.id));
  if(!left.length) return [];
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const nowM = now.getHours() * 60 + now.getMinutes();
  const timed = left.filter(b => b.startTime && b.endTime);
  const happening = timed.filter(b => nowM >= toMin(b.startTime) && nowM < toMin(b.endTime));
  if(happening.length) return happening;
  const later = timed.filter(b => toMin(b.startTime) > nowM);
  if(later.length){ const first = Math.min(...later.map(b => toMin(b.startTime))); return later.filter(b => toMin(b.startTime) === first); }
  return [left.find(b => !(b.startTime && b.endTime)) || left[left.length - 1]];
}
const BONUS_REVOCATION_HOURS = 5;
async function getActiveBonusRevocations(){
  const since = new Date(Date.now() - BONUS_REVOCATION_HOURS*60*60*1000).toISOString();
  const { data, error } = await sb.from('bonus_revocations').select('*').gte('revoked_at', since);
  if(error){ console.error(error); return []; }
  return data;
}
// returns the new revocation (so it can be taken back), or null when it was not saved
async function revokeBonus(childId, bonusId){
  const { data, error } = await sb.from('bonus_revocations').insert({ child_id: childId, bonus_id: bonusId }).select();
  if(error || !data || !data.length){ console.error(error); return null; }
  return data[0];
}
// undo: the staff took the revocation back (needs the delete permission from supabase\hardening.sql)
async function undoRevokeBonus(revocationId){
  const { data, error } = await sb.from('bonus_revocations').delete().eq('id', revocationId).select();
  if(error){ console.error(error); return false; }
  return !!(data && data.length);
}
// groups active revocations by bonus id -> array of "first+last initial" strings, e.g. {bd1:['דכ','יל']}
function groupRevocationsByBonus(revocations){
  const byBonus = {};
  revocations.forEach(r=>{
    const child = roster.find(c=>c.id === r.child_id);
    if(!child) return;
    if(!byBonus[r.bonus_id]) byBonus[r.bonus_id] = [];
    const who = initials(child).split('').join('.');
    if(!byBonus[r.bonus_id].includes(who)) byBonus[r.bonus_id].push(who);      // a child loses a bonus once, however many times it was recorded
  });
  return byBonus;
}

// One step per day on the moon/Mercury journey. Enforced on the live site; switched off in the
// test environment so the journey can be clicked through freely (client decision, 2026-10-03).
const MOON_DAILY_LIMIT_ENABLED = (APP_ENV === 'live');

const emptyChildState = () => ({ stars:0, moonSteps:0, moonGifts:0, mercurySteps:0, moonDayDate:null, moonDayStatus:null });
// bricks (the wall project) is a newer column: while a project's database does not have it yet, it stays undefined
// (read it as (s.bricks || 0)) and is never written, so nothing breaks before supabase\roles.sql was run there
const childStateFromRow = d => ({ stars:d.stars, moonSteps:d.moon_steps, moonGifts:d.moon_gifts, mercurySteps:d.mercury_steps||0, moonDayDate:d.moon_day_date, moonDayStatus:d.moon_day_status, bricks: ('bricks' in d) ? (d.bricks || 0) : undefined });

// For changing a child's data: null when the read FAILED (never pretend the child is at zero and then
// write that back over the real numbers); a child with no row yet starts from zero.
async function getChildStateForUpdate(id){
  const { data, error } = await sb.from('child_state').select('*').eq('child_id', id).maybeSingle();
  if(error){ console.error(error); return null; }
  return data ? childStateFromRow(data) : emptyChildState();
}
// For showing on screen: a failed read shows zeros (nothing is written back from these).
async function getChildState(id){
  return (await getChildStateForUpdate(id)) || emptyChildState();
}
// Everyone at once, in one request (the boards use this). null when the read failed — keep what is on screen.
async function getAllChildStates(){
  const { data, error } = await sb.from('child_state').select('*');
  if(error || !data){ console.error(error); return null; }
  const byId = {};
  data.forEach(d => { byId[d.child_id] = childStateFromRow(d); });
  return { get: id => byId[id] || emptyChildState() };
}
// Changing one child's numbers while several instructors work at the same time (or one taps twice):
// the new value is written ONLY if the row is still exactly as it was read ("compare and set"), otherwise
// it is read again and redone — so no star or step is ever lost to a simultaneous change.
//   compute(before) -> { set:{ stars: 5, ... }, guard:['stars', ...] }   or null to stop (nothing to do)
//   resolves to { ok:true, before, after } | { ok:false, reason:'network'|'declined'|'busy' }
const STATE_COLUMNS = { stars:'stars', moonSteps:'moon_steps', moonGifts:'moon_gifts', mercurySteps:'mercury_steps', moonDayDate:'moon_day_date', moonDayStatus:'moon_day_status', bricks:'bricks' };
async function updateChildState(childId, compute){
  for(let attempt = 0; attempt < 8; attempt++){
    const { data: row, error } = await sb.from('child_state').select('*').eq('child_id', childId).maybeSingle();
    if(error){ console.error(error); return { ok:false, reason:'network' }; }
    const before = row ? childStateFromRow(row) : emptyChildState();
    const change = compute(before);
    if(!change) return { ok:false, reason:'declined', before };
    const dbSet = {};
    Object.keys(change.set).forEach(k => { dbSet[STATE_COLUMNS[k]] = change.set[k]; });
    if(!row){
      const { data, error: e2 } = await sb.from('child_state').insert(Object.assign({ child_id: childId }, dbSet)).select();
      if(!e2 && data && data.length) return { ok:true, before, after: childStateFromRow(data[0]) };
      if(e2 && e2.code !== '23505'){ console.error(e2); return { ok:false, reason:'network' }; }
      continue;                                   // somebody created the row at the same moment: read again
    }
    let q = sb.from('child_state').update(dbSet).eq('child_id', childId);
    (change.guard || []).forEach(k => { const col = STATE_COLUMNS[k]; q = (row[col] === null || row[col] === undefined) ? q.is(col, null) : q.eq(col, row[col]); });
    const { data: upd, error: e3 } = await q.select();
    if(e3){ console.error(e3); return { ok:false, reason:'network' }; }
    if(upd && upd.length) return { ok:true, before, after: childStateFromRow(upd[0]) };
    // no row matched: another device changed it in between — read again and redo
  }
  return { ok:false, reason:'busy' };
}
async function setChildState(id, state){
  const client = await adminClient();                      // (used by management: a new child's start, resetting the boards)
  if(!client) return false;
  const { error } = await client.from('child_state').upsert({
    child_id:id, stars:state.stars||0, moon_steps:state.moonSteps||0, moon_gifts:state.moonGifts||0,
    mercury_steps:state.mercurySteps||0,
    moon_day_date:state.moonDayDate||null, moon_day_status:state.moonDayStatus||null,
    ...(state.bricks !== undefined ? { bricks: state.bricks } : {})        // only where the database has the column
  });
  if(error) console.error(error);
  return !error;     // callers tell staff when a change did NOT reach the database
}

async function resetAllStars(){
  await Promise.all(roster.map(async c=>{
    const s = await getChildStateForUpdate(c.id);
    if(!s) return;
    s.stars = 0;
    await setChildState(c.id, s);
  }));
}
async function resetAllMercuryToStart(){
  await Promise.all(roster.map(async c=>{
    const s = await getChildStateForUpdate(c.id);
    if(!s) return;
    s.mercurySteps = 0;
    await setChildState(c.id, s);
  }));
}

let roster = [];
let selectedStaffChild = null;

async function initRoster(){
  roster = await getRoster();
}

function uid(){ return 'c' + Date.now() + Math.floor(Math.random()*1000); }
// first name + last initial only — used everywhere, including the kids' TV (age is never shown there)
function displayName(c){
  return c.lastInitial ? `${c.firstName} ${c.lastInitial}'` : c.firstName;
}
// management screen only, where the age helps tell children apart when editing the list
function displayNameWithAge(c){
  return c.age ? `${displayName(c)} (${c.age})` : displayName(c);
}

