// ---------- THE SIMPLICITY CHECKER'S SCREENS (test build only; the agent .claude/agents/simplicity-checker.md) ----------
// "#simplicity" on a local copy of the test site shows every screen of the therapy portal with made-up data and no sign-in, so the checker can
// go through them as a new therapist would, on a computer and on a phone, and judge them by the 12 principles (dist/mercury/simplicity-principles.md).
// Nothing here talks to a server; a save simply fails quietly.
const SIMPLE_GOAL = { id:'demo-goal', kind:'goal', scope:'mercury', active:true, draft:true, title:'להירגע בעזרת כלי הרגעה', description:'להשתמש בדרך הרגעה שבחר/ה כשהרגש חזק', themes:['ויסות רגשי'], category:'ויסות רגשי', methods:['ARC', 'TF-CBT', 'ויסות חושי'],
  content:{ v:2, bank:1, review:3, avoid:'לא לשלוח לפינה השקטה כעונש', strengths:['שליטה עצמית', 'התמדה', 'אומץ', 'סבלנות', 'בקשת עזרה'], skills:['הירגעות בעזרת כלי'],
    ages:{ '5-8':{ targets:[
      { id:'t1', text:'בוחר/ת כלי מקופסת ההרגעה ומשתמש/ת בו עם תזכורת', staff:'משתמש/ת בכלי מהקופסה כשמזכירים', scale:['מתפרץ/ת', 'אחרי שנרגע/ת', 'עם מבוגר צמוד', 'אחרי תזכורת', 'לבד, בזמן'] },
      { id:'t2', text:'מזהה סימן גוף מוקדם לפני התפרצות', staff:'אומר/ת שהגוף מתחיל לכעוס', scale:['לא מזהה', 'בדיעבד', 'כשמצביעים', 'בזמן', 'ופועל/ת'] },
      { id:'t3', text:'מבקש/ת הפסקה במקום להתפרץ', staff:'מבקש/ת הפסקה', scale:['מתפרץ/ת', 'בורח/ת', 'כשמציעים', 'עם כרטיס', 'במילים'] }],
      interventions:[
        { id:'i1', name:'קופסת הרגעה', what:'מכינים יחד קופסה עם 3–4 כלים, ומתרגלים בזמן רגוע', why:'כלי שבחר/ה עובד טוב יותר', freq:'פעמיים בשבוע', approach:'ויסות חושי', targets:['t1'], sentences:['איזה כלי יעזור לך עכשיו?', 'הקופסה שלך פה'] },
        { id:'i2', name:'מד הרגשות', what:'מד מ-1 עד 5, ומה עושים בכל מדרגה', why:'מדידה הופכת רגש למשהו שאפשר לטפל בו', freq:'פעמיים ביום', approach:'ARC', targets:['t2', 't3'], sentences:['כמה חזק זה עכשיו?', 'במדרגה 3 לוקחים הפסקה'] },
        { id:'i3', name:'נשימת בלון', what:'שואפים כמו מנפחים בלון, ונושפים לאט', why:'נשימה איטית מורידה עוררות', freq:'פעם ביום', approach:'TF-CBT', targets:['t1'], sentences:['בוא/י ננפח את הבלון', 'עוד נשימה אחת'] }] } } } };
const SIMPLE_SCREENS = [['tasks', 'משימות'], ['list', 'תוכניות טיפוליות: הרשימה'], ['plan', 'דף תוכנית'], ['b-start', 'בנייה: התחלה'], ['b-pick', 'בנייה: תמה'], ['b-goal', 'בנייה: מטרה'], ['b-targets', 'בנייה: יעדים'],
  ['b-ints', 'בנייה: התערבות'], ['b-sents', 'בנייה: משפטים'], ['b-journey', 'בנייה: מסע ומקדש'], ['b-sum', 'בנייה: סיכום'], ['b-preview', 'בנייה: לצוות'], ['child', 'הילד: התוכנית'], ['spiral', 'הספירלה'], ['staff', 'כרטיס הילד אצל המדריך']];
