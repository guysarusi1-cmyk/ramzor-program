// short alias for typing on a TV remote: ...#t opens the kids' screen like ...#tv
if(location.hash === '#t') history.replaceState(null, '', location.pathname + location.search + '#tv');


// ---------- ENVIRONMENT + SUPABASE CONFIG (filled in by build.ps1 from config/<env>.json) ----------
const APP_ENV = '@env@';   // 'live' (what staff use) or 'test' (the safe sandbox)
const SUPABASE_URL = '@config(supabaseUrl)';
const SUPABASE_ANON_KEY = '@config(anonKey)';
const STAFF_EMAIL = 'staff@merkaz-cherum.local';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

