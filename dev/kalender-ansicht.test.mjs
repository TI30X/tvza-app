/* Die Ansichten des Kalenders (assets/js/feature/kalender/ansicht.js,
   v.35.49.0) — gezeichnet in jsdom, geklickt wie am Handy.

   Was eintraege.js rechnet, prüft kalender-eintraege.test.mjs. Hier:
   dass das Gerechnete so auf dem Bildschirm steht — ein Lager als EIN
   Balken, zwei Termine um 10 Uhr nebeneinander — und dass ein Tipp beim
   richtigen Eintrag ankommt, auch nachdem neu gezeichnet wurde. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { sammeln, agenda, monatsWochen, zeitRaster } from '../assets/js/feature/kalender/eintraege.js';
import { agendaHtml, monatHtml, tagesListeHtml, zeitHtml, verdrahten, rasterTitel, zeitraumText } from '../assets/js/feature/kalender/ansicht.js';

const KADER = { id: 'g1', name: 'BSV Perspektivkader', art: 'kader' };
const FAMILIE = { id: 'g2', name: 'Familie', art: 'familie' };
const eintraege = sammeln({
  tage: [
    { id: 'z', title: 'Zahnarzt', date: '2026-09-16', startTime: '10:00', endTime: '11:00' },
    { id: 'p', title: 'Physio', date: '2026-09-16', startTime: '10:30', endTime: '11:15' },
  ],
  erinnerungen: [{ id: 'w', title: 'Wachs kaufen', date: '2026-09-14', time: '17:00' }],
  reisen: [{ id: 'r', name: 'Toskana', familyId: 'g2', startDate: '2026-10-08', endDate: '2026-10-14',
    itinerary: [{ id: 'i1', date: '2026-10-08', time: '06:30', title: 'Abfahrt' }] }],
  teams: [{ gruppe: KADER, termine: [
    { id: 'l', art: 'lager', titel: 'Herbstlager', von: '2026-09-18', bis: '2026-09-21' },
    { id: 'k', art: 'training', titel: 'Kondi', von: '2026-09-15', zeit: '18:00', ort: 'Malbun' },
  ] }],
  farbePersoenlich: '#7f77dd',
  farbeVon: gid => (gid === 'g1' ? '#1d9e75' : '#e0b52f'),
  nameVon: gid => (gid === 'g2' ? FAMILIE.name : KADER.name),
});

function dom(html) {
  const { window } = new JSDOM(`<div id="b">${html}</div>`);
  return window.document;
}

test('Titel: kurz genug für ein Handy', () => {
  assert.equal(zeitraumText('2026-09-18', '2026-09-21'), '18.–21. Sept.');
  assert.equal(zeitraumText('2026-09-30', '2026-10-02'), '30. Sept. – 2. Okt.');
  assert.equal(rasterTitel(['2026-09-14', '2026-09-15', '2026-09-16'], '2026-09-14'), '14.–16. Sept.');
  assert.match(rasterTitel(['2027-01-04'], '2026-09-14'), /2027$/, 'ein anderes Jahr steht dabei');
});

test('die Liste: Monate, heute, freie Tage — und ein Lager als eine Karte', () => {
  const d = dom(agendaHtml(agenda(eintraege, { ab: '2026-09-01', heute: '2026-09-14' })));
  assert.deepEqual([...d.querySelectorAll('.kal-monat')].map(h => h.dataset.monat), ['2026-09', '2026-10']);
  const heute = d.querySelector('.kal-tag.is-heute');
  assert.equal(heute.dataset.tagblock, '2026-09-14');
  assert.ok(heute.querySelector('[data-erledigt="erinnerung:w"]'), 'die Erinnerung lässt sich abhaken');
  const lager = [...d.querySelectorAll('[data-eintrag="team:g1:l"]')];
  assert.equal(lager.length, 1, 'das Lager steht einmal');
  assert.ok(lager[0].closest('.kal-eintrag').classList.contains('is-mehrtaegig'));
  assert.match(lager[0].textContent, /4 Tage/);
  // Das Programm steht mit seinem Punkt; ein Tipp öffnet es — abgehakt
  // wird ein Programm nicht (v.35.50.0).
  assert.ok(d.querySelector('.kal-stop[data-programm="reise:r"]'));
  assert.equal(d.querySelector('.kal-stop .kal-haken, [data-stop]'), null);
});

test('die Liste: ein leerer heutiger Tag bietet an, etwas einzutragen — und freie Tage sind gezählt', () => {
  /* Ohne die Erinnerung: eine offene von früher stünde als überfällig bei heute. */
  const ohne = eintraege.filter(e => e.art !== 'erinnerung');
  const d = dom(agendaHtml(agenda(ohne, { ab: '2026-09-01', heute: '2026-09-17' })));
  // Nach dem Kondi am 15. ist bis zum Lager am 18. ein Tag frei, danach bis Oktober nichts.
  assert.equal(d.querySelectorAll('.kal-frei').length, 0, 'ein einzelner freier Tag ist keine Zeile wert');
  const mitLuecke = dom(agendaHtml(agenda(ohne, { ab: '2026-09-01', heute: '2026-09-10' })));
  assert.match(mitLuecke.querySelector('.kal-frei')?.textContent || '', /^4 Tage frei$/, 'vom 10. bis zum 15.');
  const heute = d.querySelector('.kal-tag.is-heute');
  assert.ok(heute.querySelector('.kal-leer [data-neu="2026-09-17"]'));
});

