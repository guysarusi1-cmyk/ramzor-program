// Supabase Edge Function: tw-mail (the two-week schedule's e-mails; Guy 2026-11-14)
// Runs every hour (supabase/core/mail-v1.sql) and right after a schedule is published (the site calls it). Each time it sends only what is due:
//   1. a reminder, about a day before the hand-in closes, to every person on the list who signs in and has not handed in yet;
//   2. "the schedule is published", once per publishing, to every person on the list who signs in, with her own shifts;
//   3. (scheduling-v86.sql, the pilot 19.11) the changes after publishing, together, when the builder pressed "שליחת עדכונים";
//   4. (v86) a new swap request, once, to whoever could take it (not working that day);
//   each person chooses which of these she gets (tw_pref.notify; all on at the start); before v86 everybody gets 1 and 2 as before.
// What was sent is written in tw_mail_log, so calling it again sends nothing twice.
// Only the database calls it (core/mail-v2.sql: the hourly job and tw_publish), with the shared secret in the header x-tw-secret;
// a call without it gets 401 and nothing else (Yigal 2026-11-14). The answer says only "ok": no names, no counts.
// One database for many organisations (scheduling-v81.sql): it goes over every organisation, and every query carries its org_id.
// Needs two secrets (Edge Functions, Secrets): RESEND_API_KEY and TW_MAIL_SECRET (the same value as tw_mail_secret in the Vault).
// Deploy: Edge Functions, the function tw-mail, Code: paste this file, Deploy. "Verify JWT" stays OFF (the secret replaces it).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tw-secret' };
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
  const secret = Deno.env.get('TW_MAIL_SECRET') ?? '';
  if (!secret || req.headers.get('x-tw-secret') !== secret) return new Response(null, { status: 401 });          // (no secret set: nothing gets in)
  try {
    const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, resend = Deno.env.get('RESEND_API_KEY') ?? '';
    const dry = false;
    const db = createClient(url, service, { auth: { persistSession: false } });
    const sent: unknown[] = [], errors: unknown[] = [];
    const orgs = (await db.from('org').select('id,name')).data || [];
    // one database, many organisations (scheduling-v81.sql): every organisation on its own, every query inside it
    for (const org of orgs) {
    const O = org.id;
    const [sets, people, priv, prefs] = await Promise.all([
      db.from('tw_settings').select('key,value').eq('org_id', O),
      db.from('tw_people').select('id,name,staff_id,active').eq('org_id', O),
      db.from('staff_private').select('staff_id,email,auth_user_id').eq('org_id', O),
      db.from('tw_pref').select('person,notify').eq('org_id', O),
    ]);
    const v86 = !prefs.error;
    const wants = (pid: string, kind: string) => { const p = (prefs.data || []).find((x) => x.person === pid); return !p || !p.notify || p.notify[kind] !== false; };
    const orgName = org.name || 'סידור העבודה';
    const site = String((sets.data || []).find((s) => s.key === 'site_url')?.value || '');
    const from = `${orgName} <no-reply@mercuryteam.app>`;
    const mailOf: Record<string, string> = {};
    (priv.data || []).forEach((p) => { if (p.email && p.auth_user_id) mailOf[p.staff_id] = p.email; });
    const reachable = (people.data || []).filter((p) => p.active && p.staff_id && mailOf[p.staff_id]);
    const send = async (to: string, subject: string, html: string) => {
      if (dry) { sent.push({ to, subject }); return true; }
      if (!resend) { errors.push('RESEND_API_KEY is missing'); return false; }
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html }) });
      if (!r.ok) { errors.push({ to, status: r.status, text: (await r.text()).slice(0, 200) }); return false; }
      sent.push({ to, subject }); return true;
    };
    const logged = async (period: string, kind: string, mark: string) => (await db.from('tw_mail_log').select('period').eq('org_id', O).eq('period', period).eq('kind', kind).eq('mark', mark).limit(1)).data?.length;
    const log = async (period: string, kind: string, mark: string, count: number) => { if (!dry) await db.from('tw_mail_log').insert({ org_id: O, period, kind, mark, count }); };

    // 1. the reminder: the hand-in closes within a day
    const now = Date.now(), soon = new Date(now + 26 * 3600 * 1000).toISOString();
    const open = (await db.from('tw_period').select('start,deadline').eq('org_id', O).eq('status', 'open').not('deadline', 'is', null).gt('deadline', new Date(now).toISOString()).lte('deadline', soon)).data || [];
    for (const p of open) {
      if (await logged(p.start, 'reminder', '')) continue;
      const subs = new Set(((await db.from('tw_submission').select('person').eq('org_id', O).eq('period', p.start)).data || []).map((s) => s.person));
      const who = reachable.filter((x) => !subs.has(x.id) && wants(x.id, 'reminder'));
      const until = new Date(p.deadline).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
      let n = 0;
      for (const x of who) {
        const html = page('תזכורת: הגשת העדפות', `<p>שלום ${esc(x.name)},</p><p>ההגשה של ההעדפות לשבועיים ${dm(p.start)}–${dm(addDays(p.start, 13))} נסגרת ב${esc(until)}.</p><p>עדיין לא התקבלה הגשה ממך.</p>`, site);
        if (await send(mailOf[x.staff_id], `תזכורת: הגשת העדפות עד ${dm(p.deadline)}`, html)) n++;
      }
      await log(p.start, 'reminder', '', n);
    }

    // 2. the schedule was published (again after a new publishing)
    const pub = (await db.from('tw_period').select('start,published_at').eq('org_id', O).eq('status', 'published').not('published_at', 'is', null)).data || [];
    for (const p of pub) {
      if (addDays(p.start, 13) < new Date().toISOString().slice(0, 10)) continue;          // (two weeks that already ended)
      if (await logged(p.start, 'published', p.published_at)) continue;
      const asg = (await db.from('tw_assignment').select('day,shift,person').eq('org_id', O).eq('period', p.start).order('day')).data || [];
      let n = 0;
      for (const x of reachable) {
        if (!wants(x.id, 'published')) continue;
        const mine = asg.filter((a) => a.person === x.id);
        const list = mine.length ? `<ul>${mine.map((a) => `<li>יום ${dow(a.day)} ${dm(a.day)} · ${SHIFT[a.shift] || a.shift}</li>`).join('')}</ul>` : '<p>אין לך משמרות בשבועיים האלה.</p>';
        const html = page('הסידור פורסם', `<p>שלום ${esc(x.name)},</p><p>הסידור לשבועיים ${dm(p.start)}–${dm(addDays(p.start, 13))} פורסם. המשמרות שלך:</p>${list}`, site);
        if (await send(mailOf[x.staff_id], `הסידור לשבועיים ${dm(p.start)}–${dm(addDays(p.start, 13))} פורסם`, html)) n++;
      }
      await log(p.start, 'published', p.published_at, n);
    }

    if (v86) {
      // 3. the changes after publishing, when the builder pressed "שליחת עדכונים": one mail per person, the changes that are still changes
      const due = (await db.from('tw_notice').select('id,person,period,day,shift,kind,created_at').eq('org_id', O).eq('mail_due', true).is('mailed_at', null).order('created_at')).data || [];
      const byPerson: Record<string, typeof due> = {};
      due.forEach((n) => { (byPerson[n.person] = byPerson[n.person] || []).push(n); });
      for (const [pid, list] of Object.entries(byPerson)) {
        const x = reachable.find((r) => r.id === pid);
        const net: Record<string, { day: string; shift: string; first: string; last: string }> = {};
        list.forEach((n) => { const k = n.day + '|' + n.shift; if (!net[k]) net[k] = { day: n.day, shift: n.shift, first: n.kind, last: n.kind }; else net[k].last = n.kind; });
        const real = Object.values(net).filter((v) => v.first === v.last).sort((a, b) => a.day < b.day ? -1 : 1);          // (added and then removed again: no change)
        let ok = true;
        if (x && real.length && wants(pid, 'changed')) {
          const html = page('שינוי במשמרות שלך', `<p>שלום ${esc(x.name)},</p><p>היו שינויים במשמרות שלך בסידור שפורסם:</p><ul>${real.map((v) => `<li>${v.last === 'added' ? 'נוספה' : 'בוטלה'}: יום ${dow(v.day)} ${dm(v.day)} · ${SHIFT[v.shift] || v.shift}</li>`).join('')}</ul>`, site);
          ok = await send(mailOf[x.staff_id], 'שינוי במשמרות שלך', html);
        }
        if (ok && !dry) await db.from('tw_notice').update({ mailed_at: new Date().toISOString() }).eq('org_id', O).in('id', list.map((n) => n.id));
      }
      // 4. a new swap request: once, to whoever does not work that day (the site shows the exact ones; the mail only calls to look)
      const today = new Date().toISOString().slice(0, 10);
      const swaps = (await db.from('tw_swap').select('id,period,day,shift,from_person').eq('org_id', O).eq('status', 'open').is('mailed_at', null).gte('day', today)).data || [];
      for (const sw of swaps) {
        const busy = new Set(((await db.from('tw_assignment').select('person').eq('org_id', O).eq('day', sw.day)).data || []).map((a) => a.person));
        for (const x of reachable) {
          if (x.id === sw.from_person || busy.has(x.id) || !wants(x.id, 'swap')) continue;
          const html = page('מחפשים החלפה', `<p>שלום ${esc(x.name)},</p><p>מחפשים מישהו/י למשמרת: יום ${dow(sw.day)} ${dm(sw.day)} · ${SHIFT[sw.shift] || sw.shift}.</p><p>אם זה מתאים לך, לוקחים אותה באתר, בלשונית "החלפות".</p>`, site);
          await send(mailOf[x.staff_id], `מחפשים החלפה: ${SHIFT[sw.shift] || sw.shift} ${dm(sw.day)}`, html);
        }
        if (!dry) await db.from('tw_swap').update({ mailed_at: new Date().toISOString() }).eq('org_id', O).eq('id', sw.id);
      }
    }
    }          // (the next organisation)
    if (errors.length) console.error('tw-mail', JSON.stringify(errors));          // (the details stay in the function's own log)
    return reply({ ok: true });
  } catch (e) {
    console.error('tw-mail', String(e));
    return reply({ ok: false }, 500);
  }
});
