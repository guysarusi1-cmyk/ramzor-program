// Supabase Edge Function: tw-mail (the two-week schedule's e-mails; Guy 2026-11-14)
// Runs every hour (supabase/core/mail-v1.sql) and right after a schedule is published (the site calls it). Each time it sends only what is due:
//   1. a reminder, about a day before the hand-in closes, to every person on the list who signs in and has not handed in yet;
//   2. "the schedule is published", once per publishing, to every person on the list who signs in, with her own shifts.
// What was sent is written in tw_mail_log, so calling it again sends nothing twice. So anybody may call it (no JWT check): it never
// sends more than what is due. The body {"dry":true} only says what it would send.
// Needs the secret RESEND_API_KEY (Edge Functions -> Secrets). Deploy: Edge Functions -> Deploy a new function -> name: tw-mail ->
// paste this file -> turn OFF "Verify JWT".
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const SHIFT: Record<string, string> = { M: 'בוקר', A: 'צהריים', N: 'לילה', W: 'סוף שבוע' };
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dm = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d}/${m}`; };
const dow = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
const page = (title: string, inner: string, site: string) => `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6">
  <h2 style="margin:0 0 12px">${esc(title)}</h2>${inner}
  ${site ? `<p><a href="${esc(site)}" style="display:inline-block;padding:10px 18px;background:#1C1A17;color:#F3EEE4;border-radius:10px;text-decoration:none">כניסה לסידור</a></p>` : ''}</div>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, resend = Deno.env.get('RESEND_API_KEY') ?? '';
    const body = await req.json().catch(() => ({}));
    const dry = !!body?.dry;
    const db = createClient(url, service, { auth: { persistSession: false } });
    const [org, sets, people, priv] = await Promise.all([
      db.from('org_profile').select('name').limit(1).maybeSingle(),
      db.from('tw_settings').select('key,value'),
      db.from('tw_people').select('id,name,staff_id,active'),
      db.from('staff_private').select('staff_id,email,auth_user_id'),
    ]);
    const orgName = org.data?.name || 'סידור העבודה';
    const site = String((sets.data || []).find((s) => s.key === 'site_url')?.value || '');
    const from = `${orgName} <no-reply@mercuryteam.app>`;
    const mailOf: Record<string, string> = {};
    (priv.data || []).forEach((p) => { if (p.email && p.auth_user_id) mailOf[p.staff_id] = p.email; });
    const reachable = (people.data || []).filter((p) => p.active && p.staff_id && mailOf[p.staff_id]);
    const sent: unknown[] = [], errors: unknown[] = [];
    const send = async (to: string, subject: string, html: string) => {
      if (dry) { sent.push({ to, subject }); return true; }
      if (!resend) { errors.push('RESEND_API_KEY is missing'); return false; }
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html }) });
      if (!r.ok) { errors.push({ to, status: r.status, text: (await r.text()).slice(0, 200) }); return false; }
      sent.push({ to, subject }); return true;
    };
    const logged = async (period: string, kind: string, mark: string) => (await db.from('tw_mail_log').select('period').eq('period', period).eq('kind', kind).eq('mark', mark).limit(1)).data?.length;
    const log = async (period: string, kind: string, mark: string, count: number) => { if (!dry) await db.from('tw_mail_log').insert({ period, kind, mark, count }); };

    // 1. the reminder: the hand-in closes within a day
    const now = Date.now(), soon = new Date(now + 26 * 3600 * 1000).toISOString();
    const open = (await db.from('tw_period').select('start,deadline').eq('status', 'open').not('deadline', 'is', null).gt('deadline', new Date(now).toISOString()).lte('deadline', soon)).data || [];
    for (const p of open) {
      if (await logged(p.start, 'reminder', '')) continue;
      const subs = new Set(((await db.from('tw_submission').select('person').eq('period', p.start)).data || []).map((s) => s.person));
      const who = reachable.filter((x) => !subs.has(x.id));
      const until = new Date(p.deadline).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
      let n = 0;
      for (const x of who) {
        const html = page('תזכורת: הגשת העדפות', `<p>שלום ${esc(x.name)},</p><p>ההגשה של ההעדפות לשבועיים ${dm(p.start)}–${dm(addDays(p.start, 13))} נסגרת ב${esc(until)}.</p><p>עדיין לא התקבלה הגשה ממך.</p>`, site);
        if (await send(mailOf[x.staff_id], `תזכורת: הגשת העדפות עד ${dm(p.deadline)}`, html)) n++;
      }
      await log(p.start, 'reminder', '', n);
    }

    // 2. the schedule was published (again after a new publishing)
    const pub = (await db.from('tw_period').select('start,published_at').eq('status', 'published').not('published_at', 'is', null)).data || [];
    for (const p of pub) {
      if (addDays(p.start, 13) < new Date().toISOString().slice(0, 10)) continue;          // (two weeks that already ended)
      if (await logged(p.start, 'published', p.published_at)) continue;
      const asg = (await db.from('tw_assignment').select('day,shift,person').eq('period', p.start).order('day')).data || [];
      let n = 0;
      for (const x of reachable) {
        const mine = asg.filter((a) => a.person === x.id);
        const list = mine.length ? `<ul>${mine.map((a) => `<li>יום ${dow(a.day)} ${dm(a.day)} · ${SHIFT[a.shift] || a.shift}</li>`).join('')}</ul>` : '<p>אין לך משמרות בשבועיים האלה.</p>';
        const html = page('הסידור פורסם', `<p>שלום ${esc(x.name)},</p><p>הסידור לשבועיים ${dm(p.start)}–${dm(addDays(p.start, 13))} פורסם. המשמרות שלך:</p>${list}`, site);
        if (await send(mailOf[x.staff_id], `הסידור לשבועיים ${dm(p.start)}–${dm(addDays(p.start, 13))} פורסם`, html)) n++;
      }
      await log(p.start, 'published', p.published_at, n);
    }
    return reply({ ok: true, dry, sent, errors });
  } catch (e) {
    return reply({ error: String(e) }, 500);
  }
});
