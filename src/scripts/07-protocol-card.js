// ---------- MANAGEMENT: protocol accordion ----------
function renderProtocolCard(color){
  const p = PROGRAM[color];
  let stepsHtml = '';
  if(p.steps.length){
    stepsHtml = '<div class="field-label">דרכי פעולה</div><ol>' +
      p.steps.map(s => `<li><b>${s[0]}</b> — ${s[1]}</li>`).join('') + '</ol>';
  }
  return `
    <div class="protocol prot-${color}">
      <div class="light-title">${p.label}</div>
      <div class="field-label">הגדרה</div>
      <div class="field-value">${p.title}</div>
      <div class="field-label">דוגמה</div>
      <div class="field-value">${p.examples}</div>
      <div class="field-label">מסר</div>
      <div class="field-value">${p.message}</div>
      <div class="field-label">תגובה</div>
      <div class="field-value">${p.response}</div>
      ${stepsHtml}
    </div>`;
}

// note: the management screen's protocol light-switcher and gold-protocol cards were removed
// (2026-10-02, client request) — renderProtocolCard() itself is still used elsewhere (yellow/green
// slides, kids-quick, etc.), only the management-screen-specific wiring here was removed.


// the full wording of the yellow protocol, folded away: the screens that need it for a decision show the action first
function yellowReminderHtml(){
  return `<details class="proto-reminder"><summary>תזכורת: נוסח הפרוטוקול הצהוב</summary>${renderProtocolCard('yellow')}</details>`;
}
