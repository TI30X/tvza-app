/* ══════════════════════════════════════════════════════════════════
   Itinerary parser — one copy, shared by planner.html and
   planner-trips.html.

   Both pages used to carry their own `parseItineraryHtml`, and the two
   had drifted apart: the planner-trips copy only ever looked at
   `<time datetime>` markers and `<h2>` titles, so a plan written any
   other way produced nothing at all. This module is the single copy.

   What goes wrong when an uploaded plan collapses into one day:

   1. The old parser only understood English date words. The app is
      German — "Montag, 5. Juli", "05.07.2026" and "morgen" all failed
      to resolve, every stop kept date:'' and the whole plan piled up
      under a single undated heading. That is the "it doesn't make an
      event for more days" symptom.
   2. Entries were found with a hard-coded `.stop` selector, matching
      exactly one HTML template. Anything else yielded zero entries.
   3. Headings *inside* a stop card were also treated as date markers,
      so a stop titled e.g. "Wanderung zum 3. Juli-Denkmal" silently
      re-dated every stop after it.

   All three are handled below. The parser is deliberately forgiving:
   a plan is written by a person, not by a schema.
   ══════════════════════════════════════════════════════════════════ */

/* ── Dates ─────────────────────────────────────────────────────────*/

const MONTHS_DE = ['januar','februar','märz','april','mai','juni','juli',
                   'august','september','oktober','november','dezember'];
const MONTHS_EN = ['january','february','march','april','may','june','july',
                   'august','september','october','november','december'];
/* Swiss usage also writes "Maerz" and "Marz"; accept both. */
const MONTH_ALIASES = { 'maerz': 2, 'marz': 2, 'sept': 8, 'okt': 9, 'dez': 11 };

export function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

function monthIndex(name) {
  const n = name.toLowerCase().replace(/\.$/, '');
  if (n in MONTH_ALIASES) return MONTH_ALIASES[n];
  const stem = n.slice(0, 3);
  let i = MONTHS_DE.findIndex(m => m.startsWith(stem));
  if (i >= 0) return i;
  i = MONTHS_EN.findIndex(m => m.startsWith(stem));
  return i;
}

const MONTH_PATTERN = [...new Set([...MONTHS_DE, ...MONTHS_EN])]
  .map(m => m.slice(0, 3)).join('|') + '|maerz|marz';

/* A bare day+month with no year is ambiguous. A plan is almost always
   about the near future, so a date that already passed by more than two
   months is read as next year — but a date a few days back stays put,
   because people do upload a plan mid-trip. */
function resolveYear(monthIdx, day, year, todayRef) {
  if (year) return new Date(year, monthIdx, day);
  const today = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate());
  let d = new Date(todayRef.getFullYear(), monthIdx, day);
  if ((today - d) / 86400000 > 60) d = new Date(todayRef.getFullYear() + 1, monthIdx, day);
  return d;
}

/**
 * Pull a date out of a line of text.
 * @param {string} text
 * @param {Date}   todayRef  what "heute" means
 * @param {Date=}  baseDate  start of the trip, so "Tag 2" can resolve
 * @returns {string} ISO date, or '' if the text carries no date
 */