test('der Monat am Laptop: Balken über Tage, und was nicht passt, zählt "+n"', () => {
  const viele = [...eintraege, ...['a', 'b', 'c'].map(id => ({
    id: `tag:${id}`, art: 'tag', von: '2026-09-18', bis: '2026-09-18', zeit: '', bisZeit: '', titel: id,
    farbe: '#777674', typ: '', quelle: '', ort: '', erledigt: false, abgesagt: false, stops: [],
  }))];
  const d = dom(monatHtml(monatsWochen('2026-09-14', viele, { heute: '2026-09-14' }), { spurenMax: 3 }));
  const lager = [...d.querySelectorAll('[data-eintrag="team:g1:l"]')];
  assert.equal(lager.length, 2, 'ein Balken je Woche, die es berührt — nicht einer je Tag');
  assert.match(lager[0].getAttribute('style'), /grid-column:5 \/ span 3/);
  assert.ok(lager[0].classList.contains('is-rechts') && lager[1].classList.contains('is-links'));
  assert.ok(d.querySelector('.kal-mtag.is-heute[data-tag="2026-09-14"]'));
  assert.equal(d.querySelector('[data-mehr="2026-09-18"]')?.textContent, '+1', 'vier am 18., drei passen');
  assert.ok(d.querySelector('[data-eintrag="team:g1:k"]').classList.contains('is-punkt'), 'mit Uhrzeit ein Punkt, kein Balken');
});

test('der Monat am Handy: Punkte je Tag und der gewählte Tag darunter', () => {
  const d = dom(monatHtml(monatsWochen('2026-09-14', eintraege, { heute: '2026-09-14' }), { kompakt: true, gewaehlt: '2026-09-16' })
    + tagesListeHtml('2026-09-16', eintraege));
  assert.ok(d.querySelector('.kal-monatsraster.is-kompakt'));
  assert.equal(d.querySelectorAll('.kal-balken').length, 0);
  assert.equal(d.querySelectorAll('[data-tag="2026-09-16"] .kal-mtag__punkte i').length, 2);
  assert.ok(d.querySelector('[data-tag="2026-09-16"]').classList.contains('is-gewaehlt'));
  assert.deepEqual([...d.querySelectorAll('.kal-eintrag__titel')].map(t => t.textContent), ['Zahnarzt', 'Physio']);
});

test('das Zeitraster: Überschneidungen nebeneinander, die Linie nur heute', () => {
  const tage = ['2026-09-16', '2026-09-17', '2026-09-18'];
  const d = dom(zeitHtml(zeitRaster(tage, eintraege), { heute: '2026-09-17', jetzt: 600 }));
  const block = id => d.querySelector(`.kal-block[data-eintrag="${id}"]`).getAttribute('style');
  assert.match(block('tag:z'), /--start:600;--dauer:60;--spalte:0;--spalten:2/);
  assert.match(block('tag:p'), /--start:630;--dauer:45;--spalte:1;--spalten:2/);
  assert.equal(d.querySelectorAll('.kal-jetzt').length, 1);
  assert.ok(d.querySelector('.kal-spalte.is-heute .kal-jetzt'));
  assert.ok(d.querySelector('.kal-zeit__ganzbalken [data-eintrag="team:g1:l"]'), 'das Lager steht oben als Balken');
  assert.ok(d.querySelector('.kal-zkopf[data-tag="2026-09-16"]'), 'ein Tagkopf öffnet den Tag');
});

test('ein Tipp kommt beim richtigen Eintrag an — auch nach dem Neuzeichnen', () => {
  const { window } = new JSDOM('<div id="b"></div>');
  const el = window.document.getElementById('b');
  let map = new Map(eintraege.map(e => [e.id, e]));
  const log = [];
  verdrahten(el, {
    aktuell: () => map,
    beiEintrag: e => log.push(`auf:${e.id}`),
    beiErledigt: e => log.push(`hak:${e.id}`),
    beiProgramm: e => log.push(`programm:${e.id}`),
    beiTag: tag => log.push(`tag:${tag}`),
    beiNeu: tag => log.push(`neu:${tag}`),
  });
  verdrahten(el, { aktuell: () => map, beiEintrag: () => log.push('doppelt') });
  const zeichne = () => { el.innerHTML = agendaHtml(agenda([...map.values()], { ab: '2026-09-01', heute: '2026-09-14' })); };
  zeichne();
  const klick = sel => el.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  klick('[data-erledigt="erinnerung:w"]');
  klick('[data-eintrag="team:g1:k"]');
  klick('.kal-stop[data-programm="reise:r"]');
  klick('.kal-link[data-programm="reise:r"]');
  // Neu gezeichnet, mit geänderten Daten: der Klick findet den neuen Stand.
  map = new Map([...map].map(([id, e]) => [id, id === 'team:g1:k' ? { ...e, titel: 'Kondi (verschoben)' } : e]));
  zeichne();
  klick('[data-eintrag="team:g1:k"]');
  klick('.kal-tag.is-heute .kal-tag__datum');
  assert.deepEqual(log, [
    'hak:erinnerung:w', 'auf:team:g1:k', 'programm:reise:r', 'programm:reise:r', 'auf:team:g1:k', 'neu:2026-09-14',
  ], 'kein zweiter Zuhörer, und jeder Tipp an seinem Ziel');
});
