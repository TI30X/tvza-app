/* Tests for assets/js/hints.js.
 *
 * The interesting behaviour of a hint is when it stays quiet, so most of
 * these assert null. Run with:
 *
 *     cd dev && node hints.test.mjs
 *
 * No jsdom needed — only a localStorage stub, since the suppression
 * rules are the part worth testing.
 */

const store = new Map();
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};

const {
  hintKalenderWetter, hintWetterSki, hintMaturaTempo, hintGeburtstag,
  pickHint, dismissHint, readHintState,
} = await import('../assets/js/hints.js');

const NOW = new Date(2026, 6, 26, 9, 0);   // So 26 Jul 2026, 09:00
let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}` +
    (ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`));
};
const has = (label, got, needle) => {
  const ok = typeof got?.text === 'string' && got.text.includes(needle);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}` + (ok ? '' : `\n        got  ${JSON.stringify(got)}`));
};

/* ── Kalender × Wetter ── */
const ev = { date: '2026-07-27', time: '14:00', title: 'bei den Grosseltern' };
const wetFc = [{ time: '2026-07-27T13:30', precipitation: 0.8 }];
const dryFc = [{ time: '2026-07-27T13:30', precipitation: 0.0 }];
has('rain before appointment', hintKalenderWetter(ev, wetFc, NOW), 'um 13:30 ist Regen gemeldet');
has('says "Morgen"',           hintKalenderWetter(ev, wetFc, NOW), 'Morgen 14:00');
eq('dry forecast stays quiet', hintKalenderWetter(ev, dryFc, NOW), null);
eq('no event, no hint',        hintKalenderWetter(null, wetFc, NOW), null);
eq('rain long before is not relevant',
   hintKalenderWetter(ev, [{ time: '2026-07-27T09:00', precipitation: 2 }], NOW), null);
eq('event too far out',
   hintKalenderWetter({ date: '2026-08-20', time: '14:00', title: 'x' }, wetFc, NOW), null);
eq('past event ignored',
   hintKalenderWetter({ date: '2026-07-20', time: '14:00', title: 'x' }, wetFc, NOW), null);

/* ── Wetter × Ski ── */
const snow = { date: '2026-07-28', snowCm: 12, place: 'Malbun' };
has('snow + overdue skis', hintWetterSki(snow, 12, NOW), '12 cm Neuschnee');
has('names the place',     hintWetterSki(snow, 12, NOW), 'In Malbun');
eq('skis freshly waxed → quiet',   hintWetterSki(snow, 2, NOW), null);
eq('only a dusting → quiet',       hintWetterSki({ ...snow, snowCm: 2 }, 12, NOW), null);
eq('no snow data → quiet',         hintWetterSki(null, 30, NOW), null);

/* ── Maturaarbeit tempo ── */
const started = NOW.getTime() - 20 * 86400000;   // 20 days of history
const tracker = { doneCount: 10, totalCount: 15, firstDoneAt: started, nextChapter: 'Kapitel 3' };
has('projects ahead of deadline', hintMaturaTempo(tracker, '2026-09-30', NOW), 'vor der Abgabe fertig');
has('names the chapter',          hintMaturaTempo(tracker, '2026-09-30', NOW), 'Kapitel 3');
has('projects past deadline',     hintMaturaTempo(tracker, '2026-07-28', NOW), 'nach der Abgabe fertig');
eq('too little history → quiet',
   hintMaturaTempo({ ...tracker, firstDoneAt: NOW.getTime() - 3 * 86400000 }, '2026-09-30', NOW), null);
eq('barely started → quiet',
   hintMaturaTempo({ ...tracker, doneCount: 1 }, '2026-09-30', NOW), null);
eq('already finished → quiet',
   hintMaturaTempo({ ...tracker, doneCount: 15 }, '2026-09-30', NOW), null);

/* ── Geburtstag ── */
const events = [{ date: '2020-07-30', title: 'Oma hat Geburtstag', recurring: true }];
has('birthday this week', hintGeburtstag(events, NOW), 'Oma hat Geburtstag');
eq('nothing recurring soon',
   hintGeburtstag([{ date: '2020-11-30', title: 'x', recurring: true }], NOW), null);
eq('two at once is a list, not a hint',
   hintGeburtstag([...events, { date: '2020-07-31', title: 'y', recurring: true }], NOW), null);
eq('non-recurring ignored',
   hintGeburtstag([{ date: '2026-07-30', title: 'x', recurring: false }], NOW), null);

/* ── Rules 1 and 4 ── */
const A = { type: 'wetterSki', text: 'a' };
const B = { type: 'geburtstag', text: 'b' };

eq('picks the first candidate', pickHint([A, B], {}, NOW), A);
eq('skips nulls',               pickHint([null, B], {}, NOW), B);
eq('rather nothing than filler', pickHint([null, null], {}, NOW), null);
eq('at most one per day',       pickHint([A, B], {}, NOW, '2026-07-26'), null);
eq('a different day is fine',   pickHint([A, B], {}, NOW, '2026-07-25'), A);

store.clear();
dismissHint('u1', 'wetterSki', 'today', NOW);
eq('X hides it for today', pickHint([A, B], readHintState('u1'), NOW), B);
eq('back tomorrow',
   pickHint([A, B], readHintState('u1'), new Date(2026, 6, 27, 9, 0)), A);

store.clear();
dismissHint('u2', 'wetterSki', 'later', NOW);
eq('"Später" hides it for a week',
   pickHint([A, B], readHintState('u2'), new Date(2026, 6, 30)), B);
eq('back after the week',
   pickHint([A, B], readHintState('u2'), new Date(2026, 7, 3)), A);

store.clear();
dismissHint('u3', 'wetterSki', 'today', NOW);
dismissHint('u3', 'wetterSki', 'today', new Date(2026, 6, 27));
eq('dismissed twice → retired for good',
   pickHint([A], readHintState('u3'), new Date(2027, 0, 1)), null);
eq('retirement is per type, not global',
   pickHint([A, B], readHintState('u3'), new Date(2027, 0, 1)), B);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
