
// ---------- ENVIRONMENT + SUPABASE CONFIG (filled in by build.ps1 from config/<env>.json) ----------
const APP_ENV = '@env@';   // 'live' (what staff use) or 'test' (the safe sandbox)
const SUPABASE_URL = '@config(supabaseUrl)';
const SUPABASE_ANON_KEY = '@config(anonKey)';
const STAFF_EMAIL = 'staff@merkaz-cherum.local';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

