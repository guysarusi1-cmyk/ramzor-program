// ---------- MERCURY: THE GOAL BANK (scheduling-v42.sql + scheduling-v42-bank.sql; decisions 97-118) ----------
// The templates of the library, by theme: every goal has a wording per age band (2-5, 5-8, 8-12) that fills every field of a goal in the plan
// (the targets by frequency and a 1-5 scale, what the staff does, the sentences to say, the thinking, why it matters in two languages, strengths,
// skills, a review period, a line of what to avoid). The parts of a plan (avoid, signs, calm, routine) and whole plans per theme the same way.
// Filters: theme, treatment method (therapists only), age (the child's, or the developmental one when the center turns it on); search over all
// the text; ⭐ favourites first, then the most used. What Claude wrote is a draft until the admin approves it (a review screen, one after another).
// A therapist who changes a Mercury template gets a copy in the center's library. Changing a template never changes a child's plan.
const BANK_THEMES = PLAN_CATS;          // (14x: the ten themes)
const BANK_AGES = [['2-5', 'גילאי 2–5'], ['5-8', 'גילאי 5–8'], ['8-12', 'גילאי 8–12']];
const BANK_METHODS0 = ['ARC', 'DDP/PACE', 'TF-CBT', 'Theraplay', 'ויסות חושי', 'NMT'];
const BANK_PART_KINDS = ['avoid', 'signs', 'calm', 'routine'];
const bankIsAdmin = () => !!(srv.profile && srv.profile.admin);
const bankMethods = () => { const l = (thp.library || []).filter(x => x.kind === 'method' && x.active).map(x => x.title); return l.length ? [...new Set(l)] : BANK_METHODS0; };
const bankHasAges = x => !!(x && x.content && x.content.ages && Object.keys(x.content.ages).length);
const bankThemesOf = x => (x.themes && x.themes.length) ? x.themes : (x.category ? [x.category] : []);

// what the bank needs on top of the library: my favourites, how many plans use every template, the center's options (developmental age)
async function bankLoad(){
  thp.favs = new Set(); thp.useN = {}; thp.mopts = {}; thp.v42 = false;
  try {
    const [f, n, o] = await Promise.all([sbPersonal.from('library_favs').select('item_id').eq('staff_id', srv.me), sbPersonal.rpc('library_use_counts'),
      sbPersonal.from('sched_settings').select('value').eq('key', 'mercury_options').maybeSingle()]);
    if(!f.error){ (f.data || []).forEach(r => thp.favs.add(r.item_id)); thp.v42 = true; }
    if(!n.error) (n.data || []).forEach(r => { thp.useN[r.item_id] = r.n; });
    if(!o.error && o.data && o.data.value) thp.mopts = o.data.value;
  } catch(e){}
}

