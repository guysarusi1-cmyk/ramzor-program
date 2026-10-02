// ---------- RED + ORANGE PROTOCOLS: guided, one step at a time (one shared screen) ----------
// Card bodies: a string renders as a paragraph; {list:[...]} as bullets; {ol:[...]} as numbered;
// {quote, by} as a quotation. In a list item, [lead, rest] renders as "<b>lead</b> — rest".
const RED_STEPS = [
  { name:'גבול תוך תיקוף רגשות בקול', action:'גבול תוך תיקוף רגשות בקול.',
    cards:[
      { label:'מסר', body:'העמקת ההבנה שיש מקום לכל רגש, אך לא לכל התנהגות. וגם שמירה על קשר במקביל להצבת גבול ברור.' },
      { label:'דוגמה', body:'„אני רואה שאתה כועס, אבל אנחנו לא מרביצים ולכן אתה צריך להיות בצד כרגע.”' }
    ] },
  { name:'הרחקה לחדר הרוגע', action:'הרחקה לחדר הרוגע לחמש דקות לפחות.', note:'ללא ארגז חדר רוגע.', ageWarning:true,
    cards:[
      { label:'מסר', body:{ ol:[
        'המרחב שלנו בטוח ומוגן ומי שינהג בצורה לא בטוחה יורחק מהקבוצה עד שיחזור להתנהג באופן בטוח ואז יוכל לשוב לקבוצה.',
        'יש השלכות לפגיעה בתחושת הביטחון של ילד אחר, לכן לא נוכל לאפשר לך ליהנות ולשחק בארגז הוויסות.'
      ] } }
    ] },
  { name:'מסרים מקרבים', action:'מסרים מקרבים בתוך חדר הרוגע.',
    cards:[
      { label:'מסר', body:'הפרדה בין כעס לאהבה – המעשה לא פוגע בקשר.' },
      { label:'דוגמאות', body:{ list:['„אני פה איתך, אני רוצה לעזור לך.”', '„תספר לי בדיוק מה קרה?”'] } }
    ] },
  { name:'ויסות רגשי', action:'לעזור לילד להירגע.',
    cards:[
      { label:'מהות', body:{ list:[
        'תרגול דרכי ויסות שונות בזמן אמת.',
        'חיזוק האמון והקשר דרך הוויסות המשותף.',
        'הרגעת המערכת של הילד בשביל להתפנות ללמידה.'
      ] } },
      { label:'איך אפשר לעזור?', body:{ list:[
        ['דרך מילים', 'להזכיר לילד כוחות ותכונות חיוביות שרלוונטיות לרגע.'],
        ['דרך קרבה', 'נוכחות קרובה ומותאמת; למשל לשבת לידו, להציע יד או לשאול אם הוא רוצה חיבוק.'],
        ['דרך הומור', 'כאשר מתאים, להשתמש בהומור או משחקיות כדי להפחית מתח.'],
        ['דרך הגוף', 'נשימה משותפת, תנועה, מים או פעילות גופנית קצרה.']
      ] } }
    ] },
  { name:'מרחב לשיתוף', action:'הקשבה פעילה ומתן מרחב לילד.',
    cards:[
      { label:'מהות', body:'פתיחת מרחב להעמקת הקשר וללמידה משותפת על הילד.' },
      { label:'איך עושים את זה?', body:{ list:[
        ['שיקוף', '„זה ממש עצבן אותך כשהוא לקח לך את הבימבה.”'],
        ['תיקוף', '„ברור שזה הכעיס אותך, זה באמת יכול להיות מעצבן.”'],
        ['סקרנות', 'לשאול שאלות פתוחות וסקרניות ולאפשר לילד לענות.'],
        ['שהייה', 'לא למהר לפתור או ללמד; לתת מקום למה שעולה מהילד.']
      ] } }
    ] },
  { name:'למידה', action:'הצעת תגובות חלופיות ותרגול שלהן.',
    cards:[
      { label:'מהות', body:'למידה והטמעה של דרכי פעולה מיטיבות יותר.' },
      { label:'איך עושים את זה?', body:'משחק תפקידים: משחזרים יחד את מה שקרה, ואז משחקים את הסיטואציה שוב — הפעם עם תגובה אחרת ומיטיבה יותר.' }
    ] },
  { name:'תיקון', action:'בקשת סליחה או שיחה משותפת עם הילד שנפגע, בהתאם למעשה.',
    cards:[
      { label:'מסר', body:{ quote:'„אז תאמין שאם קלקלת, אתה יכול גם לתקן.”', by:'— אהוד בנאי' } }
    ] },
  { name:'שלב 8 — דיווח', report:true, cards:[] }
];

