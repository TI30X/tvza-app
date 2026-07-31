/* TVZA — Trainingsprogramm-Parser

   Wandelt die wöchentliche Trainings-Excel des Verbands in ein strukturiertes
   Programm-Objekt um. Bewusst ohne DOM, ohne Firebase und ohne SheetJS: die
   Eingabe ist ein reines Zell-Raster, damit derselbe Code im Browser und in
   den Tests unter dev/ läuft. Das Einlesen der .xlsx-Datei erledigt
   assets/js/training-import.js.

   Eingabe (Raster):
     { file, sheets: [ { name, rows: [[cell, …], …], links: { "r_c": url } } ] }
     Verbundene Zellen sind bereits auf alle beteiligten Zellen kopiert.

   Ausgabe: siehe parseProgram() ganz unten.

   Grundregel: der Parser darf nichts wegwerfen. Was er nicht versteht, landet
   unverändert in unit.raw und kann von der Seite als Tabelle gezeigt werden.
*/

export const SCHEMA_VERSION = 1;

/* ── Kleinkram ────────────────────────────────────────────────────────── */

const DAY_NAMES = [
  'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
];
const DAY_KEYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];

export const txt = v => (v === null || v === undefined ? '' : String(v).trim());

/* Umlaute werden deutsch transliteriert, damit "Fußgymnastik" und
   "Fussgymnastik" denselben Schlüssel ergeben. */
