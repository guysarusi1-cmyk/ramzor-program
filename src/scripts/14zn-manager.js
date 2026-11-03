// ---- "פורטל המנהלת" (Guy 2026-11-03; the spec: Mercury-Work-Manager plans/MANAGER-ROLE-SPEC.md; scheduling-v52.sql)
// The manager of the framework (staff kind 'manager'): not the admin, not the coordinator. Every rule is kept in the database too:
//   * the schedule: read only           * the general timetable: she changes it, the coordinator is told
//   * the children: the plans, the progress and the diary, read only; opening the detail is logged (the admin reads the log)
//   * conversations with the coordinator and the social workers (one-to-one or groups; a child as the topic)
//   * messages to the staff (everybody or chosen people; portal or also e-mail) with who saw and who confirmed "קראתי"
//   * the WhatsApp group of the framework: a shortcut only
const mgr = { week:null, conv:null, kidsLoaded:false };
const MGR_TABS = [['mhome', 'בית'], ['schedule', 'סידור העבודה'], ['timetable', 'לו"ז'], ['kids', 'הילדים'], ['chats', 'שיחות'], ['msgs', 'הודעות לצוות']];
const mgrIsMe = () => (portalMe() || {}).role === 'manager';
const mgrShort = iso => { const t = parseIso(iso); return t.getDate() + '/' + (t.getMonth() + 1); };
const mgrWeekStart = () => { const t = isoDate(new Date()); return mgr.week || addDays(t, -dowOf(t)); };
async function mgrKids(){          // the children's names: the manager reads the roster with her own sign-in
  if(typeof roster !== 'undefined' && roster.length) return roster;
  try { const r = await sbPersonal.from('roster').select('*'); if(!r.error && typeof roster !== 'undefined'){ roster = r.data || []; } } catch(e){}
  return typeof roster !== 'undefined' ? roster : [];
}
async function mgrRender(t, body){
  if(typeof sb !== 'undefined' && portalServerOn) sb = sbPersonal;          // (the timetable editor of the ahmash control reads with the personal session)
  if(t === 'schedule') return mgrSchedule(body);
  if(t === 'timetable') return mgrTimetable(body);
  if(t === 'kids') return mgrKidsTab(body);
  if(t === 'chats') return mgrChats(body);
  if(t === 'msgs') return mgrMessages(body);
  return mgrHome(body);
}
// ---- home: the current week (Sunday–Saturday, Guy: "השבוע הנוכחי"), the timetable of the week, and the ways in
async function mgrHome(body){
  const st = portalLoad(), start = mgrWeekStart(), days = Array.from({ length:7 }, (_, i) => addDays(start, i)), mk = monthKeyOf(start), m = portalMonth(mk);
  const thisWeek = start === addDays(isoDate(new Date()), -dowOf(isoDate(new Date())));
  const fixed = await sbPersonal.from('timetable_fixed').select('weekday,items'), daily = await sbPersonal.from('timetable_day').select('day,items').gte('day', days[0]).lte('day', days[6]);
  const unread = await mgrUnreadCount();
  if(!body.isConnected) return;
  const ttOf = d => ((daily.data || []).find(x => x.day === d) || (fixed.data || []).find(x => x.weekday === dowOf(d)) || {}).items || [];
  const wk = mcalWeekOfDay(mk, start < mk + '-01' ? mk + '-01' : start);
  const group = String((st.waMsg || {}).group || '').trim();
  body.innerHTML = `
    <div class="mcal-weeknav mgr-weeknav"><button type="button" class="mcal-wk" data-mw="-7" aria-label="השבוע הקודם">›</button><b>${thisWeek ? 'השבוע הנוכחי' : 'שבוע'} ${mgrShort(days[0])}–${mgrShort(days[6])}</b><button type="button" class="mcal-wk" data-mw="7" aria-label="השבוע הבא">‹</button></div>
    <div class="mgr-links">
      <button type="button" class="btn ghost" data-mgo="chats">שיחות${unread ? ` <span class="pcount">${unread}</span>` : ''}</button>
      <button type="button" class="btn ghost" data-mgo="msgs">הודעה לצוות</button>
      <button type="button" class="btn ghost" data-mgo="kids">תוכניות הילדים</button>
      ${group ? `<a class="btn ghost wa-group" href="${pEsc(waGroupUrl(group))}"${waTarget()}>${WA_SVG}<span>קבוצת הצוות</span></a>` : ''}
    </div>
    <details class="pfold" data-fold="m-sched" open><summary><span>סידור העבודה השבוע</span></summary><div class="pfold-body">
      ${m.published ? monthCalHtml(portalCtx(mk), m.assignments, { week:wk, rows:true }) : '<div class="pnote">הסידור של החודש עוד לא פורסם.</div>'}
    </div></details>
    <details class="pfold" data-fold="m-tt" open><summary><span>הלו"ז השבוע</span></summary><div class="pfold-body mgr-tt">
      ${days.map(d => `<div class="mcal-wrow${d === isoDate(new Date()) ? ' today' : ''}"><div class="mcal-wrow-day"><b>${DOW_SHORT[dowOf(d)]}</b><span>${mgrShort(d)}</span></div><div class="mgr-tt-day">${ttOf(d).length ? ttOf(d).map(x => `<span class="mgr-tt-item"><bdi dir="ltr">${pEsc(x.t || '')}</bdi> ${pEsc(x.n || '')}</span>`).join('') : '<span class="pnote">—</span>'}</div></div>`).join('')}
    </div></details>`;
  body.querySelectorAll('[data-mw]').forEach(b => b.addEventListener('click', () => { mgr.week = addDays(mgrWeekStart(), +b.dataset.mw); const nm = monthKeyOf(mgr.week); if(nm !== portalUi.month){ portalUi.month = nm; } mgrHome(body); }));
  body.querySelectorAll('[data-mgo]').forEach(b => b.addEventListener('click', () => showPortal(b.dataset.mgo)));
  wireFolds(body);
}
// ---- the schedule: read only, a week at first
function mgrSchedule(body){
  const mk = portalUi.month || (portalUi.month = monthKeyOf(isoDate(new Date()))), m = portalMonth(mk), today = isoDate(new Date());
  const wk = portalUi.mgrMonthView ? null : portalUi.mgrWeekMk === mk ? portalUi.mgrWeek : mk === monthKeyOf(today) ? mcalWeekOfDay(mk, today) : 0;
  body.innerHTML = `${monthNavHtml(mk)}<div class="pnote">צפייה בלבד.</div>${m.published ? mcalViewBarHtml(mk, wk, 'mgr-viewbar') + monthCalHtml(portalCtx(mk), m.assignments, { week:wk === null ? undefined : wk, rows:true }) : '<div class="pnote">הסידור של החודש עוד לא פורסם.</div>'}`;
  wireMonthNav(body);
  mcalViewBarWire(body, 'mgr-viewbar', mk, () => wk, (mm, w) => { portalUi.mgrMonthView = w === null; portalUi.mgrWeek = w; portalUi.mgrWeekMk = mm; portalUi.month = mm; }, () => portalRefresh());
}
// ---- the general timetable: the same editor as the ahmash control; the database tells the coordinator about her changes
async function mgrTimetable(body){
  body.innerHTML = '<div class="pnote">שינוי שלך בלו"ז נשמר מיד, והרכזת מקבלת על כך הודעה בפורטל.</div><div id="mgr-tt"><div class="pnote">רק רגע...</div></div>';
  try { await ctlTimetable(body.querySelector('#mgr-tt')); } catch(e){ body.querySelector('#mgr-tt').innerHTML = '<div class="pstatus bad">הלו"ז לא נטען. אפשר לנסות שוב.</div>'; }
}
// ---- the children: a short summary of each plan, the full plan and the diary read only; opening the detail is logged
async function mgrKidsTab(body){
  body.innerHTML = '<div class="pnote">רק רגע...</div>';
  const kids = (await mgrKids()).slice().sort((a, b) => displayName(a).localeCompare(displayName(b), 'he'));
  const [pl, ev] = await Promise.all([sbPersonal.from('child_plans').select('child_id,published,published_at,review_date'), sbPersonal.from('child_diary').select('child_id,day').gte('day', addDays(isoDate(new Date()), -1))]);
  if(!body.isConnected) return;
  const plan = id => (pl.data || []).find(p => p.child_id === id), upcoming = id => (ev.data || []).filter(e => e.child_id === id).length;
  body.innerHTML = `<div class="pnote">קריאה בלבד. פתיחת פירוט נרשמת.</div><div class="mgr-kids">${kids.map(c => { const p = plan(c.id), goals = p && p.published && Array.isArray(p.published.goals) ? p.published.goals : [];
    return `<div class="card mgr-kid"><div class="mgr-kid-h"><b class="ar-keep">${pEsc(displayName(c))}</b>${p && p.published ? `<small>תוכנית פורסמה${p.published_at ? ' ' + mgrShort(String(p.published_at).slice(0, 10)) : ''}</small>` : '<small>אין תוכנית מפורסמת</small>'}</div>
      ${goals.length ? `<ul class="mgr-goals">${goals.slice(0, 3).map(g => `<li>${pEsc(g.title || g.text || '')}</li>`).join('')}${goals.length > 3 ? `<li class="pnote">ועוד ${goals.length - 3}</li>` : ''}</ul>` : ''}
      <div class="mgr-kid-acts">${p && p.published ? `<button type="button" class="btn ghost small" data-mk-plan="${pEsc(c.id)}">פירוט התוכנית</button>` : ''}<button type="button" class="btn ghost small" data-mk-diary="${pEsc(c.id)}">יומן${upcoming(c.id) ? ` (${upcoming(c.id)})` : ''}</button></div></div>`; }).join('') || '<div class="pnote">אין ילדים ברשימה.</div>'}</div>`;
  body.querySelectorAll('[data-mk-plan]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.mkPlan, p = plan(id);
    await sbPersonal.from('therapy_access').insert({ child_id:id, what:'פירוט תוכנית (מנהלת)' });          // (logged before it opens)
    const goals = (p.published && p.published.goals) || [];
    portalSheet(`<h2>התוכנית של ${pEsc(dgName(id))}</h2><div class="pnote">קריאה בלבד.</div>${goals.map(g => `<div class="card"><b>${pEsc(g.title || '')}</b>${g.why ? `<div class="pnote">${pEsc(g.why)}</div>` : ''}${(g.targets || []).length ? `<ul>${g.targets.map(x => `<li>${pEsc(x.text || x.title || '')}</li>`).join('')}</ul>` : ''}${(g.interventions || []).length ? `<div class="pnote">${g.interventions.map(x => pEsc(x.name || x.what || '')).join(' · ')}</div>` : ''}</div>`).join('') || '<div class="pnote">אין מטרות.</div>'}
      <div class="confirm-actions"><button type="button" class="btn" data-close>סגירה</button></div>`);
  }));
  body.querySelectorAll('[data-mk-diary]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.mkDiary, [e, s] = await Promise.all([sbPersonal.from('child_diary').select('*').eq('child_id', id), sbPersonal.from('child_diary_skip').select('*')]);
    const today = isoDate(new Date()), occ = dgOccurrences(e.data || [], s.data || [], addDays(today, -7), addDays(today, 45));
    portalSheet(`<h2>היומן של ${pEsc(dgName(id))}</h2><div class="pnote">קריאה בלבד. העו"סית האחראית עורכת.</div>${occ.length ? occ.map(o => `<div class="dg-day-h">${pEsc(DOW_NAMES[dowOf(o.day)])} ${mgrShort(o.day)}</div>${dgLineHtml(o).replace('<button type="button"', '<div').replace('</button>', '</div>')}`).join('') : '<div class="pnote">אין אירועים קרובים.</div>'}
      <div class="confirm-actions"><button type="button" class="btn" data-close>סגירה</button></div>`);
  }));
}
// ---- conversations (one-to-one or groups) with the coordinator and the social workers
async function mgrUnreadCount(){
  try {
    const mem = await sbPersonal.from('conv_member').select('conv_id,last_read').eq('staff_id', srv.me); if(mem.error) return 0;
    let n = 0; for(const x of mem.data || []){ let q = sbPersonal.from('conv_msg').select('id', { count:'exact', head:true }).eq('conv_id', x.conv_id).neq('from_staff', srv.me); if(x.last_read) q = q.gt('at', x.last_read); const r = await q; n += r.count || 0; }
    return n;
  } catch(e){ return 0; }
}
async function mgrChats(body){
  const [mem, staff] = await Promise.all([sbPersonal.from('conv_member').select('conv_id,last_read,staff_id'), sbPersonal.from('staff').select('id,display_name,kind,active')]);
  if(!body.isConnected) return;
  if(mem.error){ body.innerHTML = '<div class="pstatus bad">השיחות עוד לא זמינות כאן (חסר עדכון במסד: scheduling-v52.sql).</div>'; return; }
  const names = {}; (staff.data || []).forEach(s => { names[s.id] = s.display_name; });
  const convIds = [...new Set((mem.data || []).map(x => x.conv_id))];
  const convs = convIds.length ? ((await sbPersonal.from('conv').select('*').in('id', convIds)).data || []) : [];
  const last = {}; for(const c of convs){ const r = await sbPersonal.from('conv_msg').select('text,at,from_staff').eq('conv_id', c.id).order('at', { ascending:false }).limit(1); last[c.id] = (r.data || [])[0]; }
  if(!body.isConnected) return;
  const members = id => (mem.data || []).filter(x => x.conv_id === id && x.staff_id !== srv.me).map(x => names[x.staff_id] || '?');
  const myRead = id => ((mem.data || []).find(x => x.conv_id === id && x.staff_id === srv.me) || {}).last_read;
  if(mgr.conv && convs.some(c => c.id === mgr.conv)) return mgrThread(body, convs.find(c => c.id === mgr.conv), names, members(mgr.conv));
  convs.sort((a, b) => String((last[b.id] || {}).at || b.created_at).localeCompare(String((last[a.id] || {}).at || a.created_at)));
  body.innerHTML = `<div class="mgr-chat-top"><button type="button" class="btn small" id="mc-new">+ שיחה חדשה</button></div>
    ${convs.length ? convs.map(c => { const l = last[c.id], fresh = l && l.from_staff !== srv.me && (!myRead(c.id) || l.at > myRead(c.id));
      return `<button type="button" class="card mgr-conv${fresh ? ' fresh' : ''}" data-mc="${c.id}"><b>${pEsc(c.title || members(c.id).join(', '))}</b>${c.child_id ? `<small>בנושא: <span class="ar-keep">${pEsc(dgName(c.child_id))}</span></small>` : ''}<small>${l ? pEsc((names[l.from_staff] || '') + ': ' + l.text.slice(0, 80)) : 'אין הודעות עדיין'}</small></button>`; }).join('') : '<div class="pnote">אין שיחות עדיין.</div>'}`;
  body.querySelectorAll('[data-mc]').forEach(b => b.addEventListener('click', () => { mgr.conv = b.dataset.mc; mgrChats(body); }));
  body.querySelector('#mc-new').addEventListener('click', async () => {
    const people = (staff.data || []).filter(s => s.active && s.id !== srv.me && ['coordinator', 'therapist', 'manager', 'admin'].includes(s.kind));
    const kids = await mgrKids();
    const sh = portalSheet(`<h2>שיחה חדשה</h2><div class="pnote">בוחרים אדם אחד או כמה.</div>
      <div class="pchoice wrap mc-people">${people.map(s => `<button type="button" data-mcp="${s.id}" aria-pressed="false">${pEsc(s.display_name)}</button>`).join('')}</div>
      <label class="pfield">שם לשיחה (לא חובה)<input type="text" id="mc-title" maxlength="80"></label>
      <label class="pfield">ילד/ה כנושא (לא חובה)<select id="mc-child"><option value="">—</option>${kids.map(c => `<option value="${pEsc(c.id)}">${pEsc(displayName(c))}</option>`).join('')}</select></label>
      <div class="pnote">קישור ילד/ה כנושא לא פותח לאף אחד מידע שאין לו הרשאה אליו.</div>
      <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="mc-go">פתיחה</button></div>`);
    sh.querySelectorAll('[data-mcp]').forEach(x => x.addEventListener('click', () => { const on = x.getAttribute('aria-pressed') !== 'true'; x.setAttribute('aria-pressed', String(on)); x.classList.toggle('on', on); }));
    sh.querySelector('#mc-go').addEventListener('click', async () => {
      const ids = [...sh.querySelectorAll('[data-mcp][aria-pressed=true]')].map(x => x.dataset.mcp); if(!ids.length){ toast('בחרו לפחות אדם אחד'); return; }
      const r = await sbPersonal.rpc('open_conversation', { p_members:ids, p_title:sh.querySelector('#mc-title').value, p_child:sh.querySelector('#mc-child').value });
      if(r.error){ toast('השיחה לא נפתחה'); return; }
      sh.close(); mgr.conv = r.data; mgrChats(body);
    });
  });
}
async function mgrThread(body, c, names, others){
  const msgs = await sbPersonal.from('conv_msg').select('*').eq('conv_id', c.id).order('at');
  await sbPersonal.from('conv_member').update({ last_read:new Date().toISOString() }).eq('conv_id', c.id).eq('staff_id', srv.me);
  if(!body.isConnected) return;
  body.innerHTML = `<button type="button" class="btn ghost small" id="mc-back">→ כל השיחות</button>
    <h2 class="psec">${pEsc(c.title || others.join(', '))}</h2>${c.child_id ? `<div class="pnote">בנושא: <span class="ar-keep">${pEsc(dgName(c.child_id))}</span> · משתתפים: ${pEsc(others.join(', '))}</div>` : `<div class="pnote">משתתפים: ${pEsc(others.join(', '))}</div>`}
    <div class="mgr-thread">${(msgs.data || []).map(x => `<div class="mgr-msg${x.from_staff === srv.me ? ' mine' : ''}"><small>${pEsc(names[x.from_staff] || '')} · ${new Date(x.at).toLocaleString('he-IL', { day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit' })}</small><div>${pEsc(x.text)}</div></div>`).join('') || '<div class="pnote">אין הודעות עדיין.</div>'}</div>
    <div class="mgr-compose"><textarea id="mc-text" rows="2" maxlength="2000" placeholder="כתיבת הודעה"></textarea><button type="button" class="btn" id="mc-send">שליחה</button></div>`;
  body.querySelector('#mc-back').addEventListener('click', () => { mgr.conv = null; mgrChats(body); });
  body.querySelector('#mc-send').addEventListener('click', async () => {
    const t = body.querySelector('#mc-text').value.trim(); if(!t) return;
    const r = await sbPersonal.from('conv_msg').insert({ conv_id:c.id, from_staff:srv.me, text:t });
    if(r.error){ toast('לא נשלח. אפשר לנסות שוב.'); return; }
    mgrThread(body, c, names, others);
  });
}
// ---- messages to the staff: everybody or chosen people; the portal only or also e-mail; seen and "קראתי" apart
async function mgrMessages(body){
  const [an, staff] = await Promise.all([sbPersonal.from('announcements').select('id,created_at,text,via,audience,need_ack,from_staff').eq('from_staff', srv.me).order('created_at', { ascending:false }).limit(20), sbPersonal.from('staff').select('id,display_name,kind,active')]);
  if(!body.isConnected) return;
  if(an.error){ body.innerHTML = '<div class="pstatus bad">ההודעות לצוות עוד לא זמינות כאן (חסר עדכון במסד: scheduling-v52.sql).</div>'; return; }
  const ids = (an.data || []).map(a => a.id), reads = ids.length ? ((await sbPersonal.from('announcement_read').select('ann_id,staff_id,seen_at,ack_at').in('ann_id', ids)).data || []) : [];
  const names = {}; (staff.data || []).forEach(s => { names[s.id] = s.display_name; });
  const team = (staff.data || []).filter(s => s.active && ['instructor', 'service', 'teacher'].includes(s.kind)).sort((a, b) => a.display_name.localeCompare(b.display_name, 'he'));
  const to = a => a.audience ? a.audience : team.map(s => s.id);
  body.innerHTML = `<div class="card mgr-new-msg"><h3 class="psec">הודעה חדשה לצוות</h3>
      <textarea id="mm-text" rows="3" maxlength="1500" placeholder="מה רוצים לומר?"></textarea>
      <div class="mx-seg mgr-seg" role="group" aria-label="למי"><button type="button" data-mm-to="all" aria-pressed="true">לכל הצוות</button><button type="button" data-mm-to="some" aria-pressed="false">לחלק מהצוות</button></div>
      <div class="pchoice wrap mm-people" hidden>${team.map(s => `<button type="button" data-mmp="${s.id}" aria-pressed="false">${pEsc(s.display_name)}</button>`).join('')}</div>
      <div class="mx-seg mgr-seg" role="group" aria-label="איך"><button type="button" data-mm-via="portal" aria-pressed="true">בפורטל</button><button type="button" data-mm-via="both" aria-pressed="false">בפורטל ובמייל</button></div>
      <label class="oc-ordered"><input type="checkbox" id="mm-ack"> לבקש אישור "קראתי"</label>
      <button type="button" class="btn" id="mm-send">שליחה</button></div>
    <h3 class="psec">ההודעות ששלחת</h3>
    ${(an.data || []).map(a => { const list = to(a), rs = reads.filter(r => r.ann_id === a.id), seen = rs.filter(r => r.seen_at), ack = rs.filter(r => r.ack_at);
      return `<details class="pfold mgr-sent"><summary><span>${pEsc(a.text.slice(0, 60))}${a.text.length > 60 ? '…' : ''}</span><small>ראו ${seen.length}/${list.length}${a.need_ack ? ` · קראתי ${ack.length}/${list.length}` : ''}</small></summary><div class="pfold-body">
        <div class="pnote">${new Date(a.created_at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })} · ${a.via === 'portal' ? 'בפורטל' : 'בפורטל ובמייל'} · ${a.audience ? 'לחלק מהצוות' : 'לכל הצוות'}</div>
        <div>${pEsc(a.text)}</div>
        <ul class="mgr-readers">${list.map(id => { const r = rs.find(x => x.staff_id === id); return `<li><span>${pEsc(names[id] || '?')}</span><small>${r && r.ack_at ? 'קראתי ✓' : r ? 'ראה/תה' : 'עוד לא'}</small></li>`; }).join('')}</ul></div></details>`; }).join('') || '<div class="pnote">עוד לא נשלחו הודעות.</div>'}`;
  let toAll = true, via = 'portal';
  body.querySelectorAll('[data-mm-to]').forEach(b => b.addEventListener('click', () => { toAll = b.dataset.mmTo === 'all'; body.querySelectorAll('[data-mm-to]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); body.querySelector('.mm-people').hidden = toAll; }));
  body.querySelectorAll('[data-mmp]').forEach(x => x.addEventListener('click', () => { const on = x.getAttribute('aria-pressed') !== 'true'; x.setAttribute('aria-pressed', String(on)); x.classList.toggle('on', on); }));
  body.querySelectorAll('[data-mm-via]').forEach(b => b.addEventListener('click', () => { via = b.dataset.mmVia; body.querySelectorAll('[data-mm-via]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  body.querySelector('#mm-send').addEventListener('click', async () => {
    const text = body.querySelector('#mm-text').value.trim(), who = [...body.querySelectorAll('[data-mmp][aria-pressed=true]')].map(x => x.dataset.mmp);
    if(!text){ toast('כתבו את ההודעה'); return; }
    if(!toAll && !who.length){ toast('בחרו למי'); return; }
    if(!(await confirmSheet({ title:'לשלוח את ההודעה?', text:`${toAll ? 'לכל הצוות' : `ל-${who.length} אנשים`}, ${via === 'portal' ? 'בפורטל' : 'בפורטל ובמייל'}.`, okLabel:'שליחה', cancelLabel:'חזרה' }))) return;
    const r = await sbPersonal.rpc('post_staff_message', { p_text:text, p_via:via, p_to:toAll ? null : who, p_need_ack:body.querySelector('#mm-ack').checked });
    if(r.error){ toast('לא נשלח'); return; }
    toast('נשלח'); mgrMessages(body);
  });
}