// Orange: same journey as red, with the differences the client specified — a different boundary
// message (the example is the one orange already had), no minimum time in the calm room and the
// regulation box is available, regulation box offered as one more way to help, and the repair step
// is about tidying up rather than apologising to a specific child (there may be no injured child).
const ORANGE_STEPS = [
  { name:'גבול תוך תיקוף רגשות בקול', action:'גבול תוך תיקוף רגשות בקול.',
    cards:[
      { label:'מסר', body:'לתת מקום לקושי של הילד, תוך שמירה על גבולות המגנים על המרקם החברתי והמרחב המשותף.' },
      { label:'דוגמה', body:'„אני רואה שקשה לך, אבל אנחנו לא צועקים בזמן ההשכבות באזור החדרים, לכן אתה לא יכול להיות פה.”' }
    ] },
  { name:'הרחקה לחדר הרוגע', action:'הרחקה לחדר הרוגע עד לוויסות.',
    notes:['ללא זמן מינימום.', 'אפשר להשתמש בארגז הוויסות.'], ageWarning:true,
    cards:[
      { label:'מסר', body:'ההתנהגות שלך מפריעה לשאר הילדים, אנחנו רוצים לעזור לך להירגע.' }
    ] },
  RED_STEPS[2],
  (()=>{
    const s = JSON.parse(JSON.stringify(RED_STEPS[3]));
    s.cards[1].body.list.push(['ארגז הוויסות', 'אפשרות נוספת שעומדת לרשות המדריך.']);
    return s;
  })(),
  RED_STEPS[4],
  RED_STEPS[5],
  { name:'תיקון', action:'ביצוע פעולת תיקון במידת הצורך.',
    notes:['אין בהכרח ילד מסוים שנפגע.', 'למשל: איסוף מזון או חפצים שנזרקו, ארגון המרחב וכדומה.'],
    cards:[
      { label:'מסר', body:{ quote:'„אז תאמין שאם קלקלת, אתה יכול גם לתקן.”', by:'— אהוד בנאי' } }
    ] },
  RED_STEPS[7]
];

// Yellow: a shorter flow (5 steps) — no calm room, no report. The old "update the rest of the shift"
// step is gone (client request). The last step hands over to the EXISTING "גריעת בונוס" action in
// the kids-screen control area (see kidsQuickOpenRevokeIntro), it doesn't reimplement it.
const YELLOW_STEPS = [
  { name:'העברת המסר', action:'„אם אתה לא לוקח חלק בשגרה, אתה לא תיהנה מההטבות שלה.”', cards:[] },
  { name:'יידוע על התהליך והסנקציה', action:'להסביר לילד מראש את התהליך.',
    cards:[ { label:'דוגמה', body:'„אני אתן לך שתי אזהרות. אחרי הפעם השנייה — אם לא תעשה..., לא תקבל... כשכולם יקבלו.”' } ] },
  { name:'אזהרה ראשונה', action:'לתת לילד הזדמנות לעשות את מה שהתבקש.', cards:[] },
  { name:'אזהרה שנייה', action:'הזדמנות נוספת, תוך תזכורת שזו האזהרה האחרונה ומה יישלל אם הילד לא יבצע את שהתבקש.', cards:[] },
  { name:'גריעת בונוס', action:'לומר לילד מה נשלל ממנו.', revoke:true, cards:[] }
];

