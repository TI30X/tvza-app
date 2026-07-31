/* TVZA — Excel-Import für den Trainingsbereich

   Liest eine .xlsx-Datei im Browser ein und liefert das Zell-Raster, das
   assets/js/training-parser.js erwartet. SheetJS wird erst beim tatsächlichen
   Import nachgeladen (dynamischer Import), damit die Seite ohne Netzverbindung
   und ohne zusätzliche Ladezeit startet — die Datenbank läuft auf dem
   Spark-Tarif, serverseitig verarbeiten können wir also nichts.
*/

const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

let sheetjs = null;

export async function loadSheetJs() {
  if (!sheetjs) sheetjs = await import(/* @vite-ignore */ SHEETJS_URL);
  return sheetjs;
}

function cellValue(cell) {
  if (!cell) return '';
  const v = cell.v;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(v.getDate())}.${pad(v.getMonth() + 1)}.${v.getFullYear()}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 1000) / 1000;
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Ein Blatt in { name, rows, links } umwandeln. */
export function sheetToGrid(XLSX, worksheet, name) {
  const ref = worksheet?.['!ref'];
  if (!ref) return { name, rows: [], links: {} };
  const range = XLSX.utils.decode_range(ref);
  const lastRow = range.e.r;
  const lastCol = range.e.c;

  const rows = [];
  const links = {};
  for (let r = 0; r <= lastRow; r++) {
    const row = [];
    for (let c = 0; c <= lastCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[addr];
      row.push(cellValue(cell));
      const target = cell?.l?.Target;
      if (target) links[`${r}_${c}`] = String(target);
    }
    while (row.length && row[row.length - 1] === '') row.pop();
    rows.push(row);
  }

  /* Verbundene Zellen: der Wert links oben gilt für den ganzen Bereich.
     Der Parser arbeitet danach ohne Sonderfälle. */
  (worksheet['!merges'] || []).forEach(m => {
    const value = rows[m.s.r]?.[m.s.c] ?? '';
    if (value === '') return;
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!rows[r]) rows[r] = [];
      for (let c = m.s.c; c <= m.e.c; c++) {
        while (rows[r].length <= c) rows[r].push('');
        rows[r][c] = value;
      }
    }
  });

  while (rows.length && !rows[rows.length - 1].some(v => v !== '')) rows.pop();
  return { name, rows, links };
}

/**
 * @param {File|Blob} file
 * @returns {Promise<{file:string, sheets:Array}>}
 */
export async function gridFromFile(file) {
  const XLSX = await loadSheetJs();
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellFormula: false, cellHTML: false });
  const sheets = wb.SheetNames.map(name => sheetToGrid(XLSX, wb.Sheets[name], name));
  return { file: file.name || 'Import.xlsx', sheets };
}