export function norm(v) {
  return txt(v)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(v) {
  return norm(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const isUrl = v => /^https?:\/\//i.test(txt(v));
const isNumericOnly = v => txt(v) !== '' && /^\d+$/.test(txt(v));
const rowHasContent = row => Array.isArray(row) && row.some(c => txt(c) !== '');

/* Ein Raster ist zeilenweise unterschiedlich lang — cell() glättet das. */
const cell = (rows, r, c) => txt(rows?.[r]?.[c]);

function rowIndexOf(rows, predicate, from = 0) {
  for (let r = from; r < rows.length; r++) if (predicate(rows[r] || [], r)) return r;
  return -1;
}

const rowContains = (row, needle) => (row || []).some(c => norm(c) === norm(needle));
const colOfLabel = (row, label) => (row || []).findIndex(c => norm(c) === norm(label));

/* "TW 12", "TW12", "tw-12" → "TW12". Alles andere → ''. */
export function weekTag(v) {
  const m = norm(v).match(/^tw[\s-]*(\d{1,2})$/);
  return m ? `TW${Number(m[1])}` : '';
}

/* ── Rasterzugriff mit Links ──────────────────────────────────────────── */

function sheetView(sheet) {
  const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
  const links = sheet?.links || {};
  return {
    name: txt(sheet?.name),
    rows,
    at: (r, c) => cell(rows, r, c),
    linkAt: (r, c) => txt(links[`${r}_${c}`]),
    /* Der sichtbare Text ODER der hinterlegte Hyperlink — je nachdem, was
       eine URL ist. In der Vorlage kommt beides vor. */
    urlAt(r, c) {
      const link = this.linkAt(r, c);
      if (link) return link;
      const v = this.at(r, c);
      return isUrl(v) ? v : '';
    },
  };
}

/* ── Wochenplan ───────────────────────────────────────────────────────── */

function parseDateRange(raw) {
  /* "03.08. - 09.08.2026" */
  const m = txt(raw).match(/(\d{1,2})\.(\d{1,2})\.?\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.?(\d{4})?/);
  if (!m) return { raw: txt(raw), start: '', end: '' };
  const year = m[5] || String(new Date().getFullYear());
  const pad = n => String(n).padStart(2, '0');
  return {
    raw: txt(raw),
    start: `${year}-${pad(m[2])}-${pad(m[1])}`,
    end: `${year}-${pad(m[4])}-${pad(m[3])}`,
  };
}

function addDays(iso, n) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseWeekPlan(view) {
  const { rows } = view;

  const headerRow = rowIndexOf(rows, row => rowContains(row, 'Montag'));
  if (headerRow < 0) return null;

  /* Jeder Tag belegt mehrere verbundene Spalten. Wir merken uns die
     Spannweite, damit ein Eintrag dem richtigen Tag zufällt. */
  const spans = DAY_NAMES.map((name, i) => {
    const row = rows[headerRow] || [];
    let from = -1, to = -1;
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]) === norm(name)) { if (from < 0) from = c; to = c; }
    }
    return { key: DAY_KEYS[i], name, from, to };
  }).filter(s => s.from >= 0);
  /* Bis zur nächsten Tagesspalte ausdehnen — Einträge stehen oft eine Spalte
     rechts vom Titel. */
  spans.forEach((s, i) => {
    const next = spans[i + 1];
    s.to = next ? Math.max(s.to, next.from - 1) : Math.max(s.to, s.to + 3);
  });

  const metaRow = rows[Math.max(0, headerRow - 1)] || [];
  const labelValue = label => {
    const c = colOfLabel(metaRow, label);
    if (c < 0) return '';
    for (let i = c + 1; i < metaRow.length; i++) {
      const v = txt(metaRow[i]);
      if (v && norm(v) !== norm(label)) return v;
    }
    return '';
  };

  const athlete = labelValue('Name:') || labelValue('Name');
  const weekLabel = labelValue('Woche/Datum') || txt(view.name).replace(/^Wochenplan\s*/i, '');
  const dateRange = parseDateRange(
    (metaRow.find(v => /\d{1,2}\.\d{1,2}\.?\s*[-–]/.test(txt(v))) || '')
  );

  const kwMatch = `${weekLabel} ${view.name}`.match(/KW\s*(\d{1,2})/i);
  const twMatch = `${weekLabel} ${view.name}`.match(/TW\s*(\d{1,2})/i);

  /* Vormittag / Nachmittag stehen in Spalte A über den ganzen Block. */
  const slotOf = r => {
    const v = norm(cell(rows, r, 0));
    if (v === 'vormittag') return { key: 'vormittag', name: 'Vormittag' };
    if (v === 'nachmittag') return { key: 'nachmittag', name: 'Nachmittag' };
    if (v === 'abend') return { key: 'abend', name: 'Abend' };
    return null;
  };

  const days = spans.map(s => ({ key: s.key, name: s.name, date: '', slots: [] }));
  const slotFor = (day, slot) => {
    let found = day.slots.find(x => x.key === slot.key);
    if (!found) { found = { key: slot.key, name: slot.name, items: [] }; day.slots.push(found); }
    return found;
  };

  let lastSlot = { key: 'vormittag', name: 'Vormittag' };
  for (let r = headerRow + 1; r < rows.length; r++) {
    const slot = slotOf(r);
    if (slot) lastSlot = slot;
    const row = rows[r] || [];
    spans.forEach((s, i) => {
      const seen = new Set();
      for (let c = s.from; c <= s.to && c < row.length; c++) {
        const v = txt(row[c]);
        if (!v || seen.has(v)) continue;
        seen.add(v);
        slotFor(days[i], lastSlot).items.push({ title: v, unit: '' });
      }
    });
  }

  if (dateRange.start) days.forEach((d, i) => { d.date = addDays(dateRange.start, i); });

  return {
    athlete,
    weekLabel,
    kw: kwMatch ? Number(kwMatch[1]) : null,
    trainingWeek: twMatch ? Number(twMatch[1]) : null,
    dateRange,
    days,
  };
}

/* ── Kraft / Rumpf: Sätze, Wiederholungen, Gewichte ───────────────────── */

const REPS_LABELS = ['widerholungen', 'wiederholungen'];
const META_LABELS = ['tut', 'datum', 'bemerkung', 'trainingswoche'];

const isRepsRow = row => (row || []).some(c => REPS_LABELS.includes(norm(c)));

