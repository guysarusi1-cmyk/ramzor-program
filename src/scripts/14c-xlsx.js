
// ---------- EXPORT: Excel file (a real .xlsx, built here with no library) and print / PDF ----------
// The schedule is written with rows = days and columns = shifts; every name is coloured by how well the wish was kept
// (green = got what they wanted, orange = would rather not, red = "ממש לא" or a missing person, dark = no preference).
const XLSX_COLORS = { yes:'FF2E7D32', neutral:'FF1F2937', avoid:'FFB26A00', no:'FFC62828' };

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
function buildXlsx(sheetName, rows, widths){
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => xlsxCell(xlsxColName(ci) + (ri + 1), c)).join('')}</row>`).join('');
  const cols = (widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const sheet = head + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? '<cols>' + cols + '</cols>' : ''}<sheetData>${sheetRows}</sheetData></worksheet>`;
  const styles = head + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8E2D0"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs></styleSheet>';
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
      const list = (assignments[slot.key] || []).filter(pid => byId[pid]);
      return { slot, people:list.map(pid => ({ iid:pid, name:instrName(byId[pid], ctx.instructors), level:levelOf(ctx.prefs, pid, slot) })), missing:Math.max(0, slot.need - list.length) };
    })
  }));
  return rows;
}
function buildScheduleXlsx(ctx, assignments){
  const table = scheduleTable(ctx, assignments);
  const rows = [[{ text:'תאריך', s:1 }, ...ctx.shiftTypes.map(st => ({ text:`${st.label} (${st.start}–${st.end})`, s:1 }))]];
  table.forEach(r => rows.push([{ text:dayLabel(r.date), s:3 }, ...r.cells.map(c => {
    const runs = [];
    c.people.forEach((p, i) => { if(i) runs.push({ text:'\n' }); runs.push({ text:p.name, color:XLSX_COLORS[p.level], bold:true }); });
    if(c.missing){ if(runs.length) runs.push({ text:'\n' }); runs.push({ text:`חסר/ים ${c.missing}`, color:XLSX_COLORS.no, bold:true }); }
    return runs.length ? { runs, s:2 } : { text:'', s:2 };
  })]));
  rows.push([{ text:'מקרא', s:3 }, { runs:[{ text:'ירוק = קיבל/ה מה שרצה  ', color:XLSX_COLORS.yes, bold:true }, { text:'כתום = העדיף/ה שלא  ', color:XLSX_COLORS.avoid, bold:true }, { text:'אדום = ממש לא / חסר  ', color:XLSX_COLORS.no, bold:true }, { text:'כהה = בלי העדפה', color:XLSX_COLORS.neutral, bold:true }], s:0 }]);
  return buildXlsx('סידור ' + monthLabel(ctx.month), rows, [16, ...ctx.shiftTypes.map(() => 26)]);
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
  const rows = scheduleTable(ctx, assignments);
  const head = `<tr><th>תאריך</th>${ctx.shiftTypes.map(st => `<th>${escapeHtml(st.label)}<br><span>${st.start}–${st.end}</span></th>`).join('')}</tr>`;
  const body = rows.map(r => `<tr><th>${dayLabel(r.date)}</th>${r.cells.map(c => `<td>${c.people.map(p => `<b class="lv-${p.level}">${escapeHtml(p.name)}</b>`).join('<br>')}${c.missing ? `<br><b class="lv-no">חסר/ים ${c.missing}</b>` : ''}</td>`).join('')}</tr>`).join('');
  return `<table class="print-table"><caption>סידור עבודה — ${monthLabel(ctx.month)}</caption>${head}${body}</table>`;
}
function printSchedule(ctx, assignments){
  const box = document.createElement('div');
  box.id = 'print-sheet'; box.innerHTML = scheduleHtmlTable(ctx, assignments);
  document.body.appendChild(box); document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); box.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch(e){} setTimeout(() => { if(document.getElementById('print-sheet')) done(); }, 1000); }, 50);
}
