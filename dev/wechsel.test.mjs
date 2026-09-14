/* Der Wechsel zwischen Firn und TVZA (assets/js/wechsel.js, v.35.40.0).

   Die Verwandlung rechnet zwischen den Ecken zweier Formen. Diese Tests
   halten fest, dass beide Enden GENAU die Symbole sind — der Firn-Berg aus
   firn.svg, das T aus tvza.svg —, dass die Leiste nur an der Grenze
   umschaltet und dass am Handy das Zeichen kurz oben erscheint. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { FORMEN, form, zeichen, wort, softwareVon, softwareZeigen, DAUER, _zuruecksetzen } from '../assets/js/wechsel.js';
import { leseSymbol } from './tvza-symbol-png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = p => readFile(join(root, p), 'utf8');
const nah = (a, b, text) => a.flat().forEach((z, i) => assert.ok(Math.abs(z - b.flat()[i]) < 1e-9, `${text}: ${a} statt ${b}`));

test('bei 0 ist das Zeichen genau der Firn-Berg aus firn.svg', async () => {
  const svg = await lies('assets/icons/firn.svg');
  const berg = svg.match(/<clipPath id="firnBerg">\s*<path d="M(\d+) (\d+) L(\d+) (\d+) L(\d+) (\d+) Z"/).slice(1).map(Number);
  const [sx, sy, rx, ry, lx] = berg;
  assert.equal(ry, berg[5]);
  /* Halbe Breite auf Höhe y — aus dem Dreieck in firn.svg, nicht aus wechsel.js. */
  const hw = y => (rx - sx) * (y - sy) / (ry - sy);
  const rechtecke = [...svg.matchAll(/<rect x="0" y="([\d.]+)" width="64" height="([\d.]+)" fill="(#[0-9A-F]{6})"/g)]
    .map(m => ({ y: Number(m[1]), h: Number(m[2]), farbe: m[3] }));
  assert.equal(rechtecke.length, 3, 'firn.svg: Glut und zwei Bänder');
  const [glut, band1, band2] = rechtecke;
  const unten = Math.min(glut.y + glut.h, ry);
  const trapez = (y1, y2) => [[sx - hw(y1), y1], [sx + hw(y1), y1], [sx + hw(y2), y2], [sx - hw(y2), y2]];

  const f = form(0);
  nah(f.glut, [[sx, sy], [sx, sy], [sx + hw(unten), unten], [sx - hw(unten), unten]], 'Glut');
  nah(f.band1, trapez(band1.y, band1.y + band1.h), 'erstes Band');
  nah(f.band2, trapez(band2.y, Math.min(band2.y + band2.h, ry)), 'zweites Band');
  assert.equal(lx, sx - (rx - sx), 'der Berg steht in der Mitte');
});

test('bei 1 ist das Zeichen genau das T aus tvza.svg', async () => {
  const { rechtecke } = leseSymbol(await lies('assets/icons/tvza.svg'));
  const [balken, stamm] = rechtecke;
  const ecken = r => [[r.x, r.y], [r.x + r.b, r.y], [r.x + r.b, r.y + r.h], [r.x, r.y + r.h]];
  const f = form(1);
  nah(f.glut, ecken(balken), 'Balken');
  /* Die zwei Bänder werden die zwei Hälften des Stamms — lückenlos. */
  assert.equal(f.band1[2][1], f.band2[1][1], 'zwischen den Hälften des Stamms bleibt eine Fuge');
  nah([f.band1[0], f.band1[1], f.band2[2], f.band2[3]], ecken(stamm), 'Stamm');
});

test('jeder Teil hat in beiden Formen vier Ecken', () => {
  for (const s of ['firn', 'tvza']) for (const k of ['glut', 'band1', 'band2']) assert.equal(FORMEN[s][k].length, 4, `${s}.${k}`);
  nah(form(0.5).glut[0], [[(32 + 16) / 2, 17]], 'die Mitte liegt zwischen den Enden');
});

function seite({ handy = false, weniger = false, marke = '' } = {}) {
  const { window } = new JSDOM(`<body${marke ? ` data-marke="${marke}"` : ''}><nav class="nav"><a class="nav__kopf"></a></nav></body>`,
    { pretendToBeVisual: true, url: 'https://firn.test/' });
  window.matchMedia = frage => ({ matches: (/max-width/.test(frage) && handy) || (/reduced-motion/.test(frage) && weniger) });
  const doc = window.document;
  const svg = zeichen(softwareVon(doc), doc);
  svg.classList.add('nav__zeichen');
  doc.querySelector('.nav__kopf').append(svg, wort(doc));
  _zuruecksetzen();
  softwareZeigen(softwareVon(doc), { sanft: false, doc });
  return { doc, svg, nav: doc.querySelector('.nav') };
}
const warte = ms => new Promise(r => setTimeout(r, ms));

test('die Leiste beginnt in der Software der Seite, ohne Bewegung', () => {
  assert.equal(seite().nav.dataset.software, 'firn');
  const tvza = seite({ marke: 'TVZA' });
  assert.equal(tvza.nav.dataset.software, 'tvza');
  assert.equal(tvza.svg.getAttribute('data-t'), '1');
});