// the colour here only marks WHICH protocol this is (small dot next to the title), nothing else
const GUIDED_PROTOCOLS = {
  red:    { title:'פרוטוקול אדום',  color:'var(--red)',    steps:RED_STEPS },
  orange: { title:'פרוטוקול כתום', color:'var(--orange)', steps:ORANGE_STEPS },
  yellow: { title:'פרוטוקול צהוב', color:'var(--yellow)', steps:YELLOW_STEPS }
};
let guidedKey = 'red';
let guidedStep = 0;
let guidedOpenCard = null;

function guidedCardBodyHtml(body){
  if(typeof body === 'string') return `<div>${body}</div>`;
  if(body.quote) return `<p class="guided-quote">${body.quote}<span class="guided-quote-by">${body.by}</span></p>`;
  const item = it => Array.isArray(it) ? `<b>${it[0]}</b> — ${it[1]}` : it;
  const tag = body.ol ? 'ol' : 'ul';
  return `<${tag}>${(body.ol || body.list).map(it=>`<li>${item(it)}</li>`).join('')}</${tag}>`;
}

function renderGuidedStep(){
  const proto = GUIDED_PROTOCOLS[guidedKey];
  const steps = proto.steps;
  const step = steps[guidedStep];
  const body = document.getElementById('guided-step-body');
  const total = steps.length;
  document.getElementById('guided-head-title').textContent = proto.title;
  document.getElementById('staff-screen-guided').style.setProperty('--proto-color', proto.color);
  let html = `<h3 class="guided-step-name">${step.name}</h3>`;
  if(step.report){
    html += `<a class="guided-report" id="guided-report-link" target="_blank" rel="noopener">מעבר לטופס דיווח</a>`;
  } else {
    if(step.action !== step.name + '.') html += `<p class="guided-step-action">${step.action}</p>`;
    const notes = step.notes || (step.note ? [step.note] : []);
    notes.forEach(n => { html += `<p class="guided-step-note">${n}</p>`; });
    if(step.ageWarning){
      const child = roster.find(c=>c.id===selectedStaffChild);
      // with no child chosen we can't know the age, so the reminder is always shown
      const age = child ? parseFloat(child.age) : NaN;
      if(!child || (!isNaN(age) && age < 5)) html += `<div class="age-warning guided-under5">⚠️ אסור להכניס ילד מתחת לגיל 5 לחדר הרוגע לבד!</div>`;
    }
    if(step.revoke) html += `<button type="button" class="guided-report" id="guided-revoke-btn">גריעת בונוס</button>`;
    if(step.cards.length){
      html += `<div class="guided-tabs">${step.cards.map((c,i)=>`<button type="button" class="guided-tab" data-card="${i}" aria-expanded="false">${c.label}</button>`).join('')}</div>`;
      html += `<div id="guided-panel-slot"></div>`;
    }
  }
  body.innerHTML = html;
  guidedOpenCard = null;

  if(step.report){
    // same form the orange screen links to — single source of truth for the URL
    document.getElementById('guided-report-link').href = document.getElementById('report-form-link').href;
  }
  const revokeBtn = document.getElementById('guided-revoke-btn');
  if(revokeBtn) revokeBtn.addEventListener('click', ()=>{
    // hand over to the existing "גריעת בונוס" screen of the kids-screen control area
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-kids-quick').classList.add('active');
    kidsQuickShowColorPicker();
    kqOrigin = 'protocol';
    kidsQuickOpenRevokeIntro();
  });
  body.querySelectorAll('.guided-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      const idx = Number(tab.dataset.card);
      const slot = document.getElementById('guided-panel-slot');
      body.querySelectorAll('.guided-tab').forEach(t=>t.setAttribute('aria-expanded','false'));
      if(guidedOpenCard === idx){ guidedOpenCard = null; slot.innerHTML = ''; return; }
      guidedOpenCard = idx;
      tab.setAttribute('aria-expanded','true');
      slot.innerHTML = `<div class="guided-panel">${guidedCardBodyHtml(step.cards[idx].body)}</div>`;
    });
  });

  document.getElementById('guided-prev-btn').hidden = (guidedStep === 0);
  document.getElementById('guided-next-btn').hidden = (guidedStep === total - 1);
  document.getElementById('guided-counter').textContent = `שלב ${guidedStep+1} מתוך ${total}`;
}

