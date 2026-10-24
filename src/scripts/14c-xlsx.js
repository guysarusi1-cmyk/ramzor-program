
// ---------- EXPORT: Excel file (a real .xlsx, built here with no library) and print / PDF ----------
// The schedule is written as the monthly calendar of the paper schedule (see buildScheduleXlsx).
const XLSX_COLORS = { yes:'FF2E7D32', neutral:'FFB26A00', avoid:'FF1565C0', no:'FFC62828' };          // (as in the coordinator's schedule: can = blue, not marked = orange)

const CRC_TABLE = (() => { const t = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes){ let c = 0xFFFFFFFF; for(let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// a zip file with the files stored as they are (no compression — .xlsx accepts that)
function zipStore(files){
  const enc = new TextEncoder(), chunks = [], central = [];
  let offset = 0;
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const dosTime = 0x6000, dosDate = 0x5A21;
  files.forEach(f => {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const head = new Uint8Array([0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(head, name, data);
    central.push(new Uint8Array([0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += head.length + name.length + data.length;
  });
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  const all = [...chunks, ...central, end], out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let pos = 0; all.forEach(c => { out.set(c, pos); pos += c.length; });
  return out;
}

function xmlEsc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function xlsxColName(i){ return String.fromCharCode(65 + i); }
// cell = { text } or { runs:[{ text, color, bold }] }, with s = style (1 header, 2 body, 3 day label)
function xlsxCell(ref, cell){
  const s = cell.s || 0;
  if(cell.runs){
    const runs = cell.runs.map(r => `<r><rPr><rFont val="Calibri"/>${r.bold ? '<b/>' : ''}<color rgb="${r.color || 'FF1F2937'}"/><sz val="11"/></rPr><t xml:space="preserve">${xmlEsc(r.text)}</t></r>`).join('');
    return `<c r="${ref}" s="${s}" t="inlineStr"><is>${runs}</is></c>`;
  }
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell.text == null ? '' : cell.text)}</t></is></c>`;
}
// rows: array of arrays of cells; widths: column widths
function buildXlsx(sheetName, rows, widths, opts){
  opts = opts || {};
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ht = opts.heights || [];
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}"${ht[ri] ? ` ht="${ht[ri]}" customHeight="1"` : ''}>${r.map((c, ci) => xlsxCell(xlsxColName(ci) + (ri + 1), c)).join('')}</row>`).join('');
  const cols = (widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const sheet = head + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? '<cols>' + cols + '</cols>' : ''}<sheetData>${sheetRows}</sheetData>${(opts.merges || []).length ? `<mergeCells count="${opts.merges.length}">${opts.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}</worksheet>`;
  const styles = head + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8E2D0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F1EA"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top" wrapText="1" readingOrder="2"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top" wrapText="1" readingOrder="2"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs></styleSheet>';
  return zipStore([
    { name:'[Content_Types].xml', data:head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name:'_rels/.rels', data:head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name:'xl/workbook.xml', data:head + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName.slice(0, 30))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name:'xl/_rels/workbook.xml.rels', data:head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name:'xl/styles.xml', data:styles },
    { name:'xl/worksheets/sheet1.xml', data:sheet }
  ]);
}

// the schedule as a table: one row per day, one column per shift
function scheduleTable(ctx, assignments){
  const byId = {}; ctx.instructors.forEach(p => { byId[p.id] = p; });
  const slots = buildSlots(ctx.month, ctx.shiftTypes), slotMap = {}; slots.forEach(s => { slotMap[s.key] = s; });
  const rows = daysOfMonth(ctx.month).map(date => ({
    date,
    cells: ctx.shiftTypes.map(st => {
      const slot = slotMap[slotKey(date, st.id)];
      if(!slot) return { slot:null, people:[], missing:0 };
      const list = (assignments[slot.key] || []).filter(pid => byId[pid]), annot = (portalMonth(ctx.month) || {}).annot || {};
      return { slot, people:list.map(pid => ({ iid:pid, name:instrName(byId[pid], ctx.instructors), level:levelOf(ctx.prefs, pid, slot), note:annot[`${slot.key}|${pid}`] || '' })), missing:Math.max(0, slot.need - list.length) };          // (note: other hours than the shift's, a short morning, the long weekend)
    })
  }));
  return rows;
}
// the service girls and the teachers of each day, with their hours (they are not in the shifts' cells; the portal on the server only)
function scheduleOthersOf(ctx){
  if(typeof portalServerOn === 'undefined' || !portalServerOn || !portalState || !portalState.rows) return null;
  const st = portalLoad(), out = {}; let any = false;
  st.rows.forEach(r => {
    if(monthKeyOf(r.day) !== ctx.month) return;
    const p = st.instructors.find(x => x.id === r.staff); if(!p || !['service', 'teacher'].includes(p.role)) return;
    any = true; const d = out[r.day] = out[r.day] || { service:[], teacher:[] };
    d[p.role].push({ name:instrName(p, st.instructors), hours:r.from && r.to ? `${r.from}–${r.to}` : '' });
  });
  Object.values(out).forEach(d => ['service', 'teacher'].forEach(k => d[k].sort((a, b) => a.hours.localeCompare(b.hours) || a.name.localeCompare(b.name))));
  return any ? out : null;
}
// The export looks like the paper schedule the staff knows (Guy, 2026-10-24): a monthly calendar, the days of the week across (Sunday on the
// right), a row per week; in every day the morning, the noon and the night, one line each. In a line the ahmash comes first, marked (אחמ"ש);
// in the morning a teacher / kindergarten teacher comes first, marked; the service girls come last, marked; hours that are not the shift's
// usual ones are in brackets ("עד 10", "מ-10"). The same in the Excel file and in the print / PDF.
const CAL_ROLE = { teacher:'מורה/גננת', service:'בת שירות' };
function calHours(note, s){
  const m = String(note || '').match(/^(\d{1,2})[–-](\d{1,2})$/); if(!m) return note || '';
  const a = +m[1], b = +m[2], st = parseInt(s.start, 10), en = parseInt(s.end, 10);
  return a === st && b !== en ? `עד ${b}` : b === en && a !== st ? `מ-${a}` : `${a}–${b}`;
}
function scheduleCalendarDays(ctx, assignments){
  const table = scheduleTable(ctx, assignments), others = typeof othersByShift === 'function' ? othersByShift(ctx) : {};
  const rank = (typeof srv !== 'undefined' && srv.ahmash) || {}, picks = typeof ahmashPicks === 'function' ? ahmashPicks(table, ctx, rank) : {};
  return table.map(r => ({ date:r.date, lines:ctx.shiftTypes.map((s, i) => {
    const c = r.cells[i], oth = others[`${r.date}|${s.id}`] || [], items = [];
    const nm = (name, tag, note) => { const extra = [tag, note].filter(Boolean).join(', '); return extra ? `${name} (${extra})` : name; };
    oth.filter(x => x.role === 'teacher').forEach(x => items.push({ text:nm(x.name, CAL_ROLE.teacher, calHours(x.note, s)) }));
    if(c.slot){
      const lead = c.people.filter(p => picks[c.slot.key] === p.iid), rest = c.people.filter(p => !lead.includes(p));
      lead.forEach(p => items.push({ text:nm(p.name, 'אחמ"ש', calHours(p.note, s)), ahm:true }));
      rest.forEach(p => items.push({ text:nm(p.name, '', calHours(p.note, s)) }));
    }
    oth.filter(x => x.role === 'service').forEach(x => items.push({ text:nm(x.name, CAL_ROLE.service, calHours(x.note, s)) }));
    return { label:s.label, items, missing:c.slot ? c.missing : 0 };
  }).filter(l => l.items.length || l.missing) }));
}
function buildScheduleXlsx(ctx, assignments){
  const days = scheduleCalendarDays(ctx, assignments), lead = dowOf(days[0].date);
  const flat = Array(lead).fill(null).concat(days); while(flat.length % 7) flat.push(null);
  const rows = [[{ text:`סידור עבודה · ${monthLabel(ctx.month)}`, s:6 }, ...Array(6).fill({ text:'' })], DOW_NAMES.map(d => ({ text:'יום ' + d, s:1 }))], heights = [24, 20];
  for(let w = 0; w < flat.length; w += 7){
    let most = 1;
    rows.push(flat.slice(w, w + 7).map(d => {
      if(!d) return { text:'', s:4 };
      const runs = [{ text:String(parseIso(d.date).getDate()), bold:true }];
      d.lines.forEach(l => {
        runs.push({ text:'\n' }, { text:`${l.label} - `, bold:true });
        l.items.forEach((it, k) => runs.push({ text:(k ? ', ' : '') + it.text, bold:!!it.ahm }));
        if(l.missing) runs.push({ text:`${l.items.length ? ' · ' : ''}חסר ${l.missing}`, color:XLSX_COLORS.no, bold:true });
      });
      most = Math.max(most, 1 + d.lines.reduce((a, l) => a + Math.ceil((l.label.length + l.items.reduce((x, it) => x + it.text.length + 2, 0)) / 34), 0));
      return { runs, s:[5, 6].includes(dowOf(d.date)) ? 5 : 4 };
    }));
    heights.push(Math.max(60, most * 15 + 6));
  }
  rows.push([{ text:'הערות', s:3 }, ...Array(6).fill({ text:'', s:4 })]); heights.push(40);
  return buildXlsx('סידור ' + monthLabel(ctx.month), rows, Array(7).fill(30), { heights, merges:['A1:G1', `B${rows.length}:G${rows.length}`] });
}
function downloadBytes(bytes, filename, mime){
  const url = URL.createObjectURL(new Blob([bytes], { type:mime }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
}
function downloadScheduleXlsx(ctx, assignments){
  downloadBytes(buildScheduleXlsx(ctx, assignments), `סידור-עבודה-${ctx.month}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// print / "save as PDF": only the schedule table is printed
function scheduleHtmlTable(ctx, assignments){
  const days = scheduleCalendarDays(ctx, assignments), lead = dowOf(days[0].date);
  const flat = Array(lead).fill(null).concat(days); while(flat.length % 7) flat.push(null);
  const cell = d => !d ? '<td class="pc-empty"></td>' : `<td class="${[5, 6].includes(dowOf(d.date)) ? 'pc-weekend' : ''}"><div class="pc-num">${parseIso(d.date).getDate()}</div>${d.lines.map(l =>
    `<div class="pc-line"><b>${escapeHtml(l.label)} -</b> ${l.items.map(it => it.ahm ? `<b>${escapeHtml(it.text)}</b>` : escapeHtml(it.text)).join(', ')}${l.missing ? ` <b class="lv-no">חסר ${l.missing}</b>` : ''}</div>`).join('')}</td>`;
  let body = ''; for(let w = 0; w < flat.length; w += 7) body += `<tr>${flat.slice(w, w + 7).map(cell).join('')}</tr>`;
  return `<table class="print-table print-cal"><caption>סידור עבודה — ${monthLabel(ctx.month)}</caption><tr>${DOW_NAMES.map(d => `<th>יום ${d}</th>`).join('')}</tr>${body}<tr><th>הערות</th><td colspan="6"></td></tr></table>`;
}
function printSchedule(ctx, assignments){
  const box = document.createElement('div');
  box.id = 'print-sheet'; box.innerHTML = scheduleHtmlTable(ctx, assignments);
  document.body.appendChild(box); document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); box.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch(e){} setTimeout(() => { if(document.getElementById('print-sheet')) done(); }, 1000); }, 50);
}
