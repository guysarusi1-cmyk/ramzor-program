// ---------- STORAGE HELPERS (backed by Supabase) ----------
// The kids' TV opens without a login, so what a visitor who is NOT signed in may read is kept to the
// minimum: first name + last initial (see supabase\hardening.sql — the database enforces it, this
// code just asks for no more than that). Age and the social workers' details are for signed-in staff only.
// Sorted by first name, so a child is easy to find in every list (and the TV's boards).
async function getRoster(){
  const { data: { session } } = await sb.auth.getSession();
  const columns = session ? '*' : 'id, first_name, last_initial';
  const { data, error } = await sb.from('roster').select(columns);
  if(error){ console.error(error); return []; }
  return data
    .map(r => ({ id:r.id, firstName:r.first_name, lastInitial:r.last_initial, age:r.age, swName:r.sw_name, swPhone:r.sw_phone }))
    .sort((a, b) => (a.firstName + ' ' + (a.lastInitial || '')).localeCompare(b.firstName + ' ' + (b.lastInitial || ''), 'he'));
}
function todayStr(){ return new Date().toLocaleDateString('en-CA'); }