function openGuidedScreen(key){
  guidedKey = key;
  guidedStep = 0;
  renderGuidedStep();
  showStaffScreen('guided');
}
document.getElementById('guided-next-btn').addEventListener('click', ()=>{
  if(guidedStep < GUIDED_PROTOCOLS[guidedKey].steps.length - 1){ guidedStep++; renderGuidedStep(); window.scrollTo({top:0}); }
});
document.getElementById('guided-prev-btn').addEventListener('click', ()=>{
  if(guidedStep > 0){ guidedStep--; renderGuidedStep(); window.scrollTo({top:0}); }
});

function renderYellowScreen(ids){
  ids = ids || {
    title: 'yellow-title-headline', protocol: 'yellow-protocol', childTitle: 'yellow-childname-title',
    dailyList: 'yellow-bonus-daily-list', weeklyList: 'yellow-bonus-weekly-list', dutyList: 'yellow-duty-list'
  };
  const child = roster.find(c=>c.id===selectedStaffChild);
  if(!child) return;
  document.getElementById(ids.title).textContent = PROGRAM.yellow.title;
  document.getElementById(ids.protocol).innerHTML = renderProtocolCard('yellow');
  document.getElementById(ids.childTitle).textContent = 'בונוסים — ' + displayName(child);

  function renderBonusChips(containerId, list, emptyMsg){
    const el = document.getElementById(containerId);
    const todayList = list.filter(bonusAppliesToday);
    if(!todayList.length){ el.innerHTML = `<div class="empty">${emptyMsg}</div>`; return; }
    el.innerHTML = todayList.map(b => `
      <div class="bonus-chip" data-id="${b.id}"><span>${b.text}</span><button class="revoke-bonus">גריעה</button></div>
    `).join('');
    el.querySelectorAll('.revoke-bonus').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const bonusId = btn.closest('.bonus-chip').dataset.id;
        const bonusText = btn.closest('.bonus-chip').querySelector('span').textContent;
        const ok = await revokeBonus(selectedStaffChild, bonusId);
        toast(ok ? `✔ נקלט במערכת — נגרע מ${displayName(child)}: ${bonusText}` : `⚠ הגריעה לא נשמרה, נסו שוב`);
      });
    });
  }
  renderBonusChips(ids.dailyList, bonusesDaily, 'אין בונוסים יומיים מוגדרים (הוסיפו במסך הניהול)');
  renderBonusChips(ids.weeklyList, bonusesWeekly, 'אין בונוסים שבועיים מוגדרים (הוסיפו במסך הניהול)');

  const dutyEl = document.getElementById(ids.dutyList);
  if(!dutyRoster.length){ dutyEl.innerHTML = '<div class="empty">אין תורנויות מוגדרות (הוסיפו במסך הניהול)</div>'; }
  else{
    dutyEl.innerHTML = dutyRoster.map(d => `
      <div class="duty-item" data-id="${d.id}"><span>${d.text}</span><button class="revoke-duty">גריעה</button></div>
    `).join('');
    dutyEl.querySelectorAll('.revoke-duty').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const dutyText = btn.closest('.duty-item').querySelector('span').textContent;
        toast(`נגרע מ${displayName(child)}: ${dutyText}`);
      });
    });
  }
}
function openYellowScreen(){
  renderYellowScreen();
  showStaffScreen('yellow');
}

async function logFeedbackEvent(childId, type, message){
  const { error } = await sb.from('feedback_events').insert({ child_id: childId, type, message });
  if(error) console.error(error);
}

