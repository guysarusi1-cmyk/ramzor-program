
// ---------- THE PORTAL ON THE SERVER: the personal feedback after a schedule is published (warm, honest, never blaming) ----------
// Pure functions (nothing here talks to the server), so that the same words are used for the e-mail, for the notice and for the card in the portal.
const FB_SHIFT_WORD = { m:'בוקר', e:'צהריים', n:'לילה', l:'סופ"ש ארוך' };
const FB_GOAL_WORD = { min:'לעשות החודש את המינימום הנדרש', max:'לעבוד כמה שיותר החודש (מתוך מה שסימנתי "כן")', weekly45:'לעשות 4-5 משמרות בכל שבוע' };
const fbGx = (profile, m, f) => (profile && profile.female === false) ? m : f;                    // the wording follows the person's gender (the female form when it is not known)

// the full Sunday-Saturday weeks of a month (each: the Sunday)
function fbWeeks(mk){ const ds = daysOfMonth(mk); return ds.filter(d => dowOf(d) === 0 && ds.includes(addDays(d, 6))); }
// what the person is asked to do at least, in this month: 2 mid-week shifts and a night every full week (when she does nights), and 4 weekend shifts (a night on Friday / Saturday counts for both)
const fbOwnMin = profile => !!profile && [profile.min_mid, profile.min_nights, profile.min_weekend].some(x => x != null);
const fbMins = profile => ({ mid:profile.min_mid ?? 2, night:(profile.no_nights || profile.only_long || profile.latest_end) ? 0 : (profile.min_nights ?? 1), weekend:profile.min_weekend ?? 4 });
function fbMinimum(profile, mk){
  profile = profile || {};
  if(profile.manual_only) return { total:null, weeks:0, text:'' };
  const weeks = fbWeeks(mk).length, nights = !(profile.no_nights || profile.only_long || profile.latest_end);
  if(profile.only_long) return { total:1, weeks, text:'סופ"ש ארוך אחד בחודש (הוא נחשב ל-4 משמרות סופ"ש)' };
  if(fbOwnMin(profile)){          // (personal minimums from the management portal: there the nights beyond the night minimum count as shifts too)
    const m = fbMins(profile), wk = m.mid + m.night, total = weeks * wk + m.weekend;
    const text = `${wk === 1 ? 'משמרת אחת בשבוע' : `${wk} משמרות בשבוע`}${m.night ? ` (מהן ${m.night === 1 ? 'לילה אחד' : m.night + ' לילות'})` : ''}${m.weekend ? `, ובחודש ${m.weekend} משמרות סופ"ש` : ', בלי מינימום של סופי שבוע'}. בחודש הזה זה בערך ${total} משמרות`;
    return { total, weeks, text, own:m };
  }
  const total = weeks * 2 + (nights ? weeks + Math.max(0, 4 - weeks) : 4);
  const text = `בכל שבוע 2 משמרות אמצע שבוע${nights ? ' ומשמרת לילה אחת' : ''}, ובחודש 4 משמרות סופ"ש${nights ? ' (לילה בסופ"ש נחשב גם ללילה השבועי)' : ''}. בחודש הזה זה בערך ${total} משמרות`;
  return { total, weeks, text };
}
const fbDow = day => dowOf(day);
// the shifts of a person -> counts per full week, and the weekend count
function fbCounts(rows, mk){
  const weeks = fbWeeks(mk), perWeek = weeks.map(w => ({ week:w, all:0, mid:0, night:0 }));
  let weekend = 0;
  rows.forEach(r => {
    const w = perWeek.find(x => r.day >= x.week && r.day <= addDays(x.week, 6)), dow = fbDow(r.day);
    if(w){ w.all++; if(r.shift === 'N') w.night++; else if(r.shift !== 'L' && dow <= 4) w.mid++; }
    if(r.shift === 'L') weekend += 4; else if(dow === 5 || dow === 6) weekend++;
  });
  return { perWeek, weekend, total:rows.length };
}
// does this row take away a preference that was marked on (day, shift id m/e/n/l)?
const fbRowShiftId = r => r.shift === 'S' ? 'm' : ({ M:'m', A:'e', N:'n', L:'l' })[r.shift];