function parseStrength(view, currentWeek) {
  const { rows } = view;
  const blocks = [];
  for (let r = 0; r < rows.length; r++) if (isRepsRow(rows[r])) blocks.push(r);
  if (!blocks.length) return null;

  const unitNote = (() => {
    const r = rowIndexOf(rows, row => /vorher immer aufwaermen/.test(norm((row || [])[0])));
    return r < 0 ? '' : cell(rows, r, 0);
  })();

  /* Blattweite Pause, z. B. "Pausen | 120-180 Sec". */
  const sheetPause = (() => {
    const r = rowIndexOf(rows, row => norm((row || [])[0]) === 'pausen', 0);
    return r < 0 ? '' : cell(rows, r, 1);
  })();

  const warmup = parseWarmup(view, blocks[0]);

  const exercises = blocks.map((repsRowIdx, blockIdx) => {
    const repsRow = rows[repsRowIdx] || [];
    const headRow = rows[repsRowIdx - 1] || [];

    /* Letzte Spalte des "Wiederholungen"-Labels (Zelle ist oft verbunden). */
    let labelCol = -1;
    repsRow.forEach((c, i) => { if (REPS_LABELS.includes(norm(c))) labelCol = i; });

    const metaCols = {};
    repsRow.forEach((c, i) => {
      const n = norm(c);
      if (META_LABELS.includes(n) && metaCols[n] === undefined) metaCols[n] = i;
    });
    const firstMetaCol = Object.values(metaCols).length
      ? Math.min(...Object.values(metaCols))
      : repsRow.length;

    const setCols = [];
    for (let c = labelCol + 1; c < firstMetaCol; c++) {
      if (txt(repsRow[c]) !== '') setCols.push(c);
    }

    /* Blockbereich: bis zur Kopfzeile des nächsten Blocks. */
    const nextReps = blocks[blockIdx + 1];
    const end = nextReps === undefined ? rows.length : Math.max(repsRowIdx + 1, nextReps - 1);

    const names = [];
    const logs = [];
    let pause = '';
    let valueUnit = '';

    for (let r = repsRowIdx + 1; r < end; r++) {
      const row = rows[r] || [];
      if (!rowHasContent(row)) continue;
      const label = norm(row[labelCol]);

      if (label === 'pause') { pause = txt(row[setCols[0]]) || txt(row[labelCol + 1]); continue; }

      const head = txt(row[0]);
      if (head && norm(head) !== 'pause') {
        names.push({ text: head, url: view.urlAt(r, 0) });
      }

      if (label) {
        if (!valueUnit) valueUnit = txt(row[labelCol]);
        const values = setCols.map(c => txt(row[c]));
        /* Die Trainingswoche steht je nach Blatt unter "Trainingswoche" oder
           (Tippfehler in der Vorlage) unter "Datum" — deshalb wird sie am
           Wert erkannt, nicht an der Spaltenüberschrift. */
        let week = '';
        for (let c = firstMetaCol; c < row.length; c++) {
          const tag = weekTag(row[c]);
          if (tag) { week = tag; break; }
        }
        logs.push({
          week,
          values,
          tut: metaCols.tut !== undefined ? txt(row[metaCols.tut]) : '',
          date: metaCols.datum !== undefined && !weekTag(row[metaCols.datum])
            ? txt(row[metaCols.datum]) : '',
          note: metaCols.bemerkung !== undefined ? txt(row[metaCols.bemerkung]) : '',
        });
      }
    }

    const named = names.filter(n => !isUrl(n.text));
    const video = names.find(n => n.url)?.url || '';
    const name = named[0]?.text || `Übung ${blockIdx + 1}`;
    const altName = named.slice(1)
      .map(n => n.text)
      .filter(t => norm(t) !== norm(name))
      .join(' / ');

    const plan = logs.find(l => l.week && l.week === currentWeek)
      || logs.filter(l => l.values.some(v => v !== '')).pop()
      || logs[logs.length - 1]
      || { week: currentWeek, values: [], tut: '', note: '' };

    const sets = setCols.map((c, i) => ({
      label: txt(headRow[c]) || `${i + 1}. Satz`,
      reps: txt(repsRow[c]),
      weight: plan.values[i] || '',
    }));

    const no = txt(repsRow[0]) || String(blockIdx + 1);

    return {
      key: `${slug(view.name)}-${slug(no)}`,
      no,
      name,
      altName,
      video,
      valueUnit: valueUnit || 'Gewicht',
      tut: plan.tut,
      note: plan.note,
      pause: pause || sheetPause,
      sets,
      history: logs.filter(l => l !== plan && l.values.some(v => v !== '')),
    };
  });

  return { kind: 'strength', note: unitNote, pause: sheetPause, warmup, exercises };
}