async function giveStar(childId){
  const state = await getChildState(childId);
  state.stars = (state.stars || 0) + 1;
  await setChildState(childId, state);
  const child = roster.find(c=>c.id===childId);
  toast(`⭐ כוכב נוסף ל${displayName(child)} — סה"כ ${state.stars}`);
  logFeedbackEvent(child.id, 'star', `⭐ ${displayName(child)} קיבל/ה כוכב!`);
}

async function renderMoonPanel(containerId){
  const child = roster.find(c=>c.id===selectedStaffChild);
  const state = await getChildState(selectedStaffChild);
  const fb = document.getElementById(containerId);
  const inStage2 = (state.moonSteps || 0) >= 7;
  const stage2Done = (state.mercurySteps || 0) >= 7;

  if(inStage2 && stage2Done){
    fb.innerHTML = `
      <div class="protocol prot-gold" style="margin-top:14px;">
        <div class="light-title">🪐 ${displayName(child)} הגיע/ה לכוכב המילים!</div>
        <div class="note">השלב השני של תכנית הירח הושלם.</div>
      </div>`;
    return;
  }

  const isToday = MOON_DAILY_LIMIT_ENABLED && state.moonDayDate === todayStr();
  const stageTitle = inStage2 ? '🪐 המסע לכוכב המילים' : '🚀 תכנית המסע בחלל';
  const positiveLabel = inStage2 ? 'הצליח/ה לבטא במילים (התקדמות)' : 'יום נקי (התקדמות)';
  const negativeLabel = 'חללית מושבתת עקב קללות';

  let statusHtml;
  if(isToday && state.moonDayStatus === 'progressed'){
    statusHtml = `<div class="note" style="color:var(--gold);">✅ כבר נרשם היום צעד קדימה — לא ניתן להוסיף עוד היום.</div>`;
  } else if(isToday && state.moonDayStatus === 'cursed'){
    statusHtml = `<div class="note" style="color:var(--red);">⚠️ נרשם היום שלא הצליח/ה — אין התקדמות היום.</div>`;
  } else {
    statusHtml = `<div class="note">היום עדיין לא נרשמה החלטה עבור ${displayName(child)}.</div>`;
  }
  const disabledAttr = isToday ? 'disabled style="opacity:.5; cursor:not-allowed;"' : '';
  fb.innerHTML = `
    <div class="protocol prot-gold" style="margin-top:14px;">
      <div class="light-title">${stageTitle} — ${displayName(child)}</div>
      ${statusHtml}
      <div class="gold-actions" style="margin-top:10px;">
        <button class="gold-btn" id="moon-clean" ${disabledAttr}>${positiveLabel}</button>
        <button class="gold-btn" id="moon-curse" ${disabledAttr}>${negativeLabel}</button>
      </div>
      <button class="gold-btn" disabled style="margin-top:10px; width:100%; opacity:.45; cursor:not-allowed;">שדרוגים במהלך המסע (בקרוב)</button>
    </div>`;
  if(isToday) return;
  document.getElementById('moon-clean').addEventListener('click', async ()=>{
    const s = await getChildState(selectedStaffChild);
    if(MOON_DAILY_LIMIT_ENABLED && s.moonDayDate === todayStr()){ renderMoonPanel(containerId); return; }
    s.moonDayDate = todayStr();
    s.moonDayStatus = 'progressed';
    let msg;
    let eventType = 'moon';
    let helpMilestone = false;
    if((s.moonSteps || 0) >= 7){
      s.mercurySteps = (s.mercurySteps || 0) + 1;
      eventType = 'mercury';
      msg = `🪐 ${displayName(child)} התקדם/ה צעד לעבר כוכב המילים — סה"כ ${s.mercurySteps}`;
      if(s.mercurySteps === 7) msg = `🪐✨ ${displayName(child)} הגיע/ה לכוכב המילים!`;
      if([2,4,6].includes(s.mercurySteps)) helpMilestone = true;
    } else {
      s.moonSteps = (s.moonSteps || 0) + 1;
      msg = `🚀 ${displayName(child)} התקדם/ה צעד — סה"כ ${s.moonSteps}`;
      if(s.moonSteps === 7) msg = `🌙 ${displayName(child)} הגיע/ה ל-7 צעדים — מקבל/ת ירח זוהר מעל למיטה! מתחיל/ה עכשיו את המסע לכוכב המילים.`;
    }
    await setChildState(selectedStaffChild, s);
    logFeedbackEvent(child.id, eventType, msg);
    toast(msg);
    if(helpMilestone) await renderHelpFriendPrompt(child, s.mercurySteps, containerId);
    else renderMoonPanel(containerId);
  });
  document.getElementById('moon-curse').addEventListener('click', async ()=>{
    const s = await getChildState(selectedStaffChild);
    if(MOON_DAILY_LIMIT_ENABLED && s.moonDayDate === todayStr()){ renderMoonPanel(containerId); return; }
    s.moonDayDate = todayStr();
    s.moonDayStatus = 'cursed';
    await setChildState(selectedStaffChild, s);
    toast(`נרשם: ${displayName(child)} לא מתקדם/ת היום. התראה נשלחה לגיא.`);
    renderMoonPanel(containerId);
  });
}

