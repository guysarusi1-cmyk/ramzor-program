// ---------- STORAGE HELPERS (backed by Supabase) ----------
async function getRoster(){
  const { data, error } = await sb.from('roster').select('*').order('id');
  if(error){ console.error(error); return []; }
  return data.map(r => ({ id:r.id, firstName:r.first_name, lastInitial:r.last_initial, age:r.age, swName:r.sw_name, swPhone:r.sw_phone }));
}
function todayStr(){ return new Date().toLocaleDateString('en-CA'); }