/* Nummerierte Blöcke: eine Zeile mit nur einer Zahl eröffnet den Block,
   alle folgenden Zeilen gehören dazu. Wird für das Aufwärmen und für
   Fußgymnastik verwendet. */
function numberedBlocks(rows, from, to) {
  const out = [];
  let current = null;
  for (let r = from; r < to; r++) {
    const row = rows[r] || [];
    const filled = row.map(txt).filter(v => v !== '');
    if (!filled.length) continue;
    if (filled.length === 1 && isNumericOnly(filled[0])) {
      current = { no: filled[0], rows: [], at: r };
      out.push(current);
      continue;
    }
    if (!current) { current = { no: String(out.length + 1), rows: [], at: r }; out.push(current); }
    current.rows.push({ r, cells: row.map(txt) });
  }
  return out;
}

function parseWarmup(view, before) {
  const { rows } = view;
  /* "Vorher immer aufwärmen!!" ist ein Hinweis, kein Aufwärmprogramm. */
  const titleRow = rowIndexOf(rows, row => /^aufwaermen/.test(norm((row || [])[0])), 0);
  if (titleRow < 0 || titleRow >= before) return null;

  /* Der Aufwärmteil endet vor der Pausen-Angabe bzw. der ersten
     Satz-Kopfzeile des Kraftteils. */
  let end = before;
  for (let r = titleRow + 1; r < before; r++) {
    const row = rows[r] || [];
    if (norm(row[0]) === 'pausen' || row.some(c => /\d\.\s*satz/.test(norm(c)))) { end = r; break; }
  }

  /* Die Titelzeile trägt die erste Nummer neben dem Titel. */
  const region = rows.slice(titleRow, end).map((row, i) => (i === 0 ? (row || []).slice(1) : row));

  const items = numberedBlocks(region, 0, region.length).map(b => {
    const first = b.rows[0]?.cells.filter(v => v !== '') || [];
    return {
      no: b.no,
      name: first[0] || '',
      details: first.slice(1),
      lines: b.rows.slice(1).map(x => x.cells.filter(v => v !== '').join(' · ')).filter(Boolean),
    };
  }).filter(i => i.name);
  return { title: cell(rows, titleRow, 0), items };
}

/* ── Fußgymnastik & Co: Zeit/Sätze-Zirkel ─────────────────────────────── */

function parseCircuit(view) {
  const { rows } = view;
  const blocks = numberedBlocks(rows, 1, rows.length);
  const exercises = blocks.map(b => {
    const params = [];
    const lines = [];
    let name = '';
    b.rows.forEach(({ cells }) => {
      const filled = cells.map(txt);
      const labelIdx = filled.findIndex(v => ['zeit', 'saetze', 'satze', 'wiederholungen', 'pause'].includes(norm(v)));
      const head = filled[0];
      if (head) { if (!name) name = head; else lines.push(head); }
      if (labelIdx >= 0) {
        const rest = filled.slice(labelIdx + 1).filter(v => v !== '');
        if (rest.length) params.push({ label: filled[labelIdx], value: rest.join(' ') });
      }
    });
    return { no: b.no, name, params, lines };
  }).filter(e => e.name);

  const durationRow = rowIndexOf(rows, row => rowContains(row, 'Dauer'));
  const duration = durationRow < 0 ? '' : (rows[durationRow] || [])
    .map(txt).filter(v => v !== '' && norm(v) !== 'dauer').pop() || '';

  return { kind: 'circuit', duration, exercises };
}

/* ── Sprungprogramm: klassische Tabelle ───────────────────────────────── */

