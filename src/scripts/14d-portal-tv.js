
// ---------- THE KIDS' TV: four new screens (who is here today, today's timetable, the week, birthdays) ----------
// They join the normal rotation only when the portal is switched on and there is something to show.
function timetableFor(date){
  const st = portalLoad(), tt = st.timetable[monthKeyOf(date)];
  if(!tt) return [];
  const list = tt.exceptions[date] || tt.weekly[dowOf(date)] || [];
  return list.slice().sort((a, b) => a.t.localeCompare(b.t));
}
function nowHHMM(){ const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

// the people working today by shift (a night shift that began yesterday is still "today" until it ends)
function todayGroups(nowMs){
  const st = portalLoad(), now = nowMs || Date.now(), today = isoDate(new Date(now)), yesterday = addDays(today, -1);
  const byId = {}; st.instructors.forEach(p => { byId[p.id] = p; });
  const groups = [];
  [yesterday, today].forEach(date => {
    const m = st.months[monthKeyOf(date)];
    if(!m || !m.published) return;
    buildSlots(monthKeyOf(date), st.shiftTypes).filter(s => s.date === date).forEach(s => {
      if(s.end <= now - 0 && date === yesterday) return;                  // yesterday's shift that already ended
      if(date === yesterday && !s.night) return;                          // only a night shift reaches into today
      const people = (m.assignments[s.key] || []).map(pid => byId[pid]).filter(Boolean);
      groups.push({ slot:s, shift:st.shiftTypes.find(x => x.id === s.shiftId), people, active:now >= s.start && now < s.end });
    });
  });
  return groups.sort((a, b) => a.slot.start - b.slot.start);
}

async function renderInstructorsToday(){
  const el = document.getElementById('tv-instructors'), st = portalLoad();
  const groups = todayGroups().filter(g => g.people.length);
  if(!groups.length){ el.innerHTML = '<div class="empty">אין מדריכים משובצים להיום</div>'; return; }
  el.style.setProperty('--tvi-cols', groups.length);
  el.innerHTML = groups.map(g => `
    <div class="tvi-group${g.active ? ' now' : ''}">
      <div class="tvi-shift"><span>${escapeHtml(g.shift.label)}</span><small>${g.shift.start}–${g.shift.end}</small></div>
      <div class="tvi-people">${g.people.map(p => `<div class="tvi-person"><img class="tvi-photo" src="${p.photo}" alt=""><div class="tvi-name">${escapeHtml(instrName(p, st.instructors))}</div></div>`).join('')}</div>
    </div>`).join('');
}

async function renderTimetableToday(){
  const el = document.getElementById('tv-timetable'), list = timetableFor(isoDate(new Date()));
  if(!list.length){ el.innerHTML = '<div class="empty">אין לו"ז להיום</div>'; return; }
  const now = nowHHMM();
  let current = -1; list.forEach((a, i) => { if(a.t <= now) current = i; });
  el.dataset.layout = list.length > 6 ? 'two' : 'one';
  el.innerHTML = list.map((a, i) => `<div class="tvt-row${i === current ? ' now' : i < current ? ' past' : ''}"><span class="tvt-icon">${a.e}</span><span class="tvt-time">${a.t}</span><span class="tvt-name">${escapeHtml(a.n)}</span></div>`).join('');
}

async function renderWeekAhead(){
  const el = document.getElementById('tv-week'), today = isoDate(new Date()), st = portalLoad();
  let html = '';
  for(let i = 0; i < 7; i++){
    const date = addDays(today, i), tt = st.timetable[monthKeyOf(date)], list = timetableFor(date);
    const special = tt && tt.exceptions[date];
    const weeklyNames = new Set(((tt && tt.weekly[dowOf(date)]) || []).map(a => a.n));
    const shown = special ? list.filter(a => !weeklyNames.has(a.n)).concat(list.filter(a => weeklyNames.has(a.n))).slice(0, 4) : list.filter(a => /ארוחת צהריים|חוג|לימודים|סרט|יצירה|טיול/.test(a.n)).slice(0, 4);
    html += `<div class="tvw-day${i === 0 ? ' today' : ''}${special ? ' special' : ''}">
      <div class="tvw-head"><b>${DOW_NAMES[dowOf(date)]}</b><small>${parseIso(date).getDate()}/${parseIso(date).getMonth() + 1}</small></div>
      <div class="tvw-items">${shown.map(a => `<div class="tvw-item${special && !weeklyNames.has(a.n) ? ' new' : ''}"><span>${a.e}</span><em>${escapeHtml(a.n)}</em></div>`).join('') || '<div class="tvw-none">—</div>'}</div>
      ${special ? '<div class="tvw-flag">יום מיוחד</div>' : ''}
    </div>`;
  }
  el.innerHTML = html;
}

async function renderBirthdaysToday(){
  const el = document.getElementById('tv-birthdays'), list = birthdaysToday();
  if(!list.length){ el.innerHTML = '<div class="empty">אין ימי הולדת היום</div>'; return; }
  el.style.setProperty('--tvb-cols', Math.min(list.length, 4));
  el.innerHTML = '<div class="tvb-confetti" aria-hidden="true">' + Array.from({ length:26 }, (_, i) => `<i style="left:${(i * 37) % 100}%; animation-delay:${(i % 9) * -0.7}s; background:hsl(${(i * 53) % 360},80%,60%)"></i>`).join('') + '</div>'
    + list.map(x => `<div class="tvb-card"><div class="tvb-cake">🎂</div>${avatarHtml(x.child)}<div class="tvb-name">${escapeHtml(displayName(x.child))}</div><div class="tvb-age">גיל ${x.b.age}</div><div class="tvb-wish">יום הולדת שמח!</div></div>`).join('');
}

function refreshPortalSlides(){
  if(!PORTAL_ENABLED || !SLIDES[9]) return;
  const st = portalLoad(), today = isoDate(new Date());
  SLIDES[9].hidden = !todayGroups().some(g => g.people.length);
  SLIDES[10].hidden = timetableFor(today).length === 0;
  SLIDES[11].hidden = !st.timetable[monthKeyOf(today)];
  SLIDES[12].hidden = !(typeof roster !== 'undefined' && roster.length && birthdaysToday().length);
}

if(PORTAL_ENABLED){
  SLIDES.push(
    { id:9, label:'המדריכים היום', render: renderInstructorsToday, hidden:true },
    { id:10, label:'הלו"ז של היום', render: renderTimetableToday, hidden:true },
    { id:11, label:'מה קורה השבוע', render: renderWeekAhead, hidden:true },
    { id:12, label:'ימי הולדת', render: renderBirthdaysToday, hidden:true }
  );
  refreshPortalSlides();
}
