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

const BONUS_REVOCATION_HOURS = 5;
async function getActiveBonusRevocations(){
  const since = new Date(Date.now() - BONUS_REVOCATION_HOURS*60*60*1000).toISOString();
  const { data, error } = await sb.from('bonus_revocations').select('*').gte('revoked_at', since);
  if(error){ console.error(error); return []; }
  return data;
}
async function revokeBonus(childId, bonusId){
  const { error } = await sb.from('bonus_revocations').insert({ child_id: childId, bonus_id: bonusId });
  if(error){ console.error(error); return false; }
  return true;
}
// groups active revocations by bonus id -> array of "first+last initial" strings, e.g. {bd1:['דכ','יל']}
function groupRevocationsByBonus(revocations){
  const byBonus = {};
  revocations.forEach(r=>{
    const child = roster.find(c=>c.id === r.child_id);
    if(!child) return;
    if(!byBonus[r.bonus_id]) byBonus[r.bonus_id] = [];
    byBonus[r.bonus_id].push(initials(child).split('').join('.'));
  });
  return byBonus;
}

// One step per day on the moon/Mercury journey. Enforced on the live site; switched off in the
// test environment so the journey can be clicked through freely (client decision, 2026-10-03).
const MOON_DAILY_LIMIT_ENABLED = (APP_ENV === 'live');

const emptyChildState = () => ({ stars:0, moonSteps:0, moonGifts:0, mercurySteps:0, moonDayDate:null, moonDayStatus:null });
const childStateFromRow = d => ({ stars:d.stars, moonSteps:d.moon_steps, moonGifts:d.moon_gifts, mercurySteps:d.mercury_steps||0, moonDayDate:d.moon_day_date, moonDayStatus:d.moon_day_status });

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
async function setChildState(id, state){
  const { error } = await sb.from('child_state').upsert({
    child_id:id, stars:state.stars||0, moon_steps:state.moonSteps||0, moon_gifts:state.moonGifts||0,
    mercury_steps:state.mercurySteps||0,
    moon_day_date:state.moonDayDate||null, moon_day_status:state.moonDayStatus||null
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