function parseTable(view) {
  const { rows } = view;
  const headRow = rowIndexOf(rows, row => rowContains(row, 'Übung'));
  if (headRow < 0) return null;
  const columns = (rows[headRow] || []).map(txt);
  const intro = rows.slice(0, headRow).map(r => (r || []).map(txt).filter(Boolean).join(' ')).filter(Boolean);
  const items = [];
  const notes = [];
  for (let r = headRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!rowHasContent(row)) continue;
    const filled = row.map(txt);
    if (filled.filter(v => v !== '').length === 1) { notes.push(filled.find(v => v !== '')); continue; }
    const values = columns.map((_, c) => txt(row[c]));
    const links = columns.map((_, c) => view.urlAt(r, c));
    items.push({ values, links, name: values[0] });
  }
  return { kind: 'table', intro, columns, rows: items, notes };
}

/* ── Ausdauer: Zonen, Dauer, Intervalle ───────────────────────────────── */

/* Verbundene Zellen stehen im Raster mehrfach nebeneinander. */
const dropRepeats = list => list.filter((v, i) => v !== list[i - 1]);

/* Spaltenindizes der belegten Kopfzellen rechts von `from`. */
function headerColumns(cells, from) {
  const cols = [];
  let prev = '';
  for (let c = from + 1; c < cells.length; c++) {
    const v = cells[c];
    if (v && v !== prev) cols.push(c);
    if (v) prev = v;
  }
  return cols;
}

function parseEndurance(view) {
  const { rows } = view;
  const cellsOf = r => (rows[r] || []).map(txt);

  /* Trainingsbereiche */
  const zoneHead = rowIndexOf(rows, row => rowContains(row, 'Trainingsbereiche'));
  let zoneColumns = [];
  const zones = [];
  if (zoneHead >= 0) {
    const head = cellsOf(zoneHead);
    const base = head.findIndex(v => norm(v) === 'trainingsbereiche');
    const cols = headerColumns(head, base);
    zoneColumns = cols.map(c => head[c]);
    const lastCol = cols[cols.length - 1] ?? base;
    for (let r = zoneHead + 1; r < rows.length; r++) {
      const row = cellsOf(r);
      if (!row.some(v => v !== '')) break;
      if (!isNumericOnly(row[0])) break;
      zones.push({
        no: row[0],
        name: row[base] || '',
        values: cols.map(c => row[c] || ''),
        hint: dropRepeats(row.slice(lastCol + 1).filter(Boolean)).join(' '),
      });
    }
  }

  /* Dauer je Sportart */
  const durations = [];
  const durHead = rowIndexOf(rows, row => (row || []).some(c => norm(c) === 'velo'));
  const durRow = durHead < 0 ? -1
    : rowIndexOf(rows, row => (row || []).some(c => /dauer/.test(norm(c))), durHead);
  if (durHead >= 0 && durRow >= 0) {
    const head = cellsOf(durHead);
    const values = cellsOf(durRow);
    headerColumns(head, -1).forEach(c => {
      if (values[c]) durations.push({ mode: head[c], value: values[c] });
    });
  }

  /* Intervallprogramme: aufeinanderfolgende Einzelwerte sind Überschriften. */
  const intervals = [];
  const intervalHead = rowIndexOf(rows, row => (row || []).some(c => /intervall/.test(norm(c))));
  if (intervalHead >= 0) {
    let pending = [];
    let current = null;
    for (let r = intervalHead + 1; r < rows.length; r++) {
      const values = dropRepeats(cellsOf(r).filter(v => v !== ''));
      if (!values.length) continue;
      if (values.length === 1) { current = null; pending.push(values[0]); continue; }
      if (!current) {
        current = { title: pending.join(' · ') || 'Intervall', steps: [] };
        pending = [];
        intervals.push(current);
      }
      current.steps.push({ duration: values[0], zone: values[1] || '', hf: values[2] || '' });
    }
  }

  return { kind: 'endurance', zoneColumns, zones, durations, intervals };
}

/* ── Mobi: Linkliste ──────────────────────────────────────────────────── */