test('an der Grenze verwandelt sich das Zeichen, dazwischen passiert nichts', async () => {
  const { doc, svg, nav } = seite();
  assert.equal(softwareZeigen('firn', { doc }), false, 'Firn nach Firn ist kein Wechsel');

  assert.equal(softwareZeigen('tvza', { doc }), true);
  assert.equal(nav.dataset.software, 'tvza', 'das Wortzeichen blendet nach TVZA');
  assert.ok(nav.classList.contains('is-wechsel'), 'das Zeichen der Leiste pulsiert nicht');
  await warte(DAUER / 2);
  const mitte = Number(svg.getAttribute('data-t'));
  assert.ok(mitte > 0 && mitte < 1, `mitten in der Verwandlung steht t=${mitte}`);
  await warte(DAUER);
  assert.equal(svg.getAttribute('data-t'), '1');
  /* Seit v.35.51.0 auch am Laptop gross in der Mitte (Michel: "viel
     deutlicher"), und das Zeichen der Leiste pulsiert. */
  assert.ok(doc.querySelector('.wechsel-hinweis .wechsel-hinweis__karte svg'), 'am Laptop keine Anzeige in der Mitte');

  softwareZeigen('firn', { doc });
  await warte(DAUER * 1.5);
  assert.equal(svg.getAttribute('data-t'), '0', 'zurück wird das T wieder zum Berg');
});

test('wer weniger Bewegung will, bekommt den Endstand sofort', () => {
  const { doc, svg } = seite({ weniger: true });
  softwareZeigen('tvza', { doc });
  assert.equal(svg.getAttribute('data-t'), '1');
});

test('am Handy erscheint das Zeichen gross in der Mitte und geht wieder', async () => {
  const { doc } = seite({ handy: true });
  softwareZeigen('tvza', { doc });
  const box = doc.querySelector('.wechsel-hinweis');
  assert.ok(box, 'keine Anzeige am Handy');
  assert.equal(box.getAttribute('aria-hidden'), 'true');
  assert.equal(box.dataset.software, 'firn', 'die Anzeige beginnt in der alten Software');
  await warte(300);
  assert.equal(box.dataset.software, 'tvza');
  await warte(DAUER + 650 + 500);
  assert.equal(doc.querySelector('.wechsel-hinweis'), null, 'die Anzeige bleibt stehen');
});

/* Die Gruppe lädt als eigene Seite, nicht im Rahmen des Routers. Wer im
   TVZA-Kreis vom Zuhause in die Gruppe geht, wechselt die Software über
   eine Seitengrenze — die neue Seite beginnt, wo die alte aufhörte
   (v.35.48.0). Bis dahin stand sie einfach in Firn da. */
test('über eine Seitengrenze verwandelt sich das Zeichen auf der neuen Seite', async () => {
  const neueSeite = (zuletzt, marke = '', handy = false) => {
    const { window } = new JSDOM(`<body${marke ? ` data-marke="${marke}"` : ''}><nav class="nav"><a class="nav__kopf"></a></nav></body>`,
      { pretendToBeVisual: true, url: 'https://firn.test/pages/gruppe.html' });
    window.matchMedia = frage => ({ matches: /max-width/.test(frage) && handy });
    if (zuletzt) window.sessionStorage.setItem('firn.software', zuletzt);
    const doc = window.document;
    const svg = zeichen(softwareVon(doc), doc);
    doc.querySelector('.nav__kopf').append(svg, wort(doc));
    _zuruecksetzen();
    return { doc, svg, nav: doc.querySelector('.nav'), window };
  };

  const gruppe = neueSeite('tvza');
  softwareZeigen(softwareVon(gruppe.doc), { doc: gruppe.doc });
  assert.equal(gruppe.window.sessionStorage.getItem('firn.software'), 'firn', 'die Seite merkt sich, wo man jetzt ist');
  await warte(DAUER / 2);
  const mitte = Number(gruppe.svg.getAttribute('data-t'));
  assert.ok(mitte > 0 && mitte < 1, `die Gruppe beginnt beim T und wird zum Berg (t=${mitte})`);
  await warte(DAUER);
  assert.equal(gruppe.svg.getAttribute('data-t'), '0');
  assert.equal(gruppe.nav.dataset.software, 'firn');

  // Aus derselben Software, oder als erste Seite der Sitzung: ohne Bewegung.
  for (const zuletzt of ['firn', null]) {
    const ruhig = neueSeite(zuletzt);
    softwareZeigen(softwareVon(ruhig.doc), { doc: ruhig.doc });
    assert.equal(ruhig.svg.getAttribute('data-t'), '0');
    assert.equal(ruhig.doc.querySelector('.wechsel-hinweis'), null, 'ohne Wechsel keine Anzeige');
  }

  // Am Handy erscheint dazu das Zeichen oben.
  const handy = neueSeite('firn', 'TVZA', true);
  softwareZeigen(softwareVon(handy.doc), { doc: handy.doc });
  assert.ok(handy.doc.querySelector('.wechsel-hinweis'), 'am Handy keine Anzeige über die Seitengrenze');

  // Die Leiste baut ohne { sanft: false } — sonst gäbe es den Übergang nie.
  const shell = await lies('assets/js/shell.js');
  assert.match(shell, /\n  softwareZeigen\(software\);\n/);
});

test('das Zeichen der Leiste kann sich bewegen, und das Kit blendet die Wortzeichen', async () => {
  const shell = await lies('assets/js/shell.js');
  assert.doesNotMatch(shell, /<img class="nav__zeichen"/, 'ein <img> kann sich nicht verwandeln');
  const kit = await lies('assets/css/kit.css');
  assert.match(kit, /\.software-wort > \.tvza \{ opacity: 0; \}/);
  assert.match(kit, /\[data-software="tvza"\] \.software-wort > \.firn \{ opacity: 0; \}/);
  assert.match(kit, /@media \(prefers-reduced-motion: reduce\) \{\s*\.wechsel-hinweis, \.wechsel-hinweis\.is-da \{ transform: none; \}/);
  assert.match(kit, /\.nav\.is-wechsel \.nav__zeichen \{ animation: zeichen-puls 900ms/);
  assert.match(kit, /\.wechsel-hinweis \{\s*position: fixed; z-index: 400; inset: 0;/, 'die Anzeige steht nicht mehr gross in der Mitte');
});
