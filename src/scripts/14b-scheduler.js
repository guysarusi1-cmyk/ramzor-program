
// ---------- THE SCHEDULER: builds a first work schedule from the rules and the preferences ----------
// Pure functions (no screen, no database), so they can be checked on their own.
//   "ממש לא" (no)   = a hard rule: the automatic schedule never uses it (only the coordinator may override, with a warning)
//   "מעדיף שלא" (avoid) and "כן" (yes) = wishes: the schedule tries to respect them, as far as the rules and the needs allow
// The rules (how many per shift, rest between shifts, ...) are numbers that the coordinator can change.
const LEVEL_SCORE = { yes:10, neutral:0, avoid:-7, no:-60 };

function timeToMin(t){ const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function slotKey(date, shiftId){ return date + '|' + shiftId; }
function splitKey(key){ const [date, shiftId] = key.split('|'); return { date, shiftId }; }

// every shift of the month that needs people
function buildSlots(month, shiftTypes){
  const slots = [];
  daysOfMonth(month).forEach(date => {
    const dow = dowOf(date), [y, m, d] = date.split('-').map(Number);
    shiftTypes.forEach(st => {
      const need = (dow === 5 || dow === 6) ? st.needWeekend : st.need;
      if(!need) return;
      const s = timeToMin(st.start), e = timeToMin(st.end);
      const start = new Date(y, m - 1, d, Math.floor(s / 60), s % 60).getTime();
      const end = new Date(y, m - 1, d, Math.floor(e / 60), e % 60).getTime() + (e <= s ? 86400000 : 0);
      slots.push({ key:slotKey(date, st.id), date, shiftId:st.id, need, start, end, night:!!st.night, dow, week:weekStartOf(date), dayN:Math.round(Date.UTC(y, m - 1, d) / 86400000) });
    });
  });
  return slots;
}

function levelOf(prefs, pid, slot){
  const p = prefs[pid];
  if(p && (p.absent || []).includes(slot.date)) return 'no';
  if(!p) return 'neutral';                                   // has not opened the preferences at all
  return (p.slots && p.slots[slot.key]) || 'yes';            // everything is "כן" until the instructor marks otherwise
}

// can this person take this shift, given what they already have? (the hard rules)
function schedCanTake(ctx, pid, slot, mine){
  const r = ctx.rules;
  if(levelOf(ctx.prefs, pid, slot) === 'no') return false;
  if(mine.some(x => x.date === slot.date)) return false;                                                    // one shift a day
  if(mine.filter(x => x.week === slot.week).length >= r.maxShiftsPerWeek) return false;
  if(slot.night && mine.filter(x => x.night).length >= r.maxNightsPerMonth) return false;
  const has = n => mine.some(x => x.dayN === n);
  let run = 1;
  for(let n = slot.dayN - 1; has(n); n--) run++;
  for(let n = slot.dayN + 1; has(n); n++) run++;
  if(run > r.maxConsecutiveDays) return false;
  const rest = r.minRestHours * 3600000;
  for(const x of mine){
    if(x.end <= slot.start && slot.start - x.end < rest) return false;
    if(slot.end <= x.start && x.start - slot.end < rest) return false;
  }
  return true;
}

function schedPeople(instructors){ return instructors.filter(p => p.active && p.role === 'instructor'); }

function schedScore(ctx, byPerson, assignments, slots){
  let total = 0, missing = 0;
  slots.forEach(s => {
    const list = assignments[s.key] || [];
    list.forEach(pid => { total += LEVEL_SCORE[levelOf(ctx.prefs, pid, s)]; });
    if(list.length < s.need) missing += s.need - list.length;
  });
  const counts = Object.values(byPerson).map(l => l.length), avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
  const variance = counts.reduce((a, c) => a + (c - avg) * (c - avg), 0);
  return total - 1000 * missing - 2 * variance;
}

// one greedy attempt (the random generator only breaks ties differently, so many attempts give different schedules)
function schedAttempt(ctx, slots, people, rnd){
  const assignments = {}, byPerson = {};
  people.forEach(p => { byPerson[p.id] = []; });
  const add = (pid, s) => { (assignments[s.key] = assignments[s.key] || []).push(pid); byPerson[pid].push(s); };
  const fixedKeys = new Set();
  if(ctx.fixed){ slots.forEach(s => (ctx.fixed[s.key] || []).forEach(pid => { if(byPerson[pid]){ add(pid, s); fixedKeys.add(s.key + '#' + pid); } })); }
  const elig = ctx._elig || (ctx._elig = {});
  const eligible = s => elig[s.key] !== undefined ? elig[s.key] : (elig[s.key] = people.filter(p => levelOf(ctx.prefs, p.id, s) !== 'no').length);
  const order = slots.slice().sort((a, b) => (eligible(a) / a.need + rnd() * 0.4) - (eligible(b) / b.need + rnd() * 0.4) || a.start - b.start);
  order.forEach(s => {
    while((assignments[s.key] || []).length < s.need){
      let best = null, bestScore = -Infinity;
      people.forEach(p => {
        if((assignments[s.key] || []).includes(p.id)) return;
        if(!schedCanTake(ctx, p.id, s, byPerson[p.id])) return;
        const mine = byPerson[p.id];
        let sc = LEVEL_SCORE[levelOf(ctx.prefs, p.id, s)] - 2 * mine.length + rnd() * 1.5;
        if(s.night) sc -= 1.5 * mine.filter(x => x.night).length;
        if(s.dow === 5 || s.dow === 6) sc -= 1 * mine.filter(x => x.dow === 5 || x.dow === 6).length;
        if(sc > bestScore){ bestScore = sc; best = p.id; }
      });
      if(best === null) break;
      add(best, s);
    }
  });
  // improvement: swap a person who got a worse level than somebody else who could take the shift instead
  for(let pass = 0; pass < 3; pass++){
    let changed = false;
    slots.forEach(s => {
      (assignments[s.key] || []).slice().forEach(pid => {
        if(fixedKeys.has(s.key + '#' + pid)) return;
        const cur = LEVEL_SCORE[levelOf(ctx.prefs, pid, s)];
        if(cur >= 10) return;
        for(const q of people){
          if(q.id === pid || (assignments[s.key] || []).includes(q.id)) continue;
          if(LEVEL_SCORE[levelOf(ctx.prefs, q.id, s)] <= cur) continue;
          if(byPerson[q.id].length > byPerson[pid].length) continue;
          if(!schedCanTake(ctx, q.id, s, byPerson[q.id])) continue;
          assignments[s.key] = assignments[s.key].filter(x => x !== pid); byPerson[pid] = byPerson[pid].filter(x => x.key !== s.key);
          add(q.id, s); changed = true; break;
        }
      });
    });
    if(!changed) break;
  }
  return { assignments, byPerson, score:schedScore(ctx, byPerson, assignments, slots) };
}

// the automatic schedule: many attempts, the best one wins. ctx = { month, instructors, shiftTypes, prefs, rules, fixed? }
function autoSchedule(ctx){
  const slots = buildSlots(ctx.month, ctx.shiftTypes), people = schedPeople(ctx.instructors);
  let best = null;
  ctx._elig = null;
  for(let k = 1; k <= 30; k++){
    const res = schedAttempt(ctx, slots, people, seededRandom(k * 7919));
    if(!best || res.score > best.score) best = res;
  }
  const unfilled = slots.filter(s => (best.assignments[s.key] || []).length < s.need).map(s => ({ key:s.key, missing:s.need - (best.assignments[s.key] || []).length }));
  return { assignments:best.assignments, unfilled, score:best.score };
}

// everything that is wrong or worth a look in a (maybe hand-edited) schedule
function validateSchedule(ctx, assignments){
  const slots = buildSlots(ctx.month, ctx.shiftTypes), issues = [], byPerson = {};
  slots.forEach(s => {
    const list = assignments[s.key] || [];
    if(list.length < s.need) issues.push({ type:'unfilled', key:s.key, missing:s.need - list.length });
    if(list.length > s.need) issues.push({ type:'over', key:s.key, extra:list.length - s.need });
    list.forEach(pid => {
      (byPerson[pid] = byPerson[pid] || []).push(s);
      const lv = levelOf(ctx.prefs, pid, s);
      if(lv === 'no') issues.push({ type:'no', key:s.key, iid:pid });
    });
  });
  const r = ctx.rules;
  Object.keys(byPerson).forEach(pid => {
    const list = byPerson[pid].slice().sort((a, b) => a.start - b.start), days = new Set(list.map(x => x.date));
    for(let i = 0; i < list.length; i++){
      const s = list[i];
      if(list.filter(x => x.date === s.date).length > 1 && list.findIndex(x => x.date === s.date) === i) issues.push({ type:'sameday', key:s.key, iid:pid });
      if(i > 0 && s.start - list[i - 1].end < r.minRestHours * 3600000 && list[i - 1].date !== s.date) issues.push({ type:'rest', key:s.key, iid:pid });
      let run = 1;
      for(let d = addDays(s.date, -1); days.has(d); d = addDays(d, -1)) run++;
      for(let d = addDays(s.date, 1); days.has(d); d = addDays(d, 1)) run++;
      if(run > r.maxConsecutiveDays && !issues.some(x => x.type === 'consec' && x.iid === pid && x.run === run && Math.abs(parseIso(x.key.split('|')[0]) - parseIso(s.date)) < r.maxConsecutiveDays * 86400000)) issues.push({ type:'consec', key:s.key, iid:pid, run });
    }
    const weeks = {};
    list.forEach(x => { const w = weekStartOf(x.date); weeks[w] = (weeks[w] || 0) + 1; });
    Object.keys(weeks).forEach(w => { if(weeks[w] > r.maxShiftsPerWeek) issues.push({ type:'maxweek', key:list.find(x => weekStartOf(x.date) === w).key, iid:pid, count:weeks[w] }); });
    const nights = list.filter(x => x.night).length;
    if(nights > r.maxNightsPerMonth) issues.push({ type:'nights', key:list.find(x => x.night).key, iid:pid, count:nights });
  });
  return issues;
}

// how well the wishes were kept: per person and overall
function scheduleStats(ctx, assignments){
  const slots = buildSlots(ctx.month, ctx.shiftTypes), per = {}, all = { yes:0, neutral:0, avoid:0, no:0, total:0 };
  slots.forEach(s => (assignments[s.key] || []).forEach(pid => {
    const lv = levelOf(ctx.prefs, pid, s);
    per[pid] = per[pid] || { yes:0, neutral:0, avoid:0, no:0, total:0 };
    per[pid][lv]++; per[pid].total++; all[lv]++; all.total++;
  }));
  const missing = slots.reduce((a, s) => a + Math.max(0, s.need - (assignments[s.key] || []).length), 0);
  return { per, all, missing };
}

// one short sentence: why is this person on this shift?
function whyAssigned(ctx, pid, slot){
  const lv = levelOf(ctx.prefs, pid, slot);
  if(lv === 'yes') return 'סימן/ה "כן" למשמרת הזו';
  if(lv === 'avoid') return 'סימן/ה "מעדיף שלא", ושובץ/ה כי לא נמצא מי שמתאים יותר';
  if(lv === 'no') return 'סימן/ה "ממש לא" — שיבוץ ידני של הרכזת, דורש אישור';
  return 'בלי העדפה — שובץ/ה כדי להשלים את הצוות';
}
