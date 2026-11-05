// ---- "פורטל המנהלת" (Guy 2026-11-03; the spec: Mercury-Work-Manager plans/MANAGER-ROLE-SPEC.md; scheduling-v52.sql)
// The manager of the framework (staff kind 'manager'): not the admin, not the coordinator. Every rule is kept in the database too:
//   * the schedule: read only           * the general timetable: she changes it, the coordinator is told
//   * the children: the plans, the progress and the diary, read only; opening the detail is logged (the admin reads the log)
//   * conversations with the coordinator and the social workers (one-to-one or groups; a child as the topic)
//   * messages to the staff (everybody or chosen people; portal or also e-mail) with who saw and who confirmed "קראתי"
//   * the WhatsApp group of the framework: a shortcut only
const mgr = { week:null, conv:null, kidsLoaded:false };
const MGR_TABS = [['schedule', 'סידור העבודה'], ['timetable', 'לו"ז'], ['kids', 'הילדים'], ['chats', 'שיחות'], ['users', 'משתמשים']];          // (the messages to the staff: inside the home tab, Guy 2026-11-03)
const mgrIsMe = () => { try { return (portalMe() || {}).role === 'manager'; } catch(e){ return false; } };
const mgrShort = iso => { const t = parseIso(iso); return t.getDate() + '/' + (t.getMonth() + 1); };
const mgrWeekStart = () => { const t = isoDate(new Date()); return mgr.week || addDays(t, -dowOf(t)); };
async function mgrKids(){          // the children's names: the manager reads the roster with her own sign-in
  if(typeof roster !== 'undefined' && roster.length) return roster;
  try { const list = await getRoster(); if(list.length && typeof roster !== 'undefined') roster = list; } catch(e){}          // (getRoster: the same shape as everywhere — firstName, lastInitial)
  return typeof roster !== 'undefined' ? roster : [];
}
async function mgrRender(t, body){
  if(typeof sb !== 'undefined' && portalServerOn) sb = sbPersonal;          // (the timetable editor of the ahmash control reads with the personal session)
  if(t === 'timetable') return mgrTimetable(body);
  if(t === 'kids') return mgrKidsTab(body);
  if(t === 'chats'){          // (her messages to the staff live here, above the conversations: Guy 2026-11-04)
    const group = String((portalLoad().waMsg || {}).group || '').trim();
    body.innerHTML = `${group ? `<div class="mgr-links"><a class="btn ghost wa-group" href="${pEsc(waGroupUrl(group))}"${waTarget()}>${WA_SVG}<span>קבוצת הצוות</span></a></div>` : ''}<details class="pfold" data-fold="m-msg"${openFold('m-msg') ? ' open' : ''}><summary><span>הודעה לצוות</span></summary><div class="pfold-body" id="mgr-msgs"><div class="pnote">רק רגע...</div></div></details><div id="mgr-convs"></div>`;
    wireFolds(body); mgrMessages(body.querySelector('#mgr-msgs')); return mgrChats(body.querySelector('#mgr-convs'));
  }
  if(t === 'users') return mgrUsers(body);
  return mgrSchedule(body);
}
// ---- the schedule: read only, a week at first
function mgrSchedule(body){
  const mk = portalUi.month || (portalUi.month = monthKeyOf(isoDate(new Date()))), m = portalMonth(mk), today = isoDate(new Date());
  const wk = portalUi.mgrMonthView ? null : portalUi.mgrWeekMk === mk ? portalUi.mgrWeek : mk === monthKeyOf(today) ? mcalWeekOfDay(mk, today) : 0;
  body.innerHTML = `${monthNavHtml(mk)}<div class="pnote">צפייה בלבד.</div>${m.published ? mcalViewBarHtml(mk, wk, 'mgr-viewbar') + monthCalHtml(portalCtx(mk), m.assignments, { week:wk === null ? undefined : wk, rows:true, othersInCells:true }) : '<div class="pnote">הסידור של החודש עוד לא פורסם.</div>'}`;
  wireMonthNav(body);
  { const seg = body.querySelector('#mgr-viewbar .mcal-seg'); if(seg){ seg.insertAdjacentHTML('afterend', `<button type="button" class="btn ghost mgr-share" id="mgr-share">${WA_SVG}<span>שיתוף</span></button>`); body.querySelector('#mgr-share').addEventListener('click', () => csShareSheet(mk, wk)); } }
  mcalViewBarWire(body, 'mgr-viewbar', mk, () => wk, (mm, w) => { portalUi.mgrMonthView = w === null; portalUi.mgrWeek = w; portalUi.mgrWeekMk = mm; portalUi.month = mm; }, () => portalRefresh());
}
// ---- the general timetable: the same editor as the ahmash control; the database tells the coordinator about her changes
async function mgrTimetable(body){
  const edit = mgr.ttMode === 'edit';
  body.innerHTML = `<div class="mx-seg mgr-tt-mode" role="group" aria-label="לו&quot;ז"><button type="button" data-mtt="view" aria-pressed="${!edit}">לו"ז</button><button type="button" data-mtt="edit" aria-pressed="${edit}">עריכה</button></div><div id="mgr-tt"><div class="pnote">רק רגע...</div></div>`;
  body.querySelectorAll('[data-mtt]').forEach(b => b.addEventListener('click', () => { mgr.ttMode = b.dataset.mtt; mgrTimetable(body); }));
  const box = body.querySelector('#mgr-tt');
  try {
    if(!edit) return await mgrTimetableView(box);
    box.insertAdjacentHTML('beforebegin', `<div class="pnote">שינוי נשמר בלחיצה על "שמירה", ומופיע במסך הילדים תוך רגע${mgrIsMe() ? ', והרכזת מקבלת על כך הודעה בפורטל' : ''}.</div>`);
    await ctlTimetable(box);
  } catch(e){ box.innerHTML = '<div class="pstatus bad">הלו"ז לא נטען. אפשר לנסות שוב.</div>'; }
}
// to look at: the day as on the kids' screen, from the same data, or the week. On a phone it fits the screen without scrolling: the day's activities share the height that is left,
// and the week shows one day at a time under its seven days (seven columns would be too small to read: Guy 2026-11-04)
async function mgrTimetableView(box){
  const today = isoDate(new Date()), sun = addDays(today, -dowOf(today)), week = mgr.ttView === 'week', days = Array.from({ length:7 }, (_, i) => addDays(sun, i));
  const [r, fixed, daily] = await Promise.all([sb.rpc('tv_timetable_today'), sbPersonal.from('timetable_fixed').select('weekday,items'), sbPersonal.from('timetable_day').select('day,items').gte('day', days[0]).lte('day', days[6])]);
  if(r.error) throw r.error;
  const evs = secOn() ? await secApi.between(days[0], days[6]).catch(() => []) : [], evOf = d => evs.filter(e => e.occ === d);          // (mentoring and volunteering: next to the timetable, 14zo-secretary.js)
  if(!box.isConnected) return;
  const itemsOf = d => (d === today ? (r.data.items || []) : ((daily.data || []).find(x => x.day === d) || (fixed.data || []).find(x => x.weekday === dowOf(d)) || {}).items || []).filter(x => ttOn(x, d));
  const card = a => `<div class="mgr-ttv-item${a.ev ? ' mgr-ttv-ev' : ''}"><div class="mgr-ttv-time"><bdi dir="ltr">${pEsc(a.t || '')}${a.end ? '–' + pEsc(a.end) : ''}</bdi></div><div class="mgr-ttv-icon">${typeof ttArt === 'function' ? ttArt(a.i) : ''}</div><div class="mgr-ttv-name">${pEsc(a.n || '')}</div></div>`;
  const grid = list => list.length ? `<div class="mgr-ttv" style="--c:${list.length > 12 ? 4 : 3}">${list.map(card).join('')}</div>` : '<div class="pnote">אין לו"ז ליום הזה.</div>';
  const dayHtml = d => evOf(d).length ? ttAlignedHtml(itemsOf(d), evOf(d)) : grid(itemsOf(d));
  const colOf = d => itemsOf(d).concat(evOf(d).map(e => ({ t:e.t, end:e.end, i:e.i, n:evText(e), ev:true }))).sort((a, b) => String(a.t).localeCompare(String(b.t)));
  const phone = matchMedia('(max-width:700px)').matches, pick = mgr.ttDay && days.includes(mgr.ttDay) ? mgr.ttDay : today;
  const seg = `<div class="mx-seg mgr-tt-mode" role="group" aria-label="תצוגה"><button type="button" data-mtv="day" aria-pressed="${!week}">היום</button><button type="button" data-mtv="week" aria-pressed="${week}">השבוע</button></div>`;
  box.innerHTML = seg + (!week ? `<div class="mgr-ttv-fit">${dayHtml(today)}</div>`
    : phone ? `<div class="mgr-ttv-days">${days.map(d => `<button type="button" data-mtd="${d}" aria-pressed="${d === pick}"><b>${DOW_SHORT[dowOf(d)]}</b><small>${mgrShort(d)}</small></button>`).join('')}</div><div class="mgr-ttv-fit">${dayHtml(pick)}</div>`
    : `<div class="mgr-ttv-week">${days.map(d => `<div class="mgr-ttv-col${d === today ? ' today' : ''}"><b>${DOW_NAMES[dowOf(d)]} ${mgrShort(d)}</b>${colOf(d).map(card).join('') || '<div class="pnote">—</div>'}</div>`).join('')}</div>`);
  box.querySelectorAll('[data-mtv]').forEach(b => b.addEventListener('click', () => { mgr.ttView = b.dataset.mtv; mgrTimetableView(box); }));
  box.querySelectorAll('[data-mtd]').forEach(b => b.addEventListener('click', () => { mgr.ttDay = b.dataset.mtd; mgrTimetableView(box); }));
  const fit = box.querySelector('.mgr-ttv-fit');
  if(fit && phone){ const nav = document.querySelector('.bottom-nav'), bottom = nav && nav.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight; window.scrollTo(0, 0); fit.style.height = Math.max(240, bottom - fit.getBoundingClientRect().top - 8) + 'px'; }
}
// ---- "משתמשים": a person's screen as it is, to look at. Nothing can be changed there (the same view as the admin's; the database gives her reading only, scheduling-v59.sql)
function mgrUsers(body){
  const st = portalLoad(), group = (role, word) => { const l = st.instructors.filter(p => p.active && p.role === role && p.id !== srv.me).sort((a, b) => String(a.first).localeCompare(String(b.first), 'he'));
    return l.length ? `<h2 class="psec">${word}</h2><div class="adm-people">${l.map(p => `<button type="button" class="cs-name" data-mu="${p.id}"><img src="${p.photo}" alt=""><span>${pEsc(instrName(p, st.instructors))}</span></button>`).join('')}</div>` : ''; };
  body.innerHTML = `<div class="pnote">בחירה באדם פותחת את המסך כמו שהוא רואה אותו. צפייה בלבד: אי אפשר לשנות דבר, והאדם לא מקבל על כך הודעה.</div>${group('instructor', 'מדריכים')}${group('coordinator', 'רכזת')}${group('therapist', 'מטפלות')}`;
  body.querySelectorAll('[data-mu]').forEach(b => b.addEventListener('click', async () => {
    const p = portalPerson(b.dataset.mu); if(!p) return;
    if(p.role === 'therapist'){ showOncallScreen(p); return; }          // (her portal is closed in the coming version: what she has is the on-call screen)
    if(p.role === 'coordinator'){ try { await srvLoadCoord(); } catch(e){} }
    Object.assign(portalUi, { fillReturn:{ tab:'users', manager:false }, viewAs:p.id, persona:p.id, manager:false, editPrefs:false, actAs:false, tab:null, pmonth:null, month:null }); showPortal();
  }));
}
// ---- the children: a short summary of each plan, the full plan and the diary read only; opening the detail is logged
async function mgrKidsTab(body){
  body.innerHTML = '<div class="pnote">רק רגע...</div>';
  const kids = (await mgrKids()).slice().sort((a, b) => displayName(a).localeCompare(displayName(b), 'he'));
  const [pl, ev] = await Promise.all([sbPersonal.from('child_plans').select('child_id,published,published_at,review_date'), sbPersonal.from('child_diary').select('child_id,day').gte('day', addDays(isoDate(new Date()), -1))]);
  if(!body.isConnected) return;
  const plan = id => (pl.data || []).find(p => p.child_id === id), upcoming = id => (ev.data || []).filter(e => e.child_id === id).length;
  body.innerHTML = `<div class="pnote">קריאה בלבד. פתיחת פירוט נרשמת.</div><div class="mgr-kids">${kids.map(c => { const p = plan(c.id), goals = p && p.published && Array.isArray(p.published.goals) ? p.published.goals : [];
    return `<details class="pfold mgr-kid"><summary><span class="ar-keep">${pEsc(displayName(c))}</span>${p && p.published ? `<small>תוכנית פורסמה${p.published_at ? ' ' + mgrShort(String(p.published_at).slice(0, 10)) : ''}</small>` : '<small>אין תוכנית מפורסמת</small>'}</summary><div class="pfold-body">
      ${goals.length ? `<ul class="mgr-goals">${goals.slice(0, 3).map(g => `<li>${pEsc(g.title || g.text || '')}</li>`).join('')}${goals.length > 3 ? `<li class="pnote">ועוד ${goals.length - 3}</li>` : ''}</ul>` : ''}
      <div class="mgr-kid-acts">${p && p.published ? `<button type="button" class="btn ghost small" data-mk-plan="${pEsc(c.id)}">פירוט התוכנית</button>` : ''}<button type="button" class="btn ghost small" data-mk-diary="${pEsc(c.id)}">יומן${upcoming(c.id) ? ` (${upcoming(c.id)})` : ''}</button></div></div></details>`; }).join('') || '<div class="pnote">אין ילדים ברשימה.</div>'}</div>`;
  body.querySelectorAll('[data-mk-plan]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.mkPlan, p = plan(id);
    await sbPersonal.from('therapy_access').insert({ child_id:id, what:'פירוט תוכנית (מנהלת)' });          // (logged before it opens)
    const goals = (p.published && p.published.goals) || [];
    portalSheet(`<h2>התוכנית של ${pEsc(dgName(id))}</h2><div class="pnote">קריאה בלבד.</div>${goals.map(g => { const lines = v => (Array.isArray(v) ? v.map(x => (x && (x.text || x.title)) || x) : String(v || '').split('\n')).map(x => String(x || '').trim()).filter(Boolean);          // (a goal's fields, as the plan keeps them: 14zf)
        const tg = lines(g.targets);
        return `<div class="card"><b>${pEsc(g.title || '')}</b>${g.theme ? ` <small>${pEsc(g.theme)}</small>` : ''}${g.why_staff ? `<div class="pnote">למה: ${pEsc(g.why_staff)}</div>` : ''}${tg.length ? `<ul>${tg.map(x => `<li>${pEsc(x)}</li>`).join('')}</ul>` : ''}${g.avoid_line ? `<div class="pnote">להימנע: ${pEsc(g.avoid_line)}</div>` : ''}</div>`; }).join('') || '<div class="pnote">אין מטרות.</div>'}
      <div class="confirm-actions"><button type="button" class="btn" data-close>סגירה</button></div>`);
  }));
  body.querySelectorAll('[data-mk-diary]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.mkDiary, [e, s] = await Promise.all([sbPersonal.from('child_diary').select('*').eq('child_id', id), sbPersonal.from('child_diary_skip').select('*')]);
    const today = isoDate(new Date()), occ = dgOccurrences(e.data || [], s.data || [], addDays(today, -7), addDays(today, 45));
    portalSheet(`<h2>היומן של ${pEsc(dgName(id))}</h2><div class="pnote">קריאה בלבד. העו"סית האחראית עורכת.</div>${occ.length ? occ.map(o => `<div class="dg-day-h">${pEsc(DOW_NAMES[dowOf(o.day)])} ${mgrShort(o.day)}</div>${dgLineHtml(o, true)}`).join('') : '<div class="pnote">אין אירועים קרובים.</div>'}
      <div class="confirm-actions"><button type="button" class="btn" data-close>סגירה</button></div>`);
  }));
}
// ---- conversations (one-to-one or groups) with the coordinator and the social workers
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
  const forMe = !mgrIsMe();          // (the coordinator and the social workers: the messages to them first)
  convs.sort((a, b) => String((last[b.id] || {}).at || b.created_at).localeCompare(String((last[a.id] || {}).at || a.created_at)));
  body.innerHTML = `${forMe ? '<div id="mgr-inbox"></div>' : ''}<div class="mgr-chat-top"><button type="button" class="btn small" id="mc-new">+ שיחה חדשה</button></div>
    ${convs.length ? convs.map(c => { const l = last[c.id], fresh = l && l.from_staff !== srv.me && (!myRead(c.id) || l.at > myRead(c.id));
      return `<button type="button" class="card mgr-conv${fresh ? ' fresh' : ''}" data-mc="${c.id}"><b>${pEsc(c.title || members(c.id).join(', '))}</b>${c.child_id ? `<small>בנושא: <span class="ar-keep">${pEsc(dgName(c.child_id))}</span></small>` : ''}<small>${l ? pEsc((names[l.from_staff] || '') + ': ' + l.text.slice(0, 80)) : 'אין הודעות עדיין'}</small></button>`; }).join('') : '<div class="pnote">אין שיחות עדיין.</div>'}`;
  body.querySelectorAll('[data-mc]').forEach(b => b.addEventListener('click', () => { mgr.conv = b.dataset.mc; mgrChats(body); }));
  if(forMe) mgrMsgsForMe(body.querySelector('#mgr-inbox'));
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
// ---- messages to the staff (in the home tab): how first ("בפורטל / במייל / בשניהם", "קראתי"), then to whom — the whole staff by groups,
// or some of it: every ahmash and/or names from a folded list (Guy 2026-11-03). Seen and "קראתי" apart.
const MGR_GROUPS = [['guide', 'צוות ההדרכה', s => s.kind === 'instructor'], ['service', 'בנות שירות', s => s.kind === 'service'], ['lead', 'הצוות המוביל', s => ['coordinator', 'therapist'].includes(s.kind)]];          // (the leading staff: the coordinator and the social workers, for now)
const MGR_VIA = [['portal', 'בפורטל'], ['email', 'במייל'], ['both', 'בשניהם']];
async function mgrMessages(body){
  if(!body) return;
  const [an, staff] = await Promise.all([sbPersonal.from('announcements').select('id,created_at,text,via,audience,need_ack,from_staff').eq('from_staff', srv.me).order('created_at', { ascending:false }).limit(20), sbPersonal.from('staff').select('id,display_name,kind,active')]);
  if(!body.isConnected) return;
  if(an.error){ body.innerHTML = '<div class="pstatus bad">ההודעות לצוות עוד לא זמינות כאן (חסר עדכון במסד: scheduling-v52.sql).</div>'; return; }
  const ids = (an.data || []).map(a => a.id), reads = ids.length ? ((await sbPersonal.from('announcement_read').select('ann_id,staff_id,seen_at,ack_at').in('ann_id', ids)).data || []) : [];
  const names = {}; (staff.data || []).forEach(s => { names[s.id] = s.display_name; });
  const active = (staff.data || []).filter(s => s.active && s.id !== srv.me).sort((a, b) => a.display_name.localeCompare(b.display_name, 'he'));
  const people = active.filter(s => ['instructor', 'service', 'teacher', 'coordinator', 'therapist'].includes(s.kind));
  const team = active.filter(s => ['instructor', 'service', 'teacher'].includes(s.kind));
  const to = a => a.audience ? a.audience : team.map(s => s.id);
  body.innerHTML = `<div class="mgr-new-msg">
      <textarea id="mm-text" rows="3" maxlength="1500" placeholder="מה רוצים לומר?"></textarea>
      <div class="mx-seg mgr-seg" role="group" aria-label="איך">${MGR_VIA.map(([k, w], i) => `<button type="button" data-mm-via="${k}" aria-pressed="${i === 0}">${w}</button>`).join('')}</div>
      <label class="oc-ordered"><input type="checkbox" id="mm-ack"> לבקש אישור "קראתי"</label>
      <div class="mm-groups">${MGR_GROUPS.map(([k, w], i) => `<label class="oc-ordered"><input type="checkbox" data-mm-grp="${k}"${i === 0 ? ' checked' : ''}> ${w}</label>`).join('')}</div>
      <div class="mm-some">
        <label class="oc-ordered"><input type="checkbox" id="mm-ahm"> כל האחמ"שים</label>
        <details class="pfold mm-names"><summary><span>בחירת שמות</span><small id="mm-n"></small></summary><div class="pfold-body mm-list">${people.map(s => `<label class="oc-ordered"><input type="checkbox" data-mmp="${s.id}"> ${pEsc(s.display_name)}</label>`).join('')}</div></details>
      </div>
      <button type="button" class="btn" id="mm-send">שליחה</button></div>
    <h3 class="psec">ההודעות ששלחת</h3>
    ${(an.data || []).map(a => { const list = to(a), rs = reads.filter(r => r.ann_id === a.id), seen = rs.filter(r => r.seen_at), ack = rs.filter(r => r.ack_at);
      return `<details class="pfold mgr-sent"><summary><span>${pEsc(a.text.slice(0, 60))}${a.text.length > 60 ? '…' : ''}</span><small>ראו ${seen.length}/${list.length}${a.need_ack ? ` · קראתי ${ack.length}/${list.length}` : ''}</small></summary><div class="pfold-body">
        <div class="pnote">${new Date(a.created_at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })} · ${(MGR_VIA.find(v => v[0] === a.via) || MGR_VIA[0])[1]} · ${a.audience ? `ל-${a.audience.length} אנשים` : 'לכל הצוות'}</div>
        <div>${pEsc(a.text)}</div>
        <ul class="mgr-readers">${list.map(id => { const r = rs.find(x => x.staff_id === id); return `<li><span>${pEsc(names[id] || '?')}</span><small>${r && r.ack_at ? 'קראתי ✓' : r ? 'ראה/תה' : 'עוד לא'}</small></li>`; }).join('')}</ul></div></details>`; }).join('') || '<div class="pnote">עוד לא נשלחו הודעות.</div>'}`;
  let via = 'portal';
  const $ = q => body.querySelector(q);
  const chosen = () => {
    const g = [...body.querySelectorAll('[data-mm-grp]:checked')].map(x => x.dataset.mmGrp), set = new Set(active.filter(s => MGR_GROUPS.some(([k, , f]) => g.includes(k) && f(s))).map(s => s.id));
    body.querySelectorAll('[data-mmp]:checked').forEach(x => set.add(x.dataset.mmp));
    if($('#mm-ahm').checked) active.filter(s => (srv.ahmash || {})[s.id] > 0).forEach(s => set.add(s.id));
    return [...set];
  };
  const count = () => { const n = body.querySelectorAll('[data-mmp]:checked').length; $('#mm-n').textContent = n ? `נבחרו ${n}` : ''; };
  body.querySelectorAll('[data-mmp]').forEach(x => x.addEventListener('change', count));
  body.querySelectorAll('[data-mm-via]').forEach(b => b.addEventListener('click', () => { via = b.dataset.mmVia; body.querySelectorAll('[data-mm-via]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  wireFolds(body);
  $('#mm-send').addEventListener('click', async () => {
    const text = $('#mm-text').value.trim(), who = chosen();
    if(!text){ toast('כתבו את ההודעה'); return; }
    if(!who.length){ toast('בחרו למי'); return; }
    if(!(await confirmSheet({ title:'לשלוח את ההודעה?', text:`ל-${who.length} אנשים, ${(MGR_VIA.find(v => v[0] === via) || MGR_VIA[0])[1]}.`, okLabel:'שליחה', cancelLabel:'חזרה' }))) return;
    const r = await sbPersonal.rpc('post_staff_message', { p_text:text, p_via:via, p_to:who, p_need_ack:$('#mm-ack').checked });
    if(r.error){ toast('לא נשלח'); return; }
    toast('נשלח'); mgrMessages(body);
  });
}
// the messages to me (the leading staff: the coordinator, the social workers): above their conversations, seen when shown, "קראתי" by a tap
async function mgrMsgsForMe(box){
  if(!box || !srv.me) return;
  const r = await sbPersonal.from('announcements').select('id,created_at,text,need_ack,from_staff').contains('audience', [srv.me]).neq('from_staff', srv.me).gte('created_at', addDays(isoDate(new Date()), -30) + 'T00:00:00').order('created_at', { ascending:false }).limit(10);
  if(!box.isConnected) return;
  if(r.error || !(r.data || []).length){ box.innerHTML = ''; return; }
  const rd = await sbPersonal.from('announcement_read').select('ann_id,ack_at').eq('staff_id', srv.me).in('ann_id', r.data.map(a => a.id));
  if(!box.isConnected) return;
  const mine = rd.data || [], seen = id => mine.some(x => x.ann_id === id), acked = id => mine.some(x => x.ann_id === id && x.ack_at);
  const fresh = r.data.filter(a => !seen(a.id)), waiting = r.data.filter(a => a.need_ack && !acked(a.id));
  box.innerHTML = `<details class="pfold mgr-inbox"${fresh.length || waiting.length ? ' open' : ''}><summary><span>הודעות אלייך</span>${fresh.length + waiting.length ? `<span class="pcount">${new Set(fresh.concat(waiting)).size}</span>` : ''}</summary><div class="pfold-body">
    ${r.data.map(a => `<div class="pannounce"><small>${new Date(a.created_at).toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' })}</small><div>${pEsc(a.text)}</div>${a.need_ack ? (acked(a.id) ? '<small>קראתי ✓</small>' : `<button type="button" class="btn small" data-mack="${a.id}">קראתי</button>`) : ''}</div>`).join('')}</div></details>`;
  if(fresh.length) sbPersonal.from('announcement_read').upsert(fresh.map(a => ({ ann_id:a.id, staff_id:srv.me })), { onConflict:'ann_id,staff_id', ignoreDuplicates:true }).then(() => {}, () => {});
  box.querySelectorAll('[data-mack]').forEach(b => b.addEventListener('click', async () => {
    const w = await sbPersonal.from('announcement_read').upsert({ ann_id:b.dataset.mack, staff_id:srv.me, ack_at:new Date().toISOString() });
    if(w.error){ toast('לא נשמר. אפשר לנסות שוב.'); return; }
    mgrMsgsForMe(box);
  }));
}
