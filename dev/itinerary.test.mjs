/* Tests for assets/js/itinerary.js — the plan-import parser.
 *
 * The parser is the one piece of this app with real logic in it and no
 * way to eyeball the result, so it gets tests. Run them with:
 *
 *     cd dev && npm install jsdom && node itinerary.test.mjs
 *
 * jsdom only supplies DOMParser outside the browser; nothing else here
 * depends on it.
 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('');
global.DOMParser = dom.window.DOMParser;
global.Node = dom.window.Node;

const { parseItineraryHtml, groupByDay, extractDateFromText, parseTimeBadge } = await import('../assets/js/itinerary.js');
const TODAY = new Date(2026, 6, 26); // 26 Jul 2026

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}` + (ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`));
};

/* ── date parsing ── */
eq('heute',            extractDateFromText('Heute', TODAY), '2026-07-26');
eq('morgen',           extractDateFromText('Morgen früh', TODAY), '2026-07-27');
eq('übermorgen',       extractDateFromText('Übermorgen', TODAY), '2026-07-28');
eq('Montag, 5. Juli',  extractDateFromText('Montag, 5. Juli', TODAY), '2026-07-05');
eq('German dotted',    extractDateFromText('05.08.2026', TODAY), '2026-08-05');
eq('German short',     extractDateFromText('5.8.', TODAY), '2026-08-05');
eq('German long',      extractDateFromText('12. September 2026', TODAY), '2026-09-12');
eq('Maerz fallback',   extractDateFromText('3. Maerz 2027', TODAY), '2027-03-03');
eq('English day-first',extractDateFromText('Sunday, 5 July', TODAY), '2026-07-05');
eq('English mon-first',extractDateFromText('August 14, 2026', TODAY), '2026-08-14');
eq('ISO in text',      extractDateFromText('Stand 2026-12-01', TODAY), '2026-12-01');
eq('rolls to next yr', extractDateFromText('3. Januar', TODAY), '2027-01-03');
eq('recent past stays',extractDateFromText('20. Juli', TODAY), '2026-07-20');
eq('not a date',       extractDateFromText('Wanderung und Picknick', TODAY), '');
eq('distance is not a date', extractDateFromText('Aufstieg 1.5 km', TODAY), '');
eq('section no. is not a date', extractDateFromText('Kapitel 2.3 lesen', TODAY), '');
eq('price is not a date', extractDateFromText('Eintritt 12.50 CHF', TODAY), '');
eq('long prose ignored', extractDateFromText('x'.repeat(250) + ' 5. Juli', TODAY), '');
eq('Tag 2 w/ base',    extractDateFromText('Tag 2', TODAY, new Date(2026,7,10)), '2026-08-11');

/* ── time parsing ── */
eq('time colon', parseTimeBadge('14:00'), '14:00');
eq('time Uhr',   parseTimeBadge('14.30 Uhr'), '14:30');
eq('time range', parseTimeBadge('09:00 – 11:00'), '09:00');
eq('time pm',    parseTimeBadge('2:30 pm'), '14:30');
eq('time bare',  parseTimeBadge('18 Uhr'), '18:00');
eq('no time',    parseTimeBadge('Vormittags'), '');

/* ── the regression: a German multi-day plan ── */
const german = `
<h1>Familienreise Malbun</h1>
<section><h2>Montag, 10. August</h2>
  <div class="stop"><h3>Anreise</h3><p class="card-address">Bahnhof Sargans</p><span class="time-badge">09:15</span></div>
  <div class="stop"><h3>Mittagessen</h3><p>Bergrestaurant</p><span class="time-badge">12:30</span></div>
</section>
<section><h2>Dienstag, 11. August</h2>
  <div class="stop"><h3>Wanderung zum Augstenberg</h3><span class="time-badge">08:00</span></div>
</section>
<section><h2>Mittwoch, 12. August</h2>
  <div class="stop"><h3>Rückreise</h3><span class="time-badge">16:00</span></div>
</section>`;
const g = parseItineraryHtml(german, { today: TODAY });
eq('German plan: 4 stops', g.items.length, 4);
eq('German plan: 3 days',  g.days, 3);
eq('German plan: dates', g.items.map(i => i.date),
   ['2026-08-10','2026-08-10','2026-08-11','2026-08-12']);

/* ── no .stop class at all ── */
const noStop = `
<h2>15.09.2026</h2>
<ul><li>10:00 Museumsbesuch</li><li>13:00 Mittagessen</li></ul>
<h2>16.09.2026</h2>
<ul><li>09:00 Heimreise</li></ul>`;
const n = parseItineraryHtml(noStop, { today: TODAY });
eq('no .stop: 3 entries', n.items.length, 3);
eq('no .stop: 2 days', n.days, 2);

/* ── a stop title containing a month name must not re-date the plan ── */
const trap = `
<h2>1. Juni 2026</h2>
<div class="stop"><h3>Besuch 3. Oktober-Denkmal</h3></div>
<div class="stop"><h3>Abendessen</h3></div>`;
const tr = parseItineraryHtml(trap, { today: TODAY });
eq('trap: both stay on 1 June', tr.items.map(i => i.date), ['2026-06-01','2026-06-01']);

/* ── English plan still parses exactly as before ── */
const english = `
<time datetime="2026-07-05">Sunday</time>
<div class="stop"><h2>Harbour walk</h2><span class="time-badge">9:00 am</span></div>
<time datetime="2026-07-06">Monday</time>
<div class="stop"><h2>Museum</h2><span class="time-badge">2:00 pm</span></div>`;
const e = parseItineraryHtml(english, { today: TODAY });
eq('English: dates', e.items.map(i => i.date), ['2026-07-05','2026-07-06']);
eq('English: times', e.items.map(i => i.time), ['09:00','14:00']);

/* ── undated multi-section plan spread from the trip start ── */
const undated = `
<div><div class="stop"><h3>Ankunft</h3></div></div>
<div><div class="stop"><h3>Ausflug</h3></div></div>
<div><div class="stop"><h3>Abreise</h3></div></div>`;
const u = parseItineraryHtml(undated, { today: TODAY, baseDate: '2026-10-01' });
eq('undated spreads over days', u.items.map(i => i.date),
   ['2026-10-01','2026-10-02','2026-10-03']);

/* ── grouping ── */
const grouped = groupByDay(g.items);
eq('grouped: 3 days', grouped.length, 3);
eq('grouped: heading', grouped[0].heading, 'Montag, 10. August');
eq('grouped: sorted by time', grouped[0].items.map(i => i.time), ['09:15','12:30']);

/* ── empty / junk input ── */
eq('empty html', parseItineraryHtml('').items.length, 0);
eq('junk html', parseItineraryHtml('<p>hallo</p>').items.length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
