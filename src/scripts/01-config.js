// short alias for typing on a TV remote: ...#t opens the kids' screen like ...#tv
if(location.hash === '#t') history.replaceState(null, '', location.pathname + location.search + '#tv');


// ---------- ENVIRONMENT + SUPABASE CONFIG (filled in by build.ps1 from config/<env>.json) ----------
const APP_ENV = '@env@';   // 'live' (what staff use) or 'test' (the safe sandbox)
// Mercury stage 6: the shared staff password is gone (decision 32); only the automatic checks and the demo of the test site still sign in with it
const staffPasswordOn = () => APP_ENV === 'test' && !!window.__staffPasswordOn;
// Mercury (the therapy portals, observations, the new space journey, the plan's strengths in the temple): only on the test site for now (Guy, 2026-10-22).
// The kids' screen code (no staff password) is not part of this: it is on everywhere.
const liveCut = () => APP_ENV !== 'test' || !!window.__asLive;          // (what the coming live version leaves out; &aslive shows it on the test site)
const mercuryOn = () => APP_ENV === 'test';          // (set by the test-only checks and demo, which are not in the live build)
const SUPABASE_URL = '@config(supabaseUrl)';
const SUPABASE_ANON_KEY = '@config(anonKey)';
const STAFF_EMAIL = 'staff@merkaz-cherum.local';
// A kids' screen that joined with a code sends its token with every data request (the header "x-tv-token"): the server shows the
// screen's data only to such a screen or to signed-in staff (scheduling-v74.sql). Only data requests carry it, not the sign-in ones.
const tvFetch = (input, init) => {
  let tok = null; try { tok = localStorage.getItem('ramzor-tv-token'); } catch(e){}
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if(!tok || url.indexOf('/rest/v1/') < 0) return fetch(input, init);
  const h = new Headers((init && init.headers) || {}); h.set('x-tv-token', tok);
  return fetch(input, Object.assign({}, init, { headers:h }));
};
let sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global:{ fetch:tvFetch } });          // the Ramzor's connection: the shared staff login; after a personal sign-in it becomes the personal one (see personalEnter)
const sbShared = sb;

// The manager has a login of his own (see supabase/roles.sql). Management screens write through this second
// connection, which holds the manager's session only in memory for a few minutes — instructors can never
// delete children, reset the boards or edit the lists, because the DATABASE refuses it.
const MANAGER_LOGIN = '@config(managerLogin)' === 'True';     // switched on in config/<env>.json once roles.sql was run in that project
const MANAGER_EMAIL = 'manager@merkaz-cherum.local';
const sbAdmin = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth:{ persistSession:false, autoRefreshToken:true, detectSessionInUrl:false, storageKey:'ramzor-manager-auth' } });