// ---- the child's age band: the developmental age written in the plan (when the center turns it on), else the age in the list of children
const bankAgeNum = v => { const m = String(v == null ? '' : v).replace(',', '.').match(/[0-9]+(?:\.[0-9]+)?/); return m ? parseFloat(m[0]) : null; };
const bankBand = n => n == null ? '' : n < 5 ? '2-5' : n < 8 ? '5-8' : '8-12';          // (5 counts with 5-8, 8 with 8-12: Guy)
function bankAgeOf(id, d){
  if(thp.mopts && thp.mopts.dev_age && d && bankAgeNum(d.dev_age) != null) return bankBand(bankAgeNum(d.dev_age));
  const c = roster.find(x => x.id === id); return bankBand(c ? bankAgeNum(c.age) : null);
}
// the wording is written with a slash ("מצליח/ה", "הוא/היא"); when the plan says בן or בת, it becomes one of them
const BANK_FINAL = { 'ך':'כ', 'ם':'מ', 'ן':'נ', 'ף':'פ', 'ץ':'צ' };
function bankGender(text, gender){
  if(!text || (gender !== 'm' && gender !== 'f')) return text || '';
  return String(text).replace(/([א-ת"']+)\/([א-ת]+)/g, (m, a, b, at, all) => {
    if(/אני (?:לא |עדיין |גם )?$/.test(all.slice(Math.max(0, at - 12), at))) return m;          // (the adult speaking of herself: not the child's gender)
    if(/(?:מטפל|אחראי|מדריך|מחנך)$/.test(a)) return m;          // (the staff: "המטפל/ת" stays as it is)
    if(gender === 'm') return a;
    if(b === 'ה' && a.slice(-1) === 'ו') return a.slice(0, -1) + 'ה';          // (שלו/ה, אותו/ה, עצמו/ה -> שלה, אותה, עצמה)
    if(b === 'תה') return (a.slice(-1) === 'ה' ? a.slice(0, -1) : a) + 'תה';          // (עשה/תה -> עשתה)
    if(['ה', 'ת', 'ית', 'י'].includes(b)) return a.slice(0, -1) + (BANK_FINAL[a.slice(-1)] || a.slice(-1)) + b;
    return b;
  });
}
const bankWording = (x, age) => { const a = (x.content && x.content.ages) || {}; return a[age] || a['5-8'] || a[Object.keys(a)[0]] || null; };
const bankSig = g => { const s = [g.title, g.targets, g.interventions, g.sentences, g.why_staff, g.seen, g.needs, g.why].join('|'); let h = 0; for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };
// the planet whose skill has the most words of the goal's title and skills (none if nothing matches)
function bankPlanetFor(g){
  const words = [g.title, ...(g.skills || [])].join(' ').split(/[\s,.]+/).filter(w => w.length > 2);
  let best = null, score = 0;
  (thp.planets || []).filter(p => p.active).forEach(p => { const s = `${p.skill || ''} ${p.name || ''}`, n = words.filter(w => s.includes(w)).length; if(n > score){ score = n; best = p.id; } });
  return best;
}
// a goal of the plan from a goal of the bank, in the child's age and gender -> { goal, avoid }
function bankGoalFrom(x, age, gender){
  const c = x.content || {}, w = bankWording(x, age) || {}, G = t => bankGender(t || '', gender);
  const g = Object.assign(planNewGoal(), { title:x.title, library_id:x.id, themes:bankThemesOf(x),
    targets:G(w.targets), interventions:G([(w.steps || []).map(s => '• ' + s).join('\n'), w.principles ? 'העיקרון: ' + w.principles : ''].filter(Boolean).join('\n')),
    sentences:G((w.sentences || []).join('\n')), seen:G(w.seen), needs:G(w.needs), why:G(w.why), why_staff:G(w.why_staff),
    strengths:(c.strengths || []).slice(0, 4), skills:(c.skills || []).slice(0, 2), review_months:c.review || 3, methods:x.methods || [],
    scale:(c.scale || []).length ? { anchors:c.scale.map(G), now:null, target:null } : null });
  g.planet_id = bankPlanetFor(g);          // (a planet for now, by the goal's skill: Mercury 120; the final one in the design meeting)
  const ages = c.ages || {}, used = ages[age] ? age : ages['5-8'] ? '5-8' : Object.keys(ages)[0] || age;
  g.bank = { id:x.id, age:used, method:w.method || '', edited:false };
  g.bank.sig = bankSig(g);
  return { goal:g, avoid:G(c.avoid || '') };
}
// the text of a part of the plan (avoid, signs, calm, routine) from the bank, in the child's age and gender
const bankPartText = (x, age, gender) => bankGender(bankHasAges(x) ? (bankWording(x, age) || '') : (x.description || x.title), gender);

// ---- the bank's order and filters
function bankList(kind, f){
  const q = (f.q || '').trim(), fav = thp.favs || new Set(), n = thp.useN || {};
  return (thp.library || []).filter(x => x.kind === kind && x.active
      && (!f.theme || bankThemesOf(x).includes(f.theme))
      && (!f.method || (x.methods || []).includes(f.method))
      && (!f.age || !bankHasAges(x) || !!x.content.ages[f.age])
      && (!q || `${x.title} ${x.description || ''} ${x.content ? JSON.stringify(x.content) : ''}`.includes(q)))
    .sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0) || (n[b.id] || 0) - (n[a.id] || 0) || a.title.localeCompare(b.title, 'he'));
}
const bankDraftTag = x => x.draft ? '<span class="bk-draft">טיוטה – לבדיקת מטפל/ת</span>' : '';
const bankUseTag = x => bankIsAdmin() ? `<span class="bk-use" title="בשימוש בתוכניות">בשימוש: ${(thp.useN || {})[x.id] || 0}</span>` : '';
const bankThemeChips = x => bankThemesOf(x).map(t => `<span class="bk-theme">${pEsc(t)}</span>`).join('');
// the full wording of one template, for one age (the preview before choosing, the review screen)
function bankPreviewHtml(x, age){
  const c = x.content || {};
  if(x.kind !== 'goal' && x.kind !== 'plan') return `<div class="bk-pv-text">${pEsc(bankHasAges(x) ? (bankWording(x, age) || '') : (x.description || ''))}</div>`;
  if(x.kind === 'plan') return `${c.summary ? `<div class="bk-pv-row"><b>תקציר (שלד)</b><span>${pEsc(c.summary)}</span></div>` : ''}${(c.goal_titles || []).length ? `<div class="bk-pv-row"><b>המטרות</b><span>${c.goal_titles.map(pEsc).join(' · ')}</span></div>` : ''}${x.description && !c.summary ? `<div class="bk-pv-text">${pEsc(x.description)}</div>` : ''}`;
  const w = bankWording(x, age); if(!w) return `<div class="bk-pv-text">${pEsc(x.description || '')}</div>`;
  const row = (k, v) => v ? `<div class="bk-pv-row"><b>${k}</b><span>${v}</span></div>` : '';
  const lines = l => (l || []).map(s => `<span class="bk-line">${pEsc(s)}</span>`).join('');
  return `${row('יעד לפי תדירות', pEsc(w.targets))}${(c.scale || []).length ? row('סולם 1–5', c.scale.map((s, i) => `<span class="bk-line">${i + 1} = ${pEsc(s)}</span>`).join('')) : ''}
    ${row('מה הצוות עושה', lines(w.steps) + (w.principles ? `<span class="bk-line"><i>העיקרון:</i> ${pEsc(w.principles)}</span>` : ''))}${row('משפטים לומר לילד/ה', lines(w.sentences))}
    ${row('מה רואים אצל הילד/ה', pEsc(w.seen))}${row('מה הוא/היא אולי צריך/ה', pEsc(w.needs))}${row('למה זה חשוב (מקצועי)', pEsc(w.why))}${row('למה זה חשוב (לצוות)', pEsc(w.why_staff))}
    ${row('שיטה', pEsc(w.method))}${(c.strengths || []).length ? row('חוזקות', c.strengths.map(pEsc).join(' · ')) : ''}${(c.skills || []).length ? row('מיומנויות למעקב', c.skills.map(pEsc).join(' · ')) : ''}
    ${row('ממה להימנע', pEsc(c.avoid))}${c.review ? row('בדיקה מחדש', `בעוד ${c.review === 1 ? 'חודש' : c.review + ' חודשים'}`) : ''}`;
}
const bankAgeChips = (x, age) => bankHasAges(x) ? `<div class="bk-ages">${BANK_AGES.filter(([k]) => x.content.ages[k]).map(([k, w]) => `<button type="button" class="bk-age${k === age ? ' on' : ''}" data-bk-age="${k}">${w}</button>`).join('')}</div>` : '';
const bankNote = () => '<details class="pfold bk-note"><summary><span>על הבנק</span></summary><div class="pfold-body">הנוסחים הם נקודת פתיחה, לא תחליף לשיקול דעת מקצועי. כל תוכנית מותאמת לילד/ה. נוסח שנבחר נעתק לתוכנית ונערך שם, והנוסח בבנק לא משתנה. "טיוטה" היא נוסח שעוד לא נבדק ואושר.</div></details>';