function simplicityOn(){ return typeof APP_ENV !== 'undefined' && APP_ENV === 'test' && location.hash.indexOf('#simplicity') === 0; }
// the made-up therapy portal (also the phone of the overview video, 14zh-learn.js)
function simplicityData(){
  roster.length = 0; roster.push({ id:'d1', firstName:'נועם', lastInitial:'כ', age:'7' }, { id:'d2', firstName:'מאיה', lastInitial:'ל', age:'4' });
  srv.profile = { therapist:true, admin:false, kind:'therapist' }; srv.me = 'demo-me';
  const goal = tpSync({ id:'g1', title:SIMPLE_GOAL.title, theme:'ויסות רגשי', library_id:SIMPLE_GOAL.id, status:'focus', why_staff:SIMPLE_GOAL.description, review_date:isoDate(new Date(Date.now() + 80 * 864e5)),
    targets_list:SIMPLE_GOAL.content.ages['5-8'].targets.slice(0, 2).map((t, k) => Object.assign({}, t, { now:2 + k, target:4 })), strengths:['אומץ'], planet_id:null, bank:{ id:SIMPLE_GOAL.id, age:'5-8' },
    interventions_list:SIMPLE_GOAL.content.ages['5-8'].interventions.slice(0, 2).map(i => Object.assign({}, i, { sentences:i.sentences.slice(0, 1) })) });
  const plan = Object.assign(planEmpty(), { summary:'נועם הגיע לפני חודש. כרגע הכי חשוב לעזור לו להירגע ברגעי כעס.', avoid:'לא להרים את הקול', goals:[goal, tpSync({ id:'g2', title:'לפנות למבוגר בטוח כשקשה', status:'waiting', targets_list:[], interventions_list:[] })] });
  Object.assign(thp, { loaded:true, ok:true, v32:true, v42:true, v43:true, mode:'therapist', mine:['d1', 'd2'], library:[SIMPLE_GOAL], plans:{ d1:{ child_id:'d1', draft:plan, published:plan, published_version:2, review_date:goal.review_date } },
    guidance:{ d1:{ child_id:'d1', version:2, content:plan } }, planets:[], videos:{}, unseen:{ d1:2 }, questions:{ d2:1 }, journeys:{}, risen:[], stays:{ d2:{ admitted:isoDate(new Date(Date.now() - 12 * 864e5)) } }, newInc:{ d1:1 }, lettersWait:{}, mopts:{ focus_max:1 }, favs:new Set(), useN:{} });
  thpLoad = async () => {};          // (no server here)
}
async function simplicityStart(){
  simplicityData();
  portalActivateView('view-therapy');
  document.getElementById('login-screen').style.display = 'none'; document.getElementById('protected-app').style.display = '';
  simplicityShow((location.hash.split(':')[1]) || 'tasks');
  window.addEventListener('hashchange', () => { if(simplicityOn()) simplicityShow(location.hash.split(':')[1] || 'tasks'); });
}
function simplicityShow(screen){
  thp.planChild = null; thp.editing = null; thp.wtab = null; thp.mode = screen === 'staff' ? 'staff' : 'therapist';
  const b = (step, extra) => { thp.tab = 'plans'; thpRender(); tpBuilder('d1', Object.assign({ step, entry:'theme', theme:'ויסות רגשי', age:'5-8', targets:[], ints:[], strengths:[], planet:'' }, extra || {})); };
  const T = SIMPLE_GOAL.content.ages['5-8'], t2 = T.targets.slice(0, 2).map(t => Object.assign({}, t, { now:2, target:4 })), i2 = T.interventions.slice(0, 2).map(i => Object.assign({}, i, { sentencesAll:i.sentences, sentences:[i.sentences[0]] }));
  const withGoal = { libId:SIMPLE_GOAL.id, title:SIMPLE_GOAL.title, why:SIMPLE_GOAL.description };
  if(screen === 'tasks'){ thp.tab = 'todo'; thpRender(); }
  else if(screen === 'list'){ thp.tab = 'plans'; thpRender(); }
  else if(screen === 'plan'){ thp.tab = 'plans'; thp.planChild = 'd1'; thpRender(); }
  else if(screen === 'b-start') b('start');
  else if(screen === 'b-pick') b('pick');
  else if(screen === 'b-goal') b('goal');
  else if(screen === 'b-targets') b('targets', Object.assign({ targets:t2.slice(0, 1) }, withGoal));
  else if(screen === 'b-ints') b('ints', Object.assign({ targets:t2 }, withGoal));
  else if(screen === 'b-sents') b('sents', Object.assign({ targets:t2, ints:i2 }, withGoal));
  else if(screen === 'b-journey') b('journey', Object.assign({ targets:t2, ints:i2 }, withGoal));
  else if(screen === 'b-sum') b('sum', Object.assign({ targets:t2, ints:i2, strengths:['אומץ'] }, withGoal));
  else if(screen === 'b-preview') b('preview', Object.assign({ targets:t2, ints:i2, strengths:['אומץ'], status:'focus' }, withGoal));
  else if(screen === 'child'){ thp.tab = 'mine'; thpRender(); planOpenEditor('d1', 'plan'); }
  else if(screen === 'spiral'){ thp.tab = 'mine'; thpRender(); planOpenEditor('d1', 'track'); }          // (the real tracking screen; here without data, only today's dot)
  else if(screen === 'staff'){ thp.tab = 'kids'; thpRender(); }
  if(!simplicityOn()) return;
  let bar = document.getElementById('simplicity-bar');
  if(!bar){ bar = document.createElement('nav'); bar.id = 'simplicity-bar'; document.body.appendChild(bar); }
  bar.innerHTML = SIMPLE_SCREENS.map(([k, w]) => `<a href="#simplicity:${k}"${k === screen ? ' aria-current="page"' : ''}>${w}</a>`).join('');
}
