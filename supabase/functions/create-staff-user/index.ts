// Supabase Edge Function: create-staff-user
// The coordinator presses "create login" next to a person who has an e-mail address. This function (running with the service key that
// only Supabase holds) creates the sign-in account for that e-mail and links it to the person. Sign-ups stay closed for everybody else.
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> name: create-staff-user -> paste this file.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('Authorization') ?? '';
    // 1. who is asking? (their own token; only a coordinator or the manager may continue)
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const allowed = await asUser.rpc('is_coordinator');
    if (allowed.error || allowed.data !== true) return reply({ error: 'not allowed' }, 403);
    const { staff_id } = await req.json();
    if (!staff_id) return reply({ error: 'staff_id is missing' }, 400);
    // 2. the address that the coordinator wrote for that person
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const row = await admin.from('staff_private').select('email, auth_user_id').eq('staff_id', staff_id).single();
    if (row.error || !row.data?.email) return reply({ error: 'no e-mail address for this person' }, 400);
    if (row.data.auth_user_id) return reply({ ok: true, already: true });
    // 3. create (or find) the account, with the address confirmed, and link it
    const email = String(row.data.email).trim().toLowerCase();
    let userId: string | null = null;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) {
      const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = list.data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
      if (!userId) return reply({ error: created.error.message }, 400);
    } else userId = created.data.user.id;
    const link = await admin.from('staff_private').update({ auth_user_id: userId }).eq('staff_id', staff_id);
    if (link.error) return reply({ error: link.error.message }, 400);
    return reply({ ok: true });
  } catch (e) {
    return reply({ error: String(e) }, 500);
  }
});