function parseLinkList(view) {
  const { rows } = view;
  const links = [];
  const notes = [];
  /* Zwischenüberschriften gruppieren die Videos. "Link zu den Videos" ist
     eine Bedienungsanleitung und taugt nicht als Gruppenname. */
  let group = txt(view.name);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!rowHasContent(row)) continue;
    let url = '';
    let urlCol = -1;
    for (let c = 0; c < Math.max(row.length, 1); c++) {
      const u = view.urlAt(r, c);
      if (u) { url = u; urlCol = c; break; }
    }
    if (!url) {
      const heading = dropRepeats(row.map(txt).filter(Boolean)).join(' ');
      if (heading) {
        notes.push(heading);
        if (!/^link/i.test(heading)) group = heading;
      }
      continue;
    }
    const rest = dropRepeats(row.map(txt).slice(urlCol + 1).filter(v => v !== '' && v !== url));
    const label = txt(row[urlCol]);
    links.push({
      url,
      group,
      label: isUrl(label) ? '' : label,
      meta: rest.join(' '),
    });
  }
  return { kind: 'links', links, notes: notes.filter(Boolean) };
}

/* ── Neuroathletik & unbekannte Blätter: Abschnitte ───────────────────── */

function parseNotes(view) {
  const { rows } = view;
  const sections = [];
  let current = null;
  for (let r = 0; r < rows.length; r++) {
    const row = (rows[r] || []).map(txt);
    if (!row.some(v => v !== '')) continue;
    const head = row[0];
    const rest = row.slice(1).filter(v => v !== '' && v !== head);
    if (head) {
      current = { title: head, lines: [] };
      sections.push(current);
      if (rest.length) current.lines.push(rest.join(' · '));
      continue;
    }
    if (!current) { current = { title: '', lines: [] }; sections.push(current); }
    if (rest.length) current.lines.push(rest.join(' · '));
  }
  return { kind: 'notes', sections };
}

/* ── Vereinheitlichung ────────────────────────────────────────────────────

   Jede Einheit — Kraft, Zirkel, Sprungtabelle, Ausdauer, Videoliste,
   Notizblatt — bekommt dieselbe items-Liste. Nur so kann die Seite alle
   Übungen gleich darstellen, abhaken und im Fokusmodus durchlaufen.

   mode:
     sets   Sätze mit Wiederholungen und Gewicht (Kraft, Rumpf)
     rounds Serien × Wiederholungen ohne Gewicht (Sprungprogramm)
     timed  Zeit bzw. Sätze je Übung (Fußgymnastik)
     block  Abschnitt eines Ausdauerprogramms
     video  ein Video zum Mitmachen (Mobi)
     note   Erklärung mit Bild (Neuroathletik)
*/

function makeItem(unitId, index, data) {
  const name = txt(data.name) || `Übung ${index + 1}`;
  const itemSlug = slug(name) || `pos-${index + 1}`;
  return {
    key: `${unitId}-${data.no ? slug(data.no) : ''}${data.no ? '-' : ''}${itemSlug}`,
    slug: itemSlug,
    no: txt(data.no),
    name,
    alt: txt(data.alt),
    video: txt(data.video),
    mode: data.mode,
    sets: data.sets || [],
    params: data.params || [],
    lines: (data.lines || []).filter(Boolean),
    pause: txt(data.pause),
    tut: txt(data.tut),
    history: data.history || [],
  };
}