export function extractDateFromText(text, todayRef, baseDate) {
  if (!text) return '';
  const t = String(text).trim();
  if (!t || t.length > 200) return '';   // a paragraph is not a date marker

  // Relative words, German and English. Note: \b does not work in front
  // of "ü" — it is not a word character to the regex engine — so the
  // übermorgen test is anchored on whitespace instead, and has to run
  // before the morgen test that it contains.
  if (/\b(heute|today)\b/i.test(t))                    return isoOf(todayRef);
  if (/(^|\s)(übermorgen|uebermorgen)\b/i.test(t))     return isoOf(addDays(todayRef, 2));
  if (/\b(morgen|tomorrow)\b/i.test(t))                return isoOf(addDays(todayRef, 1));
  if (/\b(gestern|yesterday)\b/i.test(t))              return isoOf(addDays(todayRef, -1));

  // Bare ISO, e.g. "2026-07-26".
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // German numeric style: 5.7.2026 · 05.07.26 · 5.7.
  // Both dots are required, so "1.5 km" and "Kapitel 2.3" are not read
  // as dates. The year is optional — "5.7." is a perfectly normal way
  // to head a day in a plan.
  m = t.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{2,4}))?(?!\d)/);
  if (!m) m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/);
  if (m) {
    const day = +m[1], mon = +m[2] - 1;
    let year = m[3] ? +m[3] : null;
    if (year !== null && year < 100) year += 2000;
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) {
      return isoOf(resolveYear(mon, day, year, todayRef));
    }
  }

  // "5. Juli 2026" · "5 July" · "Montag, 5. Juli"
  const reDayFirst = new RegExp('\\b(\\d{1,2})\\.?\\s+(' + MONTH_PATTERN + ')[a-zä]*\\.?(?:\\s+(\\d{4}))?\\b', 'i');
  // "Juli 5, 2026" · "July 5"
  const reMonthFirst = new RegExp('\\b(' + MONTH_PATTERN + ')[a-zä]*\\.?\\s+(\\d{1,2})(?:\\.|,)?(?:\\s+(\\d{4}))?\\b', 'i');

  let day, monName, year;
  m = t.match(reDayFirst);
  if (m) { day = +m[1]; monName = m[2]; year = m[3] ? +m[3] : null; }
  else {
    m = t.match(reMonthFirst);
    if (m) { monName = m[1]; day = +m[2]; year = m[3] ? +m[3] : null; }
  }
  if (m) {
    const mi = monthIndex(monName);
    if (mi >= 0 && day >= 1 && day <= 31) return isoOf(resolveYear(mi, day, year, todayRef));
  }

  // "Tag 2" / "2. Tag" / "Day 3" — only resolvable against a start date.
  if (baseDate) {
    const ord = t.match(/\b(?:tag|day)\s*(\d{1,2})\b/i) || t.match(/\b(\d{1,2})\s*\.\s*(?:tag|day)\b/i);
    if (ord) {
      const n = +ord[1];
      if (n >= 1 && n <= 60) return isoOf(addDays(baseDate, n - 1));
    }
  }

  return '';
}

/* ── Times ─────────────────────────────────────────────────────────*/

/**
 * "14:00" · "14.30 Uhr" · "9:00 – 11:00" (start wins) · "2:30 pm"
 * @returns {string} "HH:MM", or '' if there is no time
 */
export function parseTimeBadge(text) {
  if (!text) return '';
  const s = String(text);
  const m = s.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
  if (!m) {
    // "14 Uhr" with no minutes.
    const h = s.match(/\b(\d{1,2})\s*Uhr\b/i);
    if (h && +h[1] <= 23) return `${String(+h[1]).padStart(2, '0')}:00`;
    return '';
  }
  let hour = parseInt(m[1], 10);
  const min = m[2];
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  if (hour > 23 || +min > 59) return '';
  return `${String(hour).padStart(2, '0')}:${min}`;
}

/* ── Entries ───────────────────────────────────────────────────────*/

/* Tried in order; the first selector that finds anything wins. `.stop`
   stays first so plans already imported keep parsing exactly as before. */
const ENTRY_SELECTORS = [
  '.stop',
  '[class*="stop" i]',
  '.event, .termin, .activity, .aktivitaet, .programmpunkt',
  '[class*="event" i], [class*="termin" i]',
  '.card, .item',
  'li',
];

function pickEntries(dom) {
  for (const sel of ENTRY_SELECTORS) {
    let els;
    try { els = [...dom.querySelectorAll(sel)]; } catch { continue; }
    // Drop nested matches — keep only the outermost of any family.
    els = els.filter(el => !els.some(other => other !== el && other.contains(el)));
    // An entry needs a title of its own to be worth importing.
    els = els.filter(el => entryTitle(el));
    if (els.length) return { selector: sel, entries: els };
  }
  return { selector: '', entries: [] };
}

function entryTitle(el) {
  const head = el.querySelector('h1, h2, h3, h4, h5, .title, .stop-title, .card-title');
  let title = head?.textContent.trim() || '';
  if (!title && el.tagName === 'LI') {
    // A plain list item: first line is the title.
    title = (el.textContent || '').trim().split('\n')[0].trim();
  }
  title = title.replace(/\s+/g, ' ');
  if (title.length > 120) title = title.slice(0, 117) + '…';
  return title;
}

function entryTime(el) {
  const badge = el.querySelector('.time-badge, .time, .zeit, time');
  const fromBadge = parseTimeBadge(badge?.textContent || '');
  if (fromBadge) return fromBadge;
  // Otherwise look for a time at the start of the entry's own text.
  return parseTimeBadge((el.textContent || '').slice(0, 40));
}