async function renderHelpFriendPrompt(fromChild, milestoneStep, containerId){
  const fb = document.getElementById(containerId);
  const eligible = [];
  for(const c of roster){
    if(c.id === fromChild.id) continue;
    const st = await getChildState(c.id);
    const finished = (st.moonSteps||0) >= 7 && (st.mercurySteps||0) >= 7;
    if(!finished) eligible.push(c);
  }
  if(!eligible.length){
    fb.innerHTML = `
      <div class="protocol prot-gold" style="margin-top:14px;">
        <div class="light-title">🎁 ${displayName(fromChild)} הגיע/ה לצעד ${milestoneStep}!</div>
        <div class="note">כל שאר הילדים כבר סיימו את המסע — אין כרגע למי לתת את המתנה.</div>
      </div>`;
    setTimeout(()=>renderMoonPanel(containerId), 3000);
    return;
  }
  fb.innerHTML = `
    <div class="protocol prot-gold" style="margin-top:14px;">
      <div class="light-title">🎁 ${displayName(fromChild)} הגיע/ה לצעד ${milestoneStep} — אפשר לקדם חבר/ה!</div>
      <div class="note">שאלו את ${displayName(fromChild)}: את מי הוא/היא רוצה לקדם צעד קדימה?</div>
      <div class="chip-row" id="help-friend-chips" style="margin-top:10px;">
        ${eligible.map(c=>`<span class="chip" data-id="${c.id}">${displayName(c)}</span>`).join('')}
      </div>
      <div class="add-row" style="margin-top:10px;">
        <button class="btn ghost" id="help-friend-skip" style="width:100%;">דלג/י</button>
      </div>
    </div>`;
  document.querySelectorAll('#help-friend-chips .chip').forEach(chip=>{
    chip.addEventListener('click', async ()=>{
      const targetId = chip.dataset.id;
      const target = roster.find(c=>c.id===targetId);
      const ts = await getChildState(targetId);
      let giftMsg, giftType;
      if((ts.moonSteps||0) < 7){
        ts.moonSteps = (ts.moonSteps||0) + 1;
        giftType = 'moon';
        giftMsg = `🎁 ${displayName(fromChild)} עזר/ה ל${displayName(target)} להתקדם צעד במסע לירח!`;
      } else {
        ts.mercurySteps = (ts.mercurySteps||0) + 1;
        giftType = 'mercury';
        giftMsg = `🎁 ${displayName(fromChild)} עזר/ה ל${displayName(target)} להתקדם צעד לעבר כוכב המילים!`;
      }
      await setChildState(targetId, ts);
      logFeedbackEvent(target.id, giftType, giftMsg);
      toast(giftMsg);
      renderMoonPanel(containerId);
    });
  });
  document.getElementById('help-friend-skip').addEventListener('click', ()=>renderMoonPanel(containerId));
}

