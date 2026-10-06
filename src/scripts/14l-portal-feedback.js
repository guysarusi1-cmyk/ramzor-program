
// ---------- THE PORTAL ON THE SERVER: the personal feedback after a schedule is published (warm, honest, never blaming) ----------
// Pure functions (nothing here talks to the server), so that the same words are used for the e-mail, for the notice and for the card in the portal.
const FB_SHIFT_WORD = { m:'בוקר', e:'צהריים', n:'לילה', l:'סופ"ש ארוך' };
const FB_GOAL_WORD = { min:'לעשות החודש את המינימום הנדרש', max:'לעבוד כמה שיותר החודש (מתוך מה שסימנתי "כן")', weekly45:'לעשות 4-5 משמרות בכל שבוע' };
const fbGx = (profile, m, f) => (profile && profile.female === false) ? m : f;                    // the wording follows the person's gender (the female form when it is not known)

// the full Sunday-Saturday weeks of a month (each: the Sunday)
function fbWeeks(mk){ const ds = daysOfMonth(mk); return ds.filter(d => dowOf(d) === 0 && ds.includes(addDays(d, 6))); }
// what the person is asked to do at least, in this month: 2 mid-week shifts and a night every full week (when she does nights), and 4 weekend shifts (a night on Friday / Saturday counts for both)
function fbMinimum(profile, mk){
  profile = profile || {};
  if(profile.manual_only) return { total:null, weeks:0, text:'' };
  const weeks = fbWeeks(mk).length, nights = !(profile.no_nights || profile.only_long || profile.latest_end);
  if(profile.only_long) return { total:1, weeks, text:'סופ"ש ארוך אחד בחודש (הוא נחשב ל-4 משמרות סופ"ש)' };
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
  const { prefs, rows, profile, goal } = input, gx = (m, f) => fbGx(profile, m, f);
  const days = daysOfMonth(mk), mine = rows.filter(r => r.day.slice(0, 7) === mk);
  const unmet = [], honored = [];
  const on = (day, id) => mine.filter(r => r.day === day && fbRowShiftId(r) === id);
  Object.keys(prefs.slots || {}).sort().forEach(key => {
    const [day, id] = key.split('|'), lv = prefs.slots[key];
    if(!days.includes(day)) return;
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
    if(goal === 'min'){ goalOk = min.total == null || c.total <= min.total + 2; goalLine = !goalOk ? `ביקשת ${t}. הפעם קיבלת ${c.total} משמרות, יותר מהמינימום, כי היינו צריכים עוד ידיים. אנחנו מודים לך על הגמישות.` : (min.total != null && c.total < min.total - 1) ? `ביקשת ${t}. הפעם קיבלת ${c.total} משמרות, קצת מתחת למינימום, וזה לא קשור אלייך. נשמח להשלים את זה יחד.` : `ביקשת ${t}, וקיבלת ${c.total} משמרות, בדיוק במקום שרצית. תודה על השיתוף!`; }
    else if(goal === 'max'){ goalOk = min.total == null || c.total >= min.total + 3; goalLine = goalOk ? `ביקשת ${t}, וקיבלת ${c.total} משמרות. תודה על הנכונות!` : `ביקשת ${t}. ניסינו לתת לך כמה שיותר, והפעם הגענו ל-${c.total} משמרות. לא הצלחנו לתת יותר בלי לפגוע בכללים ובצוות.`; }
    else { const weeks = c.perWeek, bad = weeks.filter(w => w.all < 4 || w.all > 5); goalOk = bad.length === 0; goalLine = goalOk ? `ביקשת ${t}, ובכל שבוע קיבלת 4 או 5 משמרות. נהדר!` : `ביקשת ${t}. ניסינו, ובשבוע של ${dayLabel(bad[0].week)} יצא ${bad[0].all}${bad.length > 1 ? ` (ועוד ${bad.length - 1} שבועות)` : ''}. לא תמיד הצלחנו להתאים את זה, ותודה על ההבנה.`; }
    (goalOk ? honored : unmet).push(`הבקשה ${t}`);
  }
  const minGaps = [];
  if(min.total != null && !(profile && profile.only_long)){
    const nights = !(profile && (profile.no_nights || profile.only_long || profile.latest_end));
    c.perWeek.forEach(w => { if(w.mid < 2) minGaps.push(`בשבוע של ${dayLabel(w.week)} חסרות ${2 - w.mid} משמרות אמצע שבוע`); if(nights && w.night < 1) minGaps.push(`בשבוע של ${dayLabel(w.week)} חסרה משמרת לילה`); });
    if(c.weekend < 4) minGaps.push(`במשמרות סופ"ש יש ${c.weekend} מתוך 4`);
  } else if(profile && profile.only_long && !mine.some(r => r.shift === 'L')) minGaps.push('עוד לא שובצת לסופ"ש ארוך');
  const asked = honored.length + unmet.length, name = p.first;
  const lines = [];
  lines.push(`הסידור של ${monthLabel(mk)} פורסם, ורצינו לשתף אותך כבר עכשיו איך הלכו הבקשות שלך.`);
  if(!asked) lines.push(`החודש לא סימנת בקשות מיוחדות, וניסינו לתת לך סידור נוח ככל האפשר. קיבלת ${c.total} משמרות.`);
  else lines.push(`מתוך ${asked} הבקשות שסימנת הצלחנו להיענות ל-${honored.length}, ותודה ששיתפת אותנו. זה עוזר לנו לבנות סידור שמתאים לכולם.`);
  const reqUnmet = unmet.filter(u => !u.startsWith('הבקשה '));
  if(reqUnmet.length) lines.push(`אלה הבקשות שהפעם לא הצלחנו לקיים, למרות שבאמת ניסינו:\n${reqUnmet.map(u => '• ' + u).join('\n')}\nלפעמים צריך להשלים צוות או לשמור על כללי הבטיחות והמנוחה. נמשיך לעשות כמיטב יכולתנו בחודשים הבאים.`);
  if(goalLine) lines.push(goalLine);
  if(min.total != null){
    if(!minGaps.length) lines.push(`וגם: עמדת במינימום של החודש (${min.text}). תודה על ההשקעה!`);
    else lines.push(`לגבי המינימום (${min.text}): נשארו כמה משמרות שלא הצלחנו להשלים בשבילך:\n${minGaps.map(g => '• ' + g).join('\n')}\nזה לא קשור אלייך, ואין צורך להילחץ. אם נוח לך, אפשר לפנות לרכזת ונמצא יחד פתרון.`);
  }
  lines.push(`אם משהו לא יושב לך טוב, אפשר לבקש החלפה בפורטל או לדבר עם הרכזת. אנחנו כאן בשבילך, ${gx('תודה שאתה חלק מהצוות', 'תודה שאת חלק מהצוות')}.`);
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
    const fb = srvFeedbackFor(p, mk, { prefs:pr, rows, profile:{ female:pv.female, no_nights:pv.no_nights, only_long:pv.only_long_weekend, manual_only:pv.manual_only, latest_end:pv.latest_end_hour }, goal:(m.goals || {})[p.id] || null });
    const r = await sbPersonal.rpc('coordinator_tell', { p_staff:p.id, p_subject:fb.subject, p_text:fb.text, p_kind:'info' });
    if(r.error) sent.failed++; else sent.ok++;
  }
  return sent;
}