function normalizeItems(unitId, body, images) {
  const make = (index, data) => makeItem(unitId, index, data);

  if (body.kind === 'strength') {
    return body.exercises.map((ex, i) => make(i, {
      no: ex.no,
      name: ex.name,
      alt: ex.altName,
      video: ex.video,
      mode: 'sets',
      sets: ex.sets,
      params: [
        ex.valueUnit && ex.valueUnit !== 'Gewicht' ? { label: 'Einheit', value: ex.valueUnit } : null,
        ex.tut ? { label: 'TUT', value: ex.tut } : null,
      ].filter(Boolean),
      pause: ex.pause,
      tut: ex.tut,
      history: ex.history,
    }));
  }

  if (body.kind === 'table') {
    /* Erste Spalte ist der Name, die letzte oft das Video — alles
       dazwischen wird zu Kennzahlen. */
    return body.rows.map((row, i) => {
      const params = body.columns.slice(1).map((label, c) => ({
        label,
        value: row.values[c + 1] || '',
      })).filter(p => p.value && !row.links[body.columns.indexOf(p.label)]);
      const videoCol = row.links.findIndex(Boolean);
      return make(i, {
        name: row.values[0],
        mode: 'rounds',
        video: videoCol >= 0 ? row.links[videoCol] : '',
        params: params.filter(p => norm(p.label) !== 'video'),
      });
    });
  }

  if (body.kind === 'circuit') {
    return body.exercises.map((ex, i) => make(i, {
      no: ex.no,
      name: ex.name,
      mode: 'timed',
      params: ex.params,
      lines: ex.lines,
    }));
  }

  if (body.kind === 'endurance') {
    return body.intervals.flatMap(interval => interval.steps.map((step, i) => ({
      interval: interval.title, step, i,
    }))).map((entry, i) => make(i, {
      name: entry.step.duration,
      mode: 'block',
      params: [
        entry.step.zone ? { label: 'Intensität', value: entry.step.zone } : null,
        entry.step.hf ? { label: 'Puls', value: entry.step.hf } : null,
      ].filter(Boolean),
      lines: [entry.interval],
    }));
  }

  if (body.kind === 'links') {
    const total = {};
    body.links.forEach(l => { const g = l.group || 'Video'; total[g] = (total[g] || 0) + 1; });
    const counter = {};
    return body.links.map((l, i) => {
      const group = l.group || 'Video';
      counter[group] = (counter[group] || 0) + 1;
      /* Steht nur ein Video unter einer Überschrift, braucht es keine Nummer. */
      const fallback = total[group] > 1 ? `${group} ${counter[group]}` : group;
      return make(i, {
        name: l.label || fallback,
        mode: 'video',
        video: l.url,
        params: l.meta ? [{ label: 'Dauer', value: l.meta.replace(/^Dauer\s*/i, '') }] : [],
      });
    });
  }

  /* Notizblatt: Abschnitte ohne Text und ohne Bild sind Überschriften und
     keine Übungen — sie gruppieren, was danach kommt. */
  const pictures = images?.[unitId] || {};
  const out = [];
  let group = '';
  body.sections.forEach((section, i) => {
    if (!section.title) return;
    const key = slug(section.title);
    const hasPicture = Array.isArray(pictures[key]) && pictures[key].length > 0;
    if (!section.lines.length && !hasPicture) {
      if (/^(wichtig|achtung)/i.test(section.title) && !body.note) body.note = section.title;
      else group = section.title;
      return;
    }
    /* "Für?" ist die Spaltenüberschrift der Erklärung, kein Inhalt. */
    const lines = section.lines.filter(l => !/^f(ue|ü)r\?$/i.test(norm(l)));
    const item = make(i, { name: section.title, mode: 'note', lines });
    item.group = group;
    out.push(item);
  });
  return out;
}

/* ── Blatt-Erkennung ──────────────────────────────────────────────────── */

function classify(view) {
  const n = norm(view.name);
  /* Die Tabellenform wird zuerst geprüft: das Sprungprogramm hat zwar eine
     Spalte "Wiederholungen", ist aber keine Satz/Gewicht-Struktur. */
  if (rowIndexOf(view.rows, row => rowContains(row, 'Übung')) >= 0) return 'table';
  if (view.rows.some(isRepsRow)) return 'strength';
  if (n.includes('ausdauer')) return 'endurance';
  if (n.includes('gymnastik') || n.includes('zirkel')) return 'circuit';
  if (n.includes('mobi') || n.includes('video')) return 'links';
  return 'notes';
}

function parseUnit(sheet, currentWeek, images) {
  const view = sheetView(sheet);
  const kind = classify(view);
  let body = null;
  try {
    if (kind === 'strength') body = parseStrength(view, currentWeek);
    else if (kind === 'endurance') body = parseEndurance(view);
    else if (kind === 'table') body = parseTable(view);
    else if (kind === 'circuit') body = parseCircuit(view);
    else if (kind === 'links') body = parseLinkList(view);
  } catch (err) {
    body = null;
    console.warn('[training-parser] Blatt konnte nicht gelesen werden:', view.name, err);
  }
  if (!body) body = parseNotes(view);

  const id = slug(view.name);
  const items = normalizeItems(id, body, images);
  /* Gleichnamige Abschnitte — "5 Minuten" im Intervall — brauchen trotzdem
     einen eindeutigen Schlüssel, sonst teilen sie sich einen Eintrag im
     Trainingsprotokoll. */
  const used = new Set();
  items.forEach(item => {
    let key = item.key;
    let n = 2;
    while (used.has(key)) key = `${item.key}-${n++}`;
    used.add(key);
    item.key = key;
  });

  return {
    id,
    title: txt(sheet?.name),
    ...body,
    items,
    raw: { rows: view.rows, links: sheet?.links || {} },
  };
}