// the whole picture for one person and one month
function srvFeedbackFor(p, mk, input){
  const { prefs, rows, profile, goal } = input, gx = (m, f) => fbGx(profile, m, f), V = input.voice || portalVoice(), T = (key, ...a) => txFor(V, key, ...a), fem = !(profile && profile.female === false);
  const days = daysOfMonth(mk), mine = rows.filter(r => r.day.slice(0, 7) === mk);
  const unmet = [], honored = [];
  const on = (day, id) => mine.filter(r => r.day === day && fbRowShiftId(r) === id);
  Object.keys(prefs.slots || {}).sort().forEach(key => {
    const [day, id] = key.split('|'), lv = prefs.slots[key];
    if(!days.includes(day) || (lv !== 'no' && lv !== 'avoid')) return;          // ("כן" is a wish to work, not a request to keep away from a shift)
    const hit = on(day, id).length > 0, label = `${dayLabel(day)} (${FB_SHIFT_WORD[id]})`;
    if(!hit) honored.push(label);
    else unmet.push(lv === 'no' ? `${label}: סימנת "לא", והיינו צריכים להשלים את הצוות` : `${label}: סימנת "יכול", ושובצת כי חיפשנו מישהו שיוכל`);
  });
  (prefs.absent || []).filter(d => days.includes(d)).forEach(d => { if(mine.some(r => r.day === d)) unmet.push(`${dayLabel(d)}: ביקשת להיעדר`); else honored.push(dayLabel(d)); });
  Object.keys(prefs.hours || {}).filter(d => days.includes(d)).forEach(d => {
    const rs = mine.filter(r => r.day === d), win = prefs.hours[d];
    const ok = rs.every(r => r.from && r.to && win.some(([a, b]) => parseInt(r.from, 10) >= a && (parseInt(r.to, 10) || 24) <= b));
    if(ok) honored.push(dayLabel(d)); else unmet.push(`${dayLabel(d)}: ציינת שעות אחרות, ולא הצלחנו להתאים אליהן את המשמרת`);
  });
  const c = fbCounts(mine, mk), min = fbMinimum(profile, mk);
  let goalLine = '', goalOk = null;
  if(goal){
    const t = FB_GOAL_WORD[goal];
    if(goal === 'min'){
      goalOk = min.total == null || c.total <= min.total + 2;
      goalLine = !goalOk ? T('fb_g_min_high', t, c.total) : (min.total != null && c.total < min.total - 1) ? T('fb_g_min_low', t, c.total) : T('fb_g_min_ok', t, c.total);
    } else if(goal === 'max'){
      goalOk = min.total == null || c.total >= min.total + 3;
      goalLine = goalOk ? T('fb_g_max_ok', t, c.total) : T('fb_g_max_no', t, c.total);
    } else {
      const weeks = c.perWeek, bad = weeks.filter(w => w.all < 4 || w.all > 5); goalOk = bad.length === 0;
      goalLine = goalOk ? T('fb_g_wk_ok', t) : T('fb_g_wk_no', t, dayLabel(bad[0].week), String(bad[0].all) + (bad.length > 1 ? ` (ועוד ${bad.length - 1} שבועות)` : ''));
    }
    (goalOk ? honored : unmet).push(`הבקשה ${t}`);
  }
  const minGaps = [];
  if(min.own){
    const m = min.own;
    c.perWeek.forEach(w => { const all = w.mid + w.night; if(all < m.mid + m.night) minGaps.push(`בשבוע של ${dayLabel(w.week)} חסרות ${m.mid + m.night - all} משמרות`); else if(w.night < m.night) minGaps.push(`בשבוע של ${dayLabel(w.week)} חסר לילה`); });
    if(c.weekend < m.weekend) minGaps.push(`במשמרות סופ"ש יש ${c.weekend} מתוך ${m.weekend}`);
  } else if(min.total != null && !(profile && profile.only_long)){
    const nights = !(profile && (profile.no_nights || profile.only_long || profile.latest_end));
    c.perWeek.forEach(w => { if(w.mid < 2) minGaps.push(`בשבוע של ${dayLabel(w.week)} חסרות ${2 - w.mid} משמרות אמצע שבוע`); if(nights && w.night < 1) minGaps.push(`בשבוע של ${dayLabel(w.week)} חסרה משמרת לילה`); });
    if(c.weekend < 4) minGaps.push(`במשמרות סופ"ש יש ${c.weekend} מתוך 4`);
  } else if(profile && profile.only_long && !mine.some(r => r.shift === 'L')) minGaps.push('עוד לא שובצת לסופ"ש ארוך');
  const asked = honored.length + unmet.length, name = p.first;
  const lines = [];
  lines.push(T('fb_intro', monthLabel(mk)));
  if(!asked) lines.push(T('fb_nothing', c.total));
  else lines.push(T('fb_count', asked, honored.length));
  const reqUnmet = unmet.filter(u => !u.startsWith('הבקשה '));
  if(reqUnmet.length) lines.push(T('fb_unmet', reqUnmet.map(u => '• ' + u).join('\n')));
  if(goalLine) lines.push(goalLine);
  if(min.total != null){
    if(!minGaps.length) lines.push(T('fb_min_ok', min.text));
    else lines.push(T('fb_min_gap', min.text, minGaps.map(g => '• ' + g).join('\n')));
  }
  const closing = T('fb_close', T('fb_thanks', fem));
  if(closing) lines.push(closing);
  return { subject:`הסידור של ${monthLabel(mk)} פורסם: ככה הלכו הבקשות שלך`, text:lines.join('\n\n'), asked, honored:honored.length, unmet:reqUnmet, goalOk, total:c.total, min, minGaps };
}

// the coordinator's side: everybody gets their own message when the schedule is published
async function srvSendFeedback(mk){
  const st = portalLoad(), m = portalMonth(mk), sent = { ok:0, failed:0 };
  const people = st.instructors.filter(p => p.active && p.role === 'instructor' && !((st.priv || {})[p.id] || {}).manual_only);
  for(const p of people){
    const rows = st.rows.filter(r => r.staff === p.id), pr = (m.prefs[p.id] || { slots:{}, absent:[], hours:{} });
    if(!rows.length && !Object.keys(pr.slots || {}).length) continue;
    const pv = (st.priv || {})[p.id] || {};
    const fb = srvFeedbackFor(p, mk, { prefs:pr, rows, profile:{ female:pv.female, no_nights:pv.no_nights, only_long:pv.only_long_weekend, manual_only:pv.manual_only, latest_end:pv.latest_end_hour, min_mid:pv.min_mid, min_nights:pv.min_nights, min_weekend:pv.min_weekend }, goal:(m.goals || {})[p.id] || null, voice:(st.voices || {})[p.id] || 'warm' });
    const r = await sbPersonal.rpc('coordinator_tell', { p_staff:p.id, p_subject:fb.subject, p_text:fb.text, p_kind:'info' });
    if(r.error) sent.failed++; else sent.ok++;
  }
  return sent;
}