function entryNotes(el, title) {
  const address = el.querySelector('.card-address, .address, .adresse, .ort')
    ?.textContent.trim().replace(/\s+/g, ' ') || '';
  let desc = el.querySelector('p:not(.card-eyebrow):not(.card-address):not(.address)')
    ?.textContent.trim().replace(/\s+/g, ' ') || '';
  if (desc === title) desc = '';
  const notes = [address, desc].filter(Boolean).join(' — ');
  return notes.length > 300 ? notes.slice(0, 297) + '…' : notes;
}

/* Anything that might carry a date, as long as it is not inside an
   entry — a heading within a stop card describes the stop, not a day. */
const MARKER_SELECTOR = 'time[datetime], h1, h2, h3, h4, [class*="date" i], [class*="day" i], [class*="tag" i], caption, th';

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Read a pasted or uploaded plan and return one entry per stop, each
 * carrying the date of the day it belongs to.
 *
 * @param {string} html
 * @param {{ today?: Date, baseDate?: Date|string }} [opts]
 *        baseDate — the trip's start date, so "Tag 2" headings resolve
 *        and a plan with no dates at all can still be spread over days.
 * @returns {{ date: string, items: Array, days: number, selector: string }}
 */
export function parseItineraryHtml(html, opts = {}) {
  const empty = { date: '', items: [], days: 0, selector: '' };
  if (!html) return empty;

  let dom;
  try { dom = new DOMParser().parseFromString(html, 'text/html'); }
  catch { return empty; }

  const today = opts.today instanceof Date ? opts.today : new Date();
  let baseDate = null;
  if (opts.baseDate) {
    const b = opts.baseDate instanceof Date ? opts.baseDate : new Date(opts.baseDate);
    if (!isNaN(b)) baseDate = b;
  }

  const { selector, entries } = pickEntries(dom);
  if (!entries.length) return empty;
  const isEntry = new Set(entries);

  // Date markers, minus anything sitting inside an entry.
  const markers = [...dom.querySelectorAll(MARKER_SELECTOR)]
    .filter(el => !entries.some(e => e === el || e.contains(el)));

  // Walk markers and entries together in document order.
  const walk = [...markers, ...entries].sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  let currentDate = '';
  const items = [];
  for (const el of walk) {
    if (isEntry.has(el)) {
      const title = entryTitle(el);
      if (!title) continue;
      items.push({
        id: randomId(),
        date: currentDate,
        time: entryTime(el),
        title,
        notes: entryNotes(el, title),
        autoImported: true,
      });
      continue;
    }
    if (el.matches('time[datetime]')) {
      const iso = (el.getAttribute('datetime') || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { currentDate = iso; continue; }
    }
    const iso = extractDateFromText(el.textContent, today, baseDate);
    if (iso) currentDate = iso;
  }

  // Nothing resolved a date, but the plan is clearly split into sections?
  // Spread the sections over consecutive days from the trip start, so a
  // multi-day plan still lands on multiple days instead of one heap.
  const dated = items.filter(it => it.date).length;
  if (!dated && baseDate) {
    const groups = groupByContainer(entries);
    if (groups.length > 1) {
      entries.forEach((el, i) => {
        const g = groups.findIndex(grp => grp.includes(el));
        if (g >= 0) items[i].date = isoOf(addDays(baseDate, g));
      });
    } else {
      items.forEach(it => { it.date = isoOf(baseDate); });
    }
  }

  const days = new Set(items.map(it => it.date).filter(Boolean)).size;
  const first = items.map(it => it.date).filter(Boolean).sort()[0] || '';
  return { date: first, items, days, selector };
}

/* Entries that share a parent belong to the same day-section. */
function groupByContainer(entries) {
  const groups = [];
  const seen = new Map();
  for (const el of entries) {
    const key = el.parentElement;
    if (!seen.has(key)) { seen.set(key, groups.length); groups.push([]); }
    groups[seen.get(key)].push(el);
  }
  return groups;
}

/* ── Rendering ─────────────────────────────────────────────────────*/

const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

export function formatDayHeading(iso) {
  if (!iso) return 'Ohne Datum';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date)) return iso;
  return `${WEEKDAYS[date.getDay()]}, ${d}. ${MONTHS_DE[m - 1][0].toUpperCase()}${MONTHS_DE[m - 1].slice(1)}`;
}

/**
 * Group itinerary items by day, sorted, undated last.
 * @returns {Array<{ date: string, heading: string, items: Array }>}
 */
export function groupByDay(items) {
  const byDate = new Map();
  for (const it of items || []) {
    const key = it.date || '';
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(it);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([date, list]) => ({
      date,
      heading: formatDayHeading(date),
      items: list.sort((x, y) => (x.time || '99:99').localeCompare(y.time || '99:99')),
    }));
}