/* ── Zuordnung Wochenplan → Einheit ───────────────────────────────────── */

const ALIASES = [
  { match: /intervall|joggen|velo|zone|ausdauer|wandern/, id: 'ausdauer' },
  { match: /sprung/, id: 'sprungprogramm' },
  { match: /rumpf/, id: 'rumpf' },
  { match: /mobi/, id: 'mobi' },
  { match: /neuro/, id: 'neuroathletik' },
  { match: /fuss|fuß/, id: 'fussgymnastik' },
];

export function matchUnit(title, unitIds) {
  const s = slug(title);
  if (!s) return '';
  if (unitIds.includes(s)) return s;
  const contained = unitIds.find(id => s.startsWith(`${id}-`) || s.endsWith(`-${id}`) || s === id);
  if (contained) return contained;
  const alias = ALIASES.find(a => a.match.test(norm(title)));
  if (alias && unitIds.includes(alias.id)) return alias.id;
  const loose = unitIds.find(id => s.includes(id) || id.includes(s));
  return loose || '';
}

/* ── Einstieg ─────────────────────────────────────────────────────────── */

/**
 * @param {{file?:string, sheets:Array<{name:string, rows:any[][], links?:Object}>}} grid
 * @param {{images?:Object}} [options] Bilder je Einheit und Übung
 *   ({ fussgymnastik: { 'short-foot': ['…webp'] } }). Sie stecken nicht im
 *   Raster, entscheiden aber mit, ob ein Abschnitt eine Übung oder nur eine
 *   Überschrift ist.
 * @returns {object} Programm
 */
export function parseProgram(grid, options = {}) {
  const sheets = Array.isArray(grid?.sheets) ? grid.sheets : [];
  if (!sheets.length) throw new Error('Die Datei enthält keine Tabellenblätter.');

  const weekSheetIdx = sheets.findIndex(s => norm(s?.name).startsWith('wochenplan'));
  const planIdx = weekSheetIdx >= 0
    ? weekSheetIdx
    : sheets.findIndex(s => (s?.rows || []).some(row => rowContains(row, 'Montag')));
  if (planIdx < 0) throw new Error('Kein Wochenplan-Blatt gefunden.');

  const plan = parseWeekPlan(sheetView(sheets[planIdx]));
  if (!plan) throw new Error('Der Wochenplan konnte nicht gelesen werden.');

  const currentWeek = plan.trainingWeek ? `TW${plan.trainingWeek}` : '';

  const units = {};
  sheets.forEach((sheet, i) => {
    if (i === planIdx) return;
    const unit = parseUnit(sheet, currentWeek, options.images);
    if (!unit.id) return;
    units[unit.id] = unit;
  });

  const unitIds = Object.keys(units);
  plan.days.forEach(day => day.slots.forEach(slotBlock => slotBlock.items.forEach(item => {
    item.unit = matchUnit(item.title, unitIds);
  })));

  const id = [
    plan.kw ? `kw${String(plan.kw).padStart(2, '0')}` : slug(plan.weekLabel) || 'woche',
    plan.dateRange.start ? plan.dateRange.start.slice(0, 4) : '',
  ].filter(Boolean).join('-');

  return {
    schema: SCHEMA_VERSION,
    id,
    source: txt(grid?.file),
    importedAt: new Date().toISOString(),
    athlete: plan.athlete,
    weekLabel: plan.weekLabel,
    kw: plan.kw,
    trainingWeek: plan.trainingWeek,
    currentWeek,
    dateRange: plan.dateRange,
    days: plan.days,
    units,
  };
}