// ---- choosing from the bank (a goal, a part, a whole plan) -> onPick(item, age)
function bankPick(kind, opts){
  opts = opts || {};
  const f = { theme:'', method:'', age:opts.age || '', q:'' }, title = { goal:'בנק המטרות', plan:'תכניות שלמות', todo:'מה הצוות עושה' }[kind] || (PLAN_KIND_WORD[kind] || 'תבניות') + ' מהבנק';
  const sel = (id, label, list, v) => `<select id="${id}" aria-label="${label}"><option value="">${label}</option>${list.map(o => { const [k, w] = Array.isArray(o) ? o : [o, o]; return `<option value="${pEsc(k)}"${k === v ? ' selected' : ''}>${pEsc(w)}</option>`; }).join('')}</select>`;
  const sh = portalSheet(`<h2>${pEsc(title)}</h2>${bankNote()}
    <div class="bk-filter">${sel('bk-theme', 'כל התמות', BANK_THEMES, '')}${kind === 'goal' || kind === 'plan' ? sel('bk-method', 'כל השיטות', bankMethods(), '') : ''}${kind !== 'plan' ? sel('bk-agef', 'כל הגילאים', BANK_AGES, f.age) : ''}
      <input type="search" id="bk-q" placeholder="חיפוש בכל הטקסט" aria-label="חיפוש"></div>
    ${opts.age ? '' : (kind !== 'plan' ? '<div class="pnote">הגיל של הילד/ה לא ידוע: מוצגים כל הגילאים. אפשר לבחור טווח.</div>' : '')}
    <div class="bk-list" id="bk-list"></div><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-close>סגירה</button></div>`);
  sh.classList.add('bk-sheet');
  const shown = {};
  const draw = () => {
    const l = bankList(kind, f);
    sh.querySelector('#bk-list').innerHTML = l.map(x => { const age = shown[x.id] || f.age || opts.age || '5-8';
      return `<details class="bk-item" data-bk="${x.id}"><summary><button type="button" class="bk-fav${thp.favs && thp.favs.has(x.id) ? ' on' : ''}" data-bk-fav="${x.id}" aria-label="מועדף">${thp.favs && thp.favs.has(x.id) ? '★' : '☆'}</button>
        <span class="bk-title"><b>${pEsc(x.title)}</b>${x.description && x.kind === 'goal' ? `<small>${pEsc(x.description)}</small>` : ''}<span class="bk-tags">${bankThemeChips(x)}${bankDraftTag(x)}${bankUseTag(x)}${x.scope === 'center' ? '<span class="bk-center">המרכז</span>' : ''}</span></span></summary>
        <div class="bk-body">${bankAgeChips(x, age)}<div class="bk-pv">${bankPreviewHtml(x, age)}</div>
          <div class="bk-acts"><button type="button" class="btn small" data-bk-use="${x.id}">בחירה</button></div></div></details>`; }).join('')
      || `<div class="pnote">אין ${kind === 'goal' ? 'מטרות' : 'תבניות'} שמתאימות לסינון.${(thp.library || []).some(x => x.kind === kind) ? '' : ' (צריך להריץ את scheduling-v42-bank.sql)'}</div>`;
  };
  const list = sh.querySelector('#bk-list');
  list.addEventListener('click', async e => {
    const fv = e.target.closest('[data-bk-fav]'); if(fv){ e.preventDefault(); e.stopPropagation(); await bankToggleFav(fv.dataset.bkFav); draw(); return; }
    const ag = e.target.closest('[data-bk-age]'); if(ag){ const it = ag.closest('[data-bk]'), x = thp.library.find(y => y.id === it.dataset.bk); shown[x.id] = ag.dataset.bkAge;
      it.querySelector('.bk-pv').innerHTML = bankPreviewHtml(x, ag.dataset.bkAge); it.querySelectorAll('[data-bk-age]').forEach(b => b.classList.toggle('on', b === ag)); return; }
    const us = e.target.closest('[data-bk-use]'); if(us){ const x = thp.library.find(y => y.id === us.dataset.bkUse); const age = shown[x.id] || f.age || opts.age || '5-8'; sh.close(); if(x && opts.onPick) opts.onPick(x, age); }
  });
  [['#bk-theme', 'theme'], ['#bk-method', 'method'], ['#bk-agef', 'age']].forEach(([s, k]) => { const el = sh.querySelector(s); if(el) el.addEventListener('change', () => { f[k] = el.value; draw(); }); });
  sh.querySelector('#bk-q').addEventListener('input', e => { f.q = e.target.value; draw(); });
  draw();
  return sh;
}
async function bankToggleFav(id){
  if(!thp.favs) thp.favs = new Set();
  const on = thp.favs.has(id);
  const r = on ? await sbPersonal.from('library_favs').delete().eq('staff_id', srv.me).eq('item_id', id) : await sbPersonal.from('library_favs').insert({ staff_id:srv.me, item_id:id });
  if(r.error){ toast(/library_favs/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v42.sql' : 'לא נשמר'); return; }
  if(on) thp.favs.delete(id); else thp.favs.add(id);
}
// a goal that already has text: replace it, or add the wording after it -> 'replace' / 'add' / null
function bankReplaceAsk(){
  return new Promise(resolve => {
    let done = false; const finish = v => { if(done) return; done = true; s2.close(); resolve(v); };
    const s2 = portalSheet(`<h2>כבר כתוב משהו במטרה</h2><div class="cs-rebuild-opts"><button type="button" class="btn ghost" data-ra="replace"><b>להחליף</b><small>הנוסח מהבנק במקום מה שכתוב.</small></button>
      <button type="button" class="btn ghost" data-ra="add"><b>להוסיף אחרי</b><small>מה שכתוב נשאר, והנוסח נכנס אחריו.</small></button></div>
      <div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn ghost" data-ra="back">חזרה</button></div>`);
    s2.querySelectorAll('[data-ra]').forEach(b => b.addEventListener('click', () => finish(b.dataset.ra === 'back' ? null : b.dataset.ra)));
    s2.addEventListener('click', e => { if(e.target === s2) finish(null); });
  });
}
const bankJoin = (a, b) => [String(a || '').trim(), String(b || '').trim()].filter(Boolean).join('\n');
// merge a bank goal into a goal of the plan ('add': what was written stays first)
function bankMerge(old, g, how){
  if(how !== 'add') return Object.assign({}, g, { id:old.id, focus:old.focus, planet_id:old.planet_id || g.planet_id });
  const m = Object.assign({}, old);
  ['targets', 'interventions', 'sentences', 'seen', 'needs', 'why', 'why_staff'].forEach(k => { m[k] = bankJoin(old[k], g[k]); });
  m.title = old.title || g.title; m.strengths = [...new Set([...(old.strengths || []), ...(g.strengths || [])])].slice(0, 6);
  m.skills = [...new Set([...(old.skills || []), ...(g.skills || [])])]; m.themes = [...new Set([...(old.themes || []), ...(g.themes || [])])];
  ['library_id', 'scale', 'review_months', 'methods'].forEach(k => { if(!m[k] || (Array.isArray(m[k]) && !m[k].length)) m[k] = g[k]; });
  m.bank = Object.assign({}, g.bank, { edited:true }); return m;
}

// ---- the admin: the drafts, one after another: approve / edit / archive (decision 108)
function bankDrafts(){ return (thp.library || []).filter(x => x.draft && x.active).sort((a, b) => (a.kind === 'goal' ? 0 : 1) - (b.kind === 'goal' ? 0 : 1) || bankThemesOf(a).join().localeCompare(bankThemesOf(b).join(), 'he') || a.title.localeCompare(b.title, 'he')); }
function bankReview(start){
  let l = bankDrafts(), i = Math.max(0, Math.min(start || 0, l.length - 1)), age = '5-8';
  const sh = portalSheet('<div id="bk-rv"></div>'); sh.classList.add('bk-sheet');
  const draw = () => {
    const box = sh.querySelector('#bk-rv');
    if(!l.length){ box.innerHTML = '<div class="th-empty"><span aria-hidden="true">✅</span><b>אין טיוטות שמחכות</b><small>כל הנוסחים בבנק נבדקו.</small></div><div class="confirm-actions" style="grid-template-columns:1fr"><button type="button" class="btn" data-close>סגירה</button></div>'; box.querySelector('[data-close]').addEventListener('click', () => sh.close()); return; }
    const x = l[i]; if(bankHasAges(x) && !x.content.ages[age]) age = Object.keys(x.content.ages)[0];
    box.innerHTML = `<div class="bk-rv-head"><span>${i + 1} מתוך ${l.length}</span><span class="bk-kind">${pEsc(PLAN_KIND_WORD[x.kind] || x.kind)}</span></div>
      <h2>${pEsc(x.title)}</h2><div class="bk-tags">${bankThemeChips(x)}${(x.methods || []).map(m => `<span class="bk-method">${pEsc(m)}</span>`).join('')}</div>
      ${x.description && x.kind !== 'method' ? `<div class="pnote">${pEsc(x.description)}</div>` : ''}${x.kind === 'method' ? `<div class="bk-pv-text">${pEsc(x.description || '')}</div>` : ''}
      ${bankAgeChips(x, age)}<div class="bk-pv">${x.kind === 'method' ? '' : bankPreviewHtml(x, age)}</div>
      <div class="bk-rv-acts"><button type="button" class="btn" id="rv-ok">בדקתי ואישרתי</button><button type="button" class="btn ghost" id="rv-edit">עריכה</button><button type="button" class="btn ghost" id="rv-arch">לארכיון</button></div>
      <div class="bk-rv-nav"><button type="button" class="btn ghost small" id="rv-prev"${i ? '' : ' disabled'}>→ הקודם</button><button type="button" class="btn ghost small" data-close>סגירה</button><button type="button" class="btn ghost small" id="rv-next"${i < l.length - 1 ? '' : ' disabled'}>הבא ←</button></div>`;
    box.querySelector('[data-close]').addEventListener('click', () => sh.close());
    box.querySelectorAll('[data-bk-age]').forEach(b => b.addEventListener('click', () => { age = b.dataset.bkAge; draw(); }));
    box.querySelector('#rv-prev').addEventListener('click', () => { i--; draw(); });
    box.querySelector('#rv-next').addEventListener('click', () => { i++; draw(); });
    box.querySelector('#rv-ok').addEventListener('click', async () => {
      const r = await sbPersonal.rpc('library_approve', { p_item:x.id });
      if(r.error){ toast('האישור נכשל'); return; }
      x.draft = false; l = bankDrafts(); if(i >= l.length) i = l.length - 1; toast('אושר'); draw();
    });
    box.querySelector('#rv-arch').addEventListener('click', async () => {
      if(!(await confirmSheet({ title:'להעביר לארכיון?', text:'הנוסח לא יוצע יותר בבנק. בתוכניות שכבר משתמשות בו הוא נשאר כמו שהוא. אפשר להחזיר אותו מהספרייה.', okLabel:'כן, לארכיון', cancelLabel:'חזרה' }))) return;
      const r = await sbPersonal.from('mercury_library').update({ active:false }).eq('id', x.id);
      if(r.error){ toast('לא הצלחנו'); return; }
      x.active = false; l = bankDrafts(); if(i >= l.length) i = l.length - 1; draw();
    });
    box.querySelector('#rv-edit').addEventListener('click', () => bankEdit(x, () => { l = bankDrafts(); draw(); }));
  };
  draw();
  return sh;
}

// ---- editing a template: the admin edits it in place; a therapist who edits a Mercury one gets a copy in the center's library (decision 109)
function bankEdit(x, after){
  const c = JSON.parse(JSON.stringify(x.content || {})), isGoal = x.kind === 'goal', aged = bankHasAges(x) || isGoal || BANK_PART_KINDS.includes(x.kind);
  if(aged && !c.ages) c.ages = { '5-8':isGoal ? {} : (x.description || '') };
  let age = c.ages ? (c.ages['5-8'] ? '5-8' : Object.keys(c.ages)[0]) : '';
  const copy = x.scope === 'mercury' && !bankIsAdmin();
  const chk = (name, list, on) => `<div class="bk-checks">${list.map(t => `<label><input type="checkbox" name="${name}" value="${pEsc(t)}"${on.includes(t) ? ' checked' : ''}> ${pEsc(t)}</label>`).join('')}</div>`;
  const W = () => (c.ages[age] = c.ages[age] || (isGoal ? {} : ''));
  const ageFields = () => { const w = W();
    if(!isGoal) return `<label class="pfield">הנוסח (${pEsc((BANK_AGES.find(a => a[0] === age) || [])[1] || age)})<textarea id="be-text" rows="5">${pEsc(typeof w === 'string' ? w : '')}</textarea></label>`;
    const t = (k, l, rows) => `<label class="pfield">${l}<textarea id="be-${k}" rows="${rows || 2}">${pEsc(Array.isArray(w[k]) ? w[k].join('\n') : (w[k] || ''))}</textarea></label>`;
    return t('targets', 'יעד לפי תדירות') + t('steps', 'מה הצוות עושה: צעד בכל שורה ("כש... ← ...")', 4) + t('principles', 'העיקרון') + t('sentences', 'משפטים לומר לילד/ה: משפט בכל שורה', 3)
      + t('seen', 'מה רואים אצל הילד/ה') + t('needs', 'מה הוא/היא אולי צריך/ה') + t('why', 'למה זה חשוב (מקצועי)') + t('why_staff', 'למה זה חשוב (לצוות, בשפה פשוטה)') + t('method', 'שורת שיטה');
  };
  const readAge = () => { if(!c.ages) return; const q = s => (sh.querySelector(s) || {}).value;
    if(!isGoal){ c.ages[age] = (q('#be-text') || '').trim(); return; }
    const lines = v => String(v || '').split('\n').map(s => s.trim()).filter(Boolean);
    c.ages[age] = { targets:(q('#be-targets') || '').trim(), steps:lines(q('#be-steps')), principles:(q('#be-principles') || '').trim(), sentences:lines(q('#be-sentences')),
      seen:(q('#be-seen') || '').trim(), needs:(q('#be-needs') || '').trim(), why:(q('#be-why') || '').trim(), why_staff:(q('#be-why_staff') || '').trim(), method:(q('#be-method') || '').trim() };
  };
  const sh = portalSheet(`<h2>עריכה: ${pEsc(x.title)}</h2>${copy ? '<div class="pnote">זה נוסח של מרקורי: השינויים יישמרו כעותק בספריית המרכז, והמקור לא משתנה. מנהל המערכת רואה את העותק ויכול לאמץ אותו.</div>' : ''}
    <label class="pfield">שם<input type="text" id="be-title" maxlength="80" value="${pEsc(x.title)}"></label>
    ${x.kind === 'method' || !aged ? `<label class="pfield">${x.kind === 'method' ? 'ההסבר' : 'הנוסח'}<textarea id="be-desc" rows="5">${pEsc(x.description || '')}</textarea></label>` : `<label class="pfield">שורה קצרה<input type="text" id="be-desc" maxlength="200" value="${pEsc(x.description || '')}"></label>`}
    ${x.kind !== 'method' ? `<div class="pfield"><span>תמות</span>${chk('be-th', BANK_THEMES, bankThemesOf(x))}</div>` : ''}
    ${isGoal || x.kind === 'plan' ? `<div class="pfield"><span>שיטות טיפול</span>${chk('be-me', bankMethods(), x.methods || [])}</div>` : ''}
    ${isGoal ? `<div class="th-ed-grid"><label class="pfield">בדיקה מחדש<select id="be-review"><option value="1"${c.review === 1 ? ' selected' : ''}>בעוד חודש</option><option value="3"${c.review !== 1 ? ' selected' : ''}>בעוד 3 חודשים</option></select></label>
      <label class="pfield">חוזקות (בפסיקים)<input type="text" id="be-str" value="${pEsc((c.strengths || []).join(', '))}"></label></div>
      <label class="pfield">מיומנויות למעקב (בפסיקים)<input type="text" id="be-skills" value="${pEsc((c.skills || []).join(', '))}"></label>
      <label class="pfield">ממה להימנע (שורה אחת)<input type="text" id="be-avoid" value="${pEsc(c.avoid || '')}"></label>
      <div class="pfield"><span>סולם 1–5</span>${[0, 1, 2, 3, 4].map(k => `<input type="text" class="be-scale" aria-label="${k + 1}" placeholder="${k + 1} =" value="${pEsc((c.scale || [])[k] || '')}">`).join('')}</div>` : ''}
    ${x.kind === 'plan' ? `<label class="pfield">תקציר (שלד, עם [מקומות להשלמה])<textarea id="be-sum" rows="3">${pEsc(c.summary || '')}</textarea></label><label class="pfield">שמות המטרות (מטרה בכל שורה)<textarea id="be-goals" rows="3">${pEsc((c.goal_titles || []).join('\n'))}</textarea></label>` : ''}
    ${aged && x.kind !== 'plan' ? `<div class="bk-ages" id="be-ages">${BANK_AGES.map(([k, w]) => `<button type="button" class="bk-age${k === age ? ' on' : ''}" data-be-age="${k}">${w}</button>`).join('')}</div><div id="be-age-f">${ageFields()}</div>` : ''}
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="be-save">${copy ? 'שמירה כעותק במרכז' : 'שמירה'}</button></div>`);
  sh.classList.add('bk-sheet');
  sh.querySelectorAll('[data-be-age]').forEach(b => b.addEventListener('click', () => { readAge(); age = b.dataset.beAge; sh.querySelectorAll('[data-be-age]').forEach(y => y.classList.toggle('on', y === b)); sh.querySelector('#be-age-f').innerHTML = ageFields(); }));
  sh.querySelector('#be-save').addEventListener('click', async () => {
    readAge();
    const title = sh.querySelector('#be-title').value.trim(); if(!title){ toast('צריך שם'); return; }
    const picked = n => [...sh.querySelectorAll(`input[name="${n}"]:checked`)].map(i => i.value), list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
    const row = { title, description:sh.querySelector('#be-desc').value.trim() || null };
    if(x.kind !== 'method'){ row.themes = picked('be-th'); row.category = row.themes[0] || x.category || null; }
    if(isGoal || x.kind === 'plan') row.methods = picked('be-me');
    if(isGoal){ c.review = +sh.querySelector('#be-review').value; c.strengths = list(sh.querySelector('#be-str').value).map(cleanStrength).filter(Boolean); c.skills = list(sh.querySelector('#be-skills').value);
      c.avoid = sh.querySelector('#be-avoid').value.trim(); c.scale = [...sh.querySelectorAll('.be-scale')].map(i => i.value.trim()); if(!c.scale.some(Boolean)) delete c.scale; }
    if(x.kind === 'plan'){ c.summary = sh.querySelector('#be-sum').value.trim(); c.goal_titles = sh.querySelector('#be-goals').value.split('\n').map(s => s.trim()).filter(Boolean); }
    if(aged || (x.kind === 'plan' && c.goal_titles.length)){ c.bank = 1; row.content = c; } else if(x.kind === 'plan'){ delete c.goal_titles; row.content = c; }
    let r;
    if(copy) r = await sbPersonal.from('mercury_library').insert(Object.assign({ kind:x.kind, scope:'center', source_id:x.id, draft:false }, row));
    else r = await sbPersonal.from('mercury_library').update(row).eq('id', x.id);
    if(r.error){ toast(/duplicate|unique/i.test(r.error.message || '') ? 'כבר יש נוסח בשם הזה' : /themes|source_id|draft/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v42.sql' : 'השמירה נכשלה'); return; }
    sh.close(); toast(copy ? 'נשמר עותק בספריית המרכז' : 'נשמר'); await thpLoad(); if(after) after();
  });
  return sh;
}

// ---- a good goal of a plan -> the center's bank (without the child's details: decision 115)
function bankSaveGoal(g, age){
  const sh = portalSheet(`<h2>שמירת המטרה לבנק</h2><div class="pnote">המטרה נשמרת בבנק של המרכז כנוסח ל${pEsc((BANK_AGES.find(a => a[0] === age) || [, 'כל הגילאים'])[1])}, בלי פרטי הילד/ה. עדיף לעבור על הנוסח ולהוריד שמות ופרטים אישיים לפני השמירה.</div>
    <label class="pfield">שם המטרה<input type="text" id="sg-title" maxlength="80" value="${pEsc(g.title || '')}"></label>
    <label class="pfield">גיל<select id="sg-age">${BANK_AGES.map(([k, w]) => `<option value="${k}"${k === (age || '5-8') ? ' selected' : ''}>${w}</option>`).join('')}</select></label>
    <div class="pfield"><span>תמות</span><div class="bk-checks">${BANK_THEMES.map(t => `<label><input type="checkbox" name="sg-th" value="${pEsc(t)}"${(g.themes || []).includes(t) ? ' checked' : ''}> ${pEsc(t)}</label>`).join('')}</div></div>
    <div class="confirm-actions"><button type="button" class="btn ghost" data-close>ביטול</button><button type="button" class="btn" id="sg-go">שמירה לבנק</button></div>`);
  sh.querySelector('#sg-go').addEventListener('click', async () => {
    const title = sh.querySelector('#sg-title').value.trim(); if(!title){ toast('צריך שם'); return; }
    const themes = [...sh.querySelectorAll('input[name="sg-th"]:checked')].map(i => i.value), a = sh.querySelector('#sg-age').value, lines = v => String(v || '').split('\n').map(s => s.replace(/^•\s*/, '').trim()).filter(Boolean);
    const steps = lines(g.interventions).filter(s => !/^העיקרון:/.test(s)), pr = lines(g.interventions).find(s => /^העיקרון:/.test(s));
    const content = { bank:1, review:g.review_months || 3, strengths:g.strengths || [], skills:g.skills || [], scale:g.scale && g.scale.anchors ? g.scale.anchors : undefined,
      ages:{ [a]:{ targets:g.targets || '', steps, principles:pr ? pr.replace(/^העיקרון:\s*/, '') : '', sentences:lines(g.sentences), seen:g.seen || '', needs:g.needs || '', why:g.why || '', why_staff:g.why_staff || '', method:(g.bank && g.bank.method) || '' } } };
    const r = await sbPersonal.from('mercury_library').insert({ kind:'goal', scope:'center', title, themes, category:themes[0] || null, methods:g.methods || [], content, description:null });
    if(r.error){ toast(/duplicate|unique/i.test(r.error.message || '') ? 'כבר יש בבנק מטרה בשם הזה' : /themes/.test(r.error.message || '') ? 'צריך קודם להריץ את scheduling-v42.sql' : 'השמירה נכשלה'); return; }
    sh.close(); toast('המטרה נשמרה בבנק של המרכז'); await thpLoad();
  });
}

// ---- the library tab, on top: the note, the method cards, the admin's drafts and the center's options
function bankLibraryTopHtml(){
  const ms = (thp.library || []).filter(x => x.kind === 'method' && x.active), drafts = bankDrafts().length;
  return `${bankNote()}
    ${bankIsAdmin() ? `<div class="bk-admin"><button type="button" class="btn${drafts ? '' : ' ghost'}" id="bk-review">🔎 בדיקת טיוטות${drafts ? ` (${drafts})` : ''}</button>
      <label class="th-important"><input type="checkbox" id="bk-devage"${thp.mopts && thp.mopts.dev_age ? ' checked' : ''}> גיל התפתחותי: שדה בתוכנית (למטפלים בלבד), והבנק מסנן לפיו</label>
      <label class="th-important">תכנית ראשונה תוך <input type="number" id="bk-firstdays" min="3" max="60" value="${+((thp.mopts || {}).first_plan_days) || 14}" style="width:4.5em"> ימים מההגעה</label></div>` : ''}
    <button type="button" class="btn ghost" id="bk-open" style="width:100%">📚 בנק המטרות</button>
    ${ms.length ? `<details class="pfold"><summary><span>שיטות הטיפול</span><span class="pcount">${ms.length}</span></summary><div class="pfold-body">${ms.map(m => `<details class="bk-mcard"><summary><b>${pEsc(m.title)}</b>${m.scope === 'center' ? '<span class="bk-center">המרכז</span>' : ''}${bankDraftTag(m)}</summary><div>${pEsc(m.description || '')}</div></details>`).join('')}</div></details>` : ''}`;
}
function bankWireLibrary(body){
  const rv = body.querySelector('#bk-review'); if(rv) rv.addEventListener('click', () => { const s = bankReview(0); const close = s.close; s.close = () => { close(); thpRender(); }; });
  const op = body.querySelector('#bk-open'); if(op) op.addEventListener('click', () => bankPick('goal', { onPick:x => bankEdit(x, () => thpRender()) }));
  const dv = body.querySelector('#bk-devage'); if(dv) dv.addEventListener('change', async () => {
    const value = Object.assign({}, thp.mopts || {}, { dev_age:dv.checked });
    const r = await sbPersonal.from('sched_settings').upsert({ key:'mercury_options', value });
    if(r.error){ dv.checked = !dv.checked; toast('לא נשמר'); return; }
    thp.mopts = value; toast(dv.checked ? 'גיל התפתחותי הופעל' : 'גיל התפתחותי כובה');
  });
  const fd = body.querySelector('#bk-firstdays'); if(fd) fd.addEventListener('change', async () => {
    const n = Math.max(3, Math.min(60, +fd.value || 14)), value = Object.assign({}, thp.mopts || {}, { first_plan_days:n });
    const r = await sbPersonal.from('sched_settings').upsert({ key:'mercury_options', value });
    if(r.error){ toast('לא נשמר'); return; } thp.mopts = value; fd.value = n; toast(`תכנית ראשונה תוך ${n} ימים`);
  });
  body.querySelectorAll('[data-lib-edit]').forEach(b => b.addEventListener('click', () => { const x = (thp.library || []).find(y => y.id === b.dataset.libEdit); if(x) bankEdit(x, () => thpRender()); }));
}

// ---- the admin's overview: the bank (decisions 108, 112, 116)
function bankOverviewHtml(){
  if(!thp.v42) return '';
  const n = thp.useN || {}, lib = (thp.library || []).filter(x => x.active), top = lib.filter(x => n[x.id]).sort((a, b) => n[b.id] - n[a.id]).slice(0, 6), byM = {};
  lib.filter(x => x.kind === 'goal' && n[x.id]).forEach(x => (x.methods || []).forEach(m => { byM[m] = (byM[m] || 0) + n[x.id]; }));
  const drafts = bankDrafts().length, copies = lib.filter(x => x.source_id).length;
  return `<h3 class="psec">בנק המטרות</h3><div class="pv-stats"><div class="pv-stat"><b>${drafts}</b><span>נוסחים שמחכים לבדיקה שלך</span></div><div class="pv-stat"><b>${lib.filter(x => x.kind === 'goal').length}</b><span>מטרות בבנק</span></div><div class="pv-stat"><b>${copies}</b><span>עותקים שמטפלים שינו</span></div></div>
    ${drafts ? '<button type="button" class="btn" id="bk-review" style="width:100%">🔎 לבדיקת הטיוטות</button>' : ''}
    ${top.length ? `<div class="pnote"><b>הכי משומשים:</b> ${top.map(x => `${pEsc(x.title)} (${n[x.id]})`).join(' · ')}</div>` : ''}
    ${Object.keys(byM).length ? `<div class="pnote"><b>השיטות במרכז:</b> ${Object.entries(byM).sort((a, b) => b[1] - a[1]).map(([m, k]) => `${pEsc(m)} ${k}`).join(' · ')}</div>` : ''}`;
}
